import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { updateEmployee, moveEmployee, archiveEmployee, changeEmployeeRank } from "./employeeDirect";

const zoneKeys = ["test-emp-direct-zone-1", "test-emp-direct-zone-2", "test-emp-direct-zone-full"];
const zoneIds: Record<string, string> = {};
const employeeIds = new Set<string>();
const skillIds = new Set<string>();

beforeAll(async () => {
  for (const key of zoneKeys) {
    const zone = await prisma.officeZone.upsert({
      where: { key },
      update: {},
      create: {
        key,
        name: key,
        kind: "open_workspace",
        rectNormX0: 0,
        rectNormY0: 0,
        rectNormX1: 1,
        rectNormY1: 1,
      },
    });
    zoneIds[key] = zone.id;
  }

  // zone-1 gets one free seat, zone-2 gets one free seat, zone-full gets a
  // single seat that's always occupied by another (unrelated) employee.
  await prisma.seat.upsert({
    where: { officeZoneId_index: { officeZoneId: zoneIds["test-emp-direct-zone-1"], index: 0 } },
    update: {},
    create: { officeZoneId: zoneIds["test-emp-direct-zone-1"], index: 0, normX: 0.3, normY: 0.3 },
  });
  await prisma.seat.upsert({
    where: { officeZoneId_index: { officeZoneId: zoneIds["test-emp-direct-zone-2"], index: 0 } },
    update: {},
    create: { officeZoneId: zoneIds["test-emp-direct-zone-2"], index: 0, normX: 0.6, normY: 0.6 },
  });

  const occupant = await prisma.employee.create({
    data: {
      name: "자리 차지 직원",
      role: "역할",
      officeZoneId: zoneIds["test-emp-direct-zone-full"],
      posX: 0.4,
      posY: 0.4,
      avatarId: "avatar-01",
    },
  });
  employeeIds.add(occupant.id);

  await prisma.seat.upsert({
    where: { officeZoneId_index: { officeZoneId: zoneIds["test-emp-direct-zone-full"], index: 0 } },
    update: { employeeId: occupant.id },
    create: {
      officeZoneId: zoneIds["test-emp-direct-zone-full"],
      index: 0,
      normX: 0.4,
      normY: 0.4,
      employeeId: occupant.id,
    },
  });
});

afterAll(async () => {
  await prisma.seat.deleteMany({ where: { officeZoneId: { in: Object.values(zoneIds) } } });
  await prisma.employeeSkill.deleteMany({ where: { employeeId: { in: [...employeeIds] } } });
  await prisma.employee.deleteMany({ where: { id: { in: [...employeeIds] } } });
  await prisma.skill.deleteMany({ where: { id: { in: [...skillIds] } } });
  await prisma.officeZone.deleteMany({ where: { key: { in: zoneKeys } } });
});

async function makeEmployee(officeZoneId: string, rank = 1) {
  const employee = await prisma.employee.create({
    data: {
      name: "직접실행 테스트 직원",
      role: "테스트 역할",
      rank,
      officeZoneId,
      posX: 0.5,
      posY: 0.5,
      avatarId: "avatar-01",
    },
  });
  employeeIds.add(employee.id);
  return employee;
}

