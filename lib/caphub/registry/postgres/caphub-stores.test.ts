import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../../tests/helpers/caphub-postgres";
import type { AnalysisJob } from "../../analysis/types";
import type { CaptureRecord } from "../../domain/types";
import { defineCaptureStoreContract } from "../contract-suite";
import { applyRegistryMigrations } from "../migrate";
import { buildModelCallAuditEvent } from "../../workflow/audit";
import {
  PostgresAnalysisJobStore,
  PostgresCaptureAuditLog,
  PostgresCaptureStore,
  PostgresCaphubStoreError,
  PostgresModelCallAuditStore,
  PostgresStageArtifactStore
} from "./caphub-stores";

const NOW = "2026-09-16T08:00:00.000Z";
let fixture: CaphubTestPostgres;
let counter = 1;

function hexId(prefix: string, seed: number, length = 32): string {
  return `${prefix}${seed.toString(16).repeat(length).slice(0, length)}`;
}

function capture(seed: number, overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  const digest = seed.toString(16).repeat(64).slice(0, 64);
  return {
    schema_version: 1,
    id: hexId("cap_", seed),
    source: {
      kind: "web",
      original_filename: `capture-${seed}.png`,
      source_url: `https://example.com/capture/${seed}`
    },
    note: `Capture ${seed}`,
    mime_type: "image/png",
    object: {
      algorithm: "sha256",
      digest,
      key: `sha256/${digest.slice(0, 2)}/${digest}`,
      bytes: 42
    },
    idempotency_key: `capture.request-20260916:postgres-${seed}`,
    status: "received",
    human_review_required: true,
    created_at: NOW,
    ...overrides
  };
}

function queued(seed: number, overrides: Partial<AnalysisJob> = {}): AnalysisJob {
  return {
    schema_version: 1,
    id: hexId("job_", seed),
    capture_id: hexId("cap_", seed),
    input_digest: "a".repeat(64),
    completed_artifact_ids: [],
    status: "queued",
    created_at: NOW,
    updated_at: NOW,
    ...overrides
  } as AnalysisJob;
}

beforeAll(async () => {
  fixture = await startCaphubTestPostgres();
  await applyRegistryMigrations(fixture.pool);
}, 30_000);

afterAll(async () => {
  await fixture?.stop();
}, 30_000);

defineCaptureStoreContract("PostgreSQL", () => {
  const seed = counter++;
  const base = capture(seed);
  return {
    store: new PostgresCaptureStore(fixture.pool),
    record: (overrides = {}) => ({ ...base, ...overrides })
  };
});

