import type { Prisma } from "@/generated/prisma/client";
import type { ActivityActor } from "@/lib/enums";

type TxClient = Prisma.TransactionClient;

interface LogActivityInput {
  actor: ActivityActor;
  action: string;
  entityType?: string;
  entityId?: string;
  detail?: Record<string, unknown>;
  approvalRequestId?: string;
}

/** Writes one ActivityLog row inside the caller's transaction. Never put
 * secrets/API keys/absolute file paths in `detail` — this is meant to be
 * safely displayable in the activity log screen. */
export async function logActivity(tx: TxClient, input: LogActivityInput) {
  await tx.activityLog.create({
    data: {
      actor: input.actor,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      detail: input.detail as Prisma.InputJsonValue | undefined,
      approvalRequestId: input.approvalRequestId,
    },
  });
}
