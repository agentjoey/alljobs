import { createHash } from "node:crypto";
import { canonicalJson, digestCanonicalJson } from "../analysis/digest";
import { researchDossierSchema } from "../analysis/schemas";
import type { EvidenceRecord, ExtractionResult, ResearchDossier } from "../analysis/types";
import type { StructuredProviderOutput } from "../providers/contracts";
import {
  ResearchSourceError,
  type ResearchSearchRequest,
  type ResearchSourceGateway,
  type SourceCandidate,
  type SourceKind
} from "./source-gateway";

export interface ResearchInvocationOptions {
  inputDigest: string;
  signal: AbortSignal;
}

export interface ResearchWorker {
  research(input: unknown, options: ResearchInvocationOptions): Promise<StructuredProviderOutput>;
}

export class ResearchDossierError extends Error {
  constructor(readonly code: "RESEARCH_EVIDENCE_REQUIRED" | "RESEARCH_INVALID_OUTPUT", options?: ErrorOptions) {
    super(code, options);
    this.name = "ResearchDossierError";
  }
}

function tierFor(kind: SourceKind): EvidenceRecord["tier"] {
  if (kind === "official" || kind === "repository") return "A";
  if (kind === "package" || kind === "reputable") return "B";
  if (kind === "community") return "C";
  return "D";
}

function evidenceId(seed: unknown): string {
  return `ev_${digestCanonicalJson(seed).slice(0, 32)}`;
}

function entityId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  return `ent_${slug || createHash("sha256").update(name).digest("hex").slice(0, 16)}`;
}

function fallbackIdentity(extraction: ExtractionResult, evidence: EvidenceRecord[]) {
  const cited = evidence[0]?.id;
  if (!cited) throw new ResearchDossierError("RESEARCH_EVIDENCE_REQUIRED");
  const names = [...new Set(extraction.entities.map((entity) => entity.name))].slice(0, 2);
  while (names.length < 2) names.push(`Unresolved alternative ${names.length + 1}`);
  return {
    status: "IDENTITY_AMBIGUOUS" as const,
    candidates: names.map((name) => ({
      entity_id: entityId(name),
      name,
      confidence: 0,
      evidence_ids: [cited]
    })),
    reason: "Insufficient unambiguous A/B identity evidence."
  };
}

function normalizeIdentity(
  proposed: unknown,
  extraction: ExtractionResult,
  evidence: EvidenceRecord[]
) {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  if (proposed && typeof proposed === "object" && !Array.isArray(proposed)) {
    const record = proposed as Record<string, unknown>;
    if (record.status === "confirmed" && Array.isArray(record.evidence_ids)) {
      const ids = record.evidence_ids.filter((id): id is string => typeof id === "string");
      const matchedEntities = extraction.entities.filter((entity) => entityId(entity.name) === record.entity_id);
      if (ids.length > 0 && ids.every((id) => byId.has(id)) && ids.some((id) => {
        const tier = byId.get(id)?.tier;
        return tier === "A" || tier === "B";
      }) && matchedEntities.length === 1) {
        return proposed;
      }
    }
    if (record.status === "IDENTITY_AMBIGUOUS" && Array.isArray(record.candidates)
      && record.candidates.length >= 2
      && record.candidates.every((candidate) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
        const ids = (candidate as Record<string, unknown>).evidence_ids;
        return Array.isArray(ids) && ids.length > 0
          && ids.every((id) => typeof id === "string" && byId.has(id));
      })) {
      return proposed;
    }
  }
  return fallbackIdentity(extraction, evidence);
}

function normalizeClaimChecks(
  proposed: unknown,
  extraction: ExtractionResult,
  evidence: EvidenceRecord[]
) {
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const fallbackEvidenceIds = evidence[0] ? [evidence[0].id] : [];
  const checks = Array.isArray(proposed) ? proposed : [];
  return extraction.claims.map((claim) => {
    const matches = checks.filter((candidate) => candidate
      && typeof candidate === "object"
      && !Array.isArray(candidate)
      && (candidate as Record<string, unknown>).claim_id === claim.id);
    if (matches.length !== 1) {
      return { claim_id: claim.id, status: "unverified" as const, evidence_ids: fallbackEvidenceIds };
    }
    const candidate = matches[0] as Record<string, unknown>;
    const cited = Array.isArray(candidate.evidence_ids)
      ? [...new Set(candidate.evidence_ids.filter((id): id is string => typeof id === "string" && evidenceIds.has(id)))]
      : [];
    const status = candidate.status;
    if ((status !== "corroborated" && status !== "contradicted" && status !== "unverified")
      || (status !== "unverified" && cited.length === 0)) {
      return { claim_id: claim.id, status: "unverified" as const, evidence_ids: fallbackEvidenceIds };
    }
    return { claim_id: claim.id, status: status as "corroborated" | "contradicted" | "unverified",
      evidence_ids: cited.length > 0 ? cited : fallbackEvidenceIds };
  });
}

