import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { createProposal } from "../../src/lib/approvals/propose";
import { updateEmployee, moveEmployee, changeEmployeeRank } from "../../src/lib/direct/employeeDirect";
import {
  employeeUpdateSchema,
  employeeMoveSchema,
  employeeRankChangeSchema,
} from "../../src/lib/zod-schemas/direct-department-employee";
import { approvalRiskLevelSchema, directionSchema, employeeRankSchema } from "../../src/lib/enums";
import { ok, err } from "../lib/toolResult";

export function registerEmployeeTools(server: McpServer) {
  server.registerTool(
    "list_employees",
    {
      title: "직원 목록 조회",
      description: "보관되지 않은 직원 목록을 반환합니다.",
      inputSchema: {},
    },
    async () => {
      const employees = await prisma.employee.findMany({
        where: { status: { not: "archived" } },
        include: {
          department: { select: { id: true, name: true } },
          officeZone: { select: { key: true, name: true } },
        },
      });
      return ok({ employees });
    }
  );

  server.registerTool(
    "get_employee",
    {
      title: "직원 상세 조회",
      description: "id로 직원 상세 정보(스킬, 담당 업무 포함)를 반환합니다.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const employee = await prisma.employee.findUnique({
        where: { id },
        include: {
          department: true,
          officeZone: true,
          skills: { include: { skill: true } },
          assignedTasks: true,
        },
      });
      if (!employee) return err("직원을 찾을 수 없습니다", "not_found");
      return ok({ employee });
    }
  );

  server.registerTool(
    "propose_employee",
    {
      title: "직원 채용 제안",
      description:
        "신규 직원 채용을 제안합니다(기존 직원이 필요성을 판단한 경우 포함). 실제로는 ApprovalRequest만 생성되며, 사용자가 웹앱 승인함에서 승인해야 실제 Employee가 생성되고 좌석에 배치됩니다. " +
        "requestedByEmployeeId를 채우면 그 직원의 rank가 employeeRequestMinRank(기본 3) 미만일 때 거부됩니다 — rank 1·2 직원은 스스로 채용을 제안할 수 없고 상위 직급에게 검토를 요청해야 합니다. " +
        "requestedByEmployeeId를 생략하면 사용자가 직접 요청한 것으로 간주되어 이 제한이 적용되지 않습니다. " +
        "직원의 일반 정보 수정은 update_employee를, 부서/좌석 이동은 move_employee를, 보관은 웹앱에서 사용자가 직접 처리합니다(이 도구로 불가).",
      inputSchema: {
        payload: z.object({
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
          requestedByEmployeeId: z.string().optional(),
          requestedByRank: employeeRankSchema.optional(),
          responsibilities: z.string().optional(),
          reason: z.string().min(1),
          expectedTasks: z.string().optional(),
          dataAccessScope: z.string().optional(),
          requiredSkillNames: z.array(z.string()).optional(),
          consequencesIfNotHired: z.string().optional(),
          duplicateCheckNotes: z.string().min(1),
        }),
        summary: z.string().min(1),
        riskLevel: approvalRiskLevelSchema.optional(),
        idempotencyKey: z.string().optional(),
      },
    },
    async ({ payload, summary, riskLevel, idempotencyKey }) => {
      const result = await createProposal({
        entityType: "employee",
        action: "create",
        payload,
        summary,
        riskLevel,
        idempotencyKey,
      });
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );

  server.registerTool(
    "update_employee",
    {
      title: "직원 정보 수정",
      description:
        "직원의 일반 정보(이름/역할/소속 부서/아바타/보유 스킬)를 수정합니다. 승인 없이 즉시 실행되며 ActivityLog에 기록됩니다. 사무실 공간/좌석 이동은 move_employee를, 직급 변경은 update_employee_rank를, 보관은 웹앱에서 사용자가 직접 처리합니다(이 도구로 불가).",
      inputSchema: { id: z.string().min(1), data: employeeUpdateSchema },
    },
    async ({ id, data }) => {
      const result = await updateEmployee(id, data, "claude_code");
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );

  server.registerTool(
    "move_employee",
    {
      title: "직원 사무실 공간 이동",
      description:
        "직원을 다른 사무실 공간(zone)으로 이동시킵니다. 기존 좌석을 해제하고 대상 공간의 빈 좌석에 자동 배정하며(빈 좌석이 없으면 공간 중앙에 배치), 승인 없이 즉시 실행되어 ActivityLog에 기록됩니다.",
      inputSchema: employeeMoveSchema.extend({ id: z.string().min(1) }).shape,
    },
    async ({ id, officeZoneId, direction }) => {
      const result = await moveEmployee(id, officeZoneId, direction, "claude_code");
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );

  server.registerTool(
    "update_employee_rank",
    {
      title: "직원 직급 변경",
      description:
        "직원의 직급(1~4)을 변경합니다. authorizedBy가 'rank4_employee'이면 authorizingEmployeeId가 실제로 직급 4인 다른 직원이어야 하며(본인 스스로는 변경 불가), 아니면 거부됩니다. authorizedBy가 'user'인 경로는 웹앱에서 사용자가 직접 클릭할 때만 사용됩니다.",
      inputSchema: employeeRankChangeSchema.extend({ id: z.string().min(1) }).shape,
    },
    async ({ id, newRank, authorizedBy, authorizingEmployeeId }) => {
      const result = await changeEmployeeRank(id, newRank, authorizedBy, authorizingEmployeeId);
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );
}
