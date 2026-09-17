import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Pool } from "pg";
import type { AnalysisJob, ReviewPacket, StageArtifact } from "../../lib/caphub/analysis/types";
import type { CaptureRecord } from "../../lib/caphub/domain/types";
import { createReviewPacketImporter } from "../../lib/caphub/registry/import-review-packet";
import { applyRegistryMigrations } from "../../lib/caphub/registry/migrate";
import { FilesystemCaptureStore } from "../../lib/caphub/storage/filesystem";
import { FilesystemAnalysisJobStore, FilesystemStageArtifactStore } from "../../lib/caphub/workflow/filesystem";
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../helpers/caphub-postgres";

const PREFIX = "alljobs-caphub-review-e2e-";
const SENTINEL = ".alljobs-caphub-review-e2e-fixture.json";
const ROOT_ENV = "ALLJOBS_CAPHUB_REVIEW_E2E_ROOT";
const TOKEN_ENV = "ALLJOBS_CAPHUB_REVIEW_E2E_TOKEN";
const OWNER_ENV = "ALLJOBS_CAPHUB_REVIEW_E2E_OWNER_PID";
const DATABASE_ENV = "CAPHUB_E2E_DATABASE_URL";
const STATE_FILE = "registry-fixture-state.json";
export const CAPHUB_REVIEW_ORIGIN = "https://127.0.0.1:3471";

export interface CaphubReviewFixture {
  rootDir: string;
  homeDir: string;
  dataDir: string;
  stateDir: string;
  configPath: string;
  sentinelPath: string;
  statePath: string;
  certPath: string;
  keyPath: string;
  token: string;
  ownerPid: number;
  cleanup(): void;
}

export interface SeededReview {
  requestId: string;
  candidateId: string;
  captureId: string;
  jobId: string;
  subjectDigest: string;
  approveConfirmation: string;
  rejectConfirmation: string;
}

interface FixtureState {
  schemaVersion: 1;
  socketDir: string;
  port: number;
  initial: SeededReview;
}

function paths(rootDir: string) {
  const homeDir = join(rootDir, "home");
  return {
    rootDir,
    homeDir,
    dataDir: join(rootDir, "data"),
    stateDir: join(homeDir, "state", "caphub"),
    configPath: join(homeDir, "config.json"),
    sentinelPath: join(rootDir, SENTINEL),
    statePath: join(rootDir, STATE_FILE),
    certPath: join(rootDir, "tls", "certificate.pem"),
    keyPath: join(rootDir, "tls", "key.pem")
  };
}

function assertOwned(rootDir: string, token: string, ownerPid: number): void {
  const canonicalTmp = realpathSync(tmpdir());
  const sentinelPath = join(rootDir, SENTINEL);
  if (dirname(rootDir) !== canonicalTmp || !basename(rootDir).startsWith(PREFIX)
    || !lstatSync(rootDir).isDirectory() || lstatSync(rootDir).isSymbolicLink()
    || realpathSync(rootDir) !== rootDir || !lstatSync(sentinelPath).isFile()
    || lstatSync(sentinelPath).isSymbolicLink() || realpathSync(sentinelPath) !== sentinelPath) {
    throw new Error("Refusing an unsafe review Registry fixture.");
  }
  const sentinel = JSON.parse(readFileSync(sentinelPath, "utf8"));
  if (!token || sentinel.token !== token || sentinel.ownerPid !== ownerPid) {
    throw new Error("Refusing an unowned review Registry fixture.");
  }
}

