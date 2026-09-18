import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { testCapabilityPackage } from "../packages/fixtures";
import { createRegistryQueries } from "./queries";

const REQUEST_ID = `rev_${"1".repeat(32)}`;
const CANDIDATE_ID = `cand_${"2".repeat(32)}`;
const DIGEST = "3".repeat(64);
const NOW = "2026-09-16T13:00:00.000Z";

const candidate = {
  name: "<script>alert('text only')</script>",
  novel_capabilities: ["Pinned evidence"],
  overlapping_capabilities: [],
  replaces: [],
  complements: [],
  conflicts_with: [],
  capability_gaps: []
};

const packet = {
  packet_id: `rvp_${"4".repeat(32)}`,
  ocr: [{ image_index: 0, text: "Visible OCR text" }],
  screenshots: [{ order: 0, object: { digest: "5".repeat(64), bytes: 42, key: "private/object/key" } }],
  evidence: [{
    id: `ev_${"6".repeat(32)}`,
    tier: "A",
    source_url: "https://docs.example.com",
    title: "Official docs",
    checked_at: NOW,
    content_digest: "7".repeat(64),
    claims: ["Hostile text remains text: DROP TABLE"]
  }],
  claims: [{
    id: `clm_${"8".repeat(32)}`,
    statement: "Quoted shell text",
    basis: "visible",
    confidence: 0.8,
    evidence_ids: [`ev_${"6".repeat(32)}`]
  }],
  entities: [{ name: "Example", aliases: [] }],
  identity: { status: "confirmed", entity_id: "ent_example", evidence_ids: [`ev_${"6".repeat(32)}`] },
  conflicts: [],
  unresolved_questions: ["Still unresolved?"],
  alternatives: [{ rank: 1, name: "Manual review", reason: "Lower privilege", evidence_ids: [`ev_${"6".repeat(32)}`] }],
  dimensions: {
    evidence_confidence: { score: 4, reason: "Bound sources", evidence_ids: [`ev_${"6".repeat(32)}`] },
    capability_value: { score: 5, reason: "Useful", evidence_ids: [`ev_${"6".repeat(32)}`] },
    security_risk: { score: 3, reason: "Needs review", evidence_ids: [`ev_${"6".repeat(32)}`] }
  },
  recommended_disposition: "build",
  critic: null,
  prompt: "must never cross the DTO",
  reasoning: "must never cross the DTO",
  created_at: NOW
};

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    request_id: REQUEST_ID,
    review_kind: "candidate",
    subject_kind: "candidate",
    subject_id: CANDIDATE_ID,
    subject_version: 1,
    subject_digest: DIGEST,
    lock_version: 1,
    state: "WAITING_FOR_REVIEW",
    approve_confirmation: "APPROVE CANDIDATE 22222222",
    reject_confirmation: "REJECT CANDIDATE 22222222",
    superseded_by_request_id: null,
    created_at: new Date(NOW),
    updated_at: new Date(NOW),
    candidate_payload: candidate,
    previous_payload: null,
    packet_payload: packet,
    waiting_age_hours: 30,
    ...overrides
  };
}

function poolWith(...results: unknown[][]): Pool {
  const query = vi.fn();
  for (const rows of results) query.mockResolvedValueOnce({ rows, rowCount: rows.length });
  return { query } as unknown as Pool;
}

