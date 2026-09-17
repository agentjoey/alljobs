import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { createProductionAnalysisWorkflow } from "../../lib/caphub/service/production-workflow";
import { createAnalysisService } from "../../lib/caphub/service/analyze";
import type { StructuredProvider, StructuredProviderInput, StructuredProviderOutput } from "../../lib/caphub/providers/contracts";
import type { ResearchSourceGateway } from "../../lib/caphub/research/source-gateway";
import { createReviewPacketImporter } from "../../lib/caphub/registry/import-review-packet";
import {
  PostgresAnalysisJobStore,
  PostgresCaptureStore,
  PostgresModelCallAuditStore,
  PostgresStageArtifactStore
} from "../../lib/caphub/registry/postgres/caphub-stores";
import { LocalCaptureObjectStore } from "../../lib/caphub/storage/local-objects";
import { readCaphubReviewFixture } from "./caphub-review-registry-fixtures";

const NOW = "2026-09-17T12:00:00.000Z";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

class PilotMiniMax implements StructuredProvider {
  readonly provider = "minimax" as const;
  readonly model = "MiniMax-M3";
  calls = 0;

  async invoke(input: StructuredProviderInput): Promise<StructuredProviderOutput> {
    this.calls += 1;
    if (input.kind !== "initial" || input.stage !== "extraction") throw new Error("unexpected fixture MiniMax call");
    const source = input.input as Record<string, unknown>;
    const preprocess = source.preprocess as { capture_id: string };
    return {
      value: {
        schema_version: 1,
        capture_id: preprocess.capture_id,
        preprocess_artifact_id: source.preprocess_artifact_id,
        claims: [{
          id: `clm_${digest("production-pilot:claim").slice(0, 32)}`,
          statement: "Pilot Capability provides bounded third-party capability metadata.",
          basis: "visible",
          confidence: 0.9,
          evidence_ids: [`ev_${digest("production-pilot:screenshot").slice(0, 32)}`]
        }],
        entities: [{ name: "Pilot Capability", aliases: ["Pilot"] }],
        experience_fragments: [],
        explicit_urls: ["https://docs.example.com/pilot-capability"],
        unresolved_questions: []
      },
      usage: { inputTokens: 10, outputTokens: 10 }
    };
  }
}

class PilotKimi implements StructuredProvider {
  readonly provider = "kimi" as const;
  readonly model = "k3-256k";
  calls = 0;

  async invoke(input: StructuredProviderInput): Promise<StructuredProviderOutput> {
    this.calls += 1;
    if (input.kind !== "initial") throw new Error("unexpected fixture Kimi correction");
    const source = input.input as Record<string, unknown>;
    if (input.stage === "research") {
      const extraction = source.extraction as { capture_id: string; claims: Array<{ id: string }> };
      const evidence = source.evidence as Array<{ id: string; content?: string }>;
      const evidenceRecords = evidence.map(({ content: _content, ...record }) => record);
      return {
        value: {
          schema_version: 1,
          capture_id: extraction.capture_id,
          extraction_artifact_id: source.extraction_artifact_id,
          identity: { status: "confirmed", entity_id: "ent_pilot-capability", evidence_ids: [evidence[0]!.id] },
          evidence: evidenceRecords,
          claim_checks: extraction.claims.map((claim) => ({
            claim_id: claim.id,
            status: "corroborated",
            evidence_ids: [evidence[0]!.id]
          })),
          current_availability: "available",
          version: "1.0",
          maintenance_status: "maintained",
          install_methods: [],
          agent_protocol_support: [],
          authentication: [],
          pricing: "not evaluated",
          data_destinations: [],
          permissions: [],
          license: "MIT",
          security_findings: [],
          researched_at: NOW
        },
        usage: { inputTokens: 10, outputTokens: 10 }
      };
    }
    if (input.stage !== "assessment") throw new Error("unexpected fixture Kimi stage");
    const dossier = source.dossier as { capture_id: string; evidence: Array<{ id: string }> };
    const evidenceId = dossier.evidence[0]!.id;
    const dimension = { score: 3, reason: "Fixture evidence supports bounded adoption.", evidence_ids: [evidenceId] };
    return {
      value: {
        schema_version: 1,
        capture_id: dossier.capture_id,
        dossier_artifact_id: source.dossier_artifact_id,
        candidate: {
          name: "Pilot Capability",
          novel_capabilities: ["Third-party capability metadata"],
          overlapping_capabilities: [],
          replaces: [],
          complements: ["Caphub review"],
          conflicts_with: [],
          capability_gaps: []
        },
        alternatives: [],
        dimensions: {
          personal_fit: dimension,
          capability_value: dimension,
          evidence_confidence: dimension,
          novelty: dimension,
          reusability: dimension,
          portability: dimension,
          maturity: dimension,
          maintenance_burden: dimension,
          security_risk: { ...dimension, score: 2 },
          adoption_cost: dimension
        },
        conflicts: [],
        disposition: "adopt",
        disposition_reason: "Use the reviewed third-party capability metadata without installation.",
        resident_capability: false,
        unresolved_questions: [],
        assessed_at: NOW
      },
      usage: { inputTokens: 10, outputTokens: 10 }
    };
  }
}

