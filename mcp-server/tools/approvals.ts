import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createProposal } from "../../src/lib/approvals/propose";
import { getApprovalStatus } from "../../src/lib/approvals/status";
import { approvalEntityTypeSchema, approvalRiskLevelSchema } from "../../src/lib/enums";
import { ok, err } from "../lib/toolResult";

/**
 * approve, reject, and cancel_approval_request tools do not exist here on
 * purpose — approving/rejecting/cancelling a proposal is only ever
 * possible from the web app (a human clicking a button), never from
 * Claude Code. This file only lets Claude create and poll proposals, and
 * only for the two things Phase 2 still requires approval for: creating a
 * department or an employee.
 */
export function registerApprovalTools(server: McpServer) {
  server.registerTool(
    "create_approval_request",
    {
      title: "범용 승인 요청 생성",
      description:
        "entityType/action을 직접 지정해 승인 요청을 생성하는 범용 도구입니다. 승인 실행 화이트리스트(department.create, employee.create만 등록됨)에 없는 조합은 승인되어도 실제로 반영되지 않습니다. 가능하면 propose_department/propose_employee 전용 도구를 사용하세요.",
      inputSchema: {
        entityType: approvalEntityTypeSchema,
        action: z.string().min(1),
        payload: z.record(z.string(), z.unknown()),
        summary: z.string().min(1),
        riskLevel: approvalRiskLevelSchema.optional(),
        idempotencyKey: z.string().optional(),
      },
    },
    async ({ entityType, action, payload, summary, riskLevel, idempotencyKey }) => {
      const result = await createProposal({
        entityType,
        action,
        payload,
        summary,
        riskLevel,
        idempotencyKey,
      });
      if (!result.ok) return err(result.error, result.code);
      return ok(result);
    }
  );

  server.registerTool(
    "get_approval_status",
    {
      title: "승인 요청 상태 조회",
      description: "승인 요청의 현재 상태를 조회합니다. 만료된 pending 요청은 조회 시 자동으로 expired로 반영됩니다.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const approval = await getApprovalStatus(id);
      if (!approval) return err("요청을 찾을 수 없습니다", "not_found");
      return ok({ approval });
    }
  );
}
