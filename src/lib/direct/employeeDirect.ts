import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import type { ActivityActor, Direction, EmployeeRank, RankAuthorizedBy } from "@/lib/enums";

export type DirectResult = { ok: true } | { ok: false; error: string; code: "not_found" };

export type RankChangeResult =
  | { ok: true }
  | { ok: false; error: string; code: "not_found" | "forbidden" };

interface UpdateEmployeeInput {
  name?: string;
  role?: string;
  departmentId?: string | null;
  avatarId?: string;
  skillIds?: string[];
}

/** Direct execution (no ApprovalRequest) — general info edits, including
 * department reassignment. Zone/seat placement is handled separately by
 * moveEmployee, so departmentId changes here never touch officeZoneId. */
export async function updateEmployee(
  id: string,
  data: UpdateEmployeeInput,
  actor: ActivityActor = "claude_code"
): Promise<DirectResult> {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "직원을 찾을 수 없습니다", code: "not_found" };

  const { skillIds, ...employeeFields } = data;

  await withTransaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: { ...employeeFields, version: { increment: 1 } },
    });

    if (skillIds) {
      await tx.employeeSkill.deleteMany({ where: { employeeId: id } });
      if (skillIds.length) {
        await tx.employeeSkill.createMany({
          data: skillIds.map((skillId) => ({ employeeId: id, skillId })),
        });
      }
    }

    await logActivity(tx, {
      actor,
      action: "employee.update",
      entityType: "employee",
      entityId: id,
      detail: { fields: Object.keys(data) },
    });
  });

  return { ok: true };
}

/** Direct execution — frees the current seat (if any), assigns the first
 * free seat in the target zone and snaps posX/posY to it so the character
 * renders aligned to a desk; falls back to (0.5, 0.5) when the target zone
 * is at capacity. */
export async function moveEmployee(
  id: string,
  newOfficeZoneId: string,
  direction?: Direction,
  actor: ActivityActor = "claude_code"
): Promise<DirectResult> {
  const existing = await prisma.employee.findUnique({ where: { id }, include: { seat: true } });
  if (!existing) return { ok: false, error: "직원을 찾을 수 없습니다", code: "not_found" };

  await withTransaction(async (tx) => {
    if (existing.seat) {
      await tx.seat.update({ where: { id: existing.seat.id }, data: { employeeId: null } });
    }

    const freeSeat = await tx.seat.findFirst({
      where: { officeZoneId: newOfficeZoneId, employeeId: null },
      orderBy: { index: "asc" },
    });

    await tx.employee.update({
      where: { id },
      data: {
        officeZoneId: newOfficeZoneId,
        posX: freeSeat ? freeSeat.normX : 0.5,
        posY: freeSeat ? freeSeat.normY : 0.5,
        direction: direction ?? existing.direction,
        version: { increment: 1 },
      },
    });

    if (freeSeat) {
      await tx.seat.update({ where: { id: freeSeat.id }, data: { employeeId: id } });
    }

    await logActivity(tx, {
      actor,
      action: "employee.move",
      entityType: "employee",
      entityId: id,
      detail: { from: existing.officeZoneId, to: newOfficeZoneId },
    });
  });

  return { ok: true };
}

/** User-direct-control only (no MCP tool) — frees the seat and archives. */
export async function archiveEmployee(id: string): Promise<DirectResult> {
  const existing = await prisma.employee.findUnique({ where: { id }, include: { seat: true } });
  if (!existing) return { ok: false, error: "직원을 찾을 수 없습니다", code: "not_found" };

  await withTransaction(async (tx) => {
    if (existing.seat) {
      await tx.seat.update({ where: { id: existing.seat.id }, data: { employeeId: null } });
    }
    await tx.employee.update({
      where: { id },
      data: { status: "archived", archivedAt: new Date(), version: { increment: 1 } },
    });
    await logActivity(tx, {
      actor: "user",
      action: "employee.archive",
      entityType: "employee",
      entityId: id,
    });
  });

  return { ok: true };
}

/**
 * Exposed both as the update_employee_rank MCP tool and the user-direct
 * /api/employees/[id]/rank route (which always calls with authorizedBy
 * fixed to "user"). When a rank-4 employee is the one raising/lowering a
 * rank, authorizingEmployeeId must name a DIFFERENT employee who is
 * actually rank 4 in the database right now — this is what makes
 * self-promotion structurally impossible rather than merely discouraged.
 */
export async function changeEmployeeRank(
  id: string,
  newRank: EmployeeRank,
  authorizedBy: RankAuthorizedBy,
  authorizingEmployeeId?: string
): Promise<RankChangeResult> {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "직원을 찾을 수 없습니다", code: "not_found" };

  if (authorizedBy === "rank4_employee") {
    if (!authorizingEmployeeId || authorizingEmployeeId === id) {
      return { ok: false, error: "본인 직급은 스스로 변경할 수 없습니다", code: "forbidden" };
    }
    const authorizer = await prisma.employee.findUnique({ where: { id: authorizingEmployeeId } });
    if (!authorizer || authorizer.rank !== 4 || authorizer.status === "archived") {
      return { ok: false, error: "직급 4 직원만 직급 변경을 승인할 수 있습니다", code: "forbidden" };
    }
  }

  const actor: ActivityActor = authorizedBy === "user" ? "user" : "claude_code";

  await withTransaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: { rank: newRank, version: { increment: 1 } },
    });
    await logActivity(tx, {
      actor,
      action: "employee.rank_change",
      entityType: "employee",
      entityId: id,
      detail: { from: existing.rank, to: newRank, authorizedBy, authorizingEmployeeId },
    });
  });

  return { ok: true };
}
