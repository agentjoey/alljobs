import type { Pool, PoolClient } from "pg";
import { markImportedRetention } from "../automation/retention";
import { analysisJobSchema, reviewPacketSchema } from "../analysis/schemas";
import { canonicalJson, digestCanonicalJson } from "../analysis/digest";
import type { AnalysisJob, ReviewPacket, StageArtifact } from "../analysis/types";
import { captureRecordSchema } from "../domain/schemas";
import type { CaptureStore } from "../storage/contracts";
import type { AnalysisJobStore, StageArtifactStore } from "../workflow/contracts";
import { confirmationFor } from "./confirmations";
import { registryImportManifestSchema, registryJsonValueSchema } from "./schemas";
import type { RegistryLineageEdge, RegistryRecordKind } from "./types";
import { withSerializableRegistryTransaction } from "./postgres/database";
import { PostgresAnalysisJobStore, registryArtifactPayloadSchema } from "./postgres/caphub-stores";

export type ReviewPacketImportErrorCode =
  | "IMPORT_NOT_READY"
  | "IMPORT_ARTIFACT_MISMATCH"
  | "IMPORT_DIGEST_CONFLICT"
  | "IMPORT_UNAVAILABLE";

export class ReviewPacketImportError extends Error {
  constructor(readonly code: ReviewPacketImportErrorCode) {
    super(code);
    this.name = "ReviewPacketImportError";
  }
}

interface ImportRecord {
  id: string;
  kind: RegistryRecordKind;
  version: number;
  payload: unknown;
  digest: string;
  createdAt: string;
}

export interface ReviewPacketImporterDependencies {
  pool: Pool;
  captures: Pick<CaptureStore, "get">;
  jobs: AnalysisJobStore;
  artifacts: StageArtifactStore;
  clock: () => string;
  afterDatabaseCommit?(): Promise<void>;
}

function derivedId(prefix: "ent_" | "clm_" | "ev_" | "cand_" | "rev_" | "imp_" | "rae_", value: unknown): string {
  return `${prefix}${digestCanonicalJson(registryJsonValueSchema.parse(value)).slice(0, 32)}`;
}

function normalizedTimestamp(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
  return parsed.toISOString();
}

async function ensureRecord(client: PoolClient, record: ImportRecord): Promise<void> {
  const payload = registryJsonValueSchema.parse(record.payload);
  if (digestCanonicalJson(payload) !== record.digest) {
    throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
  }
  const existing = await client.query<{
    version: number;
    kind: RegistryRecordKind;
    payload: unknown;
    payload_digest: string;
    created_at: Date | string;
  }>(`
    SELECT v.version, v.kind, v.payload, v.payload_digest, v.created_at
    FROM caphub.registry_records r
    JOIN caphub.registry_versions v
      ON v.record_id = r.record_id AND v.version = r.current_version
    WHERE r.record_id = $1
  `, [record.id]);
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (row.version !== record.version
      || row.kind !== record.kind
      || row.payload_digest !== record.digest
      || canonicalJson(row.payload) !== canonicalJson(payload)
      || normalizedTimestamp(row.created_at) !== normalizedTimestamp(record.createdAt)) {
      throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
    }
    return;
  }
  if (record.version !== 1) throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
  const parent = await client.query<{ kind: RegistryRecordKind }>(
    "SELECT kind FROM caphub.registry_records WHERE record_id = $1 FOR UPDATE",
    [record.id]
  );
  if (parent.rows[0]) throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
  await client.query(`
    INSERT INTO caphub.registry_records
      (record_id, kind, current_version, created_at, updated_at)
    VALUES ($1,$2,1,$3,$3)
  `, [record.id, record.kind, record.createdAt]);
  await client.query(`
    INSERT INTO caphub.registry_versions
      (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
    VALUES ($1,1,$2,1,$3::jsonb,$4,NULL,$5)
  `, [record.id, record.kind, canonicalJson(payload), record.digest, record.createdAt]);
}

