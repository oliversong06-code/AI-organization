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
  "completed",
  "failed",
  "paused",
  "archived",
]);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

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

export const approvalEntityTypeSchema = z.enum([
  "department",
  "employee",
  "task",
  "automation",
  "skill",
  "integration",
]);
export type ApprovalEntityType = z.infer<typeof approvalEntityTypeSchema>;

export const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);
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
