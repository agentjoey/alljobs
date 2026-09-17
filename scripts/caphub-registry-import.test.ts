// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  parseCaphubRegistryImportArgs,
  resolveRegistryImportConfig,
  runCaphubRegistryImport
} from "./caphub-registry-import";

const DIGEST = "a".repeat(64);

describe("caphub-registry-import command boundary", () => {
  it("defaults to dry-run and requires exact digest plus confirmation for apply", () => {
    expect(parseCaphubRegistryImportArgs([])).toEqual({ action: "dry-run" });
    expect(parseCaphubRegistryImportArgs(["--dry-run"])).toEqual({ action: "dry-run" });
    expect(parseCaphubRegistryImportArgs([
      "--apply", "--digest", DIGEST, "--confirm", "IMPORT-CAPHUB-CAPTURES"
    ])).toEqual({ action: "apply", expectedSourceDigest: DIGEST });
    for (const args of [
      ["--apply"], ["--apply", "--digest", DIGEST],
      ["--apply", "--digest", DIGEST, "--confirm", "wrong"],
      ["--root", "/tmp"], ["--database-url", "postgresql://secret"], ["--sql", "select 1"]
    ]) expect(() => parseCaphubRegistryImportArgs(args)).toThrow();
  });

  it("does not load mutation dependencies for dry-run", async () => {
    const plan = vi.fn(async () => ({ schema_version: 1, source_digest: DIGEST, captures: [], counts: { captures: 0, events: 0, objects: 0 } }));
    const apply = vi.fn();
    await expect(runCaphubRegistryImport([], { plan, apply })).resolves.toMatchObject({ source_digest: DIGEST });
    expect(apply).not.toHaveBeenCalled();
  });

  it("allows the operator-only importer while outer Caphub is safe-off", () => {
    const registry = resolveRegistryImportConfig({
      caphub: {
        enabled: false,
        registry: {
          enabled: true,
          databaseUrlEnv: "CAPHUB_DATABASE_URL",
          migrationDatabaseUrlEnv: "CAPHUB_MIGRATION_DATABASE_URL",
          connectionMode: "local_socket",
          maxConnections: 2,
          statementTimeoutMs: 5_000
        }
      }
    });

    expect(registry.enabled).toBe(true);
    expect(() => resolveRegistryImportConfig({
      caphub: { enabled: true, registry: { ...registry, enabled: false } }
    })).toThrow("Caphub Registry must be enabled for import");
  });
});
