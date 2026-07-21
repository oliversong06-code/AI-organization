import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import type { ActivityActor } from "@/lib/enums";

export type DirectResult = { ok: true } | { ok: false; error: string; code: "not_found" };

interface UpdateDepartmentInput {
  name?: string;
  description?: string;
  colorTag?: string;
  officeZoneId?: string | null;
}

/** Direct execution (no ApprovalRequest) — general info edits and zone
 * reassignment. Keeps the assigned zone's displayName in sync with the
 * department name; moving zones reverts the old zone's label back to its
 * default. Callable both from the MCP update_department tool (actor
 * claude_code) and, in principle, a future settings UI (actor user). */
export async function updateDepartment(
  id: string,
  data: UpdateDepartmentInput,
  actor: ActivityActor = "claude_code"
): Promise<DirectResult> {
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "부서를 찾을 수 없습니다", code: "not_found" };

  await withTransaction(async (tx) => {
    const zoneChanged =
      data.officeZoneId !== undefined && data.officeZoneId !== existing.officeZoneId;

    await tx.department.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });

    const newName = data.name ?? existing.name;

    if (zoneChanged && existing.officeZoneId) {
      await tx.officeZone.update({ where: { id: existing.officeZoneId }, data: { displayName: null } });
    }
    const currentZoneId = zoneChanged ? data.officeZoneId : existing.officeZoneId;
    if (currentZoneId) {
      await tx.officeZone.update({ where: { id: currentZoneId }, data: { displayName: newName } });
    }

    await logActivity(tx, {
      actor,
      action: "department.update",
      entityType: "department",
      entityId: id,
      detail: { fields: Object.keys(data) },
    });
  });

  return { ok: true };
}

/** User-direct-control only (no MCP tool) — archiving reverts the zone's
 * display label to its default and frees the zone for reassignment. */
export async function archiveDepartment(id: string): Promise<DirectResult> {
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "부서를 찾을 수 없습니다", code: "not_found" };

  await withTransaction(async (tx) => {
    await tx.department.update({
      where: { id },
      data: { status: "archived", archivedAt: new Date(), officeZoneId: null, version: { increment: 1 } },
    });
    if (existing.officeZoneId) {
      await tx.officeZone.update({ where: { id: existing.officeZoneId }, data: { displayName: null } });
    }
    await logActivity(tx, {
      actor: "user",
      action: "department.archive",
      entityType: "department",
      entityId: id,
    });
  });

  return { ok: true };
}
