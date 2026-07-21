import type { z } from "zod";
import type { ApprovalEntityType } from "@/lib/enums";
import {
  automationProposalSchemas,
  departmentProposalSchemas,
  employeeProposalSchemas,
  integrationProposalSchemas,
  skillProposalSchemas,
  taskProposalSchemas,
} from "@/lib/zod-schemas/proposals";

/**
 * The approval execution whitelist. `create_approval_request` (the generic
 * MCP tool) and every `propose_*` tool ultimately funnel through this
 * registry — an entityType+action combination that isn't listed here can
 * never be materialized into a real row, no matter what payload a pending
 * ApprovalRequest carries. This is what keeps a generic proposal tool from
 * becoming a backdoor around the specific propose_* validators.
 */
export const APPROVAL_REGISTRY = {
  department: departmentProposalSchemas,
  employee: employeeProposalSchemas,
  task: taskProposalSchemas,
  automation: automationProposalSchemas,
  skill: skillProposalSchemas,
  integration: integrationProposalSchemas,
} as const satisfies Record<ApprovalEntityType, Record<string, z.ZodTypeAny>>;

export type ApprovalAction<E extends ApprovalEntityType> = keyof (typeof APPROVAL_REGISTRY)[E];

export function getProposalSchema(
  entityType: string,
  action: string
): z.ZodTypeAny | undefined {
  const entitySchemas = (APPROVAL_REGISTRY as Record<string, Record<string, z.ZodTypeAny>>)[
    entityType
  ];
  return entitySchemas?.[action];
}

/** Actions that target an existing row (need relatedEntityId + optionally
 * entityVersion) vs. actions that create a brand new row. */
export function actionTargetsExistingEntity(entityType: string, action: string): boolean {
  if (entityType === "task" && action === "create") return false;
  if (entityType === "department" && action === "create") return false;
  if (entityType === "employee" && action === "create") return false;
  if (entityType === "automation" && action === "create") return false;
  if (entityType === "skill" && action === "install_request") return false; // may or may not target existing — checked via relatedEntityId presence instead
  if (entityType === "integration" && action === "configure") return false;
  return true;
}
