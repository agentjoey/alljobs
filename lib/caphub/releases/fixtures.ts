import { reviewPacketSchema } from "../analysis/schemas";
import { digestCanonicalJson } from "../analysis/digest";
import type { PackageLicense } from "../packages/types";
import type { RegistryVersion } from "../registry/types";

export const FIXTURE_NOW = "2026-09-16T09:00:00.000Z";
export const FIXTURE_DIGEST = "a".repeat(64);

export const fixtureDimensions = Object.fromEntries([
  "personal_fit", "capability_value", "evidence_confidence", "novelty", "reusability",
  "portability", "maturity", "maintenance_burden", "security_risk", "adoption_cost"
].map((name) => [name, { score: 3, reason: `${name} reason`, evidence_ids: [`ev_${"7".repeat(32)}`] }]));

export function testReviewPacket(overrides: Record<string, unknown> = {}) {
  return reviewPacketSchema.parse({
    schema_version: 1,
    packet_id: `rvp_${"1".repeat(32)}`,
    capture_id: `cap_${"2".repeat(32)}`,
    source_objects: [{ algorithm: "sha256", digest: FIXTURE_DIGEST, key: `sha256/${"aa"}/${FIXTURE_DIGEST}`, bytes: 10 }],
    stage_artifact_ids: {
      preprocess: `art_${"3".repeat(64)}`,
      extraction: `art_${"4".repeat(64)}`,
      research: `art_${"5".repeat(64)}`,
      assessment: `art_${"6".repeat(64)}`,
      critic: null
    },
    screenshots: [{ order: 0, object: { algorithm: "sha256", digest: FIXTURE_DIGEST, key: `sha256/${"aa"}/${FIXTURE_DIGEST}`, bytes: 10 } }],
    ocr: [],
    entities: [],
    identity: {
      status: "IDENTITY_AMBIGUOUS",
      candidates: [
        { name: "acme pdf tool", confidence: 0.6, evidence_ids: [`ev_${"7".repeat(32)}`] },
        { name: "acme pdf suite", confidence: 0.4, evidence_ids: [`ev_${"7".repeat(32)}`] }
      ],
      reason: "not needed for composition"
    },
    claims: [],
    evidence: [{
      id: `ev_${"7".repeat(32)}`,
      tier: "A",
      source_url: "https://example.com/docs",
      title: "Official documentation",
      checked_at: FIXTURE_NOW,
      content_digest: FIXTURE_DIGEST,
      claims: ["install via package manager"]
    }],
    conflicts: [],
    candidate: {
      name: "PDF Table Extract",
      novel_capabilities: ["extract tables from pdf", "pdf to csv"],
      overlapping_capabilities: [],
      replaces: [],
      complements: ["ocr pipeline"],
      conflicts_with: [],
      capability_gaps: ["scanned pdf without ocr"]
    },
    alternatives: [],
    dimensions: fixtureDimensions,
    recommended_disposition: "adopt",
    disposition_reason: "Frequent personal need with solid evidence.",
    critic: null,
    platform_previews: [],
    model_contracts: [],
    unresolved_questions: ["does it handle merged cells?"],
    human_review_required: true,
    created_at: FIXTURE_NOW,
    ...overrides
  });
}

export function testCandidateVersion(packet = testReviewPacket()): RegistryVersion {
  const payload = packet.candidate;
  return {
    record_id: `cand_${"8".repeat(32)}`,
    kind: "candidate",
    version: 1,
    schema_version: 1,
    payload,
    payload_digest: digestCanonicalJson(payload),
    previous_version: null,
    created_at: FIXTURE_NOW
  };
}

export const testLicense: PackageLicense = { spdx_id: "MIT", provenance_confidence: "medium" };
