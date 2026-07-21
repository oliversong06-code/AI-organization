import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { registerSkill, validateSkill, assignSkillToEmployee } from "../../src/lib/direct/skillDirect";
import { skillRegisterSchema, skillValidateSchema, skillAssignSchema } from "../../src/lib/zod-schemas/direct-skill";
import { ok, err } from "../lib/toolResult";

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

  server.registerTool(
    "register_skill",
    {
      title: "스킬 등록",
      description:
        "새 스킬을 카탈로그에 등록합니다. 승인 없이 즉시 생성되지만 validationStatus=unvalidated/enabled=false 상태로 시작하며, validate_skill로 통과 판정을 받아야 실제로 배정·사용 가능해집니다.",
      inputSchema: skillRegisterSchema.shape,
    },
    async (payload) => {
      const result = await registerSkill(payload, "claude_code");
      return ok(result);
    }
  );

  server.registerTool(
    "validate_skill",
    {
      title: "스킬 검증 결과 기록",
      description:
        "스킬의 검증 결과(passed|failed)를 기록합니다. passed면 enabled/installed가 true로, healthStatus가 available로 바뀌어 실제로 배정 가능해집니다. failed면 다시 비활성화되고 healthStatus=error로 표시됩니다.",
      inputSchema: skillValidateSchema.extend({ id: z.string().min(1) }).shape,
    },
    async ({ id, status, details }) => {
      const result = await validateSkill(id, status, details, "claude_code");
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );

  server.registerTool(
    "assign_skill",
    {
      title: "직원에게 스킬 배정",
      description:
        "직원에게 스킬을 배정합니다. 스킬이 validationStatus=passed가 아니면 거부되며, 스킬에 compatibleRanks/compatibleDepartments 제약이 있으면 그 조건을 만족하는 직원에게만 배정할 수 있습니다.",
      inputSchema: skillAssignSchema.shape,
    },
    async ({ employeeId, skillId }) => {
      const result = await assignSkillToEmployee(employeeId, skillId, "claude_code");
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );
}
