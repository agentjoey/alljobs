import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const PREFIX = "alljobs-caphub-e2e-";
const SENTINEL = ".alljobs-caphub-e2e-fixture.json";
const ROOT_ENV = "ALLJOBS_CAPHUB_E2E_ROOT";
const TOKEN_ENV = "ALLJOBS_CAPHUB_E2E_TOKEN";
const OWNER_ENV = "ALLJOBS_CAPHUB_E2E_OWNER_PID";
export const CAPHUB_ORIGIN = "https://127.0.0.1:3469";
export const CAPHUB_MAX_UPLOAD_BYTES = 10_485_760;

export interface CaphubFixture {
  rootDir: string;
  homeDir: string;
  dataDir: string;
  stateDir: string;
  sentinelPath: string;
  configPath: string;
  certPath: string;
  keyPath: string;
  token: string;
  ownerPid: number;
  cleanup: () => void;
}

function fixturePaths(rootDir: string) {
  const homeDir = join(rootDir, "home");
  return {
    rootDir, homeDir,
    dataDir: join(rootDir, "data"),
    stateDir: join(homeDir, "state", "caphub"),
    sentinelPath: join(rootDir, SENTINEL),
    configPath: join(homeDir, "config.json"),
    certPath: join(rootDir, "tls", "certificate.pem"),
    keyPath: join(rootDir, "tls", "key.pem")
  };
}

function assertOwnedFixture(rootDir: string, token: string, ownerPid: number) {
  const sentinelPath = join(rootDir, SENTINEL);
  if (!token || !Number.isSafeInteger(ownerPid) || ownerPid <= 0
    || dirname(rootDir) !== realpathSync(tmpdir()) || !basename(rootDir).startsWith(PREFIX)
    || !lstatSync(rootDir).isDirectory() || lstatSync(rootDir).isSymbolicLink()
    || realpathSync(rootDir) !== rootDir
    || !lstatSync(sentinelPath).isFile() || lstatSync(sentinelPath).isSymbolicLink()
    || realpathSync(sentinelPath) !== sentinelPath) {
    throw new Error("Refusing an unsafe Caphub fixture root or sentinel.");
  }
  const sentinel = JSON.parse(readFileSync(sentinelPath, "utf8"));
  if (sentinel.token !== token || sentinel.ownerPid !== ownerPid) {
    throw new Error("Refusing an unowned Caphub fixture.");
  }
}

/** Only the creating process has a cleanup capability, bound to its original token/PID. */
export function createCaphubFixture(): CaphubFixture {
  const rootDir = mkdtempSync(join(realpathSync(tmpdir()), PREFIX));
  const token = randomUUID();
  const ownerPid = process.pid;
  const paths = fixturePaths(rootDir);
  writeFileSync(paths.sentinelPath, `${JSON.stringify({ token, ownerPid })}\n`, { mode: 0o600 });
  let cleaned = false;
  const fixture: CaphubFixture = {
    ...paths, token, ownerPid,
    cleanup: () => {
      if (cleaned) return;
      if (process.pid !== ownerPid) throw new Error("Refusing cleanup by a non-owner process.");
      assertOwnedFixture(rootDir, token, ownerPid);
      rmSync(rootDir, { recursive: true });
      cleaned = true;
    }
  };
  try {
    for (const path of [
      paths.stateDir, join(paths.homeDir, "state", "monitoring"),
      ...["cache", "logs", "mirrors"].map((name) => join(paths.homeDir, name)),
      ...["projects", "roadmaps", "tasks", "log"].map((name) => join(paths.dataDir, name)),
      join(rootDir, "workspaces"), join(rootDir, "tls")
    ]) mkdirSync(path, { recursive: true, mode: 0o700 });
    writeFileSync(paths.configPath, `${JSON.stringify({
      trustedCodeRoots: [join(rootDir, "workspaces")],
      refreshIntervalSeconds: 300,
      cacheDir: join(paths.homeDir, "cache"),
      logsDir: join(paths.homeDir, "logs"),
      mirrorsDir: join(paths.homeDir, "mirrors"),
      assistant: { enabled: false }, monitoring: { enabled: false },
      caphub: { enabled: true, allowedOrigins: [CAPHUB_ORIGIN], maxUploadBytes: CAPHUB_MAX_UPLOAD_BYTES }
    }, null, 2)}\n`, { mode: 0o600 });
    try {
      execFileSync("openssl", [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
        "-keyout", paths.keyPath, "-out", paths.certPath
      ], { stdio: "pipe", timeout: 15_000 });
      chmodSync(paths.keyPath, 0o600);
    } catch {
      throw new Error("Caphub local test harness requires openssl with req -addext support to create temporary loopback TLS material.");
    }
    return fixture;
  } catch (error) {
    fixture.cleanup();
    throw error;
  }
}

