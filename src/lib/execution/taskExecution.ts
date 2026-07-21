import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import { canApplyMcpTransition, mcpTransitionTarget, type McpExecutionTransition } from "@/lib/taskTransitions";
import type { TaskStatus } from "@/lib/enums";

export type ExecutionResult =
  | { ok: true }
  | { ok: false; error: string; code: "not_found" | "invalid_state" };

/**
 * MCP-only task execution transitions (start/needs_review/complete/fail) —
 * the only Task mutations Claude Code can perform without going through
 * ApprovalRequest, because they only ever apply to a Task that was already
 * approved into existence. Shares taskTransitions.ts's rule table with the
 * user-direct-control routes (step 10) and propose_task archive check.
 */
async function applyTransition(
  taskId: string,
  transition: McpExecutionTransition,
  extraData: Record<string, unknown> = {}
): Promise<ExecutionResult> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "업무를 찾을 수 없습니다", code: "not_found" };

  const currentStatus = task.status as TaskStatus;
  if (!canApplyMcpTransition(transition, currentStatus)) {
    return {
      ok: false,
      error: `현재 상태(${currentStatus})에서는 ${transition}을 적용할 수 없습니다`,
      code: "invalid_state",
    };
  }

  const target = mcpTransitionTarget(transition);
  await withTransaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: target,
        version: { increment: 1 },
        ...extraData,
      },
    });
    await logActivity(tx, {
      actor: "claude_code",
      action: `task.${transition}`,
      entityType: "task",
      entityId: taskId,
      detail: { from: currentStatus, to: target },
    });
  });

  return { ok: true };
}

export function startTask(taskId: string) {
  return applyTransition(taskId, "start_task", { startedAt: new Date() });
}

export function markTaskNeedsReview(taskId: string) {
  return applyTransition(taskId, "mark_task_needs_review");
}

export function completeTask(taskId: string, resultSummary?: string) {
  return applyTransition(taskId, "complete_task", {
    completedAt: new Date(),
    progress: 100,
    resultSummary,
  });
}

export function failTask(taskId: string, errorMessage: string, retryable = false) {
  return applyTransition(taskId, "fail_task", { completedAt: new Date(), errorMessage, retryable });
}

export async function addTaskLog(
  taskId: string,
  message: string,
  level: "info" | "warn" | "error" = "info"
): Promise<ExecutionResult> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "업무를 찾을 수 없습니다", code: "not_found" };

  await withTransaction(async (tx) => {
    await tx.taskLog.create({ data: { taskId, level, message } });
  });
  return { ok: true };
}
