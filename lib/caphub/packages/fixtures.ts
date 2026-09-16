import { packageContentDigest } from "./digest";
import type { CapabilityPackage } from "./types";

export const PACKAGE_FIXTURE_NOW = "2026-09-16T09:00:00.000Z";
export const PACKAGE_FIXTURE_DIGEST = "a".repeat(64);

export function testCapabilityPackage(overrides: Partial<CapabilityPackage> = {}): CapabilityPackage {
  const draft = {
    schema_version: 1,
    package_id: `pkg_${"1".repeat(32)}`,
    release_id: `rel_${"2".repeat(32)}`,
    release_version: 1,
    version: "1.2.3",
    slug: "pdf-table-extract",
    kind: "skill",
    title: "PDF Table Extraction",
    description: "Extract tables from PDF files into structured rows.",
    triggers: ["extract table", "pdf to csv"],
    non_triggers: ["edit pdf"],
    instructions: "Read the PDF, locate tables, emit CSV rows.",
    permissions: ["read_file"],
    dependencies: [{ name: "pdf-parse", version: "^2.0.0" }],
    compatibility: { hosts: ["codex", "claude", "hermes"] },
    resources: [] as CapabilityPackage["resources"],
    evidence: [{
      evidence_id: `ev_${"3".repeat(32)}`,
      citation: "github.com/acme/pdf-tool README",
      digest: PACKAGE_FIXTURE_DIGEST
    }],
    lineage: [{
      record_id: `cand_${"4".repeat(32)}`,
      record_kind: "candidate",
      version: 1,
      digest: PACKAGE_FIXTURE_DIGEST
    }],
    license: { spdx_id: "MIT", source_url: "https://example.com/LICENSE", provenance_confidence: "high" },
    known_limits: ["scanned PDFs need OCR first"],
    evaluations: [{
      dimension: "capability_value",
      score: 4,
      reason: "Frequent personal need.",
      evaluated_at: PACKAGE_FIXTURE_NOW
    }],
    created_at: PACKAGE_FIXTURE_NOW,
    digest: "",
    ...overrides
  } as CapabilityPackage;
  const digest = packageContentDigest(draft);
  return { ...draft, digest };
}
