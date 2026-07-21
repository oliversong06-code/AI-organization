import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import { canApplyUserControlTransition, type UserControlTransition } from "@/lib/taskTransitions";
import type { TaskStatus } from "@/lib/enums";

export type ControlResult =
  | { ok: true }
  | { ok: false; error: string; code: "not_found" | "invalid_state" };

/**
 * User-direct-control only: pause/resume/cancel/archive a Task that
 * already exists. No MCP tool calls this — it's wired exclusively to the
 * confirm-dialog buttons in the web UI (see src/app/api/tasks/[id]/*).
 * Every transition is checked against the single shared state table in
 * taskTransitions.ts so the same rule applies whether the click comes from
 * the UI or (in a future admin script) directly.
 */
export async function applyTaskUserControl(
  taskId: string,
  transition: UserControlTransition
): Promise<ControlResult> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "업무를 찾을 수 없습니다", code: "not_found" };

  const currentStatus = task.status as TaskStatus;
  if (!canApplyUserControlTransition(transition, currentStatus)) {
    return {
      ok: false,
      error: `현재 상태(${currentStatus})에서는 ${transition}를 적용할 수 없습니다`,
      code: "invalid_state",
    };
  }

  await withTransaction(async (tx) => {
    if (transition === "pause") {
      await tx.task.update({
        where: { id: taskId },
        data: { status: "paused", statusBeforePause: currentStatus, version: { increment: 1 } },
      });
    } else if (transition === "resume") {
      const target = (task.statusBeforePause as TaskStatus | null) ?? "queued";
      await tx.task.update({
        where: { id: taskId },
        data: { status: target, statusBeforePause: null, version: { increment: 1 } },
      });
    } else if (transition === "cancel") {
      await tx.task.update({
        where: { id: taskId },
        data: { status: "cancelled", version: { increment: 1 } },
      });
    } else if (transition === "archive") {
      await tx.task.update({
        where: { id: taskId },
        data: { status: "archived", version: { increment: 1 } },
      });
    }
    await logActivity(tx, {
      actor: "user",
      action: `task.${transition}`,
      entityType: "task",
      entityId: taskId,
      detail: { from: currentStatus },
    });
  });

  return { ok: true };
}
