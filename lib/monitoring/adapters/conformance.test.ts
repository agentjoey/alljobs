import { describe, expect, it } from "vitest";
import { buildMonitoringBinding } from "../domain/fixtures";
import { createCredentialHandle } from "../collector/credentials";
import type { MonitoringAdapter } from "./contracts";
import { AdapterError } from "./contracts";
import {
  ConformanceViolation,
  createRecordingTransport,
  runAdapterConformance
} from "./conformance";
import { createFixtureAdapter } from "./fixture";

// Common adapter conformance suite (design §13): fixed hosts/methods, abort
// deadlines, size limits, closed error taxonomy, safe timestamps, unsupported
// capability representation, and no serialized secret or raw response. The
// fixture adapter must pass; deliberately broken adapters must fail.

const NOW = "2026-09-11T05:59:00Z";
const CANARY = "conformance-canary-token-9f8e7d6c";

const EVIDENCE_BODY = JSON.stringify({
  deployment: { state: "succeeded", deployment_id: "dep-1", observed_at: NOW },
  runtime: { state: "healthy", observed_at: NOW, source: "provider" },
  usage: [
    {
      metric: "cpu_seconds",
      value: 12,
      unit: "cpu_seconds",
      period_start: "2026-09-01T00:00:00Z",
      period_end: "2026-10-01T00:00:00Z",
      provider_reported_at: NOW,
      billing_alignment: "operational_only",
      availability: "available"
    }
  ],
  platform_incident: null
});

function conformanceOptions() {
  return {
    binding: buildMonitoringBinding(),
    credential: createCredentialHandle("railway-primary", "railway", CANARY),
    now: "2026-09-11T06:00:00Z",
    secrets: [CANARY],
    respond: () => ({ status: 200, body: EVIDENCE_BODY })
  };
}

describe("fixture adapter", () => {
  it("passes the full conformance suite", async () => {
    const report = await runAdapterConformance(createFixtureAdapter(), conformanceOptions());
    expect(report.checks).toEqual(
      expect.arrayContaining([
        "capabilities declared",
        "validateBinding accepts valid binding",
        "validateBinding rejects invalid resource kind",
        "validateBinding rejects unsupported required signal",
        "requests stay on declared hosts and methods",
        "requests carry abort signals and no unexpected headers",
        "collect result is schema-valid",
        "timestamps are safe",
        "no serialized secret",
        "oversized response rejected",
        "abort deadline honored",
        "errors use the closed taxonomy"
      ])
    );
  });

  it("maps HTTP statuses to the closed collector taxonomy", async () => {
    const adapter = createFixtureAdapter();
    const binding = buildMonitoringBinding();
    const credential = createCredentialHandle("railway-primary", "railway", CANARY);

    const run = (status: number, headers?: Record<string, string>) =>
      adapter.collect(
        {
          binding,
          credential,
          fetch: async () => new Response("x", { status, headers }),
          now: "2026-09-11T06:00:00Z"
        },
        new AbortController().signal
      );

    await expect(run(401)).rejects.toMatchObject({ name: "AdapterError", code: "authentication_failed" });
    await expect(run(403)).rejects.toMatchObject({ name: "AdapterError", code: "permission_denied" });
    await expect(run(429, { "retry-after": "120" })).rejects.toMatchObject({
      name: "AdapterError",
      code: "rate_limited",
      retryAfterSeconds: 120
    });
    await expect(run(500)).rejects.toMatchObject({ name: "AdapterError", code: "malformed_response" });
  });

  it("rejects malformed evidence bodies", async () => {
    const adapter = createFixtureAdapter();
    await expect(
      adapter.collect(
        {
          binding: buildMonitoringBinding(),
          credential: createCredentialHandle("railway-primary", "railway", CANARY),
          fetch: async () => new Response("not json", { status: 200 }),
          now: "2026-09-11T06:00:00Z"
        },
        new AbortController().signal
      )
    ).rejects.toMatchObject({ name: "AdapterError", code: "malformed_response" });
  });

  it("validateBinding flags wrong resource kinds and unsupported required signals", () => {
    const adapter = createFixtureAdapter();
    expect(adapter.validateBinding(buildMonitoringBinding()).ok).toBe(true);
    // Deliberately invalid bindings must bypass the strict schema (it rejects
    // them earlier), so construct them by spreading a valid parse.
    const wrongKind = { ...buildMonitoringBinding(), resource_kind: "project" };
    expect(adapter.validateBinding(wrongKind).ok).toBe(false);
    // Fixture declares deployment/runtime/usage; platform_incident is unsupported.
    const unsupported = { ...buildMonitoringBinding({ probe: undefined }), required_signals: ["platform_incident" as const] };
    expect(adapter.validateBinding(unsupported).ok).toBe(false);
  });
});

