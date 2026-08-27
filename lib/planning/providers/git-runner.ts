import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GitRunner {
  run(
    args: readonly string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
  ): Promise<GitResult>;
}

export class NodeGitRunner implements GitRunner {
  constructor(private readonly gitBinary = "git") {}

  async run(
    args: readonly string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
  ): Promise<GitResult> {
    const { cwd, env, timeoutMs = 30000 } = options;

    // Invariant: Always disable repository hooks
    const finalArgs = ["-c", "core.hooksPath=/dev/null", ...args];

    try {
      const { stdout, stderr } = await execFileAsync(this.gitBinary, finalArgs, {
        cwd,
        env: { ...process.env, ...env },
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      return {
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: 0
      };
    } catch (err: any) {
      return {
        stdout: err.stdout?.toString() || "",
        stderr: err.stderr?.toString() || err.message || "",
        exitCode: typeof err.code === "number" ? err.code : 1
      };
    }
  }
}
