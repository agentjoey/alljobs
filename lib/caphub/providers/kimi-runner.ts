import "server-only";

import { spawn } from "node:child_process";
import { chmod, copyFile, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderInvocationError } from "./contracts";
import { startKimiEgressProxy } from "./kimi-egress-proxy";
import { projectKimiLocalCredentials } from "./kimi-local-credentials";

const MAX_EVENTS = 256;
const DEFAULT_STDOUT_CAP = 1024 * 1024;
const DEFAULT_STDERR_CAP = 64 * 1024;

function quoteSeatbelt(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function buildKimiSeatbeltProfile(options: {
  temporaryRoot: string;
  executablePath: string;
  deniedReadPaths?: readonly string[];
}): string {
  const root = quoteSeatbelt(options.temporaryRoot);
  const executable = quoteSeatbelt(options.executablePath);
  const deniedReads = [...new Set(options.deniedReadPaths ?? [])]
    .map((path) => {
      const escaped = quoteSeatbelt(path);
      return `(deny file-read* (literal "${escaped}") (subpath "${escaped}"))`;
    });
  return [
    "(version 1)",
    "(deny default)",
    '(import "system.sb")',
    `(allow process-exec (literal "${executable}"))`,
    "(allow file-read-metadata)",
    `(allow file-read* (literal "${executable}") (subpath "${root}"))`,
    ...deniedReads,
    `(allow file-write* (subpath "${root}"))`,
    "(allow sysctl-read)",
    "(allow mach-lookup (global-name \"com.apple.system.logger\"))",
    "(allow network-outbound (remote tcp \"localhost:*\"))",
    "(allow signal (target self))"
  ].join("\n");
}

function containsToolCall(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsToolCall);
  const record = value as Record<string, unknown>;
  if (typeof record.type === "string" && /tool/i.test(record.type)) return true;
  return Object.values(record).some(containsToolCall);
}

export function parseKimiStreamJson(stdout: string): {
  terminalText: string;
  eventCount: number;
  usage: { inputTokens: number; outputTokens: number };
} {
  const lines = stdout.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0 || lines.length > MAX_EVENTS) {
    throw new ProviderInvocationError("INVALID_OUTPUT");
  }
  const terminal: Array<{
    text: string;
    usage: { inputTokens: number; outputTokens: number };
  }> = [];
  for (const line of lines) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new ProviderInvocationError("INVALID_OUTPUT", { cause: error });
    }
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new ProviderInvocationError("INVALID_OUTPUT");
    }
    if (containsToolCall(event)) throw new ProviderInvocationError("PERMISSION");
    const record = event as Record<string, unknown>;
    if (record.type === "result" && record.subtype === "success" && typeof record.result === "string") {
      const usage = record.usage;
      if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
        throw new ProviderInvocationError("INVALID_OUTPUT");
      }
      const rawUsage = usage as Record<string, unknown>;
      if (!Number.isInteger(rawUsage.input_tokens)
        || Number(rawUsage.input_tokens) < 0
        || !Number.isInteger(rawUsage.output_tokens)
        || Number(rawUsage.output_tokens) < 0) {
        throw new ProviderInvocationError("INVALID_OUTPUT");
      }
      terminal.push({
        text: record.result,
        usage: {
          inputTokens: Number(rawUsage.input_tokens),
          outputTokens: Number(rawUsage.output_tokens)
        }
      });
    }
  }
  if (terminal.length !== 1) throw new ProviderInvocationError("INVALID_OUTPUT");
  return { terminalText: terminal[0].text, eventCount: lines.length, usage: terminal[0].usage };
}

type SpawnResult = {
  stdout: string;
  stderrBytes: number;
  argv: string[];
  environment: Readonly<Record<string, string>>;
  cwd: string;
};

