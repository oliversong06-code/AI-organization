import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { prisma } from "../src/lib/prisma";

const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

/**
 * End-to-end check of the actual MCP server process (spawned via tsx,
 * exactly like Claude Code would run it) against prisma/test.db —
 * DATABASE_URL is explicitly forwarded to the child process since
 * StdioClientTransport does NOT inherit the full parent environment by
 * default. Equivalent in spirit to poking it with the MCP Inspector, but
 * automated and repeatable.
 */
let client: Client;
let transport: StdioClientTransport;
const departmentIds = new Set<string>();
const approvalIds = new Set<string>();

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: process.execPath, // this Node's own binary
    args: [tsxCli, "mcp-server/index.ts"],
    cwd: process.cwd(),
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      PATH: process.env.PATH ?? "",
      SystemRoot: process.env.SystemRoot ?? "", // node on Windows needs this
    },
    stderr: "pipe",
  });
  client = new Client({ name: "test-client", version: "0.1.0" });
  await client.connect(transport);
}, 20000);

afterAll(async () => {
  await client?.close();
  await prisma.department.deleteMany({ where: { id: { in: [...departmentIds] } } });
  await prisma.approvalRequest.deleteMany({ where: { id: { in: [...approvalIds] } } });
});

describe("MCP server (spawned process, test.db only)", () => {
  it("exposes exactly the 28 allowlisted tools and none of the forbidden ones", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toHaveLength(37);

    const forbidden = [
      "approve_request",
      "approve_approval_request",
      "reject_approval_request",
      "cancel_approval_request",
      "update_task_status",
      "pause_task",
      "resume_task",
      "cancel_task",
      "archive_task",
      "pause_automation",
      "archive_automation",
      "archive_employee",
      "archive_department",
      // Phase 2: task/automation/skill/integration no longer go through an
      // approval proposal at all.
      "propose_task",
      "propose_automation",
      "propose_skill",
      "propose_integration",
    ];
    for (const name of forbidden) {
      expect(names).not.toContain(name);
    }

    expect(names).toEqual(
      expect.arrayContaining([
        "get_company_state",
        "get_activity_logs",
        "list_departments",
        "get_department",
        "propose_department",
        "update_department",
        "list_employees",
        "get_employee",
        "propose_employee",
        "update_employee",
        "move_employee",
        "update_employee_rank",
        "list_tasks",
        "get_task",
        "create_task",
        "update_task",
        "assign_task",
        "start_task",
        "add_task_log",
        "mark_task_needs_review",
        "complete_task",
        "fail_task",
        "register_artifact",
        "list_artifacts",
        "get_artifact",
        "submit_review_decision",
        "revise_artifact",
        "list_automations",
        "get_automation",
        "create_automation",
        "update_automation",
        "list_skills",
        "list_integrations",
        "configure_integration",
        "update_integration",
        "create_approval_request",
        "get_approval_status",
      ])
    );
  });

  it("list_departments returns [] against a clean test.db", async () => {
    const result = await client.callTool({ name: "list_departments", arguments: {} });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.departments).toEqual([]);
  });

  it("propose_department creates only an ApprovalRequest, never a real Department", async () => {
    const before = await prisma.department.count();

    const result = await client.callTool({
      name: "propose_department",
      arguments: {
        payload: { name: "MCP 테스트 부서" },
        summary: "MCP 테스트로 생성한 부서 제안",
      },
    });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.ok).toBe(true);
    approvalIds.add(parsed.approvalRequestId);

    const after = await prisma.department.count();
    expect(after).toBe(before);

    const approval = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: parsed.approvalRequestId },
    });
    expect(approval.status).toBe("pending");
    expect(approval.entityType).toBe("department");
  });

  it("create_approval_request refuses an unregistered entityType/action", async () => {
    const result = await client.callTool({
      name: "create_approval_request",
      arguments: {
        entityType: "department",
        action: "delete_forever",
        payload: {},
        summary: "should be rejected",
      },
    });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(result.isError).toBe(true);
    expect(parsed.code).toBe("unknown_action");
  });
});
