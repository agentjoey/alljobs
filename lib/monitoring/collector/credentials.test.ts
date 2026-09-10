import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { createCredentialHandle, CredentialError, resolveMonitoringCredential } from "./credentials";

// Credential resolution boundary (design §12.1): secret values live only in
// the server environment; resolution returns an opaque handle whose token can
// never appear in thrown, logged, or serialized forms.

const CANARY_TOKEN = "test-canary-token-0123456789abcdef";

const CREDENTIALS = {
  "railway-primary": { provider: "railway", tokenEnv: "RAILWAY_TEST_TOKEN" }
} as const;

const ENV = { RAILWAY_TEST_TOKEN: CANARY_TOKEN };

describe("resolveMonitoringCredential", () => {
  it("returns an opaque handle for a present token", () => {
    const handle = resolveMonitoringCredential("railway-primary", "railway", CREDENTIALS, ENV);
    expect(handle.ref).toBe("railway-primary");
    expect(handle.provider).toBe("railway");
    expect(handle.authorizationHeader()).toBe(`Bearer ${CANARY_TOKEN}`);
  });

  it("rejects an unknown credential_ref", () => {
    expect(() => resolveMonitoringCredential("nope", "railway", CREDENTIALS, ENV)).toThrowError(CredentialError);
    try {
      resolveMonitoringCredential("nope", "railway", CREDENTIALS, ENV);
    } catch (error) {
      expect((error as CredentialError).code).toBe("credential_ref_unknown");
    }
  });

  it("rejects when no credentials block exists at all", () => {
    expect(() => resolveMonitoringCredential("railway-primary", "railway", undefined, ENV)).toThrowError(CredentialError);
  });

  it("rejects a provider mismatch without naming the token", () => {
    try {
      resolveMonitoringCredential("railway-primary", "fly", CREDENTIALS, ENV);
      expect.unreachable();
    } catch (error) {
      expect((error as CredentialError).code).toBe("credential_provider_mismatch");
      expect(String(error)).not.toContain(CANARY_TOKEN);
    }
  });

  it("rejects a missing environment value", () => {
    try {
      resolveMonitoringCredential("railway-primary", "railway", CREDENTIALS, {});
      expect.unreachable();
    } catch (error) {
      expect((error as CredentialError).code).toBe("credential_env_missing");
      expect(String(error)).toContain("RAILWAY_TEST_TOKEN");
    }
  });

  it("rejects an empty environment value", () => {
    try {
      resolveMonitoringCredential("railway-primary", "railway", CREDENTIALS, { RAILWAY_TEST_TOKEN: "  " });
      expect.unreachable();
    } catch (error) {
      expect((error as CredentialError).code).toBe("credential_env_empty");
    }
  });

  it("never includes the token value in any thrown error", () => {
    const attempts: Array<() => unknown> = [
      () => resolveMonitoringCredential("nope", "railway", CREDENTIALS, ENV),
      () => resolveMonitoringCredential("railway-primary", "fly", CREDENTIALS, ENV),
      () => resolveMonitoringCredential("railway-primary", "railway", CREDENTIALS, {})
    ];
    for (const attempt of attempts) {
      try {
        attempt();
        expect.unreachable();
      } catch (error) {
        expect(String(error)).not.toContain(CANARY_TOKEN);
        expect(JSON.stringify(error)).not.toContain(CANARY_TOKEN);
      }
    }
  });
});

describe("CredentialHandle redaction", () => {
  const handle = createCredentialHandle("railway-primary", "railway", CANARY_TOKEN);

  it("does not serialize the token via JSON.stringify", () => {
    const serialized = JSON.stringify(handle);
    expect(serialized).not.toContain(CANARY_TOKEN);
    expect(serialized).toContain("railway-primary");
  });

  it("does not leak the token through string conversion or util.inspect", () => {
    expect(String(handle)).not.toContain(CANARY_TOKEN);
    expect(`${handle}`).not.toContain(CANARY_TOKEN);
    expect(inspect(handle)).not.toContain(CANARY_TOKEN);
  });

  it("has no enumerable token-bearing property", () => {
    for (const key of Object.keys(handle)) {
      expect(String((handle as unknown as Record<string, unknown>)[key])).not.toContain(CANARY_TOKEN);
    }
    expect(Object.keys(handle)).not.toContain("token");
  });

  it("does not leak when embedded in a snapshot-shaped object", () => {
    const snapshotLike = { schema_version: 1, binding_id: "b", credential: handle };
    expect(JSON.stringify(snapshotLike)).not.toContain(CANARY_TOKEN);
  });
});