function pilotSourceGateway(): ResearchSourceGateway {
  return {
    async search() {
      return [{
        url: "https://docs.example.com/pilot-capability",
        title: "Pilot Capability official documentation",
        sourceKind: "official" as const,
        claims: ["Documents the bounded capability metadata."]
      }];
    },
    async fetch(url) {
      const text = "Pilot Capability is fixture documentation licensed under MIT.";
      return {
        url,
        status: 200,
        contentType: "text/plain",
        text,
        compressedBytes: Buffer.byteLength(text),
        decompressedBytes: Buffer.byteLength(text),
        redirects: 0
      };
    }
  };
}

async function main(): Promise<void> {
  const captureId = process.argv[2];
  if (!captureId || !/^cap_[a-f0-9]{32}$/.test(captureId)) throw new Error("valid Capture ID required");
  const fixture = readCaphubReviewFixture();
  const state = JSON.parse(readFileSync(fixture.statePath, "utf8")) as { socketDir: string; port: number };
  const pool = new Pool({
    host: state.socketDir,
    port: state.port,
    user: "caphub_test",
    database: "postgres",
    ssl: false,
    max: 2,
    application_name: "caphub_production_pilot_analysis"
  });
  try {
    const captures = new PostgresCaptureStore(pool);
    const jobs = new PostgresAnalysisJobStore(pool);
    const artifacts = new PostgresStageArtifactStore(pool);
    const miniMax = new PilotMiniMax();
    const kimi = new PilotKimi();
    const analysis = createAnalysisService({
      config: { caphubEnabled: true, analysisEnabled: true },
      captures,
      readObject: async (capture) => new LocalCaptureObjectStore(fixture.stateDir).readImmutable(capture.object),
      preprocessDependencies: {
        recognizeText: async () => [{
          page: 0,
          text: "Pilot Capability",
          confidence: 0.99,
          bbox: { x: 0, y: 0, width: 1, height: 1 }
        }],
        decodeBarcodes: async () => []
      },
      extractionProvider: miniMax,
      researchProvider: kimi,
      assessmentProvider: kimi,
      criticProvider: miniMax,
      sourceGateway: pilotSourceGateway,
      jobs,
      artifacts,
      audits: new PostgresModelCallAuditStore(pool),
      clock: () => new Date(NOW)
    });
    const importer = createReviewPacketImporter({ pool, captures, jobs, artifacts, clock: () => NOW });
    const workflow = createProductionAnalysisWorkflow({ analysis, importer });
    const first = await workflow.startAndImport(captureId);
    const second = await workflow.startAndImport(captureId);
    const request = await pool.query<{ subject_id: string }>(
      "SELECT subject_id FROM caphub.review_requests WHERE request_id=$1",
      [first.reviewRequestId]
    );
    const job = await jobs.get(first.jobId);
    if (!request.rows[0]) throw new Error(`pilot Candidate review is unavailable: ${JSON.stringify({
      first,
      second,
      job,
      providerCalls: { minimax: miniMax.calls, kimi: kimi.calls }
    })}`);
    process.stdout.write(`${JSON.stringify({
      first,
      second,
      candidateId: request.rows[0].subject_id,
      providerCalls: { minimax: miniMax.calls, kimi: kimi.calls }
    })}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : "pilot analysis failed"}\n`);
  process.exitCode = 1;
});
