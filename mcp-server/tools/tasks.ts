import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../src/lib/prisma";
import {
  addTaskLog,
  completeTask,
  failTask,
  markTaskNeedsReview,
  startTask,
} from "../../src/lib/execution/taskExecution";
import { createTask, updateTask, assignTask } from "../../src/lib/direct/taskDirect";
import { taskCreateSchema, taskUpdateSchema, taskAssignSchema } from "../../src/lib/zod-schemas/direct-task";
import { completeTaskWithDocument } from "../../src/lib/execution/completeTaskWithDocument";
import { importanceSchema } from "../../src/lib/enums";
import { ok, err } from "../lib/toolResult";

const ERROR_CODE = {
  not_found: "not_found",
  invalid_state: "invalid_state",
  invalid_employee: "invalid_employee",
  pdf_generation_failed: "pdf_generation_failed",
  invalid_path: "invalid_path",
  file_not_found: "file_not_found",
} as const;

export function registerTaskTools(server: McpServer) {
  server.registerTool(
    "list_tasks",
    {
      title: "업무 목록 조회",
      description: "보관되지 않은 업무 목록을 반환합니다.",
      inputSchema: {},
    },
    async () => {
      const tasks = await prisma.task.findMany({
        where: { status: { not: "archived" } },
        include: { assignedEmployee: { select: { id: true, name: true } } },
      });
      return ok({ tasks });
    }
  );

  server.registerTool(
    "get_task",
    {
      title: "업무 상세 조회",
      description: "id로 업무 상세 정보(로그, 결과물 포함)를 반환합니다.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const task = await prisma.task.findUnique({
        where: { id },
        include: { assignedEmployee: true, steps: true, logs: true, artifacts: true },
      });
      if (!task) return err("업무를 찾을 수 없습니다", "not_found");
      return ok({ task });
    }
  );

  server.registerTool(
    "start_task",
    {
      title: "업무 시작",
      description: "이미 승인되어 queued 상태인 업무를 running으로 전환합니다. 승인은 필요 없습니다.",
      inputSchema: { taskId: z.string().min(1) },
    },
    async ({ taskId }) => {
      const result = await startTask(taskId);
      if (!result.ok) return err(result.error, ERROR_CODE[result.code]);
      return ok(result);
    }
  );

  server.registerTool(
    "add_task_log",
    {
      title: "업무 진행 로그 추가",
      description: "업무 진행 상황을 로그로 기록합니다. 상태는 변경하지 않습니다.",
      inputSchema: {
        taskId: z.string().min(1),
        message: z.string().min(1),
        level: z.enum(["info", "warn", "error"]).default("info"),
      },
    },
    async ({ taskId, message, level }) => {
      const result = await addTaskLog(taskId, message, level);
      if (!result.ok) return err(result.error, ERROR_CODE[result.code]);
      return ok(result);
    }
  );

  server.registerTool(
    "mark_task_needs_review",
    {
      title: "업무 검토 필요로 표시",
      description: "running 상태의 업무를 needs_review로 전환합니다.",
      inputSchema: { taskId: z.string().min(1) },
    },
    async ({ taskId }) => {
      const result = await markTaskNeedsReview(taskId);
      if (!result.ok) return err(result.error, ERROR_CODE[result.code]);
      return ok(result);
    }
  );

  server.registerTool(
    "complete_task",
    {
      title: "업무 완료 처리",
      description: "running 또는 needs_review 상태의 업무를 completed로 전환합니다.",
      inputSchema: { taskId: z.string().min(1), resultSummary: z.string().optional() },
    },
    async ({ taskId, resultSummary }) => {
      const result = await completeTask(taskId, resultSummary);
      if (!result.ok) return err(result.error, ERROR_CODE[result.code]);
      return ok(result);
    }
  );

  server.registerTool(
    "fail_task",
    {
      title: "업무 실패 처리",
      description:
        "running 또는 needs_review 상태의 업무를 failed로 전환합니다. 오류를 숨기지 말고 원인을 기록해야 합니다.",
      inputSchema: {
        taskId: z.string().min(1),
        errorMessage: z.string().min(1),
        retryable: z.boolean().default(false),
      },
    },
    async ({ taskId, errorMessage, retryable }) => {
      const result = await failTask(taskId, errorMessage, retryable);
      if (!result.ok) return err(result.error, ERROR_CODE[result.code]);
      return ok(result);
    }
  );

  server.registerTool(
    "create_task",
    {
      title: "업무 생성",
      description:
        "새 업무를 생성합니다. 승인 없이 즉시 queued 상태로 만들어지며, assignedEmployeeId가 유효한(존재·비보관) 직원이면 실행 작업(ExecutionJob)이 함께 생성되어 워커가 곧바로 처리할 수 있게 됩니다. 업무 보관은 웹앱에서 사용자가 직접 처리합니다(이 도구로 불가).",
      inputSchema: taskCreateSchema.shape,
    },
    async (payload) => {
      const result = await createTask(payload, "claude_code");
      if (!result.ok) return err(result.error, ERROR_CODE[result.code]);
      return ok(result);
    }
  );

  server.registerTool(
    "update_task",
    {
      title: "업무 정보 수정",
      description:
        "업무의 일반 정보(제목/설명/우선순위/입력 파일/필요 스킬/요청 권한)를 수정합니다. 상태나 담당자는 이 도구로 변경할 수 없습니다(상태는 start_task 등 실행 도구를, 담당자는 assign_task를 사용).",
      inputSchema: { id: z.string().min(1), data: taskUpdateSchema },
    },
    async ({ id, data }) => {
      const result = await updateTask(id, data, "claude_code");
      if (!result.ok) return err(result.error, ERROR_CODE[result.code]);
      return ok(result);
    }
  );

  server.registerTool(
    "assign_task",
    {
      title: "업무 담당자 배정",
      description:
        "업무의 담당 직원을 배정하거나 변경합니다. 대상 직원은 존재하고 보관되지 않아야 합니다. 업무가 아직 queued 상태이고 실행 작업이 없었다면 이 시점에 ExecutionJob이 생성됩니다.",
      inputSchema: taskAssignSchema.extend({ id: z.string().min(1) }).shape,
    },
    async ({ id, assignedEmployeeId }) => {
      const result = await assignTask(id, assignedEmployeeId, "claude_code");
      if (!result.ok) return err(result.error, ERROR_CODE[result.code]);
      return ok(result);
    }
  );

  server.registerTool(
    "complete_task_with_document",
    {
      title: "문서 결과물과 함께 업무 완료",
      description:
        "사람이 읽는 문서형 결과물이 있는 업무를 완료 처리합니다. markdown 내용(또는 표 요약)으로 한글 폰트가 포함된 PDF를 생성해 workspace에 저장하고 결과물로 등록한 뒤에만 업무를 completed로 전환합니다 — PDF 생성이나 등록에 실패하면 업무 상태는 전혀 바뀌지 않습니다(completed로 거짓 보고하지 않음). CSV/XLSX가 원본인 경우 원본 파일은 별도로 유지하고 이 도구는 표 요약 PDF만 만듭니다(content.kind='table_summary').",
      inputSchema: {
        taskId: z.string().min(1),
        title: z.string().min(1),
        pdfFilePath: z.string().min(1).describe("workspace 상대 경로, 예: workspace/artifacts/report.pdf"),
        content: z.union([
          z.object({ kind: z.literal("markdown"), markdown: z.string().min(1) }),
          z.object({
            kind: z.literal("table_summary"),
            header: z.array(z.string()),
            rows: z.array(z.array(z.string())),
            note: z.string().optional(),
          }),
        ]),
        employeeId: z.string().optional(),
        departmentId: z.string().optional(),
        importance: importanceSchema.optional(),
        resultSummary: z.string().optional(),
      },
    },
    async ({ taskId, title, pdfFilePath, content, employeeId, departmentId, importance, resultSummary }) => {
      const result = await completeTaskWithDocument({
        taskId,
        title,
        pdfFilePath,
        content,
        employeeId,
        departmentId,
        importance,
        resultSummary,
      });
      if (!result.ok) return err(result.error, ERROR_CODE[result.code]);
      return ok(result);
    }
  );
}
