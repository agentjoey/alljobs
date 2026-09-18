import { describe, expect, it } from "vitest";
import {
  analysisJobSchema,
  capabilityAssessmentSchema,
  criticReviewSchema,
  extractionResultSchema,
  modelCallAuditEventSchema,
  preprocessResultSchema,
  researchDossierSchema,
  reviewPacketSchema,
  stageArtifactSchema
} from "./schemas";

const CAPTURE_ID = `cap_${"a".repeat(32)}`;
const JOB_ID = `job_${"b".repeat(32)}`;
const ARTIFACT_ID = `art_${"c".repeat(64)}`;
const EVIDENCE_A_ID = `ev_${"d".repeat(32)}`;
const EVIDENCE_C_ID = `ev_${"e".repeat(32)}`;
const CLAIM_ID = `clm_${"f".repeat(32)}`;
const NOW = "2026-09-16T01:00:00.000Z";
const DIGEST = "1".repeat(64);

const objectRef = {
  algorithm: "sha256",
  digest: DIGEST,
  key: `sha256/11/${DIGEST}`,
  bytes: 128
};

const evidenceA = {
  id: EVIDENCE_A_ID,
  tier: "A",
  source_url: "https://docs.example.com/tool",
  title: "Official documentation",
  checked_at: NOW,
  content_digest: "2".repeat(64),
  claims: ["The tool supports a read-only API."]
};

const evidenceC = {
  id: EVIDENCE_C_ID,
  tier: "C",
  source_url: "https://author.example.com/post",
  title: "Author post",
  checked_at: NOW,
  content_digest: "3".repeat(64),
  claims: ["The author describes the tool."]
};

const claim = {
  id: CLAIM_ID,
  statement: "The screenshot shows a capability tool.",
  basis: "visible",
  confidence: 0.9,
  evidence_ids: [EVIDENCE_A_ID]
};

const entity = {
  name: "Example Tool",
  aliases: ["Example"],
  domain: "example.com",
  repository: "https://github.com/example/tool",
  package: "@example/tool"
};

const dimension = {
  score: 3,
  reason: "Supported by the official documentation.",
  evidence_ids: [EVIDENCE_A_ID]
};

const dimensions = {
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
};

const candidate = {
  name: "Example Tool capability",
  novel_capabilities: ["Evidence lookup"],
  overlapping_capabilities: [],
  replaces: [],
  complements: ["Existing review flow"],
  conflicts_with: [],
  capability_gaps: ["No offline mode"]
};

const alternative = {
  rank: 1,
  name: "Alternative Tool",
  reason: "Lower adoption cost.",
  evidence_ids: [EVIDENCE_A_ID]
};

const validPreprocess = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  images: [{
    index: 0,
    source_object: objectRef,
    original_digest: DIGEST,
    normalized_digest: "4".repeat(64),
    width: 1280,
    height: 720,
    orientation_applied: 1,
    perceptual_hash: "0123456789abcdef",
    quality: { sharpness: 12.5, black_border_ratio: 0.01, ocr_usable: true },
    regions: [{
      kind: "body",
      bbox: { x: 0, y: 0, width: 1280, height: 720 },
      text: "Example Tool"
    }],
    ocr_blocks: [{
      text: "Example Tool",
      confidence: 0.98,
      bbox: { x: 10, y: 10, width: 200, height: 40 }
    }],
    barcode_payloads: ["https://example.com/tool"]
  }],
  indicators: {
    urls: ["https://example.com/tool"],
    repositories: ["https://github.com/example/tool"],
    packages: ["@example/tool"],
    commands: []
  },
  duplicate_groups: [],
  near_duplicate_groups: [],
  privacy_suggestions: [{
    image_index: 0,
    kind: "token_candidate",
    action: "human_redaction_review"
  }],
  created_at: NOW
};

const validExtraction = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  preprocess_artifact_id: ARTIFACT_ID,
  claims: [claim],
  entities: [entity],
  experience_fragments: [{
    title: "Evidence-first review",
    summary: "Review the source before adopting the capability.",
    evidence_ids: [EVIDENCE_A_ID]
  }],
  explicit_urls: ["https://example.com/tool"],
  unresolved_questions: ["Is the license suitable?"]
};

