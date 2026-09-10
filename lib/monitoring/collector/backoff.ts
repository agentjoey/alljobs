// Per-provider backoff (design §9): exponential delay with equal jitter from
// an injected random source, provider Retry-After honored as a floor, success
// resets the ladder, and a per-binding minimum interval keeps manual refreshes
// from re-collecting inside the configured cadence. The clock is injected; no
// timers are created here.

export interface BackoffPolicy {
  /** First-retry delay in seconds; doubles per consecutive failure. */
  baseDelaySeconds: number;
  /** Hard cap for the computed delay. */
  maxDelaySeconds: number;
  /** Minimum seconds between attempts for the same binding key. */
  minIntervalSeconds: number;
}

export const DEFAULT_BACKOFF_POLICY: BackoffPolicy = {
  baseDelaySeconds: 60,
  maxDelaySeconds: 3600,
  minIntervalSeconds: 300
};

export type BackoffDenyReason = "provider_backoff" | "minimum_interval";

export type BackoffCheck =
  | { allowed: true }
  | { allowed: false; reason: BackoffDenyReason; retryAt: string; retryAfterSeconds: number };

interface ProviderState {
  failures: number;
  blockedUntilMs: number;
}

export interface BackoffDeps {
  /** Injected clock, epoch milliseconds. */
  now?: () => number;
  /** Injected uniform [0,1) random source for jitter. */
  random?: () => number;
  policy?: Partial<BackoffPolicy>;
}

export class ProviderBackoff {
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly policy: BackoffPolicy;
  private readonly providers = new Map<string, ProviderState>();
  private readonly lastAttemptMs = new Map<string, number>();

  constructor(deps: BackoffDeps = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? (() => Math.random());
    this.policy = { ...DEFAULT_BACKOFF_POLICY, ...deps.policy };
  }

  /**
   * Records a provider failure and returns the deny window. Equal jitter:
   * half the computed delay plus a random share of the other half. A
   * provider-supplied Retry-After is honored as a floor, never a reduction.
   */
  recordFailure(provider: string, options?: { retryAfterSeconds?: number }): { retryAt: string; retryAfterSeconds: number } {
    const state = this.providers.get(provider) ?? { failures: 0, blockedUntilMs: 0 };
    state.failures += 1;

    const computed = Math.min(
      this.policy.maxDelaySeconds,
      this.policy.baseDelaySeconds * 2 ** (state.failures - 1)
    );
    const jittered = Math.floor(computed / 2 + this.random() * (computed / 2));
    const waitSeconds = Math.max(jittered, Math.floor(options?.retryAfterSeconds ?? 0));
    state.blockedUntilMs = this.now() + waitSeconds * 1000;
    this.providers.set(provider, state);

    return {
      retryAt: new Date(state.blockedUntilMs).toISOString(),
      retryAfterSeconds: waitSeconds
    };
  }

  recordSuccess(provider: string): void {
    this.providers.delete(provider);
  }

  /** Marks an attempt for the binding key's minimum-interval accounting. */
  recordAttempt(provider: string, bindingKey?: string): void {
    if (bindingKey) {
      this.lastAttemptMs.set(`${provider}/${bindingKey}`, this.now());
    }
  }

  check(provider: string, bindingKey?: string): BackoffCheck {
    const nowMs = this.now();

    const state = this.providers.get(provider);
    if (state && state.blockedUntilMs > nowMs) {
      return {
        allowed: false,
        reason: "provider_backoff",
        retryAt: new Date(state.blockedUntilMs).toISOString(),
        retryAfterSeconds: Math.ceil((state.blockedUntilMs - nowMs) / 1000)
      };
    }

    if (bindingKey) {
      const last = this.lastAttemptMs.get(`${provider}/${bindingKey}`);
      if (last !== undefined) {
        const elapsedSeconds = (nowMs - last) / 1000;
        if (elapsedSeconds < this.policy.minIntervalSeconds) {
          const retryAtMs = last + this.policy.minIntervalSeconds * 1000;
          return {
            allowed: false,
            reason: "minimum_interval",
            retryAt: new Date(retryAtMs).toISOString(),
            retryAfterSeconds: Math.ceil((retryAtMs - nowMs) / 1000)
          };
        }
      }
    }

    return { allowed: true };
  }
}
