import { describe, expect, it, vi } from "vitest";
import type { AssistantContextBundle } from "./context";
import type { AssistantOutcome, AssistantRequestIntent, AssistantStreamEvent } from "./contracts";
import { createAssistantService } from "./service";

const DIGEST = "a".repeat(64);
const NEXT_DIGEST = "b".repeat(64);

const validAnswer: AssistantOutcome = {
  kind: "management_answer",
  direct_answer: "The backlog has one ready item.",
  confirmed_facts: [{ id: "fact-1", text: "One item is ready.", citation_source_ids: ["docs/BACKLOG.md"] }],
  inferences: [],
  unknowns: [],
  questions: [],
  recommendations: [],
  citations: [{ source_id: "docs/BACKLOG.md", label: "Backlog" }]
};

function bundle(digest = DIGEST): AssistantContextBundle {
  return {
    manifest: {
      project_slug: "sample-code",
      source_mode: "local-working-tree",
      head_revision: "abc123",
      documents: [{
        source_id: "docs/BACKLOG.md",
        path: "docs/BACKLOG.md",
        digest: DIGEST,
        bytes: 12,
        modified: false,
        optional: false,
        selected: true,
        read_at: "2026-09-01T00:00:00.000Z",
        issues: []
      }],
      context_policy_version: 1,
      manifest_digest: digest
    },
    receipt: {
      project_slug: "sample-code",
      source_mode: "local-working-tree",
      head_revision: "abc123",
      sources: [],
      issues: []
    },
    fragments: [{
      source_id: "docs/BACKLOG.md",
      path: "docs/BACKLOG.md",
      file_digest: DIGEST,
      heading: null,
      line_start: 1,
      line_end: 1,
      content: "# Backlog"
    }]
  };
}

const ask: AssistantRequestIntent = {
  intent: "ask",
  project_slug: "sample-code",
  question: "What is ready?",
  mode: "standard",
  selected_optional_source_ids: [],
  expected_manifest_digest: DIGEST
};

