import "server-only";

import type { Pool } from "pg";
import { z } from "zod";
import { reviewDecisionSchema, reviewRequestIdSchema, reviewRequestSchema } from "./schemas";
import type { ReviewDecision, ReviewRequest } from "./types";
import { diffRegistryVersions, type RegistryDiffEntry } from "./diff";

export class RegistryReadError extends Error {
  constructor(readonly code: "REGISTRY_UNAVAILABLE" | "INVALID_QUERY") {
    super(code === "REGISTRY_UNAVAILABLE" ? "Registry is unavailable" : "Registry query is invalid");
    this.name = "RegistryReadError";
  }
}

const reviewQueueInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(25),
  cursor: reviewRequestIdSchema.nullable().default(null),
  reviewKind: z.enum(["candidate", "build", "implementation", "release", "update"]).nullable().default(null),
  state: z.enum(["WAITING_FOR_REVIEW", "APPROVED", "REJECTED", "REVOKED", "SUPERSEDED"])
    .nullable().default(null),
  valueBand: z.enum(["high", "medium", "low", "unknown"]).nullable().default(null),
  riskBand: z.enum(["high", "medium", "low", "unknown"]).nullable().default(null),
  waitingAgeBand: z.enum(["fresh", "aging", "overdue"]).nullable().default(null)
}).strict();

export type ReviewQueueInput = z.input<typeof reviewQueueInputSchema>;

interface QueueRow {
  request_id: string;
  review_kind: ReviewRequest["review_kind"];
  subject_kind: ReviewRequest["subject_kind"];
  subject_id: string;
  subject_version: number;
  subject_digest: string;
  lock_version: number;
  state: ReviewRequest["state"];
  created_at: Date | string;
  updated_at: Date | string;
  candidate_payload: unknown;
  packet_payload: unknown | null;
  waiting_age_hours: number | string;
}

interface DetailRow extends QueueRow {
  approve_confirmation: string;
  reject_confirmation: string;
  superseded_by_request_id: string | null;
  previous_payload: unknown | null;
}

