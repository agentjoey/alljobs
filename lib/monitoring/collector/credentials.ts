import type { CredentialHandle } from "../adapters/contracts";
import type { MonitoringProvider } from "../domain/schemas";

// Server-side credential resolution (design §12.1). Control Host config maps
// credential_ref → { provider, tokenEnv }; the secret value lives only in the
// process environment. Resolution returns an opaque handle whose token sits
// behind a closure — never an own property — so no thrown, logged, inspected,
// or JSON-serialized form can carry it. Error messages name the ref and the
// environment variable NAME only, never a value.

export type CredentialErrorCode =
  | "credential_ref_unknown"
  | "credential_provider_mismatch"
  | "credential_env_missing"
  | "credential_env_empty";

export class CredentialError extends Error {
  readonly code: CredentialErrorCode;
  constructor(code: CredentialErrorCode, message: string) {
    super(message);
    this.name = "CredentialError";
    this.code = code;
  }
}

export interface CredentialConfigEntry {
  provider: MonitoringProvider;
  tokenEnv: string;
}

/** Builds an opaque handle; the token is captured by closure only. */
export function createCredentialHandle(
  ref: string,
  provider: MonitoringProvider,
  token: string
): CredentialHandle {
  const authorizationHeader = () => `Bearer ${token}`;
  const handle: CredentialHandle = {
    ref,
    provider,
    authorizationHeader
  };
  // Redaction for every serialization channel: JSON, template strings, and
  // node:util.inspect all see only the reference, never the token.
  Object.defineProperties(handle, {
    toJSON: {
      enumerable: false,
      value: () => ({ ref, provider, redacted: true })
    },
    toString: {
      enumerable: false,
      value: () => `[CredentialHandle ${ref} (redacted)]`
    },
    [Symbol.for("nodejs.util.inspect.custom")]: {
      enumerable: false,
      value: () => `[CredentialHandle ${ref} (redacted)]`
    }
  });
  return handle;
}

/**
 * Resolves a binding's credential_ref to an opaque handle. Fails closed on a
 * missing ref, a provider mismatch, or a missing/empty environment value.
 */
export function resolveMonitoringCredential(
  ref: string,
  expectedProvider: MonitoringProvider,
  credentials: Record<string, CredentialConfigEntry> | undefined,
  env: Record<string, string | undefined>
): CredentialHandle {
  const entry = credentials?.[ref];
  if (!entry) {
    throw new CredentialError(
      "credential_ref_unknown",
      `credential_ref '${ref}' is not declared in Control Host monitoring credentials`
    );
  }
  if (entry.provider !== expectedProvider) {
    throw new CredentialError(
      "credential_provider_mismatch",
      `credential_ref '${ref}' is a ${entry.provider} credential but the binding targets ${expectedProvider}`
    );
  }
  const value = env[entry.tokenEnv];
  if (value === undefined) {
    throw new CredentialError(
      "credential_env_missing",
      `environment variable '${entry.tokenEnv}' for credential_ref '${ref}' is not set`
    );
  }
  if (value.trim().length === 0) {
    throw new CredentialError(
      "credential_env_empty",
      `environment variable '${entry.tokenEnv}' for credential_ref '${ref}' is empty`
    );
  }
  return createCredentialHandle(ref, entry.provider, value);
}