async function collect(stream: AsyncIterable<AssistantStreamEvent>): Promise<AssistantStreamEvent[]> {
  const events: AssistantStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("assistant service", () => {
  it("rejects a pre-call manifest mismatch without invoking the model", async () => {
    const generate = vi.fn();
    const service = createAssistantService({ assembleContext: vi.fn().mockResolvedValue(bundle()), generate });

    const events = await collect(service.respond({ ...ask, expected_manifest_digest: NEXT_DIGEST }, new AbortController().signal));

    expect(generate).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: "run_status", stage: "preparing" },
      expect.objectContaining({ type: "assistant_error", code: "STALE_CONTEXT" })
    ]);
  });

  it("generates once, validates current citations, and records metadata without question or answer bodies", async () => {
    const recordActivity = vi.fn().mockResolvedValue(undefined);
    const generate = vi.fn().mockResolvedValue({ outcome: validAnswer, usage: { input_tokens: 3, output_tokens: 5 } });
    const service = createAssistantService({
      assembleContext: vi.fn().mockResolvedValue(bundle()),
      generate,
      recordActivity,
      createRunId: () => "run-1",
      now: () => new Date("2026-09-01T00:00:00.000Z")
    });

    const events = await collect(service.respond(ask, new AbortController().signal));

    expect(generate).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      { type: "run_status", stage: "preparing" },
      { type: "run_status", stage: "generating" },
      { type: "run_status", stage: "validating" },
      expect.objectContaining({ type: "assistant_complete", stale: false, outcome: validAnswer }),
      { type: "run_status", stage: "complete" }
    ]);
    expect(JSON.stringify(recordActivity.mock.calls[0][0])).not.toContain(ask.question);
    expect(JSON.stringify(recordActivity.mock.calls[0][0])).not.toContain(validAnswer.direct_answer);
    expect(recordActivity.mock.calls[0][0]).toMatchObject({ project: "sample-code", model: "MiniMax-M3", status: "complete" });
  });

  it("keeps a readable answer but marks it stale when the post-call manifest changed", async () => {
    const assembleContext = vi.fn().mockResolvedValueOnce(bundle()).mockResolvedValueOnce(bundle(NEXT_DIGEST));
    const service = createAssistantService({ assembleContext, generate: vi.fn().mockResolvedValue({ outcome: validAnswer }) });

    const events = await collect(service.respond(ask, new AbortController().signal));

    expect(events).toContainEqual(expect.objectContaining({ type: "assistant_complete", stale: true, outcome: validAnswer }));
  });

  it("fails closed when a model outcome cites a source outside the current manifest", async () => {
    const service = createAssistantService({
      assembleContext: vi.fn().mockResolvedValue(bundle()),
      generate: vi.fn().mockResolvedValue({
        outcome: { ...validAnswer, citations: [{ source_id: "secret.env", label: "secret" }] }
      })
    });

    const events = await collect(service.respond(ask, new AbortController().signal));

    expect(events).toContainEqual(expect.objectContaining({ type: "assistant_error", code: "INVALID_OUTPUT" }));
  });

  it("turns a source request into a digest-only one-time gate", async () => {
    const service = createAssistantService({
      assembleContext: vi.fn().mockResolvedValue(bundle()),
      generate: vi.fn().mockResolvedValue({
        outcome: {
          kind: "source_access_proposal",
          purpose: "Check implementation details",
          unanswered_question: "Which module owns this?",
          requested_capabilities: ["list_project_files", "read_project_files"],
          gate_id: "model-placeholder",
          max_files: 999,
          max_bytes: 999999,
          max_tool_calls: 99,
          expected_facts: [],
          manifest_digest: DIGEST,
          expires_at: "never"
        }
      }),
      createRunId: () => "run-1"
    });

    const events = await collect(service.respond(ask, new AbortController().signal));
    const request = events.find((event) => event.type === "source_access_requested");

    expect(request).toMatchObject({ type: "source_access_requested", proposal: { manifest_digest: DIGEST, max_files: 6, max_bytes: 192 * 1024, max_tool_calls: 4 } });
    expect(JSON.stringify(request)).not.toContain(ask.question);
  });

  it("does not consume a source gate until its current manifest digest has passed preflight", async () => {
    const sourceRequest: AssistantOutcome = {
      kind: "source_access_proposal",
      gate_id: "model-placeholder",
      purpose: "Inspect implementation details",
      unanswered_question: "Which module owns this?",
      requested_capabilities: ["list_project_files"],
      max_files: 1,
      max_bytes: 1,
      max_tool_calls: 1,
      expected_facts: [],
      manifest_digest: DIGEST,
      expires_at: "never"
    };
    const generate = vi.fn()
      .mockResolvedValueOnce({ outcome: sourceRequest })
      .mockResolvedValueOnce({ outcome: validAnswer });
    const service = createAssistantService({ assembleContext: vi.fn().mockResolvedValue(bundle()), generate });
    const firstEvents = await collect(service.respond(ask, new AbortController().signal));
    const firstRequest = firstEvents.find((event) => event.type === "source_access_requested");
    if (!firstRequest || firstRequest.type !== "source_access_requested") throw new Error("source gate was not created");

    const inspect = {
      intent: "inspect_source" as const,
      project_slug: ask.project_slug,
      gate_id: firstRequest.proposal.gate_id,
      question: ask.question,
      expected_manifest_digest: DIGEST
    };
    await collect(service.respond({ ...inspect, expected_manifest_digest: NEXT_DIGEST }, new AbortController().signal));
    const events = await collect(service.respond(inspect, new AbortController().signal));

    expect(generate).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual(expect.objectContaining({ type: "assistant_complete", stale: false }));
  });

  it("rejects source authority before the documents-only follow-up model call", async () => {
    const sourceRequest: AssistantOutcome = {
      kind: "source_access_proposal",
      gate_id: "model-placeholder",
      purpose: "Inspect implementation details",
      unanswered_question: "Which module owns this?",
      requested_capabilities: ["list_project_files"],
      max_files: 1,
      max_bytes: 1,
      max_tool_calls: 1,
      expected_facts: [],
      manifest_digest: DIGEST,
      expires_at: "never"
    };
    const generate = vi.fn()
      .mockResolvedValueOnce({ outcome: sourceRequest })
      .mockResolvedValueOnce({ outcome: validAnswer });
    const service = createAssistantService({ assembleContext: vi.fn().mockResolvedValue(bundle()), generate });
    const firstEvents = await collect(service.respond(ask, new AbortController().signal));
    const request = firstEvents.find((event) => event.type === "source_access_requested");
    if (!request || request.type !== "source_access_requested") throw new Error("source gate was not created");

    await collect(service.respond({
      intent: "answer_without_source",
      project_slug: ask.project_slug,
      gate_id: request.proposal.gate_id,
      question: ask.question,
      expected_manifest_digest: DIGEST
    }, new AbortController().signal));

    expect(generate).toHaveBeenLastCalledWith(expect.objectContaining({ sourceGate: undefined }));
  });

  it("propagates abort without retry and terminates as incomplete", async () => {
    const controller = new AbortController();
    const generate = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      return await new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
        queueMicrotask(() => controller.abort());
      });
    });
    const service = createAssistantService({ assembleContext: vi.fn().mockResolvedValue(bundle()), generate });

    const events = await collect(service.respond(ask, controller.signal));

    expect(generate).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(expect.objectContaining({ type: "assistant_error", code: "ABORTED" }));
  });
});
