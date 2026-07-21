import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { startReviewForVersion, submitReviewDecision, createRevisionVersion } from "./reviewWorkflow";

const zoneKey = "test-review-workflow-zone";
let zoneId: string;
let employeeIds: string[] = [];
let artifactIds: string[] = [];

async function ensureZone() {
  if (zoneId) return zoneId;
  const zone = await prisma.officeZone.upsert({
    where: { key: zoneKey },
    update: {},
    create: {
      key: zoneKey,
      name: zoneKey,
      kind: "open_workspace",
      rectNormX0: 0,
      rectNormY0: 0,
      rectNormX1: 1,
      rectNormY1: 1,
    },
  });
  zoneId = zone.id;
  return zoneId;
}

async function makeEmployee(rank: number) {
  const zone = await ensureZone();
  const employee = await prisma.employee.create({
    data: { name: "검수 워크플로 테스트 직원", role: "역할", rank, officeZoneId: zone, posX: 0.5, posY: 0.5, avatarId: "avatar-01" },
  });
  employeeIds.push(employee.id);
  return employee;
}

async function upsertPolicy(importance: number, chainMode: string, maxRevisions = 3) {
  await prisma.reviewPolicy.upsert({
    where: { importance },
    update: { chainMode, maxRevisions },
    create: {
      importance,
      chainMode,
      finalReviewerMinRank: 4,
      maxRevisions,
      description: "테스트 정책",
    },
  });
}

async function makeArtifactWithVersion(authorEmployeeId: string, importance: number) {
  const artifact = await prisma.artifact.create({
    data: {
      employeeId: authorEmployeeId,
      title: "검수 워크플로 테스트 결과물",
      fileName: "report.md",
      filePath: "workspace/artifacts/report.md",
      mimeType: "text/markdown",
      size: 10,
      sourceType: "task_output",
      importance,
      currentReviewStatus: "pending",
    },
  });
  artifactIds.push(artifact.id);
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      versionNumber: 1,
      filePath: artifact.filePath,
      fileName: artifact.fileName,
      mimeType: artifact.mimeType,
      size: artifact.size,
      format: "markdown",
      authorEmployeeId,
      reviewStatus: "pending",
    },
  });
  return { artifact, version };
}

afterEach(async () => {
  await prisma.reviewDecision.deleteMany({
    where: { artifactVersion: { artifactId: { in: artifactIds } } },
  });
  await prisma.artifactVersion.deleteMany({ where: { artifactId: { in: artifactIds } } });
  await prisma.artifact.deleteMany({ where: { id: { in: artifactIds } } });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  artifactIds = [];
  employeeIds = [];
});

afterAll(async () => {
  await prisma.officeZone.deleteMany({ where: { key: zoneKey } });
});

describe("startReviewForVersion (test.db only)", () => {
  it("seats a single-stage chain (author_plus_one) and marks reviewing", async () => {
    await upsertPolicy(1, "author_plus_one");
    const author = await makeEmployee(1);
    const reviewer = await makeEmployee(2);
    const { artifact, version } = await makeArtifactWithVersion(author.id, 1);

    const result = await withTransaction((tx) =>
      startReviewForVersion(tx, {
        artifactId: artifact.id,
        artifactVersionId: version.id,
        authorEmployeeId: author.id,
        departmentId: null,
        importance: 1,
      })
    );

    expect(result).toMatchObject({ outcome: "reviewing", reviewerEmployeeId: reviewer.id, requiredRank: 2 });
    const updatedArtifact = await prisma.artifact.findUniqueOrThrow({ where: { id: artifact.id } });
    expect(updatedArtifact.currentReviewStatus).toBe("reviewing");
  });

  it("marks blocked when no candidate at the required rank exists", async () => {
    await upsertPolicy(1, "author_plus_one");
    const author = await makeEmployee(1);
    const { artifact, version } = await makeArtifactWithVersion(author.id, 1);

    const result = await withTransaction((tx) =>
      startReviewForVersion(tx, {
        artifactId: artifact.id,
        artifactVersionId: version.id,
        authorEmployeeId: author.id,
        departmentId: null,
        importance: 1,
      })
    );

    expect(result).toMatchObject({ outcome: "blocked", requiredRank: 2 });
    const updatedArtifact = await prisma.artifact.findUniqueOrThrow({ where: { id: artifact.id } });
    expect(updatedArtifact.currentReviewStatus).toBe("blocked");
  });

  it("finalizes as approved immediately when the author is already rank 4 (empty chain)", async () => {
    await upsertPolicy(1, "author_plus_one");
    const author = await makeEmployee(4);
    const { artifact, version } = await makeArtifactWithVersion(author.id, 1);

    const result = await withTransaction((tx) =>
      startReviewForVersion(tx, {
        artifactId: artifact.id,
        artifactVersionId: version.id,
        authorEmployeeId: author.id,
        departmentId: null,
        importance: 1,
      })
    );

    expect(result).toMatchObject({ outcome: "approved" });
  });
});

