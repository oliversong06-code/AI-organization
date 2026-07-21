import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerSkill, validateSkill, assignSkillToEmployee } from "./skillDirect";

const zoneKey = "test-skill-direct-zone";
let zoneId: string;
let skillIds: string[] = [];
let employeeIds: string[] = [];
let departmentIds: string[] = [];

async function ensureZone() {
  if (zoneId) return zoneId;
  const zone = await prisma.officeZone.upsert({
    where: { key: zoneKey },
    update: {},
    create: {
      key: zoneKey,
      name: zoneKey,
      kind: "open_workspace",
      rectNormX0: 0,
      rectNormY0: 0,
      rectNormX1: 1,
      rectNormY1: 1,
    },
  });
  zoneId = zone.id;
  return zoneId;
}

async function makeEmployee(rank: number, departmentId?: string) {
  const zone = await ensureZone();
  const employee = await prisma.employee.create({
    data: { name: "스킬 테스트 직원", role: "역할", rank, departmentId, officeZoneId: zone, posX: 0.5, posY: 0.5, avatarId: "avatar-01" },
  });
  employeeIds.push(employee.id);
  return employee;
}

async function makeSkill() {
  const result = await registerSkill({
    name: "테스트 스킬",
    category: "test",
    source: "builtin",
    connectionType: "none",
    inputSchema: {},
    outputSchema: {},
    permissions: [],
  });
  skillIds.push(result.skillId);
  return result.skillId;
}

afterEach(async () => {
  await prisma.employeeSkill.deleteMany({ where: { skillId: { in: skillIds } } });
  await prisma.skill.deleteMany({ where: { id: { in: skillIds } } });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
  skillIds = [];
  employeeIds = [];
  departmentIds = [];
});

afterAll(async () => {
  await prisma.officeZone.deleteMany({ where: { key: zoneKey } });
});

describe("registerSkill (test.db only)", () => {
  it("creates a skill starting unvalidated/disabled/uninstalled", async () => {
    const skillId = await makeSkill();
    const skill = await prisma.skill.findUniqueOrThrow({ where: { id: skillId } });
    expect(skill.validationStatus).toBe("unvalidated");
    expect(skill.enabled).toBe(false);
    expect(skill.installed).toBe(false);
  });
});

describe("validateSkill (test.db only)", () => {
  it("passing enables and installs the skill", async () => {
    const skillId = await makeSkill();
    const result = await validateSkill(skillId, "passed");
    expect(result.ok).toBe(true);
    const skill = await prisma.skill.findUniqueOrThrow({ where: { id: skillId } });
    expect(skill.validationStatus).toBe("passed");
    expect(skill.enabled).toBe(true);
    expect(skill.installed).toBe(true);
    expect(skill.healthStatus).toBe("available");
  });

  it("failing disables the skill and marks it errored", async () => {
    const skillId = await makeSkill();
    await validateSkill(skillId, "passed");
    const result = await validateSkill(skillId, "failed", "실행 오류");
    expect(result.ok).toBe(true);
    const skill = await prisma.skill.findUniqueOrThrow({ where: { id: skillId } });
    expect(skill.validationStatus).toBe("failed");
    expect(skill.enabled).toBe(false);
    expect(skill.healthStatus).toBe("error");
  });

  it("returns not_found for a missing skill", async () => {
    const result = await validateSkill("nonexistent-id", "passed");
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("assignSkillToEmployee (test.db only)", () => {
  it("rejects assignment when the skill hasn't passed validation", async () => {
    const skillId = await makeSkill();
    const employee = await makeEmployee(1);
    const result = await assignSkillToEmployee(employee.id, skillId);
    expect(result).toMatchObject({ ok: false, code: "not_validated" });
  });

  it("assigns successfully once validated", async () => {
    const skillId = await makeSkill();
    await validateSkill(skillId, "passed");
    const employee = await makeEmployee(1);

    const result = await assignSkillToEmployee(employee.id, skillId);
    expect(result.ok).toBe(true);
    const link = await prisma.employeeSkill.findUnique({
      where: { employeeId_skillId: { employeeId: employee.id, skillId } },
    });
    expect(link).not.toBeNull();
  });

  it("rejects a duplicate assignment", async () => {
    const skillId = await makeSkill();
    await validateSkill(skillId, "passed");
    const employee = await makeEmployee(1);
    await assignSkillToEmployee(employee.id, skillId);

    const result = await assignSkillToEmployee(employee.id, skillId);
    expect(result).toMatchObject({ ok: false, code: "already_assigned" });
  });

  it("enforces compatibleRanks when the skill declares it", async () => {
    const result0 = await registerSkill({
      name: "고급 스킬",
      category: "test",
      source: "builtin",
      connectionType: "none",
      inputSchema: {},
      outputSchema: {},
      permissions: [],
      compatibleRanks: [3, 4],
    });
    skillIds.push(result0.skillId);
    await validateSkill(result0.skillId, "passed");

    const lowRank = await makeEmployee(1);
    const rejected = await assignSkillToEmployee(lowRank.id, result0.skillId);
    expect(rejected).toMatchObject({ ok: false, code: "incompatible_rank" });

    const highRank = await makeEmployee(3);
    const accepted = await assignSkillToEmployee(highRank.id, result0.skillId);
    expect(accepted.ok).toBe(true);
  });

  it("enforces compatibleDepartments when the skill declares it", async () => {
    const dept = await prisma.department.create({ data: { name: "스킬 테스트 부서" } });
    departmentIds.push(dept.id);

    const result0 = await registerSkill({
      name: "부서 전용 스킬",
      category: "test",
      source: "builtin",
      connectionType: "none",
      inputSchema: {},
      outputSchema: {},
      permissions: [],
      compatibleDepartments: [dept.id],
    });
    skillIds.push(result0.skillId);
    await validateSkill(result0.skillId, "passed");

    const outsider = await makeEmployee(1);
    const rejected = await assignSkillToEmployee(outsider.id, result0.skillId);
    expect(rejected).toMatchObject({ ok: false, code: "incompatible_department" });

    const insider = await makeEmployee(1, dept.id);
    const accepted = await assignSkillToEmployee(insider.id, result0.skillId);
    expect(accepted.ok).toBe(true);
  });

  it("returns not_found for a missing employee or skill", async () => {
    const skillId = await makeSkill();
    await validateSkill(skillId, "passed");
    const employee = await makeEmployee(1);

    expect(await assignSkillToEmployee("nonexistent-id", skillId)).toMatchObject({ ok: false, code: "not_found" });
    expect(await assignSkillToEmployee(employee.id, "nonexistent-id")).toMatchObject({ ok: false, code: "not_found" });
  });
});
