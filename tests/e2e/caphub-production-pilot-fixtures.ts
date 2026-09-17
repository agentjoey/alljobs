import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer, type Server } from "node:https";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { applyFilesystemCaptureImport, planFilesystemCaptureImport } from "../../lib/caphub/registry/filesystem-import";
import { applyRegistryMigrations } from "../../lib/caphub/registry/migrate";
import {
  PostgresCaptureAuditLog,
  PostgresCaptureStore
} from "../../lib/caphub/registry/postgres/caphub-stores";
import { createReleaseService } from "../../lib/caphub/releases/runtime";
import { FilesystemCaptureStore } from "../../lib/caphub/storage/filesystem";
import { FilesystemCaptureAuditLog, captureReceivedEventId } from "../../lib/caphub/storage/audit-log";
import { LocalCaptureObjectStore } from "../../lib/caphub/storage/local-objects";
import type { CaptureRecord } from "../../lib/caphub/domain/types";
import { createRasterFixture } from "../../lib/caphub/preprocess/fixtures";
import {
  createCaphubBackup,
  startTemporaryRestorePostgres,
  verifyCaphubBackup
} from "../../lib/caphub/operations/backup";
import { resolvePostgres17Binary } from "../../lib/caphub/registry/operations";
import type { ParsedRegistryConnection } from "../../lib/caphub/registry/connection";
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../helpers/caphub-postgres";
import {
  createCaphubReviewFixture,
  readCaphubReviewFixture,
  reviewFixtureEnvironment,
  type CaphubReviewFixture
} from "./caphub-review-registry-fixtures";

const execFileAsync = promisify(execFile);
const DATABASE_ENV = "CAPHUB_E2E_DATABASE_URL";
const NEXT_PORT = 3476;
export const CAPHUB_PRODUCTION_PILOT_ORIGIN = "https://127.0.0.1:3477";
const NOW = "2026-09-17T12:00:00.000Z";

export type ProductionPilotFixture = CaphubReviewFixture;

export interface ProductionPilotState {
  schemaVersion: 1;
  socketDir: string;
  port: number;
  captureImport: {
    sourceDigest: string;
    captureId: string;
    created: number;
    sourceUnchanged: boolean;
  };
}