async function bindExistingVersions(pool: Pool, records: ImportRecord[]): Promise<void> {
  for (const record of records) {
    const existing = await pool.query<{
      version: number;
      kind: RegistryRecordKind;
      payload: unknown;
      payload_digest: string;
      created_at: Date | string;
    }>(`
      SELECT v.version, v.kind, v.payload, v.payload_digest, v.created_at
      FROM caphub.registry_records r
      JOIN caphub.registry_versions v
        ON v.record_id = r.record_id AND v.version = r.current_version
      WHERE r.record_id = $1
    `, [record.id]);
    const row = existing.rows[0];
    if (!row) continue;
    if (row.kind !== record.kind
      || row.payload_digest !== record.digest
      || canonicalJson(row.payload) !== canonicalJson(registryJsonValueSchema.parse(record.payload))
      || normalizedTimestamp(row.created_at) !== normalizedTimestamp(record.createdAt)) {
      throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
    }
    record.version = row.version;
  }
}

async function ensureLineage(client: PoolClient, edge: RegistryLineageEdge): Promise<void> {
  const inserted = await client.query(`
    INSERT INTO caphub.registry_lineage
      (from_node_id, from_kind, from_version, from_digest, relationship,
       to_node_id, to_kind, to_version, to_digest, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT DO NOTHING
    RETURNING from_node_id
  `, [edge.from_record_id, edge.from_kind, edge.from_version, edge.from_digest, edge.relationship,
    edge.to_record_id, edge.to_kind, edge.to_version, edge.to_digest, edge.created_at]);
  if (inserted.rowCount === 1) return;
  const exact = await client.query<{ from_digest: string; to_digest: string; from_kind: string; to_kind: string }>(`
    SELECT from_digest, to_digest, from_kind, to_kind
    FROM caphub.registry_lineage
    WHERE from_node_id=$1 AND from_version=$2 AND relationship=$3
      AND to_node_id=$4 AND to_version=$5
  `, [edge.from_record_id, edge.from_version, edge.relationship, edge.to_record_id, edge.to_version]);
  const row = exact.rows[0];
  if (!row || row.from_digest !== edge.from_digest || row.to_digest !== edge.to_digest
    || row.from_kind !== edge.from_kind || row.to_kind !== edge.to_kind) {
    throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
  }
}

function edge(from: ImportRecord, relationship: RegistryLineageEdge["relationship"], to: ImportRecord, at: string): RegistryLineageEdge {
  return {
    schema_version: 1,
    from_record_id: from.id,
    from_kind: from.kind,
    from_version: from.version,
    from_digest: from.digest,
    relationship,
    to_record_id: to.id,
    to_kind: to.kind,
    to_version: to.version,
    to_digest: to.digest,
    created_at: at
  };
}

function waitingJob(job: AnalysisJob, requestId: string, at: string): AnalysisJob {
  if (job.status !== "completed" && job.status !== "WAITING_FOR_REVIEW") {
    throw new ReviewPacketImportError("IMPORT_NOT_READY");
  }
  if (job.status === "WAITING_FOR_REVIEW") {
    if (job.review_request_id !== requestId) throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
    return job;
  }
  return analysisJobSchema.parse({
    schema_version: 1,
    id: job.id,
    ...(job.analysis_contract_version ? { analysis_contract_version: job.analysis_contract_version } : {}),
    ...(job.supersedes_job_id ? { supersedes_job_id: job.supersedes_job_id } : {}),
    capture_id: job.capture_id,
    input_digest: job.input_digest,
    completed_artifact_ids: job.completed_artifact_ids,
    status: "WAITING_FOR_REVIEW",
    review_packet_artifact_id: job.review_packet_artifact_id,
    review_request_id: requestId,
    waiting_at: at,
    created_at: job.created_at,
    updated_at: at
  });
}

