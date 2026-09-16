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
    .default("WAITING_FOR_REVIEW")
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

function packetDto(value: unknown) {
  const packet = asObject(value);
  const dimensions = asObject(packet.dimensions);
  const critic = packet.critic === null ? null : asObject(packet.critic);
  return {
    packetId: String(packet.packet_id ?? ""),
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
    conflicts: Array.isArray(packet.conflicts) ? packet.conflicts.map((raw) => {
      const conflict = asObject(raw);
      return { summary: String(conflict.summary ?? ""), evidenceIds: strings(conflict.evidence_ids) };
    }) : [],
    unresolvedQuestions: strings(packet.unresolved_questions),
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

export function createRegistryQueries(pool: Pool) {
  return {
    async getReviewQueue(input: ReviewQueueInput = {}) {
      const parsed = reviewQueueInputSchema.safeParse(input);
      if (!parsed.success) throw new RegistryReadError("INVALID_QUERY");
      try {
        const result = await pool.query<QueueRow>(`
          SELECT q.request_id, q.review_kind, q.subject_kind, q.subject_id, q.subject_version,
                 q.subject_digest, q.lock_version, q.state, q.created_at, q.updated_at,
                 candidate.payload AS candidate_payload, packet.payload AS packet_payload
          FROM caphub.review_requests q
          JOIN caphub.registry_versions candidate
            ON candidate.record_id = q.subject_id AND candidate.version = q.subject_version
          LEFT JOIN caphub.registry_lineage proposed
            ON proposed.to_node_id = q.subject_id AND proposed.to_version = q.subject_version
           AND proposed.relationship = 'proposes'
          LEFT JOIN caphub.registry_versions packet
            ON packet.record_id = proposed.from_node_id AND packet.version = proposed.from_version
          WHERE q.state = $1
            AND ($2::text IS NULL OR q.review_kind = $2)
            AND ($3::text IS NULL OR (q.created_at, q.request_id) > (
              SELECT created_at, request_id FROM caphub.review_requests WHERE request_id = $3
            ))
          ORDER BY q.created_at, q.request_id
          LIMIT $4
        `, [parsed.data.state, parsed.data.reviewKind, parsed.data.cursor, parsed.data.limit]);
        const items = result.rows.map((row) => {
          const packet = packetDto(row.packet_payload);
          return {
            request: requestDto(row),
            candidate: candidateDto(row.candidate_payload),
            evidenceConfidence: packet.evidenceConfidence,
            unresolvedCount: packet.unresolvedQuestions.length
          };
        });
        return {
          kind: "ready" as const,
          items,
          nextCursor: items.length === parsed.data.limit ? items.at(-1)!.request.id : null
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
        const related = await pool.query<{ job_payload: unknown | null; packet_payload: unknown | null }>(`
          SELECT job.payload AS job_payload, packet.payload AS packet_payload
          FROM caphub.registry_versions source
          LEFT JOIN caphub.registry_lineage analyzed
            ON analyzed.from_node_id=source.record_id AND analyzed.relationship='analyzed_by'
          LEFT JOIN caphub.registry_versions job
            ON job.record_id=analyzed.to_node_id AND job.version=analyzed.to_version
          LEFT JOIN caphub.registry_lineage derived
            ON derived.from_node_id=source.record_id AND derived.relationship='derived_as'
          LEFT JOIN caphub.registry_versions packet
            ON packet.record_id=derived.to_node_id AND packet.version=derived.to_version
          WHERE source.record_id=$1 AND source.version=1
          LIMIT 1
        `, [captureId]);
        const job = asObject(related.rows[0]?.job_payload);
        const modelCalls = typeof job.id === "string" ? await pool.query<{ metadata: unknown }>(`
          SELECT metadata FROM caphub.audit_events
          WHERE subject_id=$1 AND event_type LIKE 'model.%'
          ORDER BY occurred_at, event_id LIMIT 200
        `, [job.id]) : { rows: [] };
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
          packet: packetDto(related.rows[0]?.packet_payload),
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
        const result = await pool.query<QueueRow & { packet_payload: unknown | null }>(`
          SELECT q.request_id, q.review_kind, q.subject_kind, q.subject_id, q.subject_version,
                 q.subject_digest, q.lock_version, q.state, q.created_at, q.updated_at,
                 candidate.payload AS candidate_payload, packet.payload AS packet_payload
          FROM caphub.registry_records record
          JOIN caphub.registry_versions candidate
            ON candidate.record_id=record.record_id AND candidate.version=record.current_version
          LEFT JOIN caphub.review_requests q ON q.subject_id=record.record_id
          LEFT JOIN caphub.registry_lineage proposed
            ON proposed.to_node_id=record.record_id AND proposed.relationship='proposes'
          LEFT JOIN caphub.registry_versions packet
            ON packet.record_id=proposed.from_node_id AND packet.version=proposed.from_version
          WHERE record.record_id=$1 AND record.kind='candidate'
          ORDER BY q.created_at DESC NULLS LAST
          LIMIT 1
        `, [candidateId]);
        if (!result.rows[0]) return { kind: "not_found" as const };
        const row = result.rows[0];
        const terminal = row.request_id ? await latestDecision(pool, row.request_id) : decisionDto(null, null);
        return {
          kind: "found" as const,
          candidateId,
          candidate: candidateDto(row.candidate_payload),
          request: row.request_id ? requestDto(row) : null,
          packet: packetDto(row.packet_payload),
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
