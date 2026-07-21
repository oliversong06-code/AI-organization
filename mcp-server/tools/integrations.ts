import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { withTransaction } from "../../src/lib/withTransaction";
import { logActivity } from "../../src/lib/activity-log";
import { integrationKindSchema } from "../../src/lib/enums";
import { ok, err } from "../lib/toolResult";
import type { Prisma } from "../../src/generated/prisma/client";

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
    "configure_integration",
    {
      title: "외부 연동 등록",
      description:
        "외부 폴더 동기화 등 새 연동을 승인 없이 즉시 등록합니다. 등록된 폴더는 항상 읽기 전용으로만 접근되며, 워크스페이스 외부 경로에 쓰기를 시도하지 않습니다. OAuth/로그인이 필요한 서비스는 그 서비스 자체의 인증을 우회하지 않습니다.",
      inputSchema: {
        name: z.string().min(1),
        kind: integrationKindSchema,
        config: z.record(z.string(), z.unknown()),
      },
    },
    async ({ name, kind, config }) => {
      const created = await withTransaction(async (tx) => {
        const integration = await tx.integration.create({
          data: {
            name,
            kind,
            config: config as Prisma.InputJsonValue,
            status: "configured",
            accessMode: "read_only",
          },
        });
        await logActivity(tx, {
          actor: "claude_code",
          action: "integration.configure",
          entityType: "integration",
          entityId: integration.id,
        });
        return integration;
      });
      return ok({ integration: created });
    }
  );

  server.registerTool(
    "update_integration",
    {
      title: "외부 연동 수정",
      description: "기존 연동 설정을 승인 없이 즉시 수정합니다.",
      inputSchema: {
        id: z.string().min(1),
        config: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ id, config }) => {
      const existing = await prisma.integration.findUnique({ where: { id } });
      if (!existing) return err("연동을 찾을 수 없습니다", "not_found");
      await withTransaction(async (tx) => {
        await tx.integration.update({
          where: { id },
          data: {
            ...(config ? { config: config as Prisma.InputJsonValue } : {}),
            version: { increment: 1 },
          },
        });
        await logActivity(tx, {
          actor: "claude_code",
          action: "integration.update",
          entityType: "integration",
          entityId: id,
        });
      });
      return ok({ ok: true });
    }
  );
}
