import {
  adapterMetadataSchema,
  deploymentSignalSchema,
  platformIncidentSignalSchema,
  runtimeSignalSchema,
  usageMeasureSchema
} from "../domain/schemas";
import type { MonitoringBinding } from "../domain/types";
import {
  ADAPTER_ALLOWED_REQUEST_HEADERS,
  ADAPTER_MAX_REQUEST_BODY_BYTES,
  ADAPTER_MAX_RESPONSE_BYTES,
  isAdapterError,
  type AdapterCollectResult,
  type CredentialHandle,
  type FetchLike,
  type MonitoringAdapter
} from "./contracts";

// Common adapter conformance harness (design §13). A new adapter cannot ship
// until runAdapterConformance passes: fixed hosts/methods, abort deadlines,
// size limits, the closed error taxonomy, safe timestamps, unsupported
// capability representation, and no serialized secret or raw response.

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  signal: AbortSignal | null | undefined;
  redirect?: string;
}

export interface TransportResponse {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

export type TransportResponder = (request: RecordedRequest) => TransportResponse | Promise<TransportResponse>;

/** A fetch seam that records every request and answers from a script. */
export function createRecordingTransport(respond: TransportResponder): { fetch: FetchLike; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const recorded: RecordedRequest = {
      url,
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: init?.body ?? null,
      signal: init?.signal,
      redirect: init?.redirect
    };
    requests.push(recorded);
    const answer = await respond(recorded);
    return new Response(answer.body ?? null, { status: answer.status, headers: answer.headers });
  };
  return { fetch: fetchImpl, requests };
}

export class ConformanceViolation extends Error {
  readonly violations: string[];
  constructor(violations: string[]) {
    super(`adapter conformance failed:\n${violations.map((violation) => `- ${violation}`).join("\n")}`);
    this.name = "ConformanceViolation";
    this.violations = violations;
  }
}

export interface ConformanceOptions {
  /** A valid binding for this adapter. */
  binding: MonitoringBinding;
  /** Opaque credential handle carrying a known canary token. */
  credential: CredentialHandle;
  /** Injected receipt time used as the "not in the future" boundary. */
  now: string;
  /** Canary secret values that must never appear in any serialized form. */
  secrets: string[];
  /** Success-path response script. */
  respond: TransportResponder;
}

export interface ConformanceReport {
  provider: string;
  version: string;
  checks: string[];
}

const FORBIDDEN_KEY_PATTERN = /token|secret|authorization|password|cookie|header|raw|body|log/i;
const ALLOWED_METHODS = new Set(["GET", "POST", "HEAD"]);
const TIMESTAMP_KEYS = new Set(["observed_at", "provider_reported_at", "attempted_at"]);

function collectKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, into);
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      into.push(key);
      collectKeys(entry, into);
    }
  }
  return into;
}

function collectTimestamps(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectTimestamps(entry, into);
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (TIMESTAMP_KEYS.has(key) && typeof entry === "string") into.push(entry);
      collectTimestamps(entry, into);
    }
  }
  return into;
}

function assertResultSchemaValid(result: AdapterCollectResult, adapter: MonitoringAdapter, violations: string[]): void {
  try {
    adapterMetadataSchema.parse(result.adapter);
    if (result.adapter.version !== adapter.version) {
      violations.push("collect result adapter metadata version does not match the adapter's declared version");
    }
    if (result.deployment !== null) deploymentSignalSchema.parse(result.deployment);
    if (result.runtime !== null) runtimeSignalSchema.parse(result.runtime);
    for (const measure of result.usage) usageMeasureSchema.parse(measure);
    if (result.platform_incident !== null) platformIncidentSignalSchema.parse(result.platform_incident);
  } catch (error) {
    violations.push(`collect result is not schema-valid: ${(error as Error).message}`);
  }
}

