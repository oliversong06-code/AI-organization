import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { computeRequiredReviewRanks, findReviewerCandidate } from "./reviewChain";

describe("computeRequiredReviewRanks (pure)", () => {
  it("author_plus_one: exactly one rank above the author", () => {
    expect(computeRequiredReviewRanks("author_plus_one", 1)).toEqual([2]);
    expect(computeRequiredReviewRanks("author_plus_one", 3)).toEqual([4]);
  });

  it("author_plus_one: blocked when the author is already rank 4", () => {
    expect(computeRequiredReviewRanks("author_plus_one", 4)).toEqual([]);
  });

  it("sequential_to_rank3: every rank from author+1 up to 3", () => {
    expect(computeRequiredReviewRanks("sequential_to_rank3", 1)).toEqual([2, 3]);
    expect(computeRequiredReviewRanks("sequential_to_rank3", 2)).toEqual([3]);
  });

  it("sequential_to_rank3: collapses to author+1 once the author is already rank 3+", () => {
    expect(computeRequiredReviewRanks("sequential_to_rank3", 3)).toEqual([4]);
  });

  it("sequential_to_rank3: blocked when the author is already rank 4", () => {
    expect(computeRequiredReviewRanks("sequential_to_rank3", 4)).toEqual([]);
  });

  it("min3_then_rank4: both stages for a low-rank author", () => {
    expect(computeRequiredReviewRanks("min3_then_rank4", 1)).toEqual([3, 4]);
  });

  it("min3_then_rank4: skips the rank-3 stage when the author is already rank 3", () => {
    expect(computeRequiredReviewRanks("min3_then_rank4", 3)).toEqual([4]);
  });

  it("min3_then_rank4: blocked when the author is already rank 4", () => {
    expect(computeRequiredReviewRanks("min3_then_rank4", 4)).toEqual([]);
  });

  it("full_chain_rank4: every rank from author+1 through 4", () => {
    expect(computeRequiredReviewRanks("full_chain_rank4", 1)).toEqual([2, 3, 4]);
    expect(computeRequiredReviewRanks("full_chain_rank4", 2)).toEqual([3, 4]);
    expect(computeRequiredReviewRanks("full_chain_rank4", 3)).toEqual([4]);
  });

  it("full_chain_rank4: blocked when the author is already rank 4", () => {
    expect(computeRequiredReviewRanks("full_chain_rank4", 4)).toEqual([]);
  });
});

describe("findReviewerCandidate (test.db only)", () => {
  const zoneKeys = ["test-review-chain-zone"];
  const zoneIds: Record<string, string> = {};
  let employeeIds: string[] = [];
  let departmentIds: string[] = [];

  afterEach(async () => {
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
    await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
    employeeIds = [];
    departmentIds = [];
  });

  afterAll(async () => {
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

  async function makeEmployee(rank: number, departmentId?: string) {
    const zoneId = await ensureZone();
    const employee = await prisma.employee.create({
      data: { name: "검수 후보 테스트 직원", role: "역할", rank, departmentId, officeZoneId: zoneId, posX: 0.5, posY: 0.5, avatarId: "avatar-01" },
    });
    employeeIds.push(employee.id);
    return employee;
  }

  async function makeDepartment() {
    const dept = await prisma.department.create({ data: { name: "검수 후보 테스트 부서" } });
    departmentIds.push(dept.id);
    return dept;
  }

  it("prefers a same-department candidate over a company-wide one", async () => {
    const dept = await makeDepartment();
    const author = await makeEmployee(1, dept.id);
    const inDept = await makeEmployee(2, dept.id);
    await makeEmployee(2); // company-wide candidate, no department

    const found = await prisma.$transaction(async (tx) =>
      findReviewerCandidate(tx, { requiredRank: 2, excludeEmployeeId: author.id, preferDepartmentId: dept.id })
    );
    expect(found?.id).toBe(inDept.id);
  });

  it("falls back to a company-wide candidate when none exist in the department", async () => {
    const author = await makeEmployee(1);
    const companyWide = await makeEmployee(2);

    const found = await prisma.$transaction(async (tx) =>
      findReviewerCandidate(tx, { requiredRank: 2, excludeEmployeeId: author.id, preferDepartmentId: "nonexistent-dept" })
    );
    expect(found?.id).toBe(companyWide.id);
  });

  it("never returns the author, even if they'd otherwise match", async () => {
    const author = await makeEmployee(2);
    const found = await prisma.$transaction(async (tx) =>
      findReviewerCandidate(tx, { requiredRank: 2, excludeEmployeeId: author.id })
    );
    expect(found?.id).not.toBe(author.id);
  });
});
