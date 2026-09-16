import { describe, expect, it } from "vitest";
import {
  candidateReviewDispositionSchema,
  registryImportManifestSchema,
  registryLineageEdgeSchema,
  registryVersionSchema,
  registryVersionSchemaFor,
  reviewDecisionAuthoritySchema,
  reviewDecisionInputSchema,
  reviewDecisionResultSchema,
  reviewDecisionSchema,
  reviewRequestSchema
} from "./schemas";
import { z } from "zod";

const NOW = "2026-09-16T05:30:00.000Z";
const SUBJECT_DIGEST = "a".repeat(64);
const CONFIRMATION_DIGEST = "b".repeat(64);
const REQUEST_ID = `rev_${"1".repeat(32)}`;
const DECISION_ID = `dec_${"2".repeat(32)}`;
const SUBJECT_ID = `cand_${"3".repeat(32)}`;

const waitingRequest = {
  schema_version: 1,
  id: REQUEST_ID,
  review_kind: "candidate",
  subject_id: SUBJECT_ID,
  subject_kind: "candidate",
  subject_version: 1,
  subject_digest: SUBJECT_DIGEST,
  lock_version: 1,
  state: "WAITING_FOR_REVIEW",
  approve_confirmation: "APPROVE CANDIDATE 33333333",
  reject_confirmation: "REJECT CANDIDATE 33333333",
  superseded_by_request_id: null,
  created_at: NOW,
  updated_at: NOW
};

const approveInput = {
  request_id: REQUEST_ID,
  idempotency_key: "intent-approved-0001",
  expected_lock_version: 1,
  expected_subject_digest: SUBJECT_DIGEST,
  action: "approve",
  confirmation: "APPROVE CANDIDATE 33333333",
  rationale: "The evidence supports a bounded build direction.",
  disposition: "build"
};

const approvedDecision = {
  schema_version: 1,
  id: DECISION_ID,
  ...approveInput,
  review_kind: "candidate",
  subject_id: SUBJECT_ID,
  subject_version: 1,
  subject_digest: SUBJECT_DIGEST,
  actor: "human:owner",
  confirmation_digest: CONFIRMATION_DIGEST,
  original_approval_decision_id: null,
  revokes_decision_id: null,
  recorded_at: NOW
};

describe("Registry versions and lineage", () => {
  it("parses a strict immutable Registry version", () => {
    expect(registryVersionSchema.parse({
      record_id: SUBJECT_ID,
      kind: "candidate",
      version: 1,
      schema_version: 1,
      payload: { name: "Bounded browser safety" },
      payload_digest: SUBJECT_DIGEST,
      previous_version: null,
      created_at: NOW
    })).toMatchObject({ kind: "candidate", version: 1, previous_version: null });
  });

  it("rejects mismatched prefixes, malformed digests, invalid versions, and non-JSON payloads", () => {
    const valid = {
      record_id: SUBJECT_ID,
      kind: "candidate",
      version: 1,
      schema_version: 1,
      payload: { name: "Candidate" },
      payload_digest: SUBJECT_DIGEST,
      previous_version: null,
      created_at: NOW
    };
    expect(() => registryVersionSchema.parse({ ...valid, record_id: `cap_${"4".repeat(32)}` })).toThrow();
    expect(() => registryVersionSchema.parse({ ...valid, version: 0 })).toThrow();
    expect(() => registryVersionSchema.parse({ ...valid, payload_digest: "short" })).toThrow();
    expect(() => registryVersionSchema.parse({ ...valid, created_at: "yesterday" })).toThrow();
    expect(() => registryVersionSchema.parse({ ...valid, payload: { invalid: undefined } })).toThrow();
    expect(() => registryVersionSchema.parse({ ...valid, database_url: "postgres://secret" })).toThrow();
    expect(() => registryVersionSchema.parse({ ...valid, record_id: "cand_not-canonical" })).toThrow();
  });

  it("can bind a Registry version to its kind-specific payload schema", () => {
    const candidateVersionSchema = registryVersionSchemaFor(z.object({ name: z.string().min(1) }).strict());
    const version = {
      record_id: SUBJECT_ID,
      kind: "candidate",
      version: 1,
      schema_version: 1,
      payload: { name: "Bounded browser safety" },
      payload_digest: SUBJECT_DIGEST,
      previous_version: null,
      created_at: NOW
    };
    expect(candidateVersionSchema.parse(version).payload.name).toBe("Bounded browser safety");
    expect(() => candidateVersionSchema.parse({ ...version, payload: {} })).toThrow();
  });

  it("accepts only an allowed directed lineage relationship between distinct exact versions", () => {
    const edge = {
      schema_version: 1,
      from_record_id: `cap_${"4".repeat(32)}`,
      from_kind: "capture",
      from_version: 1,
      from_digest: "4".repeat(64),
      relationship: "analyzed_by",
      to_record_id: `job_${"5".repeat(32)}`,
      to_kind: "analysis_job",
      to_version: 1,
      to_digest: "5".repeat(64),
      created_at: NOW
    };
    expect(registryLineageEdgeSchema.parse(edge).relationship).toBe("analyzed_by");
    expect(() => registryLineageEdgeSchema.parse({ ...edge, relationship: "deployed_as" })).toThrow();
    expect(() => registryLineageEdgeSchema.parse({ ...edge, from_record_id: `bld_${"4".repeat(32)}` })).toThrow();
    expect(() => registryLineageEdgeSchema.parse({ ...edge, to_record_id: `cand_${"5".repeat(32)}` })).toThrow();
    expect(() => registryLineageEdgeSchema.parse({
      ...edge,
      to_record_id: edge.from_record_id,
      to_kind: edge.from_kind,
      to_digest: edge.from_digest
    })).toThrow();
  });

  it("represents the fixed review request to decision lineage without treating either as a Registry record", () => {
    expect(registryLineageEdgeSchema.parse({
      schema_version: 1,
      from_record_id: REQUEST_ID,
      from_kind: "review_request",
      from_version: 1,
      from_digest: SUBJECT_DIGEST,
      relationship: "decided_by",
      to_record_id: DECISION_ID,
      to_kind: "review_decision",
      to_version: 1,
      to_digest: CONFIRMATION_DIGEST,
      created_at: NOW
    }).relationship).toBe("decided_by");
  });
});

