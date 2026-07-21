import path from "node:path";

/**
 * Vitest globalSetup. Aborts the whole test run before any test executes
 * if DATABASE_URL resolves to prisma/dev.db — tests must only ever touch
 * prisma/test.db. Also prints the resolved path so it's visible in CI/local
 * output without having to go dig for it.
 */
export default function setup() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL is not set. Run tests via `npm test` (loads .env.test through dotenv-cli), not `vitest` directly."
    );
  }

  const filePath = raw.replace(/^file:/, "");
  const resolved = path.resolve(process.cwd(), filePath);
  const devDb = path.resolve(process.cwd(), "prisma", "dev.db");

  console.log(`[check-db-target] tests will use: ${resolved}`);

  if (resolved === devDb) {
    throw new Error(
      `Refusing to run tests: DATABASE_URL resolves to prisma/dev.db (${devDb}). ` +
        "Tests must only ever run against prisma/test.db. Use `npm test` / `npm run test:studio`, " +
        "which load .env.test via dotenv-cli, instead of running vitest/prisma directly."
    );
  }

  if (path.basename(resolved) !== "test.db") {
    console.warn(
      `[check-db-target] warning: DATABASE_URL does not point at a file named test.db (got ${resolved}). ` +
        "Double-check .env.test before trusting this test run."
    );
  }
}
