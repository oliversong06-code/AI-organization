import { z } from "zod";
import { approvalRiskLevelSchema } from "../../src/lib/enums";

/** Shared input shape for every propose_* tool: entityType is fixed per
 * tool, action is a per-entity enum, payload is validated strictly against
 * the approval-registry schema for that action inside createProposal —
 * kept loose (z.record) here since the MCP inputSchema can't vary by the
 * `action` value at the type level. */
export function proposeToolShape<A extends [string, ...string[]]>(actions: A) {
  return {
    action: z.enum(actions),
    payload: z.record(z.string(), z.unknown()),
    relatedEntityId: z.string().optional(),
    summary: z.string().min(1),
    riskLevel: approvalRiskLevelSchema.optional(),
    idempotencyKey: z.string().optional(),
  };
}
