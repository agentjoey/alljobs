import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Pool } from "pg";
import { testCapabilityPackage } from "../../lib/caphub/packages/fixtures";
import type { CapabilityPackage } from "../../lib/caphub/packages/types";
import { digestCanonicalJson } from "../../lib/caphub/analysis/digest";
import { applyRegistryMigrations } from "../../lib/caphub/registry/migrate";
import { writeTargetSentinel } from "../../lib/caphub/projection/paths";
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../helpers/caphub-postgres";

const PREFIX = "alljobs-caphub-p4-e2e-";
const SENTINEL = ".alljobs-caphub-p4-e2e-fixture.json";
const ROOT_ENV = "ALLJOBS_CAPHUB_P4_E2E_ROOT";
const TOKEN_ENV = "ALLJOBS_CAPHUB_P4_E2E_TOKEN";
const OWNER_ENV = "ALLJOBS_CAPHUB_P4_E2E_OWNER_PID";
const DATABASE_ENV = "CAPHUB_E2E_DATABASE_URL";
const STATE_FILE = "p4-fixture-state.json";
export const CAPHUB_P4_ORIGIN = "https://127.0.0.1:3473";
const NEXT_PORT = 3472;

export interface P4Fixture {
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

export interface P4FixtureState {
  schemaVersion: 1;
  socketDir: string;
  port: number;
  candidates: Record<string, string>;
  releaseWaiting: string;
  releaseDeployed: string;
  releaseUnsupported: string;
  deploymentRequestWaiting: string;
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
  const sentinelPath = join(rootDir, SENTINEL);
  if (dirname(rootDir) !== realpathSync(tmpdir()) || !basename(rootDir).startsWith(PREFIX)
    || realpathSync(rootDir) !== rootDir || !lstatSync(sentinelPath).isFile()
    || realpathSync(sentinelPath) !== sentinelPath) {
    throw new Error("Refusing an unsafe P4 fixture.");
  }
  const sentinel = JSON.parse(readFileSync(sentinelPath, "utf8"));
  if (!token || sentinel.token !== token || sentinel.ownerPid !== ownerPid) {
    throw new Error("Refusing an unowned P4 fixture.");
  }
}

export function createP4Fixture(): P4Fixture {
  const rootDir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), PREFIX)));
  const token = randomUUID();
  const ownerPid = process.pid;
  const fixturePaths = paths(rootDir);
  writeFileSync(fixturePaths.sentinelPath, `${JSON.stringify({ token, ownerPid })}\n`, { mode: 0o600 });
  let cleaned = false;
  const fixture: P4Fixture = {
    ...fixturePaths,
    token,
    ownerPid,
    cleanup() {
      if (cleaned) return;
      if (process.pid !== ownerPid) throw new Error("Refusing P4 cleanup by a non-owner process.");
      assertOwned(rootDir, token, ownerPid);
      rmSync(rootDir, { recursive: true });
      cleaned = true;
    }
  };
  try {
    const obsidianRoot = join(rootDir, "targets", "obsidian");
    const codexRoot = join(rootDir, "targets", "codex");
    for (const directory of [
      fixture.stateDir,
      join(fixture.homeDir, "cache"),
      join(fixture.homeDir, "logs"),
      join(fixture.homeDir, "mirrors"),
      obsidianRoot,
      codexRoot,
      join(rootDir, "workspaces"),
      join(rootDir, "tls")
    ]) mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeTargetSentinelSync(obsidianRoot, "obsidian-primary");
    writeTargetSentinelSync(codexRoot, "codex-primary");
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
        allowedOrigins: [CAPHUB_P4_ORIGIN],
        maxUploadBytes: 10_485_760,
        analysis: { enabled: false },
        registry: {
          enabled: true,
          databaseUrlEnv: DATABASE_ENV,
          sslMode: "require",
          maxConnections: 4,
          statementTimeoutMs: 5_000
        },
        exports: {
          enabled: true,
          obsidian: { enabled: true, root: obsidianRoot, alias: "obsidian-primary" },
          packageRepository: { enabled: false },
          targets: {
            codex: { enabled: true, root: codexRoot, alias: "codex-primary" },
            claude: { enabled: false },
            hermes: { enabled: false }
          }
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

function writeTargetSentinelSync(root: string, alias: string): void {
  writeFileSync(join(root, ".caphub-target.json"), `${JSON.stringify({ schema_version: 1, caphub: true, alias }, null, 2)}\n`, { mode: 0o600 });
}

export function p4FixtureEnvironment(fixture: P4Fixture): Record<string, string> {
  return {
    [ROOT_ENV]: fixture.rootDir,
    [TOKEN_ENV]: fixture.token,
    [OWNER_ENV]: String(fixture.ownerPid),
    ALLJOBS_HOME: fixture.homeDir,
    ALLJOBS_DATA_ROOT: fixture.dataDir
  };
}

export function readP4Fixture(): P4Fixture {
  const rootDir = process.env[ROOT_ENV];
  const token = process.env[TOKEN_ENV];
  const ownerPid = Number(process.env[OWNER_ENV]);
  if (!rootDir || !token) throw new Error("P4 fixture environment is required.");
  assertOwned(rootDir, token, ownerPid);
  const fixturePaths = paths(rootDir);
  if (process.env.ALLJOBS_HOME !== fixturePaths.homeDir || process.env.ALLJOBS_DATA_ROOT !== fixturePaths.dataDir) {
    throw new Error("P4 fixture home overrides do not match ownership.");
  }
  return { ...fixturePaths, token, ownerPid, cleanup: () => undefined };
}

export function readP4FixtureState(fixture = readP4Fixture()): P4FixtureState {
  assertOwned(fixture.rootDir, fixture.token, fixture.ownerPid);
  return JSON.parse(readFileSync(fixture.statePath, "utf8")) as P4FixtureState;
}

export function openP4Pool(fixture = readP4Fixture()): Pool {
  const state = readP4FixtureState(fixture);
  return new Pool({
    host: state.socketDir,
    port: state.port,
    user: "caphub_test",
    database: "postgres",
    ssl: false,
    max: 2,
    application_name: "caphub_p4_e2e_assertions"
  });
}

function digest(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

function shortId(recordId: string): string {
  return recordId.slice(recordId.indexOf("_") + 1, recordId.indexOf("_") + 9);
}

export async function seedP4Matrix(pool: Pool, fixture: P4Fixture): Promise<P4FixtureState> {
  const now = "2026-09-16T13:00:00.000Z";
  const candidates: Record<string, string> = {};
  async function insertRecord(recordId: string, kind: string, payload: unknown, payloadDigest: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO caphub.registry_records (record_id, kind, current_version, created_at, updated_at) VALUES ($1,$2,1,$3,$3)",
        [recordId, kind, now]
      );
      await client.query(
        `INSERT INTO caphub.registry_versions (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
         VALUES ($1,1,$2,1,$3::jsonb,$4,NULL,$5)`,
        [recordId, kind, JSON.stringify(payload), payloadDigest, now]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async function insertLineage(fromId: string, fromKind: string, fromDigest: string, relationship: string, toId: string, toKind: string, toDigest: string): Promise<void> {
    await pool.query(
      `INSERT INTO caphub.registry_lineage
        (from_node_id, from_kind, from_version, from_digest, relationship, to_node_id, to_kind, to_version, to_digest, created_at)
       VALUES ($1,$2,1,$3,$4,$5,$6,1,$7,$8)`,
      [fromId, fromKind, fromDigest, relationship, toId, toKind, toDigest, now]
    );
  }
  async function insertRequest(requestId: string, kind: "candidate" | "release" | "deployment", subjectId: string, subjectKind: string, digestValue: string, state: string, lockVersion: number): Promise<void> {
    const noun = kind === "candidate" ? "CANDIDATE" : kind === "release" ? "RELEASE" : "DEPLOYMENT";
    await pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation, superseded_by_request_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,NULL,$10,$10)`,
      [requestId, kind, subjectKind, subjectId, digestValue, lockVersion, state,
        `${state === "APPROVED" ? "APPROVE" : "APPROVE"} ${noun} ${shortId(subjectId)}`,
        `REJECT ${noun} ${shortId(subjectId)}`, now]
    );
  }
  async function insertDecision(decisionId: string, requestId: string, key: string, lockVersion: number, digestValue: string, action: string, kind: string, subjectId: string, confirmation: string, disposition: string | null): Promise<void> {
    await pool.query(
      `INSERT INTO caphub.review_decisions
        (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
         action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
         subject_digest, actor, confirmation_digest, original_approval_decision_id, revokes_decision_id, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Exact fixture decision',$8,$9,$10,1,$5,'human:owner',$5,NULL,NULL,$11)`,
      [decisionId, requestId, key, lockVersion, digestValue, action, confirmation, disposition, kind, subjectId, now]
    );
  }

  function candidatePayload(seed: string, name: string) {
    return {
      name,
      novel_capabilities: [`${name} capability`],
      overlapping_capabilities: [],
      replaces: [],
      complements: [],
      conflicts_with: [],
      capability_gaps: []
    };
  }

  async function seedCandidate(seed: string, name: string): Promise<{ candidateId: string; candidateDigest: string }> {
    const candidateId = `cand_${digest(`${seed}:candidate`).slice(0, 32)}`;
    const payload = candidatePayload(seed, name);
    const candidateDigest = digestCanonicalJson(payload);
    await insertRecord(candidateId, "candidate", payload, candidateDigest);
    candidates[seed] = candidateId;
    return { candidateId, candidateDigest };
  }

  async function seedRelease(seed: string, candidateId: string, candidateDigest: string, pkg: CapabilityPackage): Promise<{
    releaseId: string; releaseDigest: string;
  }> {
    const releaseId = pkg.release_id;
    const releaseDigest = digestCanonicalJson(pkg);
    await insertRecord(releaseId, "release", pkg, releaseDigest);
    await insertLineage(candidateId, "candidate", candidateDigest, "realized_as", releaseId, "release", releaseDigest);
    return { releaseId, releaseDigest };
  }

  // A: no release.
  await seedCandidate("plain", "Plain Candidate");

  // B: release waiting + deployment plan waiting + obsidian conflict.
  const b = await seedCandidate("waiting", "Waiting Release");
  const pkgB = testCapabilityPackage({
    release_id: `rel_${digest("waiting:release").slice(0, 32)}`,
    package_id: `pkg_${digest("waiting:package").slice(0, 32)}`,
    slug: "waiting-release",
    title: "Waiting Release",
    dependencies: []
  });
  const releaseB = await seedRelease("waiting", b.candidateId, b.candidateDigest, pkgB);
  await insertRequest(`rev_${digest("waiting:request").slice(0, 32)}`, "release", releaseB.releaseId, "release", releaseB.releaseDigest, "WAITING_FOR_REVIEW", 1);
  const planB: Record<string, unknown> = {
    schema_version: 1,
    action: "publish",
    target: "codex",
    target_alias: "codex-primary",
    release: { record_id: releaseB.releaseId, version: 1, digest: releaseB.releaseDigest },
    adapter: { name: "codex", version: "1.0.0", digest: digest("adapter") },
    preview_manifest_digest: digest("manifest"),
    preview_diff_digest: digest("diff"),
    expected_current_pointer: null,
    target_preimage_digest: digest("preimage"),
    created_at: now
  };
  const planBDigest = digestCanonicalJson(planB);
  const planBId = `dpl_${digest("waiting:plan").slice(0, 32)}`;
  await insertRecord(planBId, "deployment_plan", planB, planBDigest);
  await insertLineage(releaseB.releaseId, "release", releaseB.releaseDigest, "proposes", planBId, "deployment_plan", planBDigest);
  const planBRequest = `rev_${digest("waiting:plan-request").slice(0, 32)}`;
  await insertRequest(planBRequest, "deployment", planBId, "deployment_plan", planBDigest, "WAITING_FOR_REVIEW", 1);

  // C: finalized release + deployed pointer + rollback plan approved.
  const c = await seedCandidate("deployed", "Deployed Release");
  const pkgC = testCapabilityPackage({
    release_id: `rel_${digest("deployed:release").slice(0, 32)}`,
    package_id: `pkg_${digest("deployed:package").slice(0, 32)}`,
    slug: "deployed-release",
    title: "Deployed Release",
    dependencies: []
  });
  const releaseC = await seedRelease("deployed", c.candidateId, c.candidateDigest, pkgC);
  const releaseCRequest = `rev_${digest("deployed:request").slice(0, 32)}`;
  await insertRequest(releaseCRequest, "release", releaseC.releaseId, "release", releaseC.releaseDigest, "APPROVED", 2);
  const releaseCDecision = `dec_${digest("deployed:decision").slice(0, 32)}`;
  await insertDecision(releaseCDecision, releaseCRequest, "intent-release-deployed-1", 1, releaseC.releaseDigest, "approve", "release", releaseC.releaseId, `APPROVE RELEASE ${shortId(releaseC.releaseId)}`, null);
  await pool.query("INSERT INTO caphub.decision_consumers (decision_id, consumer_id, consumed_at) VALUES ($1,$2,$3)", [releaseCDecision, releaseC.releaseId, now]);

  const planC: Record<string, unknown> = {
    schema_version: 1,
    action: "publish",
    target: "codex",
    target_alias: "codex-primary",
    release: { record_id: releaseC.releaseId, version: 1, digest: releaseC.releaseDigest },
    adapter: { name: "codex", version: "1.0.0", digest: digest("adapter") },
    preview_manifest_digest: digest("manifest-c"),
    preview_diff_digest: digest("diff-c"),
    expected_current_pointer: null,
    target_preimage_digest: digest("preimage-c"),
    created_at: now
  };
  const planCDigest = digestCanonicalJson(planC);
  const planCId = `dpl_${digest("deployed:plan").slice(0, 32)}`;
  await insertRecord(planCId, "deployment_plan", planC, planCDigest);
  await insertLineage(releaseC.releaseId, "release", releaseC.releaseDigest, "proposes", planCId, "deployment_plan", planCDigest);
  const planCRequest = `rev_${digest("deployed:plan-request").slice(0, 32)}`;
  await insertRequest(planCRequest, "deployment", planCId, "deployment_plan", planCDigest, "APPROVED", 2);
  const planCDecision = `dec_${digest("deployed:plan-decision").slice(0, 32)}`;
  await insertDecision(planCDecision, planCRequest, "intent-plan-deployed-1", 1, planCDigest, "approve", "deployment", planCId, `APPROVE DEPLOYMENT ${shortId(planCId)}`, null);
  const deploymentCId = `dep_${digest("deployed:deployment").slice(0, 32)}`;
  await pool.query("INSERT INTO caphub.decision_consumers (decision_id, consumer_id, consumed_at) VALUES ($1,$2,$3)", [planCDecision, deploymentCId, now]);
  const deploymentCPayload = {
    schema_version: 1,
    action: "publish",
    target: "codex",
    target_alias: "codex-primary",
    release: { record_id: releaseC.releaseId, version: 1, digest: releaseC.releaseDigest },
    plan: { record_id: planCId, version: 1, digest: planCDigest },
    prior_pointer: null,
    created_at: now
  };
  const deploymentCDigest = digestCanonicalJson(deploymentCPayload);
  await insertRecord(deploymentCId, "deployment", deploymentCPayload, deploymentCDigest);
  await insertLineage(planCId, "deployment_plan", planCDigest, "realized_as", deploymentCId, "deployment", deploymentCDigest);
  await insertLineage(releaseC.releaseId, "release", releaseC.releaseDigest, "deployed_as", deploymentCId, "deployment", deploymentCDigest);

  const rollbackPlan: Record<string, unknown> = {
    ...planC,
    action: "rollback",
    expected_current_pointer: {
      deployment_id: deploymentCId,
      release_id: releaseC.releaseId,
      release_version: 1,
      release_digest: releaseC.releaseDigest,
      pointer_digest: digest("pointer-c")
    },
    created_at: now
  };
  const rollbackDigest = digestCanonicalJson(rollbackPlan);
  const rollbackId = `dpl_${digest("deployed:rollback").slice(0, 32)}`;
  await insertRecord(rollbackId, "deployment_plan", rollbackPlan, rollbackDigest);
  await insertLineage(releaseC.releaseId, "release", releaseC.releaseDigest, "proposes", rollbackId, "deployment_plan", rollbackDigest);
  const rollbackRequest = `rev_${digest("deployed:rollback-request").slice(0, 32)}`;
  await insertRequest(rollbackRequest, "deployment", rollbackId, "deployment_plan", rollbackDigest, "APPROVED", 2);
  const rollbackDecision = `dec_${digest("deployed:rollback-decision").slice(0, 32)}`;
  await insertDecision(rollbackDecision, rollbackRequest, "intent-rollback-1", 1, rollbackDigest, "approve", "deployment", rollbackId, `APPROVE DEPLOYMENT ${shortId(rollbackId)}`, null);
  await pool.query("INSERT INTO caphub.decision_consumers (decision_id, consumer_id, consumed_at) VALUES ($1,$2,$3)", [rollbackDecision, `dep_${digest("deployed:rollback-deployment").slice(0, 32)}`, now]);

  const pointerBase = {
    deployment_id: deploymentCId,
    release_id: releaseC.releaseId,
    release_version: 1,
    release_digest: releaseC.releaseDigest
  };
  const pointer = {
    ...pointerBase,
    pointer_digest: digest(JSON.stringify({ schema_version: 1, pointer: pointerBase }))
  };
  const codexRoot = join(fixture.rootDir, "targets", "codex");
  const versionDir = join(codexRoot, "versions", releaseC.releaseId, "1", String(planC.preview_manifest_digest));
  mkdirSync(join(versionDir, "$CODEX_HOME", "skills", pkgC.slug), { recursive: true, mode: 0o700 });
  writeFileSync(join(versionDir, ".caphub-version.json"), `${JSON.stringify({ schema_version: 1, action: "publish", release: planC.release, manifest_digest: planC.preview_manifest_digest, files: [] }, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(join(versionDir, "$CODEX_HOME", "skills", pkgC.slug, "SKILL.md"), "# Deployed Release\n", { mode: 0o600 });
  writeFileSync(join(codexRoot, "current.json"), `${JSON.stringify(pointer, null, 2)}\n`, { mode: 0o600 });

  // D: unsupported adapter via copyleft license.
  const d = await seedCandidate("unsupported", "Unsupported License Release");
  const pkgD = testCapabilityPackage({
    release_id: `rel_${digest("unsupported:release").slice(0, 32)}`,
    package_id: `pkg_${digest("unsupported:package").slice(0, 32)}`,
    slug: "unsupported-license-release",
    title: "Unsupported License Release",
    dependencies: [],
    license: { spdx_id: "GPL-3.0", provenance_confidence: "medium" }
  });
  const releaseD = await seedRelease("unsupported", d.candidateId, d.candidateDigest, pkgD);
  await insertRequest(`rev_${digest("unsupported:request").slice(0, 32)}`, "release", releaseD.releaseId, "release", releaseD.releaseDigest, "WAITING_FOR_REVIEW", 1);

  // Obsidian projection conflict for B.
  const obsidianRoot = join(fixture.rootDir, "targets", "obsidian");
  mkdirSync(join(obsidianRoot, "Caphub", "20 Capabilities"), { recursive: true, mode: 0o700 });
  writeFileSync(join(obsidianRoot, "Caphub", "20 Capabilities", `${pkgB.slug}.md`), "# Human note without markers\n", { mode: 0o600 });

  return {
    schemaVersion: 1,
    socketDir: (pool as unknown as { options?: { host?: string } }).options?.host ?? "",
    port: 0,
    candidates,
    releaseWaiting: b.candidateId,
    releaseDeployed: c.candidateId,
    releaseUnsupported: d.candidateId,
    deploymentRequestWaiting: planBRequest
  };
}

export function setP4ExportsEnabled(fixture: P4Fixture, enabled: boolean): void {
  assertOwned(fixture.rootDir, fixture.token, fixture.ownerPid);
  const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
  config.caphub.exports.enabled = enabled;
  writeFileSync(fixture.configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function databaseUrl(postgres: CaphubTestPostgres): string {
  return `postgresql://caphub_app@localhost/postgres?host=${encodeURIComponent(postgres.socketDir)}&port=${postgres.port}&sslmode=disable`;
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

async function serveP4Fixture(): Promise<void> {
  const fixture = readP4Fixture();
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
    const state = await seedP4Matrix(postgres.pool, fixture);
    state.socketDir = postgres.socketDir;
    state.port = postgres.port;
    writeFileSync(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    const seam = {
      [ROOT_ENV]: fixture.rootDir,
      [TOKEN_ENV]: fixture.token,
      [OWNER_ENV]: String(fixture.ownerPid)
    };
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
        ...seam
      }
    });
    proxy = createServer({ key: readFileSync(fixture.keyPath), cert: readFileSync(fixture.certPath) }, (incoming, outgoing) => {
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
      upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
      incoming.pipe(upstream);
    });
    next.once("error", () => { void stop(1); });
    next.once("exit", (code) => { if (!stopping) void stop(code || 1); });
    proxy.on("error", () => { void stop(1); });
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void stop(0); });
    proxy.listen(3473, "127.0.0.1");
  } catch (error) {
    console.error("P4 fixture startup failed:", error);
    await stop(1);
  }
}

if (process.argv[2] === "serve-caphub-p4-fixture") void serveP4Fixture();
