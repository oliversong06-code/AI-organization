import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";

export type ControlResult = { ok: true } | { ok: false; error: string; code: "not_found" | "invalid_state" };

/** User-direct-control only (no MCP tool) — soft-archive, never delete. */
export async function archiveArtifact(artifactId: string): Promise<ControlResult> {
  const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!artifact) return { ok: false, error: "결과물을 찾을 수 없습니다", code: "not_found" };
  if (artifact.archivedAt) return { ok: false, error: "이미 보관되었습니다", code: "invalid_state" };

  await withTransaction(async (tx) => {
    await tx.artifact.update({ where: { id: artifactId }, data: { archivedAt: new Date() } });
    await logActivity(tx, {
      actor: "user",
      action: "artifact.archive",
      entityType: "artifact",
      entityId: artifactId,
    });
  });
  return { ok: true };
}
