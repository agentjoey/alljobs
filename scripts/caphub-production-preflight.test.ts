import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProductionPreflightReport,
  readObjectTransferEvidence,
  runProductionPreflight,
  type ProductionPreflightSnapshot
} from "./caphub-production-preflight";

const DIGEST = "a".repeat(64);
const tempRoots: string[] = [];

function privateHome(): string {
  const home = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "caphub-preflight-")));
  tempRoots.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => {
    await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true }));
  }));
});

function safeSnapshot(): ProductionPreflightSnapshot {
  return {
    buildSha: "50abeae8719f297a44955b076f9a9d7299f5abbe",
    nextVersion: "16.3.3",
    appLoopbackOnly: true,
    postgres: {
      postgresVersion: "17.11",
      connectionMode: "local_socket",
      tcpListenAddresses: "",
      database: "caphub",
      appRole: "caphub_app",
      migratorRole: "caphub_migrator",
      appliedMigrations: [{ id: "001_registry", checksum: DIGEST }],
      pendingMigrations: ["002_read_models", "003_exports"],
      appCanMigrate: false,
      appCanUpdateAppendOnly: false,
      ready: false
    },
    captureImport: { sourceDigest: DIGEST, captureCount: 3, matchesRegistry: false },
    objectTransfer: { sourceDigest: DIGEST, objectCount: 3, matchesRemote: false },
    recovery: { verified: false },
    providers: {
      minimaxConfigured: true,
      kimiConfigured: true,
      kimiLiveCompatibility: "pending"
    },
    exports: { masterEnabled: true, enabledTargets: [] },
    runtime: { registryEnabled: false, analysisEnabled: false }
  };
}

describe("Caphub Production preflight", () => {
  it("accepts only a private canonical object-transfer attestation", () => {
    const home = privateHome();
    const activation = join(home, "state", "caphub", "activation");
    mkdirSync(activation, { recursive: true, mode: 0o700 });
    const attestation = join(activation, "object-transfer.json");
    writeFileSync(attestation, JSON.stringify({
      schema: "caphub.neon-object-transfer.v1",
      sourceDigest: DIGEST,
      objectCount: 2,
      matchesRemote: true,
      bucket: "must-not-be-emitted"
    }), { mode: 0o600 });
    expect(readObjectTransferEvidence(home)).toEqual({ sourceDigest: DIGEST, objectCount: 2, matchesRemote: true });

    chmodSync(attestation, 0o644);
    expect(readObjectTransferEvidence(home)).toEqual({
      sourceDigest: "0".repeat(64), objectCount: 0, matchesRemote: false
    });
  });

  it("emits only allowlisted metadata and never serializes secret or path-bearing dependency fields", async () => {
    const dangerous = {
      ...safeSnapshot(),
      databaseUrl: "postgresql://caphub_app:secret@localhost/caphub",
      socketDir: "/Users/operator/.alljobs/run/caphub-postgres",
      dataDir: "/Users/operator/.alljobs/postgres/caphub",
      objectRoot: "/Users/operator/.alljobs/state/caphub/objects",
      objectBucket: "caphub-objects",
      objectKey: "sha256/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      managedHostname: "ep-hidden-branch.ap-southeast-1.aws.neon.tech",
      accessKey: "private-access-key",
      targetRoot: "/Users/operator/.codex/skills",
      captureBytes: "sensitive-image-bytes",
      prompt: "private provider prompt",
      rawProviderResponse: "private provider response"
    } as ProductionPreflightSnapshot;
    let output = "";

    const report = await runProductionPreflight([], { collect: async () => dangerous }, (value) => {
      output += value;
    });

    expect(report.readyFor).toBe("PA_B");
    expect(JSON.parse(output)).toEqual(report);
    for (const forbidden of [
      "postgresql://", "/Users/", "/Volumes/", "secret", "sensitive-image-bytes",
      "private provider prompt", "private provider response", "targetRoot", "databaseUrl",
      "caphub-objects", "sha256/aa/", "ep-hidden-branch", "private-access-key"
    ]) {
      expect(output).not.toContain(forbidden);
    }
    expect(report.exports.enabledTargets).toEqual([]);
  });

  it("rejects mutation-like arguments, unsafe public strings, and enabled pilot targets", async () => {
    await expect(runProductionPreflight(["--apply"], { collect: async () => safeSnapshot() }, () => undefined))
      .rejects.toThrow("PREFLIGHT_READ_ONLY");
    expect(() => createProductionPreflightReport({ ...safeSnapshot(), buildSha: "https://user:secret@example.test" }))
      .toThrow("PREFLIGHT_UNSAFE_REPORT");
    expect(() => createProductionPreflightReport({
      ...safeSnapshot(),
      exports: { masterEnabled: true, enabledTargets: ["codex"] }
    })).toThrow("PREFLIGHT_TARGETS_ENABLED");
  });

  it("accepts PostgreSQL 18 only as managed TLS evidence without exposing a listener address", () => {
    const managed = safeSnapshot();
    managed.postgres = {
      ...managed.postgres,
      postgresVersion: "18.0",
      connectionMode: "tls_verify_full",
      tcpListenAddresses: "managed_tls"
    };
    expect(createProductionPreflightReport(managed).postgres).toMatchObject({
      postgresVersion: "18.0",
      connectionMode: "tls_verify_full",
      tcpListenAddresses: "managed_tls"
    });

    expect(() => createProductionPreflightReport({
      ...managed,
      postgres: { ...managed.postgres, connectionMode: "local_socket", tcpListenAddresses: "" }
    })).toThrow("PREFLIGHT_UNSAFE_REPORT");
  });

  it("rejects PostgreSQL versions with any unallowlisted prefix or suffix", () => {
    for (const postgresVersion of ["xunknowny", "xunavailable", "18.1 internal-host.example"]) {
      expect(() => createProductionPreflightReport({
        ...safeSnapshot(),
        postgres: { ...safeSnapshot().postgres, postgresVersion }
      })).toThrow("PREFLIGHT_UNSAFE_REPORT");
    }
  });

  it("advances only from verified Registry/import/remote-object/recovery evidence and never treats pending Kimi as S4", () => {
    const readyForCutover = safeSnapshot();
    readyForCutover.postgres = { ...readyForCutover.postgres, pendingMigrations: [], ready: true };
    readyForCutover.captureImport.matchesRegistry = true;
    readyForCutover.objectTransfer.matchesRemote = true;
    readyForCutover.runtime.registryEnabled = true;

    expect(createProductionPreflightReport(readyForCutover).readyFor).toBe("PA_B");

    readyForCutover.recovery.verified = true;

    expect(createProductionPreflightReport(readyForCutover).readyFor).toBe("PA_D");

    readyForCutover.runtime.analysisEnabled = false;
    readyForCutover.postCutoverVerified = true;
    expect(createProductionPreflightReport(readyForCutover).readyFor).toBe("PA_C");

    readyForCutover.providers.kimiLiveCompatibility = "passed";
    expect(createProductionPreflightReport(readyForCutover).readyFor).toBe("S4");
  });
});