interface PilotAnalysisResult {
  first: {
    captureId: string;
    jobId: string;
    analysisStatus: string;
    reviewPacketArtifactId: string | null;
    reviewRequestId: string | null;
  };
  second: PilotAnalysisResult["first"];
  candidateId: string;
  providerCalls: { minimax: number; kimi: number };
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function configureFixture(fixture: ProductionPilotFixture): void {
  const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
  config.caphub.allowedOrigins = [CAPHUB_PRODUCTION_PILOT_ORIGIN];
  config.caphub.analysis = { enabled: false };
  config.caphub.exports = {
    enabled: true,
    obsidian: { enabled: false },
    packageRepository: { enabled: false },
    targets: {
      codex: { enabled: false },
      claude: { enabled: false },
      hermes: { enabled: false }
    }
  };
  writeFileSync(fixture.configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function createProductionPilotFixture(): ProductionPilotFixture {
  const fixture = createCaphubReviewFixture();
  configureFixture(fixture);
  return fixture;
}

export function readProductionPilotFixture(): ProductionPilotFixture {
  return readCaphubReviewFixture();
}

export function productionPilotEnvironment(fixture: ProductionPilotFixture): Record<string, string> {
  return reviewFixtureEnvironment(fixture);
}

export function readProductionPilotState(fixture = readProductionPilotFixture()): ProductionPilotState {
  return JSON.parse(readFileSync(fixture.statePath, "utf8")) as ProductionPilotState;
}

export function openProductionPilotPool(fixture = readProductionPilotFixture()): Pool {
  const state = readProductionPilotState(fixture);
  return new Pool({
    host: state.socketDir,
    port: state.port,
    user: "caphub_test",
    database: "postgres",
    ssl: false,
    max: 2,
    application_name: "caphub_production_pilot_assertions"
  });
}

export async function createProductionPilotCaptureBytes(): Promise<Buffer> {
  return Buffer.from(await createRasterFixture());
}

function snapshotDirectory(root: string): string {
  const records: Array<{ path: string; bytes: number; digest: string }> = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const metadata = statSync(path, { bigint: false });
      if (metadata.isDirectory()) visit(path);
      else {
        const bytes = readFileSync(path);
        records.push({ path: relative(root, path), bytes: bytes.length, digest: digest(bytes) });
      }
    }
  };
  visit(root);
  return digest(JSON.stringify(records));
}

async function seedAndImportFilesystemCapture(
  postgres: CaphubTestPostgres,
  fixture: ProductionPilotFixture
): Promise<ProductionPilotState["captureImport"]> {
  const png = await createProductionPilotCaptureBytes();
  const objects = new LocalCaptureObjectStore(fixture.stateDir);
  const object = await objects.putImmutable({ bytes: png, mimeType: "image/png" });
  const captureId = `cap_${digest("production-pilot:legacy-capture").slice(0, 32)}`;
  const capture: CaptureRecord = {
    schema_version: 1,
    id: captureId,
    source: {
      kind: "web",
      original_filename: "legacy-pilot-capability.png",
      source_url: "https://docs.example.com/legacy-pilot-capability"
    },
    note: "Existing filesystem Capture migrated by the isolated pilot.",
    mime_type: "image/png",
    object,
    idempotency_key: "capture.production-pilot-legacy-0001",
    status: "received",
    human_review_required: true,
    created_at: NOW
  };
  await new FilesystemCaptureStore(fixture.stateDir).create(capture);
  await new FilesystemCaptureAuditLog(fixture.stateDir).ensure({
    schema_version: 1,
    event_id: captureReceivedEventId(captureId),
    capture_id: captureId,
    type: "capture.received",
    actor: "web:user",
    occurred_at: NOW,
    object_digest: object.digest
  });
  const before = snapshotDirectory(fixture.stateDir);
  const manifest = await planFilesystemCaptureImport({ root: fixture.stateDir });
  const result = await applyFilesystemCaptureImport({
    root: fixture.stateDir,
    expectedSourceDigest: manifest.source_digest,
    captures: new PostgresCaptureStore(postgres.pool),
    audit: new PostgresCaptureAuditLog(postgres.pool)
  });
  return {
    sourceDigest: manifest.source_digest,
    captureId,
    created: result.created,
    sourceUnchanged: before === snapshotDirectory(fixture.stateDir)
  };
}

export async function runPilotAnalysisAndImport(
  _pool: Pool,
  _fixture: ProductionPilotFixture,
  captureId: string
): Promise<PilotAnalysisResult> {
  const executable = resolve("node_modules/.bin/tsx");
  const { stdout } = await execFileAsync(executable, [
    "--conditions=react-server",
    "tests/e2e/caphub-production-pilot-analysis.ts",
    captureId
  ], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 60_000,
    maxBuffer: 1_048_576
  });
  return JSON.parse(stdout) as PilotAnalysisResult;
}

export async function composePilotRelease(
  pool: Pool,
  candidateId: string,
  approvalDecisionId: string
): Promise<{ releaseId: string; requestId: string }> {
  const service = createReleaseService({ pool, clock: () => NOW });
  const result = await service.createCandidate({ candidateId, approvalDecisionId });
  const request = await pool.query<{ request_id: string }>(
    "SELECT request_id FROM caphub.review_requests WHERE review_kind='release' AND subject_id=$1",
    [result.release.record_id]
  );
  if (!request.rows[0]) throw new Error("pilot Release review is unavailable");
  return { releaseId: result.release.record_id, requestId: request.rows[0].request_id };
}

export async function finalizePilotRelease(
  pool: Pool,
  releaseId: string,
  approvalDecisionId: string
): Promise<{ status: "finalized" | "existing" }> {
  return createReleaseService({ pool, clock: () => NOW }).finalizeApproval({ releaseId, approvalDecisionId });
}

