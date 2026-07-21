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
import { ok, err } from "../lib/toolResult";

const ERROR_CODE = { not_found: "not_found", invalid_state: "invalid_state" } as const;

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
}
