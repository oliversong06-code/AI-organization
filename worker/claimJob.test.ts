import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { claimNextJob } from "./claimJob";

const taskIds = new Set<string>();

afterAll(async () => {
  await prisma.executionJob.deleteMany({ where: { taskId: { in: [...taskIds] } } });
  await prisma.task.deleteMany({ where: { id: { in: [...taskIds] } } });
});

async function makeQueuedTaskWithJob() {
  const task = await prisma.task.create({
    data: {
      title: "claim 테스트 업무",
      description: "설명",
      collaboratingEmployeeIds: [],
      status: "queued",
      inputFiles: [],
      requiredSkills: [],
      requestedPermissions: [],
    },
  });
  taskIds.add(task.id);
  const job = await prisma.executionJob.create({ data: { taskId: task.id, status: "pending" } });
  return { task, job };
}

describe("claimNextJob (test.db only)", () => {
  it("claims the oldest pending job and marks it claimed", async () => {
    const { job } = await makeQueuedTaskWithJob();
    const claimed = await claimNextJob("worker-a");
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("claimed");
    expect(claimed?.workerId).toBe("worker-a");
    expect(claimed?.lockedAt).not.toBeNull();
  });

  it("claims two distinct pending jobs across two calls, never the same one twice", async () => {
    await prisma.executionJob.updateMany({ where: {}, data: { status: "completed" } });
    const { job: jobA } = await makeQueuedTaskWithJob();
    const { job: jobB } = await makeQueuedTaskWithJob();

    const first = await claimNextJob("worker-a");
    const second = await claimNextJob("worker-b");

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.id).not.toBe(second?.id);
    expect([first?.id, second?.id].sort()).toEqual([jobA.id, jobB.id].sort());
  });

  it("returns null when there are no pending jobs", async () => {
    await prisma.executionJob.updateMany({ where: {}, data: { status: "completed" } });
    const result = await claimNextJob("worker-a");
    expect(result).toBeNull();
  });
});
