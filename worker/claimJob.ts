import { prisma } from "../src/lib/prisma";

/**
 * Atomically claims one pending ExecutionJob for this worker process.
 * Picks the oldest pending candidate, then runs a conditional `updateMany`
 * that only succeeds if the row is STILL "pending" — the affected-row
 * count is the race check. If another worker (or another poll tick in the
 * same process) already claimed it, count is 0 and this just returns null;
 * the caller's next poll tick will pick up the next candidate rather than
 * retrying immediately.
 */
export async function claimNextJob(workerId: string) {
  const candidate = await prisma.executionJob.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;

  const claimed = await prisma.executionJob.updateMany({
    where: { id: candidate.id, status: "pending" },
    data: { status: "claimed", workerId, lockedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  return prisma.executionJob.findUniqueOrThrow({ where: { id: candidate.id } });
}
