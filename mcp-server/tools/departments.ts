import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { createProposal } from "../../src/lib/approvals/propose";
import { approvalRiskLevelSchema } from "../../src/lib/enums";
import { ok, err } from "../lib/toolResult";

export function registerDepartmentTools(server: McpServer) {
  server.registerTool(
    "list_departments",
    {
      title: "부서 목록 조회",
      description: "보관되지 않은 부서 목록을 반환합니다.",
      inputSchema: {},
    },
    async () => {
      const departments = await prisma.department.findMany({
        where: { status: { not: "archived" } },
        include: { officeZone: { select: { key: true, name: true } } },
      });
      return ok({ departments });
    }
  );

  server.registerTool(
    "get_department",
    {
      title: "부서 상세 조회",
      description: "id로 부서 상세 정보를 반환합니다.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const department = await prisma.department.findUnique({
        where: { id },
        include: { officeZone: true, employees: true },
      });
      if (!department) return err("부서를 찾을 수 없습니다", "not_found");
      return ok({ department });
    }
  );

  server.registerTool(
    "propose_department",
    {
      title: "부서 생성 제안",
      description:
        "새 부서 생성을 제안합니다. 실제로는 ApprovalRequest만 생성되며, 사용자가 웹앱 승인함에서 승인해야 실제 Department가 만들어지고 사무실 공간에 배정됩니다. 부서의 일반 정보 수정은 update_department를, 보관은 웹앱에서 사용자가 직접 처리합니다(이 도구로 불가).",
      inputSchema: {
        payload: z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          colorTag: z.string().optional(),
          officeZoneId: z.string().optional().describe("생략하면 비어있는 업무 공간에 자동 배정됩니다"),
        }),
        summary: z.string().min(1),
        riskLevel: approvalRiskLevelSchema.optional(),
        idempotencyKey: z.string().optional(),
      },
    },
    async ({ payload, summary, riskLevel, idempotencyKey }) => {
      const result = await createProposal({
        entityType: "department",
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
