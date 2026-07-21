import "dotenv/config";
import { runWorkerLoop } from "./runWorker";

/**
 * Entry point for `npm run worker`. Long-running process — polls
 * ExecutionJob for pending work and spawns the Claude Code CLI
 * non-interactively per task (see claudeCliRunner.ts). Not started
 * automatically by anything; the user runs this alongside `npm run dev`
 * when they want tasks to actually execute.
 */
runWorkerLoop().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
