import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { createProposal } from "../../src/lib/approvals/propose";
import { ok, err } from "../lib/toolResult";
import { proposeToolShape } from "../lib/proposeToolShape";

export function registerSkillTools(server: McpServer) {
  server.registerTool(
    "list_skills",
    {
      title: "스킬 목록 조회",
      description: "스킬 카탈로그 전체(설치 여부 포함)를 반환합니다. 설치되지 않은 스킬을 설치된 것처럼 다루지 마세요.",
      inputSchema: {},
    },
    async () => {
      const skills = await prisma.skill.findMany();
      return ok({ skills });
    }
  );

  server.registerTool(
    "propose_skill",
    {
      title: "스킬 설치/수정/비활성화 제안",
      description:
        "새 스킬 설치(install_request, relatedEntityId 없으면 카탈로그에 새로 추가), 기존 스킬 설정 변경(update), 비활성화(disable)를 제안합니다.",
      inputSchema: proposeToolShape(["install_request", "update", "disable"]),
    },
    async ({ action, payload, relatedEntityId, summary, riskLevel, idempotencyKey }) => {
      const result = await createProposal({
        entityType: "skill",
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