describe("review contracts", () => {
  it("parses a waiting request bound to an exact subject snapshot", () => {
    expect(reviewRequestSchema.parse(waitingRequest)).toMatchObject({
      state: "WAITING_FOR_REVIEW",
      review_kind: "candidate",
      lock_version: 1
    });
  });

  it("reserves distinct immutable subjects for later Implementation and Update reviews", () => {
    for (const [review_kind, subject_kind, subject_id, verb] of [
      ["implementation", "implementation_asset", `impl_${"4".repeat(32)}`, "ACCEPT"],
      ["update", "update_proposal", `upd_${"5".repeat(32)}`, "APPROVE"]
    ] as const) {
      expect(reviewRequestSchema.parse({
        ...waitingRequest,
        review_kind,
        subject_kind,
        subject_id,
        approve_confirmation: `${verb} ${review_kind.toUpperCase()} ${subject_id.slice(-32, -24)}`,
        reject_confirmation: `REJECT ${review_kind.toUpperCase()} ${subject_id.slice(-32, -24)}`
      }).subject_kind).toBe(subject_kind);
    }
  });

  it("requires a superseded request to point to a different latest request", () => {
    expect(() => reviewRequestSchema.parse({
      ...waitingRequest,
      state: "SUPERSEDED",
      superseded_by_request_id: null
    })).toThrow();
    expect(() => reviewRequestSchema.parse({
      ...waitingRequest,
      state: "SUPERSEDED",
      superseded_by_request_id: REQUEST_ID
    })).toThrow();
  });

  it("accepts exactly the five Candidate approval dispositions", () => {
    for (const disposition of ["adopt", "adapt", "build", "learn", "watch"]) {
      expect(candidateReviewDispositionSchema.parse(disposition)).toBe(disposition);
    }
    expect(() => candidateReviewDispositionSchema.parse("reject")).toThrow();
  });

  it("rejects client actor fields, mutable snapshots, malformed confirmations, and unknown keys", () => {
    expect(reviewDecisionInputSchema.parse(approveInput)).toEqual(approveInput);
    for (const mutation of [
      { actor: "client:user" },
      { subject_id: SUBJECT_ID },
      { provider: "kimi" },
      { sql: "DROP TABLE review_decisions" },
      { url: "https://example.test" },
      { path: "/tmp/secret" },
      { secret: "literal-secret" }
    ]) {
      expect(() => reviewDecisionInputSchema.parse({ ...approveInput, ...mutation })).toThrow();
    }
    expect(() => reviewDecisionInputSchema.parse({ ...approveInput, expected_lock_version: 0 })).toThrow();
    expect(() => reviewDecisionInputSchema.parse({ ...approveInput, confirmation: "approve it" })).toThrow();
    expect(() => reviewDecisionInputSchema.parse({ ...approveInput, idempotency_key: "short" })).toThrow();
    expect(() => reviewDecisionInputSchema.parse({ ...approveInput, action: "publish" })).toThrow();
    expect(() => reviewRequestSchema.parse({ ...waitingRequest, state: "PUBLISHED" })).toThrow();
    expect(() => reviewDecisionSchema.parse({ ...approvedDecision, actor: "client:user" })).toThrow();
  });

  it("requires Candidate approval disposition and forbids disposition on other kinds", () => {
    expect(reviewDecisionSchema.parse(approvedDecision).disposition).toBe("build");
    expect(() => reviewDecisionSchema.parse({ ...approvedDecision, disposition: undefined })).toThrow();
    expect(() => reviewDecisionSchema.parse({ ...approvedDecision, disposition: "reject" })).toThrow();
    expect(() => reviewDecisionSchema.parse({
      ...approvedDecision,
      review_kind: "build",
      subject_id: `bld_${"3".repeat(32)}`,
      confirmation: "APPROVE BUILD 33333333"
    })).toThrow();
    expect(() => reviewDecisionSchema.parse({
      ...approvedDecision,
      expected_subject_digest: "c".repeat(64)
    })).toThrow();
    expect(() => reviewDecisionInputSchema.parse({
      ...approveInput,
      action: "reject",
      rationale: "Reject this version.",
      confirmation: "REJECT CANDIDATE 33333333"
    })).toThrow();
  });

  it("requires rationale and original-decision linkage for revoke", () => {
    const revoke = {
      ...approvedDecision,
      id: `dec_${"6".repeat(32)}`,
      action: "revoke",
      disposition: undefined,
      rationale: "The approval is no longer safe.",
      confirmation: "REVOKE CANDIDATE 33333333",
      original_approval_decision_id: DECISION_ID,
      revokes_decision_id: DECISION_ID
    };
    expect(reviewDecisionSchema.parse(revoke).revokes_decision_id).toBe(DECISION_ID);
    expect(() => reviewDecisionSchema.parse({ ...revoke, rationale: "" })).toThrow();
    expect(() => reviewDecisionSchema.parse({ ...revoke, original_approval_decision_id: null })).toThrow();
    expect(() => reviewDecisionSchema.parse({ ...revoke, revokes_decision_id: `dec_${"7".repeat(32)}` })).toThrow();
  });

  it("derives only safe authority state", () => {
    expect(reviewDecisionAuthoritySchema.parse({
      state: "unconsumed",
      consumedBy: null,
      revocable: true
    })).toEqual({ state: "unconsumed", consumedBy: null, revocable: true });
    expect(() => reviewDecisionAuthoritySchema.parse({
      state: "consumed",
      consumedBy: null,
      revocable: true
    })).toThrow();
    expect(() => reviewDecisionAuthoritySchema.parse({
      state: "consumed",
      consumedBy: "postgres://secret",
      revocable: false
    })).toThrow();

    expect(reviewDecisionResultSchema.parse({
      decision: approvedDecision,
      authority: { state: "unconsumed", consumedBy: null, revocable: true }
    }).authority).toEqual({ state: "unconsumed", consumedBy: null, revocable: true });

    const rejectedDecision = {
      ...approvedDecision,
      id: `dec_${"7".repeat(32)}`,
      action: "reject",
      disposition: undefined,
      rationale: "The evidence does not support this direction.",
      confirmation: "REJECT CANDIDATE 33333333"
    };
    expect(reviewDecisionResultSchema.parse({ decision: rejectedDecision, authority: null }).authority).toBeNull();
    expect(() => reviewDecisionResultSchema.parse({
      decision: rejectedDecision,
      authority: { state: "unconsumed", consumedBy: null, revocable: true }
    })).toThrow();
  });
});

