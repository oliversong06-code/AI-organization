import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addTaskLog, completeTask, failTask, markTaskNeedsReview, startTask } from "./taskExecution";

const taskIds = new Set<string>();
afterAll(async () => {
  await prisma.taskLog.deleteMany({ where: { taskId: { in: [...taskIds] } } });
  await prisma.task.deleteMany({ where: { id: { in: [...taskIds] } } });
});

async function makeTask(status: string) {
  const task = await prisma.task.create({
    data: {
      title: "실행 테스트 업무",
      description: "설명",
      collaboratingEmployeeIds: [],
      status,
      inputFiles: [],
      requiredSkills: [],
      requestedPermissions: [],
    },
  });
  taskIds.add(task.id);
  return task;
}

describe("taskExecution (test.db only) — MCP execution-only transitions", () => {
  it("starts a queued task", async () => {
    const task = await makeTask("queued");
    const result = await startTask(task.id);
    expect(result.ok).toBe(true);
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("running");
    expect(updated.startedAt).not.toBeNull();
  });

  it("refuses to start a task that isn't queued", async () => {
    const task = await makeTask("completed");
    const result = await startTask(task.id);
    expect(result).toMatchObject({ ok: false, code: "invalid_state" });
  });

  it("records a log without changing status", async () => {
    const task = await makeTask("running");
    const result = await addTaskLog(task.id, "진행 중입니다", "info");
    expect(result.ok).toBe(true);
    const log = await prisma.taskLog.findFirstOrThrow({ where: { taskId: task.id } });
    expect(log.message).toBe("진행 중입니다");
    const unchanged = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.status).toBe("running");
  });

  it("moves a running task to needs_review", async () => {
    const task = await makeTask("running");
    const result = await markTaskNeedsReview(task.id);
    expect(result.ok).toBe(true);
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("needs_review");
  });

  it("completes a running task with a result summary", async () => {
    const task = await makeTask("running");
    const result = await completeTask(task.id, "완료했습니다");
    expect(result.ok).toBe(true);
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("completed");
    expect(updated.progress).toBe(100);
    expect(updated.resultSummary).toBe("완료했습니다");
  });

  it("fails a needs_review task and records the error honestly", async () => {
    const task = await makeTask("needs_review");
    const result = await failTask(task.id, "API 키가 만료되었습니다", true);
    expect(result.ok).toBe(true);
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("failed");
    expect(updated.errorMessage).toBe("API 키가 만료되었습니다");
    expect(updated.retryable).toBe(true);
  });

  it("refuses complete_task on an already-completed task", async () => {
    const task = await makeTask("completed");
    const result = await completeTask(task.id);
    expect(result).toMatchObject({ ok: false, code: "invalid_state" });
  });
});