interface DecisionRow {
  decision: unknown;
  consumer_id: string | null;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function candidateDto(value: unknown) {
  const candidate = asObject(value);
  return {
    name: typeof candidate.name === "string" ? candidate.name : "Unnamed candidate",
    novelCapabilities: strings(candidate.novel_capabilities),
    overlappingCapabilities: strings(candidate.overlapping_capabilities),
    replaces: strings(candidate.replaces),
    complements: strings(candidate.complements),
    conflictsWith: strings(candidate.conflicts_with),
    capabilityGaps: strings(candidate.capability_gaps)
  };
}

function evidenceDto(value: unknown) {
  const item = asObject(value);
  return {
    id: String(item.id ?? ""),
    tier: String(item.tier ?? ""),
    sourceUrl: String(item.source_url ?? ""),
    title: String(item.title ?? ""),
    checkedAt: String(item.checked_at ?? ""),
    contentDigest: String(item.content_digest ?? ""),
    claims: strings(item.claims)
  };
}

function claimDto(value: unknown) {
  const item = asObject(value);
  return {
    id: String(item.id ?? ""),
    statement: String(item.statement ?? ""),
    basis: String(item.basis ?? ""),
    confidence: typeof item.confidence === "number" ? item.confidence : 0,
    evidenceIds: strings(item.evidence_ids)
  };
}

function dimensionDto(value: unknown) {
  const dimension = asObject(value);
  return {
    score: typeof dimension.score === "number" ? dimension.score : null,
    reason: String(dimension.reason ?? ""),
    evidenceIds: strings(dimension.evidence_ids)
  };
}

function packetDto(value: unknown) {
  const packet = asObject(value);
  const dimensions = asObject(packet.dimensions);
  const critic = packet.critic === null ? null : asObject(packet.critic);
  const identity = asObject(packet.identity);
  return {
    packetId: String(packet.packet_id ?? ""),
    ocr: Array.isArray(packet.ocr) ? packet.ocr.map((raw) => {
      const block = asObject(raw);
      return { imageIndex: Number(block.image_index ?? 0), text: String(block.text ?? "") };
    }).sort((left, right) => left.imageIndex - right.imageIndex) : [],
    screenshots: Array.isArray(packet.screenshots) ? packet.screenshots.map((raw) => {
      const screenshot = asObject(raw);
      const object = asObject(screenshot.object);
      return {
        order: Number(screenshot.order ?? 0),
        digest: String(object.digest ?? ""),
        bytes: Number(object.bytes ?? 0)
      };
    }).sort((left, right) => left.order - right.order) : [],
    evidence: Array.isArray(packet.evidence) ? packet.evidence.map(evidenceDto)
      .sort((left, right) => left.id.localeCompare(right.id)) : [],
    claims: Array.isArray(packet.claims) ? packet.claims.map(claimDto)
      .sort((left, right) => left.id.localeCompare(right.id)) : [],
    entities: Array.isArray(packet.entities) ? packet.entities.map((raw) => {
      const entity = asObject(raw);
      return { name: String(entity.name ?? ""), aliases: strings(entity.aliases) };
    }) : [],
    identity: identity.status === "confirmed" ? {
      status: "confirmed" as const,
      entityId: String(identity.entity_id ?? ""),
      evidenceIds: strings(identity.evidence_ids),
      reason: null,
      candidates: []
    } : {
      status: "IDENTITY_AMBIGUOUS" as const,
      entityId: null,
      evidenceIds: [],
      reason: String(identity.reason ?? "Identity evidence was not resolved."),
      candidates: Array.isArray(identity.candidates) ? identity.candidates.map((raw) => {
        const candidate = asObject(raw);
        return {
          name: String(candidate.name ?? ""),
          confidence: typeof candidate.confidence === "number" ? candidate.confidence : 0,
          evidenceIds: strings(candidate.evidence_ids)
        };
      }) : []
    },
    conflicts: Array.isArray(packet.conflicts) ? packet.conflicts.map((raw) => {
      const conflict = asObject(raw);
      return { summary: String(conflict.summary ?? ""), evidenceIds: strings(conflict.evidence_ids) };
    }) : [],
    unresolvedQuestions: strings(packet.unresolved_questions),
    alternatives: Array.isArray(packet.alternatives) ? packet.alternatives.map((raw) => {
      const alternative = asObject(raw);
      return {
        rank: Number(alternative.rank ?? 0),
        name: String(alternative.name ?? ""),
        reason: String(alternative.reason ?? ""),
        evidenceIds: strings(alternative.evidence_ids)
      };
    }).sort((left, right) => left.rank - right.rank) : [],
    dimensions: {
      capabilityValue: dimensionDto(dimensions.capability_value),
      securityRisk: dimensionDto(dimensions.security_risk),
      evidenceConfidence: dimensionDto(dimensions.evidence_confidence)
    },
    evidenceConfidence: typeof asObject(dimensions.evidence_confidence).score === "number"
      ? Number(asObject(dimensions.evidence_confidence).score) : null,
    recommendedDisposition: typeof packet.recommended_disposition === "string"
      ? packet.recommended_disposition : null,
    critic: critic ? {
      verdict: String(critic.verdict ?? ""),
      unresolvedQuestions: strings(critic.unresolved_questions)
    } : null,
    createdAt: String(packet.created_at ?? "")
  };
}

function requestDto(row: QueueRow) {
  return {
    id: row.request_id,
    reviewKind: row.review_kind,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    subjectVersion: row.subject_version,
    subjectDigest: row.subject_digest,
    lockVersion: row.lock_version,
    state: row.state,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function decisionDto(decision: ReviewDecision | null, consumerId: string | null) {
  if (!decision) return { decision: null, authority: null };
  return {
    decision: {
      id: decision.id,
      action: decision.action,
      disposition: decision.disposition ?? null,
      rationale: decision.rationale,
      actor: decision.actor,
      recordedAt: decision.recorded_at,
      revokesDecisionId: decision.revokes_decision_id
    },
    authority: decision.action === "approve" ? (consumerId
      ? { state: "consumed" as const, consumedBy: consumerId, revocable: false }
      : { state: "unconsumed" as const, consumedBy: null, revocable: true }) : null
  };
}

async function latestDecision(pool: Pool, requestId: string): Promise<ReturnType<typeof decisionDto>> {
  const result = await pool.query<DecisionRow>(`
    SELECT to_jsonb(d.*) AS decision, c.consumer_id
    FROM caphub.review_decisions d
    LEFT JOIN caphub.decision_consumers c ON c.decision_id = d.decision_id
    WHERE d.request_id = $1
    ORDER BY d.recorded_at DESC, d.decision_id DESC
    LIMIT 1
  `, [requestId]);
  if (!result.rows[0]) return decisionDto(null, null);
  const row = result.rows[0];
  const raw = asObject(row.decision);
  const decision = reviewDecisionSchema.parse({
    schema_version: 1,
    id: raw.decision_id,
    request_id: raw.request_id,
    idempotency_key: raw.idempotency_key,
    expected_lock_version: raw.expected_lock_version,
    expected_subject_digest: raw.expected_subject_digest,
    action: raw.action,
    confirmation: raw.confirmation,
    rationale: raw.rationale,
    ...(raw.disposition ? { disposition: raw.disposition } : {}),
    review_kind: raw.review_kind,
    subject_id: raw.subject_id,
    subject_version: raw.subject_version,
    subject_digest: raw.subject_digest,
    actor: raw.actor,
    confirmation_digest: raw.confirmation_digest,
    original_approval_decision_id: raw.original_approval_decision_id,
    revokes_decision_id: raw.revokes_decision_id,
    recorded_at: iso(raw.recorded_at as string)
  });
  return decisionDto(decision, row.consumer_id);
}

async function decisionTimeline(pool: Pool, requestId: string) {
  const result = await pool.query<DecisionRow>(`
    SELECT to_jsonb(d.*) AS decision, c.consumer_id
    FROM caphub.review_decisions d
    LEFT JOIN caphub.decision_consumers c ON c.decision_id = d.decision_id
    WHERE d.request_id = $1
    ORDER BY d.recorded_at DESC, d.decision_id DESC
    LIMIT 100
  `, [requestId]);
  return result.rows.map((row) => {
    const raw = asObject(row.decision);
    const decision = reviewDecisionSchema.parse({
      schema_version: 1,
      id: raw.decision_id,
      request_id: raw.request_id,
      idempotency_key: raw.idempotency_key,
      expected_lock_version: raw.expected_lock_version,
      expected_subject_digest: raw.expected_subject_digest,
      action: raw.action,
      confirmation: raw.confirmation,
      rationale: raw.rationale,
      ...(raw.disposition ? { disposition: raw.disposition } : {}),
      review_kind: raw.review_kind,
      subject_id: raw.subject_id,
      subject_version: raw.subject_version,
      subject_digest: raw.subject_digest,
      actor: raw.actor,
      confirmation_digest: raw.confirmation_digest,
      original_approval_decision_id: raw.original_approval_decision_id,
      revokes_decision_id: raw.revokes_decision_id,
      recorded_at: iso(raw.recorded_at as string)
    });
    return decisionDto(decision, row.consumer_id).decision!;
  });
}

export function createRegistryQueries(pool: Pool) {
  return {
    async getReviewQueue(input: ReviewQueueInput = {}) {
      const parsed = reviewQueueInputSchema.safeParse(input);
      if (!parsed.success) throw new RegistryReadError("INVALID_QUERY");
      try {
        const result = await pool.query<QueueRow>(`
          SELECT q.request_id, q.review_kind, q.subject_kind, q.subject_id, q.subject_version,
                 q.subject_digest, q.lock_version, q.state, q.created_at, q.updated_at,
                 GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - q.created_at)) / 3600) AS waiting_age_hours,
                 candidate.payload AS candidate_payload, packet.payload AS packet_payload
          FROM caphub.review_requests q
          JOIN caphub.registry_versions candidate
            ON candidate.record_id = q.subject_id AND candidate.version = q.subject_version
          LEFT JOIN caphub.registry_lineage proposed
            ON proposed.to_node_id = q.subject_id AND proposed.to_version = q.subject_version
           AND proposed.relationship = 'proposes'
          LEFT JOIN caphub.registry_versions packet
            ON packet.record_id = proposed.from_node_id AND packet.version = proposed.from_version
          WHERE ($1::text IS NULL OR q.state = $1)
            AND ($2::text IS NULL OR q.review_kind = $2)
            AND ($3::text IS NULL OR CASE $3
              WHEN 'high' THEN NULLIF(packet.payload #>> '{dimensions,capability_value,score}', '')::int >= 4
              WHEN 'medium' THEN NULLIF(packet.payload #>> '{dimensions,capability_value,score}', '')::int BETWEEN 2 AND 3
              WHEN 'low' THEN NULLIF(packet.payload #>> '{dimensions,capability_value,score}', '')::int BETWEEN 0 AND 1
              WHEN 'unknown' THEN packet.payload #>> '{dimensions,capability_value,score}' IS NULL
              ELSE FALSE END)
            AND ($4::text IS NULL OR CASE $4
              WHEN 'high' THEN NULLIF(packet.payload #>> '{dimensions,security_risk,score}', '')::int >= 4
              WHEN 'medium' THEN NULLIF(packet.payload #>> '{dimensions,security_risk,score}', '')::int BETWEEN 2 AND 3
              WHEN 'low' THEN NULLIF(packet.payload #>> '{dimensions,security_risk,score}', '')::int BETWEEN 0 AND 1
              WHEN 'unknown' THEN packet.payload #>> '{dimensions,security_risk,score}' IS NULL
              ELSE FALSE END)
            AND ($5::text IS NULL OR CASE $5
              WHEN 'fresh' THEN CURRENT_TIMESTAMP - q.created_at <= INTERVAL '24 hours'
              WHEN 'aging' THEN CURRENT_TIMESTAMP - q.created_at > INTERVAL '24 hours'
                AND CURRENT_TIMESTAMP - q.created_at <= INTERVAL '7 days'
              WHEN 'overdue' THEN CURRENT_TIMESTAMP - q.created_at > INTERVAL '7 days'
              ELSE FALSE END)
            AND ($6::text IS NULL OR (
              q.created_at,
              -COALESCE(NULLIF(packet.payload #>> '{dimensions,security_risk,score}', '')::int, -1),
              q.request_id
            ) > (
              SELECT cursor_q.created_at,
                -COALESCE(NULLIF(cursor_packet.payload #>> '{dimensions,security_risk,score}', '')::int, -1),
                cursor_q.request_id
              FROM caphub.review_requests cursor_q
              LEFT JOIN caphub.registry_lineage cursor_proposed
                ON cursor_proposed.to_node_id = cursor_q.subject_id
               AND cursor_proposed.to_version = cursor_q.subject_version
               AND cursor_proposed.relationship = 'proposes'
              LEFT JOIN caphub.registry_versions cursor_packet
                ON cursor_packet.record_id = cursor_proposed.from_node_id
               AND cursor_packet.version = cursor_proposed.from_version
              WHERE cursor_q.request_id = $6
            ))
          ORDER BY q.created_at,
            NULLIF(packet.payload #>> '{dimensions,security_risk,score}', '')::int DESC NULLS LAST,
            q.request_id
          LIMIT $7
        `, [parsed.data.state, parsed.data.reviewKind, parsed.data.valueBand,
          parsed.data.riskBand, parsed.data.waitingAgeBand, parsed.data.cursor, parsed.data.limit]);
        const items = result.rows.map((row) => {
          const packet = packetDto(row.packet_payload);
          const waitingAgeHours = Number(row.waiting_age_hours ?? 0);
          return {
            request: requestDto(row),
            candidate: candidateDto(row.candidate_payload),
            evidenceConfidence: packet.evidenceConfidence,
            unresolvedCount: packet.unresolvedQuestions.length,
            recommendedDisposition: packet.recommendedDisposition,
            identityStatus: packet.identity.status,
            valueScore: packet.dimensions.capabilityValue.score,
            riskScore: packet.dimensions.securityRisk.score,
            waitingSince: iso(row.created_at),
            waitingAgeHours,
            waitingAgeBand: waitingAgeHours > 168 ? "overdue" as const
              : waitingAgeHours > 24 ? "aging" as const : "fresh" as const
          };
        });
        return {
          kind: "ready" as const,
          items,
          nextCursor: items.length === parsed.data.limit ? items.at(-1)!.request.id : null,
          appliedFilters: {
            reviewKind: parsed.data.reviewKind,
            state: parsed.data.state,
            valueBand: parsed.data.valueBand,
            riskBand: parsed.data.riskBand,
            waitingAgeBand: parsed.data.waitingAgeBand,
            cursor: parsed.data.cursor
          },
          pageSize: parsed.data.limit
        };
      } catch (error) {
        if (error instanceof RegistryReadError) throw error;
        throw new RegistryReadError("REGISTRY_UNAVAILABLE");
      }
    },

    async getReviewDetail(requestId: string) {
      if (!reviewRequestIdSchema.safeParse(requestId).success) throw new RegistryReadError("INVALID_QUERY");
      try {
        const result = await pool.query<DetailRow>(`
          SELECT q.*, candidate.payload AS candidate_payload, previous.payload AS previous_payload,
                 packet.payload AS packet_payload
          FROM caphub.review_requests q
          JOIN caphub.registry_versions candidate
            ON candidate.record_id = q.subject_id AND candidate.version = q.subject_version
          LEFT JOIN caphub.registry_versions previous
            ON previous.record_id = q.subject_id AND previous.version = q.subject_version - 1
          LEFT JOIN caphub.registry_lineage proposed
            ON proposed.to_node_id = q.subject_id AND proposed.to_version = q.subject_version
           AND proposed.relationship = 'proposes'
          LEFT JOIN caphub.registry_versions packet
            ON packet.record_id = proposed.from_node_id AND packet.version = proposed.from_version
          WHERE q.request_id = $1
        `, [requestId]);
        if (!result.rows[0]) return { kind: "not_found" as const };
        const row = result.rows[0];
        const request = reviewRequestSchema.parse({
          schema_version: 1,
          id: row.request_id,
          review_kind: row.review_kind,
          subject_id: row.subject_id,
          subject_kind: row.subject_kind,
          subject_version: row.subject_version,
          subject_digest: row.subject_digest,
          lock_version: row.lock_version,
          state: row.state,
          approve_confirmation: row.approve_confirmation,
          reject_confirmation: row.reject_confirmation,
          superseded_by_request_id: row.superseded_by_request_id,
          created_at: iso(row.created_at),
          updated_at: iso(row.updated_at)
        });
        const terminal = await latestDecision(pool, requestId);
        return {
          kind: "found" as const,
          request: {
            ...requestDto(row),
            approveConfirmation: request.approve_confirmation,
            rejectConfirmation: request.reject_confirmation,
            supersededByRequestId: request.superseded_by_request_id
          },
          candidate: candidateDto(row.candidate_payload),
          packet: packetDto(row.packet_payload),
          diff: diffRegistryVersions(row.previous_payload as never, row.candidate_payload as never),
          ...terminal
        };
      } catch (error) {
        if (error instanceof RegistryReadError) throw error;
        throw new RegistryReadError("REGISTRY_UNAVAILABLE");
      }
    },

    async getCaptureDetail(captureId: string) {
      try {
        const captureResult = await pool.query<{ payload: unknown }>(`
          SELECT v.payload FROM caphub.registry_records r
          JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
          WHERE r.record_id=$1 AND r.kind='capture'
        `, [captureId]);
        if (!captureResult.rows[0]) return { kind: "not_found" as const };
        const capture = asObject(captureResult.rows[0].payload);
        const object = asObject(capture.object);
        const related = await pool.query<{
          job_payload: unknown | null;
          packet_payload: unknown | null;
          packet_version: number | null;
          packet_digest: string | null;
        }>(`
          SELECT job.payload AS job_payload, packet.payload AS packet_payload,
                 packet.version AS packet_version, packet.payload_digest AS packet_digest
          FROM caphub.registry_versions source
          LEFT JOIN caphub.registry_lineage analyzed
            ON analyzed.from_node_id=source.record_id AND analyzed.relationship='analyzed_by'
          LEFT JOIN caphub.registry_records job_record ON job_record.record_id=analyzed.to_node_id
          LEFT JOIN caphub.registry_versions job
            ON job.record_id=job_record.record_id AND job.version=job_record.current_version
          LEFT JOIN caphub.registry_lineage derived
            ON derived.from_node_id=source.record_id AND derived.relationship='derived_as'
          LEFT JOIN caphub.registry_records packet_record ON packet_record.record_id=derived.to_node_id
          LEFT JOIN caphub.registry_versions packet
            ON packet.record_id=packet_record.record_id AND packet.version=packet_record.current_version
          WHERE source.record_id=$1 AND source.version=1
          LIMIT 1
        `, [captureId]);
        const job = asObject(related.rows[0]?.job_payload);
        const packet = packetDto(related.rows[0]?.packet_payload);
        const modelCalls = typeof job.id === "string" ? await pool.query<{ metadata: unknown }>(`
          SELECT metadata FROM caphub.audit_events
          WHERE subject_id=$1 AND event_type LIKE 'model.%'
          ORDER BY occurred_at, event_id LIMIT 200
        `, [job.id]) : { rows: [] };
        const imported = packet.packetId ? await pool.query<{
          import_id: string;
          imported_at: Date | string;
          review_request_id: string;
          state: ReviewRequest["state"];
        }>(`
          SELECT i.import_id, i.imported_at, i.review_request_id, q.state
          FROM caphub.registry_imports i
          JOIN caphub.review_requests q ON q.request_id=i.review_request_id
          WHERE i.source_review_packet_id=$1
        `, [packet.packetId]) : { rows: [] };
        const linked = imported.rows[0];
        const decisions = linked ? await decisionTimeline(pool, linked.review_request_id) : [];
        return {
          kind: "found" as const,
          capture: {
            id: String(capture.id ?? ""),
            filename: String(asObject(capture.source).original_filename ?? ""),
            sourceUrl: typeof asObject(capture.source).source_url === "string"
              ? String(asObject(capture.source).source_url) : null,
            note: String(capture.note ?? ""),
            mimeType: String(capture.mime_type ?? ""),
            objectDigest: String(object.digest ?? ""),
            objectBytes: Number(object.bytes ?? 0),
            createdAt: String(capture.created_at ?? "")
          },
          job: Object.keys(job).length ? {
            id: String(job.id ?? ""), status: String(job.status ?? ""),
            completedArtifactIds: strings(job.completed_artifact_ids)
          } : null,
          analysisState: packet.packetId ? "complete" as const : Object.keys(job).length ? "partial" as const : "artifact_unavailable" as const,
          packet,
          packetVersion: related.rows[0]?.packet_version ?? null,
          packetDigest: related.rows[0]?.packet_digest ?? null,
          registryImport: linked ? {
            id: linked.import_id,
            importedAt: iso(linked.imported_at),
            reviewRequestId: linked.review_request_id,
            reviewState: linked.state
          } : null,
          decisions,
          modelCalls: modelCalls.rows.map(({ metadata }) => {
            const event = asObject(metadata);
            return {
              eventId: String(event.event_id ?? ""),
              stage: String(event.stage ?? ""),
              provider: String(event.provider ?? ""),
              model: String(event.model ?? ""),
              type: String(event.type ?? ""),
              occurredAt: String(event.occurred_at ?? "")
            };
          })
        };
      } catch {
        throw new RegistryReadError("REGISTRY_UNAVAILABLE");
      }
    },

    async getCapabilityDetail(candidateId: string) {
      try {
        const result = await pool.query<QueueRow & { packet_payload: unknown | null; current_version: number }>(`
          SELECT q.request_id, q.review_kind, q.subject_kind, q.subject_id, q.subject_version,
                 q.subject_digest, q.lock_version, q.state, q.created_at, q.updated_at,
                 candidate.payload AS candidate_payload, packet.payload AS packet_payload,
                 record.current_version
          FROM caphub.registry_records record
          JOIN caphub.registry_versions candidate
            ON candidate.record_id=record.record_id AND candidate.version=record.current_version
          LEFT JOIN caphub.review_requests q ON q.subject_id=record.record_id
          LEFT JOIN caphub.registry_lineage proposed
            ON proposed.to_node_id=record.record_id AND proposed.to_version=candidate.version
           AND proposed.relationship='proposes'
          LEFT JOIN caphub.registry_versions packet
            ON packet.record_id=proposed.from_node_id AND packet.version=proposed.from_version
          WHERE record.record_id=$1 AND record.kind='candidate'
          ORDER BY q.created_at DESC NULLS LAST
          LIMIT 1
        `, [candidateId]);
        if (!result.rows[0]) return { kind: "not_found" as const };
        const row = result.rows[0];
        const terminal = row.request_id ? await latestDecision(pool, row.request_id) : decisionDto(null, null);
        const versions = await pool.query<{ version: number; payload_digest: string; created_at: Date | string }>(`
          SELECT version, payload_digest, created_at FROM caphub.registry_versions
          WHERE record_id=$1 ORDER BY version DESC LIMIT 200
        `, [candidateId]);
        const lineage = await pool.query<{
          from_node_id: string; from_kind: string; from_version: number;
          relationship: string; to_node_id: string; to_kind: string; to_version: number;
        }>(`
          SELECT from_node_id, from_kind, from_version, relationship, to_node_id, to_kind, to_version
          FROM caphub.registry_lineage
          WHERE from_node_id=$1 OR to_node_id=$1
          ORDER BY created_at, from_node_id, to_node_id LIMIT 200
        `, [candidateId]);
        const decisions = row.request_id ? await decisionTimeline(pool, row.request_id) : [];
        return {
          kind: "found" as const,
          candidateId,
          candidate: candidateDto(row.candidate_payload),
          request: row.request_id ? requestDto(row) : null,
          packet: packetDto(row.packet_payload),
          currentVersion: row.current_version,
          versions: versions.rows.map((version) => ({
            version: version.version,
            digest: version.payload_digest,
            createdAt: iso(version.created_at)
          })),
          lineage: lineage.rows.map((edge) => ({
            fromId: edge.from_node_id,
            fromKind: edge.from_kind,
            fromVersion: edge.from_version,
            relationship: edge.relationship,
            toId: edge.to_node_id,
            toKind: edge.to_kind,
            toVersion: edge.to_version
          })),
          decisions,
          staleVersion: Boolean(row.request_id && row.subject_version < row.current_version),
          future: { experienceCards: [], buildProposals: [], releases: [], deployments: [] },
          ...terminal
        };
      } catch {
        throw new RegistryReadError("REGISTRY_UNAVAILABLE");
      }
    }
  };
}

export type ReviewDetailDto = Awaited<ReturnType<ReturnType<typeof createRegistryQueries>["getReviewDetail"]>>;
export type ReviewQueueDto = Awaited<ReturnType<ReturnType<typeof createRegistryQueries>["getReviewQueue"]>>;
export type CaptureDetailDto = Awaited<ReturnType<ReturnType<typeof createRegistryQueries>["getCaptureDetail"]>>;
export type CapabilityDetailDto = Awaited<ReturnType<ReturnType<typeof createRegistryQueries>["getCapabilityDetail"]>>;
export type { RegistryDiffEntry };
