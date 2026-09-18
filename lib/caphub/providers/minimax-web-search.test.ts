import { describe, expect, it, vi } from "vitest";
import { CAPHUB_ANALYSIS_LIMITS } from "../analysis/limits";
import { ProviderInvocationError } from "./contracts";
import { MiniMaxWebSearchProvider } from "./minimax-web-search";

const response = (annotations: unknown[], overrides: Record<string, unknown> = {}) => ({
  id: "resp_search_fixture",
  object: "response",
  status: "completed",
  model: "MiniMax-M3",
  output: [
    {
      id: "call_search_fixture",
      type: "web_search_call",
      status: "completed",
      action: { type: "search", query: "Example Tool official documentation" }
    },
    {
      id: "msg_search_fixture",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{
        type: "output_text",
        text: "Example Tool is documented.",
        annotations
      }]
    }
  ],
  output_text: "Example Tool is documented.",
  usage: { input_tokens: 120, output_tokens: 40, total_tokens: 160 },
  error: null,
  ...overrides
});

const validCitation = {
  type: "url_citation",
  title: "Example Tool documentation",
  url: "https://docs.example.com/tool#install",
  start_index: 0,
  end_index: 10,
  content: "Example Tool supports agents."
};

describe("MiniMaxWebSearchProvider", () => {
  it("sends one fixed server-side web search and normalizes cited evidence", async () => {
    const requests: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
    const transport = vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return Response.json(response([
        validCitation,
        { ...validCitation, url: "http://insecure.example/tool" },
        { ...validCitation, url: "https://docs.example.com/tool#duplicate" },
        {
          ...validCitation,
          title: "Repository",
          url: "https://github.com/example/tool",
          content: "Repository source."
        },
        {
          ...validCitation,
          title: "Package",
          url: "https://www.npmjs.com/package/example-tool",
          content: "Package source."
        }
      ]));
    });
    const provider = new MiniMaxWebSearchProvider({ apiKey: "fixture-secret", fetch: transport });

    const result = await provider.search({
      query: "Example Tool official documentation",
      entityDomains: ["docs.example.com"]
    }, { signal: new AbortController().signal });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.minimax.io/v1/responses");
    expect(requests[0].init.headers).toEqual({
      authorization: "Bearer fixture-secret",
      "content-type": "application/json"
    });
    expect(requests[0].body).toMatchObject({
      model: "MiniMax-M3",
      stream: false,
      tools: [{ type: "web_search" }]
    });
    expect(requests[0].body).not.toHaveProperty("text");
    expect(String(requests[0].body.input)).toContain("Example Tool official documentation");
    expect(result).toMatchObject({
      usage: { inputTokens: 120, outputTokens: 40 },
      finishReason: "stop"
    });
    expect(result.outputBytes).toBeGreaterThan(0);
    expect(result.candidates).toEqual([
      {
        url: "https://docs.example.com/tool",
        title: "Example Tool documentation",
        sourceKind: "official",
        claims: ["Example Tool supports agents."],
        content: "Example Tool supports agents."
      },
      {
        url: "https://github.com/example/tool",
        title: "Repository",
        sourceKind: "repository",
        claims: ["Repository source."],
        content: "Repository source."
      },
      {
        url: "https://www.npmjs.com/package/example-tool",
        title: "Package",
        sourceKind: "package",
        claims: ["Package source."],
        content: "Package source."
      }
    ]);
  });

  it("caps citations and rejects malformed or empty terminal output", async () => {
    const many = Array.from({ length: CAPHUB_ANALYSIS_LIMITS.maxFetchedSources + 3 }, (_, index) => ({
      ...validCitation,
      url: `https://result-${index}.example/tool`,
      title: `Result ${index}`,
      content: `Content ${index}`
    }));
    const bounded = new MiniMaxWebSearchProvider({
      apiKey: "fixture-secret",
      fetch: async () => Response.json(response(many))
    });
    await expect(bounded.search({ query: "bounded", entityDomains: [] }, {
      signal: new AbortController().signal
    })).resolves.toMatchObject({ candidates: { length: CAPHUB_ANALYSIS_LIMITS.maxFetchedSources } });

    for (const payload of [
      response([], {}),
      response([{ ...validCitation, content: "" }]),
      response([validCitation], { status: "incomplete" }),
      { status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1 } }
    ]) {
      const provider = new MiniMaxWebSearchProvider({
        apiKey: "fixture-secret",
        fetch: async () => Response.json(payload)
      });
      await expect(provider.search({ query: "broken", entityDomains: [] }, {
        signal: new AbortController().signal
      })).rejects.toMatchObject({ code: "INVALID_OUTPUT" } satisfies Partial<ProviderInvocationError>);
    }
  });

  it("accepts the real multi-message search and open-page sequence", async () => {
    const payload = response([], {
      output: [
        { type: "message", role: "assistant", status: "completed", content: [{
          type: "output_text", text: "I will search.", annotations: []
        }] },
        { type: "web_search_call", status: "completed", action: { type: "search", query: "Example Tool" } },
        { type: "message", role: "assistant", status: "completed", content: [{
          type: "output_text", text: "Search result.", annotations: [validCitation]
        }] },
        { type: "web_search_call", status: "completed", action: { type: "open_page", url: "https://docs.example.com/tool" } },
        { type: "message", role: "assistant", status: "completed", content: [{
          type: "output_text", text: "Final result.", annotations: [
            { ...validCitation, url: "https://docs.example.com/tool#duplicate" },
            { ...validCitation, url: "https://github.com/example/tool", title: "Repository", content: "Repository source." }
          ]
        }] }
      ]
    });
    const provider = new MiniMaxWebSearchProvider({
      apiKey: "fixture-secret",
      fetch: async () => Response.json(payload)
    });

    await expect(provider.search({ query: "Example Tool", entityDomains: ["docs.example.com"] }, {
      signal: new AbortController().signal
    })).resolves.toMatchObject({
      candidates: [
        { url: "https://docs.example.com/tool", sourceKind: "official" },
        { url: "https://github.com/example/tool", sourceKind: "repository" }
      ]
    });
  });

  it.each([
    [401, "AUTHENTICATION"],
    [402, "BILLING"],
    [500, "UNAVAILABLE"]
  ] as const)("maps HTTP %i to %s without exposing provider bodies", async (status, code) => {
    const provider = new MiniMaxWebSearchProvider({
      apiKey: "fixture-secret",
      fetch: async () => new Response("provider-secret-body", { status })
    });
    const error = await provider.search({ query: "status", entityDomains: [] }, {
      signal: new AbortController().signal
    }).catch((candidate: unknown) => candidate);
    expect(error).toMatchObject({ code });
    expect(String(error)).not.toMatch(/fixture-secret|provider-secret-body/);
  });

  it("makes no request when already aborted and redacts malformed JSON", async () => {
    const transport = vi.fn(async () => new Response("provider-secret-body", { status: 200 }));
    const provider = new MiniMaxWebSearchProvider({ apiKey: "fixture-secret", fetch: transport });
    const controller = new AbortController();
    controller.abort();
    await expect(provider.search({ query: "aborted", entityDomains: [] }, { signal: controller.signal }))
      .rejects.toMatchObject({ code: "ABORTED" });
    expect(transport).not.toHaveBeenCalled();

    const malformed = new MiniMaxWebSearchProvider({
      apiKey: "fixture-secret",
      fetch: async () => new Response("provider-secret-body", { status: 200 })
    });
    const error = await malformed.search({ query: "malformed", entityDomains: [] }, {
      signal: new AbortController().signal
    }).catch((candidate: unknown) => candidate);
    expect(error).toMatchObject({ code: "INVALID_OUTPUT" });
    expect(String(error)).not.toMatch(/fixture-secret|provider-secret-body/);
  });
});
