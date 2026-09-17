import { describe, expect, it } from "vitest";
import {
  createProductionPreflightReport,
  runProductionPreflight,
  type ProductionPreflightSnapshot
} from "./caphub-production-preflight";

const DIGEST = "a".repeat(64);

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
    backup: { generationId: null, verified: false },
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
  it("emits only allowlisted metadata and never serializes secret or path-bearing dependency fields", async () => {
    const dangerous = {
      ...safeSnapshot(),
      databaseUrl: "postgresql://caphub_app:secret@localhost/caphub",
      socketDir: "/Users/operator/.alljobs/run/caphub-postgres",
      dataDir: "/Users/operator/.alljobs/postgres/caphub",
      objectRoot: "/Users/operator/.alljobs/state/caphub/objects",
      backupRoot: "/Volumes/private/caphub",
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
      "private provider prompt", "private provider response", "targetRoot", "databaseUrl"
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

  it("advances only from verified Registry/import/backup evidence and never treats pending Kimi as S4", () => {
    const readyForCutover = safeSnapshot();
    readyForCutover.postgres = { ...readyForCutover.postgres, pendingMigrations: [], ready: true };
    readyForCutover.captureImport.matchesRegistry = true;
    readyForCutover.backup = { generationId: "20260917T150000000Z-production", verified: true };
    readyForCutover.runtime.registryEnabled = true;

    expect(createProductionPreflightReport(readyForCutover).readyFor).toBe("PA_D");

    readyForCutover.runtime.analysisEnabled = false;
    readyForCutover.postCutoverVerified = true;
    expect(createProductionPreflightReport(readyForCutover).readyFor).toBe("PA_C");

    readyForCutover.providers.kimiLiveCompatibility = "passed";
    expect(createProductionPreflightReport(readyForCutover).readyFor).toBe("S4");
  });
});
