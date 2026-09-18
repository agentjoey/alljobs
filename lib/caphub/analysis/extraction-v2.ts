import { z } from "zod";
import { digestCanonicalJson, canonicalJson } from "./digest";
import type { ExtractionResult, PreprocessResult } from "./types";

export const extractionSourceRefV2Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    image_index: z.number().int().nonnegative()
  }).strict(),
  z.object({
    kind: z.literal("ocr_block"),
    image_index: z.number().int().nonnegative(),
    ocr_block_index: z.number().int().nonnegative()
  }).strict(),
  z.object({
    kind: z.literal("indicator"),
    indicator_kind: z.enum(["url", "repository", "package", "command"]),
    indicator_index: z.number().int().nonnegative()
  }).strict()
]);

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const extractionDraftV2Schema = z.object({
  schema_version: z.literal(2),
  claims: z.array(z.object({
    statement: boundedText(4_096),
    basis: z.enum(["visible", "ocr", "inferred", "unknown"]),
    confidence: z.number().min(0).max(1),
    source_refs: z.array(extractionSourceRefV2Schema).min(1).max(32)
  }).strict()).max(128),
  entities: z.array(z.object({
    name: boundedText(512),
    aliases: z.array(boundedText(512)).max(32),
    logo_hint: boundedText(512).optional(),
    author: boundedText(512).optional(),
    domain: boundedText(512).optional(),
    repository: z.string().url().max(2_048).optional(),
    package: boundedText(512).optional()
  }).strict()).max(64),
  experience_fragments: z.array(z.object({
    title: boundedText(512),
    summary: boundedText(4_096),
    source_refs: z.array(extractionSourceRefV2Schema).min(1).max(32)
  }).strict()).max(64),
  explicit_urls: z.array(z.string().url().max(2_048).refine(
    (url) => new URL(url).protocol === "https:"
  )).max(64),
  unresolved_questions: z.array(boundedText(2_048)).max(64)
}).strict();

export type ExtractionDraftV2 = z.infer<typeof extractionDraftV2Schema>;
export type ExtractionSourceRefV2 = z.infer<typeof extractionSourceRefV2Schema>;

export class ExtractionCompositionError extends Error {
  readonly code = "HOST_EXTRACTION_LINKAGE_FAILED";

  constructor() {
    super("Host extraction linkage validation failed");
    this.name = "ExtractionCompositionError";
  }
}

export interface ComposeExtractionResultV2Input {
  captureId: string;
  preprocessArtifactId: string;
  preprocess: PreprocessResult;
  draft: ExtractionDraftV2;
}

function id(prefix: "ev" | "clm", value: unknown): string {
  return `${prefix}_${digestCanonicalJson(value).slice(0, 32)}`;
}

function assertLocatorExists(locator: ExtractionSourceRefV2, preprocess: PreprocessResult): void {
  if (locator.kind === "image") {
    if (!preprocess.images.some((image) => image.index === locator.image_index)) {
      throw new ExtractionCompositionError();
    }
    return;
  }

  if (locator.kind === "ocr_block") {
    const image = preprocess.images.find((candidate) => candidate.index === locator.image_index);
    if (!image || !image.ocr_blocks[locator.ocr_block_index]) {
      throw new ExtractionCompositionError();
    }
    return;
  }

  const indicators = {
    url: preprocess.indicators.urls,
    repository: preprocess.indicators.repositories,
    package: preprocess.indicators.packages,
    command: preprocess.indicators.commands
  };
  if (!indicators[locator.indicator_kind][locator.indicator_index]) {
    throw new ExtractionCompositionError();
  }
}

function canonicalLocators(
  sourceRefs: ExtractionSourceRefV2[],
  preprocess: PreprocessResult
): ExtractionSourceRefV2[] {
  const locators = new Map<string, ExtractionSourceRefV2>();
  for (const sourceRef of sourceRefs) {
    assertLocatorExists(sourceRef, preprocess);
    locators.set(canonicalJson(sourceRef), sourceRef);
  }
  return [...locators.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, locator]) => locator);
}

function evidenceIds(input: ComposeExtractionResultV2Input, sourceRefs: ExtractionSourceRefV2[]): string[] {
  return canonicalLocators(sourceRefs, input.preprocess).map((locator) => id("ev", {
    capture_id: input.captureId,
    preprocess_artifact_id: input.preprocessArtifactId,
    locator
  }));
}

export function composeExtractionResultV2(input: ComposeExtractionResultV2Input): ExtractionResult {
  if (input.preprocess.capture_id !== input.captureId) {
    throw new ExtractionCompositionError();
  }

  return {
    schema_version: 1,
    capture_id: input.captureId,
    preprocess_artifact_id: input.preprocessArtifactId,
    claims: input.draft.claims.map((claim) => {
      const claimEvidenceIds = evidenceIds(input, claim.source_refs);
      return {
        id: id("clm", {
          capture_id: input.captureId,
          preprocess_artifact_id: input.preprocessArtifactId,
          statement: claim.statement,
          basis: claim.basis,
          confidence: claim.confidence,
          evidence_ids: claimEvidenceIds
        }),
        statement: claim.statement,
        basis: claim.basis,
        confidence: claim.confidence,
        evidence_ids: claimEvidenceIds
      };
    }),
    entities: input.draft.entities,
    experience_fragments: input.draft.experience_fragments.map((fragment) => ({
      title: fragment.title,
      summary: fragment.summary,
      evidence_ids: evidenceIds(input, fragment.source_refs)
    })),
    explicit_urls: input.draft.explicit_urls,
    unresolved_questions: input.draft.unresolved_questions
  };
}