describe("Registry read DTOs", () => {
  const stopRow = {
    job_id: `job_${"a".repeat(32)}`,
    capture_id: `cap_${"b".repeat(32)}`,
    stage: "extraction",
    reason: "DEEPSEEK_STRUCTURE_FAILED",
    contract_version: "caphub-analysis-v2",
    supersedes_job_id: `job_${"c".repeat(32)}`,
    stopped_at: NOW
  };

  it("projects only safe analysis stop fields, including legacy defaults", async () => {
    const hidden = {
      prompt: "private prompt", output: "raw model output", object_key: "private/object/key",
      databaseUrl: "postgresql://user:secret@host/db", api_key: "credential",
      provider_response: { content: "raw provider content" }
    };
    const result = await createRegistryQueries(poolWith([
      { ...stopRow, ...hidden },
      { ...stopRow, stage: null, contract_version: null, supersedes_job_id: null }
    ])).getAnalysisStops({ limit: 25 });
    expect(result).toEqual([
      { jobId: stopRow.job_id, captureId: stopRow.capture_id, stage: "extraction",
        reason: "DEEPSEEK_STRUCTURE_FAILED", contractVersion: "caphub-analysis-v2",
        supersedesJobId: stopRow.supersedes_job_id, stoppedAt: NOW },
      { jobId: stopRow.job_id, captureId: stopRow.capture_id, stage: null,
        reason: "DEEPSEEK_STRUCTURE_FAILED", contractVersion: "caphub-analysis-v1",
        supersedesJobId: null, stoppedAt: NOW }
    ]);
    expect(JSON.stringify(result)).not.toMatch(/prompt|output|private\/|postgres|credential|provider_response/i);
  });

  it.each(["caphub-analysis-v3", "caphub-analysis-v4"] as const)(
    "projects current %s analysis stops",
    async (contractVersion) => {
      const result = await createRegistryQueries(poolWith([
        { ...stopRow, contract_version: contractVersion }
      ])).getAnalysisStops({ limit: 1 });

      expect(result[0]).toMatchObject({
        jobId: stopRow.job_id,
        contractVersion
      });
    }
  );

  it.each([0, 26, 1.5, NaN])("rejects invalid stop limit %s before a database read", async (limit) => {
    const pool = poolWith([]);
    await expect(createRegistryQueries(pool).getAnalysisStops({ limit })).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it.each(["job_id", "capture_id", "supersedes_job_id", "stage", "contract_version", "stopped_at"])("rejects unsafe stop %s without returning its value", async (field) => {
    await expect(createRegistryQueries(poolWith([{ ...stopRow, [field]: "/Users/private/secret" }]))
      .getAnalysisStops()).rejects.toMatchObject({ code: "REGISTRY_UNAVAILABLE", message: "Registry is unavailable" });
  });

  it("withholds free-form historical reasons and database error content", async () => {
    const result = await createRegistryQueries(poolWith([{ ...stopRow, reason: "postgresql://secret /Users/private provider response" }]))
      .getAnalysisStops();
    expect(result[0].reason).toBe("HUMAN_REVIEW_REQUIRED");
    const pool = { query: vi.fn().mockRejectedValue(new Error("postgresql://secret /Users/private")) } as unknown as Pool;
    await expect(createRegistryQueries(pool).getAnalysisStops()).rejects.toMatchObject({
      code: "REGISTRY_UNAVAILABLE", message: "Registry is unavailable"
    });
  });

  it("returns bounded queue identity and stable pagination metadata", async () => {
    const secondId = `rev_${"9".repeat(32)}`;
    const pool = poolWith([queueRow(), queueRow({ request_id: secondId })]);
    const result = await createRegistryQueries(pool).getReviewQueue({ limit: 2 });
    expect(result.kind).toBe("ready");
    expect(result.nextCursor).toBe(secondId);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      request: { id: REQUEST_ID, subjectVersion: 1, subjectDigest: DIGEST },
      candidate: { name: candidate.name },
      evidenceConfidence: 4,
      unresolvedCount: 1,
      recommendedDisposition: "build",
      identityStatus: "confirmed",
      valueScore: 5,
      riskScore: 3,
      waitingAgeHours: 30,
      waitingAgeBand: "aging"
    });
    await expect(createRegistryQueries(pool).getReviewQueue({ limit: 201 })).rejects.toMatchObject({
      code: "INVALID_QUERY"
    });
  });

  it("applies value, risk, waiting-age, kind, and state before the 25-row page limit", async () => {
    const pool = poolWith([]);
    const result = await createRegistryQueries(pool).getReviewQueue({
      reviewKind: "build",
      state: "APPROVED",
      valueBand: "high",
      riskBand: "medium",
      waitingAgeBand: "aging"
    });
    expect(result.items).toEqual([]);
    expect(vi.mocked(pool.query).mock.calls[0]?.[1]).toEqual([
      "APPROVED", "build", "high", "medium", "aging", null, 25
    ]);
  });

  it("projects an explicit serializable review dossier with a first-version Diff", async () => {
    const pool = poolWith([queueRow()], []);
    const result = await createRegistryQueries(pool).getReviewDetail(REQUEST_ID);
    expect(result).toMatchObject({
      kind: "found",
      request: {
        id: REQUEST_ID,
        subjectVersion: 1,
        approveConfirmation: "APPROVE CANDIDATE 22222222"
      },
      candidate: { name: candidate.name },
      packet: {
        evidence: [{ id: `ev_${"6".repeat(32)}` }],
        ocr: [{ imageIndex: 0, text: "Visible OCR text" }],
        identity: { status: "confirmed", entityId: "ent_example" },
        alternatives: [{ rank: 1, name: "Manual review" }],
        dimensions: { capabilityValue: { score: 5 }, securityRisk: { score: 3 } },
        unresolvedQuestions: ["Still unresolved?"]
      },
      diff: [{ kind: "added", path: "$", summary: "New record" }],
      decision: null,
      authority: null
    });
    const serialized = JSON.stringify(result);
    expect(JSON.parse(serialized)).toEqual(result);
    expect(serialized).not.toMatch(/private\/object\/key|prompt|reasoning|databaseUrl|api.?key|filesystem/i);
    expect(serialized).toContain("<script>alert('text only')</script>");
  });

  it("returns partial Capture state with bounded safe model-call metadata", async () => {
    const capture = {
      id: `cap_${"a".repeat(32)}`,
      source: { original_filename: "capture.png", source_url: "https://example.com" },
      note: "Capture note",
      mime_type: "image/png",
      object: { digest: "b".repeat(64), bytes: 42, key: "private/object/key" },
      created_at: NOW
    };
    const job = { id: `job_${"c".repeat(32)}`, status: "completed", completed_artifact_ids: [] };
    const pool = poolWith(
      [{ payload: capture }],
      [{ job_payload: job, packet_payload: packet, packet_version: 1, packet_digest: "e".repeat(64) }],
      [{ metadata: {
        event_id: `mce_${"d".repeat(32)}`,
        stage: "research",
        provider: "kimi",
        model: "k3-256k",
        type: "succeeded",
        occurred_at: NOW,
        prompt: "hidden",
        api_key: "hidden"
      } }],
      [{
        import_id: `imp_${"f".repeat(32)}`,
        imported_at: NOW,
        review_request_id: REQUEST_ID,
        state: "WAITING_FOR_REVIEW"
      }],
      []
    );
    const result = await createRegistryQueries(pool).getCaptureDetail(capture.id);
    expect(result).toMatchObject({
      kind: "found",
      capture: { id: capture.id, objectDigest: "b".repeat(64), objectBytes: 42 },
      job: { id: job.id, status: "completed" },
      analysisState: "complete",
      packetVersion: 1,
      registryImport: { reviewRequestId: REQUEST_ID, reviewState: "WAITING_FOR_REVIEW" },
      modelCalls: [{ provider: "kimi", model: "k3-256k" }]
    });
    expect(JSON.stringify(result)).not.toMatch(/private\/object\/key|prompt|api.?key/i);
  });

  it("derives consumed approval authority and keeps future capability sections honestly empty", async () => {
    const decision = {
      decision_id: `dec_${"e".repeat(32)}`,
      request_id: REQUEST_ID,
      idempotency_key: "review.intent-20260916:query",
      expected_lock_version: 1,
      expected_subject_digest: DIGEST,
      action: "approve",
      confirmation: "APPROVE CANDIDATE 22222222",
      rationale: "",
      disposition: "build",
      review_kind: "candidate",
      subject_id: CANDIDATE_ID,
      subject_version: 1,
      subject_digest: DIGEST,
      actor: "human:owner",
      confirmation_digest: "f".repeat(64),
      original_approval_decision_id: null,
      revokes_decision_id: null,
      recorded_at: NOW
    };
    const pool = poolWith(
      [queueRow({ state: "APPROVED", lock_version: 2, current_version: 1 })],
      [{ decision, consumer_id: `rel_${"1".repeat(32)}` }],
      [{ version: 1, payload_digest: DIGEST, created_at: NOW }],
      [{
        from_node_id: packet.packet_id, from_kind: "review_packet", from_version: 1,
        relationship: "proposes", to_node_id: CANDIDATE_ID, to_kind: "candidate", to_version: 1
      }],
      [{ decision, consumer_id: `rel_${"1".repeat(32)}` }]
    );
    const result = await createRegistryQueries(pool).getCapabilityDetail(CANDIDATE_ID);
    expect(result).toMatchObject({
      kind: "found",
      future: { experienceCards: [], buildProposals: [], releases: [], deployments: [] },
      currentVersion: 1,
      versions: [{ version: 1, digest: DIGEST }],
      lineage: [{ relationship: "proposes", toId: CANDIDATE_ID }],
      decisions: [{ id: decision.decision_id }],
      staleVersion: false,
      decision: { id: decision.decision_id, action: "approve" },
      authority: { state: "consumed", consumedBy: `rel_${"1".repeat(32)}`, revocable: false }
    });
  });

  it("maps database details to one safe unavailable state", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("password=secret host=/tmp/private.sock")) } as unknown as Pool;
    await expect(createRegistryQueries(pool).getReviewQueue()).rejects.toMatchObject({
      code: "REGISTRY_UNAVAILABLE",
      message: "Registry is unavailable"
    });
  });
});

