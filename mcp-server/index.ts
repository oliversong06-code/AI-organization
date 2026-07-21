import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCompanyTools } from "./tools/company";
import { registerDepartmentTools } from "./tools/departments";
import { registerEmployeeTools } from "./tools/employees";
import { registerTaskTools } from "./tools/tasks";
import { registerArtifactTools } from "./tools/artifacts";
import { registerAutomationTools } from "./tools/automations";
import { registerSkillTools } from "./tools/skills";
import { registerIntegrationTools } from "./tools/integrations";
import { registerApprovalTools } from "./tools/approvals";

/**
 * Local-only MCP server for the AI company app. stdio transport only — no
 * network port is ever opened. Every tool here is allowlisted (see
 * IMPLEMENTATION_PLAN.md §6): 28 tools total, and none of them can
 * approve/reject a proposal, cancel one, or directly mutate an
 * employee/department/automation/skill/integration — only propose_* tools
 * (which write an ApprovalRequest, nothing else) and the Task
 * execution-only tools (start_task/add_task_log/mark_task_needs_review/
 * complete_task/fail_task) plus register_artifact.
 */
async function main() {
  const server = new McpServer({ name: "company-manager", version: "0.1.0" });

  registerCompanyTools(server);
  registerDepartmentTools(server);
  registerEmployeeTools(server);
  registerTaskTools(server);
  registerArtifactTools(server);
  registerAutomationTools(server);
  registerSkillTools(server);
  registerIntegrationTools(server);
  registerApprovalTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
