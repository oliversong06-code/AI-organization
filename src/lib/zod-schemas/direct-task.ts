import { z } from "zod";
import { taskPrioritySchema } from "@/lib/enums";

/**
 * Direct-execution (no ApprovalRequest) schemas for Task lifecycle —
 * propose_task was removed entirely in P2-2/P2-4. A Task row only ever
 * exists already "queued"; these three tools are how Claude Code creates
 * and edits one going forward.
 */

export const taskCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  assignedEmployeeId: z.string().optional(),
  collaboratingEmployeeIds: z.array(z.string()).optional(),
  priority: taskPrioritySchema.optional(),
  inputFiles: z.array(z.string()).optional(),
  requiredSkills: z.array(z.string()).optional(),
  requestedPermissions: z.array(z.string()).optional(),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  priority: taskPrioritySchema.optional(),
  inputFiles: z.array(z.string()).optional(),
  requiredSkills: z.array(z.string()).optional(),
  requestedPermissions: z.array(z.string()).optional(),
});

export const taskAssignSchema = z.object({
  assignedEmployeeId: z.string().min(1),
});
