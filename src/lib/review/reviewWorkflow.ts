import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import { computeRequiredReviewRanks, findReviewerCandidate } from "./reviewChain";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityActor, ReviewChainMode } from "@/lib/enums";

type TxClient = Prisma.TransactionClient;

export type SeatStageResult =
  | { outcome: "reviewing"; reviewDecisionId: string; reviewerEmployeeId: string; requiredRank: number }
  | { outcome: "approved" }
  | { outcome: "blocked"; requiredRank: number };

interface ChainContext {
  artifactId: string;
  artifactVersionId: string;
  authorEmployeeId: string | null;
  departmentId: string | null;
}

/** Seats (or finalizes) one stage of a review chain. `chain[stageIndex]`
 * being undefined means every required stage already approved, so the
 * version — and the artifact's mirrored status — become "approved". */
async function seatStage(
  tx: TxClient,
  ctx: ChainContext & { chain: number[]; stageIndex: number }
): Promise<SeatStageResult> {
  const requiredRank = ctx.chain[ctx.stageIndex];

  if (requiredRank === undefined) {
    await tx.artifactVersion.update({
      where: { id: ctx.artifactVersionId },
      data: { reviewStatus: "approved" },
    });
    await tx.artifact.update({
      where: { id: ctx.artifactId },
      data: { currentReviewStatus: "approved" },
    });
    await logActivity(tx, {
      actor: "system",
      action: "artifact.review_approved",
      entityType: "artifact",
      entityId: ctx.artifactId,
      detail: { artifactVersionId: ctx.artifactVersionId },
    });
    return { outcome: "approved" };
  }

  const candidate = ctx.authorEmployeeId
    ? await findReviewerCandidate(tx, {
        requiredRank,
        excludeEmployeeId: ctx.authorEmployeeId,
        preferDepartmentId: ctx.departmentId,
      })
    : await tx.employee.findFirst({
        where: { rank: requiredRank, status: { not: "archived" } },
        orderBy: { createdAt: "asc" },
      });

  if (!candidate) {
    await tx.artifactVersion.update({
      where: { id: ctx.artifactVersionId },
      data: { reviewStatus: "blocked" },
    });
    await tx.artifact.update({
      where: { id: ctx.artifactId },
      data: { currentReviewStatus: "blocked" },
    });
    await logActivity(tx, {
      actor: "system",
      action: "artifact.review_blocked",
      entityType: "artifact",
      entityId: ctx.artifactId,
      detail: { artifactVersionId: ctx.artifactVersionId, requiredRank },
    });
    return { outcome: "blocked", requiredRank };
  }

  const decision = await tx.reviewDecision.create({
    data: {
      artifactVersionId: ctx.artifactVersionId,
      reviewerEmployeeId: candidate.id,
      reviewerRank: candidate.rank,
      sequenceIndex: ctx.stageIndex,
      status: "pending",
    },
  });
  await tx.artifactVersion.update({
    where: { id: ctx.artifactVersionId },
    data: { reviewStatus: "reviewing" },
  });
  await tx.artifact.update({
    where: { id: ctx.artifactId },
    data: { currentReviewStatus: "reviewing" },
  });
  await logActivity(tx, {
    actor: "system",
    action: "artifact.review_stage_started",
    entityType: "artifact",
    entityId: ctx.artifactId,
    detail: {
      artifactVersionId: ctx.artifactVersionId,
      requiredRank,
      reviewerEmployeeId: candidate.id,
      sequenceIndex: ctx.stageIndex,
    },
  });

  return { outcome: "reviewing", reviewDecisionId: decision.id, reviewerEmployeeId: candidate.id, requiredRank };
}

/**
 * Starts (or restarts, after a revision) the review chain for one
 * ArtifactVersion — resolves the ReviewPolicy for `importance`, computes
 * the required-rank sequence for the author's current rank, and seats
 * stage 0. Must run inside the caller's own transaction so it's atomic
 * with whatever created the version.
 */
