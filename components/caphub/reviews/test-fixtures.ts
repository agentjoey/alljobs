import type { CapabilityDetailDto, CaptureDetailDto, ReviewDetailDto, ReviewQueueDto } from "@/lib/caphub/registry/queries";

export const REQUEST_ID = `rev_${"1".repeat(32)}`;
export const SUBJECT_ID = `cand_${"2".repeat(32)}`;
export const DIGEST = "3".repeat(64);

export function reviewDetail(overrides: Record<string, unknown> = {}): Extract<ReviewDetailDto, { kind: "found" }> {
  const base = {
    kind: "found" as const,
    request: {
      id: REQUEST_ID,
      reviewKind: "candidate" as const,
      subjectKind: "candidate" as const,
      subjectId: SUBJECT_ID,
      subjectVersion: 1,
      subjectDigest: DIGEST,
      lockVersion: 1,
      state: "WAITING_FOR_REVIEW" as const,
      createdAt: "2026-09-16T13:00:00.000Z",
      updatedAt: "2026-09-16T13:00:00.000Z",
      approveConfirmation: "APPROVE CANDIDATE 22222222",
      rejectConfirmation: "REJECT CANDIDATE 22222222",
      supersededByRequestId: null
    },
    candidate: {
      name: "Browser Use Safety Layer",
      novelCapabilities: ["Pinned evidence"], overlappingCapabilities: [], replaces: [],
      complements: ["Human review"], conflictsWith: [], capabilityGaps: []
    },
    packet: {
      packetId: `rvp_${"4".repeat(32)}`,
      screenshots: [{ order: 0, digest: "5".repeat(64), bytes: 42 }],
      evidence: [{
        id: `ev_${"6".repeat(32)}`, tier: "A", sourceUrl: "https://docs.example.com/tool",
        title: "Official docs", checkedAt: "2026-09-16T13:00:00.000Z",
        contentDigest: "7".repeat(64), claims: ["The boundary is review-only."]
      }],
      claims: [{
        id: `clm_${"8".repeat(32)}`, statement: "Host enforcement is required.", basis: "visible",
        confidence: 0.8, evidenceIds: [`ev_${"6".repeat(32)}`]
      }],
      entities: [{ name: "Example", aliases: [] }],
      conflicts: [{ summary: "Enforcement remains unproved.", evidenceIds: [`ev_${"6".repeat(32)}`] }],
      unresolvedQuestions: ["Can blocked writes be proven?"], evidenceConfidence: 3,
      recommendedDisposition: "build", critic: { verdict: "revise", unresolvedQuestions: ["Need blocked-write evidence."] },
      createdAt: "2026-09-16T13:00:00.000Z"
    },
    diff: [{ kind: "added" as const, path: "$", summary: "New record" }],
    decision: null,
    authority: null,
    ...overrides
  };
  return base as Extract<ReviewDetailDto, { kind: "found" }>;
}

export function reviewQueue(): ReviewQueueDto {
  const detail = reviewDetail();
  return {
    kind: "ready",
    items: [{
      request: {
        id: detail.request.id, reviewKind: detail.request.reviewKind, subjectKind: detail.request.subjectKind,
        subjectId: detail.request.subjectId, subjectVersion: detail.request.subjectVersion,
        subjectDigest: detail.request.subjectDigest, lockVersion: detail.request.lockVersion,
        state: detail.request.state, createdAt: detail.request.createdAt, updatedAt: detail.request.updatedAt
      },
      candidate: detail.candidate,
      evidenceConfidence: 3,
      unresolvedCount: 1
    }],
    nextCursor: null
  };
}

export const captureDetail = {
  kind: "found",
  capture: {
    id: `cap_${"9".repeat(32)}`, filename: "capture.png", sourceUrl: "https://example.com",
    note: "Evidence", mimeType: "image/png", objectDigest: "a".repeat(64), objectBytes: 42,
    createdAt: "2026-09-16T13:00:00.000Z"
  },
  job: { id: `job_${"b".repeat(32)}`, status: "completed", completedArtifactIds: [] },
  packet: reviewDetail().packet,
  modelCalls: [{ eventId: `mce_${"c".repeat(32)}`, stage: "research", provider: "kimi", model: "k3-256k", type: "succeeded", occurredAt: "2026-09-16T13:00:00.000Z" }]
} as CaptureDetailDto;

export const capabilityDetail = {
  kind: "found", candidateId: SUBJECT_ID, candidate: reviewDetail().candidate,
  request: reviewQueue().items[0].request, packet: reviewDetail().packet,
  future: { experienceCards: [], buildProposals: [], releases: [], deployments: [] },
  decision: null, authority: null
} as CapabilityDetailDto;