async function spawnBounded(options: {
  argv: string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  stdoutCap?: number;
  stderrCap?: number;
  signal?: AbortSignal;
}): Promise<SpawnResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(options.argv[0], options.argv.slice(1), {
      cwd: options.cwd,
      env: { ...options.env } as NodeJS.ProcessEnv,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"] as const
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const terminate = () => {
      if (child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      }
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      terminate();
      reject(error);
    };
    const onAbort = () => fail(new ProviderInvocationError("ABORTED"));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > (options.stdoutCap ?? DEFAULT_STDOUT_CAP)) {
        fail(new ProviderInvocationError("INVALID_OUTPUT"));
      } else {
        stdout.push(chunk);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > (options.stderrCap ?? DEFAULT_STDERR_CAP)) {
        fail(new ProviderInvocationError("INVALID_OUTPUT"));
      }
    });
    child.once("error", (error) => fail(new ProviderInvocationError("UNAVAILABLE", { cause: error })));
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (code !== 0) return reject(new ProviderInvocationError("UNAVAILABLE"));
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderrBytes,
        argv: options.argv,
        environment: options.env,
        cwd: options.cwd
      });
    });
    const timer = setTimeout(() => fail(new ProviderInvocationError("TIMEOUT")), options.timeoutMs);
    if (options.signal?.aborted) onAbort();
  });
}

export interface SandboxedKimiRunResult {
  terminalText: string;
  eventCount: number;
  stdoutBytes: number;
  stderrBytes: number;
  usage: { inputTokens: number; outputTokens: number };
  cleanup: () => Promise<void>;
}

