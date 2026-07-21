import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import { getProposalSchema } from "@/lib/approval-registry";
import { canProposeArchive } from "@/lib/taskTransitions";
import type { TaskStatus } from "@/lib/enums";
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
  | "version_conflict"
  | "target_not_found"
  | "invalid_state";

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
 * Approves a pending ApprovalRequest: re-validates the payload against the
 * CURRENT registry schema (not just whatever was true at proposal time),
 * checks for an entityVersion conflict, and materializes the real row
 * inside one transaction + ActivityLog entry. This is the only code path
 * (alongside rejectApprovalRequest) that can turn a proposal into real
 * data — it is deliberately never exposed as an MCP tool.
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
      error: "승인 화이트리스트에 없는 entityType/action 조합입니다",
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
      const newEntityId = await materializeEntity(tx, request, parsed.data);
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: "approved", resolvedAt: new Date(), resolvedBy },
      });
      await logActivity(tx, {
        actor: "user",
        action: `${request.entityType}.${request.action}`,
        entityType: request.entityType,
        entityId: newEntityId ?? request.relatedEntityId ?? undefined,
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
      entityId: request.relatedEntityId ?? undefined,
      detail: { approvalRequestId: request.id, reason },
      approvalRequestId: request.id,
    });
  });

  return { ok: true, entityId: null };
}

function assertVersion(currentVersion: number, expectedVersion: number | null) {
  if (expectedVersion !== null && currentVersion !== expectedVersion) {
    throw new MaterializeError(
      "version_conflict",
      "대상이 제안 이후 변경되었습니다. 다시 제안해야 합니다."
    );
  }
}

async function materializeEntity(
  tx: TxClient,
  request: {
    entityType: string;
    action: string;
    relatedEntityId: string | null;
    entityVersion: number | null;
  },
  payload: Payload
): Promise<string | null> {
  const { entityType, action, relatedEntityId, entityVersion } = request;

  switch (entityType) {
    case "department":
      return materializeDepartment(tx, action, relatedEntityId, entityVersion, payload);
    case "employee":
      return materializeEmployee(tx, action, relatedEntityId, entityVersion, payload);
    case "task":
      return materializeTask(tx, action, relatedEntityId, entityVersion, payload);
    case "automation":
      return materializeAutomation(tx, action, relatedEntityId, entityVersion, payload);
    case "skill":
      return materializeSkill(tx, action, relatedEntityId, entityVersion, payload);
    case "integration":
      return materializeIntegration(tx, action, relatedEntityId, entityVersion, payload);
    default:
      throw new MaterializeError("unknown_action", `unhandled entityType ${entityType}`);
  }
}

async function materializeDepartment(
  tx: TxClient,
  action: string,
  relatedEntityId: string | null,
  entityVersion: number | null,
  payload: Payload
) {
  if (action === "create") {
    const created = await tx.department.create({
      data: {
        name: payload.name,
        description: payload.description,
        colorTag: payload.colorTag,
        officeZoneId: payload.officeZoneId,
      },
    });
    return created.id;
  }

  if (!relatedEntityId) throw new MaterializeError("target_not_found", "relatedEntityId 누락");
  const current = await tx.department.findUnique({ where: { id: relatedEntityId } });
  if (!current) throw new MaterializeError("target_not_found", "부서를 찾을 수 없습니다");
  assertVersion(current.version, entityVersion);

  if (action === "update") {
    await tx.department.update({
      where: { id: current.id },
      data: { ...payload, version: { increment: 1 } },
    });
  } else if (action === "archive") {
    await tx.department.update({
      where: { id: current.id },
      data: { status: "archived", archivedAt: new Date(), version: { increment: 1 } },
    });
  }
  return current.id;
}

async function materializeEmployee(
  tx: TxClient,
  action: string,
  relatedEntityId: string | null,
  entityVersion: number | null,
  payload: Payload
) {
  if (action === "create") {
    const { skillIds, ...data } = payload;
    const created = await tx.employee.create({ data });
    if (skillIds?.length) {
      await tx.employeeSkill.createMany({
        data: skillIds.map((skillId: string) => ({ employeeId: created.id, skillId })),
      });
    }
    return created.id;
  }

  if (!relatedEntityId) throw new MaterializeError("target_not_found", "relatedEntityId 누락");
  const current = await tx.employee.findUnique({ where: { id: relatedEntityId } });
  if (!current) throw new MaterializeError("target_not_found", "직원을 찾을 수 없습니다");
  assertVersion(current.version, entityVersion);

  if (action === "update") {
    const { skillIds, ...data } = payload;
    await tx.employee.update({
      where: { id: current.id },
      data: { ...data, version: { increment: 1 } },
    });
    if (skillIds) {
      await tx.employeeSkill.deleteMany({ where: { employeeId: current.id } });
      if (skillIds.length) {
        await tx.employeeSkill.createMany({
          data: skillIds.map((skillId: string) => ({ employeeId: current.id, skillId })),
        });
      }
    }
  } else if (action === "move") {
    await tx.employee.update({
      where: { id: current.id },
      data: {
        officeZoneId: payload.officeZoneId,
        posX: payload.posX,
        posY: payload.posY,
        direction: payload.direction ?? current.direction,
        version: { increment: 1 },
      },
    });
  } else if (action === "archive") {
    await tx.employee.update({
      where: { id: current.id },
      data: { status: "archived", archivedAt: new Date(), version: { increment: 1 } },
    });
  }
  return current.id;
}

