import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { resolveWorkspacePath, PathTraversalError } from "@/lib/path-guard";
import { renderMarkdownToPdfBuffer } from "@/lib/pdf/markdownToPdf";
import { renderTableSummaryToPdfBuffer } from "@/lib/pdf/tableSummaryToPdf";
import { registerArtifactDirect } from "@/lib/artifacts/registerArtifact";
import { completeTask } from "./taskExecution";

export type DocumentContent =
  | { kind: "markdown"; markdown: string }
  | { kind: "table_summary"; header: string[]; rows: string[][]; note?: string };

export interface CompleteTaskWithDocumentInput {
  taskId: string;
  title: string;
  /** workspace-relative destination for the generated PDF, e.g.
   * "workspace/artifacts/report.pdf" */
  pdfFilePath: string;
  content: DocumentContent;
  employeeId?: string;
  departmentId?: string;
  importance?: number;
  resultSummary?: string;
}

export type CompleteWithDocumentResult =
  | { ok: true; artifactId: string }
  | {
      ok: false;
      error: string;
      code: "not_found" | "invalid_state" | "pdf_generation_failed" | "invalid_path" | "file_not_found";
    };

/**
 * The one structural guarantee behind "PDF 생성 실패 시 업무를 completed로
 * 처리하지 않는다": renders the PDF and registers it as an Artifact BEFORE
 * ever calling completeTask. If rendering throws, or the file can't be
 * written, or registerArtifactDirect rejects it (bad path, missing file
 * after write — shouldn't happen, but treated the same), this returns a
 * failure and the Task's status is never touched, left exactly where it
 * was (running/needs_review) so the caller can retry rather than the work
 * silently vanishing behind a false "completed".
 */
export async function completeTaskWithDocument(
  input: CompleteTaskWithDocumentInput
): Promise<CompleteWithDocumentResult> {
  const task = await prisma.task.findUnique({ where: { id: input.taskId } });
  if (!task) return { ok: false, error: "업무를 찾을 수 없습니다", code: "not_found" };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer =
      input.content.kind === "markdown"
        ? await renderMarkdownToPdfBuffer(input.title, input.content.markdown)
        : await renderTableSummaryToPdfBuffer({
            title: input.title,
            header: input.content.header,
            rows: input.content.rows,
            note: input.content.note,
          });
  } catch (e) {
    return { ok: false, error: `PDF 생성 실패: ${(e as Error).message}`, code: "pdf_generation_failed" };
  }

  let absolutePath: string;
  try {
    absolutePath = resolveWorkspacePath(input.pdfFilePath);
  } catch (e) {
    if (e instanceof PathTraversalError) return { ok: false, error: e.message, code: "invalid_path" };
    throw e;
  }

  try {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, pdfBuffer);
  } catch (e) {
    return { ok: false, error: `PDF 파일 저장 실패: ${(e as Error).message}`, code: "pdf_generation_failed" };
  }

  const registerResult = await registerArtifactDirect({
    taskId: input.taskId,
    employeeId: input.employeeId,
    departmentId: input.departmentId,
    title: input.title,
    filePath: input.pdfFilePath,
    sourceType: "task_output",
    importance: input.importance,
  });
  if (!registerResult.ok) {
    return { ok: false, error: registerResult.error, code: registerResult.code };
  }

  const completion = await completeTask(input.taskId, input.resultSummary);
  if (!completion.ok) {
    return { ok: false, error: completion.error, code: completion.code };
  }

  return { ok: true, artifactId: registerResult.artifactId };
}
