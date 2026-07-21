import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { createProposal } from "../../src/lib/approvals/propose";
import { ok, err } from "../lib/toolResult";
import { proposeToolShape } from "../lib/proposeToolShape";

export function registerAutomationTools(server: McpServer) {
  server.registerTool(
    "list_automations",
    {
      title: "자동화 목록 조회",
      description: "보관되지 않은 자동화 목록을 반환합니다.",
      inputSchema: {},
    },
    async () => {
      const automations = await prisma.automation.findMany({ where: { archivedAt: null } });
      return ok({ automations });
    }
  );

  server.registerTool(
    "get_automation",
    {
      title: "자동화 상세 조회",
      description: "id로 자동화 상세 정보(실행 기록 포함)를 반환합니다.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const automation = await prisma.automation.findUnique({
        where: { id },
        include: { runs: { orderBy: { createdAt: "desc" }, take: 20 } },
      });
      if (!automation) return err("자동화를 찾을 수 없습니다", "not_found");
      return ok({ automation });
    }
  );

  server.registerTool(
    "propose_automation",
    {
      title: "자동화 생성/수정 제안",
      description:
        "반복 업무(자동화) 생성·수정을 제안합니다. 일시정지/재개/보관은 사용자가 웹앱에서 직접 제어하며 이 도구로 할 수 없습니다.",
      inputSchema: proposeToolShape(["create", "update"]),
    },
    async ({ action, payload, relatedEntityId, summary, riskLevel, idempotencyKey }) => {
      const result = await createProposal({
        entityType: "automation",
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