export function createCaphubReviewFixture(): CaphubReviewFixture {
  const rootDir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), PREFIX)));
  const token = randomUUID();
  const ownerPid = process.pid;
  const fixturePaths = paths(rootDir);
  writeFileSync(fixturePaths.sentinelPath, `${JSON.stringify({ token, ownerPid })}\n`, { mode: 0o600 });
  let cleaned = false;
  const fixture: CaphubReviewFixture = {
    ...fixturePaths,
    token,
    ownerPid,
    cleanup() {
      if (cleaned) return;
      if (process.pid !== ownerPid) throw new Error("Refusing review Registry cleanup by a non-owner process.");
      assertOwned(rootDir, token, ownerPid);
      rmSync(rootDir, { recursive: true });
      cleaned = true;
    }
  };
  try {
    for (const directory of [
      fixture.stateDir,
      join(fixture.homeDir, "cache"),
      join(fixture.homeDir, "logs"),
      join(fixture.homeDir, "mirrors"),
      ...["projects", "roadmaps", "tasks", "log"].map((name) => join(fixture.dataDir, name)),
      join(rootDir, "workspaces"),
      join(rootDir, "tls")
    ]) mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(fixture.configPath, `${JSON.stringify({
      trustedCodeRoots: [join(rootDir, "workspaces")],
      refreshIntervalSeconds: 300,
      cacheDir: join(fixture.homeDir, "cache"),
      logsDir: join(fixture.homeDir, "logs"),
      mirrorsDir: join(fixture.homeDir, "mirrors"),
      assistant: { enabled: false },
      monitoring: { enabled: false },
      caphub: {
        enabled: true,
        allowedOrigins: [CAPHUB_REVIEW_ORIGIN],
        maxUploadBytes: 10_485_760,
        analysis: { enabled: false },
        registry: {
          enabled: true,
          databaseUrlEnv: DATABASE_ENV,
          migrationDatabaseUrlEnv: "CAPHUB_MIGRATION_DATABASE_URL",
          connectionMode: "tls_verify_full",
          maxConnections: 4,
          statementTimeoutMs: 5_000
        }
      }
    }, null, 2)}\n`, { mode: 0o600 });
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
      "-keyout", fixture.keyPath, "-out", fixture.certPath
    ], { stdio: "pipe", timeout: 15_000 });
    chmodSync(fixture.keyPath, 0o600);
    return fixture;
  } catch (error) {
    fixture.cleanup();
    throw error;
  }
}

export function reviewFixtureEnvironment(fixture: CaphubReviewFixture): Record<string, string> {
  return {
    [ROOT_ENV]: fixture.rootDir,
    [TOKEN_ENV]: fixture.token,
    [OWNER_ENV]: String(fixture.ownerPid),
    ALLJOBS_HOME: fixture.homeDir,
    ALLJOBS_DATA_ROOT: fixture.dataDir
  };
}

export function readCaphubReviewFixture(): CaphubReviewFixture {
  const rootDir = process.env[ROOT_ENV];
  const token = process.env[TOKEN_ENV];
  const ownerPid = Number(process.env[OWNER_ENV]);
  if (!rootDir || !token) throw new Error("Review Registry fixture environment is required.");
  assertOwned(rootDir, token, ownerPid);
  const fixturePaths = paths(rootDir);
  if (process.env.ALLJOBS_HOME !== fixturePaths.homeDir || process.env.ALLJOBS_DATA_ROOT !== fixturePaths.dataDir) {
    throw new Error("Review Registry fixture home overrides do not match ownership.");
  }
  return { ...fixturePaths, token, ownerPid, cleanup: () => undefined };
}

export function readFixtureState(fixture = readCaphubReviewFixture()): FixtureState {
  assertOwned(fixture.rootDir, fixture.token, fixture.ownerPid);
  if (!existsSync(fixture.statePath) || lstatSync(fixture.statePath).isSymbolicLink()) {
    throw new Error("Review Registry fixture state is unavailable.");
  }
  return JSON.parse(readFileSync(fixture.statePath, "utf8")) as FixtureState;
}

export function openFixturePool(fixture = readCaphubReviewFixture()): Pool {
  const state = readFixtureState(fixture);
  return new Pool({
    host: state.socketDir,
    port: state.port,
    user: "caphub_test",
    database: "postgres",
    ssl: false,
    max: 2,
    application_name: "caphub_review_e2e_assertions"
  });
}

