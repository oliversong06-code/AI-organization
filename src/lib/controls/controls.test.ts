import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { applyTaskUserControl } from "./taskControl";
import { applyAutomationUserControl } from "./automationControl";

const taskIds = new Set<string>();
const automationIds = new Set<string>();

afterAll(async () => {
  await prisma.task.deleteMany({ where: { id: { in: [...taskIds] } } });
  await prisma.automation.deleteMany({ where: { id: { in: [...automationIds] } } });
});

async function makeTask(status: string) {
  const task = await prisma.task.create({
    data: {
      title: "제어 테스트 업무",
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

describe("applyTaskUserControl (test.db only)", () => {
  it("pauses a running task and records statusBeforePause", async () => {
    const task = await makeTask("running");
    const result = await applyTaskUserControl(task.id, "pause");
    expect(result.ok).toBe(true);
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("paused");
    expect(updated.statusBeforePause).toBe("running");
  });

  it("resumes back to the pre-pause status", async () => {
    const task = await makeTask("running");
    await applyTaskUserControl(task.id, "pause");
    const result = await applyTaskUserControl(task.id, "resume");
    expect(result.ok).toBe(true);
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("running");
    expect(updated.statusBeforePause).toBeNull();
  });

  it("rejects an illegal transition (archive from running)", async () => {
    const task = await makeTask("running");
    const result = await applyTaskUserControl(task.id, "archive");
    expect(result).toMatchObject({ ok: false, code: "invalid_state" });
  });

  it("allows archive from a terminal state", async () => {
    const task = await makeTask("completed");
    const result = await applyTaskUserControl(task.id, "archive");
    expect(result.ok).toBe(true);
  });
});

describe("applyAutomationUserControl (test.db only)", () => {
  async function makeAutomation(enabled: boolean) {
    const automation = await prisma.automation.create({
      data: {
        name: "제어 테스트 자동화",
        taskInstruction: "설명",
        scheduleType: "manual",
        requiredSkills: [],
        requiredIntegrations: [],
        outputFormat: "file",
        enabled,
      },
    });
    automationIds.add(automation.id);
    return automation;
  }

  it("pauses an enabled automation", async () => {
    const automation = await makeAutomation(true);
    const result = await applyAutomationUserControl(automation.id, "pause");
    expect(result.ok).toBe(true);
    const updated = await prisma.automation.findUniqueOrThrow({ where: { id: automation.id } });
    expect(updated.enabled).toBe(false);
  });

  it("rejects pausing an already-paused automation", async () => {
    const automation = await makeAutomation(false);
    const result = await applyAutomationUserControl(automation.id, "pause");
    expect(result).toMatchObject({ ok: false, code: "invalid_state" });
  });

  it("archives an automation and blocks further control", async () => {
    const automation = await makeAutomation(true);
    await applyAutomationUserControl(automation.id, "archive");
    const result = await applyAutomationUserControl(automation.id, "resume");
    expect(result).toMatchObject({ ok: false, code: "invalid_state" });
  });
});
