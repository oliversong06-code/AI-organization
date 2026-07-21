import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import { resolveWorkspacePath, PathTraversalError } from "../../src/lib/path-guard";
import { submitReviewDecision, createRevisionVersion } from "../../src/lib/review/reviewWorkflow";
import { registerArtifactDirect, inferMimeType, inferFormat } from "../../src/lib/artifacts/registerArtifact";
import { importanceSchema } from "../../src/lib/enums";
import { ok, err } from "../lib/toolResult";

export function registerArtifactTools(server: McpServer) {
  server.registerTool(
    "register_artifact",
    {
      title: "결과물 등록",
      description:
        "업무 실행으로 생성된 파일을 workspace 안 경로로 등록합니다. 파일은 미리 workspace 안에 저장되어 있어야 하며, 이 도구는 파일을 새로 만들지 않습니다. 등록과 동시에 1번 버전(ArtifactVersion)이 생성되고 importance에 따른 검수 체인이 즉시 시작됩니다(적절한 검수자가 없으면 review_blocked로 표시됨) — 검수를 통과해야 최종 승인 상태가 됩니다.",
      inputSchema: {
        taskId: z.string().optional(),
        employeeId: z.string().optional().describe("작성자. 본인 결과물은 스스로 검수할 수 없습니다."),
        departmentId: z.string().optional().describe("생략하면 employeeId의 소속 부서로 자동 유도됩니다"),
        title: z.string().min(1),
        summary: z.string().optional(),
        filePath: z.string().min(1).describe("workspace 상대 경로, 예: workspace/artifacts/report.md"),
        sourceType: z.enum(["task_output", "manual_import", "external_sync", "excel_register"]).default("task_output"),
        importance: importanceSchema.default(2),
      },
    },
    async ({ taskId, employeeId, departmentId, title, summary, filePath, sourceType, importance }) => {
      const result = await registerArtifactDirect({
        taskId,
        employeeId,
        departmentId,
        title,
        summary,
        filePath,
        sourceType,
        importance,
      });
      if (!result.ok) return err(result.error, result.code);
      const artifact = await prisma.artifact.findUniqueOrThrow({ where: { id: result.artifactId } });
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

  server.registerTool(
    "submit_review_decision",
    {
      title: "검수 결정 제출",
      description:
        "배정된 검수 단계에 대해 승인/수정요청/반려 결정을 제출합니다. 호출자(reviewerEmployeeId)가 실제로 그 단계에 배정된 검수자여야 하며, 본인이 작성한 결과물은 검수할 수 없습니다. 승인이면 다음 검수 단계로 자동 진행되거나(더 없으면) 최종 승인 처리됩니다.",
      inputSchema: {
        reviewDecisionId: z.string().min(1),
        reviewerEmployeeId: z.string().min(1),
        outcome: z.enum(["approved", "revision_requested", "rejected"]),
        issuesFound: z.string().optional(),
        revisionRequest: z.string().optional(),
        decisionReason: z.string().optional(),
      },
    },
    async ({ reviewDecisionId, reviewerEmployeeId, outcome, issuesFound, revisionRequest, decisionReason }) => {
      const result = await submitReviewDecision(reviewDecisionId, reviewerEmployeeId, outcome, {
        issuesFound,
        revisionRequest,
        decisionReason,
      });
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );

  server.registerTool(
    "revise_artifact",
    {
      title: "결과물 수정본 등록",
      description:
        "수정 요청(revision_requested) 상태인 결과물의 새 버전을 등록합니다. 기존 파일을 덮어쓰지 않고 항상 새 버전으로 쌓이며, 등록과 동시에 검수 체인이 처음부터 다시 시작됩니다. 최대 수정 횟수를 넘기면 차단되지 않고 활동 로그에 알림만 남습니다.",
      inputSchema: {
        artifactId: z.string().min(1),
        filePath: z.string().min(1).describe("workspace 상대 경로 — 새 파일이어야 합니다"),
        authorEmployeeId: z.string().optional(),
      },
    },
    async ({ artifactId, filePath, authorEmployeeId }) => {
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

      const result = await createRevisionVersion(artifactId, {
        filePath,
        fileName,
        mimeType: inferMimeType(fileName),
        size: stat.size,
        format: inferFormat(fileName),
        authorEmployeeId,
      });
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );
}