function digest(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

export async function seedReviewCandidate(
  pool: Pool,
  fixture: CaphubReviewFixture,
  seed: string
): Promise<SeededReview> {
  assertOwned(fixture.rootDir, fixture.token, fixture.ownerPid);
  const value = digest(seed);
  const now = new Date(1_789_558_400_000 + Number.parseInt(value.slice(0, 6), 16)).toISOString();
  const captureId = `cap_${digest(`${seed}:capture`).slice(0, 32)}`;
  const jobId = `job_${digest(`${seed}:job`).slice(0, 32)}`;
  const objectDigest = digest(`${seed}:image`);
  const object = {
    algorithm: "sha256" as const,
    digest: objectDigest,
    key: `sha256/${objectDigest.slice(0, 2)}/${objectDigest}`,
    bytes: 68
  };
  const capture: CaptureRecord = {
    schema_version: 1,
    id: captureId,
    source: { kind: "web", original_filename: `${seed}.png`, source_url: `https://example.com/${encodeURIComponent(seed)}` },
    note: `Review fixture ${seed}`,
    mime_type: "image/png",
    object,
    idempotency_key: `capture.review-${value.slice(0, 24)}`,
    status: "received",
    human_review_required: true,
    created_at: now
  };
  const captures = new FilesystemCaptureStore(fixture.stateDir);
  const jobs = new FilesystemAnalysisJobStore(fixture.stateDir);
  const artifacts = new FilesystemStageArtifactStore(fixture.stateDir);
  await captures.create(capture);
  const created: StageArtifact[] = [];
  for (const stage of ["preprocess", "extraction", "research", "assessment"] as const) {
    created.push(await artifacts.create({
      jobId,
      captureId,
      stage,
      inputDigest: digest(`${seed}:${stage}:input`),
      payload: { schema_version: 1, stage, fixture: seed },
      createdAt: now
    }));
  }
  const byStage = Object.fromEntries(created.map((artifact) => [artifact.stage, artifact.id]));
  const evidenceId = `ev_${digest(`${seed}:evidence`).slice(0, 32)}`;
  const dimension = { score: 3, reason: "Bounded fixture evidence", evidence_ids: [evidenceId] };
  const packet: ReviewPacket = {
    schema_version: 1,
    packet_id: `rvp_${digest(`${seed}:packet`).slice(0, 32)}`,
    capture_id: captureId,
    source_objects: [object],
    stage_artifact_ids: {
      preprocess: byStage.preprocess,
      extraction: byStage.extraction,
      research: byStage.research,
      assessment: byStage.assessment,
      critic: null
    },
    screenshots: [{ order: 0, object }],
    ocr: [{ image_index: 0, text: "Hostile quoted evidence: <script>never execute()</script>; DROP TABLE is data." }],
    entities: [{ name: `Evidence Studio ${seed}`, aliases: ["Evidence Studio"] }],
    identity: { status: "confirmed", entity_id: `ent_${value.slice(0, 32)}`, evidence_ids: [evidenceId] },
    claims: [{
      id: `clm_${digest(`${seed}:claim`).slice(0, 32)}`,
      statement: "The candidate keeps source evidence pinned to an immutable version.",
      basis: "visible",
      confidence: 0.82,
      evidence_ids: [evidenceId]
    }],
    evidence: [{
      id: evidenceId,
      tier: "A",
      source_url: "https://docs.example.com/caphub",
      title: "Official docs <img src=x onerror=alert(1)>",
      checked_at: now,
      content_digest: digest(`${seed}:source`),
      claims: ["Pinned evidence"]
    }],
    conflicts: [{ summary: "Critic requested a narrower adoption boundary.", evidence_ids: [evidenceId] }],
    candidate: {
      name: `Evidence Studio ${seed}`,
      novel_capabilities: ["Pinned sources"],
      overlapping_capabilities: ["Review queue"],
      replaces: [],
      complements: ["Human review"],
      conflicts_with: [],
      capability_gaps: ["No autonomous release"]
    },
    alternatives: [],
    dimensions: {
      personal_fit: dimension,
      capability_value: dimension,
      evidence_confidence: { ...dimension, score: 4 },
      novelty: dimension,
      reusability: dimension,
      portability: dimension,
      maturity: dimension,
      maintenance_burden: dimension,
      security_risk: dimension,
      adoption_cost: dimension
    },
    recommended_disposition: "build",
    disposition_reason: "Fixture evidence supports a bounded build decision.",
    critic: {
      schema_version: 1,
      capture_id: captureId,
      assessment_artifact_id: byStage.assessment,
      verdict: "revise",
      findings: [{ severity: "medium", summary: "Keep publication out of scope.", evidence_ids: [evidenceId] }],
      recommended_disposition: "build",
      unresolved_questions: ["Who owns the later release gate?"],
      reviewed_at: now
    },
    platform_previews: [],
    model_contracts: [{ stage: "research", provider: "kimi", model: "k3-256k", schema_version: 1 }],
    unresolved_questions: ["Confirm the later release owner."],
    human_review_required: true,
    created_at: now
  };
  const packetArtifact = await artifacts.create({
    jobId,
    captureId,
    stage: "review_packet",
    inputDigest: digest(`${seed}:packet-input`),
    payload: packet,
    createdAt: now
  });
  const job: AnalysisJob = {
    schema_version: 1,
    id: jobId,
    capture_id: captureId,
    input_digest: digest(`${seed}:job-input`),
    completed_artifact_ids: [...created.map(({ id }) => id), packetArtifact.id],
    status: "completed",
    review_packet_artifact_id: packetArtifact.id,
    completed_at: now,
    created_at: now,
    updated_at: now
  };
  await jobs.put(job);
  const imported = await createReviewPacketImporter({
    pool,
    captures,
    jobs,
    artifacts,
    clock: () => now
  }).importReviewPacket({ jobId });
  const request = await pool.query<{
    subject_id: string;
    subject_digest: string;
    approve_confirmation: string;
    reject_confirmation: string;
  }>(`SELECT subject_id, subject_digest, approve_confirmation, reject_confirmation
      FROM caphub.review_requests WHERE request_id = $1`, [imported.requestId]);
  if (!request.rows[0]) throw new Error("Fixture import did not create a review request.");
  return {
    requestId: imported.requestId,
    candidateId: request.rows[0].subject_id,
    captureId,
    jobId,
    subjectDigest: request.rows[0].subject_digest,
    approveConfirmation: request.rows[0].approve_confirmation,
    rejectConfirmation: request.rows[0].reject_confirmation
  };
}

export function setRegistryEnabled(fixture: CaphubReviewFixture, enabled: boolean): void {
  assertOwned(fixture.rootDir, fixture.token, fixture.ownerPid);
  const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
  config.caphub.registry.enabled = enabled;
  writeFileSync(fixture.configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function snapshotFixtureFiles(fixture: CaphubReviewFixture): Record<string, string> {
  assertOwned(fixture.rootDir, fixture.token, fixture.ownerPid);
  const snapshot: Record<string, string> = {};
  const visit = (directory: string, prefix = "") => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink() || realpathSync(path) !== path) throw new Error("Fixture snapshot refuses symlinks.");
      if (metadata.isDirectory()) visit(path, relative);
      else snapshot[relative] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  };
  visit(fixture.rootDir);
  return snapshot;
}

function databaseUrl(postgres: CaphubTestPostgres): string {
  return `postgresql://caphub_app@localhost/postgres?host=${encodeURIComponent(postgres.socketDir)}&port=${postgres.port}&sslmode=disable`;
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

async function serveCaphubReviewFixture(): Promise<void> {
  const fixture = readCaphubReviewFixture();
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
        new Promise<void>((resolveTimeout) => setTimeout(() => { next!.kill("SIGKILL"); resolveTimeout(); }, 3_000))
      ]);
    }
    await postgres?.stop();
    process.exit(code);
  };
  try {
    postgres = await startCaphubTestPostgres();
    await applyRegistryMigrations(postgres.pool);
    const initial = await seedReviewCandidate(postgres.pool, fixture, "waiting-initial");
    writeFileSync(fixture.statePath, `${JSON.stringify({
      schemaVersion: 1,
      socketDir: postgres.socketDir,
      port: postgres.port,
      initial
    } satisfies FixtureState, null, 2)}\n`, { mode: 0o600 });
    const seam = {
      [ROOT_ENV]: fixture.rootDir,
      [TOKEN_ENV]: fixture.token,
      [OWNER_ENV]: String(fixture.ownerPid)
    };
    next = spawn(process.execPath, [
      resolve("node_modules/next/dist/bin/next"), "start", "-p", "3470", "-H", "127.0.0.1"
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
        ...seam
      }
    });
    proxy = createServer({ key: readFileSync(fixture.keyPath), cert: readFileSync(fixture.certPath) }, (incoming, outgoing) => {
      const upstream = httpRequest({
        hostname: "127.0.0.1",
        port: 3470,
        method: incoming.method,
        path: incoming.url,
        headers: incoming.headers
      }, (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      });
      upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
      incoming.pipe(upstream);
    });
    next.once("error", () => { void stop(1); });
    next.once("exit", (code) => { if (!stopping) void stop(code || 1); });
    proxy.on("error", () => { void stop(1); });
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void stop(0); });
    proxy.listen(3471, "127.0.0.1");
  } catch (error) {
    console.error("Review Registry fixture startup failed:", error);
    await stop(1);
  }
}

if (process.argv[2] === "serve-caphub-review-fixture") void serveCaphubReviewFixture();