function searchRequestFor(extraction: ExtractionResult): ResearchSearchRequest {
  const entities = [...new Set(extraction.entities.flatMap((entity) => [entity.name, ...entity.aliases]))].slice(0, 12);
  const entityDomains = [...new Set(extraction.entities.flatMap((entity) => entity.domain
    ? [entity.domain.toLowerCase()]
    : []))].slice(0, 8);
  return {
    query: canonicalJson({
      entities,
      claims: extraction.claims.slice(0, 24).map((claim) => claim.statement),
      unresolved_questions: extraction.unresolved_questions.slice(0, 16)
    }),
    entityDomains
  };
}

export async function buildResearchDossier(options: {
  extraction: ExtractionResult;
  extractionArtifactId: string;
  gateway: ResearchSourceGateway;
  worker: ResearchWorker;
  clock: () => string;
  signal: AbortSignal;
}): Promise<ResearchDossier> {
  const candidates: SourceCandidate[] = [];
  try {
    candidates.push(...await options.gateway.search(searchRequestFor(options.extraction), options.signal));
  } catch (error) {
    if (!(error instanceof ResearchSourceError) || error.code !== "SOURCE_ACCESS_DISABLED") throw error;
  }
  for (const url of options.extraction.explicit_urls) {
    if (!candidates.some((candidate) => candidate.url === url)) {
      candidates.push({ url, title: new URL(url).hostname, sourceKind: "unknown", claims: ["Explicit capture URL"] });
    }
  }

  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].slice(0, 8);
  const modelEvidence: Array<EvidenceRecord & { content: string }> = [];
  for (const candidate of uniqueCandidates) {
    let sourceUrl = candidate.url;
    let content = candidate.content?.trim();
    if (!content) {
      try {
        const fetched = await options.gateway.fetch(candidate.url, options.signal);
        sourceUrl = fetched.url;
        content = fetched.text;
      } catch (error) {
        if (error instanceof ResearchSourceError
          && (error.code === "SOURCE_ACCESS_DISABLED" || error.code === "SOURCE_BLOCKED")) {
          continue;
        }
        throw error;
      }
    }
    const claims = candidate.claims.filter((claim) => claim.trim().length > 0);
    const contentDigest = createHash("sha256").update(content, "utf8").digest("hex");
    const record: EvidenceRecord = {
      id: evidenceId({ url: sourceUrl, contentDigest, claims }),
      tier: tierFor(candidate.sourceKind),
      source_url: sourceUrl,
      title: candidate.title,
      checked_at: options.clock(),
      content_digest: contentDigest,
      claims: claims.length > 0 ? claims : [candidate.title]
    };
    modelEvidence.push({ ...record, content });
  }
  if (modelEvidence.length === 0) throw new ResearchDossierError("RESEARCH_EVIDENCE_REQUIRED");

  const workerInput = {
    schema_version: 1,
    extraction: options.extraction,
    extraction_artifact_id: options.extractionArtifactId,
    evidence: modelEvidence
  };
  const generated = await options.worker.research(workerInput, {
    inputDigest: digestCanonicalJson(workerInput),
    signal: options.signal
  });
  if (!generated.value || typeof generated.value !== "object" || Array.isArray(generated.value)) {
    throw new ResearchDossierError("RESEARCH_INVALID_OUTPUT");
  }
  const proposed = generated.value as Record<string, unknown>;
  const records = modelEvidence.map(({ content: _content, ...record }) => record);
  try {
    const dossier = researchDossierSchema.parse({
      ...proposed,
      schema_version: 1,
      capture_id: options.extraction.capture_id,
      extraction_artifact_id: options.extractionArtifactId,
      identity: normalizeIdentity(proposed.identity, options.extraction, records),
      evidence: records,
      claim_checks: normalizeClaimChecks(proposed.claim_checks, options.extraction, records),
      researched_at: options.clock()
    });
    const expectedClaimIds = new Set(options.extraction.claims.map((claim) => claim.id));
    const checkedClaimIds = dossier.claim_checks.map((check) => check.claim_id);
    if (checkedClaimIds.length !== expectedClaimIds.size
      || new Set(checkedClaimIds).size !== checkedClaimIds.length
      || checkedClaimIds.some((claimId) => !expectedClaimIds.has(claimId))) {
      throw new ResearchDossierError("RESEARCH_INVALID_OUTPUT");
    }
    return dossier;
  } catch (error) {
    if (error instanceof ResearchDossierError) throw error;
    throw new ResearchDossierError("RESEARCH_INVALID_OUTPUT", { cause: error });
  }
}
