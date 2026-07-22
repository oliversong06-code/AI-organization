import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { withTransaction } from "@/lib/withTransaction";
import { logActivity } from "@/lib/activity-log";
import { resolveWorkspacePath, PathTraversalError } from "@/lib/path-guard";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityActor } from "@/lib/enums";

export type DirectResult = { ok: true } | { ok: false; error: string; code: "not_found" };

const MIME_BY_EXT: Record<string, string> = {
  ".json": "application/json",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function inferMimeType(fileName: string): string {
  return MIME_BY_EXT[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

interface StoreDataAssetInput {
  name: string;
  description?: string;
  dataType: string;
  storagePath: string;
  departmentId?: string;
  ownerEmployeeId?: string;
  sourceType: string;
  sourceUri?: string;
  provenance?: string;
  collectedAt?: string;
  validFrom?: string;
  validUntil?: string;
  sensitivity?: string;
  departmentIds?: string[];
  employeeIds?: string[];
}

export type StoreResult =
  | { ok: true; dataAssetId: string }
  | { ok: false; error: string; code: "invalid_path" | "file_not_found" | "duplicate_checksum" };

/**
 * Direct execution — registers an existing workspace file as a DataAsset
 * (the internal material AI employees read/write while working, distinct
 * from Artifact, the human-facing deliverable). Never creates the file
 * itself. Deduplicates by SHA-256 checksum against every other *active*
 * DataAsset — an exact byte-for-byte re-register is refused rather than
 * silently creating a second row, per the plan's "checksum 기반 중복
 * 감지" requirement.
 */
export async function storeDataAsset(
  input: StoreDataAssetInput,
  actor: ActivityActor = "claude_code"
): Promise<StoreResult> {
  let absolutePath: string;
  try {
    absolutePath = resolveWorkspacePath(input.storagePath);
  } catch (e) {
    if (e instanceof PathTraversalError) return { ok: false, error: e.message, code: "invalid_path" };
    throw e;
  }

  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return { ok: false, error: `파일을 찾을 수 없습니다: ${input.storagePath}`, code: "file_not_found" };
  }

  const buffer = await fs.readFile(absolutePath);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

  const existing = await prisma.dataAsset.findFirst({ where: { checksum, status: "active" } });
  if (existing) {
    return {
      ok: false,
      error: `동일한 내용의 데이터 자산이 이미 존재합니다: ${existing.name} (${existing.id})`,
      code: "duplicate_checksum",
    };
  }

  const fileName = path.basename(input.storagePath);

  const dataAssetId = await withTransaction(async (tx) => {
    const created = await tx.dataAsset.create({
      data: {
        name: input.name,
        description: input.description,
        dataType: input.dataType,
        storagePath: input.storagePath,
        mimeType: inferMimeType(fileName),
        size: stat.size,
        departmentId: input.departmentId,
        ownerEmployeeId: input.ownerEmployeeId,
        sourceType: input.sourceType,
        sourceUri: input.sourceUri,
        provenance: input.provenance,
        collectedAt: input.collectedAt ? new Date(input.collectedAt) : undefined,
        validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
        validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        sensitivity: input.sensitivity ?? "internal",
        checksum,
      },
    });

    if (input.departmentIds?.length) {
      await tx.dataAssetDepartment.createMany({
        data: input.departmentIds.map((departmentId) => ({ dataAssetId: created.id, departmentId })),
      });
    }
    if (input.employeeIds?.length) {
      await tx.dataAssetEmployee.createMany({
        data: input.employeeIds.map((employeeId) => ({ dataAssetId: created.id, employeeId })),
      });
    }

    await tx.dataAccessLog.create({
      data: { dataAssetId: created.id, employeeId: input.ownerEmployeeId, action: "write" },
    });
    await logActivity(tx, {
      actor,
      action: "data_asset.store",
      entityType: "data_asset",
      entityId: created.id,
      detail: { name: input.name, dataType: input.dataType },
    });

    return created.id;
  });

  return { ok: true, dataAssetId };
}

interface UpdateDataAssetInput {
  name?: string;
  description?: string;
  dataType?: string;
  departmentId?: string | null;
  ownerEmployeeId?: string | null;
  provenance?: string;
  validFrom?: string | null;
  validUntil?: string | null;
  sensitivity?: string;
}

/** Direct execution — general field edits. storagePath/checksum are
 * immutable after creation (a changed file is a new DataAsset, not an
 * edit — mirrors how Artifact never overwrites a version's file either). */
export async function updateDataAsset(
  id: string,
  data: UpdateDataAssetInput,
  actor: ActivityActor = "claude_code"
): Promise<DirectResult> {
  const existing = await prisma.dataAsset.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "데이터 자산을 찾을 수 없습니다", code: "not_found" };

  await withTransaction(async (tx) => {
    await tx.dataAsset.update({
      where: { id },
      data: {
        ...data,
        validFrom: data.validFrom === undefined ? undefined : data.validFrom ? new Date(data.validFrom) : null,
        validUntil: data.validUntil === undefined ? undefined : data.validUntil ? new Date(data.validUntil) : null,
        version: { increment: 1 },
      },
    });
    await logActivity(tx, {
      actor,
      action: "data_asset.update",
      entityType: "data_asset",
      entityId: id,
      detail: { fields: Object.keys(data) },
    });
  });

  return { ok: true };
}

/** Direct execution — soft-archive, never delete. */
export async function archiveDataAsset(id: string, actor: ActivityActor = "claude_code"): Promise<DirectResult> {
  const existing = await prisma.dataAsset.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "데이터 자산을 찾을 수 없습니다", code: "not_found" };

  await withTransaction(async (tx) => {
    await tx.dataAsset.update({ where: { id }, data: { status: "archived" } });
    await logActivity(tx, { actor, action: "data_asset.archive", entityType: "data_asset", entityId: id });
  });

  return { ok: true };
}

