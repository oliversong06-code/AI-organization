import { z } from "zod";
import { directionSchema, employeeRankSchema, rankAuthorizedBySchema } from "@/lib/enums";

/**
 * Direct-execution (no ApprovalRequest) schemas for department/employee
 * general updates. Only create is approval-gated (see proposals.ts) —
 * these run immediately via MCP tools / user-direct-control routes and
 * only ever write an ActivityLog entry.
 */

export const departmentUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  colorTag: z.string().optional(),
  officeZoneId: z.string().nullable().optional(),
});

export const employeeUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  avatarId: z.string().min(1).optional(),
  skillIds: z.array(z.string()).optional(),
});

export const employeeMoveSchema = z.object({
  officeZoneId: z.string().min(1),
  direction: directionSchema.optional(),
});

export const employeeRankChangeSchema = z.object({
  newRank: employeeRankSchema,
  authorizedBy: rankAuthorizedBySchema,
  authorizingEmployeeId: z.string().optional(), // required when authorizedBy === "rank4_employee"
});
