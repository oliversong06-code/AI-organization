import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { createProposal } from "../../src/lib/approvals/propose";
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
}
