import { describe, expect, it } from "vitest";
import type { MonitoringProbe } from "../domain/types";
import { monitoringProbeSchema } from "../domain/schemas";
import type { FetchLike } from "../adapters/contracts";
import { executeProbe, ProbeRejectedError } from "./probe";

// Probe SSRF boundary (design §12.2): only an exact allowlisted HTTPS origin
// plus a relative path, GET/HEAD only, redirect: manual, no custom headers or
// body, DNS answers screened, and no persisted response body. All DNS and
// fetch traffic is injected — these tests make no real network requests.

const NOW = "2026-09-11T06:00:00Z";
const ORIGIN = "https://app.example.com";
const ALLOWED = { "talentvault-production": ORIGIN };

function probe(overrides: Record<string, unknown> = {}): MonitoringProbe {
  return monitoringProbeSchema.parse({
    host_ref: "talentvault-production",
    path: "/healthz",
    method: "GET",
    expected_status: [200],
    timeout_ms: 5000,
    ...overrides
  });
}

interface RecordedCall {
  url: string;
  init: { method?: string; headers?: Record<string, string>; body?: string; redirect?: string; signal?: AbortSignal | null } | undefined;
}

function makeFetch(responder: (url: string) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return responder(url);
  };
  return { fetchImpl, calls };
}

const okLookup = async () => ["203.0.113.10"];

async function expectProbeReject(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ProbeRejectedError);
    expect((error as ProbeRejectedError).code).toBe(code);
    return;
  }
  expect.unreachable(`expected probe rejection '${code}'`);
}

