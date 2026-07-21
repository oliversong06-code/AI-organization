import { prisma } from "@/lib/prisma";
import { getProposalSchema } from "@/lib/approval-registry";
import type { ApprovalRiskLevel } from "@/lib/enums";
import { Prisma } from "@/generated/prisma/client";

export interface ProposeInput {
  entityType: string;
  action: string;
  payload: unknown;
  summary: string;
  relatedEntityId?: string;
  riskLevel?: ApprovalRiskLevel;
  idempotencyKey?: string;
  requestedBy?: string;
}

export type ProposeResult =
  | { ok: true; approvalRequestId: string; deduped: boolean }
  | { ok: false; error: string; code: "unknown_action" | "invalid_payload" | "target_not_found" };

async function getDefaultExpiryHours(): Promise<number> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: "approval_default_expiry_hours" },
  });
  const value = setting?.value;
  return typeof value === "number" && value > 0 ? value : 24;
}

async function lookupCurrentVersion(entityType: string, id: string): Promise<number | null> {
  switch (entityType) {
    case "department":
      return (await prisma.department.findUnique({ where: { id } }))?.version ?? null;
    case "employee":
      return (await prisma.employee.findUnique({ where: { id } }))?.version ?? null;
    case "task":
      return (await prisma.task.findUnique({ where: { id } }))?.version ?? null;
    case "automation":
      return (await prisma.automation.findUnique({ where: { id } }))?.version ?? null;
    case "skill":
      return (await prisma.skill.findUnique({ where: { id } }))?.version ?? null;
    case "integration":
      return (await prisma.integration.findUnique({ where: { id } }))?.version ?? null;
    default:
      return null;
  }
}

/**
 * The single entry point every propose_* MCP tool (and the generic
 * create_approval_request tool) funnels through. Validates payload against
 * the CURRENT approval-registry schema for entityType+action, snapshots
 * the target's version for update/archive/move/assign/disable-style
 * actions, and writes only an ApprovalRequest row — never a real entity.
 * idempotencyKey dedup returns the existing request instead of erroring on
 * a repeat call with the same key.
 */
export async function createProposal(input: ProposeInput): Promise<ProposeResult> {
  const schema = getProposalSchema(input.entityType, input.action);
  if (!schema) {
    return {
      ok: false,
      error: `등록되지 않은 entityType/action 조합입니다: ${input.entityType}.${input.action}`,
      code: "unknown_action",
    };
  }
  const parsed = schema.safeParse(input.payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message, code: "invalid_payload" };
  }

  if (input.idempotencyKey) {
    const existing = await prisma.approvalRequest.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return { ok: true, approvalRequestId: existing.id, deduped: true };
  }

  let entityVersion: number | null = null;
  if (input.relatedEntityId) {
    entityVersion = await lookupCurrentVersion(input.entityType, input.relatedEntityId);
    if (entityVersion === null) {
      return { ok: false, error: "대상을 찾을 수 없습니다", code: "target_not_found" };
    }
  }

  const expiryHours = await getDefaultExpiryHours();

  try {
    const created = await prisma.approvalRequest.create({
      data: {
        entityType: input.entityType,
        action: input.action,
        relatedEntityId: input.relatedEntityId,
        payload: parsed.data as Prisma.InputJsonValue,
        summary: input.summary,
        riskLevel: input.riskLevel ?? "standard",
        requestedBy: input.requestedBy ?? "claude_code",
        idempotencyKey: input.idempotencyKey,
        entityVersion,
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