export type LinkTaskResult = { ok: true } | { ok: false; error: string; code: "not_found" | "already_linked" };

/** Direct execution — links a DataAsset to a Task it was used by or
 * produced by, and records the access. `produced` counts as a write,
 * `used` counts as a reuse — matches DataAccessLog.action's vocabulary. */
export async function linkDataAssetToTask(
  dataAssetId: string,
  taskId: string,
  relation: "used" | "produced",
  employeeId: string | undefined,
  actor: ActivityActor = "claude_code"
): Promise<LinkTaskResult> {
  const [asset, task] = await Promise.all([
    prisma.dataAsset.findUnique({ where: { id: dataAssetId } }),
    prisma.task.findUnique({ where: { id: taskId } }),
  ]);
  if (!asset) return { ok: false, error: "데이터 자산을 찾을 수 없습니다", code: "not_found" };
  if (!task) return { ok: false, error: "업무를 찾을 수 없습니다", code: "not_found" };

  const existingLink = await prisma.dataAssetTask.findUnique({
    where: { dataAssetId_taskId: { dataAssetId, taskId } },
  });
  if (existingLink) return { ok: false, error: "이미 연결되어 있습니다", code: "already_linked" };

  await withTransaction(async (tx) => {
    await tx.dataAssetTask.create({ data: { dataAssetId, taskId, relation } });
    await tx.dataAccessLog.create({
      data: { dataAssetId, employeeId, taskId, action: relation === "produced" ? "write" : "reuse" },
    });
    await logActivity(tx, {
      actor,
      action: "data_asset.link_task",
      entityType: "data_asset",
      entityId: dataAssetId,
      detail: { taskId, relation },
    });
  });

  return { ok: true };
}

export interface SearchDataAssetsQuery {
  text?: string;
  dataType?: string;
  departmentId?: string;
  sensitivity?: string;
  includeExpired?: boolean;
}

/** Read-only — active assets only, and (unless includeExpired) only ones
 * whose validUntil hasn't passed, per the plan's "유효기간 확인" rule. */
export async function searchDataAssets(query: SearchDataAssetsQuery) {
  const now = new Date();
  const and: Prisma.DataAssetWhereInput[] = [{ status: "active" }];
  if (query.dataType) and.push({ dataType: query.dataType });
  if (query.departmentId) and.push({ departmentId: query.departmentId });
  if (query.sensitivity) and.push({ sensitivity: query.sensitivity });
  if (query.text) {
    and.push({ OR: [{ name: { contains: query.text } }, { description: { contains: query.text } }] });
  }
  if (!query.includeExpired) {
    and.push({ OR: [{ validUntil: null }, { validUntil: { gte: now } }] });
  }

  return prisma.dataAsset.findMany({ where: { AND: and }, orderBy: { createdAt: "desc" } });
}

/** Read-only — fetches one asset and, when an employeeId/taskId is
 * supplied, logs the read so DataAccessLog reflects real usage. */
export async function getDataAssetAndLogAccess(
  id: string,
  options: { employeeId?: string; taskId?: string } = {}
) {
  const asset = await prisma.dataAsset.findUnique({ where: { id } });
  if (!asset) return null;
  await prisma.dataAccessLog.create({
    data: { dataAssetId: id, employeeId: options.employeeId, taskId: options.taskId, action: "read" },
  });
  return asset;
}