describe.sequential("PostgreSQL Caphub storage ports", () => {
  it("round-trips legacy and operation-aware audit metadata without persisting model text", async () => {
    const seed = counter++;
    const store = new PostgresModelCallAuditStore(fixture.pool);
    const base = {
      jobId: hexId("job_", seed), captureId: hexId("cap_", seed), stage: "extraction" as const,
      provider: "deepseek" as const, model: "deepseek-flash", attempt: 1 as const,
      inputDigest: "5".repeat(64), inputBytes: 100, occurredAt: NOW
    };
    const legacy = buildModelCallAuditEvent(base, { type: "started" });
    const failed = buildModelCallAuditEvent({
      ...base, operation: "schema_structuring", contractVersion: "caphub-deepseek-extraction-v2",
      occurredAt: "2026-09-16T08:01:00.000Z"
    }, {
      type: "failed", errorCode: "DEEPSEEK_STRUCTURE_FAILED", finishReason: "completed",
      outputBytes: 100, outputDigest: "6".repeat(64), inputTokens: 20, outputTokens: 10,
      validationIssuePaths: ["claims.0.source_refs"]
    });
    await store.append(legacy);
    await store.append(failed);
    await expect(new PostgresModelCallAuditStore(fixture.pool).list(base.jobId)).resolves.toEqual([legacy, failed]);
    expect(failed).toHaveProperty("operation", "schema_structuring");
    const stored = await fixture.pool.query("SELECT metadata FROM caphub.audit_events WHERE subject_id = $1", [base.jobId]);
    expect(JSON.stringify(stored.rows)).not.toMatch(/"(?:observation|prompt|response|reasoning|secret)":/);
    await expect(store.append({ ...failed, operation: "visual_observation" })).rejects.toBeInstanceOf(PostgresCaphubStoreError);
  });

  it("allows exactly one concurrent Capture create and reads it after adapter restart", async () => {
    const seed = counter++;
    const input = capture(seed);
    const first = new PostgresCaptureStore(fixture.pool);
    const results = await Promise.all([first.create(input), first.create(input)]);
    expect(results.sort()).toEqual(["conflict", "created"]);
    await expect(new PostgresCaptureStore(fixture.pool).get(input.id)).resolves.toEqual(input);
  });

  it("persists validated job transitions as immutable versions and rejects stale terminal rewrites", async () => {
    const seed = counter++;
    const jobs = new PostgresAnalysisJobStore(fixture.pool);
    const initial = queued(seed);
    const running = queued(seed, {
      status: "running",
      stage: "preprocess",
      started_at: NOW,
      updated_at: "2026-09-16T08:01:00.000Z"
    });
    const failed = queued(seed, {
      status: "failed",
      stage: "preprocess",
      error_code: "INTERNAL_ERROR",
      reason: "fixture",
      failed_at: "2026-09-16T08:02:00.000Z",
      updated_at: "2026-09-16T08:02:00.000Z"
    });
    await jobs.put(initial);
    await jobs.put(running);
    await jobs.put(failed);
    await expect(new PostgresAnalysisJobStore(fixture.pool).get(initial.id)).resolves.toEqual(failed);
    await expect(jobs.put(running)).rejects.toBeInstanceOf(PostgresCaphubStoreError);
    const versions = await fixture.pool.query<{ version: number }>(
      "SELECT version FROM caphub.registry_versions WHERE record_id = $1 ORDER BY version",
      [initial.id]
    );
    expect(versions.rows.map(({ version }) => version)).toEqual([1, 2, 3]);
  });

  it("persists content-addressed artifact metadata and exact JSON payloads idempotently", async () => {
    const seed = counter++;
    const store = new PostgresStageArtifactStore(fixture.pool);
    const input = {
      jobId: hexId("job_", seed),
      captureId: hexId("cap_", seed),
      stage: "preprocess" as const,
      inputDigest: "b".repeat(64),
      payload: { schema_version: 1, hostile: "'; DROP TABLE caphub.registry_records; --" },
      createdAt: NOW
    };
    const artifact = await store.create(input);
    await expect(store.create(input)).resolves.toEqual(artifact);
    await expect(new PostgresStageArtifactStore(fixture.pool).get(artifact.id)).resolves.toEqual(artifact);
    await expect(store.readPayload(artifact.id)).resolves.toEqual(input.payload);
    await expect(store.findByJobStage(input.jobId, input.stage)).resolves.toEqual(artifact);
  });

  it("appends capture and model-call audits deterministically without duplicates", async () => {
    const seed = counter++;
    const captureId = hexId("cap_", seed);
    const captureAudit = new PostgresCaptureAuditLog(fixture.pool);
    const received = {
      schema_version: 1 as const,
      event_id: hexId("evt_", seed),
      capture_id: captureId,
      type: "capture.received" as const,
      actor: "web:user" as const,
      occurred_at: NOW,
      object_digest: "c".repeat(64)
    };
    await expect(captureAudit.ensure(received)).resolves.toBe("appended");
    await expect(captureAudit.ensure(received)).resolves.toBe("existing");

    const modelAudits = new PostgresModelCallAuditStore(fixture.pool);
    const started = buildModelCallAuditEvent({
      jobId: hexId("job_", seed),
      captureId,
      stage: "extraction",
      provider: "minimax",
      model: "MiniMax-M3",
      attempt: 1,
      inputDigest: "d".repeat(64),
      inputBytes: 20,
      occurredAt: NOW
    }, { type: "started" });
    await Promise.all([modelAudits.append(started), modelAudits.append(started)]);
    await expect(new PostgresModelCallAuditStore(fixture.pool).list(started.job_id)).resolves.toEqual([started]);
    await expect(modelAudits.append({ ...started, input_bytes: 21 })).rejects.toBeInstanceOf(
      PostgresCaphubStoreError
    );
  });
});