describe("submitReviewDecision (test.db only)", () => {
  async function seatChain(importance: number, chainMode: string, authorRank: number) {
    await upsertPolicy(importance, chainMode);
    const author = await makeEmployee(authorRank);
    const { artifact, version } = await makeArtifactWithVersion(author.id, importance);
    const seated = await withTransaction((tx) =>
      startReviewForVersion(tx, {
        artifactId: artifact.id,
        artifactVersionId: version.id,
        authorEmployeeId: author.id,
        departmentId: null,
        importance,
      })
    );
    return { author, artifact, version, seated };
  }

  it("advances to the next stage on approval (multi-stage chain)", async () => {
    const rank3 = await makeEmployee(3);
    const rank4 = await makeEmployee(4);
    const { seated, artifact } = await seatChain(4, "full_chain_rank4", 2);
    expect(seated).toMatchObject({ outcome: "reviewing", requiredRank: 3, reviewerEmployeeId: rank3.id });
    if (seated.outcome !== "reviewing") throw new Error("setup failed");

    const result = await submitReviewDecision(seated.reviewDecisionId, rank3.id, "approved");
    expect(result.ok).toBe(true);
    expect(result.ok && result.result).toMatchObject({ outcome: "reviewing", requiredRank: 4, reviewerEmployeeId: rank4.id });

    const updatedArtifact = await prisma.artifact.findUniqueOrThrow({ where: { id: artifact.id } });
    expect(updatedArtifact.currentReviewStatus).toBe("reviewing");
  });

  it("finalizes approval once the last stage approves", async () => {
    await makeEmployee(2); // stage-0 reviewer for author_plus_one
    const { seated, artifact } = await seatChain(1, "author_plus_one", 1);
    if (seated.outcome !== "reviewing") throw new Error("setup failed");

    const result = await submitReviewDecision(seated.reviewDecisionId, seated.reviewerEmployeeId, "approved");
    expect(result.ok).toBe(true);
    expect(result.ok && result.result).toMatchObject({ outcome: "approved" });

    const updatedArtifact = await prisma.artifact.findUniqueOrThrow({ where: { id: artifact.id } });
    expect(updatedArtifact.currentReviewStatus).toBe("approved");
  });

  it("records revision_requested without advancing the chain", async () => {
    await makeEmployee(2);
    const { seated, artifact, version } = await seatChain(1, "author_plus_one", 1);
    if (seated.outcome !== "reviewing") throw new Error("setup failed");

    const result = await submitReviewDecision(seated.reviewDecisionId, seated.reviewerEmployeeId, "revision_requested", {
      revisionRequest: "표를 추가하세요",
    });
    expect(result.ok).toBe(true);

    const updatedVersion = await prisma.artifactVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(updatedVersion.reviewStatus).toBe("revision_requested");
    const updatedArtifact = await prisma.artifact.findUniqueOrThrow({ where: { id: artifact.id } });
    expect(updatedArtifact.currentReviewStatus).toBe("revision_requested");
  });

  it("records rejected as a terminal state", async () => {
    await makeEmployee(2);
    const { seated, artifact } = await seatChain(1, "author_plus_one", 1);
    if (seated.outcome !== "reviewing") throw new Error("setup failed");

    const result = await submitReviewDecision(seated.reviewDecisionId, seated.reviewerEmployeeId, "rejected", {
      decisionReason: "기준 미달",
    });
    expect(result.ok).toBe(true);
    const updatedArtifact = await prisma.artifact.findUniqueOrThrow({ where: { id: artifact.id } });
    expect(updatedArtifact.currentReviewStatus).toBe("rejected");
  });

  it("rejects a decision from someone other than the assigned reviewer", async () => {
    const legitReviewer = await makeEmployee(2); // created first -> findFirst(createdAt asc) seats this one
    const { seated } = await seatChain(1, "author_plus_one", 1);
    if (seated.outcome !== "reviewing") throw new Error("setup failed");
    expect(seated.reviewerEmployeeId).toBe(legitReviewer.id);

    const impostor = await makeEmployee(2);
    const result = await submitReviewDecision(seated.reviewDecisionId, impostor.id, "approved");
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("rejects a duplicate decision on an already-decided review", async () => {
    await makeEmployee(2);
    const { seated } = await seatChain(1, "author_plus_one", 1);
    if (seated.outcome !== "reviewing") throw new Error("setup failed");

    await submitReviewDecision(seated.reviewDecisionId, seated.reviewerEmployeeId, "approved");
    const second = await submitReviewDecision(seated.reviewDecisionId, seated.reviewerEmployeeId, "approved");
    expect(second).toMatchObject({ ok: false, code: "invalid_state" });
  });
});

describe("createRevisionVersion (test.db only)", () => {
  it("creates a new version, restarts the chain, and increments revisionCount", async () => {
    await upsertPolicy(1, "author_plus_one", 3);
    const author = await makeEmployee(1);
    const reviewer = await makeEmployee(2);
    const { artifact, version } = await makeArtifactWithVersion(author.id, 1);
    await withTransaction((tx) =>
      startReviewForVersion(tx, {
        artifactId: artifact.id,
        artifactVersionId: version.id,
        authorEmployeeId: author.id,
        departmentId: null,
        importance: 1,
      })
    );
    const decision = await prisma.reviewDecision.findFirstOrThrow({ where: { artifactVersionId: version.id } });
    await submitReviewDecision(decision.id, reviewer.id, "revision_requested", { revisionRequest: "고쳐주세요" });

    const result = await createRevisionVersion(artifact.id, {
      filePath: "workspace/artifacts/report-v2.md",
      fileName: "report-v2.md",
      mimeType: "text/markdown",
      size: 20,
      format: "markdown",
      authorEmployeeId: author.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const newVersion = await prisma.artifactVersion.findUniqueOrThrow({ where: { id: result.artifactVersionId } });
    expect(newVersion.versionNumber).toBe(2);
    expect(newVersion.revisionCount).toBe(1);
    expect(newVersion.reviewStatus).toBe("reviewing");

    const updatedArtifact = await prisma.artifact.findUniqueOrThrow({ where: { id: artifact.id } });
    expect(updatedArtifact.fileName).toBe("report-v2.md");
    expect(updatedArtifact.currentReviewStatus).toBe("reviewing");
  });

  it("refuses to create a revision when the artifact isn't in revision_requested state", async () => {
    await upsertPolicy(1, "author_plus_one", 3);
    const author = await makeEmployee(1);
    await makeEmployee(2);
    const { artifact, version } = await makeArtifactWithVersion(author.id, 1);
    await withTransaction((tx) =>
      startReviewForVersion(tx, {
        artifactId: artifact.id,
        artifactVersionId: version.id,
        authorEmployeeId: author.id,
        departmentId: null,
        importance: 1,
      })
    );
    // still "reviewing", never asked for revision
    const result = await createRevisionVersion(artifact.id, {
      filePath: "workspace/artifacts/report-v2.md",
      fileName: "report-v2.md",
      mimeType: "text/markdown",
      size: 20,
      format: "markdown",
      authorEmployeeId: author.id,
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_state" });
  });

  it("logs a revision-limit notice once revisionCount exceeds maxRevisions, without blocking", async () => {
    await upsertPolicy(1, "author_plus_one", 0); // any revision at all already exceeds the limit
    const author = await makeEmployee(1);
    const reviewer = await makeEmployee(2);
    const { artifact, version } = await makeArtifactWithVersion(author.id, 1);
    await withTransaction((tx) =>
      startReviewForVersion(tx, {
        artifactId: artifact.id,
        artifactVersionId: version.id,
        authorEmployeeId: author.id,
        departmentId: null,
        importance: 1,
      })
    );
    const decision = await prisma.reviewDecision.findFirstOrThrow({ where: { artifactVersionId: version.id } });
    await submitReviewDecision(decision.id, reviewer.id, "revision_requested");

    const result = await createRevisionVersion(artifact.id, {
      filePath: "workspace/artifacts/report-v2.md",
      fileName: "report-v2.md",
      mimeType: "text/markdown",
      size: 20,
      format: "markdown",
      authorEmployeeId: author.id,
    });
    expect(result.ok).toBe(true); // never blocked, only notified

    const notice = await prisma.activityLog.findFirst({
      where: { entityType: "artifact", entityId: artifact.id, action: "artifact.revision_limit_notice" },
      orderBy: { timestamp: "desc" },
    });
    expect(notice).not.toBeNull();
  });
});