describe("conformance harness rejects non-conforming adapters", () => {
  function brokenAdapter(mutate: (adapter: MonitoringAdapter) => void): MonitoringAdapter {
    const base = createFixtureAdapter();
    const adapter: MonitoringAdapter = {
      provider: base.provider,
      version: base.version,
      capabilities: (binding) => base.capabilities(binding),
      validateBinding: (binding) => base.validateBinding(binding),
      collect: (input, signal) => base.collect(input, signal)
    };
    mutate(adapter);
    return adapter;
  }

  async function expectViolation(adapter: MonitoringAdapter, match: RegExp | string) {
    try {
      await runAdapterConformance(adapter, conformanceOptions());
    } catch (error) {
      expect(error).toBeInstanceOf(ConformanceViolation);
      expect((error as ConformanceViolation).violations.join("\n")).toMatch(match);
      return;
    }
    expect.unreachable("expected a conformance violation");
  }

  it("fails an adapter that calls an undeclared host", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async (input) => {
        await input.fetch("https://evil.example.net/api", { method: "GET", signal: new AbortController().signal });
        return { adapter: { version: "x", capabilities: [] }, deployment: null, runtime: null, usage: [], platform_incident: null };
      };
    });
    await expectViolation(adapter, /host/i);
  });

  it("fails an adapter that omits the abort signal", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async (input) => {
        await input.fetch("https://fixture-collector.invalid/v1/collect/x", { method: "GET" });
        return { adapter: { version: "x", capabilities: [] }, deployment: null, runtime: null, usage: [], platform_incident: null };
      };
    });
    await expectViolation(adapter, /abort|signal/i);
  });

  it("fails an adapter that sets unexpected headers", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async (input) => {
        await input.fetch("https://fixture-collector.invalid/v1/collect/x", {
          method: "GET",
          headers: { "x-custom": "nope" },
          signal: new AbortController().signal
        });
        return { adapter: { version: "x", capabilities: [] }, deployment: null, runtime: null, usage: [], platform_incident: null };
      };
    });
    await expectViolation(adapter, /header/i);
  });

  it("fails an adapter whose result is not schema-valid", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async (input) => {
        await input.fetch("https://fixture-collector.invalid/v1/collect/x", {
          method: "GET",
          signal: new AbortController().signal
        });
        return {
          adapter: { version: "x", capabilities: [] },
          deployment: { state: "banana", observed_at: NOW },
          runtime: null,
          usage: [],
          platform_incident: null
        } as never;
      };
    });
    await expectViolation(adapter, /schema/i);
  });

  it("fails an adapter that serializes the credential", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async (input) => {
        await input.fetch("https://fixture-collector.invalid/v1/collect/x", {
          method: "GET",
          signal: new AbortController().signal
        });
        return {
          adapter: { version: "x", capabilities: [] },
          deployment: { state: "succeeded", observed_at: NOW },
          runtime: { state: "unknown", observed_at: NOW, detail: `token was ${input.credential.authorizationHeader()}` },
          usage: [],
          platform_incident: null
        };
      };
    });
    await expectViolation(adapter, /secret/i);
  });

  it("fails an adapter that throws outside the closed taxonomy", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async () => {
        throw new Error("raw boom");
      };
    });
    await expectViolation(adapter, /taxonomy|AdapterError/i);
  });

  it("fails an adapter that ignores an aborted signal", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async () => {
        throw new AdapterError("malformed_response", "ignored abort");
      };
    });
    await expectViolation(adapter, /abort/i);
  });
});

describe("createRecordingTransport", () => {
  it("records method, headers, body, and signal for inspection", async () => {
    const { fetch, requests } = createRecordingTransport(() => ({ status: 200, body: "{}" }));
    const controller = new AbortController();
    await fetch("https://fixture-collector.invalid/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{q:1}",
      signal: controller.signal
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "POST", body: "{q:1}" });
    expect(requests[0].signal).toBe(controller.signal);
  });
});