describe("P4 export registry contracts", () => {
  it("accepts deployment_plan as a Registry record kind with the dpl_ prefix", () => {
    expect(registryVersionSchema.parse({
      record_id: `dpl_${"a".repeat(32)}`,
      kind: "deployment_plan",
      version: 1,
      schema_version: 1,
      payload: { action: "publish" },
      payload_digest: SUBJECT_DIGEST,
      previous_version: null,
      created_at: NOW
    })).toMatchObject({ kind: "deployment_plan", version: 1 });
    expect(() => registryVersionSchema.parse({
      record_id: `dep_${"a".repeat(32)}`,
      kind: "deployment_plan",
      version: 1,
      schema_version: 1,
      payload: {},
      payload_digest: SUBJECT_DIGEST,
      previous_version: null,
      created_at: NOW
    })).toThrow();
  });

  it("accepts deployment reviews bound to deployment_plan subjects with exact confirmations", () => {
    const subjectId = `dpl_${"b".repeat(32)}`;
    const shortId = subjectId.slice(subjectId.indexOf("_") + 1, subjectId.indexOf("_") + 9);
    expect(reviewRequestSchema.parse({
      ...waitingRequest,
      review_kind: "deployment",
      subject_kind: "deployment_plan",
      subject_id: subjectId,
      approve_confirmation: `APPROVE DEPLOYMENT ${shortId}`,
      reject_confirmation: `REJECT DEPLOYMENT ${shortId}`
    }).subject_kind).toBe("deployment_plan");
    expect(() => reviewRequestSchema.parse({
      ...waitingRequest,
      review_kind: "deployment",
      subject_kind: "release",
      subject_id: subjectId,
      approve_confirmation: `APPROVE DEPLOYMENT ${shortId}`,
      reject_confirmation: `REJECT DEPLOYMENT ${shortId}`
    })).toThrow();
  });

  it("accepts deployment review decisions with DEPLOYMENT confirmation phrases only", () => {
    const subjectId = `dpl_${"b".repeat(32)}`;
    const shortId = subjectId.slice(subjectId.indexOf("_") + 1, subjectId.indexOf("_") + 9);
    expect(reviewDecisionSchema.parse({
      ...approvedDecision,
      review_kind: "deployment",
      subject_id: subjectId,
      disposition: undefined,
      confirmation: `APPROVE DEPLOYMENT ${shortId}`
    }).review_kind).toBe("deployment");
    expect(() => reviewDecisionSchema.parse({
      ...approvedDecision,
      review_kind: "deployment",
      subject_id: subjectId,
      disposition: undefined,
      confirmation: `APPROVE RELEASE ${shortId}`
    })).toThrow();
  });

  it("allows release->deployment_plan->deployment lineage while preserving existing edges", () => {
    const proposesEdge = {
      schema_version: 1,
      from_record_id: `rel_${"c".repeat(32)}`,
      from_kind: "release",
      from_version: 1,
      from_digest: "c".repeat(64),
      relationship: "proposes",
      to_record_id: `dpl_${"d".repeat(32)}`,
      to_kind: "deployment_plan",
      to_version: 1,
      to_digest: "d".repeat(64),
      created_at: NOW
    };
    expect(registryLineageEdgeSchema.parse(proposesEdge).relationship).toBe("proposes");
    expect(registryLineageEdgeSchema.parse({
      ...proposesEdge,
      from_record_id: `dpl_${"d".repeat(32)}`,
      from_kind: "deployment_plan",
      to_record_id: `dep_${"e".repeat(32)}`,
      to_kind: "deployment",
      relationship: "realized_as"
    })).toMatchObject({ relationship: "realized_as" });
    expect(registryLineageEdgeSchema.parse({
      schema_version: 1,
      from_record_id: `rel_${"c".repeat(32)}`,
      from_kind: "release",
      from_version: 1,
      from_digest: "c".repeat(64),
      relationship: "deployed_as",
      to_record_id: `dep_${"e".repeat(32)}`,
      to_kind: "deployment",
      to_version: 1,
      to_digest: "e".repeat(64),
      created_at: NOW
    }).relationship).toBe("deployed_as");
    expect(() => registryLineageEdgeSchema.parse({
      ...proposesEdge,
      relationship: "deployed_as"
    })).toThrow();
    expect(() => registryLineageEdgeSchema.parse({
      ...proposesEdge,
      from_kind: "deployment_plan"
    })).toThrow();
  });
});

describe("Registry import manifest", () => {
  it("binds exact source and target digests without paths or URLs", () => {
    const manifest = {
      schema_version: 1,
      id: `imp_${"8".repeat(32)}`,
      source_review_packet_id: `rvp_${"9".repeat(32)}`,
      source_review_packet_digest: "9".repeat(64),
      records: [{
        record_id: SUBJECT_ID,
        kind: "candidate",
        version: 1,
        payload_digest: SUBJECT_DIGEST
      }],
      review_request_id: REQUEST_ID,
      imported_at: NOW
    };
    expect(registryImportManifestSchema.parse(manifest).records).toHaveLength(1);
    expect(() => registryImportManifestSchema.parse({ ...manifest, source_path: "/private/capture" })).toThrow();
    expect(() => registryImportManifestSchema.parse({ ...manifest, provider_url: "https://db.example.test" })).toThrow();
    expect(() => registryImportManifestSchema.parse({
      ...manifest,
      records: [{ ...manifest.records[0], kind: "capture" }]
    })).toThrow();
    expect(() => registryImportManifestSchema.parse({
      ...manifest,
      records: [manifest.records[0], manifest.records[0]]
    })).toThrow();
  });
});
