import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import { resolveApprovedExternalPath, resolveWorkspacePath } from "@/lib/path-guard";

/** Manifest schema from IMPLEMENTATION_PLAN §13. Never trust an imported
 * file blindly — always validated before anything is created from it. */
export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  automationId: z.string().min(1).nullable().optional(),
  taskId: z.string().min(1).nullable().optional(),
  employeeId: z.string().min(1).nullable().optional(),
  status: z.enum(["completed", "failed"]),
  title: z.string().min(1),
  summary: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  artifacts: z
    .array(
      z.object({
        fileName: z.string().min(1),
        title: z.string().optional(),
        summary: z.string().optional(),
      })
    )
    .default([]),
  logs: z.array(z.string()).default([]),
  error: z.string().nullable().optional(),
});

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

function guessMime(fileName: string): string {
  return MIME_BY_EXT[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

export interface ScanResult {
  scanned: number;
  imported: number;
  skipped: number;
  invalid: number;
}

/**
 * Scans an approved, read-only external sync folder for manifest.json
 * files, validates each against manifestSchema, and imports any whose
 * runId hasn't been seen before (ImportedManifest.runId is unique — the
 * dedup mechanism). Artifact files referenced by an imported manifest are
 * copied into workspace/artifacts (the only writable location); the
 * external folder itself is never written to.
 */
export async function scanIntegrationForManifests(integrationId: string): Promise<ScanResult> {
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!integration || integration.status !== "configured") {
    throw new Error("연동이 승인되어 구성된 상태가 아닙니다");
  }
  const config = integration.config as { syncFolderPath?: string };
  if (!config.syncFolderPath) {
    throw new Error("동기화 폴더가 설정되지 않았습니다");
  }

  let entries: string[];
  try {
    const folderAbs = resolveApprovedExternalPath(config.syncFolderPath, ".");
    entries = await fs.readdir(folderAbs);
  } catch {
    return { scanned: 0, imported: 0, skipped: 0, invalid: 0 };
  }

  const manifestFiles = entries.filter((f) => f.endsWith("manifest.json"));
  const result: ScanResult = { scanned: manifestFiles.length, imported: 0, skipped: 0, invalid: 0 };

  for (const file of manifestFiles) {
    const outcome = await importOneManifest(config.syncFolderPath, file);
    result[outcome]++;
  }

  await prisma.integration.update({ where: { id: integrationId }, data: { lastCheckedAt: new Date() } });
  return result;
}

async function importOneManifest(
  syncFolderPath: string,
  file: string
): Promise<"imported" | "skipped" | "invalid"> {
  const raw = await fs
    .readFile(resolveApprovedExternalPath(syncFolderPath, file), "utf-8")
    .catch(() => null);
  if (!raw) return "invalid";

  let parsed: z.infer<typeof manifestSchema>;
  try {
    parsed = manifestSchema.parse(JSON.parse(raw));
  } catch {
    return "invalid";
  }

  const existing = await prisma.importedManifest.findUnique({ where: { runId: parsed.runId } });
  if (existing) return "skipped";

  const createdArtifactIds: string[] = [];

  await withTransaction(async (tx) => {
    for (const art of parsed.artifacts) {
      const srcAbs = resolveApprovedExternalPath(syncFolderPath, art.fileName);
      const destRelative = `workspace/artifacts/${parsed.runId}-${art.fileName}`;
      const destAbs = resolveWorkspacePath(destRelative);
      await fs.mkdir(path.dirname(destAbs), { recursive: true });
      await fs.copyFile(srcAbs, destAbs);
      const stat = await fs.stat(destAbs);
      const created = await tx.artifact.create({
        data: {
          taskId: parsed.taskId ?? undefined,
          employeeId: parsed.employeeId ?? undefined,
          title: art.title ?? parsed.title,
          summary: art.summary,
          fileName: art.fileName,
          filePath: destRelative,
          mimeType: guessMime(art.fileName),
          size: stat.size,
          sourceType: "external_sync",
          externalSourceId: parsed.runId,
        },
      });
      createdArtifactIds.push(created.id);
    }

    await tx.importedManifest.create({
      data: {
        runId: parsed.runId,
        automationId: parsed.automationId ?? undefined,
        sourceFilePath: file,
        rawPayload: parsed,
        status: "imported",
        createdArtifactIds,
      },
    });

    if (parsed.automationId) {
      await tx.automationRun.create({
        data: {
          automationId: parsed.automationId,
          runId: parsed.runId,
          source: "external_import",
          status: parsed.status,
          summary: parsed.summary,
          errorMessage: parsed.error ?? undefined,
          startedAt: parsed.startedAt ? new Date(parsed.startedAt) : undefined,
          completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
        },
      });
    }

    await logActivity(tx, {
      actor: "system",
      action: "manifest.import",
      detail: { runId: parsed.runId, artifacts: createdArtifactIds.length },
    });
  });

  return "imported";
}
