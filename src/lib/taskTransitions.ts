import type { TaskStatus } from "@/lib/enums";

/**
 * Single source of truth for legal Task status transitions, shared by:
 *  - approval materialization (propose_task action=archive)
 *  - the MCP execution-only tools (start_task/mark_task_needs_review/
 *    complete_task/fail_task) — step 15
 *  - the user-direct-control API routes (pause/resume/cancel/archive) —
 *    step 10
 *
 * Real Task rows are born "queued" (via an approved propose_task
 * action=create) and never exist in "draft"/"awaiting_approval" — those are
 * display-only labels for a still-pending ApprovalRequest.
 */

export type McpExecutionTransition =
  | "start_task"
  | "mark_task_needs_review"
  | "complete_task"
  | "fail_task";

const MCP_TRANSITIONS: Record<McpExecutionTransition, { from: TaskStatus[]; to: TaskStatus }> = {
  start_task: { from: ["queued"], to: "running" },
  mark_task_needs_review: { from: ["running"], to: "needs_review" },
  complete_task: { from: ["running", "needs_review"], to: "completed" },
  fail_task: { from: ["running", "needs_review"], to: "failed" },
};

export type UserControlTransition = "pause" | "resume" | "cancel" | "archive";

const USER_CONTROL_TRANSITIONS: Record<UserControlTransition, { from: TaskStatus[] }> = {
  pause: { from: ["queued", "running", "needs_review"] },
  resume: { from: ["paused"] }, // target is statusBeforePause, resolved by the caller
  cancel: { from: ["queued", "running", "needs_review", "paused"] },
  archive: { from: ["completed", "failed", "cancelled"] },
};

export function canApplyMcpTransition(
  transition: McpExecutionTransition,
  currentStatus: TaskStatus
): boolean {
  return MCP_TRANSITIONS[transition].from.includes(currentStatus);
}

export function mcpTransitionTarget(transition: McpExecutionTransition): TaskStatus {
  return MCP_TRANSITIONS[transition].to;
}

export function canApplyUserControlTransition(
  transition: UserControlTransition,
  currentStatus: TaskStatus
): boolean {
  return USER_CONTROL_TRANSITIONS[transition].from.includes(currentStatus);
}

/** Used by propose_task(action="archive") materialization — Claude may only
 * propose archiving a task that's already in a terminal state, same rule as
 * the user's own direct-control archive button. */
export function canProposeArchive(currentStatus: TaskStatus): boolean {
  return USER_CONTROL_TRANSITIONS.archive.from.includes(currentStatus);
}
