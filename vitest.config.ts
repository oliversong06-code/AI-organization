import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // "server-only" throws when imported outside Next's build pipeline —
      // meaningless (and test-breaking) under plain Node/vitest.
      "server-only": path.resolve(__dirname, "scripts/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./scripts/check-db-target.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "mcp-server/**/*.test.ts"],
    // All test files share one SQLite file (prisma/test.db) via a single
    // libsql connection each. Running files in parallel workers causes
    // occasional SQLITE_BUSY even with WAL + busy_timeout + retry; since
    // this suite is small, trade a bit of speed for reliability.
    fileParallelism: false,
  },
});
