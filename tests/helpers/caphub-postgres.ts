import { execFile } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";

const execFileAsync = promisify(execFile);
const ROOT_PREFIX = "/private/tmp/caphub-pg-";
const APP_ROLE = "caphub_app";
const SUPERUSER = "caphub_test";

interface ClusterSentinel {
  schemaVersion: 1;
  rootDir: string;
  dataDir: string;
  socketDir: string;
  ownerUid: number;
  nonce: string;
  postmasterPid: number;
}

export interface CaphubTestPostgres {
  pool: Pool;
  appPool: Pool;
  rootDir: string;
  dataDir: string;
  socketDir: string;
  sentinelPath: string;
  port: number;
  postmasterPid: number;
  stop(): Promise<void>;
}

export interface StartCaphubTestPostgresOptions {
  afterSentinel?(context: { rootDir: string; postmasterPid: number }): void | Promise<void>;
}

async function executable(name: "initdb" | "pg_ctl"): Promise<string> {
  const candidates = [
    `/opt/homebrew/opt/postgresql@17/bin/${name}`,
    `/usr/local/opt/postgresql@17/bin/${name}`
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Fall through to the next fixed installation location.
    }
  }
  return name;
}

async function readPostmasterPid(dataDir: string): Promise<number> {
  const contents = await readFile(join(dataDir, "postmaster.pid"), "utf8");
  const pid = Number.parseInt(contents.split("\n", 1)[0] ?? "", 10);
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("invalid PostgreSQL postmaster PID");
  return pid;
}

