import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { ok } from "../lib/toolResult";

export function registerCompanyTools(server: McpServer) {
  server.registerTool(
    "get_company_state",
    {
      title: "회사 상태 조회",
      description: "회사 정보와 직원/부서/업무/자동화/결과물/대기 승인 카운트를 반환합니다.",
      inputSchema: {},
    },
    async () => {
      const [company, employees, departments, tasks, automations, artifacts, pendingApprovals] =
        await Promise.all([
          prisma.company.findFirst(),
          prisma.employee.count({ where: { status: { not: "archived" } } }),
          prisma.department.count({ where: { status: { not: "archived" } } }),
          prisma.task.count({ where: { status: { not: "archived" } } }),
          prisma.automation.count({ where: { archivedAt: null } }),
          prisma.artifact.count({ where: { archivedAt: null } }),
          prisma.approvalRequest.count({ where: { status: "pending" } }),
        ]);
      return ok({
        company,
        counts: { employees, departments, tasks, automations, artifacts, pendingApprovals },
      });
    }
  );

  server.registerTool(
    "get_activity_logs",
    {
      title: "활동 로그 조회",
      description: "최근 활동 로그를 최신순으로 반환합니다.",
      inputSchema: { limit: z.number().int().positive().max(500).default(100) },
    },
    async ({ limit }) => {
      const logs = await prisma.activityLog.findMany({
        orderBy: { timestamp: "desc" },
        take: limit,
      });
      return ok({ logs });
    }
  );
}
