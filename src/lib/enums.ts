import { z } from "zod";

// SQLite has no native enum type — every "enum" column in prisma/schema.prisma
// is a plain String. This file is the single source of truth for the allowed
// values; API routes and MCP tool schemas both import from here.

export const employeeStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "awaiting_approval",
  "needs_review",
  "reviewing",
  "revision_requested",
  "review_blocked",
  "completed",
  "failed",
  "paused",
  "archived",
]);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

// 1(최하)~4(최상)
export const employeeRankSchema = z.number().int().min(1).max(4);
export type EmployeeRank = z.infer<typeof employeeRankSchema>;

// 1(낮음)~4(매우 중요) — Task/Artifact의 검수 강도를 결정
export const importanceSchema = z.number().int().min(1).max(4);
export type Importance = z.infer<typeof importanceSchema>;

export const departmentStatusSchema = z.enum(["active", "archived"]);
export type DepartmentStatus = z.infer<typeof departmentStatusSchema>;

// Real Task rows never hold "draft"/"awaiting_approval" — a task only exists
// as a row once its create-proposal is approved, at which point it's born
// "queued". Those two labels are display-only, for rendering a still-pending
// ApprovalRequest in the approvals inbox as if it were a task.
export const taskStatusSchema = z.enum([
  "queued",
  "running",
  "needs_review",
  "completed",
  "failed",
  "paused",
  "cancelled",
  "archived",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskVirtualStatusSchema = z.enum(["draft", "awaiting_approval"]);
export type TaskVirtualStatus = z.infer<typeof taskVirtualStatusSchema>;

export const taskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const taskStepStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);
export type TaskStepStatus = z.infer<typeof taskStepStatusSchema>;

export const taskLogLevelSchema = z.enum(["info", "warn", "error"]);
export type TaskLogLevel = z.infer<typeof taskLogLevelSchema>;

export const taskArtifactRelationSchema = z.enum(["produced", "referenced"]);
export type TaskArtifactRelation = z.infer<typeof taskArtifactRelationSchema>;

export const artifactSourceTypeSchema = z.enum([
  "task_output",
  "manual_import",
  "external_sync",
  "excel_register",
]);
export type ArtifactSourceType = z.infer<typeof artifactSourceTypeSchema>;

export const automationScheduleTypeSchema = z.enum([
  "interval",
  "cron",
  "manual",
  "external",
]);
export type AutomationScheduleType = z.infer<typeof automationScheduleTypeSchema>;

export const automationApprovalModeSchema = z.enum(["required", "pre_approved"]);
export type AutomationApprovalMode = z.infer<typeof automationApprovalModeSchema>;

export const automationRunSourceSchema = z.enum(["local_manual", "external_import"]);
export type AutomationRunSource = z.infer<typeof automationRunSourceSchema>;

export const automationRunStatusSchema = z.enum(["running", "completed", "failed"]);
export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;

export const skillHealthStatusSchema = z.enum([
  "available",
  "installation_required",
  "configuration_required",
  "connected",
  "disabled",
  "error",
]);
export type SkillHealthStatus = z.infer<typeof skillHealthStatusSchema>;

export const skillSourceSchema = z.enum(["builtin", "mcp", "external"]);
export type SkillSource = z.infer<typeof skillSourceSchema>;

export const skillConnectionTypeSchema = z.enum([
  "none",
  "api_key",
  "oauth_stub",
  "local_tool",
]);
export type SkillConnectionType = z.infer<typeof skillConnectionTypeSchema>;

export const integrationKindSchema = z.enum([
  "local_folder",
  "google_drive_sync",
  "git_repo",
  "excel_watch",
  "generic",
]);
export type IntegrationKind = z.infer<typeof integrationKindSchema>;

export const integrationStatusSchema = z.enum(["not_configured", "configured", "error"]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

// workspace root is implicitly read_write and is never represented by an
// Integration row; every Integration row (always some external path) is
// read_only. Kept as an explicit column/enum rather than a hardcoded
// assumption so path-guard has one place to check.
export const integrationAccessModeSchema = z.enum(["read_only", "read_write"]);
export type IntegrationAccessMode = z.infer<typeof integrationAccessModeSchema>;

// Phase 2: 승인이 필요한 것은 정확히 이 두 가지뿐이다. task/automation/skill/integration
// 승인 경로는 폐지되었다 — 과거(Phase 1) 이력 행은 그대로 남아 있지만 새로 생성되지 않는다.
export const approvalEntityTypeSchema = z.enum(["department", "employee"]);
export type ApprovalEntityType = z.infer<typeof approvalEntityTypeSchema>;

export const approvalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled_by_policy_change",
]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalRiskLevelSchema = z.enum(["standard", "sensitive"]);
export type ApprovalRiskLevel = z.infer<typeof approvalRiskLevelSchema>;

export const activityActorSchema = z.enum(["claude_code", "user", "system"]);
export type ActivityActor = z.infer<typeof activityActorSchema>;

export const importedManifestStatusSchema = z.enum([
  "imported",
  "skipped_duplicate",
  "invalid",
]);
export type ImportedManifestStatus = z.infer<typeof importedManifestStatusSchema>;

export const officeZoneKindSchema = z.enum([
  "open_workspace",
  "private_office",
  "meeting_room",
  "lounge",
  "artifact_area",
  "reception",
]);
export type OfficeZoneKind = z.infer<typeof officeZoneKindSchema>;

export const directionSchema = z.enum(["up", "down", "left", "right"]);
export type Direction = z.infer<typeof directionSchema>;

// ─────────────────────────────────────────────────────────
// Phase 2
// ─────────────────────────────────────────────────────────

export const executionJobStatusSchema = z.enum([
  "pending",
  "claimed",
  "running",
  "completed",
  "failed",
]);
export type ExecutionJobStatus = z.infer<typeof executionJobStatusSchema>;

export const reviewStatusSchema = z.enum([
  "pending",
  "reviewing",
  "approved",
  "revision_requested",
  "rejected",
  "blocked",
]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

// src/lib/review/reviewChain.ts가 이 값으로 실제 검수 체인을 계산한다.
export const reviewChainModeSchema = z.enum([
  "author_plus_one",
  "sequential_to_rank3",
  "min3_then_rank4",
  "full_chain_rank4",
]);
export type ReviewChainMode = z.infer<typeof reviewChainModeSchema>;

export const reviewStrictnessSchema = z.enum(["normal", "strict"]);
export type ReviewStrictness = z.infer<typeof reviewStrictnessSchema>;

export const artifactVersionFormatSchema = z.enum(["markdown", "pdf", "xlsx", "csv", "other"]);
export type ArtifactVersionFormat = z.infer<typeof artifactVersionFormatSchema>;

export const skillValidationStatusSchema = z.enum([
  "unvalidated",
  "validating",
  "passed",
  "failed",
]);
export type SkillValidationStatus = z.infer<typeof skillValidationStatusSchema>;

export const dataAssetSourceTypeSchema = z.enum([
  "task_input",
  "approved_integration",
  "manual_register",
]);
export type DataAssetSourceType = z.infer<typeof dataAssetSourceTypeSchema>;

export const dataAssetSensitivitySchema = z.enum(["public", "internal", "confidential"]);
export type DataAssetSensitivity = z.infer<typeof dataAssetSensitivitySchema>;

export const dataAssetStatusSchema = z.enum(["active", "archived"]);
export type DataAssetStatus = z.infer<typeof dataAssetStatusSchema>;

export const dataAccessActionSchema = z.enum(["read", "write", "search", "reuse"]);
export type DataAccessAction = z.infer<typeof dataAccessActionSchema>;

export const dataAssetTaskRelationSchema = z.enum(["used", "produced"]);
export type DataAssetTaskRelation = z.infer<typeof dataAssetTaskRelationSchema>;

export const rankAuthorizedBySchema = z.enum(["user", "rank4_employee"]);
export type RankAuthorizedBy = z.infer<typeof rankAuthorizedBySchema>;