describe("executeProbe happy path", () => {
  it("issues exactly one bounded GET against the allowlisted origin", async () => {
    const { fetchImpl, calls } = makeFetch(() => new Response("ok", { status: 200 }));
    const outcome = await executeProbe(probe(), ALLOWED, { fetch: fetchImpl, lookup: okLookup, now: NOW });

    expect(outcome).toEqual({ url: `${ORIGIN}/healthz`, status: 200, expected: true, observed_at: NOW });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ORIGIN}/healthz`);
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[0].init?.redirect).toBe("manual");
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
    // No custom headers and no request body, ever.
    expect(calls[0].init?.headers).toBeUndefined();
    expect(calls[0].init?.body).toBeUndefined();
  });

  it("supports HEAD and a default '/' path", async () => {
    const { fetchImpl, calls } = makeFetch(() => new Response(null, { status: 200 }));
    const outcome = await executeProbe(probe({ path: undefined, method: "HEAD" }), ALLOWED, {
      fetch: fetchImpl,
      lookup: okLookup,
      now: NOW
    });
    expect(calls[0].url).toBe(`${ORIGIN}/`);
    expect(calls[0].init?.method).toBe("HEAD");
    expect(outcome.expected).toBe(true);
  });

  it("reports expected=false for a status outside expected_status without failing", async () => {
    const { fetchImpl } = makeFetch(() => new Response(null, { status: 503 }));
    const outcome = await executeProbe(probe(), ALLOWED, { fetch: fetchImpl, lookup: okLookup, now: NOW });
    expect(outcome.status).toBe(503);
    expect(outcome.expected).toBe(false);
  });

  it("treats a configured expected redirect status as evidence (intentional Access redirect)", async () => {
    const { fetchImpl, calls } = makeFetch(
      () => new Response(null, { status: 302, headers: { location: "https://talentvault.cloudflareaccess.com/" } })
    );
    const outcome = await executeProbe(probe({ expected_status: [302] }), ALLOWED, {
      fetch: fetchImpl,
      lookup: okLookup,
      now: NOW
    });
    expect(outcome.status).toBe(302);
    expect(outcome.expected).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("never follows redirects: cross-origin redirect yields exactly one request", async () => {
    const { fetchImpl, calls } = makeFetch(
      () => new Response(null, { status: 301, headers: { location: "https://evil.example.net/" } })
    );
    const outcome = await executeProbe(probe({ expected_status: [200] }), ALLOWED, {
      fetch: fetchImpl,
      lookup: okLookup,
      now: NOW
    });
    expect(calls).toHaveLength(1);
    expect(outcome.status).toBe(301);
    expect(outcome.expected).toBe(false);
  });

  it("permits a public IP-literal origin and skips the DNS screen for it", async () => {
    const lookupCalls: string[] = [];
    const { fetchImpl, calls } = makeFetch(() => new Response(null, { status: 200 }));
    await executeProbe(probe(), { "talentvault-production": "https://203.0.113.10" }, {
      fetch: fetchImpl,
      lookup: async (host) => {
        lookupCalls.push(host);
        return [host];
      },
      now: NOW
    });
    expect(calls[0].url).toBe("https://203.0.113.10/healthz");
    expect(lookupCalls).toHaveLength(0);
  });
});

describe("executeProbe SSRF rejections", () => {
  const { fetchImpl } = makeFetch(() => new Response(null, { status: 200 }));

  it("rejects a non-HTTPS origin", async () => {
    await expectProbeReject(
      executeProbe(probe(), { "talentvault-production": "http://app.example.com" }, { fetch: fetchImpl, lookup: okLookup, now: NOW }),
      "probe_not_https"
    );
  });

  it("rejects an origin with embedded user information", async () => {
    await expectProbeReject(
      executeProbe(probe(), { "talentvault-production": "https://user:pw@app.example.com" }, { fetch: fetchImpl, lookup: okLookup, now: NOW }),
      "probe_userinfo"
    );
  });

  it("rejects an unknown host_ref", async () => {
    await expectProbeReject(
      executeProbe(probe({ host_ref: "other-host" }), ALLOWED, { fetch: fetchImpl, lookup: okLookup, now: NOW }),
      "probe_host_ref_unknown"
    );
  });

  it.each(["//evil.example.net/x", "..", "/../x", "/a/../../b", "x", "https://evil.example.net/x", "/\\windows"])(
    "rejects non-relative or escaping path %j",
    async (path) => {
      const raw = { host_ref: "talentvault-production", path, method: "GET", expected_status: [200], timeout_ms: 5000 };
      await expectProbeReject(
        executeProbe(raw as MonitoringProbe, ALLOWED, { fetch: fetchImpl, lookup: okLookup, now: NOW }),
        "probe_absolute_path"
      );
    }
  );

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "240.0.0.1",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd00::abcd",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1"
  ])("rejects blocked IP-literal origin %s", async (ip) => {
    const origin = ip.includes(":") ? `https://[${ip}]` : `https://${ip}`;
    await expectProbeReject(
      executeProbe(probe(), { "talentvault-production": origin }, { fetch: fetchImpl, lookup: okLookup, now: NOW }),
      "probe_ip_literal_blocked"
    );
  });

  it.each(
    [
      ["127.0.0.1"],
      ["10.0.0.8"],
      ["192.168.0.1"],
      ["172.16.5.5"],
      ["169.254.10.10"],
      ["100.64.1.1"],
      ["0.0.0.0"],
      ["224.1.1.1"],
      ["240.1.1.1"],
      ["::1"],
      ["fe80::99"],
      ["fd12::1"],
      ["ff05::2"],
      ["::ffff:192.168.1.1"],
      ["203.0.113.10", "10.0.0.1"] // one bad answer is enough
    ].map((answers) => ({ answers }))
  )("rejects DNS answers in blocked ranges: $answers", async ({ answers }) => {
    await expectProbeReject(
      executeProbe(probe(), ALLOWED, { fetch: fetchImpl, lookup: async () => answers, now: NOW }),
      "probe_dns_blocked"
    );
  });

  it("rejects when DNS resolution fails or returns nothing", async () => {
    await expectProbeReject(
      executeProbe(probe(), ALLOWED, {
        fetch: fetchImpl,
        lookup: async () => {
          throw new Error("ENOTFOUND");
        },
        now: NOW
      }),
      "probe_dns_failed"
    );
    await expectProbeReject(
      executeProbe(probe(), ALLOWED, { fetch: fetchImpl, lookup: async () => [], now: NOW }),
      "probe_dns_failed"
    );
  });

  it("maps abort/timeout failures to probe_timeout", async () => {
    const timeoutFetch: FetchLike = async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    };
    await expectProbeReject(
      executeProbe(probe(), ALLOWED, { fetch: timeoutFetch, lookup: okLookup, now: NOW }),
      "probe_timeout"
    );

    const abortFetch: FetchLike = async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    };
    await expectProbeReject(
      executeProbe(probe(), ALLOWED, { fetch: abortFetch, lookup: okLookup, now: NOW }),
      "probe_timeout"
    );
  });

  it("maps other transport failures to probe_fetch_failed without echoing internals", async () => {
    const boomFetch: FetchLike = async () => {
      throw new Error("socket hang up secret-token-xyz");
    };
    try {
      await executeProbe(probe(), ALLOWED, { fetch: boomFetch, lookup: okLookup, now: NOW });
      expect.unreachable("expected probe rejection");
    } catch (error) {
      expect((error as ProbeRejectedError).code).toBe("probe_fetch_failed");
      expect(String(error)).not.toContain("secret-token-xyz");
    }
  });

  it("rejects oversized response metadata and never reads the body", async () => {
    let returned: Response | null = null;
    const { fetchImpl } = makeFetch(() => {
      returned = new Response("x".repeat(128), {
        status: 200,
        headers: { "content-length": String(2 * 1024 * 1024) }
      });
      return returned;
    });
    await expectProbeReject(
      executeProbe(probe(), ALLOWED, { fetch: fetchImpl, lookup: okLookup, now: NOW }),
      "probe_oversize_metadata"
    );
    expect(returned!.bodyUsed).toBe(false);
  });

  it("never reads the response body on success either", async () => {
    let returned: Response | null = null;
    const { fetchImpl } = makeFetch(() => {
      returned = new Response("probe body that must stay unread", { status: 200 });
      return returned;
    });
    const outcome = await executeProbe(probe(), ALLOWED, { fetch: fetchImpl, lookup: okLookup, now: NOW });
    expect(outcome.status).toBe(200);
    expect(returned!.bodyUsed).toBe(false);
  });
});
