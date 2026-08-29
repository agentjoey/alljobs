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
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; denyExternalCommands?: boolean }
  ): Promise<GitResult>;
}

export class NodeGitRunner implements GitRunner {
  constructor(private readonly gitBinary = "git") {}

  async run(
    args: readonly string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; denyExternalCommands?: boolean } = {}
  ): Promise<GitResult> {
    const { cwd, env, timeoutMs = 30000, denyExternalCommands = false } = options;

    const denyExternalCommandConfig = denyExternalCommands ? [
      "-c", "core.fsmonitor=false",
      "-c", "core.hooksPath=/dev/null",
      "-c", "core.pager=cat",
      "-c", "pager.status=false",
      "-c", "interactive.diffFilter=",
      "-c", "submodule.recurse=false"
    ] : ["-c", "core.hooksPath=/dev/null"];
    const finalArgs = ["--no-pager", ...denyExternalCommandConfig, ...args];

    // Strip inherited GIT_* variables (GIT_DIR, GIT_WORK_TREE, GIT_SSH_COMMAND,
    // ...) so a poisoned environment cannot redirect repository operations
    const baseEnv: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(baseEnv)) {
      if (key.startsWith("GIT_")) delete baseEnv[key];
    }

    try {
      const { stdout, stderr } = await execFileAsync(this.gitBinary, finalArgs, {
        cwd,
        env: {
          ...baseEnv,
          ...env,
          ...(denyExternalCommands ? {
            GIT_OPTIONAL_LOCKS: "0",
            GIT_NO_LAZY_FETCH: "1",
            GIT_PAGER: "cat",
            GIT_EXTERNAL_DIFF: "",
            GIT_TERMINAL_PROMPT: "0"
          } : {})
        },
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