async function materializeTask(
  tx: TxClient,
  action: string,
  relatedEntityId: string | null,
  entityVersion: number | null,
  payload: Payload
) {
  if (action === "create") {
    const created = await tx.task.create({
      data: {
        ...payload,
        status: "queued",
        approvedAt: new Date(),
      },
    });
    return created.id;
  }

  if (!relatedEntityId) throw new MaterializeError("target_not_found", "relatedEntityId 누락");
  const current = await tx.task.findUnique({ where: { id: relatedEntityId } });
  if (!current) throw new MaterializeError("target_not_found", "업무를 찾을 수 없습니다");
  assertVersion(current.version, entityVersion);

  if (action === "update") {
    await tx.task.update({
      where: { id: current.id },
      data: { ...payload, version: { increment: 1 } },
    });
  } else if (action === "assign") {
    await tx.task.update({
      where: { id: current.id },
      data: { assignedEmployeeId: payload.assignedEmployeeId, version: { increment: 1 } },
    });
  } else if (action === "archive") {
    if (!canProposeArchive(current.status as TaskStatus)) {
      throw new MaterializeError(
        "invalid_state",
        `현재 상태(${current.status})에서는 보관할 수 없습니다`
      );
    }
    await tx.task.update({
      where: { id: current.id },
      data: { status: "archived", version: { increment: 1 } },
    });
  }
  return current.id;
}

async function materializeAutomation(
  tx: TxClient,
  action: string,
  relatedEntityId: string | null,
  entityVersion: number | null,
  payload: Payload
) {
  if (action === "create") {
    const created = await tx.automation.create({ data: payload });
    return created.id;
  }

  if (!relatedEntityId) throw new MaterializeError("target_not_found", "relatedEntityId 누락");
  const current = await tx.automation.findUnique({ where: { id: relatedEntityId } });
  if (!current) throw new MaterializeError("target_not_found", "자동화를 찾을 수 없습니다");
  assertVersion(current.version, entityVersion);

  await tx.automation.update({
    where: { id: current.id },
    data: { ...payload, version: { increment: 1 } },
  });
  return current.id;
}

async function materializeSkill(
  tx: TxClient,
  action: string,
  relatedEntityId: string | null,
  entityVersion: number | null,
  payload: Payload
) {
  if (action === "install_request") {
    if (relatedEntityId) {
      const current = await tx.skill.findUnique({ where: { id: relatedEntityId } });
      if (!current) throw new MaterializeError("target_not_found", "스킬을 찾을 수 없습니다");
      assertVersion(current.version, entityVersion);
      const healthStatus = current.connectionType === "none" ? "connected" : "configuration_required";
      await tx.skill.update({
        where: { id: current.id },
        data: { installed: true, enabled: true, healthStatus, version: { increment: 1 } },
      });
      return current.id;
    }
    const healthStatus = payload.connectionType === "none" ? "connected" : "configuration_required";
    const created = await tx.skill.create({
      data: {
        ...payload,
        inputSchema: {},
        outputSchema: {},
        installed: true,
        enabled: true,
        healthStatus,
      },
    });
    return created.id;
  }

  if (!relatedEntityId) throw new MaterializeError("target_not_found", "relatedEntityId 누락");
  const current = await tx.skill.findUnique({ where: { id: relatedEntityId } });
  if (!current) throw new MaterializeError("target_not_found", "스킬을 찾을 수 없습니다");
  assertVersion(current.version, entityVersion);

  if (action === "update") {
    await tx.skill.update({
      where: { id: current.id },
      data: { ...payload, version: { increment: 1 } },
    });
  } else if (action === "disable") {
    await tx.skill.update({
      where: { id: current.id },
      data: { enabled: false, healthStatus: "disabled", version: { increment: 1 } },
    });
  }
  return current.id;
}

async function materializeIntegration(
  tx: TxClient,
  action: string,
  relatedEntityId: string | null,
  entityVersion: number | null,
  payload: Payload
) {
  if (action === "configure") {
    const created = await tx.integration.create({
      data: {
        name: payload.name,
        kind: payload.kind,
        config: payload.config,
        status: "configured",
        accessMode: "read_only",
      },
    });
    return created.id;
  }

  if (!relatedEntityId) throw new MaterializeError("target_not_found", "relatedEntityId 누락");
  const current = await tx.integration.findUnique({ where: { id: relatedEntityId } });
  if (!current) throw new MaterializeError("target_not_found", "연동을 찾을 수 없습니다");
  assertVersion(current.version, entityVersion);

  if (action === "update") {
    await tx.integration.update({
      where: { id: current.id },
      data: { ...payload, version: { increment: 1 } },
    });
  } else if (action === "disable") {
    await tx.integration.update({
      where: { id: current.id },
      data: { status: "not_configured", version: { increment: 1 } },
    });
  }
  return current.id;
}
