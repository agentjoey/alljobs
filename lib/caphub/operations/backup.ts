import "server-only";

import { execFile } from "node:child_process";
import { createHash, randomInt, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { z } from "zod";
import { canonicalJson } from "../analysis/digest";
import type { ParsedRegistryConnection } from "../registry/connection";
import { resolvePostgres17Binary } from "../registry/operations";

const execFileAsync = promisify(execFile);
const UNSAFE_WRITE_BITS = 0o022;
const MAX_BACKUP_FILE_BYTES = 1024 * 1024 * 1024;
const MAX_STATE_FILES = 100_000;
const GENERATION_PATTERN = /^\d{8}T\d{9}Z-[a-z0-9][a-z0-9-]{3,63}$/;
const RESTORE_PREFIX = "/private/tmp/caphub-restore-";

const migrationSchema = z.object({
  id: z.string().regex(/^\d{3}_[a-z][a-z0-9_]*$/),
  checksum: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

const manifestSchema = z.object({
  schema_version: z.literal(1),
  generation_id: z.string().regex(GENERATION_PATTERN),
  database_dump_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  database_dump_bytes: z.number().int().nonnegative(),
  state_manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  registry_counts: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.number().int().nonnegative()),
  migration_checksums: z.array(migrationSchema),
  created_at: z.string().datetime({ offset: true })
}).strict();

const stateManifestSchema = z.object({
  schema_version: z.literal(1),
  files: z.array(z.object({
    path: z.string().min(1),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  }).strict())
}).strict();

export type CaphubBackupManifestV1 = z.infer<typeof manifestSchema>;

export interface RegistryBackupSnapshot {
  counts: Record<string, number>;
  migrations: Array<{ id: string; checksum: string }>;
}

export interface BackupDependencies {
  resolvedHome: string;
  stateRoot: string;
  migrationConnection: ParsedRegistryConnection;
  clock(): Date;
  runPgDump(args: readonly string[]): Promise<void>;
  generationId?: string;
  queryRegistrySnapshot?(): Promise<RegistryBackupSnapshot>;
}

export interface RestoreVerificationDependencies {
  resolvedHome: string;
  generationId: string;
  startTemporaryPostgres(): Promise<{
    restoreDatabase(dumpPath: string): Promise<void>;
    queryCounts(): Promise<Record<string, number>>;
    queryMigrations?(): Promise<Array<{ id: string; checksum: string }>>;
    stop(): Promise<void>;
  }>;
}

function currentUid(): number {
  if (typeof process.getuid !== "function") throw new Error("current uid is unavailable");
  return process.getuid();
}

function assertPrivateDirectory(path: string): void {
  const metadata = lstatSync(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== currentUid()
    || (metadata.mode & UNSAFE_WRITE_BITS) !== 0 || realpathSync(path) !== path) {
    throw new Error("Caphub backup directory must be private, owned, canonical, and not a symlink");
  }
}

function ensurePrivateDirectory(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  assertPrivateDirectory(path);
}

function assertPrivateFile(path: string): void {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== currentUid()
    || (metadata.mode & 0o077) !== 0) {
    throw new Error("Caphub backup file must be a private owned regular file, not a symlink");
  }
  if (metadata.size > MAX_BACKUP_FILE_BYTES) throw new Error("Caphub backup file exceeds its bounded size");
}

function readPrivateFile(path: string): Buffer {
  assertPrivateFile(path);
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return readFileSync(descriptor);
  } finally {
    // readFileSync does not own externally supplied descriptors.
    closeSync(descriptor);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function generatedId(clock: Date): string {
  return `${clock.toISOString().replace(/[-:.]/g, "")}-${randomUUID()}`;
}

function assertGenerationId(value: string): string {
  if (!GENERATION_PATTERN.test(value)) throw new Error("invalid Caphub backup generation ID");
  return value;
}

function copyStateTree(sourceRoot: string, destinationRoot: string): Array<{ path: string; bytes: number; sha256: string }> {
  assertPrivateDirectory(sourceRoot);
  const files: Array<{ path: string; bytes: number; sha256: string }> = [];
  const visit = (source: string, destination: string): void => {
    assertPrivateDirectory(source);
    ensurePrivateDirectory(destination);
    for (const entry of readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const sourcePath = join(source, entry.name);
      const destinationPath = join(destination, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Caphub state backup refuses symlinks");
      if (entry.isDirectory()) {
        visit(sourcePath, destinationPath);
        continue;
      }
      if (!entry.isFile()) throw new Error("Caphub state backup accepts only regular files and directories");
      const bytes = readPrivateFile(sourcePath);
      writeFileSync(destinationPath, bytes, { mode: 0o600, flag: "wx" });
      chmodSync(destinationPath, 0o600);
      const path = relative(sourceRoot, sourcePath);
      if (!path || path.startsWith(`..${sep}`)) throw new Error("Caphub state backup path escaped its root");
      files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
      if (files.length > MAX_STATE_FILES) throw new Error("Caphub state backup exceeds its file bound");
    }
  };
  visit(sourceRoot, destinationRoot);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function queryRegistrySnapshotFromPool(pool: Pool): Promise<RegistryBackupSnapshot> {
    const [kinds, tables, migrations] = await Promise.all([
      pool.query<{ kind: string; count: string }>(
        "SELECT kind, count(*)::text AS count FROM caphub.registry_records GROUP BY kind ORDER BY kind"
      ),
      pool.query<{ lineage: string; reviews: string; decisions: string; audits: string }>(`
        SELECT
          (SELECT count(*) FROM caphub.registry_lineage)::text AS lineage,
          (SELECT count(*) FROM caphub.review_requests)::text AS reviews,
          (SELECT count(*) FROM caphub.review_decisions)::text AS decisions,
          (SELECT count(*) FROM caphub.audit_events)::text AS audits
      `),
      pool.query<{ id: string; checksum: string }>(
        "SELECT version AS id, checksum FROM caphub.schema_migrations ORDER BY version"
      )
    ]);
    const counts = Object.fromEntries(kinds.rows.map(({ kind, count }) => [kind, Number(count)]));
    const tableCounts = tables.rows[0];
    if (tableCounts) {
      counts.registry_lineage = Number(tableCounts.lineage);
      counts.review_requests = Number(tableCounts.reviews);
      counts.review_decisions = Number(tableCounts.decisions);
      counts.audit_events = Number(tableCounts.audits);
    }
    return { counts, migrations: migrations.rows };
}

async function queryRegistrySnapshot(connection: ParsedRegistryConnection): Promise<RegistryBackupSnapshot> {
  const pool = new Pool({ ...connection, max: 1, application_name: "alljobs-caphub-backup" });
  try {
    return await queryRegistrySnapshotFromPool(pool);
  } finally {
    await pool.end();
  }
}

export async function createCaphubBackup(input: BackupDependencies): Promise<CaphubBackupManifestV1> {
  assertPrivateDirectory(input.resolvedHome);
  assertPrivateDirectory(input.stateRoot);
  const backupParent = join(input.resolvedHome, "backups");
  const backupRoot = join(backupParent, "caphub");
  ensurePrivateDirectory(backupParent);
  ensurePrivateDirectory(backupRoot);
  const now = input.clock();
  const generationId = assertGenerationId(input.generationId ?? generatedId(now));
  const finalPath = join(backupRoot, generationId);
  if (existsSync(finalPath)) throw new Error("Caphub backup generation already exists and is immutable");
  const pendingPath = join(backupRoot, `.pending-${randomUUID()}`);
  mkdirSync(pendingPath, { mode: 0o700 });
  const dumpPath = join(pendingPath, "database.dump");

  try {
    const connection = input.migrationConnection;
    await input.runPgDump([
      "-Fc", "--no-password", "--no-owner", "--no-acl",
      "-h", connection.host,
      "-p", String(connection.port),
      "-U", connection.user,
      "-d", connection.database,
      "-f", dumpPath
    ]);
    const dumpMetadata = lstatSync(dumpPath);
    if (!dumpMetadata.isFile() || dumpMetadata.isSymbolicLink() || dumpMetadata.uid !== currentUid()
      || (dumpMetadata.mode & UNSAFE_WRITE_BITS) !== 0) {
      throw new Error("Caphub database dump must be an owned regular file");
    }
    chmodSync(dumpPath, 0o600);
    const dumpBytes = readPrivateFile(dumpPath);
    const snapshot = input.queryRegistrySnapshot
      ? await input.queryRegistrySnapshot()
      : await queryRegistrySnapshot(connection);
    const counts = Object.fromEntries(Object.entries(snapshot.counts).sort(([left], [right]) => left.localeCompare(right)));
    for (const [key, count] of Object.entries(counts)) {
      if (!/^[a-z][a-z0-9_]*$/.test(key) || !Number.isSafeInteger(count) || count < 0) {
        throw new Error("Registry backup counts are invalid");
      }
    }
    const migrations = snapshot.migrations.map((migration) => migrationSchema.parse(migration));
    const statePath = join(pendingPath, "state");
    const stateFiles = copyStateTree(input.stateRoot, statePath);
    const stateManifestBytes = Buffer.from(`${canonicalJson({ schema_version: 1, files: stateFiles })}\n`, "utf8");
    writeFileSync(join(pendingPath, "state-manifest.json"), stateManifestBytes, { mode: 0o600, flag: "wx" });
    const manifest = manifestSchema.parse({
      schema_version: 1,
      generation_id: generationId,
      database_dump_sha256: sha256(dumpBytes),
      database_dump_bytes: dumpBytes.length,
      state_manifest_sha256: sha256(stateManifestBytes),
      registry_counts: counts,
      migration_checksums: migrations,
      created_at: now.toISOString()
    });
    writeFileSync(join(pendingPath, "manifest.json"), `${canonicalJson(manifest)}\n`, { mode: 0o600, flag: "wx" });
    if (existsSync(finalPath)) throw new Error("Caphub backup generation already exists and is immutable");
    renameSync(pendingPath, finalPath);
    return manifest;
  } catch (error) {
    if (existsSync(pendingPath)) rmSync(pendingPath, { recursive: true, force: false });
    throw error;
  }
}

function verifyStateCopy(generationPath: string, expectedHash: string): void {
  const stateManifestPath = join(generationPath, "state-manifest.json");
  const bytes = readPrivateFile(stateManifestPath);
  if (sha256(bytes) !== expectedHash) throw new Error("Caphub backup state manifest digest mismatch");
  const stateManifest = stateManifestSchema.parse(JSON.parse(bytes.toString("utf8")));
  const stateRoot = join(generationPath, "state");
  const actual = copyStateInventory(stateRoot);
  if (canonicalJson(actual) !== canonicalJson(stateManifest.files)) {
    throw new Error("Caphub backup state copy does not match its manifest");
  }
}

function copyStateInventory(root: string): Array<{ path: string; bytes: number; sha256: string }> {
  assertPrivateDirectory(root);
  const files: Array<{ path: string; bytes: number; sha256: string }> = [];
  const visit = (directory: string): void => {
    assertPrivateDirectory(directory);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Caphub backup state contains a symlink");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        const bytes = readPrivateFile(path);
        files.push({ path: relative(root, path), bytes: bytes.length, sha256: sha256(bytes) });
      } else throw new Error("Caphub backup state contains an unsupported entry");
      if (files.length > MAX_STATE_FILES) throw new Error("Caphub backup state exceeds its file bound");
    }
  };
  visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function verifyCaphubBackup(
  input: RestoreVerificationDependencies
): Promise<CaphubBackupManifestV1> {
  assertPrivateDirectory(input.resolvedHome);
  const generationId = assertGenerationId(input.generationId);
  const generationPath = join(input.resolvedHome, "backups", "caphub", generationId);
  assertPrivateDirectory(generationPath);
  const manifest = manifestSchema.parse(JSON.parse(readPrivateFile(join(generationPath, "manifest.json")).toString("utf8")));
  if (manifest.generation_id !== generationId) throw new Error("Caphub backup generation manifest mismatch");
  const dumpPath = join(generationPath, "database.dump");
  const dump = readPrivateFile(dumpPath);
  if (dump.length !== manifest.database_dump_bytes || sha256(dump) !== manifest.database_dump_sha256) {
    throw new Error("Caphub database dump digest mismatch");
  }
  verifyStateCopy(generationPath, manifest.state_manifest_sha256);

  const temporary = await input.startTemporaryPostgres();
  try {
    await temporary.restoreDatabase(dumpPath);
    const counts = await temporary.queryCounts();
    if (canonicalJson(counts) !== canonicalJson(manifest.registry_counts)) {
      throw new Error("restored Registry counts do not match the backup manifest");
    }
    if (temporary.queryMigrations) {
      const migrations = await temporary.queryMigrations();
      if (canonicalJson(migrations) !== canonicalJson(manifest.migration_checksums)) {
        throw new Error("restored migration checksums do not match the backup manifest");
      }
    }
    return manifest;
  } finally {
    await temporary.stop();
  }
}

export async function startTemporaryRestorePostgres(): Promise<{
  restoreDatabase(dumpPath: string): Promise<void>;
  queryCounts(): Promise<Record<string, number>>;
  queryMigrations(): Promise<Array<{ id: string; checksum: string }>>;
  stop(): Promise<void>;
}> {
  const root = realpathSync(await mkdtemp(RESTORE_PREFIX));
  chmodSync(root, 0o700);
  const dataDir = join(root, "data");
  const socketDir = join(root, "socket");
  mkdirSync(dataDir, { mode: 0o700 });
  mkdirSync(socketDir, { mode: 0o700 });
  const port = randomInt(20_000, 60_000);
  const user = "caphub_restore";
  const [initdb, pgCtl, createdb, pgRestore] = await Promise.all([
    resolvePostgres17Binary("initdb"),
    resolvePostgres17Binary("pg_ctl"),
    resolvePostgres17Binary("createdb"),
    resolvePostgres17Binary("pg_restore")
  ]);
  await execFileAsync(initdb, ["-D", dataDir, "-A", "trust", "-U", user, "--no-locale", "--encoding=UTF8"]);
  await execFileAsync(pgCtl, [
    "-D", dataDir,
    "-l", join(root, "postgres.log"),
    "-o", `-F -h '' -k ${socketDir} -p ${port} -c unix_socket_permissions=0700`,
    "-w", "start"
  ]);
  const pid = Number.parseInt(readFileSync(join(dataDir, "postmaster.pid"), "utf8").split("\n", 1)[0] ?? "", 10);
  const nonce = randomUUID();
  writeFileSync(join(root, ".restore-sentinel.json"), `${JSON.stringify({ root, dataDir, socketDir, pid, nonce })}\n`, { mode: 0o600 });
  await execFileAsync(createdb, ["-h", socketDir, "-p", String(port), "-U", user, "caphub"]);
  const pool = new Pool({ host: socketDir, port, user, database: "caphub", ssl: false, max: 1 });
  let stopped = false;
  return {
    async restoreDatabase(dumpPath) {
      await execFileAsync(pgRestore, [
        "--exit-on-error", "--no-owner", "--no-acl",
        "-h", socketDir, "-p", String(port), "-U", user, "-d", "caphub", dumpPath
      ]);
    },
    async queryCounts() {
      return (await queryRegistrySnapshotFromPool(pool)).counts;
    },
    async queryMigrations() {
      const result = await pool.query<{ id: string; checksum: string }>(
        "SELECT version AS id, checksum FROM caphub.schema_migrations ORDER BY version"
      );
      return result.rows;
    },
    async stop() {
      if (stopped) return;
      const sentinelPath = join(root, ".restore-sentinel.json");
      assertPrivateDirectory(root);
      assertPrivateDirectory(dataDir);
      assertPrivateDirectory(socketDir);
      assertPrivateFile(sentinelPath);
      const sentinel = JSON.parse(readFileSync(sentinelPath, "utf8")) as { root: string; dataDir: string; socketDir: string; pid: number; nonce: string };
      const actualPid = Number.parseInt(readFileSync(join(dataDir, "postmaster.pid"), "utf8").split("\n", 1)[0] ?? "", 10);
      if (!root.startsWith(RESTORE_PREFIX) || dirname(root) !== "/private/tmp"
        || basename(root).length <= basename(RESTORE_PREFIX).length
        || sentinel.root !== root || sentinel.dataDir !== dataDir || sentinel.socketDir !== socketDir
        || sentinel.pid !== pid || sentinel.pid !== actualPid || sentinel.nonce !== nonce) {
        throw new Error("temporary restore sentinel mismatch");
      }
      process.kill(pid, 0);
      await pool.end();
      await execFileAsync(pgCtl, ["-D", dataDir, "-m", "immediate", "-w", "stop"]);
      rmSync(root, { recursive: true, force: false });
      stopped = true;
    }
  };
}