function assertSecretFree(value: unknown, secrets: string[], where: string, violations: string[]): void {
  const serialized = JSON.stringify(value) ?? "";
  for (const secret of secrets) {
    if (secret.length > 0 && serialized.includes(secret)) {
      violations.push(`secret value appears in serialized ${where}`);
    }
  }
  const forbiddenKey = collectKeys(value).find((key) => FORBIDDEN_KEY_PATTERN.test(key));
  if (forbiddenKey) {
    violations.push(`serialized ${where} carries forbidden key '${forbiddenKey}'`);
  }
}

/**
 * Runs the full conformance battery against an adapter. Every scenario is
 * executed even after failures so the violation list is complete; a non-empty
 * list throws ConformanceViolation.
 */
export async function runAdapterConformance(
  adapter: MonitoringAdapter,
  options: ConformanceOptions
): Promise<ConformanceReport> {
  const violations: string[] = [];
  const checks: string[] = [];
  const pass = (name: string) => {
    checks.push(name);
  };

  // --- capabilities declaration ---
  const capabilities = adapter.capabilities(options.binding);
  if (!capabilities.implemented) {
    violations.push("capabilities must declare implemented: true for a collectible adapter");
  }
  if (capabilities.apiHosts.length === 0) {
    violations.push("capabilities must declare the fixed apiHosts the adapter may contact");
  }
  const badMethod = capabilities.methods.find((method) => !ALLOWED_METHODS.has(method));
  if (badMethod) {
    violations.push(`capabilities declare disallowed method '${badMethod}'`);
  }
  if (capabilities.implemented && capabilities.apiHosts.length > 0 && !badMethod) {
    pass("capabilities declared");
  }

  // --- validateBinding ---
  const validResult = adapter.validateBinding(options.binding);
  if (!validResult.ok) {
    violations.push(`validateBinding rejected the valid binding: ${validResult.issues.join("; ")}`);
  } else {
    pass("validateBinding accepts valid binding");
  }
  const wrongKind = adapter.validateBinding({ ...options.binding, resource_kind: "__invalid__" });
  if (wrongKind.ok) {
    violations.push("validateBinding accepted an invalid resource kind");
  } else {
    pass("validateBinding rejects invalid resource kind");
  }
  const unsupported = (["deployment", "runtime", "usage", "platform_incident"] as const).find(
    (signal) => !capabilities.supportedSignals.includes(signal)
  );
  if (unsupported) {
    const unsupportedResult = adapter.validateBinding({
      ...options.binding,
      required_signals: [unsupported],
      probe: undefined
    });
    if (unsupportedResult.ok) {
      violations.push(`validateBinding accepted unsupported required signal '${unsupported}'`);
    } else {
      pass("validateBinding rejects unsupported required signal");
    }
  }

  // --- success scenario ---
  const { fetch, requests } = createRecordingTransport(options.respond);
  let result: AdapterCollectResult | null = null;
  try {
    result = await adapter.collect(
      { binding: options.binding, credential: options.credential, fetch, now: options.now },
      new AbortController().signal
    );
  } catch (error) {
    if (isAdapterError(error)) {
      violations.push(`success scenario threw AdapterError '${error.code}': ${error.message}`);
    } else {
      violations.push(`success scenario threw outside the closed taxonomy: ${String(error)}`);
    }
  }

  if (requests.length > 0) {
    let boundaryOk = true;
    for (const request of requests) {
      let url: URL;
      try {
        url = new URL(request.url);
      } catch {
        violations.push(`request URL is not parseable: ${request.url}`);
        boundaryOk = false;
        continue;
      }
      if (url.protocol !== "https:") {
        violations.push(`request to non-HTTPS URL: ${request.url}`);
        boundaryOk = false;
      }
      if (!capabilities.apiHosts.includes(url.hostname)) {
        violations.push(`request to undeclared host '${url.hostname}' (declared: ${capabilities.apiHosts.join(", ")})`);
        boundaryOk = false;
      }
      if (!capabilities.methods.includes(request.method as "GET" | "POST" | "HEAD")) {
        violations.push(`request used undeclared method '${request.method}'`);
        boundaryOk = false;
      }
      const unexpectedHeader = Object.keys(request.headers).find(
        (header) => !(ADAPTER_ALLOWED_REQUEST_HEADERS as readonly string[]).includes(header.toLowerCase())
      );
      if (unexpectedHeader) {
        violations.push(`request set unexpected header '${unexpectedHeader}'`);
        boundaryOk = false;
      }
      if ((request.method === "GET" || request.method === "HEAD") && request.body !== null) {
        violations.push(`request method ${request.method} carried a body`);
        boundaryOk = false;
      }
      if (request.body !== null && request.body.length > ADAPTER_MAX_REQUEST_BODY_BYTES) {
        violations.push("request body exceeded the bounded request-document limit");
        boundaryOk = false;
      }
    }
    if (boundaryOk) pass("requests stay on declared hosts and methods");

    if (requests.every((request) => request.signal instanceof AbortSignal)) {
      pass("requests carry abort signals and no unexpected headers");
    } else {
      violations.push("a request was made without an abort signal");
    }
  } else {
    violations.push("adapter made no request in the success scenario");
  }

  if (result) {
    const before = violations.length;
    assertResultSchemaValid(result, adapter, violations);
    if (violations.length === before) pass("collect result is schema-valid");

    const nowMs = Date.parse(options.now);
    const future = collectTimestamps(result).find((timestamp) => Date.parse(timestamp) > nowMs);
    if (future) {
      violations.push(`timestamp '${future}' is later than the Control Host receipt time`);
    } else {
      pass("timestamps are safe");
    }

    const secretViolations = violations.length;
    assertSecretFree(result, options.secrets, "collect result", violations);
    if (violations.length === secretViolations) pass("no serialized secret");
  }

  // --- oversized response ---
  try {
    const oversized = createRecordingTransport(() => ({
      status: 200,
      body: "x".repeat(ADAPTER_MAX_RESPONSE_BYTES + 1)
    }));
    await adapter.collect(
      { binding: options.binding, credential: options.credential, fetch: oversized.fetch, now: options.now },
      new AbortController().signal
    );
    violations.push("oversized response was accepted without a size-limit error");
  } catch (error) {
    if (isAdapterError(error) && error.code === "malformed_response") {
      pass("oversized response rejected");
      assertSecretFree({ message: error.message }, options.secrets, "oversize error", violations);
    } else {
      violations.push(
        `oversized response must fail as AdapterError 'malformed_response', got ${
          isAdapterError(error) ? `'${error.code}'` : String(error)
        }`
      );
    }
  }

  // --- abort deadline ---
  try {
    const { fetch: abortFetch } = createRecordingTransport(() => ({ status: 200, body: "{}" }));
    await adapter.collect(
      { binding: options.binding, credential: options.credential, fetch: abortFetch, now: options.now },
      AbortSignal.abort()
    );
    violations.push("adapter ignored an aborted signal and returned a result");
  } catch (error) {
    if (isAdapterError(error) && error.code === "timeout") {
      pass("abort deadline honored");
    } else {
      violations.push(
        `aborted collection must fail as AdapterError 'timeout', got ${
          isAdapterError(error) ? `'${error.code}'` : String(error)
        }`
      );
    }
  }

  // --- closed error taxonomy on transport failure ---
  try {
    const failing: FetchLike = async () => {
      throw new Error("raw transport failure with internals");
    };
    await adapter.collect(
      { binding: options.binding, credential: options.credential, fetch: failing, now: options.now },
      new AbortController().signal
    );
    violations.push("adapter accepted a transport failure as success");
  } catch (error) {
    if (isAdapterError(error)) {
      pass("errors use the closed taxonomy");
      if (options.secrets.some((secret) => secret.length > 0 && String(error).includes(secret))) {
        violations.push("adapter error message contains a secret value");
      }
    } else {
      violations.push(`adapter threw outside the closed taxonomy: ${String(error)}`);
    }
  }

  if (violations.length > 0) {
    throw new ConformanceViolation(violations);
  }
  return { provider: adapter.provider, version: adapter.version, checks };
}
