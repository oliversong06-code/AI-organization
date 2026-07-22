import { z } from "zod";
import { dataAssetSourceTypeSchema, dataAssetSensitivitySchema, dataAssetTaskRelationSchema } from "@/lib/enums";

/**
 * Direct-execution (no ApprovalRequest) schemas for the DataAsset
 * subsystem — an internal-only store for the material AI employees read/
 * write while working (as opposed to Artifact, which is the
 * human-facing deliverable store). Nothing here has ever needed approval.
 */

export const dataAssetStoreSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  dataType: z.string().min(1),
  storagePath: z.string().min(1).describe("workspace 상대 경로 — 파일이 이미 존재해야 합니다"),
  departmentId: z.string().optional(),
  ownerEmployeeId: z.string().optional(),
  sourceType: dataAssetSourceTypeSchema,
  sourceUri: z.string().optional(),
  provenance: z.string().optional(),
  collectedAt: z.string().datetime().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  sensitivity: dataAssetSensitivitySchema.default("internal"),
  departmentIds: z.array(z.string()).optional(),
  employeeIds: z.array(z.string()).optional(),
});

export const dataAssetUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  dataType: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  ownerEmployeeId: z.string().nullable().optional(),
  provenance: z.string().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  sensitivity: dataAssetSensitivitySchema.optional(),
});

export const dataAssetSearchSchema = z.object({
  text: z.string().optional(),
  dataType: z.string().optional(),
  departmentId: z.string().optional(),
  sensitivity: dataAssetSensitivitySchema.optional(),
  includeExpired: z.boolean().default(false),
});

export const dataAssetLinkTaskSchema = z.object({
  dataAssetId: z.string().min(1),
  taskId: z.string().min(1),
  relation: dataAssetTaskRelationSchema,
  employeeId: z.string().optional(),
});
