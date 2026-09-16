import { randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import type { AnalysisJob, ReviewPacket, StageArtifact } from "../analysis/types";
import type { CaptureRecord } from "../domain/types";
import { FilesystemCaptureStore } from "../storage/filesystem";
import { FilesystemAnalysisJobStore, FilesystemStageArtifactStore } from "../workflow/filesystem";
import { applyRegistryMigrations } from "./migrate";
import { createReviewPacketImporter } from "./import-review-packet";

const NOW = "2026-09-16T10:00:00.000Z";
const CAPTURE_ID = `cap_${"1".repeat(32)}`;
const JOB_ID = `job_${"2".repeat(32)}`;
const PREFIX = "caphub-import-test-";
const SENTINEL = ".owner.json";
let postgres: CaphubTestPostgres;
const fixtures: Array<{ root: string; token: string }> = [];

function fixtureRoot(): string {
  const parent = realpathSync(tmpdir());
  const fixture = realpathSync(mkdtempSync(join(parent, PREFIX)));
  const token = randomUUID();
  writeFileSync(join(fixture, SENTINEL), JSON.stringify({ token, pid: process.pid }), { mode: 0o600 });
  fixtures.push({ root: fixture, token });
  const root = join(fixture, "home", "state", "caphub");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  return realpathSync(root);
}

function cleanup(): void {
  while (fixtures.length) {
    const fixture = fixtures.pop()!;
    const owner = JSON.parse(readFileSync(join(fixture.root, SENTINEL), "utf8"));
    if (dirname(fixture.root) !== realpathSync(tmpdir())
      || !basename(fixture.root).startsWith(PREFIX)
      || lstatSync(fixture.root).isSymbolicLink()
      || owner.token !== fixture.token
      || owner.pid !== process.pid) throw new Error("unsafe import fixture cleanup");
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

const object = {
  algorithm: "sha256" as const,
  digest: "a".repeat(64),
  key: `sha256/aa/${"a".repeat(64)}`,
  bytes: 42
};

const capture: CaptureRecord = {
  schema_version: 1,
  id: CAPTURE_ID,
  source: { kind: "web", original_filename: "fixture.png", source_url: "https://example.com/fixture" },
  note: "Import fixture",
  mime_type: "image/png",
  object,
  idempotency_key: "capture.request-20260916:import-fixture",
  status: "received",
  human_review_required: true,
  created_at: NOW
};

async function seedFilesystem() {
  const root = fixtureRoot();
  const captures = new FilesystemCaptureStore(root);
  const jobs = new FilesystemAnalysisJobStore(root);
  const artifacts = new FilesystemStageArtifactStore(root);
  await captures.create(capture);
  const created: StageArtifact[] = [];
  for (const stage of ["preprocess", "extraction", "research", "assessment"] as const) {
    created.push(await artifacts.create({
      jobId: JOB_ID,
      captureId: CAPTURE_ID,
      stage,
      inputDigest: stage.charCodeAt(0).toString(16).repeat(64).slice(0, 64),
      payload: { schema_version: 1, stage },
      createdAt: NOW
    }));
  }
  const byStage = Object.fromEntries(created.map((artifact) => [artifact.stage, artifact.id]));
  const dimension = { score: 3, reason: "Evidence", evidence_ids: [`ev_${"3".repeat(32)}`] };
  const packet: ReviewPacket = {
    schema_version: 1,
    packet_id: `rvp_${"4".repeat(32)}`,
    capture_id: CAPTURE_ID,
    source_objects: [object],
    stage_artifact_ids: {
      preprocess: byStage.preprocess,
      extraction: byStage.extraction,
      research: byStage.research,
      assessment: byStage.assessment,
      critic: null
    },
    screenshots: [{ order: 0, object }],
    ocr: [{ image_index: 0, text: "Quoted hostile text: DROP TABLE; never execute." }],
    entities: [{ name: "Example Tool", aliases: ["Example"] }],
    identity: { status: "confirmed", entity_id: "ent_example", evidence_ids: [`ev_${"3".repeat(32)}`] },
    claims: [{
      id: `clm_${"5".repeat(32)}`,
      statement: "Fixture claim",
      basis: "visible",
      confidence: 0.8,
      evidence_ids: [`ev_${"3".repeat(32)}`]
    }],
    evidence: [{
      id: `ev_${"3".repeat(32)}`,
      tier: "A",
      source_url: "https://docs.example.com/tool",
      title: "Official docs",
      checked_at: NOW,
      content_digest: "6".repeat(64),
      claims: ["Fixture claim"]
    }],
    conflicts: [],
    candidate: {
      name: "Evidence lookup",
      novel_capabilities: ["Pinned sources"],
      overlapping_capabilities: [],
      replaces: [],
      complements: ["Human review"],
      conflicts_with: [],
      capability_gaps: []
    },
    alternatives: [],
    dimensions: {
      personal_fit: dimension,
      capability_value: dimension,
      evidence_confidence: dimension,
      novelty: dimension,
      reusability: dimension,
      portability: dimension,
      maturity: dimension,
      maintenance_burden: dimension,
      security_risk: dimension,
      adoption_cost: dimension
    },
    recommended_disposition: "build",
    disposition_reason: "Fixture only",
    critic: null,
    platform_previews: [],
    model_contracts: [{ stage: "research", provider: "kimi", model: "k3-256k", schema_version: 1 }],
    unresolved_questions: [],
    human_review_required: true,
    created_at: NOW
  };
  const packetArtifact = await artifacts.create({
    jobId: JOB_ID,
    captureId: CAPTURE_ID,
    stage: "review_packet",
    inputDigest: "7".repeat(64),
    payload: packet,
    createdAt: NOW
  });
  const job: AnalysisJob = {
    schema_version: 1,
    id: JOB_ID,
    capture_id: CAPTURE_ID,
    input_digest: "8".repeat(64),
    completed_artifact_ids: [...created.map(({ id }) => id), packetArtifact.id],
    status: "completed",
    review_packet_artifact_id: packetArtifact.id,
    completed_at: NOW,
    created_at: NOW,
    updated_at: NOW
  };
  await jobs.put(job);
  return { captures, jobs, artifacts, packet, job };
}

beforeEach(async () => {
  postgres = await startCaphubTestPostgres();
  await applyRegistryMigrations(postgres.pool);
}, 30_000);

afterEach(async () => {
  cleanup();
  await postgres?.stop();
}, 30_000);

describe.sequential("ReviewPacket Registry import", () => {
  it("imports exact records and lineage once, then suspends the filesystem job", async () => {
    const seeded = await seedFilesystem();
    const importer = createReviewPacketImporter({ ...seeded, pool: postgres.pool, clock: () => NOW });
    const first = await importer.importReviewPacket({ jobId: JOB_ID });
    const second = await importer.importReviewPacket({ jobId: JOB_ID });
    expect(second).toEqual(first);
    expect(first.job).toMatchObject({ status: "WAITING_FOR_REVIEW", review_request_id: first.requestId });
    await expect(seeded.jobs.get(JOB_ID)).resolves.toEqual(first.job);

    const kinds = await postgres.pool.query<{ kind: string }>(
      "SELECT kind FROM caphub.registry_records ORDER BY kind, record_id"
    );
    expect(new Set(kinds.rows.map(({ kind }) => kind))).toEqual(new Set([
      "capture", "analysis_job", "analysis_artifact", "review_packet", "entity", "claim", "evidence", "candidate"
    ]));
    const importCount = await postgres.pool.query<{ count: string }>("SELECT count(*) FROM caphub.registry_imports");
    const decisionCount = await postgres.pool.query<{ count: string }>("SELECT count(*) FROM caphub.review_decisions");
    expect(importCount.rows[0]?.count).toBe("1");
    expect(decisionCount.rows[0]?.count).toBe("0");
    expect(kinds.rows.some(({ kind }) => ["release", "build_proposal", "deployment"].includes(kind))).toBe(false);
  });

  it("repairs the job pointer after a post-commit crash without duplicate Registry writes", async () => {
    const seeded = await seedFilesystem();
    const crashing = createReviewPacketImporter({
      ...seeded,
      pool: postgres.pool,
      clock: () => NOW,
      afterDatabaseCommit: async () => { throw new Error("injected post-commit crash"); }
    });
    await expect(crashing.importReviewPacket({ jobId: JOB_ID })).rejects.toMatchObject({ code: "IMPORT_UNAVAILABLE" });
    await expect(seeded.jobs.get(JOB_ID)).resolves.toMatchObject({ status: "completed" });

    const repaired = await createReviewPacketImporter({
      ...seeded, pool: postgres.pool, clock: () => NOW
    }).importReviewPacket({ jobId: JOB_ID });
    expect(repaired.job.status).toBe("WAITING_FOR_REVIEW");
    const imports = await postgres.pool.query<{ count: string }>("SELECT count(*) FROM caphub.registry_imports");
    expect(imports.rows[0]?.count).toBe("1");
  });

  it("rejects a missing referenced artifact without partial Registry writes", async () => {
    const seeded = await seedFilesystem();
    const missingId = seeded.job.completed_artifact_ids[0];
    const artifacts = {
      get: (id: string) => id === missingId ? Promise.resolve(null) : seeded.artifacts.get(id),
      readPayload: (id: string) => seeded.artifacts.readPayload(id),
      findByJobStage: seeded.artifacts.findByJobStage.bind(seeded.artifacts),
      create: seeded.artifacts.create.bind(seeded.artifacts)
    };
    const importer = createReviewPacketImporter({
      ...seeded, artifacts, pool: postgres.pool, clock: () => NOW
    });
    await expect(importer.importReviewPacket({ jobId: JOB_ID })).rejects.toMatchObject({
      code: "IMPORT_ARTIFACT_MISMATCH"
    });
    const records = await postgres.pool.query<{ count: string }>("SELECT count(*) FROM caphub.registry_records");
    expect(records.rows[0]?.count).toBe("0");
  });

  it("fails closed when the same ReviewPacket identity is replayed with different content", async () => {
    const seeded = await seedFilesystem();
    const importer = createReviewPacketImporter({ ...seeded, pool: postgres.pool, clock: () => NOW });
    await importer.importReviewPacket({ jobId: JOB_ID });
    const packetArtifactId = seeded.job.review_packet_artifact_id;
    const artifacts = {
      get: seeded.artifacts.get.bind(seeded.artifacts),
      readPayload: (id: string) => id === packetArtifactId
        ? Promise.resolve({
          ...seeded.packet,
          candidate: { ...seeded.packet.candidate, name: "Changed immutable candidate" }
        })
        : seeded.artifacts.readPayload(id),
      findByJobStage: seeded.artifacts.findByJobStage.bind(seeded.artifacts),
      create: seeded.artifacts.create.bind(seeded.artifacts)
    };
    await expect(createReviewPacketImporter({
      ...seeded, artifacts, pool: postgres.pool, clock: () => NOW
    }).importReviewPacket({ jobId: JOB_ID })).rejects.toMatchObject({ code: "IMPORT_DIGEST_CONFLICT" });
    const imports = await postgres.pool.query<{ count: string }>("SELECT count(*) FROM caphub.registry_imports");
    expect(imports.rows[0]?.count).toBe("1");
  });
});
