import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import type { ActivityActor, TaskPriority } from "@/lib/enums";

export type DirectResult = { ok: true } | { ok: false; error: string; code: "not_found" | "invalid_employee" };
export type CreateResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string; code: "invalid_employee" };

interface CreateTaskInput {
  title: string;
  description: string;
  assignedEmployeeId?: string;
  collaboratingEmployeeIds?: string[];
  priority?: TaskPriority;
  inputFiles?: string[];
  requiredSkills?: string[];
  requestedPermissions?: string[];
}

async function assertAssignableEmployee(employeeId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  return employee && employee.status !== "archived";
}

/**
 * Direct execution (no ApprovalRequest) — a Task is born "queued" the
 * instant it's created (propose_task/draft/awaiting_approval no longer
 * exist as of P2-2/P2-4). When assignedEmployeeId names a valid,
 * non-archived employee, an ExecutionJob(status:"pending") is created in
 * the same transaction so the worker picks it up without a second call.
 */
export async function createTask(
  data: CreateTaskInput,
  actor: ActivityActor = "claude_code"
): Promise<CreateResult> {
  if (data.assignedEmployeeId && !(await assertAssignableEmployee(data.assignedEmployeeId))) {
    return { ok: false, error: "배정하려는 직원을 찾을 수 없거나 보관된 직원입니다", code: "invalid_employee" };
  }

  const taskId = await withTransaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: data.title,
        description: data.description,
        assignedEmployeeId: data.assignedEmployeeId,
        collaboratingEmployeeIds: data.collaboratingEmployeeIds ?? [],
        status: "queued",
        priority: data.priority ?? "normal",
        inputFiles: data.inputFiles ?? [],
        requiredSkills: data.requiredSkills ?? [],
        requestedPermissions: data.requestedPermissions ?? [],
      },
    });

    if (data.assignedEmployeeId) {
      await tx.executionJob.create({ data: { taskId: task.id, status: "pending" } });
    }

    await logActivity(tx, {
      actor,
      action: "task.create",
      entityType: "task",
      entityId: task.id,
      detail: { assignedEmployeeId: data.assignedEmployeeId ?? null },
    });

    return task.id;
  });

  return { ok: true, taskId };
}

interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  inputFiles?: string[];
  requiredSkills?: string[];
  requestedPermissions?: string[];
}

/** Direct execution — general field edits only. Status/assignee changes go
 * through the execution-only tools / assignTask respectively, never here. */
export async function updateTask(
  id: string,
  data: UpdateTaskInput,
  actor: ActivityActor = "claude_code"
): Promise<DirectResult> {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "업무를 찾을 수 없습니다", code: "not_found" };

  await withTransaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
    await logActivity(tx, {
      actor,
      action: "task.update",
      entityType: "task",
      entityId: id,
      detail: { fields: Object.keys(data) },
    });
  });

  return { ok: true };
}

/**
 * Direct execution — (re)assigns a Task to an employee. If the task is
 * still "queued" and has no ExecutionJob yet (e.g. it was created without
 * an assignee, or a previous job never got created), a pending
 * ExecutionJob is created so the worker can pick it up — mirrors the
 * auto-create behavior in createTask.
 */
export async function assignTask(
  id: string,
  assignedEmployeeId: string,
  actor: ActivityActor = "claude_code"
): Promise<DirectResult> {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "업무를 찾을 수 없습니다", code: "not_found" };
  if (!(await assertAssignableEmployee(assignedEmployeeId))) {
    return { ok: false, error: "배정하려는 직원을 찾을 수 없거나 보관된 직원입니다", code: "invalid_employee" };
  }

  await withTransaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: { assignedEmployeeId, version: { increment: 1 } },
    });

    if (existing.status === "queued") {
      const hasJob = await tx.executionJob.findFirst({ where: { taskId: id } });
      if (!hasJob) {
        await tx.executionJob.create({ data: { taskId: id, status: "pending" } });
      }
    }

    await logActivity(tx, {
      actor,
      action: "task.assign",
      entityType: "task",
      entityId: id,
      detail: { from: existing.assignedEmployeeId, to: assignedEmployeeId },
    });
  });

  return { ok: true };
}