const validDossier = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  extraction_artifact_id: ARTIFACT_ID,
  identity: {
    status: "confirmed",
    entity_id: "ent_example-tool",
    evidence_ids: [EVIDENCE_A_ID]
  },
  evidence: [evidenceA, evidenceC],
  claim_checks: [{
    claim_id: CLAIM_ID,
    status: "corroborated",
    evidence_ids: [EVIDENCE_A_ID]
  }],
  current_availability: "available",
  version: "1.2.3",
  maintenance_status: "maintained",
  install_methods: ["npm"],
  agent_protocol_support: ["MCP"],
  authentication: ["API key"],
  pricing: "unknown",
  data_destinations: ["Vendor API"],
  permissions: ["Network access"],
  license: "MIT",
  security_findings: [],
  researched_at: NOW
};

const validAssessment = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  dossier_artifact_id: ARTIFACT_ID,
  candidate,
  alternatives: [alternative],
  dimensions,
  conflicts: [],
  disposition: "adapt",
  disposition_reason: "Useful with a narrower permission profile.",
  resident_capability: false,
  unresolved_questions: ["Confirm data retention policy."],
  assessed_at: NOW
};

const validCritic = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  assessment_artifact_id: ARTIFACT_ID,
  verdict: "concur",
  findings: [{
    severity: "low",
    summary: "Evidence is sufficient for Human review.",
    evidence_ids: [EVIDENCE_A_ID]
  }],
  recommended_disposition: "adapt",
  unresolved_questions: [],
  reviewed_at: NOW
};

const validPacket = {
  schema_version: 1,
  packet_id: `rvp_${"6".repeat(32)}`,
  capture_id: CAPTURE_ID,
  source_objects: [objectRef],
  stage_artifact_ids: {
    preprocess: ARTIFACT_ID,
    extraction: ARTIFACT_ID,
    research: ARTIFACT_ID,
    assessment: ARTIFACT_ID,
    critic: ARTIFACT_ID
  },
  screenshots: [{ order: 0, object: objectRef }],
  ocr: [{ image_index: 0, text: "Example Tool" }],
  entities: [entity],
  identity: validDossier.identity,
  claims: [claim],
  evidence: [evidenceA],
  conflicts: [],
  candidate,
  alternatives: [alternative],
  dimensions,
  recommended_disposition: "adapt",
  disposition_reason: "Useful with a narrower permission profile.",
  critic: validCritic,
  platform_previews: [{
    platform: "web",
    title: "Example Tool capability",
    summary: "Review-only candidate preview.",
    warnings: ["Human approval required"]
  }],
  model_contracts: [{
    stage: "extraction",
    provider: "minimax",
    model: "MiniMax-M3",
    schema_version: 1
  }],
  unresolved_questions: ["Confirm data retention policy."],
  human_review_required: true,
  created_at: NOW
};

