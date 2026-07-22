import { afterAll, afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import {
  storeDataAsset,
  updateDataAsset,
  archiveDataAsset,
  linkDataAssetToTask,
  searchDataAssets,
  getDataAssetAndLogAccess,
} from "./dataAssetDirect";

const testDir = path.join(process.cwd(), "workspace", "data", "test-data-asset-direct");
const relDir = "workspace/data/test-data-asset-direct";
let dataAssetIds: string[] = [];
let taskIds: string[] = [];
let fileCounter = 0;

afterEach(async () => {
  await prisma.dataAccessLog.deleteMany({ where: { dataAssetId: { in: dataAssetIds } } });
  await prisma.dataAssetTask.deleteMany({ where: { dataAssetId: { in: dataAssetIds } } });
  await prisma.dataAsset.deleteMany({ where: { id: { in: dataAssetIds } } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  dataAssetIds = [];
  taskIds = [];
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

async function writeTestFile(content: string): Promise<string> {
  await fs.mkdir(testDir, { recursive: true });
  fileCounter += 1;
  const relPath = `${relDir}/file-${fileCounter}.json`;
  await fs.writeFile(path.join(process.cwd(), relPath), content);
  return relPath;
}

async function makeTask() {
  const task = await prisma.task.create({
    data: {
      title: "데이터 자산 테스트 업무",
      description: "설명",
      collaboratingEmployeeIds: [],
      status: "running",
      inputFiles: [],
      requiredSkills: [],
      requestedPermissions: [],
    },
  });
  taskIds.push(task.id);
  return task;
}

describe("storeDataAsset (test.db only, real filesystem under workspace/)", () => {
  it("registers a new data asset with a checksum", async () => {
    const filePath = await writeTestFile('{"a":1}');
    const result = await storeDataAsset({
      name: "테스트 자산",
      dataType: "json",
      storagePath: filePath,
      sourceType: "manual_register",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    dataAssetIds.push(result.dataAssetId);

    const asset = await prisma.dataAsset.findUniqueOrThrow({ where: { id: result.dataAssetId } });
    expect(asset.checksum).toHaveLength(64);
    expect(asset.status).toBe("active");

    const log = await prisma.dataAccessLog.findFirstOrThrow({ where: { dataAssetId: result.dataAssetId } });
    expect(log.action).toBe("write");
  });

  it("rejects registering identical content twice (checksum dedup)", async () => {
    const filePath1 = await writeTestFile('{"same":true}');
    const first = await storeDataAsset({
      name: "원본",
      dataType: "json",
      storagePath: filePath1,
      sourceType: "manual_register",
    });
    expect(first.ok).toBe(true);
    if (first.ok) dataAssetIds.push(first.dataAssetId);

    const filePath2 = await writeTestFile('{"same":true}');
    const second = await storeDataAsset({
      name: "중복",
      dataType: "json",
      storagePath: filePath2,
      sourceType: "manual_register",
    });
    expect(second).toMatchObject({ ok: false, code: "duplicate_checksum" });
  });

  it("rejects a path outside the workspace root", async () => {
    const result = await storeDataAsset({
      name: "잘못된 경로",
      dataType: "json",
      storagePath: "../escape.json",
      sourceType: "manual_register",
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_path" });
  });

  it("rejects a file that doesn't exist", async () => {
    const result = await storeDataAsset({
      name: "없는 파일",
      dataType: "json",
      storagePath: `${relDir}/does-not-exist.json`,
      sourceType: "manual_register",
    });
    expect(result).toMatchObject({ ok: false, code: "file_not_found" });
  });
});

describe("updateDataAsset / archiveDataAsset (test.db only)", () => {
  async function makeAsset() {
    const filePath = await writeTestFile(`{"n":${fileCounter}}`);
    const result = await storeDataAsset({
      name: "수정 테스트 자산",
      dataType: "json",
      storagePath: filePath,
      sourceType: "manual_register",
    });
    if (!result.ok) throw new Error("setup failed");
    dataAssetIds.push(result.dataAssetId);
    return result.dataAssetId;
  }

  it("updates general fields and increments version", async () => {
    const id = await makeAsset();
    const result = await updateDataAsset(id, { name: "새 이름", sensitivity: "confidential" });
    expect(result.ok).toBe(true);
    const updated = await prisma.dataAsset.findUniqueOrThrow({ where: { id } });
    expect(updated.name).toBe("새 이름");
    expect(updated.sensitivity).toBe("confidential");
    expect(updated.version).toBe(2);
  });

  it("returns not_found for a missing asset", async () => {
    const result = await updateDataAsset("nonexistent-id", { name: "x" });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });

  it("archives without deleting", async () => {
    const id = await makeAsset();
    const result = await archiveDataAsset(id);
    expect(result.ok).toBe(true);
    const archived = await prisma.dataAsset.findUniqueOrThrow({ where: { id } });
    expect(archived.status).toBe("archived");
  });
});

describe("linkDataAssetToTask (test.db only)", () => {
  it("links and logs a produced relation as a write", async () => {
    const filePath = await writeTestFile('{"link":1}');
    const stored = await storeDataAsset({
      name: "연결 테스트",
      dataType: "json",
      storagePath: filePath,
      sourceType: "task_input",
    });
    if (!stored.ok) throw new Error("setup failed");
    dataAssetIds.push(stored.dataAssetId);
    const task = await makeTask();

    const result = await linkDataAssetToTask(stored.dataAssetId, task.id, "produced", undefined);
    expect(result.ok).toBe(true);

    const link = await prisma.dataAssetTask.findUnique({
      where: { dataAssetId_taskId: { dataAssetId: stored.dataAssetId, taskId: task.id } },
    });
    expect(link?.relation).toBe("produced");

    const logs = await prisma.dataAccessLog.findMany({ where: { dataAssetId: stored.dataAssetId, taskId: task.id } });
    expect(logs.some((l) => l.action === "write")).toBe(true);
  });

  it("rejects a duplicate link", async () => {
    const filePath = await writeTestFile('{"link":2}');
    const stored = await storeDataAsset({
      name: "중복 연결 테스트",
      dataType: "json",
      storagePath: filePath,
      sourceType: "task_input",
    });
    if (!stored.ok) throw new Error("setup failed");
    dataAssetIds.push(stored.dataAssetId);
    const task = await makeTask();

    await linkDataAssetToTask(stored.dataAssetId, task.id, "used", undefined);
    const result = await linkDataAssetToTask(stored.dataAssetId, task.id, "used", undefined);
    expect(result).toMatchObject({ ok: false, code: "already_linked" });
  });

  it("returns not_found for a missing asset or task", async () => {
    const task = await makeTask();
    expect(await linkDataAssetToTask("nonexistent-id", task.id, "used", undefined)).toMatchObject({
      ok: false,
      code: "not_found",
    });

    const filePath = await writeTestFile('{"link":3}');
    const stored = await storeDataAsset({
      name: "테스트",
      dataType: "json",
      storagePath: filePath,
      sourceType: "task_input",
    });
    if (!stored.ok) throw new Error("setup failed");
    dataAssetIds.push(stored.dataAssetId);
    expect(await linkDataAssetToTask(stored.dataAssetId, "nonexistent-id", "used", undefined)).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });
});

describe("searchDataAssets (test.db only)", () => {
  it("excludes archived and expired-by-default assets, matches text", async () => {
    const filePathA = await writeTestFile('{"s":"a"}');
    const activeMatch = await storeDataAsset({
      name: "검색어 포함 자산",
      dataType: "json",
      storagePath: filePathA,
      sourceType: "manual_register",
    });
    if (!activeMatch.ok) throw new Error("setup failed");
    dataAssetIds.push(activeMatch.dataAssetId);

    const filePathB = await writeTestFile('{"s":"b"}');
    const archivedMatch = await storeDataAsset({
      name: "검색어 포함 보관 자산",
      dataType: "json",
      storagePath: filePathB,
      sourceType: "manual_register",
    });
    if (!archivedMatch.ok) throw new Error("setup failed");
    dataAssetIds.push(archivedMatch.dataAssetId);
    await archiveDataAsset(archivedMatch.dataAssetId);

    const filePathC = await writeTestFile('{"s":"c"}');
    const expiredMatch = await storeDataAsset({
      name: "검색어 포함 만료 자산",
      dataType: "json",
      storagePath: filePathC,
      sourceType: "manual_register",
      validUntil: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    });
    if (!expiredMatch.ok) throw new Error("setup failed");
    dataAssetIds.push(expiredMatch.dataAssetId);

    const results = await searchDataAssets({ text: "검색어 포함" });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(activeMatch.dataAssetId);
    expect(ids).not.toContain(archivedMatch.dataAssetId);
    expect(ids).not.toContain(expiredMatch.dataAssetId);

    const withExpired = await searchDataAssets({ text: "검색어 포함", includeExpired: true });
    expect(withExpired.map((r) => r.id)).toContain(expiredMatch.dataAssetId);
  });
});

describe("getDataAssetAndLogAccess (test.db only)", () => {
  it("returns the asset and logs a read", async () => {
    const filePath = await writeTestFile('{"g":1}');
    const stored = await storeDataAsset({
      name: "조회 테스트",
      dataType: "json",
      storagePath: filePath,
      sourceType: "manual_register",
    });
    if (!stored.ok) throw new Error("setup failed");
    dataAssetIds.push(stored.dataAssetId);

    const asset = await getDataAssetAndLogAccess(stored.dataAssetId);
    expect(asset?.id).toBe(stored.dataAssetId);

    const readLog = await prisma.dataAccessLog.findFirst({
      where: { dataAssetId: stored.dataAssetId, action: "read" },
    });
    expect(readLog).not.toBeNull();
  });

  it("returns null for a missing asset without throwing", async () => {
    const asset = await getDataAssetAndLogAccess("nonexistent-id");
    expect(asset).toBeNull();
  });
});
