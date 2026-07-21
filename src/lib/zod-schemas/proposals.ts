import { z } from "zod";
import { directionSchema, employeeRankSchema } from "@/lib/enums";

/**
 * Phase 2: exactly two entityType+action combinations ever require a
 * user-approved ApprovalRequest — department.create and employee.create.
 * Everything else (update/archive/move for either, and all of
 * task/automation/skill/integration) is a direct-execution MCP tool now —
 * see src/lib/zod-schemas/direct-*.ts.
 */

// ─────────────────────────────────────────────────────────
// Department — create only
// ─────────────────────────────────────────────────────────

const departmentCreate = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  colorTag: z.string().optional(),
  officeZoneId: z.string().optional(), // 생략 시 자동으로 빈 업무 공간에 배정
});

export const departmentProposalSchemas = {
  create: departmentCreate,
};

// ─────────────────────────────────────────────────────────
// Employee — create only. 요구사항 3장: 신규 채용 요청에 필요한 정당화 근거를
// payload 자체에 담아 승인함에서 그대로 보여줄 수 있게 한다.
// ─────────────────────────────────────────────────────────

const employeeCreate = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  rank: employeeRankSchema,
  departmentId: z.string().optional(),
  officeZoneId: z.string().min(1),
  posX: z.number().min(0).max(1).default(0.5),
  posY: z.number().min(0).max(1).default(0.5),
  direction: directionSchema.default("down"),
  scale: z.number().positive().default(1),
  avatarId: z.string().min(1),
  skillIds: z.array(z.string()).optional(),

  // 요청 근거(요구사항 3장) — 전부 승인함 화면에 그대로 노출된다.
  requestedByEmployeeId: z.string().optional(), // 없으면 사용자가 직접 요청한 것으로 간주(직급 검사 면제)
  requestedByRank: employeeRankSchema.optional(), // requestedByEmployeeId와 별개로 명시할 수도 있음(참고용)
  responsibilities: z.string().optional(),
  reason: z.string().min(1),
  expectedTasks: z.string().optional(),
  dataAccessScope: z.string().optional(),
  requiredSkillNames: z.array(z.string()).optional(),
  consequencesIfNotHired: z.string().optional(),
  duplicateCheckNotes: z.string().optional(),
});

export const employeeProposalSchemas = {
  create: employeeCreate,
};
