import type { MonitoringProvider, RequiredSignal } from "../domain/schemas";
import type {
  AdapterMetadata,
  DeploymentSignal,
  MonitoringBinding,
  PlatformIncidentSignal,
  RuntimeSignal,
  UsageMeasure
} from "../domain/types";

// Shared adapter contract (design §13). Every provider adapter implements
// MonitoringAdapter with fixed endpoints, request shapes, methods, and
// response-size limits compiled into code. Adapters never read browser input,
// never write storage, and never see a raw token outside the opaque
// CredentialHandle method boundary.

/** Maximum provider response body an adapter may read, in bytes. */
export const ADAPTER_MAX_RESPONSE_BYTES = 1024 * 1024;
/** Maximum request body (fixed query documents) an adapter may send, in bytes. */
export const ADAPTER_MAX_REQUEST_BODY_BYTES = 16 * 1024;
/** Per-request abort deadline every adapter request must honor. */
export const ADAPTER_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Closed collector error taxonomy (design §7.2). Provider failures map to
 * exactly one of these codes; there is no free-form error channel.
 */
export const ADAPTER_ERROR_CODES = [
  "authentication_failed",
  "permission_denied",
  "rate_limited",
  "timeout",
  "malformed_response",
  "unsupported_capability"
] as const;
export type AdapterErrorCode = (typeof ADAPTER_ERROR_CODES)[number];

/**
 * The only error an adapter may throw from collect(). Messages are
 * human-safe and must never contain tokens, headers, or raw response bodies.
 */
export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  readonly retryAfterSeconds?: number;
  constructor(code: AdapterErrorCode, message: string, options?: { retryAfterSeconds?: number }) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
    if (options?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

export function isAdapterError(error: unknown): error is AdapterError {
  return error instanceof AdapterError && (ADAPTER_ERROR_CODES as readonly string[]).includes(error.code);
}

/** Injected fetch seam. Adapters and probes never touch the global fetch. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: "manual" | "follow";
    signal?: AbortSignal | null;
  }
) => Promise<Response>;

/** Injected DNS seam returning resolved address literals for a hostname. */
export type DnsLookup = (hostname: string) => Promise<string[]>;

/**
 * Opaque credential handle handed to adapter.collect. The token lives behind
 * the authorizationHeader() method boundary and is never an enumerable
 * property, so no JSON serialization of the handle can contain it.
 */
export interface CredentialHandle {
  readonly ref: string;
  readonly provider: MonitoringProvider;
  authorizationHeader(): string;
}

/** Request headers an adapter is allowed to set; nothing else may appear. */
export const ADAPTER_ALLOWED_REQUEST_HEADERS = ["authorization", "content-type", "accept"] as const;

/**
 * Static capability declaration for one adapter/binding pair. `apiHosts` is
 * the complete set of hostnames the adapter may contact; `methods` is the
 * complete set of HTTP methods it may use; `signalMaxAgeSeconds` is the
 * per-signal maximum trustworthy age used for freshness derivation.
 */
export interface AdapterCapabilities {
  readonly resourceKinds: readonly string[];
  readonly supportedSignals: readonly RequiredSignal[];
  readonly consoleHosts: readonly string[];
  readonly implemented: boolean;
  readonly apiHosts: readonly string[];
  readonly methods: readonly ("GET" | "POST" | "HEAD")[];
  readonly signalMaxAgeSeconds: Readonly<Partial<Record<RequiredSignal, number>>>;
}

export interface AdapterCollectInput {
  readonly binding: MonitoringBinding;
  readonly credential: CredentialHandle;
  readonly fetch: FetchLike;
  /** Injected Control Host receipt time (ISO timestamp). */
  readonly now: string;
}

/**
 * Schema-validated normalized evidence returned by collect(). Every signal
 * parses through the strict domain schemas; adapters return evidence only and
 * never assemble or persist snapshots.
 */
export interface AdapterCollectResult {
  readonly adapter: AdapterMetadata;
  readonly deployment: DeploymentSignal | null;
  readonly runtime: RuntimeSignal | null;
  readonly usage: readonly UsageMeasure[];
  readonly platform_incident: PlatformIncidentSignal | null;
}

export type BindingValidation = { ok: true } | { ok: false; issues: string[] };

export interface MonitoringAdapter {
  readonly provider: MonitoringProvider;
  readonly version: string;
  capabilities(binding: MonitoringBinding): AdapterCapabilities;
  validateBinding(binding: MonitoringBinding): BindingValidation;
  collect(input: AdapterCollectInput, signal: AbortSignal): Promise<AdapterCollectResult>;
}
