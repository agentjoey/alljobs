import { describe, expect, it, vi } from "vitest";
import {
  buildCapabilityAssessment,
  buildCriticReview,
  shouldRunCritic
} from "./assessment";
import type { CapabilityAssessment, ExtractionResult, ResearchDossier } from "./types";

const CAPTURE_ID = `cap_${"a".repeat(32)}`;
const ARTIFACT_ID = `art_${"b".repeat(64)}`;
const EVIDENCE_A = `ev_${"c".repeat(32)}`;
const EVIDENCE_C = `ev_${"d".repeat(32)}`;
const CLAIM_ID = `clm_${"e".repeat(32)}`;
const NOW = "2026-09-16T02:00:00.000Z";

const extraction: ExtractionResult = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  preprocess_artifact_id: ARTIFACT_ID,
  claims: [{
    id: CLAIM_ID,
    statement: "The capture describes evidence lookup.",
    basis: "visible",
    confidence: 0.91,
    evidence_ids: [EVIDENCE_A]
  }],
  entities: [{ name: "Example Tool", aliases: ["Example"] }],
  experience_fragments: [],
  explicit_urls: ["https://docs.example.com/tool"],
  unresolved_questions: ["Does it retain source content?"]
};

const dossier: ResearchDossier = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  extraction_artifact_id: ARTIFACT_ID,
  identity: { status: "confirmed", entity_id: "ent_example-tool", evidence_ids: [EVIDENCE_A] },
  evidence: [
    {
      id: EVIDENCE_A,
      tier: "A",
      source_url: "https://docs.example.com/tool",
      title: "Official docs",
      checked_at: NOW,
      content_digest: "1".repeat(64),
      claims: ["Read-only evidence lookup is supported."]
    },
    {
      id: EVIDENCE_C,
      tier: "C",
      source_url: "https://author.example.com/tool",
      title: "Author post",
      checked_at: NOW,
      content_digest: "2".repeat(64),
      claims: ["The author reports an early release."]
    }
  ],
  claim_checks: [{ claim_id: CLAIM_ID, status: "corroborated", evidence_ids: [EVIDENCE_A] }],
  current_availability: "available",
  version: "1.0.0",
  maintenance_status: "maintained",
  install_methods: ["managed integration"],
  agent_protocol_support: ["MCP"],
  authentication: ["API key"],
  pricing: "unknown",
  data_destinations: ["Vendor API"],
  permissions: ["Network"],
  license: "MIT",
  security_findings: [],
  researched_at: NOW
};

function proposedAssessment(disposition: CapabilityAssessment["disposition"] = "adapt"): CapabilityAssessment {
  const scores = [0, 1, 2, 3, 4, 5, 1, 2, 3, 4];
  const names = [
    "personal_fit", "capability_value", "evidence_confidence", "novelty", "reusability",
    "portability", "maturity", "maintenance_burden", "security_risk", "adoption_cost"
  ] as const;
  const dimensions = Object.fromEntries(names.map((name, index) => [name, {
    score: scores[index],
    reason: `${name} is independently assessed.`,
    evidence_ids: [EVIDENCE_A]
  }])) as CapabilityAssessment["dimensions"];
  return {
    schema_version: 1,
    capture_id: CAPTURE_ID,
    dossier_artifact_id: ARTIFACT_ID,
    candidate: {
      name: "Evidence lookup",
      novel_capabilities: ["Pinned source retrieval"],
      overlapping_capabilities: ["Existing web research"],
      replaces: ["Manual link checking"],
      complements: ["Human review"],
      conflicts_with: ["Unrestricted browsing"],
      capability_gaps: ["No offline source mirror"]
    },
    alternatives: [{
      rank: 1,
      name: "Manual research",
      reason: "Lower privilege boundary.",
      evidence_ids: [EVIDENCE_A]
    }],
    dimensions,
    conflicts: [],
    disposition,
    disposition_reason: `Recommend ${disposition} for Human review.`,
    resident_capability: false,
    unresolved_questions: [],
    assessed_at: NOW
  };
}

function worker(value: unknown) {
  return {
    assess: vi.fn(async () => ({ value, usage: { inputTokens: 10, outputTokens: 20 } }))
  };
}

