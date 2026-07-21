import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { approveApprovalRequest, rejectApprovalRequest } from "./materialize";

const cleanupIds = { departments: new Set<string>(), approvals: new Set<string>() };

afterAll(async () => {
  await prisma.department.deleteMany({ where: { id: { in: [...cleanupIds.departments] } } });
  await prisma.approvalRequest.deleteMany({ where: { id: { in: [...cleanupIds.approvals] } } });
});

async function createPendingApproval(overrides: Partial<Parameters<typeof prisma.approvalRequest.create>[0]["data"]> = {}) {
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

describe("approveApprovalRequest (test.db only)", () => {
  it("materializes a department.create proposal and marks the request approved", async () => {
    const req = await createPendingApproval();
    const result = await approveApprovalRequest(req.id, "user");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    cleanupIds.departments.add(result.entityId!);

    const dept = await prisma.department.findUnique({ where: { id: result.entityId! } });
    expect(dept?.name).toBe("테스트 부서");

    const updated = await prisma.approvalRequest.findUnique({ where: { id: req.id } });
    expect(updated?.status).toBe("approved");

    const log = await prisma.activityLog.findFirst({ where: { approvalRequestId: req.id } });
    expect(log?.action).toBe("department.create");
  });

  it("rejects an unknown entityType/action combination", async () => {
    const req = await createPendingApproval({ entityType: "department", action: "delete_forever" });
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

  it("detects an entityVersion conflict on update", async () => {
    const dept = await prisma.department.create({ data: { name: "버전충돌부서" } });
    cleanupIds.departments.add(dept.id);

    const req = await createPendingApproval({
      action: "update",
      relatedEntityId: dept.id,
      entityVersion: dept.version + 1, // stale on purpose
      payload: { name: "변경된 이름" },
    });
    const result = await approveApprovalRequest(req.id, "user");
    expect(result).toMatchObject({ ok: false, code: "version_conflict" });
  });

  it("respects the idempotencyKey unique constraint", async () => {
    const key = `test-${Date.now()}`;
    await createPendingApproval({ idempotencyKey: key });
    await expect(createPendingApproval({ idempotencyKey: key })).rejects.toThrow();
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
