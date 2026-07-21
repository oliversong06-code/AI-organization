import os from "node:os";
import { prisma } from "../src/lib/prisma";
import { withTransaction } from "../src/lib/withTransaction";
import { logActivity } from "../src/lib/activity-log";
import { claimNextJob } from "./claimJob";
import { recoverStaleJobs } from "./staleLockRecovery";
import { realClaudeCliRunner, type ClaudeCliRunner } from "./claudeCliRunner";
import type { ExecutionJob } from "../src/generated/prisma/client";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const MAX_CONCURRENT = Number(process.env.WORKER_MAX_CONCURRENT ?? 2);
const STALE_CHECK_INTERVAL_MS = Number(process.env.WORKER_STALE_CHECK_INTERVAL_MS ?? 60000);

/** Runs exactly one already-claimed job to completion (or failure/retry).
 * Exported standalone so tests can exercise it with a mock runner without
 * spinning up the polling loop. */
export async function runJob(
  job: Pick<ExecutionJob, "id" | "taskId" | "attempts" | "maxAttempts">,
  runner: ClaudeCliRunner,
  cwd: string
): Promise<void> {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: job.taskId } });

  await prisma.executionJob.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date(), lockedAt: new Date() },
  });

  const result = await runner.run({
    taskId: task.id,
    title: task.title,
    description: task.description,
    cwd,
  });

  if (result.ok) {
    await prisma.executionJob.update({
      where: { id: job.id },
      data: { status: "completed", completedAt: new Date() },
    });
    return;
  }

  const nextAttempts = job.attempts + 1;
  if (nextAttempts >= job.maxAttempts) {
    await withTransaction(async (tx) => {
      await tx.executionJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          attempts: nextAttempts,
          lastError: result.error,
          completedAt: new Date(),
        },
      });
      const current = await tx.task.findUnique({ where: { id: job.taskId } });
      if (current && current.status !== "completed" && current.status !== "failed") {
        await tx.task.update({
          where: { id: job.taskId },
          data: { status: "failed", errorMessage: result.error, version: { increment: 1 } },
        });
      }
      await logActivity(tx, {
        actor: "system",
        action: "task.worker_exhausted",
        entityType: "task",
        entityId: job.taskId,
        detail: { jobId: job.id, attempts: nextAttempts, error: result.error },
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
        lastError: result.error,
      },
    });
  }
}

export interface WorkerLoopOptions {
  runner?: ClaudeCliRunner;
  cwd?: string;
  signal?: AbortSignal;
  maxConcurrent?: number;
  pollIntervalMs?: number;
  staleCheckIntervalMs?: number;
}

/** Polls for pending ExecutionJobs and runs up to `maxConcurrent` at once.
 * Never throws on a single job's failure — a bad job fails that job (and,
 * once retries are exhausted, its Task), not the whole worker process. */
export async function runWorkerLoop(options: WorkerLoopOptions = {}): Promise<void> {
  const runner = options.runner ?? realClaudeCliRunner;
  const cwd = options.cwd ?? process.cwd();
  const maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const staleCheckIntervalMs = options.staleCheckIntervalMs ?? STALE_CHECK_INTERVAL_MS;
  const workerId = `${os.hostname()}-${process.pid}`;
  const inFlight = new Set<string>();
  let lastStaleCheck = 0;

  while (!options.signal?.aborted) {
    if (Date.now() - lastStaleCheck > staleCheckIntervalMs) {
      await recoverStaleJobs();
      lastStaleCheck = Date.now();
    }

    while (inFlight.size < maxConcurrent) {
      const job = await claimNextJob(workerId);
      if (!job) break;
      inFlight.add(job.id);
      runJob(job, runner, cwd).finally(() => inFlight.delete(job.id));
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
