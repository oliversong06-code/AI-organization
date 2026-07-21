import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { runJob } from "./runWorker";
import type { ClaudeCliRunner } from "./claudeCliRunner";

const taskIds = new Set<string>();

afterAll(async () => {
  await prisma.executionJob.deleteMany({ where: { taskId: { in: [...taskIds] } } });
  await prisma.task.deleteMany({ where: { id: { in: [...taskIds] } } });
});

async function makeQueuedJob(maxAttempts = 3, attempts = 0) {
  const task = await prisma.task.create({
    data: {
      title: "runJob 테스트 업무",
      description: "설명",
      collaboratingEmployeeIds: [],
      status: "queued",
      inputFiles: [],
      requiredSkills: [],
      requestedPermissions: [],
    },
  });
  taskIds.add(task.id);
  const job = await prisma.executionJob.create({
    data: { taskId: task.id, status: "claimed", attempts, maxAttempts },
  });
  return { task, job };
}

const okRunner: ClaudeCliRunner = { run: async () => ({ ok: true }) };
const failRunner: ClaudeCliRunner = { run: async () => ({ ok: false, error: "claude CLI를 찾을 수 없습니다" }) };

describe("runJob (test.db only, mocked ClaudeCliRunner — never spawns a real process)", () => {
  it("marks the job completed when the runner succeeds", async () => {
    const { job } = await makeQueuedJob();
    await runJob(job, okRunner, process.cwd());
    const updated = await prisma.executionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("completed");
    expect(updated.completedAt).not.toBeNull();
  });

  it("requeues the job (attempts+1) when the runner fails and attempts remain", async () => {
    const { job } = await makeQueuedJob(3, 0);
    await runJob(job, failRunner, process.cwd());
    const updated = await prisma.executionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("pending");
    expect(updated.attempts).toBe(1);
    expect(updated.lastError).toBe("claude CLI를 찾을 수 없습니다");
  });

  it("fails the job and the task once maxAttempts is exhausted", async () => {
    const { task, job } = await makeQueuedJob(1, 0);
    await runJob(job, failRunner, process.cwd());

    const updatedJob = await prisma.executionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updatedJob.status).toBe("failed");

    const updatedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updatedTask.status).toBe("failed");
    expect(updatedTask.errorMessage).toBe("claude CLI를 찾을 수 없습니다");
  });

  it("does not overwrite a task that already reached a terminal state itself", async () => {
    const { task, job } = await makeQueuedJob(1, 0);
    // Simulate the spawned CLI having already called complete_task itself
    // before the runner promise resolves (edge case: CLI finishes but the
    // wrapper process reports a non-zero exit anyway).
    await prisma.task.update({ where: { id: task.id }, data: { status: "completed" } });

    await runJob(job, failRunner, process.cwd());

    const updatedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updatedTask.status).toBe("completed");
  });
});