export async function startReviewForVersion(
  tx: TxClient,
  input: ChainContext & { importance: number }
): Promise<SeatStageResult> {
  const policy = await tx.reviewPolicy.findUnique({ where: { importance: input.importance } });
  // Missing policy shouldn't happen (P2-1 seeds all four levels) — fall
  // back to the strictest mode rather than silently skipping review.
  const chainMode = (policy?.chainMode as ReviewChainMode | undefined) ?? "full_chain_rank4";

  const authorRank = input.authorEmployeeId
    ? ((await tx.employee.findUnique({ where: { id: input.authorEmployeeId } }))?.rank ?? 1)
    : 1;

  const chain = computeRequiredReviewRanks(chainMode, authorRank);
  return seatStage(tx, { ...input, chain, stageIndex: 0 });
}

export type ReviewDecisionOutcome = "approved" | "revision_requested" | "rejected";

export type SubmitReviewResult =
  | { ok: true; result: SeatStageResult | { outcome: "recorded" } }
  | { ok: false; error: string; code: "not_found" | "invalid_state" | "forbidden" };

/**
 * Records a reviewer's decision on a pending ReviewDecision. Enforces that
 * the caller IS the employee actually seated for this stage (never trust
 * a client-supplied identity blindly) and that nobody reviews their own
 * work, even though seatStage already excludes the author when picking a
 * candidate — this is the belt-and-suspenders check at decision time.
 * "approved" advances to the next required stage (or finalizes approval);
 * "revision_requested"/"rejected" just record the outcome — producing the
 * next version is a separate explicit step (see createRevisionVersion).
 */
export async function submitReviewDecision(
  reviewDecisionId: string,
  reviewerEmployeeId: string,
  outcome: ReviewDecisionOutcome,
  notes?: { issuesFound?: string; revisionRequest?: string; decisionReason?: string }
): Promise<SubmitReviewResult> {
  const decision = await prisma.reviewDecision.findUnique({
    where: { id: reviewDecisionId },
    include: { artifactVersion: { include: { artifact: true } } },
  });
  if (!decision) return { ok: false, error: "검수 항목을 찾을 수 없습니다", code: "not_found" };
  if (decision.status !== "pending") {
    return { ok: false, error: `이미 처리된 검수입니다 (${decision.status})`, code: "invalid_state" };
  }
  if (decision.reviewerEmployeeId !== reviewerEmployeeId) {
    return { ok: false, error: "이 검수 단계에 배정된 검수자가 아닙니다", code: "forbidden" };
  }
  if (decision.artifactVersion.authorEmployeeId === reviewerEmployeeId) {
    return { ok: false, error: "본인이 작성한 결과물은 스스로 검수할 수 없습니다", code: "forbidden" };
  }

  const version = decision.artifactVersion;
  const artifact = version.artifact;

  let seatResult: SeatStageResult | { outcome: "recorded" } = { outcome: "recorded" };

  await withTransaction(async (tx) => {
    await tx.reviewDecision.update({
      where: { id: reviewDecisionId },
      data: {
        status: outcome,
        issuesFound: notes?.issuesFound,
        revisionRequest: notes?.revisionRequest,
        decisionReason: notes?.decisionReason,
        decidedAt: new Date(),
      },
    });
    await logActivity(tx, {
      actor: "claude_code",
      action: "artifact.review_decision",
      entityType: "artifact",
      entityId: artifact.id,
      detail: { reviewDecisionId, reviewerEmployeeId, outcome, sequenceIndex: decision.sequenceIndex },
    });

    if (outcome === "approved") {
      const policy = await tx.reviewPolicy.findUnique({ where: { importance: artifact.importance } });
      const chainMode = (policy?.chainMode as ReviewChainMode | undefined) ?? "full_chain_rank4";
      const authorRank = version.authorEmployeeId
        ? ((await tx.employee.findUnique({ where: { id: version.authorEmployeeId } }))?.rank ?? 1)
        : 1;
      const chain = computeRequiredReviewRanks(chainMode, authorRank);

      seatResult = await seatStage(tx, {
        artifactId: artifact.id,
        artifactVersionId: version.id,
        authorEmployeeId: version.authorEmployeeId,
        departmentId: artifact.departmentId,
        chain,
        stageIndex: decision.sequenceIndex + 1,
      });
    } else if (outcome === "revision_requested") {
      await tx.artifactVersion.update({ where: { id: version.id }, data: { reviewStatus: "revision_requested" } });
      await tx.artifact.update({ where: { id: artifact.id }, data: { currentReviewStatus: "revision_requested" } });
    } else {
      await tx.artifactVersion.update({ where: { id: version.id }, data: { reviewStatus: "rejected" } });
      await tx.artifact.update({ where: { id: artifact.id }, data: { currentReviewStatus: "rejected" } });
    }
  });

  return { ok: true, result: seatResult };
}

