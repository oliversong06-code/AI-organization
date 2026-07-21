import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { withTransaction } from "../../src/lib/withTransaction";
import { logActivity } from "../../src/lib/activity-log";
import { resolveWorkspacePath, PathTraversalError } from "../../src/lib/path-guard";
import { ok, err } from "../lib/toolResult";

const MIME_BY_EXT: Record<string, string> = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function registerArtifactTools(server: McpServer) {
  server.registerTool(
    "register_artifact",
    {
      title: "결과물 등록",
      description:
        "업무 실행으로 생성된 파일을 workspace 안 경로로 등록합니다. 파일은 미리 workspace 안에 저장되어 있어야 하며, 이 도구는 파일을 새로 만들지 않습니다.",
      inputSchema: {
        taskId: z.string().optional(),
        employeeId: z.string().optional(),
        title: z.string().min(1),
        summary: z.string().optional(),
        filePath: z.string().min(1).describe("workspace 상대 경로, 예: workspace/artifacts/report.md"),
        sourceType: z.enum(["task_output", "manual_import", "external_sync", "excel_register"]).default("task_output"),
      },
    },
    async ({ taskId, employeeId, title, summary, filePath, sourceType }) => {
      let absolutePath: string;
      try {
        absolutePath = resolveWorkspacePath(filePath);
      } catch (e) {
        if (e instanceof PathTraversalError) return err(e.message, "invalid_path");
        throw e;
      }

      const stat = await fs.stat(absolutePath).catch(() => null);
      if (!stat || !stat.isFile()) {
        return err(`파일을 찾을 수 없습니다: ${filePath}`, "file_not_found");
      }

      const fileName = path.basename(filePath);
      const mimeType = MIME_BY_EXT[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";

      const artifact = await withTransaction(async (tx) => {
        const created = await tx.artifact.create({
          data: {
            taskId,
            employeeId,
            title,
            summary,
            fileName,
            filePath,
            mimeType,
            size: stat.size,
            sourceType,
          },
        });
        await logActivity(tx, {
          actor: "claude_code",
          action: "artifact.register",
          entityType: "artifact",
          entityId: created.id,
          detail: { taskId, employeeId },
        });
        return created;
      });

      return ok({ artifact });
    }
  );

  server.registerTool(
    "list_artifacts",
    {
      title: "결과물 목록 조회",
      description: "보관되지 않은 결과물 목록을 반환합니다.",
      inputSchema: {},
    },
    async () => {
      const artifacts = await prisma.artifact.findMany({ where: { archivedAt: null } });
      return ok({ artifacts });
    }
  );

  server.registerTool(
    "get_artifact",
    {
      title: "결과물 상세 조회",
      description: "id로 결과물 상세 정보를 반환합니다.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const artifact = await prisma.artifact.findUnique({ where: { id } });
      if (!artifact) return err("결과물을 찾을 수 없습니다", "not_found");
      return ok({ artifact });
    }
  );
}
