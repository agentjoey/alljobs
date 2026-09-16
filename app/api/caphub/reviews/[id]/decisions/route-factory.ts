import { reviewDecisionInputSchema, reviewRequestIdSchema } from "@/lib/caphub/registry/schemas";
import { ReviewStoreError } from "@/lib/caphub/registry/postgres/reviews";
import { ReviewServiceError, type ReviewDecisionService } from "@/lib/caphub/registry/review-service";

const MAX_JSON_BYTES = 8 * 1024;
const ALLOWED_BODY_FIELDS = new Set([
  "idempotency_key", "expected_lock_version", "expected_subject_digest", "action",
  "confirmation", "rationale", "disposition", "original_approval_decision_id"
]);
const SAFE_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

export interface ReviewDecisionRouteDependencies {
  decide: ReviewDecisionService["decide"];
  allowedOrigins: readonly string[];
}

function safeError(status: number, code: string, message: string, details: Record<string, string> = {}): Response {
  return Response.json({ error: { code, message, ...details } }, { status, headers: SAFE_HEADERS });
}

function mappedError(error: unknown): Response {
  if (error instanceof ReviewStoreError) {
    const status = error.code === "INVALID_REVIEW_DECISION" ? 400
      : error.code === "REGISTRY_UNAVAILABLE" ? 503 : 409;
    return safeError(status, error.code, error.message,
      error.code === "DECISION_ALREADY_CONSUMED" && error.consumedBy
        ? { consumedBy: error.consumedBy }
        : {});
  }
  if (error instanceof ReviewServiceError) {
    return safeError(error.code === "REVIEW_JOB_NOT_FOUND" ? 404 : 409, error.code, error.message);
  }
  return safeError(500, "INTERNAL_ERROR", "Review decision could not be recorded.");
}

export function createReviewDecisionPostRoute(dependencies: ReviewDecisionRouteDependencies) {
  const allowedOrigins = new Set(dependencies.allowedOrigins);
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> }
  ): Promise<Response> {
    const origin = request.headers.get("origin");
    if (origin === null || !allowedOrigins.has(origin)) {
      return safeError(403, "ORIGIN_NOT_ALLOWED", "Review request origin is not allowed.");
    }
    if (request.headers.get("sec-fetch-site") !== "same-origin") {
      return safeError(403, "FETCH_METADATA_REJECTED", "Review request context is not allowed.");
    }

    const { id } = await context.params;
    if (!reviewRequestIdSchema.safeParse(id).success) {
      return safeError(400, "INVALID_REVIEW_REQUEST_ID", "Review request ID is invalid.");
    }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) {
      return safeError(415, "UNSUPPORTED_MEDIA_TYPE", "Review decision must use JSON.");
    }
    const contentLength = request.headers.get("content-length");
    if (contentLength === null) {
      return safeError(411, "CONTENT_LENGTH_REQUIRED", "Review decision must include Content-Length.");
    }
    if (!/^(0|[1-9]\d*)$/.test(contentLength) || Number(contentLength) > MAX_JSON_BYTES) {
      return safeError(413, "PAYLOAD_TOO_LARGE", "Review decision exceeds the configured limit.");
    }

    let raw: unknown;
    try {
      const text = await request.text();
      if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
        return safeError(413, "PAYLOAD_TOO_LARGE", "Review decision exceeds the configured limit.");
      }
      raw = JSON.parse(text);
    } catch {
      return safeError(400, "INVALID_JSON", "Review decision JSON is invalid.");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || Object.keys(raw).some((field) => !ALLOWED_BODY_FIELDS.has(field))) {
      return safeError(400, "INVALID_REVIEW_DECISION", "Review decision fields are invalid.");
    }
    const parsed = reviewDecisionInputSchema.safeParse({
      ...raw,
      request_id: id
    });
    if (!parsed.success) {
      return safeError(400, "INVALID_REVIEW_DECISION", "Review decision fields are invalid.");
    }
    const { request_id: _requestId, ...input } = parsed.data;
    try {
      const outcome = await dependencies.decide(id, input);
      const { decision, authority } = outcome.result;
      return Response.json({
        decision: {
          id: decision.id,
          request_id: decision.request_id,
          action: decision.action,
          recorded_at: decision.recorded_at
        },
        authority,
        job: outcome.job ? { id: outcome.job.id, status: outcome.job.status } : null,
        consequence: "No release, build, installation, publication, or deployment action was executed."
      }, { status: 200, headers: SAFE_HEADERS });
    } catch (error) {
      return mappedError(error);
    }
  };
}
