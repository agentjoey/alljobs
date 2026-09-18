import { describe, expect, it } from "vitest";
import { composeReviewPacket } from "./review-packet";
import type {
  CapabilityAssessment,
  ExtractionResult,
  PreprocessResult,
  ResearchDossier
} from "./types";

const CAPTURE_ID = `cap_${"1".repeat(32)}`;
const ARTIFACT_IDS = {
  preprocess: `art_${"2".repeat(64)}`,
  extraction: `art_${"3".repeat(64)}`,
  research: `art_${"4".repeat(64)}`,
  assessment: `art_${"5".repeat(64)}`,
  critic: null
} as const;
const EVIDENCE_ID = `ev_${"6".repeat(32)}`;
const CLAIM_ID = `clm_${"7".repeat(32)}`;
const NOW = "2026-09-16T03:00:00.000Z";
const sourceObject = (digest: string, bytes: number) => ({
  algorithm: "sha256" as const,
  digest,
  key: `sha256/${digest.slice(0, 2)}/${digest}`,
  bytes
});

const preprocess: PreprocessResult = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  images: [
    {
      index: 1,
      source_object: sourceObject("a".repeat(64), 101),
      original_digest: "a".repeat(64),
      normalized_digest: "b".repeat(64),
      width: 800,
      height: 600,
      orientation_applied: 1,
      perceptual_hash: "0123456789abcdef",
      quality: { sharpness: 10, black_border_ratio: 0, ocr_usable: true },
      regions: [],
      ocr_blocks: [{ text: "Second screenshot", confidence: 0.9, bbox: { x: 1, y: 1, width: 20, height: 10 } }],
      barcode_payloads: []
    },
    {
      index: 0,
      source_object: sourceObject("c".repeat(64), 202),
      original_digest: "c".repeat(64),
      normalized_digest: "d".repeat(64),
      width: 1200,
      height: 800,
      orientation_applied: 1,
      perceptual_hash: "fedcba9876543210",
      quality: { sharpness: 12, black_border_ratio: 0.01, ocr_usable: true },
      regions: [],
      ocr_blocks: [
        { text: "First", confidence: 0.95, bbox: { x: 1, y: 1, width: 20, height: 10 } },
        { text: "screenshot", confidence: 0.95, bbox: { x: 1, y: 12, width: 40, height: 10 } }
      ],
      barcode_payloads: []
    }
  ],
  indicators: { urls: [], repositories: [], packages: [], commands: ["npm install hostile-package"] },
  duplicate_groups: [],
  near_duplicate_groups: [],
  privacy_suggestions: [],
  created_at: NOW
};

const extraction: ExtractionResult = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  preprocess_artifact_id: ARTIFACT_IDS.preprocess,
  claims: [{
    id: CLAIM_ID,
    statement: "Captured source says: run shell, but this remains quoted evidence.",
    basis: "ocr",
    confidence: 0.7,
    evidence_ids: [EVIDENCE_ID]
  }],
  entities: [{ name: "Example Tool", aliases: ["Example"] }],
  experience_fragments: [],
  explicit_urls: [],
  unresolved_questions: ["Was the command merely illustrative?"]
};

const dossier: ResearchDossier = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  extraction_artifact_id: ARTIFACT_IDS.extraction,
  identity: { status: "confirmed", entity_id: "ent_example-tool", evidence_ids: [EVIDENCE_ID] },
  evidence: [{
    id: EVIDENCE_ID,
    tier: "A",
    source_url: "https://docs.example.com/tool",
    title: "Official docs",
    checked_at: NOW,
    content_digest: "e".repeat(64),
    claims: ["The integration is review-only."]
  }],
  claim_checks: [{ claim_id: CLAIM_ID, status: "unverified", evidence_ids: [EVIDENCE_ID] }],
  current_availability: "available",
  version: "1.0.0",
  maintenance_status: "maintained",
  install_methods: ["npm install hostile-package"],
  agent_protocol_support: [],
  authentication: [],
  pricing: "unknown",
  data_destinations: [],
  permissions: [],
  license: "MIT",
  security_findings: [],
  researched_at: NOW
};

