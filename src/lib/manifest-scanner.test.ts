import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prisma } from "@/lib/prisma";
import { scanIntegrationForManifests } from "./manifest-scanner";
import { resolveWorkspacePath } from "@/lib/path-guard";

const integrationIds = new Set<string>();
const artifactIds = new Set<string>();
const manifestRunIds = new Set<string>();
const tempFolders: string[] = [];

afterAll(async () => {
  await prisma.artifact.deleteMany({ where: { id: { in: [...artifactIds] } } });
  await prisma.importedManifest.deleteMany({ where: { runId: { in: [...manifestRunIds] } } });
  await prisma.integration.deleteMany({ where: { id: { in: [...integrationIds] } } });
  await Promise.all(tempFolders.map((f) => fs.rm(f, { recursive: true, force: true })));
  const copied = resolveWorkspacePath("workspace/artifacts");
  await fs.rm(copied, { recursive: true, force: true }).catch(() => {});
});

async function makeIsolatedSyncFolder() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "coa-manifest-test-"));
  tempFolders.push(dir);
  return dir;
}

async function makeConfiguredIntegration(syncFolderPath: string) {
  const integration = await prisma.integration.create({
    data: {
      name: "테스트 동기화 폴더",
      kind: "local_folder",
      config: { syncFolderPath },
      status: "configured",
      accessMode: "read_only",
    },
  });
  integrationIds.add(integration.id);
  return integration;
}

function manifestPayload(runId: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    runId,
    automationId: null,
    taskId: null,
    employeeId: null,
    status: "completed",
    title: "테스트 실행 결과",
    summary: "요약",
    artifacts: [{ fileName: `${runId}.txt` }],
    logs: [],
    error: null,
    ...overrides,
  };
}

describe("scanIntegrationForManifests (test.db + an isolated temp folder per test)", () => {
  it("imports a new manifest and copies its artifact into workspace/artifacts", async () => {
    const syncFolder = await makeIsolatedSyncFolder();
    const integration = await makeConfiguredIntegration(syncFolder);
    const runId = `run-${Date.now()}`;
    manifestRunIds.add(runId);

    await fs.writeFile(path.join(syncFolder, `${runId}.manifest.json`), JSON.stringify(manifestPayload(runId)));
    await fs.writeFile(path.join(syncFolder, `${runId}.txt`), "hello from external sync");

    const result = await scanIntegrationForManifests(integration.id);
    expect(result).toMatchObject({ scanned: 1, imported: 1, skipped: 0, invalid: 0 });

    const imported = await prisma.importedManifest.findUniqueOrThrow({ where: { runId } });
    expect(imported.status).toBe("imported");
    const createdIds = imported.createdArtifactIds as string[];
    createdIds.forEach((id) => artifactIds.add(id));
    expect(createdIds).toHaveLength(1);

    const artifact = await prisma.artifact.findUniqueOrThrow({ where: { id: createdIds[0] } });
    expect(artifact.sourceType).toBe("external_sync");
    const copiedContent = await fs.readFile(resolveWorkspacePath(artifact.filePath), "utf-8");
    expect(copiedContent).toBe("hello from external sync");
  });

  it("skips a manifest whose runId was already imported", async () => {
    const syncFolder = await makeIsolatedSyncFolder();
    const integration = await makeConfiguredIntegration(syncFolder);
    const runId = `dup-${Date.now()}`;
    manifestRunIds.add(runId);
    await fs.writeFile(path.join(syncFolder, `${runId}.manifest.json`), JSON.stringify(manifestPayload(runId)));
    await fs.writeFile(path.join(syncFolder, `${runId}.txt`), "content");

    const first = await scanIntegrationForManifests(integration.id);
    const createdIds = (await prisma.importedManifest.findUniqueOrThrow({ where: { runId } })).createdArtifactIds as string[];
    createdIds.forEach((id) => artifactIds.add(id));
    expect(first).toMatchObject({ scanned: 1, imported: 1, skipped: 0 });

    const second = await scanIntegrationForManifests(integration.id);
    expect(second).toMatchObject({ scanned: 1, imported: 0, skipped: 1 });
  });

  it("marks a malformed manifest invalid instead of throwing", async () => {
    const syncFolder = await makeIsolatedSyncFolder();
    const integration = await makeConfiguredIntegration(syncFolder);
    await fs.writeFile(path.join(syncFolder, "broken.manifest.json"), "{not valid json");

    const result = await scanIntegrationForManifests(integration.id);
    expect(result).toMatchObject({ scanned: 1, imported: 0, skipped: 0, invalid: 1 });
  });

  it("reports zero-scan (not an error) when the sync folder is not configured", async () => {
    const integration = await prisma.integration.create({
      data: { name: "미구성", kind: "local_folder", config: {}, status: "configured" },
    });
    integrationIds.add(integration.id);
    await expect(scanIntegrationForManifests(integration.id)).rejects.toThrow(/동기화 폴더/);
  });
});
