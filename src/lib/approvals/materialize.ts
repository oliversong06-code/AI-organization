import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import { getProposalSchema } from "@/lib/approval-registry";
import type { Prisma } from "@/generated/prisma/client";

type TxClient = Prisma.TransactionClient;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;

type ErrorCode =
  | "not_found"
  | "not_pending"
  | "expired"
  | "unknown_action"
  | "invalid_payload"
  | "version_conflict";

export type MaterializeResult =
  | { ok: true; entityId: string | null }
  | { ok: false; error: string; code: ErrorCode };

class MaterializeError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Approves a pending ApprovalRequest. Phase 2: the registry only ever
 * contains department.create and employee.create, so this only ever
 * materializes one of those two — everything else was rejected earlier
 * (unknown_action) by the registry lookup, before this function is
 * reachable. Re-validates the payload against the CURRENT schema (not
 * just whatever was true at proposal time) and materializes inside one
 * transaction + ActivityLog entry.
 */
export async function approveApprovalRequest(
  id: string,
  resolvedBy: string
): Promise<MaterializeResult> {
  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: "요청을 찾을 수 없습니다", code: "not_found" };

  if (request.status === "pending" && request.expiresAt.getTime() < Date.now()) {
    await prisma.approvalRequest.update({ where: { id }, data: { status: "expired" } });
    return { ok: false, error: "만료된 요청입니다", code: "expired" };
  }
  if (request.status !== "pending") {
    return {
      ok: false,
      error: `이미 처리된 요청입니다 (${request.status})`,
      code: "not_pending",
    };
  }

  const schema = getProposalSchema(request.entityType, request.action);
  if (!schema) {
    return {
      ok: false,
      error:
        "승인 화이트리스트에 없는 entityType/action 조합입니다 (department.create와 employee.create만 지원)",
      code: "unknown_action",
    };
  }
  const parsed = schema.safeParse(request.payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: "제안 payload가 현재 스키마와 맞지 않습니다",
      code: "invalid_payload",
    };
  }

  try {
    const entityId = await withTransaction(async (tx) => {
      const newEntityId =
        request.entityType === "department"
          ? await materializeDepartmentCreate(tx, parsed.data)
          : await materializeEmployeeCreate(tx, parsed.data);

      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: "approved", resolvedAt: new Date(), resolvedBy },
      });
      await logActivity(tx, {
        actor: "user",
        action: `${request.entityType}.create`,
        entityType: request.entityType,
        entityId: newEntityId,
        detail: { approvalRequestId: request.id, summary: request.summary },
        approvalRequestId: request.id,
      });
      return newEntityId;
    });
    return { ok: true, entityId };
  } catch (err) {
    if (err instanceof MaterializeError) {
      return { ok: false, error: err.message, code: err.code };
    }
    throw err;
  }
}

export async function rejectApprovalRequest(
  id: string,
  reason: string,
  resolvedBy: string
): Promise<MaterializeResult> {
  const request = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!request) return { ok: false, error: "요청을 찾을 수 없습니다", code: "not_found" };

  if (request.status === "pending" && request.expiresAt.getTime() < Date.now()) {
    await prisma.approvalRequest.update({ where: { id }, data: { status: "expired" } });
    return { ok: false, error: "만료된 요청입니다", code: "expired" };
  }
  if (request.status !== "pending") {
    return {
      ok: false,
      error: `이미 처리된 요청입니다 (${request.status})`,
      code: "not_pending",
    };
  }

  await withTransaction(async (tx) => {
    await tx.approvalRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        rejectionReason: reason,
        resolvedAt: new Date(),
        resolvedBy,
      },
    });
    await logActivity(tx, {
      actor: "user",
      action: `${request.entityType}.reject`,
      entityType: request.entityType,
      detail: { approvalRequestId: request.id, reason },
      approvalRequestId: request.id,
    });
  });

  return { ok: true, entityId: null };
}

/** create-only now — department update/archive are direct MCP tools /
 * user-direct-control (see src/lib/direct/departmentDirect.ts). Auto-
 * assigns an office zone when none was proposed (preferring work zones
 * over shared/amenity ones) and renames that zone's display label to the
 * new department's name, per §2 of the Phase 2 spec. */
async function materializeDepartmentCreate(tx: TxClient, payload: Payload): Promise<string> {
  let officeZoneId: string | undefined = payload.officeZoneId;

  if (!officeZoneId) {
    const preferred = await tx.officeZone.findFirst({
      where: { kind: { in: ["open_workspace", "private_office"] }, departments: { none: { status: { not: "archived" } } } },
      orderBy: { key: "asc" },
    });
    const fallback =
      preferred ??
      (await tx.officeZone.findFirst({
        where: { departments: { none: { status: { not: "archived" } } } },
        orderBy: { key: "asc" },
      }));
    officeZoneId = fallback?.id;
  }

  const created = await tx.department.create({
    data: {
      name: payload.name,
      description: payload.description,
      colorTag: payload.colorTag,
      officeZoneId,
    },
  });

  if (officeZoneId) {
    await tx.officeZone.update({ where: { id: officeZoneId }, data: { displayName: created.name } });
  }

  return created.id;
}

/** create-only now — employee update/move/archive/rank-change are direct
 * MCP tools / user-direct-control. Auto-assigns a free Seat in the target
 * zone when available and snaps posX/posY to it so the character renders
 * aligned to a desk; falls back to the proposed posX/posY if the zone is
 * at capacity. */
async function materializeEmployeeCreate(tx: TxClient, payload: Payload): Promise<string> {
  const {
    skillIds,
    requestedByEmployeeId: _requestedByEmployeeId,
    requestedByRank: _requestedByRank,
    responsibilities: _responsibilities,
    reason: _reason,
    expectedTasks: _expectedTasks,
    dataAccessScope: _dataAccessScope,
    requiredSkillNames: _requiredSkillNames,
    consequencesIfNotHired: _consequencesIfNotHired,
    duplicateCheckNotes: _duplicateCheckNotes,
    ...employeeData
  } = payload;

  const freeSeat = await tx.seat.findFirst({
    where: { officeZoneId: employeeData.officeZoneId, employeeId: null },
    orderBy: { index: "asc" },
  });

  const created = await tx.employee.create({
    data: {
      ...employeeData,
      posX: freeSeat ? freeSeat.normX : employeeData.posX,
      posY: freeSeat ? freeSeat.normY : employeeData.posY,
    },
  });

  if (freeSeat) {
    await tx.seat.update({ where: { id: freeSeat.id }, data: { employeeId: created.id } });
  }

  if (skillIds?.length) {
    await tx.employeeSkill.createMany({
      data: skillIds.map((skillId: string) => ({ employeeId: created.id, skillId })),
    });
  }

  return created.id;
}
