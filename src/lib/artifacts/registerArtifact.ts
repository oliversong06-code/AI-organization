import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import { resolveWorkspacePath, PathTraversalError } from "@/lib/path-guard";
import { startReviewForVersion } from "@/lib/review/reviewWorkflow";
import type { ArtifactSourceType } from "@/lib/enums";

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

const FORMAT_BY_EXT: Record<string, string> = {
  ".md": "markdown",
  ".pdf": "pdf",
  ".xlsx": "xlsx",
  ".csv": "csv",
};

export function inferMimeType(fileName: string): string {
  return MIME_BY_EXT[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

export function inferFormat(fileName: string): string {
  return FORMAT_BY_EXT[path.extname(fileName).toLowerCase()] ?? "other";
}

export interface RegisterArtifactInput {
  taskId?: string;
  employeeId?: string;
  departmentId?: string;
  title: string;
  summary?: string;
  filePath: string;
  sourceType: ArtifactSourceType;
  importance?: number;
}

export type RegisterArtifactResult =
  | { ok: true; artifactId: string }
  | { ok: false; error: string; code: "invalid_path" | "file_not_found" };

/**
 * Shared by both the register_artifact MCP tool and the
 * completeTaskWithDocument execution path (P2-6) — creates the Artifact
 * row AND its first ArtifactVersion, then immediately starts the review
 * chain in the same transaction. Before P2-5 this only created a bare
 * Artifact row and relied on the schema's `currentReviewStatus` default of
 * "approved", which silently skipped review for every artifact; this is
 * the one place that behavior is fixed, so nothing should create an
 * Artifact row by any other path.
 */
export async function registerArtifactDirect(input: RegisterArtifactInput): Promise<RegisterArtifactResult> {
  let absolutePath: string;
  try {
    absolutePath = resolveWorkspacePath(input.filePath);
  } catch (e) {
    if (e instanceof PathTraversalError) return { ok: false, error: e.message, code: "invalid_path" };
    throw e;
  }

  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return { ok: false, error: `파일을 찾을 수 없습니다: ${input.filePath}`, code: "file_not_found" };
  }

  const fileName = path.basename(input.filePath);
  const mimeType = inferMimeType(fileName);
  const format = inferFormat(fileName);
  const importance = input.importance ?? 2;

  let resolvedDepartmentId = input.departmentId ?? null;
  if (!resolvedDepartmentId && input.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    resolvedDepartmentId = employee?.departmentId ?? null;
  }

  const artifactId = await withTransaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        taskId: input.taskId,
        employeeId: input.employeeId,
        departmentId: resolvedDepartmentId,
        title: input.title,
        summary: input.summary,
        fileName,
        filePath: input.filePath,
        mimeType,
        size: stat.size,
        sourceType: input.sourceType,
        importance,
        currentReviewStatus: "pending",
      },
    });
    const version = await tx.artifactVersion.create({
      data: {
        artifactId: created.id,
        versionNumber: 1,
        filePath: input.filePath,
        fileName,
        mimeType,
        size: stat.size,
        format,
        authorEmployeeId: input.employeeId,
        reviewStatus: "pending",
      },
    });
    await logActivity(tx, {
      actor: "claude_code",
      action: "artifact.register",
      entityType: "artifact",
      entityId: created.id,
      detail: { taskId: input.taskId, employeeId: input.employeeId },
    });

    await startReviewForVersion(tx, {
      artifactId: created.id,
      artifactVersionId: version.id,
      authorEmployeeId: input.employeeId ?? null,
      departmentId: resolvedDepartmentId,
      importance,
    });

    return created.id;
  });

  return { ok: true, artifactId };
}