export async function runSandboxedKimi(options: {
  executablePath: string;
  sourceHome: string;
  agentProfilePath: string;
  prompt: string;
  signal: AbortSignal;
  timeoutMs?: number;
  stdoutCap?: number;
  stderrCap?: number;
}): Promise<SandboxedKimiRunResult> {
  if (process.platform !== "darwin") throw new ProviderInvocationError("PERMISSION");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "caphub-kimi-local-"));
  let proxy: Awaited<ReturnType<typeof startKimiEgressProxy>> | undefined;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await proxy?.close().catch(() => undefined);
    await rm(temporaryRoot, { recursive: true, force: true });
  };
  try {
    const canonicalRoot = await realpath(temporaryRoot);
    const cwd = join(canonicalRoot, "work");
    const kimiHome = join(canonicalRoot, "kimi-home");
    const temp = join(canonicalRoot, "tmp");
    await Promise.all([
      mkdir(cwd, { mode: 0o700 }),
      mkdir(kimiHome, { mode: 0o700 }),
      mkdir(temp, { mode: 0o700 })
    ]);
    await projectKimiLocalCredentials({ sourceHome: options.sourceHome, targetHome: kimiHome });

    const executable = join(canonicalRoot, "kimi");
    const agentProfile = join(canonicalRoot, "kimi-research.md");
    await copyFile(await realpath(options.executablePath), executable);
    await chmod(executable, 0o500);
    await copyFile(options.agentProfilePath, agentProfile);
    await chmod(agentProfile, 0o400);
    proxy = await startKimiEgressProxy();

    const profilePath = join(canonicalRoot, "seatbelt.sb");
    await writeFile(profilePath, buildKimiSeatbeltProfile({
      temporaryRoot: canonicalRoot,
      executablePath: executable,
      deniedReadPaths: [
        homedir(),
        process.cwd(),
        join(homedir(), ".kimi"),
        join(homedir(), ".ssh"),
        join(homedir(), "Library", "Keychains")
      ]
    }), { mode: 0o600 });
    const environment = Object.freeze({
      HOME: join(canonicalRoot, "home"),
      KIMI_CODE_HOME: kimiHome,
      TMPDIR: temp,
      PATH: "",
      LANG: "C.UTF-8",
      HTTP_PROXY: proxy.url,
      HTTPS_PROXY: proxy.url,
      ALL_PROXY: proxy.url,
      NO_PROXY: "127.0.0.1,localhost"
    });
    await mkdir(environment.HOME, { mode: 0o700 });
    const argv = [
      "/usr/bin/sandbox-exec", "-f", profilePath, executable,
      "--model", "kimi-code/k3-256k",
      "--prompt", options.prompt,
      "--output-format", "stream-json",
      "--agent-file", agentProfile
    ];
    const result = await spawnBounded({
      argv,
      cwd,
      env: environment,
      timeoutMs: options.timeoutMs ?? 120_000,
      stdoutCap: options.stdoutCap,
      stderrCap: options.stderrCap,
      signal: options.signal
    });
    const parsed = parseKimiStreamJson(result.stdout);
    return {
      ...parsed,
      stdoutBytes: Buffer.byteLength(result.stdout),
      stderrBytes: result.stderrBytes,
      cleanup
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function loopbackSentinel(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("loopback sentinel failed");
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

export interface SandboxedKimiFixtureResult {
  argv: string[];
  environment: Readonly<Record<string, string>>;
  cwd: string;
  probe: {
    deniedReads: string[];
    outsideWriteDenied: boolean;
    nestedProcessDenied: boolean;
    directNetworkDenied: boolean;
    loopbackReachable: boolean;
  };
  temporaryRootRemoved: boolean;
}

export async function runSandboxedKimiFixture(options: {
  fixturePath: string;
  scenario: "probe" | "success" | "malformed" | "tool" | "flood" | "hang";
  timeoutMs?: number;
  stdoutCap?: number;
  observeTemporaryRoot?: (path: string) => void;
}): Promise<SandboxedKimiFixtureResult> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "caphub-kimi-sandbox-"));
  const outsideRoot = await mkdtemp(join(tmpdir(), "caphub-kimi-canary-"));
  const sentinel = await loopbackSentinel();
  let response: Omit<SandboxedKimiFixtureResult, "temporaryRootRemoved"> | undefined;
  try {
    const canonicalTemporaryRoot = await realpath(temporaryRoot);
    const canonicalOutsideRoot = await realpath(outsideRoot);
    options.observeTemporaryRoot?.(canonicalTemporaryRoot);
    const executablePath = await realpath(process.execPath);
    const fixtureTarget = join(canonicalTemporaryRoot, "fake-kimi.mjs");
    const workDirectory = join(canonicalTemporaryRoot, "work");
    const kimiHome = join(canonicalTemporaryRoot, "kimi-home");
    const home = join(canonicalTemporaryRoot, "home");
    const temp = join(canonicalTemporaryRoot, "tmp");
    await Promise.all([
      mkdir(workDirectory, { mode: 0o700 }),
      mkdir(kimiHome, { mode: 0o700 }),
      mkdir(home, { mode: 0o700 }),
      mkdir(temp, { mode: 0o700 })
    ]);
    await copyFile(options.fixturePath, fixtureTarget);
    const unrelated = join(canonicalOutsideRoot, "unrelated.txt");
    await writeFile(unrelated, "private canary", { mode: 0o600 });
    const probePath = join(canonicalTemporaryRoot, "probe.json");
    await writeFile(probePath, JSON.stringify({
      reads: [
        { label: "repository", path: join(process.cwd(), "package.json") },
        { label: "git", path: join(process.cwd(), ".git") },
        { label: "default_kimi_home", path: join(homedir(), ".kimi", "config.toml") },
        { label: "ssh", path: join(homedir(), ".ssh", "config") },
        { label: "keychain", path: join(homedir(), "Library", "Keychains") },
        { label: "unrelated_user_file", path: unrelated }
      ],
      outsideWritePath: join(canonicalOutsideRoot, "write-denied.txt"),
      loopbackPort: sentinel.port
    }), { mode: 0o600 });
    const profilePath = join(canonicalTemporaryRoot, "seatbelt.sb");
    await writeFile(profilePath, buildKimiSeatbeltProfile({
      temporaryRoot: canonicalTemporaryRoot,
      executablePath,
      deniedReadPaths: [
        homedir(),
        process.cwd(),
        join(homedir(), ".kimi"),
        join(homedir(), ".ssh"),
        join(homedir(), "Library", "Keychains"),
        canonicalOutsideRoot
      ]
    }), { mode: 0o600 });
    const environment = Object.freeze({
      HOME: home,
      KIMI_CODE_HOME: kimiHome,
      TMPDIR: temp,
      PATH: "",
      LANG: "C.UTF-8",
      FAKE_KIMI_SCENARIO: options.scenario,
      CAPHUB_PROBE_FILE: probePath
    });
    const argv = ["/usr/bin/sandbox-exec", "-f", profilePath, executablePath, fixtureTarget];
    const result = await spawnBounded({
      argv,
      cwd: workDirectory,
      env: environment,
      timeoutMs: options.timeoutMs ?? 5_000,
      stdoutCap: options.stdoutCap
    });
    const parsed = parseKimiStreamJson(result.stdout);
    response = {
      argv: result.argv,
      environment: result.environment,
      cwd: result.cwd,
      probe: JSON.parse(parsed.terminalText)
    };
  } finally {
    await sentinel.close();
    await rm(temporaryRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
  if (!response) throw new ProviderInvocationError("UNAVAILABLE");
  const temporaryRootRemoved = !(await lstat(temporaryRoot).catch(() => undefined));
  return { ...response, temporaryRootRemoved };
}