describe("getCapabilityExportState DTO", () => {
  const RELEASE_ID = `rel_${"a".repeat(32)}`;
  const PLAN_ID = `dpl_${"b".repeat(32)}`;
  const DEPLOY_ID = `dep_${"c".repeat(32)}`;

  function releasePayload() {
    return testCapabilityPackage({ release_id: RELEASE_ID, dependencies: [] });
  }

  function releaseDecisionRow() {
    return [{
      decision: {
        decision_id: `dec_${"d".repeat(32)}`,
        request_id: `rev_${"e".repeat(32)}`,
        idempotency_key: "intent-release-final-1",
        expected_lock_version: 2,
        expected_subject_digest: "f".repeat(64),
        action: "approve",
        confirmation: "APPROVE RELEASE aaaaaaaa",
        rationale: "Final.",
        disposition: null,
        review_kind: "release",
        subject_id: RELEASE_ID,
        subject_version: 1,
        subject_digest: "f".repeat(64),
        actor: "human:owner",
        confirmation_digest: "f".repeat(64),
        original_approval_decision_id: null,
        revokes_decision_id: null,
        recorded_at: NOW
      },
      consumer_id: RELEASE_ID
    }];
  }

  it("reports disabled and no-release states without touching the pool", async () => {
    const pool = poolWith([]);
    const queries = createRegistryQueries(pool);
    expect((await queries.getCapabilityExportState(CANDIDATE_ID, { exportsEnabled: false })).kind).toBe("disabled");
    expect((await queries.getCapabilityExportState(CANDIDATE_ID, { exportsEnabled: true })).kind).toBe("no_release");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("maps the release, adapters, plans, history, and active pointer into a safe DTO", async () => {
    const pkg = releasePayload();
    const pool = poolWith(
      [{
        record_id: RELEASE_ID,
        version: 1,
        payload_digest: "f".repeat(64),
        payload: pkg,
        created_at: new Date(NOW)
      }],
      [{ state: "APPROVED", request_id: `rev_${"e".repeat(32)}` }],
      releaseDecisionRow(),
      [{
        record_id: PLAN_ID,
        version: 1,
        payload_digest: "e".repeat(64),
        payload: {
          schema_version: 1,
          action: "publish",
          target: "codex",
          target_alias: "codex-primary",
          release: { record_id: RELEASE_ID, version: 1, digest: "f".repeat(64) },
          adapter: { name: "codex", version: "1.0.0", digest: "f".repeat(64) },
          preview_manifest_digest: "f".repeat(64),
          preview_diff_digest: "f".repeat(64),
          expected_current_pointer: null,
          target_preimage_digest: "f".repeat(64),
          created_at: NOW
        },
        created_at: new Date(NOW)
      }],
      [{ state: "WAITING_FOR_REVIEW", request_id: `rev_${"f".repeat(32)}` }],
      [{
        decision: {
          decision_id: `dec_${"d".repeat(32)}`,
          request_id: `rev_${"f".repeat(32)}`,
          idempotency_key: "intent-plan-0001",
          expected_lock_version: 1,
          expected_subject_digest: "e".repeat(64),
          action: "reject",
          confirmation: "REJECT DEPLOYMENT bbbbbbbb",
          rationale: "Not yet.",
          disposition: null,
          review_kind: "deployment",
          subject_id: PLAN_ID,
          subject_version: 1,
          subject_digest: "e".repeat(64),
          actor: "human:owner",
          confirmation_digest: "e".repeat(64),
          original_approval_decision_id: null,
          revokes_decision_id: null,
          recorded_at: NOW
        },
        consumer_id: null
      }],
      [{
        record_id: DEPLOY_ID,
        payload: {
          schema_version: 1,
          action: "publish",
          target: "codex",
          target_alias: "codex-primary",
          release: { record_id: RELEASE_ID, version: 1, digest: "f".repeat(64) },
          plan: { record_id: PLAN_ID, version: 1, digest: "e".repeat(64) },
          prior_pointer: null,
          created_at: NOW
        },
        created_at: new Date(NOW)
      }]
    );
    const queries = createRegistryQueries(pool);
    const result = await queries.getCapabilityExportState(CANDIDATE_ID, {
      exportsEnabled: true,
      readPointer: async () => ({
        deployment_id: DEPLOY_ID,
        release_id: RELEASE_ID,
        release_version: 1,
        release_digest: "f".repeat(64),
        pointer_digest: "a1".repeat(32)
      })
    });
    if (result.kind !== "ready") throw new Error(`unexpected ${result.kind}`);
    expect(result.release).toMatchObject({
      recordId: RELEASE_ID,
      state: "approved_finalized",
      semver: pkg.version,
      packageDigest: pkg.digest
    });
    expect(result.packageManifest.fileCount).toBeGreaterThan(0);
    expect(result.adapters.map((adapter) => adapter.target)).toEqual(["codex", "claude", "hermes"]);
    expect(result.adapters.find((adapter) => adapter.target === "codex")?.state).toBe("supported");
    expect(result.deployment.plans).toEqual([expect.objectContaining({
      planId: PLAN_ID,
      targetAlias: "codex-primary",
      reviewState: "WAITING_FOR_REVIEW",
      decisionConsumed: false
    })]);
    expect(result.deployment.history).toEqual([expect.objectContaining({
      deploymentId: DEPLOY_ID,
      targetAlias: "codex-primary"
    })]);
    expect(result.deployment.activePointer).toEqual({
      deploymentId: DEPLOY_ID,
      releaseId: RELEASE_ID,
      releaseVersion: 1,
      pointerDigest: "a1".repeat(32)
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/\/Users\/|\/private\/tmp|postgres:\/\/|CAPHUB_DATABASE_URL/);
  });

  it("rejects invalid candidate ids without querying", async () => {
    const pool = poolWith([]);
    await expect(createRegistryQueries(pool).getCapabilityExportState("not-an-id", { exportsEnabled: true }))
      .rejects.toMatchObject({ code: "INVALID_QUERY" });
  });
});