export async function createAndVerifyPilotBackup(
  pool: Pool,
  fixture: ProductionPilotFixture
): Promise<{ verified: true; counts: Record<string, number>; generationId: string }> {
  const state = readProductionPilotState(fixture);
  const pgDump = await resolvePostgres17Binary("pg_dump");
  const migrationConnection = {
    host: state.socketDir,
    port: state.port,
    database: "postgres",
    user: "caphub_test",
    ssl: false
  } as unknown as ParsedRegistryConnection;
  const generationId = "20260917T120000000Z-production-pilot";
  const manifest = await createCaphubBackup({
    resolvedHome: fixture.homeDir,
    stateRoot: fixture.stateDir,
    migrationConnection,
    generationId,
    clock: () => new Date(NOW),
    runPgDump: async (args) => {
      await execFileAsync(pgDump, [...args], { timeout: 120_000, maxBuffer: 1_048_576 });
    }
  });
  const verified = await verifyCaphubBackup({
    resolvedHome: fixture.homeDir,
    generationId,
    startTemporaryPostgres: startTemporaryRestorePostgres
  });
  const liveCounts = await pool.query<{ kind: string; count: string }>(
    "SELECT kind, count(*)::text AS count FROM caphub.registry_records GROUP BY kind"
  );
  if (verified.database_dump_sha256 !== manifest.database_dump_sha256) {
    throw new Error("pilot backup verification returned a different generation");
  }
  return {
    verified: true,
    counts: Object.fromEntries(liveCounts.rows.map(({ kind, count }) => [kind, Number(count)])),
    generationId
  };
}

function databaseUrl(postgres: CaphubTestPostgres): string {
  return `postgresql://caphub_app@localhost/postgres?host=${encodeURIComponent(postgres.socketDir)}&port=${postgres.port}&sslmode=disable`;
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

async function serveProductionPilot(): Promise<void> {
  const fixture = readProductionPilotFixture();
  let postgres: CaphubTestPostgres | undefined;
  let next: ChildProcess | undefined;
  let proxy: Server | undefined;
  let stopping = false;
  const stop = async (code: number) => {
    if (stopping) return;
    stopping = true;
    await closeServer(proxy);
    if (next && next.exitCode === null && next.signalCode === null) {
      next.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((resolveExit) => next!.once("exit", () => resolveExit())),
        new Promise<void>((resolveTimeout) => setTimeout(() => { next!.kill("SIGKILL"); resolveTimeout(); }, 5_000))
      ]);
    }
    await postgres?.stop();
    process.exit(code);
  };
  try {
    postgres = await startCaphubTestPostgres();
    await applyRegistryMigrations(postgres.pool);
    const captureImport = await seedAndImportFilesystemCapture(postgres, fixture);
    writeFileSync(fixture.statePath, `${JSON.stringify({
      schemaVersion: 1,
      socketDir: postgres.socketDir,
      port: postgres.port,
      captureImport
    } satisfies ProductionPilotState, null, 2)}\n`, { mode: 0o600 });
    next = spawn(process.execPath, [
      resolve("node_modules/next/dist/bin/next"), "start", "-p", String(NEXT_PORT), "-H", "127.0.0.1"
    ], {
      stdio: "inherit",
      env: {
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        ALLJOBS_HOME: fixture.homeDir,
        ALLJOBS_DATA_ROOT: fixture.dataDir,
        [DATABASE_ENV]: databaseUrl(postgres),
        ...productionPilotEnvironment(fixture)
      }
    });
    proxy = createServer({
      key: readFileSync(fixture.keyPath),
      cert: readFileSync(fixture.certPath)
    }, (incoming, outgoing) => {
      const upstream = httpRequest({
        hostname: "127.0.0.1",
        port: NEXT_PORT,
        method: incoming.method,
        path: incoming.url,
        headers: incoming.headers
      }, (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      });
      upstream.on("error", () => {
        if (!outgoing.headersSent) outgoing.writeHead(502);
        outgoing.end();
      });
      incoming.pipe(upstream);
    });
    next.once("error", () => { void stop(1); });
    next.once("exit", (code) => { if (!stopping) void stop(code || 1); });
    proxy.on("error", () => { void stop(1); });
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void stop(0); });
    proxy.listen(3477, "127.0.0.1");
  } catch (error) {
    console.error("Production pilot fixture startup failed:", error);
    await stop(1);
  }
}

if (process.argv[2] === "serve-caphub-production-pilot") void serveProductionPilot();
