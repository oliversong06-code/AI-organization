import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { updateDepartment, archiveDepartment } from "./departmentDirect";

const zoneKeys = ["test-dept-direct-zone-1", "test-dept-direct-zone-2"];
const zoneIds: Record<string, string> = {};
const departmentIds = new Set<string>();

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
});

afterAll(async () => {
  await prisma.department.deleteMany({ where: { id: { in: [...departmentIds] } } });
  await prisma.officeZone.deleteMany({ where: { key: { in: zoneKeys } } });
});

async function makeDepartment(officeZoneId?: string) {
  const dept = await prisma.department.create({
    data: { name: "직접실행 테스트 부서", officeZoneId },
  });
  departmentIds.add(dept.id);
  if (officeZoneId) {
    await prisma.officeZone.update({ where: { id: officeZoneId }, data: { displayName: dept.name } });
  }
  return dept;
}

describe("updateDepartment (test.db only)", () => {
  it("updates general fields and increments version", async () => {
    const dept = await makeDepartment();
    const result = await updateDepartment(dept.id, { name: "이름 변경됨", description: "새 설명" });
    expect(result.ok).toBe(true);
    const updated = await prisma.department.findUniqueOrThrow({ where: { id: dept.id } });
    expect(updated.name).toBe("이름 변경됨");
    expect(updated.description).toBe("새 설명");
    expect(updated.version).toBe(2);

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "department", entityId: dept.id, action: "department.update" },
      orderBy: { timestamp: "desc" },
    });
    expect(log.actor).toBe("claude_code");
  });

  it("moving to a new zone relabels the new zone and clears the old zone's label", async () => {
    const oldZoneId = zoneIds["test-dept-direct-zone-1"];
    const newZoneId = zoneIds["test-dept-direct-zone-2"];
    const dept = await makeDepartment(oldZoneId);

    const result = await updateDepartment(dept.id, { officeZoneId: newZoneId });
    expect(result.ok).toBe(true);

    const oldZone = await prisma.officeZone.findUniqueOrThrow({ where: { id: oldZoneId } });
    const newZone = await prisma.officeZone.findUniqueOrThrow({ where: { id: newZoneId } });
    expect(oldZone.displayName).toBeNull();
    expect(newZone.displayName).toBe(dept.name);
  });

  it("returns not_found for a missing department", async () => {
    const result = await updateDepartment("nonexistent-id", { name: "x" });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("archiveDepartment (test.db only)", () => {
  it("archives, clears the zone assignment, and resets the zone's label", async () => {
    const zoneId = zoneIds["test-dept-direct-zone-1"];
    const dept = await makeDepartment(zoneId);

    const result = await archiveDepartment(dept.id);
    expect(result.ok).toBe(true);

    const updated = await prisma.department.findUniqueOrThrow({ where: { id: dept.id } });
    expect(updated.status).toBe("archived");
    expect(updated.archivedAt).not.toBeNull();
    expect(updated.officeZoneId).toBeNull();

    const zone = await prisma.officeZone.findUniqueOrThrow({ where: { id: zoneId } });
    expect(zone.displayName).toBeNull();

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "department", entityId: dept.id, action: "department.archive" },
      orderBy: { timestamp: "desc" },
    });
    expect(log.actor).toBe("user");
  });

  it("returns not_found for a missing department", async () => {
    const result = await archiveDepartment("nonexistent-id");
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });
});
