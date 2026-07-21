import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { recoverStaleJobs } from "./staleLockRecovery";

const taskIds = new Set<string>();

afterAll(async () => {
  await prisma.executionJob.deleteMany({ where: { taskId: { in: [...taskIds] } } });
  await prisma.task.deleteMany({ where: { id: { in: [...taskIds] } } });
});

async function makeRunningJob(attempts: number, maxAttempts: number, lockedAt: Date) {
  const task = await prisma.task.create({
    data: {
      title: "stale 복구 테스트 업무",
      description: "설명",
      collaboratingEmployeeIds: [],
      status: "running",
      inputFiles: [],
      requiredSkills: [],
      requestedPermissions: [],
    },
  });
  taskIds.add(task.id);
  const job = await prisma.executionJob.create({
    data: { taskId: task.id, status: "running", attempts, maxAttempts, lockedAt, workerId: "dead-worker" },
  });
  return { task, job };
}

describe("recoverStaleJobs (test.db only)", () => {
  it("requeues a stale job under maxAttempts", async () => {
    const staleTime = new Date(Date.now() - 20 * 60 * 1000);
    const { job } = await makeRunningJob(0, 3, staleTime);

    const count = await recoverStaleJobs(10 * 60 * 1000);
    expect(count).toBeGreaterThanOrEqual(1);

    const updated = await prisma.executionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("pending");
    expect(updated.attempts).toBe(1);
    expect(updated.workerId).toBeNull();
    expect(updated.lockedAt).toBeNull();
  });

  it("fails the job and the task once maxAttempts is exhausted", async () => {
    const staleTime = new Date(Date.now() - 20 * 60 * 1000);
    const { task, job } = await makeRunningJob(2, 3, staleTime);

    await recoverStaleJobs(10 * 60 * 1000);

    const updatedJob = await prisma.executionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updatedJob.status).toBe("failed");
    expect(updatedJob.attempts).toBe(3);

    const updatedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updatedTask.status).toBe("failed");
    expect(updatedTask.errorMessage).not.toBeNull();
  });

  it("leaves a fresh (non-stale) running job untouched", async () => {
    const { job } = await makeRunningJob(0, 3, new Date());
    await recoverStaleJobs(10 * 60 * 1000);
    const unchanged = await prisma.executionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(unchanged.status).toBe("running");
  });
});
