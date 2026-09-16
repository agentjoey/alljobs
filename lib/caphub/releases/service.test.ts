import { describe, expect, it } from "vitest";
import { digestCanonicalJson } from "../analysis/digest";
import { researchDossierSchema } from "../analysis/schemas";
import type { ComposeDeploymentPlanInput, ComposeReleaseInput, FinalizeReleaseInput, RealizeDeploymentInput, RegistryExportStore } from "../registry/contracts";
import type { RegistryLineageEdge, RegistryVersion, ReviewDecision, ReviewRequest } from "../registry/types";
import { confirmationFor } from "../registry/confirmations";
import { PostgresExportStoreError } from "../registry/postgres/exports";
import { FIXTURE_DIGEST, FIXTURE_NOW, testCandidateVersion, testReviewPacket } from "./fixtures";
import { ReleaseService, ReleaseServiceError } from "./service";

const NOW = FIXTURE_NOW;

interface FakeState {
  candidate: RegistryVersion;
  packet: RegistryVersion;
  decision: ReviewDecision;
  licenseText?: string;
}

function reviewDecision(overrides: Partial<ReviewDecision> = {}): ReviewDecision {
  return {
    schema_version: 1,
    id: `dec_${"9".repeat(32)}`,
    request_id: `rev_${"1".repeat(32)}`,
    idempotency_key: "intent-candidate-fixture-1",
    expected_lock_version: 2,
    expected_subject_digest: "",
    action: "approve",
    confirmation: "APPROVE CANDIDATE 88888888",
    rationale: "Approved.",
    disposition: "adopt",
    review_kind: "candidate",
    subject_id: `cand_${"8".repeat(32)}`,
    subject_version: 1,
    subject_digest: "",
    actor: "human:owner",
    confirmation_digest: "b".repeat(64),
    original_approval_decision_id: null,
    revokes_decision_id: null,
    recorded_at: NOW,
    ...overrides
  };
}

function researchDossier(license = "MIT License") {
  return researchDossierSchema.parse({
    schema_version: 1,
    capture_id: `cap_${"2".repeat(32)}`,
    extraction_artifact_id: `art_${"4".repeat(64)}`,
    identity: {
      status: "confirmed",
      entity_id: `ent_${"a".repeat(32)}`,
      evidence_ids: [`ev_${"7".repeat(32)}`]
    },
    evidence: [{
      id: `ev_${"7".repeat(32)}`,
      tier: "A",
      source_url: "https://example.com/docs",
      title: "Official documentation",
      checked_at: NOW,
      content_digest: FIXTURE_DIGEST,
      claims: ["install via package manager"]
    }],
    claim_checks: [],
    current_availability: "actively maintained",
    version: "3.2.0",
    maintenance_status: "active",
    install_methods: ["npm"],
    agent_protocol_support: ["mcp"],
    authentication: ["api key"],
    pricing: "free tier",
    data_destinations: ["local"],
    permissions: ["network"],
    license,
    security_findings: [],
    researched_at: NOW
  });
}

function buildState(options: { disposition?: ReviewDecision["disposition"]; licenseText?: string } = {}) {
  const candidate = testCandidateVersion();
  const packetPayload = testReviewPacket();
  const packet: RegistryVersion = {
    record_id: packetPayload.packet_id,
    kind: "review_packet",
    version: 1,
    schema_version: 1,
    payload: packetPayload,
    payload_digest: digestCanonicalJson(packetPayload),
    previous_version: null,
    created_at: NOW
  };
  const decision = reviewDecision({
    disposition: options.disposition ?? "adopt",
    subject_id: candidate.record_id,
    subject_digest: candidate.payload_digest
  });
  return { candidate, packet, decision, licenseText: options.licenseText ?? "MIT License" };
}

