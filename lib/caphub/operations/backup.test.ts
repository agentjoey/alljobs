import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ParsedRegistryConnection } from "../registry/connection";
import { createCaphubBackup, verifyCaphubBackup } from "./backup";

const roots: string[] = [];
const connection: ParsedRegistryConnection = {
  host: "/private/tmp/caphub-test-socket",
  port: 54_329,
  database: "caphub",
  user: "caphub_migrator",
  ssl: false
};

function fixture(): { home: string; state: string } {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "caphub-backup-unit-")));
  roots.push(root);
  chmodSync(root, 0o700);
  const home = join(root, "home");
  const state = join(home, "state", "caphub");
  mkdirSync(state, { recursive: true, mode: 0o700 });
  for (const path of [home, join(home, "state"), state]) chmodSync(path, 0o700);
  writeFileSync(join(state, "capture.json"), "immutable-state\n", { mode: 0o600 });
  return { home, state };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Caphub backup creation", () => {
  it("dumps first with fixed arguments, copies complete state, and atomically publishes one immutable generation", async () => {
    const { home, state } = fixture();
    const sourceBefore = readFileSync(join(state, "capture.json"));
    const calls: readonly string[][] = [];
    const mutableCalls = calls as string[][];
    const manifest = await createCaphubBackup({
      resolvedHome: home,
      stateRoot: state,
      migrationConnection: connection,
      clock: () => new Date("2026-09-17T15:00:00.000Z"),
      generationId: "20260917T150000000Z-testgeneration",
      runPgDump: async (args) => {
        mutableCalls.push([...args]);
        const output = args.at(args.indexOf("-f") + 1);
        if (!output) throw new Error("missing dump output");
        expect(existsSync(join(dirname(output), "state"))).toBe(false);
        writeFileSync(output, "fixture-dump", { mode: 0o600 });
      },
      queryRegistrySnapshot: async () => ({
        counts: { capture: 2, audit_events: 2 },
        migrations: [{ id: "001_registry", checksum: "a".repeat(64) }]
      })
    });
    expect(mutableCalls).toHaveLength(1);
    expect(mutableCalls[0]).toEqual(expect.arrayContaining([
      "-Fc", "--no-password", "-h", connection.host, "-p", "54329",
      "-U", "caphub_migrator", "-d", "caphub", "-f"
    ]));
    const generation = join(home, "backups", "caphub", manifest.generation_id);
    expect(readFileSync(join(generation, "state", "capture.json"))).toEqual(sourceBefore);
    expect(readFileSync(join(state, "capture.json"))).toEqual(sourceBefore);
    expect(manifest.registry_counts).toEqual({ capture: 2, audit_events: 2 });
    expect(readdirSync(join(home, "backups", "caphub"))).toEqual([manifest.generation_id]);
  });

  it("does not publish failed generations, overwrite an existing generation, or follow source symlinks", async () => {
    const failed = fixture();
    await expect(createCaphubBackup({
      resolvedHome: failed.home,
      stateRoot: failed.state,
      migrationConnection: connection,
      clock: () => new Date("2026-09-17T15:00:00.000Z"),
      generationId: "20260917T150000000Z-failed",
      runPgDump: async () => { throw new Error("dump failed"); },
      queryRegistrySnapshot: async () => ({ counts: {}, migrations: [] })
    })).rejects.toThrow(/dump failed/);
    expect(readdirSync(join(failed.home, "backups", "caphub"))).toEqual([]);

    const existing = fixture();
    const backupRoot = join(existing.home, "backups", "caphub");
    mkdirSync(join(backupRoot, "20260917T150000000Z-existing"), { recursive: true, mode: 0o700 });
    writeFileSync(join(backupRoot, "20260917T150000000Z-existing", "keep"), "keep", { mode: 0o600 });
    await expect(createCaphubBackup({
      resolvedHome: existing.home,
      stateRoot: existing.state,
      migrationConnection: connection,
      clock: () => new Date("2026-09-17T15:00:00.000Z"),
      generationId: "20260917T150000000Z-existing",
      runPgDump: async () => undefined,
      queryRegistrySnapshot: async () => ({ counts: {}, migrations: [] })
    })).rejects.toThrow(/exists|immutable/i);
    expect(readFileSync(join(backupRoot, "20260917T150000000Z-existing", "keep"), "utf8")).toBe("keep");

    const symlinked = fixture();
    writeFileSync(join(symlinked.home, "outside"), "outside", { mode: 0o600 });
    symlinkSync(join(symlinked.home, "outside"), join(symlinked.state, "link"));
    await expect(createCaphubBackup({
      resolvedHome: symlinked.home,
      stateRoot: symlinked.state,
      migrationConnection: connection,
      clock: () => new Date("2026-09-17T15:00:00.000Z"),
      generationId: "20260917T150000000Z-symlink",
      runPgDump: async (args) => writeFileSync(args.at(args.indexOf("-f") + 1)!, "dump", { mode: 0o600 }),
      queryRegistrySnapshot: async () => ({ counts: {}, migrations: [] })
    })).rejects.toThrow(/symlink|regular/i);
  });
});

describe("Caphub backup verification", () => {
  it("verifies hashes and compares an isolated restore before stopping it", async () => {
    const { home, state } = fixture();
    const created = await createCaphubBackup({
      resolvedHome: home,
      stateRoot: state,
      migrationConnection: connection,
      clock: () => new Date("2026-09-17T15:00:00.000Z"),
      generationId: "20260917T150000000Z-verify",
      runPgDump: async (args) => writeFileSync(args.at(args.indexOf("-f") + 1)!, "dump", { mode: 0o600 }),
      queryRegistrySnapshot: async () => ({
        counts: { capture: 1 },
        migrations: [{ id: "001_registry", checksum: "b".repeat(64) }]
      })
    });
    let stopped = false;
    await expect(verifyCaphubBackup({
      resolvedHome: home,
      generationId: created.generation_id,
      startTemporaryPostgres: async () => ({
        restoreDatabase: async (dumpPath) => expect(readFileSync(dumpPath, "utf8")).toBe("dump"),
        queryCounts: async () => ({ capture: 1 }),
        queryMigrations: async () => [{ id: "001_registry", checksum: "b".repeat(64) }],
        stop: async () => { stopped = true; }
      })
    })).resolves.toEqual(created);
    expect(stopped).toBe(true);
  });
});