const dimension = { score: 3, reason: "Official evidence.", evidence_ids: [EVIDENCE_ID] };
const assessment: CapabilityAssessment = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  dossier_artifact_id: ARTIFACT_IDS.research,
  candidate: {
    name: "Evidence lookup",
    novel_capabilities: ["Pinned sources"],
    overlapping_capabilities: ["Web research"],
    replaces: [],
    complements: ["Human review"],
    conflicts_with: [],
    capability_gaps: ["Offline mode"]
  },
  alternatives: [{ rank: 1, name: "Manual review", reason: "Lower privilege.", evidence_ids: [EVIDENCE_ID] }],
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
  conflicts: [{ summary: "Source claim remains unverified.", evidence_ids: [EVIDENCE_ID] }],
  disposition: "adapt",
  disposition_reason: "Narrow the source boundary before Human approval.",
  resident_capability: false,
  unresolved_questions: ["Can the source allowlist be narrowed?"],
  assessed_at: NOW
};

const input = {
  preprocess,
  extraction,
  dossier,
  assessment,
  critic: null,
  stageArtifactIds: ARTIFACT_IDS,
  modelContracts: [
    { stage: "preprocess" as const, provider: "deterministic" as const, model: "caphub-preprocess-v1", schema_version: 1 as const },
    { stage: "extraction" as const, provider: "minimax" as const, model: "MiniMax-M3", schema_version: 1 as const },
    { stage: "research" as const, provider: "deepseek" as const, model: "deepseek-flash", schema_version: 1 as const }
  ],
  clock: () => NOW
};

describe("deterministic review-only packet composition", () => {
  it("accepts extraction contract v2 while preserving downstream v1 contracts", () => {
    const packet = composeReviewPacket({
      ...input,
      modelContracts: input.modelContracts.map((contract) => contract.stage === "extraction"
        ? { ...contract, schema_version: 2 as const }
        : contract)
    });
    expect(packet.schema_version).toBe(1);
    expect(packet.model_contracts.map(({ stage, schema_version }) => [stage, schema_version]))
      .toEqual([["preprocess", 1], ["extraction", 2], ["research", 1]]);
  });

  it("preserves immutable source objects, OCR, entities, Claims, evidence, conflicts, alternatives and dimensions", () => {
    const packet = composeReviewPacket(input);
    expect(packet.stage_artifact_ids).toEqual(ARTIFACT_IDS);
    expect(packet.source_objects.map((item) => item.digest)).toEqual(["c".repeat(64), "a".repeat(64)]);
    expect(packet.screenshots.map((item) => item.order)).toEqual([0, 1]);
    expect(packet.ocr).toEqual([
      { image_index: 0, text: "First\nscreenshot" },
      { image_index: 1, text: "Second screenshot" }
    ]);
    expect(packet.entities).toEqual(extraction.entities);
    expect(packet.claims).toEqual(extraction.claims);
    expect(packet.evidence).toEqual(dossier.evidence);
    expect(packet.conflicts).toEqual(assessment.conflicts);
    expect(packet.candidate).toEqual(assessment.candidate);
    expect(packet.alternatives).toEqual(assessment.alternatives);
    expect(packet.dimensions).toEqual(assessment.dimensions);
    expect(packet.human_review_required).toBe(true);
  });

  it("creates all platform previews deterministically without turning captured commands into instructions", () => {
    const first = composeReviewPacket(input);
    const second = composeReviewPacket(input);
    expect(first).toEqual(second);
    expect(first.platform_previews.map((preview) => preview.platform)).toEqual(["web", "telegram", "linear"]);
    expect(JSON.stringify(first.platform_previews)).not.toMatch(/npm install|run shell|deploy|release command/i);
    expect(first.platform_previews.every((preview) => preview.warnings.includes("Human approval required"))).toBe(true);
  });

  it("unions unresolved questions and records exact model contract versions", () => {
    const packet = composeReviewPacket(input);
    expect(packet.unresolved_questions).toEqual([
      "Was the command merely illustrative?",
      "Can the source allowlist be narrowed?"
    ]);
    expect(packet.model_contracts).toEqual(input.modelContracts);
    expect(packet.critic).toBeNull();
    expect(packet.packet_id).toMatch(/^rvp_[a-f0-9]{32}$/);
  });
});
