import { afterAll, afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { registerArtifactDirect, inferMimeType, inferFormat } from "./registerArtifact";

const testDir = path.join(process.cwd(), "workspace", "artifacts", "test-register-artifact");
const relDir = "workspace/artifacts/test-register-artifact";
let artifactIds: string[] = [];

afterEach(async () => {
  await prisma.reviewDecision.deleteMany({ where: { artifactVersion: { artifactId: { in: artifactIds } } } });
  await prisma.artifactVersion.deleteMany({ where: { artifactId: { in: artifactIds } } });
  await prisma.artifact.deleteMany({ where: { id: { in: artifactIds } } });
  artifactIds = [];
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe("inferMimeType / inferFormat (pure)", () => {
  it("maps known extensions", () => {
    expect(inferMimeType("report.md")).toBe("text/markdown");
    expect(inferFormat("report.md")).toBe("markdown");
    expect(inferFormat("report.pdf")).toBe("pdf");
    expect(inferFormat("data.xlsx")).toBe("xlsx");
    expect(inferFormat("unknown.bin")).toBe("other");
  });
});

describe("registerArtifactDirect (test.db only, real filesystem under workspace/)", () => {
  it("creates an Artifact + v1 ArtifactVersion and starts the review chain", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const filePath = `${relDir}/report.md`;
    await fs.writeFile(path.join(process.cwd(), filePath), "# 제목\n\n본문");

    const result = await registerArtifactDirect({
      title: "테스트 결과물",
      filePath,
      sourceType: "task_output",
      importance: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    artifactIds.push(result.artifactId);

    const artifact = await prisma.artifact.findUniqueOrThrow({ where: { id: result.artifactId } });
    expect(artifact.fileName).toBe("report.md");
    expect(["pending", "reviewing", "approved", "blocked"]).toContain(artifact.currentReviewStatus);

    const versions = await prisma.artifactVersion.findMany({ where: { artifactId: result.artifactId } });
    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].format).toBe("markdown");
  });

  it("rejects a path that escapes the workspace root", async () => {
    const result = await registerArtifactDirect({
      title: "잘못된 경로",
      filePath: "../outside.md",
      sourceType: "task_output",
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_path" });
  });

  it("rejects a file that doesn't exist on disk", async () => {
    const result = await registerArtifactDirect({
      title: "존재하지 않는 파일",
      filePath: `${relDir}/does-not-exist.md`,
      sourceType: "task_output",
    });
    expect(result).toMatchObject({ ok: false, code: "file_not_found" });
  });
});
