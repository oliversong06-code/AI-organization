import { prisma } from "@/lib/prisma";
import { getProposalSchema } from "@/lib/approval-registry";
import type { ApprovalRiskLevel } from "@/lib/enums";
import { Prisma } from "@/generated/prisma/client";

export interface ProposeInput {
  entityType: string;
  action: string;
  payload: unknown;
  summary: string;
  riskLevel?: ApprovalRiskLevel;
  idempotencyKey?: string;
  requestedBy?: string;
}

export type ProposeResult =
  | { ok: true; approvalRequestId: string; deduped: boolean }
  | {
      ok: false;
      error: string;
      code: "unknown_action" | "invalid_payload" | "rank_too_low";
    };

async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  const value = setting?.value;
  return typeof value === "number" && value > 0 ? value : fallback;
}

/**
 * §3 정책: rank 1·2 직원은 스스로 신규 인력 필요성을 제안할 수 없다. Claude가
 * 다른 AI 직원을 대신해 제안을 넣을 때는 반드시 requestedByEmployeeId를
 * 채워야 하며, 그 직원의 rank가 employeeRequestMinRank(기본 3) 미만이면
 * 거부한다. requestedByEmployeeId가 없으면 사용자가 채팅으로 직접 요청한
 * 것으로 간주해 게이팅을 적용하지 않는다.
 */
async function checkEmployeeRequestRank(
  payload: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const requestedByEmployeeId = payload.requestedByEmployeeId as string | undefined;
  if (!requestedByEmployeeId) return { ok: true };

  const requester = await prisma.employee.findUnique({ where: { id: requestedByEmployeeId } });
  if (!requester) {
    return { ok: false, error: "요청한 직원(requestedByEmployeeId)을 찾을 수 없습니다" };
  }
  const minRank = await getSettingNumber("employeeRequestMinRank", 3);
  if (requester.rank < minRank) {
    return {
      ok: false,
      error: `rank ${requester.rank} 직원은 신규 인력 필요성을 직접 제안할 수 없습니다(최소 rank ${minRank} 필요). 상위 직급 직원에게 검토를 요청하세요.`,
    };
  }
  return { ok: true };
}

/** 같은 부서+역할로 이미 대기 중인 채용 제안이 있으면 새로 만들지 않고
 * 기존 것을 반환한다(§3: 반복 요청 방지, idempotencyKey 없이도 적용). */
async function findDuplicateEmployeeRequest(payload: Record<string, unknown>) {
  const departmentId = payload.departmentId as string | undefined;
  const role = payload.role as string | undefined;
  if (!departmentId || !role) return null;

  // SQLite's Prisma JSON filtering is fragile across providers, so filter
  // in JS instead of pushing a JSON-path query down to the DB.
  const pending = await prisma.approvalRequest.findMany({
    where: { entityType: "employee", action: "create", status: "pending" },
  });
  return (
    pending.find((candidate) => {
      const candidatePayload = candidate.payload as Record<string, unknown>;
      return candidatePayload.departmentId === departmentId && candidatePayload.role === role;
    }) ?? null
  );
}

/**
 * The single entry point every propose_* MCP tool (and the generic
 * create_approval_request tool) funnels through. Phase 2: only
 * department.create and employee.create are registered at all — anything
 * else is rejected here as unknown_action before a row is ever written.
 */
export async function createProposal(input: ProposeInput): Promise<ProposeResult> {
  const schema = getProposalSchema(input.entityType, input.action);
  if (!schema) {
    return {
      ok: false,
      error: `등록되지 않은 entityType/action 조합입니다: ${input.entityType}.${input.action} (department.create, employee.create만 지원)`,
      code: "unknown_action",
    };
  }
  const parsed = schema.safeParse(input.payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message, code: "invalid_payload" };
  }

  if (input.entityType === "employee" && input.action === "create") {
    const payloadRecord = parsed.data as Record<string, unknown>;
    const rankCheck = await checkEmployeeRequestRank(payloadRecord);
    if (!rankCheck.ok) {
      return { ok: false, error: rankCheck.error, code: "rank_too_low" };
    }

    if (!input.idempotencyKey) {
      const duplicate = await findDuplicateEmployeeRequest(payloadRecord);
      if (duplicate) return { ok: true, approvalRequestId: duplicate.id, deduped: true };
    }
  }

  if (input.idempotencyKey) {
    const existing = await prisma.approvalRequest.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return { ok: true, approvalRequestId: existing.id, deduped: true };
  }

  const expiryHours = await getSettingNumber("approval_default_expiry_hours", 24);

  try {
    const created = await prisma.approvalRequest.create({
      data: {
        entityType: input.entityType,
        action: input.action,
        payload: parsed.data as Prisma.InputJsonValue,
        summary: input.summary,
        riskLevel: input.riskLevel ?? "standard",
        requestedBy: input.requestedBy ?? "claude_code",
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(Date.now() + expiryHours * 3600_000),
      },
    });
    return { ok: true, approvalRequestId: created.id, deduped: false };
  } catch (err) {
    if (
      input.idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.approvalRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return { ok: true, approvalRequestId: existing.id, deduped: true };
    }
    throw err;
  }
}
