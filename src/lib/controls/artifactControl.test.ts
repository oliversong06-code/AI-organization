import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { archiveArtifact } from "./artifactControl";

const ids = new Set<string>();
afterAll(async () => {
  await prisma.artifact.deleteMany({ where: { id: { in: [...ids] } } });
});

describe("archiveArtifact (test.db only)", () => {
  it("archives an artifact and blocks re-archiving", async () => {
    const artifact = await prisma.artifact.create({
      data: { title: "테스트 결과물", fileName: "a.txt", filePath: "workspace/artifacts/a.txt", mimeType: "text/plain", size: 1, sourceType: "manual_import" },
    });
    ids.add(artifact.id);

    const first = await archiveArtifact(artifact.id);
    expect(first.ok).toBe(true);
    const updated = await prisma.artifact.findUniqueOrThrow({ where: { id: artifact.id } });
    expect(updated.archivedAt).not.toBeNull();

    const second = await archiveArtifact(artifact.id);
    expect(second).toMatchObject({ ok: false, code: "invalid_state" });
  });
});
