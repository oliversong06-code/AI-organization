import { spawn } from "node:child_process";

export interface RunTaskInput {
  taskId: string;
  title: string;
  description: string;
  cwd: string;
}

export type RunTaskResult = { ok: true } | { ok: false; error: string };

/** Injectable so tests never spawn a real process — `claude` isn't on this
 * dev sandbox's PATH (verified: `claude --help` fails), and repeatedly
 * spawning a missing binary in a test suite would just be slow, flaky
 * noise. Production code uses realClaudeCliRunner; tests supply a mock. */
export interface ClaudeCliRunner {
  run(input: RunTaskInput): Promise<RunTaskResult>;
}

const CLAUDE_CLI_COMMAND = process.env.CLAUDE_CLI_COMMAND ?? "claude";

function buildPrompt(input: RunTaskInput): string {
  return (
    `당신은 이 회사의 AI 직원입니다. 아래 배정된 업무를 수행하세요.\n` +
    `업무 ID: ${input.taskId}\n제목: ${input.title}\n설명: ${input.description}\n\n` +
    `시작할 때 start_task를, 진행 중에는 add_task_log를, 끝나면 complete_task(실패 시 fail_task)를 ` +
    `반드시 호출해 상태를 남기세요.`
  );
}

/**
 * Spawns the Claude Code CLI non-interactively (`-p`, print-and-exit) to
 * execute exactly one Task. The child process is launched with `cwd` set
 * to this project's root, so it picks up the same `.mcp.json` /
 * `.claude/settings.json` / company-manager skill an interactive session
 * would — it reports progress and completion through the SAME MCP tools
 * (start_task/add_task_log/complete_task/fail_task/register_artifact), so
 * this runner itself never touches a Task row directly. If the `claude`
 * binary isn't on PATH, spawning fails with ENOENT and this resolves
 * `{ ok: false }` instead of throwing, so the caller can fail the Job
 * safely rather than crash the worker loop.
 */
export const realClaudeCliRunner: ClaudeCliRunner = {
  run(input) {
    return new Promise((resolve) => {
      const prompt = buildPrompt(input);
      let settled = false;
      let child;
      try {
        child = spawn(CLAUDE_CLI_COMMAND, ["-p", prompt], { cwd: input.cwd });
      } catch (spawnErr) {
        resolve({ ok: false, error: `claude CLI 실행 실패: ${(spawnErr as Error).message}` });
        return;
      }

      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (spawnErr) => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: `claude CLI를 찾을 수 없습니다: ${spawnErr.message}` });
      });
      child.on("exit", (code) => {
        if (settled) return;
        settled = true;
        if (code === 0) resolve({ ok: true });
        else resolve({ ok: false, error: stderr.trim() || `claude CLI가 종료 코드 ${code}로 실패했습니다` });
      });
    });
  },
};
