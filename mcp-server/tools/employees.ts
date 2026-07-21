import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { createProposal } from "../../src/lib/approvals/propose";
import { ok, err } from "../lib/toolResult";
import { proposeToolShape } from "../lib/proposeToolShape";

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
      title: "직원 생성/수정/이동/보관 제안",
      description:
        "직원 생성·수정·이동·보관을 제안합니다. 실제로는 ApprovalRequest만 생성되며, 사용자가 웹앱 승인함에서 승인해야 반영됩니다. 사무실에는 승인된 직원만 표시됩니다.",
      inputSchema: proposeToolShape(["create", "update", "move", "archive"]),
    },
    async ({ action, payload, relatedEntityId, summary, riskLevel, idempotencyKey }) => {
      const result = await createProposal({
        entityType: "employee",
        action,
        payload,
        relatedEntityId,
        summary,
        riskLevel,
        idempotencyKey,
      });
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );
}
