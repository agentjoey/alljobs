import { describe, expect, it, vi } from "vitest";
import { ReviewStoreError } from "@/lib/caphub/registry/postgres/reviews";
import { createReviewDecisionPostRoute } from "./route-factory";

const ORIGIN = "https://alljobs.agentjoey.ai";
const REQUEST_ID = `rev_${"1".repeat(32)}`;
const SUBJECT_ID = `cand_${"2".repeat(32)}`;
const DIGEST = "3".repeat(64);

function body(overrides: Record<string, unknown> = {}) {
  return {
    idempotency_key: "review.intent-20260916:route",
    expected_lock_version: 1,
    expected_subject_digest: DIGEST,
    action: "approve",
    confirmation: "APPROVE CANDIDATE 22222222",
    rationale: "",
    disposition: "build",
    ...overrides
  };
}

function request(payload: unknown = body(), headers: Record<string, string> = {}): Request {
  const text = JSON.stringify(payload);
  return new Request(`https://alljobs.agentjoey.ai/api/caphub/reviews/${REQUEST_ID}/decisions`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(text).byteLength),
      ...headers
    },
    body: text
  });
}

function outcome() {
  return {
    result: {
      decision: {
        schema_version: 1 as const,
        id: `dec_${"4".repeat(32)}`,
        request_id: REQUEST_ID,
        idempotency_key: "review.intent-20260916:route",
        expected_lock_version: 1,
        expected_subject_digest: DIGEST,
        action: "approve" as const,
        confirmation: "APPROVE CANDIDATE 22222222",
        rationale: "",
        disposition: "build" as const,
        review_kind: "candidate" as const,
        subject_id: SUBJECT_ID,
        subject_version: 1,
        subject_digest: DIGEST,
        actor: "human:owner" as const,
        confirmation_digest: "5".repeat(64),
        original_approval_decision_id: null,
        revokes_decision_id: null,
        recorded_at: "2026-09-16T11:30:00.000Z"
      },
      authority: { state: "unconsumed" as const, consumedBy: null, revocable: true as const }
    },
    job: null
  };
}

describe("POST Caphub review decision route", () => {
  it("returns only the minimal decision receipt and explicit no-action consequence", async () => {
    const decide = vi.fn().mockResolvedValue(outcome());
    const response = await createReviewDecisionPostRoute({ decide, allowedOrigins: [ORIGIN] })(
      request(),
      { params: Promise.resolve({ id: REQUEST_ID }) }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const json = await response.json();
    expect(json).toMatchObject({
      decision: { id: `dec_${"4".repeat(32)}`, request_id: REQUEST_ID, action: "approve" },
      authority: { state: "unconsumed", revocable: true },
      consequence: expect.stringMatching(/No release, build, installation, publication, or deployment/i)
    });
    expect(JSON.stringify(json)).not.toMatch(/actor|rationale|database|secret|object_key/i);
  });

  it("rejects origin and Fetch Metadata before decision work", async () => {
    const decide = vi.fn();
    const route = createReviewDecisionPostRoute({ decide, allowedOrigins: [ORIGIN] });
    const wrongOrigin = await route(request(body(), { origin: "https://evil.example" }), {
      params: Promise.resolve({ id: REQUEST_ID })
    });
    expect(wrongOrigin.status).toBe(403);
    const crossSite = await route(request(body(), { "sec-fetch-site": "cross-site" }), {
      params: Promise.resolve({ id: REQUEST_ID })
    });
    expect(crossSite.status).toBe(403);
    expect(decide).not.toHaveBeenCalled();
  });

  it("rejects unknown authority, path, provider, URL, and secret-bearing fields", async () => {
    const decide = vi.fn();
    const route = createReviewDecisionPostRoute({ decide, allowedOrigins: [ORIGIN] });
    for (const field of ["actor", "request_id", "databaseUrl", "object_key", "provider", "api_key", "source_url"]) {
      const response = await route(request(body({ [field]: "hostile" })), {
        params: Promise.resolve({ id: REQUEST_ID })
      });
      expect(response.status).toBe(400);
    }
    expect(decide).not.toHaveBeenCalled();
  });

  it("enforces JSON and bounded Content-Length", async () => {
    const decide = vi.fn();
    const route = createReviewDecisionPostRoute({ decide, allowedOrigins: [ORIGIN] });
    const missing = await route(request(body(), { "content-length": "" }), {
      params: Promise.resolve({ id: REQUEST_ID })
    });
    expect(missing.status).toBe(413);
    const oversized = await route(request(body(), { "content-length": "9000" }), {
      params: Promise.resolve({ id: REQUEST_ID })
    });
    expect(oversized.status).toBe(413);
    const wrongType = await route(request(body(), { "content-type": "text/plain" }), {
      params: Promise.resolve({ id: REQUEST_ID })
    });
    expect(wrongType.status).toBe(415);
    expect(decide).not.toHaveBeenCalled();
  });

  it("maps stale review conflicts without leaking internal details", async () => {
    const decide = vi.fn().mockRejectedValue(new ReviewStoreError("STALE_REVIEW"));
    const response = await createReviewDecisionPostRoute({ decide, allowedOrigins: [ORIGIN] })(
      request(),
      { params: Promise.resolve({ id: REQUEST_ID }) }
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: { code: "STALE_REVIEW", message: "Review state is stale" }
    });
  });

  it("returns only the safe consumer ID for a consumed approval", async () => {
    const consumerId = `bld_${"8".repeat(32)}`;
    const decide = vi.fn().mockRejectedValue(new ReviewStoreError("DECISION_ALREADY_CONSUMED", consumerId));
    const response = await createReviewDecisionPostRoute({ decide, allowedOrigins: [ORIGIN] })(
      request(),
      { params: Promise.resolve({ id: REQUEST_ID }) }
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "DECISION_ALREADY_CONSUMED",
        message: "Approval decision has already been consumed",
        consumedBy: consumerId
      }
    });
  });
});
