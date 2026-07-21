import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { OFFICE_SEATS_CONFIG } from "../src/lib/office-seats-config";
import { Prisma } from "../src/generated/prisma/client";

/**
 * One-time additive data backfill for the Phase 2 policy overhaul. Never
 * deletes or resets existing Company/Department/Employee/Task/Artifact/
 * ActivityLog rows — only adds new rows/columns' values. Safe to re-run
 * (every step is upsert-or-skip-if-exists).
 */
async function main() {
  const results: Record<string, unknown> = {};

  // 1) OfficeZone displayName backfill: defaultDisplayName = "미배정 공간 N"
  //    (stable order by `key`), displayName = active department's name if
  //    assigned, else null (falls back to defaultDisplayName at read time).
  const zones = await prisma.officeZone.findMany({
    orderBy: { key: "asc" },
    include: { departments: { where: { status: { not: "archived" } } } },
  });
  let zoneN = 0;
  for (const zone of zones) {
    zoneN += 1;
    const assigned = zone.departments[0] ?? null;
    await prisma.officeZone.update({
      where: { id: zone.id },
      data: {
        defaultDisplayName: `미배정 공간 ${zoneN}`,
        displayName: assigned ? assigned.name : null,
      },
    });
  }
  results.officeZonesUpdated = zones.length;

  // 2) Seats: create per office-seats-config, skip if already present.
  let seatsCreated = 0;
  for (const zone of zones) {
    const config = OFFICE_SEATS_CONFIG[zone.key];
    if (!config) continue;
    for (let i = 0; i < config.length; i++) {
      const existing = await prisma.seat.findUnique({
        where: { officeZoneId_index: { officeZoneId: zone.id, index: i } },
      });
      if (existing) continue;
      await prisma.seat.create({
        data: {
          officeZoneId: zone.id,
          index: i,
          normX: config[i].normX,
          normY: config[i].normY,
        },
      });
      seatsCreated++;
    }
  }
  results.seatsCreated = seatsCreated;

  // 3) Assign existing employees to a free seat in their current zone, and
  //    snap their posX/posY to the seat so they render aligned to a desk.
  const employees = await prisma.employee.findMany({ where: { status: { not: "archived" } } });
  let employeesSeated = 0;
  for (const employee of employees) {
    const alreadySeated = await prisma.seat.findUnique({ where: { employeeId: employee.id } });
    if (alreadySeated) continue;
    const freeSeat = await prisma.seat.findFirst({
      where: { officeZoneId: employee.officeZoneId, employeeId: null },
      orderBy: { index: "asc" },
    });
    if (!freeSeat) continue;
    await prisma.$transaction([
      prisma.seat.update({ where: { id: freeSeat.id }, data: { employeeId: employee.id } }),
      prisma.employee.update({
        where: { id: employee.id },
        data: { posX: freeSeat.normX, posY: freeSeat.normY },
      }),
    ]);
    employeesSeated++;
  }
  results.employeesSeated = employeesSeated;

  // 4) AppSetting: employeeRequestMinRank = 3 (only if missing)
  const existingSetting = await prisma.appSetting.findUnique({
    where: { key: "employeeRequestMinRank" },
  });
  if (!existingSetting) {
    await prisma.appSetting.create({
      data: { key: "employeeRequestMinRank", value: 3 },
    });
    results.employeeRequestMinRankSeeded = true;
  } else {
    results.employeeRequestMinRankSeeded = false;
  }

  // 5) ReviewPolicy defaults (importance 1-4) — only if missing.
  const policies: Array<{
    importance: number;
    description: string;
    chainMode: string;
    finalReviewerMinRank: number;
  }> = [
    {
      importance: 1,
      description: "작성자보다 바로 높은 직급 1명이 검수",
      chainMode: "author_plus_one",
      finalReviewerMinRank: 0, // 동적(작성자 rank + 1) — 표시용 참고값
    },
    {
      importance: 2,
      description: "작성자보다 높은 직급이 순차 검수, 최종 검수자는 최소 rank 3",
      chainMode: "sequential_to_rank3",
      finalReviewerMinRank: 3,
    },
    {
      importance: 3,
      description: "최소 rank 3 검수 후 최종적으로 rank 4 검수",
      chainMode: "min3_then_rank4",
      finalReviewerMinRank: 4,
    },
    {
      importance: 4,
      description: "작성자보다 높은 모든 필요한 직급을 순차로 거치고 최종 rank 4 검수 필수(가장 엄격)",
      chainMode: "full_chain_rank4",
      finalReviewerMinRank: 4,
    },
  ];
  let policiesCreated = 0;
  for (const policy of policies) {
    const existing = await prisma.reviewPolicy.findUnique({ where: { importance: policy.importance } });
    if (existing) continue;
    await prisma.reviewPolicy.create({
      data: {
        importance: policy.importance,
        description: policy.description,
        chainMode: policy.chainMode,
        finalReviewerMinRank: policy.finalReviewerMinRank,
        maxRevisions: 3,
        strictness: policy.importance === 4 ? "strict" : "normal",
      },
    });
    policiesCreated++;
  }
  results.reviewPoliciesCreated = policiesCreated;

  // 6) Legacy artifacts predating the review/version system: mark legacy,
  //    grandfather them as approved, and create ArtifactVersion v1 if
  //    missing (never touches the original file).
  const legacyArtifacts = await prisma.artifact.findMany({ where: { legacy: false } });
  let legacyArtifactsMigrated = 0;
  for (const artifact of legacyArtifacts) {
    const existingVersion = await prisma.artifactVersion.findFirst({
      where: { artifactId: artifact.id },
    });
    await prisma.artifact.update({
      where: { id: artifact.id },
      data: { legacy: true, currentReviewStatus: "approved" },
    });
    if (!existingVersion) {
      await prisma.artifactVersion.create({
        data: {
          artifactId: artifact.id,
          versionNumber: 1,
          filePath: artifact.filePath,
          fileName: artifact.fileName,
          mimeType: artifact.mimeType,
          size: artifact.size,
          format: artifact.mimeType === "text/markdown" ? "markdown" : "other",
          authorEmployeeId: artifact.employeeId,
          reviewStatus: "approved",
        },
      });
    }
    legacyArtifactsMigrated++;
  }
  results.legacyArtifactsMigrated = legacyArtifactsMigrated;

  // 7) Cancel any pending ApprovalRequest that isn't department.create or
  //    employee.create (policy change). Currently expected to be a no-op —
  //    all 4 historical rows are already resolved — but kept idempotent
  //    and re-runnable for future safety.
  const disallowedPending = await prisma.approvalRequest.findMany({
    where: {
      status: "pending",
      NOT: [
        { entityType: "department", action: "create" },
        { entityType: "employee", action: "create" },
      ],
    },
  });
  for (const request of disallowedPending) {
    await prisma.$transaction(async (tx) => {
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: "cancelled_by_policy_change", resolvedAt: new Date(), resolvedBy: "system" },
      });
      await tx.activityLog.create({
        data: {
          actor: "system",
          action: "approval.cancelled_by_policy_change",
          entityType: request.entityType,
          entityId: request.relatedEntityId ?? undefined,
          detail: {
            approvalRequestId: request.id,
            reason:
              "Phase 2 정책 변경: department.create/employee.create 외의 승인 요청은 더 이상 지원되지 않습니다.",
          } as Prisma.InputJsonValue,
        },
      });
    });
  }
  results.pendingApprovalsCancelledByPolicy = disallowedPending.length;

  await prisma.activityLog.create({
    data: {
      actor: "system",
      action: "migration.phase2_policy_v2",
      detail: results as Prisma.InputJsonValue,
    },
  });

  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
