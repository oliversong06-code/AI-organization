import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { createProposal } from "../../src/lib/approvals/propose";
import { ok, err } from "../lib/toolResult";
import { proposeToolShape } from "../lib/proposeToolShape";

export function registerIntegrationTools(server: McpServer) {
  server.registerTool(
    "list_integrations",
    {
      title: "연동 목록 조회",
      description: "등록된 외부 연동 목록을 반환합니다.",
      inputSchema: {},
    },
    async () => {
      const integrations = await prisma.integration.findMany();
      return ok({ integrations });
    }
  );

  server.registerTool(
    "propose_integration",
    {
      title: "외부 연동 구성/수정/비활성화 제안",
      description:
        "외부 폴더 동기화 등 새 연동 등록(configure), 설정 변경(update), 비활성화(disable)를 제안합니다. 승인된 폴더는 항상 읽기 전용으로만 접근됩니다.",
      inputSchema: proposeToolShape(["configure", "update", "disable"]),
    },
    async ({ action, payload, relatedEntityId, summary, riskLevel, idempotencyKey }) => {
      const result = await createProposal({
        entityType: "integration",
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
