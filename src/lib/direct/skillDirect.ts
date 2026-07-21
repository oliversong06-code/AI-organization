import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityActor } from "@/lib/enums";

export type DirectResult = { ok: true } | { ok: false; error: string; code: "not_found" };

interface RegisterSkillInput {
  name: string;
  description?: string;
  category: string;
  source: string;
  connectionType: string;
  inputSchema: unknown;
  outputSchema: unknown;
  permissions: string[];
  instructions?: string;
  allowedTools?: string[];
  compatibleRanks?: number[];
  compatibleDepartments?: string[];
}

/** Direct execution — creating a skill has never needed approval, but it
 * starts unvalidated/disabled/uninstalled; validateSkill is what activates
 * it. */
export async function registerSkill(
  data: RegisterSkillInput,
  actor: ActivityActor = "claude_code"
): Promise<{ ok: true; skillId: string }> {
  const skillId = await withTransaction(async (tx) => {
    const skill = await tx.skill.create({
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        source: data.source,
        connectionType: data.connectionType,
        inputSchema: data.inputSchema as Prisma.InputJsonValue,
        outputSchema: data.outputSchema as Prisma.InputJsonValue,
        permissions: data.permissions as Prisma.InputJsonValue,
        instructions: data.instructions,
        allowedTools: data.allowedTools as Prisma.InputJsonValue | undefined,
        compatibleRanks: data.compatibleRanks as Prisma.InputJsonValue | undefined,
        compatibleDepartments: data.compatibleDepartments as Prisma.InputJsonValue | undefined,
        validationStatus: "unvalidated",
        enabled: false,
        installed: false,
      },
    });
    await logActivity(tx, {
      actor,
      action: "skill.register",
      entityType: "skill",
      entityId: skill.id,
      detail: { name: data.name, category: data.category },
    });
    return skill.id;
  });

  return { ok: true, skillId };
}

/** Direct execution — records a validation outcome. Passing is what makes
 * a skill actually usable (enabled + installed + healthStatus back to
 * "available"); failing disables it again and marks healthStatus "error"
 * so it reads clearly as broken rather than merely "not yet checked". */
export async function validateSkill(
  id: string,
  status: "passed" | "failed",
  details?: string,
  actor: ActivityActor = "claude_code"
): Promise<DirectResult> {
  const existing = await prisma.skill.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "스킬을 찾을 수 없습니다", code: "not_found" };

  await withTransaction(async (tx) => {
    await tx.skill.update({
      where: { id },
      data: {
        validationStatus: status,
        enabled: status === "passed",
        installed: status === "passed" ? true : existing.installed,
        healthStatus: status === "passed" ? "available" : "error",
        version: { increment: 1 },
      },
    });
    await logActivity(tx, {
      actor,
      action: "skill.validate",
      entityType: "skill",
      entityId: id,
      detail: { status, details },
    });
  });

  return { ok: true };
}

export type AssignSkillResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code: "not_found" | "not_validated" | "incompatible_rank" | "incompatible_department" | "already_assigned";
    };

/** Direct execution — links a Skill to an Employee. Refuses a skill that
 * hasn't passed validation ("validationStatus가 통과해야 활성화" from the
 * plan), and enforces compatibleRanks/compatibleDepartments when the
 * skill declares either — an empty/absent constraint list means "no
 * restriction", not "nobody qualifies". */
export async function assignSkillToEmployee(
  employeeId: string,
  skillId: string,
  actor: ActivityActor = "claude_code"
): Promise<AssignSkillResult> {
  const [employee, skill] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId } }),
    prisma.skill.findUnique({ where: { id: skillId } }),
  ]);
  if (!employee) return { ok: false, error: "직원을 찾을 수 없습니다", code: "not_found" };
  if (!skill) return { ok: false, error: "스킬을 찾을 수 없습니다", code: "not_found" };
  if (skill.validationStatus !== "passed") {
    return { ok: false, error: "검증(validationStatus=passed)되지 않은 스킬은 배정할 수 없습니다", code: "not_validated" };
  }

  const compatibleRanks = skill.compatibleRanks as number[] | null;
  if (compatibleRanks && compatibleRanks.length > 0 && !compatibleRanks.includes(employee.rank)) {
    return {
      ok: false,
      error: `이 스킬은 직급 [${compatibleRanks.join(", ")}]만 사용할 수 있습니다`,
      code: "incompatible_rank",
    };
  }

  const compatibleDepartments = skill.compatibleDepartments as string[] | null;
  if (
    compatibleDepartments &&
    compatibleDepartments.length > 0 &&
    (!employee.departmentId || !compatibleDepartments.includes(employee.departmentId))
  ) {
    return { ok: false, error: "이 스킬은 지정된 부서 소속만 사용할 수 있습니다", code: "incompatible_department" };
  }

  const existingLink = await prisma.employeeSkill.findUnique({
    where: { employeeId_skillId: { employeeId, skillId } },
  });
  if (existingLink) return { ok: false, error: "이미 배정된 스킬입니다", code: "already_assigned" };

  await withTransaction(async (tx) => {
    await tx.employeeSkill.create({ data: { employeeId, skillId } });
    await logActivity(tx, {
      actor,
      action: "skill.assign",
      entityType: "employee",
      entityId: employeeId,
      detail: { skillId },
    });
  });

  return { ok: true };
}