function makeService(state: FakeState, behavior: {
  composeReleaseResult?: "created" | "existing";
  composeReleaseError?: PostgresExportStoreError;
  finalizeResult?: "finalized" | "existing";
  finalizeError?: PostgresExportStoreError;
} = {}) {
  const composeCalls: ComposeReleaseInput[] = [];
  const finalizeCalls: FinalizeReleaseInput[] = [];
  const exports: RegistryExportStore = {
    async composeRelease(input) {
      composeCalls.push(input);
      if (behavior.composeReleaseError) throw behavior.composeReleaseError;
      return behavior.composeReleaseResult ?? "created";
    },
    async finalizeRelease(input) {
      finalizeCalls.push(input);
      if (behavior.finalizeError) throw behavior.finalizeError;
      return behavior.finalizeResult ?? "finalized";
    },
    async composeDeploymentPlan(_input: ComposeDeploymentPlanInput) {
      return "created";
    },
    async realizeDeployment(_input: RealizeDeploymentInput) {
      return "created";
    }
  };
  const packetEdge: RegistryLineageEdge = {
    schema_version: 1,
    from_record_id: state.packet.record_id,
    from_kind: "review_packet",
    from_version: 1,
    from_digest: state.packet.payload_digest,
    relationship: "proposes",
    to_record_id: state.candidate.record_id,
    to_kind: "candidate",
    to_version: 1,
    to_digest: state.candidate.payload_digest,
    created_at: NOW
  };
  const service = new ReleaseService({
    exports,
    records: {
      async getCurrent(recordId: string) {
        if (recordId === state.candidate.record_id) return state.candidate;
        if (recordId === state.packet.record_id) return state.packet;
        return null;
      }
    },
    reviews: {
      async getDecision(decisionId: string) {
        return decisionId === state.decision.id ? state.decision : null;
      },
      async getRequest() {
        return null;
      }
    },
    lineage: {
      async listTo(recordId: string, version: number) {
        return recordId === state.candidate.record_id && version === 1 ? [packetEdge] : [];
      }
    },
    packets: {
      async readPayload() {
        return researchDossier(state.licenseText);
      }
    },
    clock: () => NOW
  });
  return { service, composeCalls, finalizeCalls };
}

describe("ReleaseService.createCandidate", () => {
  it("composes a Release candidate through the export store with exact bindings", async () => {
    const state = buildState();
    const { service, composeCalls } = makeService(state);

    const result = await service.createCandidate({
      candidateId: state.candidate.record_id,
      approvalDecisionId: state.decision.id
    });

    expect(result.status).toBe("created");
    expect(result.release.kind).toBe("release");
    expect(result.release.version).toBe(1);
    expect(result.release.record_id.startsWith("rel_")).toBe(true);
    expect(composeCalls).toHaveLength(1);
    const call = composeCalls[0];
    expect(call.candidateApprovalDecisionId).toBe(state.decision.id);
    expect(call.release.record_id).toBe(result.release.record_id);
    expect(call.release.payload_digest).toBe(digestCanonicalJson(result.release.payload));
    expect(call.lineage).toEqual([{
      schema_version: 1,
      from_record_id: state.candidate.record_id,
      from_kind: "candidate",
      from_version: 1,
      from_digest: state.candidate.payload_digest,
      relationship: "realized_as",
      to_record_id: result.release.record_id,
      to_kind: "release",
      to_version: 1,
      to_digest: result.release.payload_digest,
      created_at: NOW
    }]);
    expect(call.reviewRequest.review_kind).toBe("release");
    expect(call.reviewRequest.subject_id).toBe(result.release.record_id);
    expect(call.reviewRequest.subject_digest).toBe(result.release.payload_digest);
    expect(call.reviewRequest.approve_confirmation)
      .toBe(confirmationFor({ review_kind: "release", subject_id: result.release.record_id }, "approve"));
  });

  it("returns existing when the export store replayed an identical composition", async () => {
    const state = buildState();
    const { service } = makeService(state, { composeReleaseResult: "existing" });
    const result = await service.createCandidate({
      candidateId: state.candidate.record_id,
      approvalDecisionId: state.decision.id
    });
    expect(result.status).toBe("existing");
  });

  it("refuses a missing, non-approval, or mismatched decision", async () => {
    const state = buildState();
    const missing = makeService(state);
    await expect(missing.service.createCandidate({
      candidateId: state.candidate.record_id,
      approvalDecisionId: `dec_${"0".repeat(32)}`
    })).rejects.toMatchObject({ code: "INVALID_REVIEW_DECISION" });

    const rejected = buildState();
    rejected.decision = { ...rejected.decision, action: "reject", disposition: undefined, rationale: "No." };
    await expect(makeService(rejected).service.createCandidate({
      candidateId: rejected.candidate.record_id,
      approvalDecisionId: rejected.decision.id
    })).rejects.toMatchObject({ code: "INVALID_REVIEW_DECISION" });

    const mismatched = buildState();
    mismatched.decision = {
      ...mismatched.decision,
      subject_digest: "c".repeat(64)
    };
    await expect(makeService(mismatched).service.createCandidate({
      candidateId: mismatched.candidate.record_id,
      approvalDecisionId: mismatched.decision.id
    })).rejects.toMatchObject({ code: "STALE_REVIEW" });
  });

  it("stops at BuildProposal for build and creates nothing for watch", async () => {
    for (const disposition of ["build", "watch"] as const) {
      const state = buildState({ disposition });
      const { service, composeCalls } = makeService(state);
      await expect(service.createCandidate({
        candidateId: state.candidate.record_id,
        approvalDecisionId: state.decision.id
      })).rejects.toMatchObject({ code: "INVALID_PACKAGE" });
      expect(composeCalls).toHaveLength(0);
    }
  });

  it("blocks when the dossier license cannot be determined", async () => {
    const state = buildState({ licenseText: "All Rights Reserved" });
    const { service, composeCalls } = makeService(state);
    await expect(service.createCandidate({
      candidateId: state.candidate.record_id,
      approvalDecisionId: state.decision.id
    })).rejects.toMatchObject({ code: "INVALID_PACKAGE" });
    expect(composeCalls).toHaveLength(0);
  });

  it("maps store digest conflicts to the stable P4 package code", async () => {
    const state = buildState();
    const { service } = makeService(state, {
      composeReleaseError: new PostgresExportStoreError("REGISTRY_DIGEST_CONFLICT")
    });
    await expect(service.createCandidate({
      candidateId: state.candidate.record_id,
      approvalDecisionId: state.decision.id
    })).rejects.toMatchObject({ code: "PACKAGE_DIGEST_CONFLICT" });
  });

  it("surfaces already-consumed approvals unchanged", async () => {
    const state = buildState();
    const { service } = makeService(state, {
      composeReleaseError: new PostgresExportStoreError("DECISION_ALREADY_CONSUMED", "rel_other")
    });
    await expect(service.createCandidate({
      candidateId: state.candidate.record_id,
      approvalDecisionId: state.decision.id
    })).rejects.toMatchObject({ code: "DECISION_ALREADY_CONSUMED" });
  });
});

