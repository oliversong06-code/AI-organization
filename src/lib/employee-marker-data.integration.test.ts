import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma";
import type { EmployeeMarkerData } from "@/components/office/types";

/**
 * Exercises the exact round-trip step 6 depends on: an Employee row (with
 * its OfficeZone relation) can be created, read back, and shaped into the
 * plain EmployeeMarkerData the office scene components render — entirely
 * against prisma/test.db. Confirms via scripts/check-db-target.ts (vitest
 * globalSetup) that this can never accidentally run against dev.db, and
 * removes the row afterward.
 */
describe("employee marker data (test.db only)", () => {
  const zoneKey = "test-open-workspace";
  let zoneId: string;
  let employeeId: string;
  let employeeCountBefore: number;

  beforeAll(async () => {
    employeeCountBefore = await prisma.employee.count();

    const zone = await prisma.officeZone.upsert({
      where: { key: zoneKey },
      update: {},
      create: {
        key: zoneKey,
        name: "테스트 업무 공간",
        kind: "open_workspace",
        rectNormX0: 0,
        rectNormY0: 0,
        rectNormX1: 1,
        rectNormY1: 1,
      },
    });
    zoneId = zone.id;
  });

  afterAll(async () => {
    if (employeeId) {
      await prisma.employee.delete({ where: { id: employeeId } }).catch(() => {});
    }
    const employeeCountAfter = await prisma.employee.count();
    expect(employeeCountAfter).toBe(employeeCountBefore);
  });

  it("creates, reads, and shapes an employee into EmployeeMarkerData", async () => {
    const created = await prisma.employee.create({
      data: {
        name: "테스트 직원",
        role: "테스트 역할",
        status: "running",
        officeZoneId: zoneId,
        posX: 0.5,
        posY: 0.5,
        direction: "down",
        scale: 1,
        avatarId: "avatar-01",
      },
    });
    employeeId = created.id;

    const fetched = await prisma.employee.findUniqueOrThrow({
      where: { id: created.id },
      include: { officeZone: true },
    });

    const markerData: EmployeeMarkerData = {
      id: fetched.id,
      name: fetched.name,
      officeZoneKey: fetched.officeZone.key,
      posX: fetched.posX,
      posY: fetched.posY,
      direction: fetched.direction as EmployeeMarkerData["direction"],
      scale: fetched.scale,
      avatarId: fetched.avatarId,
      status: fetched.status as EmployeeMarkerData["status"],
    };

    expect(markerData.officeZoneKey).toBe(zoneKey);
    expect(markerData.posX).toBe(0.5);
    expect(markerData.status).toBe("running");
  });
});
