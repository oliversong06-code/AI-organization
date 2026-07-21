import { afterAll, afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { completeTaskWithDocument } from "./completeTaskWithDocument";

const testDir = path.join(process.cwd(), "workspace", "artifacts", "test-complete-with-document");
const relDir = "workspace/artifacts/test-complete-with-document";
let taskIds: string[] = [];
let artifactIds: string[] = [];

afterEach(async () => {
  await prisma.reviewDecision.deleteMany({ where: { artifactVersion: { artifactId: { in: artifactIds } } } });
  await prisma.artifactVersion.deleteMany({ where: { artifactId: { in: artifactIds } } });
  await prisma.artifact.deleteMany({ where: { id: { in: artifactIds } } });
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  taskIds = [];
  artifactIds = [];
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

async function makeRunningTask() {
  const task = await prisma.task.create({
    data: {
      title: "PDF 완료 테스트 업무",
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

describe("completeTaskWithDocument (test.db only, real PDF rendering + real filesystem)", () => {
  it("renders the PDF, registers it, and only then completes the task", async () => {
    const task = await makeRunningTask();
    const pdfFilePath = `${relDir}/report.pdf`;

    const result = await completeTaskWithDocument({
      taskId: task.id,
      title: "완료 테스트 보고서",
      pdfFilePath,
      content: { kind: "markdown", markdown: "# 결과\n\n업무가 정상적으로 완료되었습니다." },
      resultSummary: "PDF 보고서 생성 완료",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    artifactIds.push(result.artifactId);

    const updatedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updatedTask.status).toBe("completed");
    expect(updatedTask.resultSummary).toBe("PDF 보고서 생성 완료");

    const stat = await fs.stat(path.join(process.cwd(), pdfFilePath));
    expect(stat.isFile()).toBe(true);

    const artifact = await prisma.artifact.findUniqueOrThrow({ where: { id: result.artifactId } });
    expect(artifact.taskId).toBe(task.id);
    expect(artifact.mimeType).toBe("application/pdf");
  });

  it("supports a table_summary PDF for CSV/XLSX-sourced tasks", async () => {
    const task = await makeRunningTask();
    const pdfFilePath = `${relDir}/summary.pdf`;

    const result = await completeTaskWithDocument({
      taskId: task.id,
      title: "표 요약",
      pdfFilePath,
      content: { kind: "table_summary", header: ["항목", "값"], rows: [["매출", "100"]] },
    });

    expect(result.ok).toBe(true);
    if (result.ok) artifactIds.push(result.artifactId);
  });

  it("never marks the task completed when the PDF path is invalid", async () => {
    const task = await makeRunningTask();

    const result = await completeTaskWithDocument({
      taskId: task.id,
      title: "잘못된 경로",
      pdfFilePath: "../escape.pdf",
      content: { kind: "markdown", markdown: "내용" },
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_path" });
    const unchangedTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchangedTask.status).toBe("running");
  });

  it("returns not_found for a missing task without generating anything", async () => {
    const result = await completeTaskWithDocument({
      taskId: "nonexistent-id",
      title: "제목",
      pdfFilePath: `${relDir}/never.pdf`,
      content: { kind: "markdown", markdown: "내용" },
    });
    expect(result).toMatchObject({ ok: false, code: "not_found" });

    const exists = await fs
      .stat(path.join(process.cwd(), relDir, "never.pdf"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});
