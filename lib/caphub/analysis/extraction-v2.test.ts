import { describe, expect, it } from "vitest";
import {
  composeExtractionResultV2,
  ExtractionCompositionError,
  extractionDraftV2Schema,
  type ExtractionDraftV2
} from "./extraction-v2";
import type { PreprocessResult } from "./types";

const CAPTURE_ID = `cap_${"a".repeat(32)}`;
const PREPROCESS_ARTIFACT_ID = `art_${"b".repeat(64)}`;
const NOW = "2026-09-18T01:00:00.000Z";
const DIGEST = "c".repeat(64);

const preprocess: PreprocessResult = {
  schema_version: 1,
  capture_id: CAPTURE_ID,
  images: [{
    index: 0,
    source_object: {
      algorithm: "sha256",
      digest: DIGEST,
      key: `sha256/cc/${DIGEST}`,
      bytes: 128
    },
    original_digest: DIGEST,
    normalized_digest: "d".repeat(64),
    width: 1280,
    height: 720,
    orientation_applied: 1,
    perceptual_hash: "0123456789abcdef",
    quality: { sharpness: 12.5, black_border_ratio: 0.01, ocr_usable: true },
    regions: [],
    ocr_blocks: [{
      text: "Example",
      confidence: 0.98,
      bbox: { x: 10, y: 10, width: 200, height: 40 }
    }],
    barcode_payloads: []
  }],
  indicators: {
    urls: ["https://example.com/docs"],
    repositories: ["https://github.com/example/tool"],
    packages: ["@example/tool"],
    commands: ["example --help"]
  },
  duplicate_groups: [],
  near_duplicate_groups: [],
  privacy_suggestions: [],
  created_at: NOW
};

const draft = extractionDraftV2Schema.parse({
  schema_version: 2,
  claims: [{
    statement: "A capability is visible in the screenshot.",
    basis: "visible",
    confidence: 0.8,
    source_refs: [
      { kind: "indicator", indicator_kind: "url", indicator_index: 0 },
      { kind: "image", image_index: 0 },
      { kind: "image", image_index: 0 }
    ]
  }],
  entities: [{ name: "Example", aliases: [] }],
  experience_fragments: [{
    title: "Visible workflow",
    summary: "The UI exposes a bounded workflow.",
    source_refs: [{ kind: "ocr_block", image_index: 0, ocr_block_index: 0 }]
  }],
  explicit_urls: ["https://example.com/docs"],
  unresolved_questions: []
});

function compose(value: ExtractionDraftV2 = draft) {
  return composeExtractionResultV2({
    captureId: CAPTURE_ID,
    preprocessArtifactId: PREPROCESS_ARTIFACT_ID,
    preprocess,
    draft: value
  });
}

function withClaimSourceRef(sourceRef: ExtractionDraftV2["claims"][number]["source_refs"][number]) {
  return extractionDraftV2Schema.parse({
    ...draft,
    claims: [{ ...draft.claims[0], source_refs: [sourceRef] }]
  });
}

describe("ExtractionDraftV2 host composition", () => {
  it("creates stable host-owned IDs and canonically removes duplicate locators", () => {
    const first = compose();
    const second = compose();

    expect(second).toEqual(first);
    expect(first.capture_id).toBe(CAPTURE_ID);
    expect(first.preprocess_artifact_id).toBe(PREPROCESS_ARTIFACT_ID);
    expect(first.claims[0]?.id).toMatch(/^clm_[a-f0-9]{32}$/);
    const claimEvidenceIds = first.claims[0]?.evidence_ids ?? [];
    expect(claimEvidenceIds).toHaveLength(2);
    expect(claimEvidenceIds[0]).toMatch(/^ev_[a-f0-9]{32}$/);
    expect(first.experience_fragments[0]?.evidence_ids[0]).toMatch(/^ev_[a-f0-9]{32}$/);
  });

  it.each([
    ["image", { kind: "image", image_index: 1 }],
    ["OCR block", { kind: "ocr_block", image_index: 0, ocr_block_index: 1 }],
    ["indicator", { kind: "indicator", indicator_kind: "command", indicator_index: 1 }]
  ] as const)("rejects an unknown %s locator before persistence", (_label, sourceRef) => {
    try {
      compose(withClaimSourceRef(sourceRef));
      throw new Error("Expected host linkage validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ExtractionCompositionError);
      expect((error as ExtractionCompositionError).code).toBe("HOST_EXTRACTION_LINKAGE_FAILED");
    }
  });

  it("rejects extra locator properties instead of accepting model-controlled linkage", () => {
    expect(() => extractionDraftV2Schema.parse({
      ...draft,
      claims: [{
        ...draft.claims[0],
        source_refs: [{ kind: "image", image_index: 0, evidence_id: "ev_model_controlled" }]
      }]
    })).toThrow();
  });

  it.each(["http://example.com/repo", "ftp://example.com/repo"])(
    "rejects non-HTTPS repository %s at the draft boundary", (repository) => {
      expect(extractionDraftV2Schema.safeParse({
        ...draft, entities: [{ name: "Example", aliases: [], repository }]
      }).success).toBe(false);
    }
  );

  it("validates the complete V1 result before returning host composition", () => {
    expect(() => compose({
      ...draft, entities: [{ name: "Example", aliases: [], repository: "http://example.com/repo" }]
    })).toThrow(ExtractionCompositionError);
    expect(() => composeExtractionResultV2({
      captureId: CAPTURE_ID, preprocessArtifactId: "invalid-host-artifact", preprocess, draft
    })).toThrow(ExtractionCompositionError);
  });
});
