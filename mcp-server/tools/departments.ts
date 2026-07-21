import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { createProposal } from "../../src/lib/approvals/propose";
import { ok, err } from "../lib/toolResult";
import { proposeToolShape } from "../lib/proposeToolShape";

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
      title: "부서 생성/수정/보관 제안",
      description:
        "부서 생성·수정·보관을 제안합니다. 실제로는 ApprovalRequest만 생성되며, 사용자가 웹앱 승인함에서 승인해야 반영됩니다.",
      inputSchema: proposeToolShape(["create", "update", "archive"]),
    },
    async ({ action, payload, relatedEntityId, summary, riskLevel, idempotencyKey }) => {
      const result = await createProposal({
        entityType: "department",
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