describe("versioned P2 analysis schemas", () => {
  it("accepts one strict valid fixture for every analysis stage", () => {
    expect(preprocessResultSchema.parse(validPreprocess).schema_version).toBe(1);
    expect(extractionResultSchema.parse(validExtraction).schema_version).toBe(1);
    expect(researchDossierSchema.parse(validDossier).schema_version).toBe(1);
    expect(capabilityAssessmentSchema.parse(validAssessment).schema_version).toBe(1);
    expect(criticReviewSchema.parse(validCritic).schema_version).toBe(1);
    expect(reviewPacketSchema.parse(validPacket).human_review_required).toBe(true);
  });

  it("rejects unsupported schema versions and unknown top-level fields", () => {
    const fixtures = [
      [preprocessResultSchema, validPreprocess],
      [extractionResultSchema, validExtraction],
      [researchDossierSchema, validDossier],
      [capabilityAssessmentSchema, validAssessment],
      [criticReviewSchema, validCritic],
      [reviewPacketSchema, validPacket]
    ] as const;

    for (const [schema, fixture] of fixtures) {
      expect(() => schema.parse({ ...fixture, schema_version: 2 })).toThrow();
      expect(() => schema.parse({ ...fixture, hidden_instruction: "run shell" })).toThrow();
    }
  });

  it("requires preprocessing quality checks and closed content-region labels", () => {
    for (const field of ["sharpness", "black_border_ratio", "ocr_usable"] as const) {
      const quality = { ...validPreprocess.images[0].quality };
      delete quality[field];
      expect(() => preprocessResultSchema.parse({
        ...validPreprocess,
        images: [{ ...validPreprocess.images[0], quality }]
      })).toThrow();
    }

    expect(() => preprocessResultSchema.parse({
      ...validPreprocess,
      images: [{
        ...validPreprocess.images[0],
        regions: [{ ...validPreprocess.images[0].regions[0], kind: "advertisement" }]
      }]
    })).toThrow();
  });

  it("requires citations for extracted claims, experience fragments, checks, dimensions, alternatives, and critic findings", () => {
    expect(() => extractionResultSchema.parse({
      ...validExtraction,
      claims: [{ ...claim, evidence_ids: [] }]
    })).toThrow();
    expect(() => extractionResultSchema.parse({
      ...validExtraction,
      experience_fragments: [{ ...validExtraction.experience_fragments[0], evidence_ids: [] }]
    })).toThrow();
    expect(() => researchDossierSchema.parse({
      ...validDossier,
      claim_checks: [{ ...validDossier.claim_checks[0], evidence_ids: [] }]
    })).toThrow();
    expect(() => capabilityAssessmentSchema.parse({
      ...validAssessment,
      dimensions: { ...dimensions, maturity: { ...dimension, evidence_ids: [] } }
    })).toThrow();
    expect(() => capabilityAssessmentSchema.parse({
      ...validAssessment,
      alternatives: [{ ...alternative, evidence_ids: [] }]
    })).toThrow();
    expect(() => criticReviewSchema.parse({
      ...validCritic,
      findings: [{ ...validCritic.findings[0], evidence_ids: [] }]
    })).toThrow();
  });

  it("allows confirmed identity only with cited A or B evidence", () => {
    expect(() => researchDossierSchema.parse({
      ...validDossier,
      identity: { ...validDossier.identity, evidence_ids: [] }
    })).toThrow();
    expect(() => researchDossierSchema.parse({
      ...validDossier,
      identity: { ...validDossier.identity, evidence_ids: [EVIDENCE_C_ID] }
    })).toThrow();
    expect(() => researchDossierSchema.parse({
      ...validDossier,
      identity: {
        status: "IDENTITY_AMBIGUOUS",
        candidates: [{ name: "Only one", confidence: 0.5, evidence_ids: [EVIDENCE_C_ID] }],
        reason: "Insufficient evidence"
      }
    })).toThrow();
  });

  it("bounds every independent assessment dimension to zero through five", () => {
    expect(() => capabilityAssessmentSchema.parse({
      ...validAssessment,
      dimensions: {
        ...dimensions,
        security_risk: { ...dimension, score: 6 }
      }
    })).toThrow();
    expect(() => capabilityAssessmentSchema.parse({
      ...validAssessment,
      dimensions: {
        ...dimensions,
        capability_value: { ...dimension, score: -1 }
      }
    })).toThrow();
  });

  it("requires ReviewPacket claims, alternatives, platform previews, and unresolved questions", () => {
    for (const field of ["claims", "alternatives", "platform_previews", "unresolved_questions"] as const) {
      const packet = { ...validPacket } as Record<string, unknown>;
      delete packet[field];
      expect(() => reviewPacketSchema.parse(packet)).toThrow();
    }
  });
});