async function ensureRegistryWaitingJob(
  pool: Pool,
  expected: AnalysisJob
): Promise<void> {
  if (expected.status !== "WAITING_FOR_REVIEW") {
    throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
  }
  const jobs = new PostgresAnalysisJobStore(pool);
  const current = await jobs.get(expected.id);
  if (!current) throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
  if (current.status === "completed") {
    await jobs.put(expected);
    return;
  }
  if (current.status === "WAITING_FOR_REVIEW" && canonicalJson(current) === canonicalJson(expected)) return;
  if (current.status === "reviewed" && current.review_request_id === expected.review_request_id) return;
  throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
}

async function loadPacketArtifacts(
  artifacts: StageArtifactStore,
  job: AnalysisJob
): Promise<{ packet: ReviewPacket; packetArtifact: StageArtifact; artifacts: Array<{ artifact: StageArtifact; payload: unknown }> }> {
  if (job.status !== "completed" && job.status !== "WAITING_FOR_REVIEW") {
    throw new ReviewPacketImportError("IMPORT_NOT_READY");
  }
  const loaded: Array<{ artifact: StageArtifact; payload: unknown }> = [];
  for (const artifactId of job.completed_artifact_ids) {
    const artifact = await artifacts.get(artifactId);
    const payload = await artifacts.readPayload(artifactId);
    if (!artifact || payload === null || artifact.job_id !== job.id || artifact.capture_id !== job.capture_id) {
      throw new ReviewPacketImportError("IMPORT_ARTIFACT_MISMATCH");
    }
    loaded.push({ artifact, payload });
  }
  const packetArtifact = loaded.find(({ artifact }) => artifact.id === job.review_packet_artifact_id)?.artifact;
  const rawPacket = packetArtifact ? await artifacts.readPayload(packetArtifact.id) : null;
  if (!packetArtifact || rawPacket === null) throw new ReviewPacketImportError("IMPORT_ARTIFACT_MISMATCH");
  const packet = reviewPacketSchema.parse(rawPacket);
  const expected = Object.values(packet.stage_artifact_ids).filter((id): id is string => id !== null);
  if (packet.capture_id !== job.capture_id
    || packetArtifact.stage !== "review_packet"
    || expected.some((id) => !loaded.some(({ artifact }) => artifact.id === id))) {
    throw new ReviewPacketImportError("IMPORT_ARTIFACT_MISMATCH");
  }
  return { packet, packetArtifact, artifacts: loaded };
}

function importRecords(
  capture: ReturnType<typeof captureRecordSchema.parse>,
  job: AnalysisJob,
  packet: ReviewPacket,
  loadedArtifacts: Array<{ artifact: StageArtifact; payload: unknown }>,
  identityMode: "packet" | "legacy" = "packet"
): {
  records: ImportRecord[];
  capture: ImportRecord;
  job: ImportRecord;
  packet: ImportRecord;
  artifacts: ImportRecord[];
  entities: ImportRecord[];
  claims: ImportRecord[];
  evidence: ImportRecord[];
  candidate: ImportRecord;
} {
  const captureRecord: ImportRecord = {
    id: capture.id, kind: "capture", version: 1, payload: capture,
    digest: digestCanonicalJson(capture), createdAt: capture.created_at
  };
  const jobRecord: ImportRecord = {
    id: job.id, kind: "analysis_job", version: 1, payload: job,
    digest: digestCanonicalJson(job), createdAt: job.updated_at
  };
  const artifactRecords = loadedArtifacts.map(({ artifact, payload }) => {
    const wrapped = registryArtifactPayloadSchema.parse({ schema_version: 1, artifact, payload });
    return {
      id: artifact.id,
      kind: "analysis_artifact" as const,
      version: 1,
      payload: wrapped,
      digest: digestCanonicalJson(wrapped),
      createdAt: artifact.created_at
    };
  });
  const packetRecord: ImportRecord = {
    id: packet.packet_id, kind: "review_packet", version: 1, payload: packet,
    digest: digestCanonicalJson(packet), createdAt: packet.created_at
  };
  const entities = [...new Map(packet.entities.map((payload) => {
    const record: ImportRecord = {
      id: derivedId("ent_", identityMode === "packet" ? { packet_id: packet.packet_id, payload } : payload), kind: "entity", payload,
      version: 1,
      digest: digestCanonicalJson(payload), createdAt: packet.created_at
    };
    return [record.id, record];
  })).values()];
  const claims = [...new Map(packet.claims.map((payload) => {
    const record: ImportRecord = {
      id: identityMode === "packet" ? derivedId("clm_", { packet_id: packet.packet_id, payload }) : payload.id, kind: "claim", payload,
      version: 1,
      digest: digestCanonicalJson(payload), createdAt: packet.created_at
    };
    return [record.id, record];
  })).values()];
  const evidence = [...new Map(packet.evidence.map((payload) => {
    const record: ImportRecord = {
      id: identityMode === "packet" ? derivedId("ev_", { packet_id: packet.packet_id, payload }) : payload.id, kind: "evidence", payload,
      version: 1,
      digest: digestCanonicalJson(payload), createdAt: packet.created_at
    };
    return [record.id, record];
  })).values()];
  const candidate: ImportRecord = {
    id: derivedId("cand_", identityMode === "packet" ? { packet_id: packet.packet_id, payload: packet.candidate } : packet.candidate), kind: "candidate", version: 1, payload: packet.candidate,
    digest: digestCanonicalJson(packet.candidate), createdAt: packet.created_at
  };
  return {
    records: [captureRecord, jobRecord, ...artifactRecords, packetRecord, ...entities, ...claims, ...evidence, candidate],
    capture: captureRecord,
    job: jobRecord,
    packet: packetRecord,
    artifacts: artifactRecords,
    entities,
    claims,
    evidence,
    candidate
  };
}