describe("ReleaseService.finalizeApproval", () => {
  function finalizedState() {
    const state = buildState();
    const pkgDigest = FIXTURE_DIGEST;
    const release: RegistryVersion = {
      record_id: `rel_${"d".repeat(32)}`,
      kind: "release",
      version: 1,
      schema_version: 1,
      payload: {},
      payload_digest: pkgDigest,
      previous_version: null,
      created_at: NOW
    };
    const approval = reviewDecision({
      id: `dec_${"e".repeat(32)}`,
      review_kind: "release",
      disposition: undefined,
      subject_id: release.record_id,
      subject_digest: release.payload_digest
    });
    return { ...state, release, approval };
  }

  function makeFinalizeService(state: ReturnType<typeof finalizedState>, behavior: {
    finalizeResult?: "finalized" | "existing";
    finalizeError?: PostgresExportStoreError;
  } = {}) {
    const finalizeCalls: FinalizeReleaseInput[] = [];
    const exports: RegistryExportStore = {
      async composeRelease() {
        return "created";
      },
      async finalizeRelease(input) {
        finalizeCalls.push(input);
        if (behavior.finalizeError) throw behavior.finalizeError;
        return behavior.finalizeResult ?? "finalized";
      },
      async composeDeploymentPlan() {
        return "created";
      },
      async realizeDeployment() {
        return "created";
      }
    };
    const service = new ReleaseService({
      exports,
      records: {
        async getCurrent(recordId: string) {
          if (recordId === state.release.record_id) return state.release;
          return null;
        }
      },
      reviews: {
        async getDecision(decisionId: string) {
          return decisionId === state.approval.id ? state.approval : null;
        },
        async getRequest() {
          return null;
        }
      },
      lineage: {
        async listTo() {
          return [];
        }
      },
      packets: {
        async readPayload() {
          return null;
        }
      },
      clock: () => NOW
    });
    return { service, finalizeCalls };
  }

  it("finalizes the exact approved Release and is idempotent", async () => {
    const state = finalizedState();
    const { service, finalizeCalls } = makeFinalizeService(state);
    const result = await service.finalizeApproval({
      releaseId: state.release.record_id,
      approvalDecisionId: state.approval.id
    });
    expect(result.status).toBe("finalized");
    expect(finalizeCalls).toEqual([{
      releaseRecordId: state.release.record_id,
      releaseVersion: 1,
      releaseDigest: state.release.payload_digest,
      releaseApprovalDecisionId: state.approval.id
    }]);

    const replay = makeFinalizeService(state, { finalizeResult: "existing" });
    await expect(replay.service.finalizeApproval({
      releaseId: state.release.record_id,
      approvalDecisionId: state.approval.id
    })).resolves.toEqual({ status: "existing" });
  });

  it("rejects a release approval bound to a different digest or subject", async () => {
    const state = finalizedState();
    state.approval = { ...state.approval, subject_digest: "f".repeat(64) };
    const { service } = makeFinalizeService(state);
    await expect(service.finalizeApproval({
      releaseId: state.release.record_id,
      approvalDecisionId: state.approval.id
    })).rejects.toMatchObject({ code: "STALE_REVIEW" });
  });

  it("maps store failures to stable service codes", async () => {
    const state = finalizedState();
    const { service } = makeFinalizeService(state, {
      finalizeError: new PostgresExportStoreError("STALE_WRITE")
    });
    await expect(service.finalizeApproval({
      releaseId: state.release.record_id,
      approvalDecisionId: state.approval.id
    })).rejects.toBeInstanceOf(ReleaseServiceError);
  });
});