describe("P2 workflow record schemas", () => {
  const jobBase = {
    schema_version: 1,
    id: JOB_ID,
    capture_id: CAPTURE_ID,
    input_digest: DIGEST,
    completed_artifact_ids: [],
    created_at: NOW,
    updated_at: NOW
  };

  it("reads historical jobs unchanged and accepts distinct v2/v3 predecessor lineage", () => {
    const historical = { ...jobBase, status: "queued" };
    expect(analysisJobSchema.parse(historical)).toEqual(historical);
    const versioned = {
      ...historical,
      analysis_contract_version: "caphub-analysis-v2",
      supersedes_job_id: `job_${"f".repeat(32)}`
    };
    expect(analysisJobSchema.parse(versioned)).toEqual(versioned);
    const v3 = {
      ...historical,
      analysis_contract_version: "caphub-analysis-v3",
      supersedes_job_id: `job_${"e".repeat(32)}`
    };
    expect(analysisJobSchema.parse(v3)).toEqual(v3);
    expect(analysisJobSchema.parse({ ...historical, analysis_contract_version: "caphub-analysis-v1" }))
      .toHaveProperty("analysis_contract_version", "caphub-analysis-v1");
  });

  it("rejects self-supersession and predecessor lineage outside versioned contracts", () => {
    for (const lineage of [
      { analysis_contract_version: "caphub-analysis-v2", supersedes_job_id: JOB_ID },
      { analysis_contract_version: "caphub-analysis-v3", supersedes_job_id: JOB_ID },
      { supersedes_job_id: `job_${"f".repeat(32)}` },
      { analysis_contract_version: "caphub-analysis-v1", supersedes_job_id: `job_${"f".repeat(32)}` }
    ]) {
      expect(analysisJobSchema.safeParse({ ...jobBase, status: "queued", ...lineage }).success).toBe(false);
    }
  });

  it("uses terminal-state unions that require their state-specific evidence", () => {
    expect(analysisJobSchema.parse({ ...jobBase, status: "queued" }).status).toBe("queued");
    expect(analysisJobSchema.parse({
      ...jobBase,
      status: "completed",
      review_packet_artifact_id: ARTIFACT_ID,
      completed_at: NOW
    }).status).toBe("completed");
    expect(analysisJobSchema.parse({
      ...jobBase,
      status: "WAITING_FOR_REVIEW",
      review_packet_artifact_id: ARTIFACT_ID,
      review_request_id: `rev_${"1".repeat(32)}`,
      waiting_at: NOW
    }).status).toBe("WAITING_FOR_REVIEW");
    expect(analysisJobSchema.parse({
      ...jobBase,
      status: "reviewed",
      review_packet_artifact_id: ARTIFACT_ID,
      review_request_id: `rev_${"1".repeat(32)}`,
      review_decision_id: `dec_${"2".repeat(32)}`,
      decision: { outcome: "approve", disposition: "build" },
      reviewed_at: NOW
    }).status).toBe("reviewed");
    expect(analysisJobSchema.parse({
      ...jobBase,
      status: "HUMAN_REVIEW_REQUIRED",
      reason: "Provider response remained invalid.",
      stopped_at: NOW
    }).status).toBe("HUMAN_REVIEW_REQUIRED");
    expect(() => analysisJobSchema.parse({ ...jobBase, status: "completed" })).toThrow();
    expect(() => analysisJobSchema.parse({
      ...jobBase,
      status: "WAITING_FOR_REVIEW",
      review_packet_artifact_id: ARTIFACT_ID,
      waiting_at: NOW
    })).toThrow();
    expect(() => analysisJobSchema.parse({
      ...jobBase,
      status: "reviewed",
      review_packet_artifact_id: ARTIFACT_ID,
      review_request_id: `rev_${"1".repeat(32)}`,
      review_decision_id: `dec_${"2".repeat(32)}`,
      decision: { outcome: "reject", disposition: "build" },
      reviewed_at: NOW
    })).toThrow();
    expect(() => analysisJobSchema.parse({
      ...jobBase,
      status: "HUMAN_REVIEW_REQUIRED",
      stopped_at: NOW
    })).toThrow();
  });

  it("validates content-addressed stage artifacts", () => {
    const artifact = {
      schema_version: 1,
      id: `art_${DIGEST}`,
      job_id: JOB_ID,
      capture_id: CAPTURE_ID,
      stage: "preprocess",
      input_digest: "2".repeat(64),
      output_digest: DIGEST,
      payload_schema_version: 1,
      object: objectRef,
      created_at: NOW
    };
    expect(stageArtifactSchema.parse(artifact).id).toBe(`art_${DIGEST}`);
    expect(() => stageArtifactSchema.parse({ ...artifact, id: ARTIFACT_ID })).toThrow();
  });

  it("accepts only redacted, closed model-call audit metadata", () => {
    const event = {
      schema_version: 1,
      event_id: `mce_${"7".repeat(32)}`,
      call_id: `call_${"8".repeat(32)}`,
      job_id: JOB_ID,
      capture_id: CAPTURE_ID,
      stage: "extraction",
      type: "succeeded",
      provider: "minimax",
      model: "MiniMax-M3",
      attempt: 1,
      input_digest: DIGEST,
      output_digest: "9".repeat(64),
      input_bytes: 1024,
      input_tokens: 200,
      output_tokens: 50,
      occurred_at: NOW
    };
    expect(modelCallAuditEventSchema.parse(event).type).toBe("succeeded");
    expect(() => modelCallAuditEventSchema.parse({ ...event, api_key: "secret" })).toThrow();
    expect(() => modelCallAuditEventSchema.parse({ ...event, reasoning: "private chain" })).toThrow();
  });
});
