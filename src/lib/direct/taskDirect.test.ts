import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTask, updateTask, assignTask } from "./taskDirect";

const taskIds = new Set<string>();
const employeeIds = new Set<string>();
const zoneKeys = ["test-task-direct-zone"];
const zoneIds: Record<string, string> = {};

afterAll(async () => {
  await prisma.executionJob.deleteMany({ where: { taskId: { in: [...taskIds] } } });
  await prisma.task.deleteMany({ where: { id: { in: [...taskIds] } } });
  await prisma.employee.deleteMany({ where: { id: { in: [...employeeIds] } } });
  await prisma.officeZone.deleteMany({ where: { key: { in: zoneKeys } } });
});

async function ensureZone() {
  if (zoneIds[zoneKeys[0]]) return zoneIds[zoneKeys[0]];
  const zone = await prisma.officeZone.upsert({
    where: { key: zoneKeys[0] },
    update: {},
    create: {
      key: zoneKeys[0],
      name: zoneKeys[0],
      kind: "open_workspace",
      rectNormX0: 0,
      rectNormY0: 0,
      rectNormX1: 1,
      rectNormY1: 1,
    },
  });
  zoneIds[zoneKeys[0]] = zone.id;
  return zone.id;
}

async function makeEmployee(status: "idle" | "archived" = "idle") {
  const zoneId = await ensureZone();
  const employee = await prisma.employee.create({
    data: {
      name: "업무 배정 테스트 직원",
      role: "역할",
      status,
      officeZoneId: zoneId,
      posX: 0.5,
      posY: 0.5,
      avatarId: "avatar-01",
    },
  });
  employeeIds.add(employee.id);
  return employee;
}

describe("createTask (test.db only)", () => {
  it("creates a queued task with no ExecutionJob when unassigned", async () => {
    const result = await createTask({ title: "제목", description: "설명" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    taskIds.add(result.taskId);

    const task = await prisma.task.findUniqueOrThrow({ where: { id: result.taskId } });
    expect(task.status).toBe("queued");
    const jobs = await prisma.executionJob.findMany({ where: { taskId: result.taskId } });
    expect(jobs).toHaveLength(0);
  });

  it("creates a pending ExecutionJob when assigned to a valid employee", async () => {
    const employee = await makeEmployee();
    const result = await createTask({
      title: "제목",
      description: "설명",
      assignedEmployeeId: employee.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    taskIds.add(result.taskId);

    const jobs = await prisma.executionJob.findMany({ where: { taskId: result.taskId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("pending");
  });

  it("rejects assignment to a nonexistent employee", async () => {
    const result = await createTask({
      title: "제목",
      description: "설명",
      assignedEmployeeId: "nonexistent-id",
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_employee" });
  });

  it("rejects assignment to an archived employee", async () => {
    const employee = await makeEmployee("archived");
    const result = await createTask({
      title: "제목",
      description: "설명",
      assignedEmployeeId: employee.id,
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_employee" });
  });
});

describe("updateTask (test.db only)", () => {
  it("updates general fields and increments version", async () => {
    const created = await createTask({ title: "원래 제목", description: "원래 설명" });
    if (!created.ok) throw new Error("setup failed");
    taskIds.add(created.taskId);

    const result = await updateTask(created.taskId, { title: "새 제목", priority: "high" });
    expect(result.ok).toBe(true);
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: created.taskId } });
    expect(updated.title).toBe("새 제목");
    expect(updated.priority).toBe("high");
    expect(updated.version).toBe(2);
  });

  it("returns not_found for a missing task", async () => {
    const result = await updateTask("nonexistent-id", { title: "x" });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("assignTask (test.db only)", () => {
  it("assigns an employee and creates a job for a queued task with none yet", async () => {
    const created = await createTask({ title: "제목", description: "설명" });
    if (!created.ok) throw new Error("setup failed");
    taskIds.add(created.taskId);
    const employee = await makeEmployee();

    const result = await assignTask(created.taskId, employee.id);
    expect(result.ok).toBe(true);

    const task = await prisma.task.findUniqueOrThrow({ where: { id: created.taskId } });
    expect(task.assignedEmployeeId).toBe(employee.id);
    const jobs = await prisma.executionJob.findMany({ where: { taskId: created.taskId } });
    expect(jobs).toHaveLength(1);
  });

  it("does not create a second job when one already exists", async () => {
    const employeeA = await makeEmployee();
    const created = await createTask({
      title: "제목",
      description: "설명",
      assignedEmployeeId: employeeA.id,
    });
    if (!created.ok) throw new Error("setup failed");
    taskIds.add(created.taskId);

    const employeeB = await makeEmployee();
    const result = await assignTask(created.taskId, employeeB.id);
    expect(result.ok).toBe(true);

    const jobs = await prisma.executionJob.findMany({ where: { taskId: created.taskId } });
    expect(jobs).toHaveLength(1);
    const task = await prisma.task.findUniqueOrThrow({ where: { id: created.taskId } });
    expect(task.assignedEmployeeId).toBe(employeeB.id);
  });

  it("rejects assignment to an invalid employee", async () => {
    const created = await createTask({ title: "제목", description: "설명" });
    if (!created.ok) throw new Error("setup failed");
    taskIds.add(created.taskId);

    const result = await assignTask(created.taskId, "nonexistent-id");
    expect(result).toMatchObject({ ok: false, code: "invalid_employee" });
  });

  it("returns not_found for a missing task", async () => {
    const employee = await makeEmployee();
    const result = await assignTask("nonexistent-id", employee.id);
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});
