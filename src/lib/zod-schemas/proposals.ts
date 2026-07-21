import { z } from "zod";
import {
  automationApprovalModeSchema,
  automationScheduleTypeSchema,
  directionSchema,
  integrationKindSchema,
  skillConnectionTypeSchema,
  skillHealthStatusSchema,
  skillSourceSchema,
  taskPrioritySchema,
} from "@/lib/enums";

// ─────────────────────────────────────────────────────────
// Department
// ─────────────────────────────────────────────────────────

const departmentCreate = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  colorTag: z.string().optional(),
  officeZoneId: z.string().optional(),
});
const departmentUpdate = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  colorTag: z.string().optional(),
  officeZoneId: z.string().optional(),
});
const departmentArchive = z.object({});

export const departmentProposalSchemas = {
  create: departmentCreate,
  update: departmentUpdate,
  archive: departmentArchive,
};

// ─────────────────────────────────────────────────────────
// Employee
// ─────────────────────────────────────────────────────────

const employeeCreate = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  departmentId: z.string().optional(),
  officeZoneId: z.string().min(1),
  posX: z.number().min(0).max(1).default(0.5),
  posY: z.number().min(0).max(1).default(0.5),
  direction: directionSchema.default("down"),
  scale: z.number().positive().default(1),
  avatarId: z.string().min(1),
  skillIds: z.array(z.string()).optional(),
});
const employeeUpdate = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  avatarId: z.string().min(1).optional(),
  skillIds: z.array(z.string()).optional(),
});
const employeeMove = z.object({
  officeZoneId: z.string().min(1),
  posX: z.number().min(0).max(1),
  posY: z.number().min(0).max(1),
  direction: directionSchema.optional(),
});
const employeeArchive = z.object({});

export const employeeProposalSchemas = {
  create: employeeCreate,
  update: employeeUpdate,
  move: employeeMove,
  archive: employeeArchive,
};

// ─────────────────────────────────────────────────────────
// Task
// ─────────────────────────────────────────────────────────

const taskCreate = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  assignedEmployeeId: z.string().optional(),
  collaboratingEmployeeIds: z.array(z.string()).default([]),
  priority: taskPrioritySchema.default("normal"),
  inputFiles: z.array(z.string()).default([]),
  requiredSkills: z.array(z.string()).default([]),
  requestedPermissions: z.array(z.string()).default([]),
});
const taskUpdate = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  priority: taskPrioritySchema.optional(),
  inputFiles: z.array(z.string()).optional(),
  requiredSkills: z.array(z.string()).optional(),
  requestedPermissions: z.array(z.string()).optional(),
});
const taskAssign = z.object({
  assignedEmployeeId: z.string().nullable(),
});
const taskArchive = z.object({});

export const taskProposalSchemas = {
  create: taskCreate,
  update: taskUpdate,
  assign: taskAssign,
  archive: taskArchive,
};

// ─────────────────────────────────────────────────────────
// Automation
// ─────────────────────────────────────────────────────────

const automationCreate = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  taskInstruction: z.string().min(1),
  assignedEmployeeId: z.string().optional(),
  scheduleType: automationScheduleTypeSchema,
  scheduleExpression: z.string().optional(),
  timezone: z.string().optional(),
  requiredSkills: z.array(z.string()).default([]),
  requiredIntegrations: z.array(z.string()).default([]),
  outputFormat: z.string().min(1),
  outputLocation: z.string().optional(),
  approvalMode: automationApprovalModeSchema.default("required"),
});
const automationUpdate = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  taskInstruction: z.string().min(1).optional(),
  assignedEmployeeId: z.string().nullable().optional(),
  scheduleType: automationScheduleTypeSchema.optional(),
  scheduleExpression: z.string().optional(),
  timezone: z.string().optional(),
  requiredSkills: z.array(z.string()).optional(),
  requiredIntegrations: z.array(z.string()).optional(),
  outputFormat: z.string().min(1).optional(),
  outputLocation: z.string().optional(),
});

export const automationProposalSchemas = {
  create: automationCreate,
  update: automationUpdate,
};

// ─────────────────────────────────────────────────────────
// Skill
// ─────────────────────────────────────────────────────────

const skillInstallRequest = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  source: skillSourceSchema,
  connectionType: skillConnectionTypeSchema,
  permissions: z.array(z.string()).default([]),
  configuration: z.record(z.string(), z.unknown()).optional(),
});
const skillUpdate = z.object({
  configuration: z.record(z.string(), z.unknown()).optional(),
  healthStatus: skillHealthStatusSchema.optional(),
});
const skillDisable = z.object({});

export const skillProposalSchemas = {
  install_request: skillInstallRequest,
  update: skillUpdate,
  disable: skillDisable,
};

// ─────────────────────────────────────────────────────────
// Integration
// ─────────────────────────────────────────────────────────

const integrationConfigure = z.object({
  name: z.string().min(1),
  kind: integrationKindSchema,
  config: z.record(z.string(), z.unknown()),
});
const integrationUpdate = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
});
const integrationDisable = z.object({});

export const integrationProposalSchemas = {
  configure: integrationConfigure,
  update: integrationUpdate,
  disable: integrationDisable,
};