describe("updateEmployee (test.db only)", () => {
  it("updates general fields and increments version", async () => {
    const employee = await makeEmployee(zoneIds["test-emp-direct-zone-1"]);
    const result = await updateEmployee(employee.id, { name: "이름 변경됨", role: "새 역할" });
    expect(result.ok).toBe(true);
    const updated = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(updated.name).toBe("이름 변경됨");
    expect(updated.role).toBe("새 역할");
    expect(updated.version).toBe(2);
  });

  it("replaces skillIds", async () => {
    const skill = await prisma.skill.create({
      data: {
        name: "테스트 스킬",
        category: "test",
        source: "builtin",
        connectionType: "none",
        inputSchema: {},
        outputSchema: {},
        permissions: [],
      },
    });
    skillIds.add(skill.id);

    const employee = await makeEmployee(zoneIds["test-emp-direct-zone-1"]);
    const result = await updateEmployee(employee.id, { skillIds: [skill.id] });
    expect(result.ok).toBe(true);
    const links = await prisma.employeeSkill.findMany({ where: { employeeId: employee.id } });
    expect(links).toHaveLength(1);
    expect(links[0].skillId).toBe(skill.id);

    const cleared = await updateEmployee(employee.id, { skillIds: [] });
    expect(cleared.ok).toBe(true);
    const afterClear = await prisma.employeeSkill.findMany({ where: { employeeId: employee.id } });
    expect(afterClear).toHaveLength(0);
  });

  it("returns not_found for a missing employee", async () => {
    const result = await updateEmployee("nonexistent-id", { name: "x" });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("moveEmployee (test.db only)", () => {
  it("frees the old seat and snaps into a free seat in the new zone", async () => {
    const employee = await makeEmployee(zoneIds["test-emp-direct-zone-1"]);
    const oldSeat = await prisma.seat.findFirstOrThrow({
      where: { officeZoneId: zoneIds["test-emp-direct-zone-1"] },
    });
    await prisma.seat.update({ where: { id: oldSeat.id }, data: { employeeId: employee.id } });

    const result = await moveEmployee(employee.id, zoneIds["test-emp-direct-zone-2"]);
    expect(result.ok).toBe(true);

    const freedOldSeat = await prisma.seat.findUniqueOrThrow({ where: { id: oldSeat.id } });
    expect(freedOldSeat.employeeId).toBeNull();

    const updated = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(updated.officeZoneId).toBe(zoneIds["test-emp-direct-zone-2"]);
    const newSeat = await prisma.seat.findFirstOrThrow({
      where: { officeZoneId: zoneIds["test-emp-direct-zone-2"] },
    });
    expect(newSeat.employeeId).toBe(employee.id);
    expect(updated.posX).toBe(newSeat.normX);
    expect(updated.posY).toBe(newSeat.normY);

    // free the seat back up for other tests in this file
    await prisma.seat.update({ where: { id: newSeat.id }, data: { employeeId: null } });
  });

  it("falls back to (0.5, 0.5) when the target zone has no free seat", async () => {
    const employee = await makeEmployee(zoneIds["test-emp-direct-zone-1"]);
    const result = await moveEmployee(employee.id, zoneIds["test-emp-direct-zone-full"]);
    expect(result.ok).toBe(true);
    const updated = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(updated.officeZoneId).toBe(zoneIds["test-emp-direct-zone-full"]);
    expect(updated.posX).toBe(0.5);
    expect(updated.posY).toBe(0.5);
  });

  it("returns not_found for a missing employee", async () => {
    const result = await moveEmployee("nonexistent-id", zoneIds["test-emp-direct-zone-1"]);
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("archiveEmployee (test.db only)", () => {
  it("frees the seat and archives", async () => {
    const employee = await makeEmployee(zoneIds["test-emp-direct-zone-1"]);
    const seat = await prisma.seat.findFirstOrThrow({
      where: { officeZoneId: zoneIds["test-emp-direct-zone-1"] },
    });
    await prisma.seat.update({ where: { id: seat.id }, data: { employeeId: employee.id } });

    const result = await archiveEmployee(employee.id);
    expect(result.ok).toBe(true);

    const updated = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(updated.status).toBe("archived");
    expect(updated.archivedAt).not.toBeNull();

    const freedSeat = await prisma.seat.findUniqueOrThrow({ where: { id: seat.id } });
    expect(freedSeat.employeeId).toBeNull();
  });

  it("returns not_found for a missing employee", async () => {
    const result = await archiveEmployee("nonexistent-id");
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("changeEmployeeRank (test.db only)", () => {
  it("allows a user-authorized rank change", async () => {
    const employee = await makeEmployee(zoneIds["test-emp-direct-zone-1"], 1);
    const result = await changeEmployeeRank(employee.id, 3, "user");
    expect(result.ok).toBe(true);
    const updated = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(updated.rank).toBe(3);
  });

  it("allows a different rank-4 employee to authorize a change", async () => {
    const rank4 = await makeEmployee(zoneIds["test-emp-direct-zone-1"], 4);
    const target = await makeEmployee(zoneIds["test-emp-direct-zone-1"], 1);
    const result = await changeEmployeeRank(target.id, 2, "rank4_employee", rank4.id);
    expect(result.ok).toBe(true);
    const updated = await prisma.employee.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.rank).toBe(2);
  });

  it("rejects self-authorization (target === authorizer)", async () => {
    const rank4 = await makeEmployee(zoneIds["test-emp-direct-zone-1"], 4);
    const result = await changeEmployeeRank(rank4.id, 3, "rank4_employee", rank4.id);
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("rejects when authorizingEmployeeId is missing for rank4_employee", async () => {
    const target = await makeEmployee(zoneIds["test-emp-direct-zone-1"], 1);
    const result = await changeEmployeeRank(target.id, 2, "rank4_employee");
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("rejects when the authorizer isn't actually rank 4", async () => {
    const notRank4 = await makeEmployee(zoneIds["test-emp-direct-zone-1"], 2);
    const target = await makeEmployee(zoneIds["test-emp-direct-zone-1"], 1);
    const result = await changeEmployeeRank(target.id, 3, "rank4_employee", notRank4.id);
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("returns not_found for a missing employee", async () => {
    const result = await changeEmployeeRank("nonexistent-id", 2, "user");
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});
