import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globalSetup: ["./scripts/check-db-target.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "mcp-server/**/*.test.ts"],
  },
});
