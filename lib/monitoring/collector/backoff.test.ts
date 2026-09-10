import { describe, expect, it } from "vitest";
import { ProviderBackoff } from "./backoff";

// Per-provider exponential backoff with injected clock and jitter source
// (design §9): failures back the provider off exponentially, provider
// Retry-After is honored, success resets, and a per-binding minimum interval
// keeps manual refreshes from re-collecting too soon.

function makeClock(startMs: number) {
  let now = startMs;
  return {
    now: () => now,
    advanceSeconds: (seconds: number) => {
      now += seconds * 1000;
    }
  };
}

const T0 = Date.parse("2026-09-11T06:00:00Z");

describe("ProviderBackoff", () => {
  it("allows a provider with no history", () => {
    const clock = makeClock(T0);
    const backoff = new ProviderBackoff({ now: clock.now, random: () => 0.5 });
    expect(backoff.check("railway", "proj/binding")).toEqual({ allowed: true });
  });

  it("backs off exponentially with injected jitter", () => {
    const clock = makeClock(T0);
    // random() = 1 picks the top of the equal-jitter band: full delay.
    const backoff = new ProviderBackoff({
      now: clock.now,
      random: () => 1,
      policy: { baseDelaySeconds: 60, maxDelaySeconds: 3600, minIntervalSeconds: 0 }
    });

    const first = backoff.recordFailure("railway");
    expect(first.retryAfterSeconds).toBe(60); // 60 * 2^0
    const second = backoff.recordFailure("railway");
    expect(second.retryAfterSeconds).toBe(120); // 60 * 2^1
    const third = backoff.recordFailure("railway");
    expect(third.retryAfterSeconds).toBe(240); // 60 * 2^2
  });

  it("jitter keeps the delay inside [delay/2, delay]", () => {
    const clock = makeClock(T0);
    const lows = new ProviderBackoff({
      now: clock.now,
      random: () => 0,
      policy: { baseDelaySeconds: 60, maxDelaySeconds: 3600, minIntervalSeconds: 0 }
    });
    expect(lows.recordFailure("railway").retryAfterSeconds).toBe(30);
  });

  it("blocks check() during the backoff window and allows it afterwards", () => {
    const clock = makeClock(T0);
    const backoff = new ProviderBackoff({
      now: clock.now,
      random: () => 1,
      policy: { baseDelaySeconds: 60, maxDelaySeconds: 3600, minIntervalSeconds: 0 }
    });
    backoff.recordFailure("railway");

    const denied = backoff.check("railway", "proj/binding");
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.reason).toBe("provider_backoff");
      expect(denied.retryAfterSeconds).toBe(60);
      expect(Date.parse(denied.retryAt)).toBe(T0 + 60_000);
    }

    clock.advanceSeconds(59);
    expect(backoff.check("railway", "proj/binding").allowed).toBe(false);
    clock.advanceSeconds(1);
    expect(backoff.check("railway", "proj/binding").allowed).toBe(true);
  });

  it("honors a provider Retry-After that exceeds the computed backoff", () => {
    const clock = makeClock(T0);
    const backoff = new ProviderBackoff({
      now: clock.now,
      random: () => 1,
      policy: { baseDelaySeconds: 60, maxDelaySeconds: 3600, minIntervalSeconds: 0 }
    });
    const result = backoff.recordFailure("railway", { retryAfterSeconds: 900 });
    expect(result.retryAfterSeconds).toBe(900);

    clock.advanceSeconds(899);
    expect(backoff.check("railway").allowed).toBe(false);
    clock.advanceSeconds(1);
    expect(backoff.check("railway").allowed).toBe(true);
  });

  it("keeps the larger of computed backoff and Retry-After", () => {
    const clock = makeClock(T0);
    const backoff = new ProviderBackoff({
      now: clock.now,
      random: () => 1,
      policy: { baseDelaySeconds: 60, maxDelaySeconds: 3600, minIntervalSeconds: 0 }
    });
    backoff.recordFailure("railway");
    const second = backoff.recordFailure("railway", { retryAfterSeconds: 5 });
    expect(second.retryAfterSeconds).toBe(120); // computed backoff wins
  });

  it("caps the delay at maxDelaySeconds", () => {
    const clock = makeClock(T0);
    const backoff = new ProviderBackoff({
      now: clock.now,
      random: () => 1,
      policy: { baseDelaySeconds: 60, maxDelaySeconds: 120, minIntervalSeconds: 0 }
    });
    backoff.recordFailure("railway");
    backoff.recordFailure("railway");
    const third = backoff.recordFailure("railway");
    expect(third.retryAfterSeconds).toBe(120);
  });

  it("isolates backoff state per provider", () => {
    const clock = makeClock(T0);
    const backoff = new ProviderBackoff({
      now: clock.now,
      random: () => 1,
      policy: { baseDelaySeconds: 60, maxDelaySeconds: 3600, minIntervalSeconds: 0 }
    });
    backoff.recordFailure("railway");
    expect(backoff.check("railway").allowed).toBe(false);
    expect(backoff.check("fly").allowed).toBe(true);
  });

  it("resets the failure count on success", () => {
    const clock = makeClock(T0);
    const backoff = new ProviderBackoff({
      now: clock.now,
      random: () => 1,
      policy: { baseDelaySeconds: 60, maxDelaySeconds: 3600, minIntervalSeconds: 0 }
    });
    backoff.recordFailure("railway");
    backoff.recordFailure("railway");
    clock.advanceSeconds(3600);
    backoff.recordSuccess("railway");
    expect(backoff.check("railway").allowed).toBe(true);
    const again = backoff.recordFailure("railway");
    expect(again.retryAfterSeconds).toBe(60); // back to base delay
  });

  it("enforces a per-binding minimum interval between attempts", () => {
    const clock = makeClock(T0);
    const backoff = new ProviderBackoff({
      now: clock.now,
      random: () => 1,
      policy: { baseDelaySeconds: 60, maxDelaySeconds: 3600, minIntervalSeconds: 300 }
    });
    backoff.recordAttempt("railway", "proj/binding-a");

    const denied = backoff.check("railway", "proj/binding-a");
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.reason).toBe("minimum_interval");
      expect(Date.parse(denied.retryAt)).toBe(T0 + 300_000);
    }

    // A different binding on the same provider is not blocked by the interval.
    expect(backoff.check("railway", "proj/binding-b").allowed).toBe(true);

    clock.advanceSeconds(300);
    expect(backoff.check("railway", "proj/binding-a").allowed).toBe(true);
  });

  it("reports provider backoff before the minimum interval when both apply", () => {
    const clock = makeClock(T0);
    const backoff = new ProviderBackoff({
      now: clock.now,
      random: () => 1,
      policy: { baseDelaySeconds: 600, maxDelaySeconds: 3600, minIntervalSeconds: 300 }
    });
    backoff.recordAttempt("railway", "proj/binding-a");
    backoff.recordFailure("railway");
    const denied = backoff.check("railway", "proj/binding-a");
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.reason).toBe("provider_backoff");
    }
  });
});
