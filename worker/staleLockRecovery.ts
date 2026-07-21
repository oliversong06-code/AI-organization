import { prisma } from "../src/lib/prisma";
import { withTransaction } from "../src/lib/withTransaction";
import { logActivity } from "../src/lib/activity-log";

const DEFAULT_STALE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Requeues ExecutionJobs whose `lockedAt` is older than `staleMs` — the
 * worker that claimed them presumably crashed or hung. Under maxAttempts,
 * the job goes back to "pending" with attempts incremented so the poll
 * loop retries it; once exhausted, the job is marked "failed" and (unless
 * the Task somehow already reached a terminal state on its own) the Task
 * itself is failed too, since otherwise it would sit "running" forever
 * with no worker left watching it.
 */
export async function recoverStaleJobs(staleMs: number = DEFAULT_STALE_MS): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  const staleJobs = await prisma.executionJob.findMany({
    where: { status: { in: ["claimed", "running"] }, lockedAt: { lt: cutoff } },
  });

  for (const job of staleJobs) {
    const nextAttempts = job.attempts + 1;

    if (nextAttempts >= job.maxAttempts) {
      await withTransaction(async (tx) => {
        await tx.executionJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            attempts: nextAttempts,
            lastError: "오래된 lock 복구 — 재시도 횟수 초과",
            completedAt: new Date(),
          },
        });
        const task = await tx.task.findUnique({ where: { id: job.taskId } });
        if (task && task.status !== "completed" && task.status !== "failed") {
          await tx.task.update({
            where: { id: job.taskId },
            data: {
              status: "failed",
              errorMessage: "Worker가 응답하지 않아 재시도 횟수를 초과했습니다",
              version: { increment: 1 },
            },
          });
        }
        await logActivity(tx, {
          actor: "system",
          action: "task.worker_exhausted",
          entityType: "task",
          entityId: job.taskId,
          detail: { jobId: job.id, attempts: nextAttempts },
        });
      });
    } else {
      await prisma.executionJob.update({
        where: { id: job.id },
        data: {
          status: "pending",
          attempts: nextAttempts,
          workerId: null,
          lockedAt: null,
          lastError: "오래된 lock 복구",
        },
      });
    }
  }

  return staleJobs.length;
}
