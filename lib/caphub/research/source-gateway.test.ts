import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { ExactHttpsSourcePolicy } from "./source-policy";
import {
  DisabledResearchSourceGateway,
  LiveResearchSourceGateway,
  type PinnedHttpsResponse,
  type PinnedHttpsTransport
} from "./source-gateway";

function response(overrides: Partial<PinnedHttpsResponse> = {}): PinnedHttpsResponse {
  return {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
    remoteAddress: "8.8.8.8",
    body: (async function* () { yield Buffer.from("approved evidence"); })(),
    ...overrides
  };
}

function setup(responses: PinnedHttpsResponse[], overrides: Record<string, unknown> = {}) {
  const requests: string[] = [];
  const transport: PinnedHttpsTransport = {
    async request(target) {
      requests.push(target.url.href);
      const next = responses.shift();
      if (!next) throw new Error("unexpected request");
      return next;
    }
  };
  const policy = new ExactHttpsSourcePolicy({
    allowedOrigins: ["https://allowed.example", "https://second.example"],
    resolve: async () => ["8.8.8.8"]
  });
  return {
    requests,
    gateway: new LiveResearchSourceGateway({ policy, transport, ...overrides })
  };
}

describe("ResearchSourceGateway", () => {
  it("is disabled by default", async () => {
    const gateway = new DisabledResearchSourceGateway();
    await expect(gateway.search({ query: "query", entityDomains: [] }, new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_ACCESS_DISABLED" });
    await expect(gateway.fetch("https://allowed.example", new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_ACCESS_DISABLED" });
  });

  it("rejects an empty live allowlist", () => {
    const policy = new ExactHttpsSourcePolicy({ allowedOrigins: [], resolve: async () => ["8.8.8.8"] });
    expect(() => new LiveResearchSourceGateway({ policy, transport: { request: vi.fn() } }))
      .toThrowError(expect.objectContaining({ code: "SOURCE_ACCESS_DISABLED" }));
  });

  it("supports model search without a fetch allowlist", async () => {
    const search = vi.fn(async (request: { query: string }) => [{
      url: "https://docs.example.com/tool",
      title: "Official docs",
      sourceKind: "unknown" as const,
      claims: [request.query],
      content: "Cited result content"
    }]);
    const gateway = new LiveResearchSourceGateway({ search });
    await expect(gateway.search({ query: "Example Tool", entityDomains: [] }, new AbortController().signal))
      .resolves.toHaveLength(1);
    await expect(gateway.fetch("https://docs.example.com/tool", new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_ACCESS_DISABLED" });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("reauthorizes bounded redirects and preserves the vetted peer", async () => {
    const { gateway, requests } = setup([
      response({ status: 302, headers: { location: "https://second.example/final" } }),
      response({ remoteAddress: "8.8.8.8" })
    ]);
    const fetched = await gateway.fetch("https://allowed.example/start", new AbortController().signal);
    expect(requests).toEqual(["https://allowed.example/start", "https://second.example/final"]);
    expect(fetched).toMatchObject({ text: "approved evidence", redirects: 1 });
  });

  it("blocks redirect escape, more than two redirects, and peer mismatch", async () => {
    const escaped = setup([response({ status: 302, headers: { location: "https://evil.example" } })]);
    await expect(escaped.gateway.fetch("https://allowed.example", new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_BLOCKED" });

    const loop = setup([
      response({ status: 302, headers: { location: "/1" } }),
      response({ status: 302, headers: { location: "/2" } }),
      response({ status: 302, headers: { location: "/3" } })
    ]);
    await expect(loop.gateway.fetch("https://allowed.example/0", new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_REDIRECT_LIMIT" });

    const rebound = setup([response({ remoteAddress: "1.1.1.1" })]);
    await expect(rebound.gateway.fetch("https://allowed.example", new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_PEER_MISMATCH" });
  });

  it("enforces MIME and compressed/decompressed byte caps", async () => {
    const mime = setup([response({ headers: { "content-type": "application/octet-stream" } })]);
    await expect(mime.gateway.fetch("https://allowed.example", new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_UNSUPPORTED_MEDIA" });

    const compressed = setup([response({
      body: (async function* () { yield Buffer.alloc(2 * 1024 * 1024 + 1); })()
    })]);
    await expect(compressed.gateway.fetch("https://allowed.example", new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_TOO_LARGE" });

    const bomb = gzipSync(Buffer.alloc(4 * 1024 * 1024 + 1, 97));
    const decompressed = setup([response({
      headers: { "content-type": "text/plain", "content-encoding": "gzip" },
      body: (async function* () { yield bomb; })()
    })]);
    await expect(decompressed.gateway.fetch("https://allowed.example", new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_TOO_LARGE" });
  });

  it("enforces deadline plus per-job search and fetch counts", async () => {
    const timeoutPolicy = new ExactHttpsSourcePolicy({
      allowedOrigins: ["https://allowed.example"],
      resolve: async () => ["8.8.8.8"]
    });
    const timeout = new LiveResearchSourceGateway({
      policy: timeoutPolicy,
      timeoutMs: 5,
      transport: { request: async () => await new Promise(() => undefined) }
    });
    await expect(timeout.fetch("https://allowed.example", new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_TIMEOUT" });

    const candidates = [{ url: "https://allowed.example", title: "one", sourceKind: "official" as const, claims: ["claim"] }];
    const bounded = setup(Array.from({ length: 8 }, () => response()), {
      search: async () => candidates
    }).gateway;
    for (let index = 0; index < 4; index += 1) {
      await bounded.search({ query: `query-${index}`, entityDomains: [] }, new AbortController().signal);
    }
    await expect(bounded.search({ query: "query-5", entityDomains: [] }, new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_QUERY_LIMIT" });
    for (let index = 0; index < 8; index += 1) {
      await bounded.fetch("https://allowed.example", new AbortController().signal);
    }
    await expect(bounded.fetch("https://allowed.example", new AbortController().signal))
      .rejects.toMatchObject({ code: "SOURCE_FETCH_LIMIT" });
  });
});