describe("bounded capability assessment", () => {
  it("accepts every disposition while preserving independent dimensions and candidate fields", async () => {
    for (const disposition of ["adopt", "adapt", "build", "learn", "watch", "reject"] as const) {
      const result = await buildCapabilityAssessment({
        extraction,
        dossier,
        dossierArtifactId: ARTIFACT_ID,
        registrySnapshot: { capabilities: ["Existing web research"] },
        worker: worker(proposedAssessment(disposition)),
        clock: () => NOW,
        signal: new AbortController().signal
      });
      expect(result.disposition).toBe(disposition);
      expect(Object.values(result.dimensions).map((item) => item.score)).toEqual([0, 1, 2, 3, 4, 5, 1, 2, 3, 4]);
      expect(result.candidate).toMatchObject({
        novel_capabilities: ["Pinned source retrieval"],
        overlapping_capabilities: ["Existing web research"],
        replaces: ["Manual link checking"],
        complements: ["Human review"],
        conflicts_with: ["Unrestricted browsing"],
        capability_gaps: ["No offline source mirror"]
      });
      expect(result.alternatives[0]).toMatchObject({ rank: 1, evidence_ids: [EVIDENCE_A] });
    }
  });

  it("replaces model-authored citations absent from the host evidence set", async () => {
    const proposed = proposedAssessment();
    proposed.dimensions.personal_fit.evidence_ids = [`ev_${"f".repeat(32)}`];
    await expect(buildCapabilityAssessment({
      extraction,
      dossier,
      dossierArtifactId: ARTIFACT_ID,
      worker: worker(proposed),
      clock: () => NOW,
      signal: new AbortController().signal
    })).resolves.toMatchObject({
      dimensions: { personal_fit: { evidence_ids: [EVIDENCE_A] } }
    });
  });

  it("forces identity ambiguity into unresolved questions", async () => {
    const ambiguous: ResearchDossier = {
      ...dossier,
      identity: {
        status: "IDENTITY_AMBIGUOUS",
        candidates: [
          { name: "Example Tool", confidence: 0.5, evidence_ids: [EVIDENCE_C] },
          { name: "Example Toolkit", confidence: 0.5, evidence_ids: [EVIDENCE_C] }
        ],
        reason: "Official identity evidence is unavailable."
      }
    };
    const result = await buildCapabilityAssessment({
      extraction,
      dossier: ambiguous,
      dossierArtifactId: ARTIFACT_ID,
      worker: worker(proposedAssessment()),
      clock: () => NOW,
      signal: new AbortController().signal
    });
    expect(result.unresolved_questions).toContain("Identity unresolved: Official identity evidence is unavailable.");
  });

  it("evaluates every critic trigger locally", () => {
    const calm = proposedAssessment("learn");
    calm.dimensions.evidence_confidence.score = 3;
    calm.dimensions.security_risk.score = 1;
    calm.dimensions.capability_value.score = 3;
    expect(shouldRunCritic(calm)).toBe(false);
    expect(shouldRunCritic({ ...calm, disposition: "build" })).toBe(true);
    expect(shouldRunCritic({ ...calm, dimensions: { ...calm.dimensions, security_risk: { ...calm.dimensions.security_risk, score: 4 } } })).toBe(true);
    expect(shouldRunCritic({ ...calm, resident_capability: true, dimensions: { ...calm.dimensions, capability_value: { ...calm.dimensions.capability_value, score: 4 } } })).toBe(true);
    expect(shouldRunCritic({ ...calm, dimensions: { ...calm.dimensions, evidence_confidence: { ...calm.dimensions.evidence_confidence, score: 2 } } })).toBe(true);
    expect(shouldRunCritic({ ...calm, conflicts: [{ summary: "Evidence conflicts.", evidence_ids: [EVIDENCE_A] }] })).toBe(true);
    expect(shouldRunCritic(calm, { manualRequest: true })).toBe(true);
  });

  it("validates an optional critic against host evidence and immutable assessment identity", async () => {
    const assessment = proposedAssessment("build");
    const criticWorker = {
      critique: vi.fn(async () => ({
        value: {
          schema_version: 1,
          capture_id: "cap_wrong",
          assessment_artifact_id: `art_${"0".repeat(64)}`,
          verdict: "revise",
          findings: [{ severity: "high", summary: "Privilege boundary needs review.", evidence_ids: [EVIDENCE_A] }],
          recommended_disposition: "adapt",
          unresolved_questions: ["Can the source set be narrowed?"],
          reviewed_at: "2020-01-01T00:00:00.000Z"
        },
        usage: { inputTokens: 10, outputTokens: 10 }
      }))
    };
    const result = await buildCriticReview({
      assessment,
      assessmentArtifactId: ARTIFACT_ID,
      dossier,
      worker: criticWorker,
      clock: () => NOW,
      signal: new AbortController().signal
    });
    expect(result).toMatchObject({
      capture_id: CAPTURE_ID,
      assessment_artifact_id: ARTIFACT_ID,
      reviewed_at: NOW,
      verdict: "revise"
    });
  });
});
