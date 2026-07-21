import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { withTransaction } from "../../src/lib/withTransaction";
import { logActivity } from "../../src/lib/activity-log";
import {
  automationScheduleTypeSchema,
  automationApprovalModeSchema,
} from "../../src/lib/enums";
import { ok, err } from "../lib/toolResult";

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
    "create_automation",
    {
      title: "자동화 생성",
      description:
        "반복 업무(자동화)를 승인 없이 즉시 생성합니다. 일시정지·재개·보관은 사용자가 웹앱에서 직접 제어하며 이 도구로는 할 수 없습니다.",
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        taskInstruction: z.string().min(1),
        assignedEmployeeId: z.string().optional(),
        scheduleType: automationScheduleTypeSchema,
        scheduleExpression: z.string().optional(),
        timezone: z.string().optional(),
        requiredSkills: z.array(z.string()).default([]),
        requiredIntegrations: z.array(z.string()).default([]),
        outputFormat: z.string().min(1),
        outputLocation: z.string().optional(),
        approvalMode: automationApprovalModeSchema.default("required"),
      },
    },
    async (input) => {
      const created = await withTransaction(async (tx) => {
        const automation = await tx.automation.create({ data: input });
        await logActivity(tx, {
          actor: "claude_code",
          action: "automation.create",
          entityType: "automation",
          entityId: automation.id,
        });
        return automation;
      });
      return ok({ automation: created });
    }
  );

  server.registerTool(
    "update_automation",
    {
      title: "자동화 수정",
      description: "기존 자동화의 일반 정보를 승인 없이 즉시 수정합니다.",
      inputSchema: {
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        taskInstruction: z.string().min(1).optional(),
        assignedEmployeeId: z.string().nullable().optional(),
        scheduleExpression: z.string().optional(),
        outputLocation: z.string().optional(),
      },
    },
    async ({ id, ...data }) => {
      const existing = await prisma.automation.findUnique({ where: { id } });
      if (!existing) return err("자동화를 찾을 수 없습니다", "not_found");
      await withTransaction(async (tx) => {
        await tx.automation.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
        await logActivity(tx, {
          actor: "claude_code",
          action: "automation.update",
          entityType: "automation",
          entityId: id,
        });
      });
      return ok({ ok: true });
    }
  );
}
