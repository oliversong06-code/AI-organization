import { prisma, ensurePragmas } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

/**
 * Wraps every mutation (from Next.js API routes AND, once built, the MCP
 * server) in a transaction with retry-on-SQLITE_BUSY — the two processes
 * write to the same SQLite file, so a lock conflict is expected
 * occasionally even with WAL mode + busy_timeout. Exponential backoff,
 * max 3 attempts.
 */
export async function withTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
  options?: { maxRetries?: number }
): Promise<T> {
  await ensurePragmas();
  const maxRetries = options?.maxRetries ?? 3;

  let attempt = 0;
  for (;;) {
    try {
      return await prisma.$transaction((tx) => fn(tx));
    } catch (err) {
      attempt += 1;
      if (!isBusyError(err) || attempt >= maxRetries) {
        throw err;
      }
      const delayMs = 50 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function isBusyError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /SQLITE_BUSY|database is locked/i.test(message);
}
