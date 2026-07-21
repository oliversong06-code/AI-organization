-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeZoneId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "normX" REAL NOT NULL,
    "normY" REAL NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'desk',
    "employeeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Seat_officeZoneId_fkey" FOREIGN KEY ("officeZoneId") REFERENCES "OfficeZone" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Seat_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExecutionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "workerId" TEXT,
    "lockedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExecutionJob_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArtifactVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "authorEmployeeId" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArtifactDepartment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtifactDepartment_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArtifactDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importance" INTEGER NOT NULL,
    "description" TEXT,
    "chainMode" TEXT NOT NULL,
    "finalReviewerMinRank" INTEGER NOT NULL,
    "maxRevisions" INTEGER NOT NULL DEFAULT 3,
    "strictness" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactVersionId" TEXT NOT NULL,
    "reviewerEmployeeId" TEXT NOT NULL,
    "reviewerRank" INTEGER NOT NULL,
    "sequenceIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "criteria" TEXT,
    "issuesFound" TEXT,
    "revisionRequest" TEXT,
    "decisionReason" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewDecision_artifactVersionId_fkey" FOREIGN KEY ("artifactVersionId") REFERENCES "ArtifactVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReviewDecision_reviewerEmployeeId_fkey" FOREIGN KEY ("reviewerEmployeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "departmentId" TEXT,
    "ownerEmployeeId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceUri" TEXT,
    "provenance" TEXT,
    "collectedAt" DATETIME,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "sensitivity" TEXT NOT NULL DEFAULT 'internal',
    "version" INTEGER NOT NULL DEFAULT 1,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DataAsset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DataAsset_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataAssetDepartment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataAssetId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataAssetDepartment_dataAssetId_fkey" FOREIGN KEY ("dataAssetId") REFERENCES "DataAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DataAssetDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataAssetEmployee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataAssetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataAssetEmployee_dataAssetId_fkey" FOREIGN KEY ("dataAssetId") REFERENCES "DataAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DataAssetEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataAssetTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataAssetId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'used',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataAssetTask_dataAssetId_fkey" FOREIGN KEY ("dataAssetId") REFERENCES "DataAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DataAssetTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataAccessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dataAssetId" TEXT NOT NULL,
    "employeeId" TEXT,
    "taskId" TEXT,
    "action" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataAccessLog_dataAssetId_fkey" FOREIGN KEY ("dataAssetId") REFERENCES "DataAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Artifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "employeeId" TEXT,
    "departmentId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "externalSourceId" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 2,
    "currentReviewStatus" TEXT NOT NULL DEFAULT 'approved',
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
    CONSTRAINT "Artifact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Artifact_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Artifact" ("archivedAt", "createdAt", "employeeId", "externalSourceId", "fileName", "filePath", "id", "metadata", "mimeType", "size", "sourceType", "summary", "taskId", "title") SELECT "archivedAt", "createdAt", "employeeId", "externalSourceId", "fileName", "filePath", "id", "metadata", "mimeType", "size", "sourceType", "summary", "taskId", "title" FROM "Artifact";
DROP TABLE "Artifact";
ALTER TABLE "new_Artifact" RENAME TO "Artifact";
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "departmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "officeZoneId" TEXT NOT NULL,
    "posX" REAL NOT NULL,
    "posY" REAL NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'down',
    "scale" REAL NOT NULL DEFAULT 1,
    "avatarId" TEXT NOT NULL,
    "currentTaskId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvalRequestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Employee_officeZoneId_fkey" FOREIGN KEY ("officeZoneId") REFERENCES "OfficeZone" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("approvalRequestId", "archivedAt", "avatarId", "createdAt", "currentTaskId", "departmentId", "direction", "id", "name", "officeZoneId", "posX", "posY", "role", "scale", "status", "updatedAt", "version") SELECT "approvalRequestId", "archivedAt", "avatarId", "createdAt", "currentTaskId", "departmentId", "direction", "id", "name", "officeZoneId", "posX", "posY", "role", "scale", "status", "updatedAt", "version" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE TABLE "new_OfficeZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultDisplayName" TEXT NOT NULL DEFAULT '미배정 공간',
    "displayName" TEXT,
    "kind" TEXT NOT NULL,
    "rectNormX0" REAL NOT NULL,
    "rectNormY0" REAL NOT NULL,
    "rectNormX1" REAL NOT NULL,
    "rectNormY1" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_OfficeZone" ("createdAt", "id", "key", "kind", "name", "rectNormX0", "rectNormX1", "rectNormY0", "rectNormY1") SELECT "createdAt", "id", "key", "kind", "name", "rectNormX0", "rectNormX1", "rectNormY0", "rectNormY1" FROM "OfficeZone";
DROP TABLE "OfficeZone";
ALTER TABLE "new_OfficeZone" RENAME TO "OfficeZone";
CREATE UNIQUE INDEX "OfficeZone_key_key" ON "OfficeZone"("key");
CREATE TABLE "new_Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "permissions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "installed" BOOLEAN NOT NULL DEFAULT false,
    "healthStatus" TEXT NOT NULL DEFAULT 'available',
    "configuration" JSONB,
    "instructions" TEXT,
    "allowedTools" JSONB,
    "compatibleRanks" JSONB,
    "compatibleDepartments" JSONB,
    "validationStatus" TEXT NOT NULL DEFAULT 'unvalidated',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Skill" ("category", "configuration", "connectionType", "createdAt", "description", "enabled", "healthStatus", "id", "inputSchema", "installed", "name", "outputSchema", "permissions", "source", "updatedAt", "version") SELECT "category", "configuration", "connectionType", "createdAt", "description", "enabled", "healthStatus", "id", "inputSchema", "installed", "name", "outputSchema", "permissions", "source", "updatedAt", "version" FROM "Skill";
DROP TABLE "Skill";
ALTER TABLE "new_Skill" RENAME TO "Skill";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Seat_employeeId_key" ON "Seat"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_officeZoneId_index_key" ON "Seat"("officeZoneId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactVersion_artifactId_versionNumber_key" ON "ArtifactVersion"("artifactId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactDepartment_artifactId_departmentId_key" ON "ArtifactDepartment"("artifactId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewPolicy_importance_key" ON "ReviewPolicy"("importance");

-- CreateIndex
CREATE UNIQUE INDEX "DataAssetDepartment_dataAssetId_departmentId_key" ON "DataAssetDepartment"("dataAssetId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DataAssetEmployee_dataAssetId_employeeId_key" ON "DataAssetEmployee"("dataAssetId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "DataAssetTask_dataAssetId_taskId_key" ON "DataAssetTask"("dataAssetId", "taskId");
