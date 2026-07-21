import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma/client";

// Same DATABASE_URL resolution used by prisma.config.ts (verified empirically
// against the installed Prisma 7 / libSQL adapter: resolved relative to the
// process working directory, not relative to schema.prisma).
const DATABASE_URL = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaLibSql({ url: DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Reuse the client across Next.js dev hot-reloads instead of opening a new
// SQLite connection on every module reload.
export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

let pragmasReady: Promise<void> | null = null;

/**
 * Enables WAL journaling and a busy timeout so the Next.js process and the
 * MCP server process (both writing to the same SQLite file) don't hit
 * SQLITE_BUSY on a bare lock conflict. Memoized — safe to call repeatedly.
 * Every mutation path (withTransaction) awaits this before writing; plain
 * reads don't, since a pragma race on the very first request is harmless.
 */
export function ensurePragmas(): Promise<void> {
  if (!pragmasReady) {
    pragmasReady = (async () => {
      await prisma.$executeRawUnsafe("PRAGMA journal_mode = WAL;");
      await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000;");
    })();
  }
  return pragmasReady;
}

void ensurePragmas();
