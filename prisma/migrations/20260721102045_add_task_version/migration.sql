-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedEmployeeId" TEXT,
    "collaboratingEmployeeIds" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "statusBeforePause" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "inputFiles" JSONB NOT NULL,
    "requiredSkills" JSONB NOT NULL,
    "requestedPermissions" JSONB NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "resultSummary" TEXT,
    "errorMessage" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvalRequestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "Task_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("approvalRequestId", "approvedAt", "assignedEmployeeId", "collaboratingEmployeeIds", "completedAt", "createdAt", "description", "errorMessage", "id", "inputFiles", "priority", "progress", "requestedPermissions", "requiredSkills", "resultSummary", "retryable", "startedAt", "status", "statusBeforePause", "title") SELECT "approvalRequestId", "approvedAt", "assignedEmployeeId", "collaboratingEmployeeIds", "completedAt", "createdAt", "description", "errorMessage", "id", "inputFiles", "priority", "progress", "requestedPermissions", "requiredSkills", "resultSummary", "retryable", "startedAt", "status", "statusBeforePause", "title" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
