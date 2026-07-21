import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { approveApprovalRequest, rejectApprovalRequest } from "./materialize";

const cleanupIds = {
  departments: new Set<string>(),
  employees: new Set<string>(),
  approvals: new Set<string>(),
  zones: new Set<string>(),
};

afterAll(async () => {
  await prisma.seat.updateMany({
    where: { employeeId: { in: [...cleanupIds.employees] } },
    data: { employeeId: null },
  });
  await prisma.employeeSkill.deleteMany({ where: { employeeId: { in: [...cleanupIds.employees] } } });
  await prisma.employee.deleteMany({ where: { id: { in: [...cleanupIds.employees] } } });
  await prisma.department.deleteMany({ where: { id: { in: [...cleanupIds.departments] } } });
  await prisma.approvalRequest.deleteMany({ where: { id: { in: [...cleanupIds.approvals] } } });
  await prisma.seat.deleteMany({ where: { officeZoneId: { in: [...cleanupIds.zones] } } });
  await prisma.officeZone.deleteMany({ where: { id: { in: [...cleanupIds.zones] } } });
});

async function createPendingApproval(
  overrides: Partial<Parameters<typeof prisma.approvalRequest.create>[0]["data"]> = {}
) {
  const req = await prisma.approvalRequest.create({
    data: {
      entityType: "department",
      action: "create",
      payload: { name: "테스트 부서" },
      summary: "테스트 부서 생성 제안",
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    },
  });
  cleanupIds.approvals.add(req.id);
  return req;
}

describe("approveApprovalRequest (test.db only) — department.create", () => {
  it("materializes a department.create proposal against an explicit zone and renames its display label", async () => {
    const zone = await prisma.officeZone.create({
      data: {
        key: `test-zone-${Date.now()}`,
        name: "테스트 업무 공간",
        defaultDisplayName: "미배정 공간 테스트",
        kind: "open_workspace",
        rectNormX0: 0,
        rectNormY0: 0,
        rectNormX1: 1,
        rectNormY1: 1,
      },
    });
    cleanupIds.zones.add(zone.id);

    const req = await createPendingApproval({
      payload: { name: "신규 테스트 부서", officeZoneId: zone.id },
    });
    const result = await approveApprovalRequest(req.id, "user");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    cleanupIds.departments.add(result.entityId!);

    const dept = await prisma.department.findUniqueOrThrow({ where: { id: result.entityId! } });
    expect(dept.name).toBe("신규 테스트 부서");
    expect(dept.officeZoneId).toBe(zone.id);

    const updatedZone = await prisma.officeZone.findUniqueOrThrow({ where: { id: zone.id } });
    expect(updatedZone.displayName).toBe("신규 테스트 부서");

    const updated = await prisma.approvalRequest.findUnique({ where: { id: req.id } });
    expect(updated?.status).toBe("approved");
    const log = await prisma.activityLog.findFirst({ where: { approvalRequestId: req.id } });
    expect(log?.action).toBe("department.create");
  });

  it("auto-assigns *some* free zone and renames it when officeZoneId is omitted", async () => {
    const req = await createPendingApproval({ payload: { name: "자동배정 테스트 부서" } });
    const result = await approveApprovalRequest(req.id, "user");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    cleanupIds.departments.add(result.entityId!);

    const dept = await prisma.department.findUniqueOrThrow({ where: { id: result.entityId! } });
    // test.db always has the 6 seeded zones, so an empty one is always available.
    expect(dept.officeZoneId).not.toBeNull();
    const zone = await prisma.officeZone.findUniqueOrThrow({ where: { id: dept.officeZoneId! } });
    expect(zone.displayName).toBe("자동배정 테스트 부서");
  });

  it("rejects an unregistered entityType/action (department.update no longer exists)", async () => {
    const req = await createPendingApproval({ entityType: "department", action: "update" });
    const result = await approveApprovalRequest(req.id, "user");
    expect(result).toMatchObject({ ok: false, code: "unknown_action" });
  });

  it("rejects an unknown entityType entirely", async () => {
    const req = await createPendingApproval({ entityType: "task", action: "create" });
    const result = await approveApprovalRequest(req.id, "user");
    expect(result).toMatchObject({ ok: false, code: "unknown_action" });
  });

  it("rejects re-approving an already-approved request", async () => {
    const req = await createPendingApproval();
    const first = await approveApprovalRequest(req.id, "user");
    if (first.ok && first.entityId) cleanupIds.departments.add(first.entityId);
    const second = await approveApprovalRequest(req.id, "user");
    expect(second).toMatchObject({ ok: false, code: "not_pending" });
  });

  it("expires a pending request past expiresAt and refuses to approve it", async () => {
    const req = await createPendingApproval({ expiresAt: new Date(Date.now() - 1000) });
    const result = await approveApprovalRequest(req.id, "user");
    expect(result).toMatchObject({ ok: false, code: "expired" });
    const updated = await prisma.approvalRequest.findUnique({ where: { id: req.id } });
    expect(updated?.status).toBe("expired");
  });

  it("respects the idempotencyKey unique constraint", async () => {
    const key = `test-${Date.now()}`;
    await createPendingApproval({ idempotencyKey: key });
    await expect(createPendingApproval({ idempotencyKey: key })).rejects.toThrow();
  });
});

describe("approveApprovalRequest (test.db only) — employee.create", () => {
  it("materializes an employee.create proposal and seats it at a free desk", async () => {
    const zone = await prisma.officeZone.create({
      data: {
        key: `test-zone-emp-${Date.now()}`,
        name: "테스트 업무 공간2",
        defaultDisplayName: "미배정 공간 테스트2",
        kind: "open_workspace",
        rectNormX0: 0,
        rectNormY0: 0,
        rectNormX1: 1,
        rectNormY1: 1,
      },
    });
    cleanupIds.zones.add(zone.id);
    const seat = await prisma.seat.create({
      data: { officeZoneId: zone.id, index: 0, normX: 0.4, normY: 0.6 },
    });

    const req = await createPendingApproval({
      entityType: "employee",
      payload: {
        name: "테스트 직원",
        role: "테스트 역할",
        rank: 2,
        officeZoneId: zone.id,
        posX: 0.5,
        posY: 0.5,
        direction: "down",
        scale: 1,
        avatarId: "avatar-01",
        reason: "테스트를 위한 채용",
      },
      summary: "직원 생성 제안 테스트",
    });

    const result = await approveApprovalRequest(req.id, "user");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    cleanupIds.employees.add(result.entityId!);

    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: result.entityId! } });
    expect(employee.rank).toBe(2);
    expect(employee.posX).toBe(0.4); // seat 좌표로 스냅됨(제안된 0.5가 아님)
    expect(employee.posY).toBe(0.6);

    const updatedSeat = await prisma.seat.findUniqueOrThrow({ where: { id: seat.id } });
    expect(updatedSeat.employeeId).toBe(employee.id);
  });
});

describe("rejectApprovalRequest (test.db only)", () => {
  it("marks a pending request rejected with a reason, creates no entity", async () => {
    const req = await createPendingApproval();
    const before = await prisma.department.count();
    const result = await rejectApprovalRequest(req.id, "필요 없음", "user");
    expect(result.ok).toBe(true);
    const after = await prisma.department.count();
    expect(after).toBe(before);
    const updated = await prisma.approvalRequest.findUnique({ where: { id: req.id } });
    expect(updated?.status).toBe("rejected");
    expect(updated?.rejectionReason).toBe("필요 없음");
  });
});