export type ReviseResult =
  | { ok: true; artifactVersionId: string }
  | { ok: false; error: string; code: "not_found" | "invalid_state" };

interface ReviseInput {
  filePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  format: string;
  authorEmployeeId?: string;
}

/**
 * Produces the next ArtifactVersion after a revision_requested decision
 * and restarts the review chain from stage 0 (a materially reworked draft
 * gets fresh eyes rather than resuming mid-chain). Once the new version's
 * revisionCount exceeds the policy's maxRevisions, this still proceeds —
 * per the plan, the user only ever gets a notification at that point, not
 * a blocked workflow — logged as a distinct ActivityLog entry so it's
 * visible on the activity screen without gating anything.
 */
export async function createRevisionVersion(
  artifactId: string,
  data: ReviseInput,
  actor: ActivityActor = "claude_code"
): Promise<ReviseResult> {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!artifact) return { ok: false, error: "결과물을 찾을 수 없습니다", code: "not_found" };
  if (artifact.currentReviewStatus !== "revision_requested") {
    return {
      ok: false,
      error: `수정 요청 상태가 아닌 결과물은 새 버전을 만들 수 없습니다 (${artifact.currentReviewStatus})`,
      code: "invalid_state",
    };
  }

  const latest = await prisma.artifactVersion.findFirst({
    where: { artifactId },
    orderBy: { versionNumber: "desc" },
  });
  const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;
  const nextRevisionCount = (latest?.revisionCount ?? 0) + 1;

  const newVersionId = await withTransaction(async (tx) => {
    const policy = await tx.reviewPolicy.findUnique({ where: { importance: artifact.importance } });

    const version = await tx.artifactVersion.create({
      data: {
        artifactId,
        versionNumber: nextVersionNumber,
        filePath: data.filePath,
        fileName: data.fileName,
        mimeType: data.mimeType,
        size: data.size,
        format: data.format,
        authorEmployeeId: data.authorEmployeeId,
        reviewStatus: "pending",
        revisionCount: nextRevisionCount,
      },
    });

    await tx.artifact.update({
      where: { id: artifactId },
      data: {
        filePath: data.filePath,
        fileName: data.fileName,
        mimeType: data.mimeType,
        size: data.size,
      },
    });

    await logActivity(tx, {
      actor,
      action: "artifact.revise",
      entityType: "artifact",
      entityId: artifactId,
      detail: { versionNumber: nextVersionNumber, revisionCount: nextRevisionCount },
    });

    if (policy && nextRevisionCount > policy.maxRevisions) {
      await logActivity(tx, {
        actor: "system",
        action: "artifact.revision_limit_notice",
        entityType: "artifact",
        entityId: artifactId,
        detail: { revisionCount: nextRevisionCount, maxRevisions: policy.maxRevisions },
      });
    }

    await startReviewForVersion(tx, {
      artifactId,
      artifactVersionId: version.id,
      authorEmployeeId: data.authorEmployeeId ?? null,
      departmentId: artifact.departmentId,
      importance: artifact.importance,
    });

    return version.id;
  });

  return { ok: true, artifactVersionId: newVersionId };
}
