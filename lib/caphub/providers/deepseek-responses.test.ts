import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  DEEPSEEK_API_MODEL,
  DEEPSEEK_RESPONSES_URL,
  DeepSeekResponsesAdapter,
  type DeepSeekFetch
} from "./deepseek-responses";

const signal = new AbortController().signal;
const schema = z.object({ answer: z.string() }).strict();

function completed(text = '{"answer":"same"}') {
  return {
    status: "completed",
    output: [{
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }]
    }],
    usage: { input_tokens: 12, output_tokens: 4 }
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("DeepSeekResponsesAdapter", () => {
  it("sends one fixed tool-free Responses API request and returns terminal JSON with usage", async () => {
    const fetch = vi.fn<DeepSeekFetch>(async () => jsonResponse(completed()));
    const adapter = new DeepSeekResponsesAdapter({ apiKey: "fixture-deepseek-key", fetch });

    await expect(adapter.generate({
      stage: "research",
      prompt: "fixture input",
      schema,
      maxOutputTokens: 8192,
      signal
    })).resolves.toEqual({ output: { answer: "same" }, usage: { inputTokens: 12, outputTokens: 4 } });

    expect(fetch).toHaveBeenCalledWith(DEEPSEEK_RESPONSES_URL, expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer fixture-deepseek-key",
        "content-type": "application/json"
      }),
      signal
    }));
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: DEEPSEEK_API_MODEL,
      stream: false,
      reasoning: { effort: "none" },
      max_output_tokens: 8192,
      text: { format: { type: "json_schema", name: "caphub_research" } }
    });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("store");
    expect(body.text.format).not.toHaveProperty("strict");
  });

  it.each([
    [401, "AUTHENTICATION"],
    [402, "BILLING"],
    [400, "INVALID_OUTPUT"],
    [422, "INVALID_OUTPUT"],
    [429, "UNAVAILABLE"],
    [500, "UNAVAILABLE"],
    [503, "UNAVAILABLE"]
  ] as const)("maps HTTP %s to %s without retaining response text", async (status, code) => {
    const adapter = new DeepSeekResponsesAdapter({
      apiKey: "fixture-deepseek-key",
      fetch: async () => new Response("provider-detail-must-not-escape", { status })
    });

    await expect(adapter.generate({ stage: "assessment", prompt: "fixture", schema, maxOutputTokens: 100, signal }))
      .rejects.toMatchObject({ code, message: `Structured provider invocation failed: ${code}` });
  });

  it.each([
    [{ status: "failed", output: [], usage: { input_tokens: 1, output_tokens: 1 } }],
    [{ status: "incomplete", output: [], usage: { input_tokens: 1, output_tokens: 1 } }],
    [{ ...completed(), output: [] }],
    [{ ...completed(), output: [
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "{}" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "{}" }] }
    ] }],
    [completed("not-json")]
  ])("rejects incomplete or ambiguous terminal output as INVALID_OUTPUT", async (payload) => {
    const adapter = new DeepSeekResponsesAdapter({ apiKey: "fixture-deepseek-key", fetch: async () => jsonResponse(payload) });
    await expect(adapter.generate({ stage: "assessment", prompt: "fixture", schema, maxOutputTokens: 100, signal }))
      .rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("maps an aborted request to ABORTED and a transport failure to UNAVAILABLE", async () => {
    const aborted = new AbortController();
    aborted.abort();
    const adapter = new DeepSeekResponsesAdapter({
      apiKey: "fixture-deepseek-key",
      fetch: async () => { throw new Error("network detail must not escape"); }
    });

    await expect(adapter.generate({ stage: "assessment", prompt: "fixture", schema, maxOutputTokens: 100, signal: aborted.signal }))
      .rejects.toMatchObject({ code: "ABORTED" });
    await expect(adapter.generate({ stage: "assessment", prompt: "fixture", schema, maxOutputTokens: 100, signal }))
      .rejects.toMatchObject({ code: "UNAVAILABLE", message: "Structured provider invocation failed: UNAVAILABLE" });
  });
});
