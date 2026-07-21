import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { ok } from "../lib/toolResult";

// register_skill / validate_skill / assign_skill are added in P2-7 once the
// skill catalog reset lands. list_skills stays available meanwhile so
// Claude can always check what's installed before claiming a skill exists.
export function registerSkillTools(server: McpServer) {
  server.registerTool(
    "list_skills",
    {
      title: "스킬 목록 조회",
      description:
        "직원용 스킬 목록을 반환합니다(현재 0개일 수 있음). 설치되지 않은 스킬을 설치된 것처럼 다루지 마세요.",
      inputSchema: {},
    },
    async () => {
      const skills = await prisma.skill.findMany();
      return ok({ skills });
    }
  );
}
