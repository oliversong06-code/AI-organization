import { z } from "zod";
import { skillSourceSchema, skillConnectionTypeSchema, employeeRankSchema } from "@/lib/enums";

/**
 * Direct-execution (no ApprovalRequest) schemas for the P2-7 skill
 * catalog — creating a Skill row never needed approval even before this;
 * what's new is that it now starts unvalidated/disabled until
 * validate_skill records a pass, and assign_skill enforces that gate plus
 * the compatibleRanks/compatibleDepartments constraints.
 */

export const skillRegisterSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  source: skillSourceSchema,
  connectionType: skillConnectionTypeSchema,
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  outputSchema: z.record(z.string(), z.unknown()).default({}),
  permissions: z.array(z.string()).default([]),
  instructions: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  compatibleRanks: z.array(employeeRankSchema).optional(),
  compatibleDepartments: z.array(z.string()).optional(),
});

export const skillValidateSchema = z.object({
  status: z.enum(["passed", "failed"]),
  details: z.string().optional(),
});

export const skillAssignSchema = z.object({
  employeeId: z.string().min(1),
  skillId: z.string().min(1),
});