export function caphubFixtureEnvironment(fixture: CaphubFixture): Record<string, string> {
  return {
    [ROOT_ENV]: fixture.rootDir, [TOKEN_ENV]: fixture.token, [OWNER_ENV]: String(fixture.ownerPid),
    ALLJOBS_HOME: fixture.homeDir, ALLJOBS_DATA_ROOT: fixture.dataDir
  };
}

/** Worker/proxy handles validate ownership but can never remove the owner's root. */
export function readCaphubFixture(): CaphubFixture {
  const rootDir = process.env[ROOT_ENV];
  const token = process.env[TOKEN_ENV];
  const ownerPid = Number(process.env[OWNER_ENV]);
  if (!rootDir || !token) throw new Error("Caphub fixture environment is required; refusing a default Control Host home.");
  assertOwnedFixture(rootDir, token, ownerPid);
  if (process.env.TEST_WORKER_INDEX !== undefined && ownerPid !== process.ppid) {
    throw new Error("Refusing an unowned Caphub worker fixture.");
  }
  const paths = fixturePaths(rootDir);
  if (process.env.ALLJOBS_HOME !== paths.homeDir || process.env.ALLJOBS_DATA_ROOT !== paths.dataDir) {
    throw new Error("Caphub home/data overrides must match the sentinel-owned fixture.");
  }
  for (const path of [paths.homeDir, paths.dataDir, paths.stateDir, join(rootDir, "tls")]) {
    if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) {
      throw new Error("Refusing an unsafe Caphub fixture directory.");
    }
  }
  return { ...paths, token, ownerPid, cleanup: () => undefined };
}

/** Snapshot every directory/file; never follow symlinks into other state. */
export function snapshotCaphubFixture(fixture: CaphubFixture): Record<string, string> {
  assertOwnedFixture(fixture.rootDir, fixture.token, fixture.ownerPid);
  const entries: Record<string, string> = {};
  const visit = (directory: string, prefix: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const key = prefix ? `${prefix}/${name}` : name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error("Fixture snapshot refuses a symlink.");
      if (stat.isDirectory()) { entries[key] = "directory"; visit(path, key); }
      else if (stat.isFile()) entries[key] = JSON.stringify({
        bytes: readFileSync(path).toString("base64"), inode: stat.ino, modified: stat.mtimeMs, mode: stat.mode
      });
      else throw new Error("Fixture snapshot refuses a non-regular entry.");
    }
  };
  visit(fixture.rootDir, "");
  return entries;
}

function serveCaphubFixture() {
  const fixture = readCaphubFixture();
  // This child gets only local runtime inputs, never inherited provider credentials.
  const next = spawn(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "start", "-p", "3468", "-H", "127.0.0.1"
  ], {
    stdio: "inherit",
    env: {
      PATH: process.env.PATH, TMPDIR: process.env.TMPDIR,
      NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      ALLJOBS_HOME: fixture.homeDir, ALLJOBS_DATA_ROOT: fixture.dataDir
    }
  });
  const proxy = createServer({ key: readFileSync(fixture.keyPath), cert: readFileSync(fixture.certPath) }, (incoming, outgoing) => {
    // A fixed loopback target only. Keep Origin, Content-Type and the multipart bytes untouched.
    const upstream = httpRequest({
      hostname: "127.0.0.1", port: 3468, method: incoming.method,
      path: incoming.url, headers: incoming.headers
    }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
    incoming.on("aborted", () => upstream.destroy());
    outgoing.on("close", () => upstream.destroy());
    incoming.pipe(upstream);
  });
  let stopping = false;
  const stop = (code: number) => {
    if (stopping) return;
    stopping = true;
    proxy.close();
    proxy.closeAllConnections();
    next.kill("SIGTERM");
    if (next.exitCode !== null || next.signalCode !== null) process.exit(code);
    next.once("exit", () => process.exit(code));
    setTimeout(() => { next.kill("SIGKILL"); process.exit(code); }, 3_000).unref();
  };
  next.once("error", (error) => { console.error("Caphub built-server startup failed:", error.message); stop(1); });
  next.once("exit", (code) => { if (!stopping) stop(code || 1); });
  proxy.on("error", (error) => { console.error("Caphub HTTPS loopback startup failed:", error.message); stop(1); });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop(0));
  proxy.listen(3469, "127.0.0.1");
}

if (process.argv[2] === "serve-caphub-fixture") serveCaphubFixture();