async function writeSentinel(path: string, sentinel: ClusterSentinel): Promise<void> {
  await writeFile(path, `${JSON.stringify(sentinel)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

async function assertOwnedCluster(
  rootDir: string,
  dataDir: string,
  socketDir: string,
  sentinelPath: string,
  expectedPid: number,
  nonce: string
): Promise<void> {
  const canonicalRoot = await realpath(rootDir);
  if (!canonicalRoot.startsWith(ROOT_PREFIX)) throw new Error("cluster sentinel root is outside the owned test prefix");
  if (await realpath(dataDir) !== join(canonicalRoot, "data")) throw new Error("cluster sentinel data directory mismatch");
  if (await realpath(socketDir) !== join(canonicalRoot, "socket")) throw new Error("cluster sentinel socket directory mismatch");

  const metadata = await lstat(sentinelPath);
  const ownerUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== ownerUid) {
    throw new Error("cluster sentinel ownership mismatch");
  }

  let sentinel: ClusterSentinel;
  try {
    sentinel = JSON.parse(await readFile(sentinelPath, "utf8")) as ClusterSentinel;
  } catch {
    throw new Error("cluster sentinel is invalid");
  }
  if (sentinel.schemaVersion !== 1
    || sentinel.rootDir !== canonicalRoot
    || sentinel.dataDir !== dataDir
    || sentinel.socketDir !== socketDir
    || sentinel.ownerUid !== ownerUid
    || sentinel.nonce !== nonce
    || sentinel.postmasterPid !== expectedPid) {
    throw new Error("cluster sentinel does not match the owned PostgreSQL process");
  }
  if (await readPostmasterPid(dataDir) !== expectedPid) {
    throw new Error("cluster sentinel PID does not match postmaster.pid");
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function stopAndRemoveOwnedCluster(input: {
  rootDir: string;
  dataDir: string;
  socketDir: string;
  sentinelPath: string;
  postmasterPid: number;
  nonce: string;
  pgCtl: string;
  pool?: Pool;
  appPool?: Pool;
}): Promise<void> {
  await assertOwnedCluster(
    input.rootDir,
    input.dataDir,
    input.socketDir,
    input.sentinelPath,
    input.postmasterPid,
    input.nonce
  );
  const poolResults = await Promise.allSettled([input.appPool?.end(), input.pool?.end()]);
  await execFileAsync(input.pgCtl, [
    "-D", input.dataDir,
    "-m", "immediate",
    "-w",
    "stop"
  ], { timeout: 30_000, maxBuffer: 1_048_576 });
  if (isProcessAlive(input.postmasterPid)) {
    throw new Error("PostgreSQL postmaster is still running after pg_ctl stop");
  }
  await rm(input.rootDir, { recursive: true, force: false });
  const poolErrors = poolResults
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);
  if (poolErrors.length > 0) throw new AggregateError(poolErrors, "PostgreSQL pools failed to close cleanly");
}

export async function startCaphubTestPostgres(
  options: StartCaphubTestPostgresOptions = {}
): Promise<CaphubTestPostgres> {
  const rootDir = await realpath(await mkdtemp(ROOT_PREFIX));
  const dataDir = join(rootDir, "data");
  const socketDir = join(rootDir, "socket");
  const sentinelPath = join(rootDir, ".caphub-postgres-sentinel.json");
  const logPath = join(rootDir, "postgres.log");
  const port = randomInt(20_000, 60_000);
  const nonce = randomUUID();
  const ownerUid = typeof process.getuid === "function" ? process.getuid() : 0;
  const initdb = await executable("initdb");
  const pgCtl = await executable("pg_ctl");
  let started = false;
  let postmasterPid: number | undefined;
  let pool: Pool | undefined;
  let appPool: Pool | undefined;

  try {
    await mkdir(dataDir, { mode: 0o700 });
    await mkdir(socketDir, { mode: 0o700 });
    await chmod(rootDir, 0o700);
    await execFileAsync(initdb, [
      "-D", dataDir,
      "-A", "trust",
      "-U", SUPERUSER,
      "--no-locale",
      "--encoding=UTF8"
    ], { timeout: 30_000, maxBuffer: 1_048_576 });
    await execFileAsync(pgCtl, [
      "-D", dataDir,
      "-l", logPath,
      "-o", `-F -h '' -k ${socketDir} -p ${port} -c unix_socket_permissions=0700`,
      "-w",
      "start"
    ], { timeout: 30_000, maxBuffer: 1_048_576 });
    started = true;

    const runningPostmasterPid = await readPostmasterPid(dataDir);
    postmasterPid = runningPostmasterPid;
    await writeSentinel(sentinelPath, {
      schemaVersion: 1,
      rootDir,
      dataDir,
      socketDir,
      ownerUid,
      nonce,
      postmasterPid: runningPostmasterPid
    });
    await options.afterSentinel?.({ rootDir, postmasterPid: runningPostmasterPid });

    pool = new Pool({
      host: socketDir,
      port,
      user: SUPERUSER,
      database: "postgres",
      max: 2,
      ssl: false,
      application_name: "caphub_registry_migration_test"
    });
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          CREATE ROLE ${APP_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
        END IF;
      END
      $$
    `);
    appPool = new Pool({
      host: socketDir,
      port,
      user: APP_ROLE,
      database: "postgres",
      max: 2,
      ssl: false,
      application_name: "caphub_registry_app_test"
    });

    let stopped = false;
    return {
      pool,
      appPool,
      rootDir,
      dataDir,
      socketDir,
      sentinelPath,
      port,
      postmasterPid: runningPostmasterPid,
      async stop() {
        if (stopped) return;
        await stopAndRemoveOwnedCluster({
          rootDir,
          dataDir,
          socketDir,
          sentinelPath,
          postmasterPid: runningPostmasterPid,
          nonce,
          pgCtl,
          pool,
          appPool
        });
        stopped = true;
      }
    };
  } catch (error) {
    const hasPostmaster = started || existsSync(join(dataDir, "postmaster.pid"));
    if (!hasPostmaster) {
      await rm(rootDir, { recursive: true, force: true });
      throw error;
    }

    try {
      postmasterPid ??= await readPostmasterPid(dataDir);
      if (!existsSync(sentinelPath)) {
        await writeSentinel(sentinelPath, {
          schemaVersion: 1,
          rootDir,
          dataDir,
          socketDir,
          ownerUid,
          nonce,
          postmasterPid
        });
      }
      await stopAndRemoveOwnedCluster({
        rootDir,
        dataDir,
        socketDir,
        sentinelPath,
        postmasterPid,
        nonce,
        pgCtl,
        pool,
        appPool
      });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "PostgreSQL startup failed and the owned cluster could not be cleaned safely"
      );
    }
    throw error;
  }
}
