import type { z } from "zod";
import type { ApprovalEntityType } from "@/lib/enums";
import { departmentProposalSchemas, employeeProposalSchemas } from "@/lib/zod-schemas/proposals";

/**
 * The approval execution whitelist. Phase 2 policy: exactly two things ever
 * require a user-approved ApprovalRequest — creating a Department and
 * creating an Employee. `create_approval_request` (the generic MCP tool)
 * and `propose_department`/`propose_employee` all funnel through this
 * registry — an entityType+action combination that isn't listed here can
 * never be materialized into a real row, no matter what payload a pending
 * ApprovalRequest carries. Everything else (task/automation/skill/
 * integration, and department/employee update/archive/move) is a direct-
 * execution MCP tool instead — see src/lib/zod-schemas/direct-*.ts.
 */
export const APPROVAL_REGISTRY = {
  department: departmentProposalSchemas,
  employee: employeeProposalSchemas,
} as const satisfies Record<ApprovalEntityType, Record<string, z.ZodTypeAny>>;

export type ApprovalAction<E extends ApprovalEntityType> = keyof (typeof APPROVAL_REGISTRY)[E];

export function getProposalSchema(entityType: string, action: string): z.ZodTypeAny | undefined {
  const entitySchemas = (APPROVAL_REGISTRY as Record<string, Record<string, z.ZodTypeAny>>)[
    entityType
  ];
  return entitySchemas?.[action];
}