export function createReviewPacketImporter(dependencies: ReviewPacketImporterDependencies) {
  return {
    async importReviewPacket({ jobId }: { jobId: string }): Promise<{ requestId: string; job: AnalysisJob }> {
      try {
        const rawJob = await dependencies.jobs.get(jobId);
        if (!rawJob) throw new ReviewPacketImportError("IMPORT_NOT_READY");
        const job = analysisJobSchema.parse(rawJob);
        const { packet, artifacts } = await loadPacketArtifacts(dependencies.artifacts, job);
        const rawCapture = await dependencies.captures.get(job.capture_id);
        if (!rawCapture) throw new ReviewPacketImportError("IMPORT_ARTIFACT_MISMATCH");
        const capture = captureRecordSchema.parse(rawCapture);
        const built = importRecords(capture, job, packet, artifacts);
        const requestId = derivedId("rev_", { candidate: built.candidate.id, digest: built.candidate.digest });
        const importId = derivedId("imp_", { packet: packet.packet_id, digest: built.packet.digest });

        const existing = await dependencies.pool.query<{
          source_review_packet_digest: string;
          review_request_id: string;
          manifest: unknown;
        }>("SELECT source_review_packet_digest, review_request_id, manifest FROM caphub.registry_imports WHERE source_review_packet_id = $1", [packet.packet_id]);
        if (existing.rows[0]) {
          const manifest = registryImportManifestSchema.parse(existing.rows[0].manifest);
          const legacy = importRecords(capture, job, packet, artifacts, "legacy");
          const legacyRequestId = derivedId("rev_", { candidate: legacy.candidate.id, digest: legacy.candidate.digest });
          const storedRequestId = existing.rows[0].review_request_id;
          const expected = storedRequestId === requestId ? built : storedRequestId === legacyRequestId ? legacy : null;
          if (existing.rows[0].source_review_packet_digest !== built.packet.digest
            || !expected || manifest.review_request_id !== storedRequestId
            || [...expected.entities,...expected.claims,...expected.evidence,expected.candidate].some(record => !manifest.records.some(entry =>
              entry.record_id === record.id && entry.kind === record.kind && entry.payload_digest === record.digest))
            || manifest.id !== importId) {
            throw new ReviewPacketImportError("IMPORT_DIGEST_CONFLICT");
          }
          const repaired = waitingJob(job, storedRequestId, manifest.imported_at);
          await markImportedRetention(dependencies.pool, capture.id, new Date(manifest.imported_at));
          await ensureRegistryWaitingJob(dependencies.pool, repaired);
          if (canonicalJson(repaired) !== canonicalJson(job)) await dependencies.jobs.put(repaired);
          return { requestId: storedRequestId, job: repaired };
        }

        await bindExistingVersions(dependencies.pool, built.records);
        const importedAt = dependencies.clock();
        const manifest = registryImportManifestSchema.parse({
          schema_version: 1,
          id: importId,
          source_review_packet_id: packet.packet_id,
          source_review_packet_digest: built.packet.digest,
          records: built.records.map((record) => ({
            record_id: record.id,
            kind: record.kind,
            version: record.version,
            payload_digest: record.digest
          })),
          review_request_id: requestId,
          imported_at: importedAt
        });

        await withSerializableRegistryTransaction(dependencies.pool, async (client) => {
          for (const record of built.records) await ensureRecord(client, record);
          const edges = [
            edge(built.capture, "analyzed_by", built.job, importedAt),
            ...built.artifacts.map((artifact) => edge(built.job, "produced", artifact, importedAt)),
            ...built.artifacts.map((artifact) => edge(artifact, "contributes_to", built.packet, importedAt)),
            edge(built.capture, "derived_as", built.packet, importedAt),
            ...built.entities.map((record) => edge(built.packet, "identifies", record, importedAt)),
            ...built.claims.map((record) => edge(built.packet, "contains", record, importedAt)),
            ...built.evidence.map((record) => edge(built.packet, "contains", record, importedAt)),
            edge(built.packet, "proposes", built.candidate, importedAt)
          ];
          for (const item of edges) await ensureLineage(client, item);

          const request = {
            schema_version: 1 as const,
            id: requestId,
            review_kind: "candidate" as const,
            subject_id: built.candidate.id,
            subject_kind: "candidate" as const,
            subject_version: 1,
            subject_digest: built.candidate.digest,
            lock_version: 1,
            state: "WAITING_FOR_REVIEW" as const,
            approve_confirmation: "",
            reject_confirmation: "",
            superseded_by_request_id: null,
            created_at: importedAt,
            updated_at: importedAt
          };
          request.approve_confirmation = confirmationFor(request, "approve");
          request.reject_confirmation = confirmationFor(request, "reject");
          await client.query(`
            INSERT INTO caphub.review_requests
              (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
               lock_version, state, approve_confirmation, reject_confirmation,
               superseded_by_request_id, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$11)
          `, [request.id, request.review_kind, request.subject_kind, request.subject_id,
            request.subject_version, request.subject_digest, request.lock_version, request.state,
            request.approve_confirmation, request.reject_confirmation, importedAt]);
          await client.query(`
            INSERT INTO caphub.registry_imports
              (import_id, source_review_packet_id, source_review_packet_digest, manifest, review_request_id, imported_at)
            VALUES ($1,$2,$3,$4::jsonb,$5,$6)
          `, [manifest.id, manifest.source_review_packet_id, manifest.source_review_packet_digest,
            canonicalJson(manifest), manifest.review_request_id, manifest.imported_at]);
          await markImportedRetention(client, capture.id, new Date(importedAt));
          const auditId = derivedId("rae_", { import_id: manifest.id, type: "registry.imported" });
          await client.query(`
            INSERT INTO caphub.audit_events
              (event_id, event_type, actor, subject_id, subject_version, decision_id, metadata, occurred_at)
            VALUES ($1,'registry.imported','system:caphub',$2,1,NULL,$3::jsonb,$4)
          `, [auditId, built.packet.id, canonicalJson({ import_id: manifest.id, review_request_id: requestId }), importedAt]);
        });

        const nextJob = waitingJob(job, requestId, importedAt);
        await ensureRegistryWaitingJob(dependencies.pool, nextJob);
        await dependencies.afterDatabaseCommit?.();
        await dependencies.jobs.put(nextJob);
        return { requestId, job: nextJob };
      } catch (error) {
        if (error instanceof ReviewPacketImportError) throw error;
        throw new ReviewPacketImportError("IMPORT_UNAVAILABLE");
      }
    }
  };
}
