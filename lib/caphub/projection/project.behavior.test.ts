import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { digestCanonicalJson } from "../analysis/digest";
import { capabilityPackageSchema } from "../packages/schemas";
import type { CapabilityPackage } from "../packages/types";
import { testCapabilityPackage } from "../packages/fixtures";
import type { RegistryVersion } from "../registry/types";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "../registry/migrate";
import { PostgresRegistryRecordStore } from "../registry/postgres/records";
import { parseObsidianDocument } from "./markers";
import { validateTargetRoot, writeTargetSentinel, type ValidatedTargetRoot } from "./paths";
import { planProjection, projectionMarkdownForPackage } from "./planner";
import { applyProjectionPlan } from "./filesystem";

const ALIAS = "obsidian-fixture";
const NOW = "2026-09-16T09:00:00.000Z";

let fixture: CaphubTestPostgres;
let created: string[] = [];

async function freshVault(): Promise<ValidatedTargetRoot> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "caphub-vault-")));
  created.push(root);
  await writeTargetSentinel(root, ALIAS);
  return validateTargetRoot({ root, alias: ALIAS });
}

beforeAll(async () => {
  fixture = await startCaphubTestPostgres();
  await applyRegistryMigrations(fixture.pool);
}, 30_000);

afterAll(async () => {
  for (const root of created) {
    await rm(root, { recursive: true, force: true });
  }
  await fixture?.stop();
}, 30_000);

async function seedRelease(pool: Pool, seed: number, pkgOverrides: Partial<CapabilityPackage> = {}): Promise<{
  release: RegistryVersion;
  pkg: CapabilityPackage;
}> {
  const pkg = testCapabilityPackage({
    release_id: `rel_${seed.toString(16).repeat(32).slice(0, 32)}`,
    package_id: `pkg_${(seed + 1).toString(16).repeat(32).slice(0, 32)}`,
    ...pkgOverrides
  });
  const release: RegistryVersion = {
    record_id: pkg.release_id,
    kind: "release",
    version: 1,
    schema_version: 1,
    payload: pkg,
    payload_digest: digestCanonicalJson(pkg),
    previous_version: null,
    created_at: NOW
  };
  const records = new PostgresRegistryRecordStore(pool, { release: capabilityPackageSchema });
  await records.putVersion(release);
  return { release, pkg };
}

describe.sequential("Obsidian projection behavior (Registry + filesystem)", () => {
  it("projects an approved Release snapshot into a fixture Vault and rebuilds identically", async () => {
    const { release, pkg } = await seedRelease(fixture.appPool, 1);
    const snapshot = await new PostgresRegistryRecordStore(fixture.appPool, {
      release: capabilityPackageSchema
    }).getCurrent(release.record_id);
    if (!snapshot) throw new Error("release snapshot missing");
    const stored = capabilityPackageSchema.parse(snapshot.payload);

    const vault = await freshVault();
    const documents = [{
      record_id: snapshot.record_id,
      record_version: snapshot.version,
      record_digest: snapshot.payload_digest,
      relative_path: `Caphub/20 Capabilities/${stored.slug}.md`,
      managed_markdown: projectionMarkdownForPackage(stored)
    }];
    const plan = await planProjection({ root: vault, documents });
    expect(plan.entries.map((entry) => entry.action)).toEqual(["create"]);
    await applyProjectionPlan({ root: vault, plan, documents });

    const raw = await readFile(join(vault.root, "Caphub", "20 Capabilities", `${stored.slug}.md`), "utf8");
    const parsed = parseObsidianDocument(raw);
    expect(parsed.record_id).toBe(snapshot.record_id);
    const firstManagedDigest = parsed.managed_digest;

    // Human edits survive a managed-only rebuild.
    const edited = raw.replace("## 我的判断\n", "## 我的判断\n\n人工经验：先小范围试用。\n");
    await writeFile(join(vault.root, "Caphub", "20 Capabilities", `${stored.slug}.md`), edited, "utf8");

    const updated = testCapabilityPackage({
      release_id: stored.release_id,
      package_id: stored.package_id,
      description: "Updated description after evidence review.",
      instructions: "Read the PDF, locate tables, emit CSV rows. Then validate."
    });
    const second: RegistryVersion = {
      record_id: release.record_id,
      kind: "release",
      version: 2,
      schema_version: 1,
      payload: updated,
      payload_digest: digestCanonicalJson(updated),
      previous_version: 1,
      created_at: NOW
    };
    await new PostgresRegistryRecordStore(fixture.appPool, { release: capabilityPackageSchema })
      .putVersion(second);
    const secondSnapshot = await new PostgresRegistryRecordStore(fixture.appPool, {
      release: capabilityPackageSchema
    }).getCurrent(release.record_id);
    if (!secondSnapshot) throw new Error("second snapshot missing");

    const updateDocuments = [{
      record_id: secondSnapshot.record_id,
      record_version: secondSnapshot.version,
      record_digest: secondSnapshot.payload_digest,
      relative_path: `Caphub/20 Capabilities/${stored.slug}.md`,
      managed_markdown: projectionMarkdownForPackage(capabilityPackageSchema.parse(secondSnapshot.payload)),
      human_content: parseObsidianDocument(edited).human_content
    }];
    const updatePlan = await planProjection({ root: vault, documents: updateDocuments });
    expect(updatePlan.entries[0]?.action).toBe("update");
    await applyProjectionPlan({ root: vault, plan: updatePlan, documents: updateDocuments });
    const rebuilt = parseObsidianDocument(await readFile(join(vault.root, "Caphub", "20 Capabilities", `${stored.slug}.md`), "utf8"));
    expect(rebuilt.record_version).toBe(2);
    expect(rebuilt.human_content).toContain("人工经验：先小范围试用。");
    expect(rebuilt.managed_digest).not.toBe(firstManagedDigest);

    // Vault loss: wipe the Caphub tree and rebuild from the Registry snapshot.
    await rm(join(vault.root, "Caphub"), { recursive: true, force: true });
    const rebuildPlan = await planProjection({ root: vault, documents: updateDocuments });
    expect(rebuildPlan.entries.map((entry) => entry.action)).toEqual(["create"]);
    await applyProjectionPlan({ root: vault, plan: rebuildPlan, documents: updateDocuments });
    const rebuiltAgain = parseObsidianDocument(await readFile(join(vault.root, "Caphub", "20 Capabilities", `${stored.slug}.md`), "utf8"));
    expect(rebuiltAgain.managed_digest).toBe(rebuilt.managed_digest);
    expect(rebuiltAgain.human_content).toBe(rebuilt.human_content);
  });

  it("rebuilds the same managed digest in a completely fresh empty Vault", async () => {
    const { release, pkg } = await seedRelease(fixture.appPool, 2);
    const snapshot = await new PostgresRegistryRecordStore(fixture.appPool, {
      release: capabilityPackageSchema
    }).getCurrent(release.record_id);
    if (!snapshot) throw new Error("snapshot missing");
    const stored = capabilityPackageSchema.parse(snapshot.payload);
    const documents = [{
      record_id: snapshot.record_id,
      record_version: snapshot.version,
      record_digest: snapshot.payload_digest,
      relative_path: `Caphub/20 Capabilities/${stored.slug}.md`,
      managed_markdown: projectionMarkdownForPackage(stored)
    }];

    const firstVault = await freshVault();
    const firstPlan = await planProjection({ root: firstVault, documents });
    await applyProjectionPlan({ root: firstVault, plan: firstPlan, documents });
    const first = parseObsidianDocument(await readFile(join(firstVault.root, "Caphub", "20 Capabilities", `${stored.slug}.md`), "utf8"));

    const secondVault = await freshVault();
    const secondPlan = await planProjection({ root: secondVault, documents });
    await applyProjectionPlan({ root: secondVault, plan: secondPlan, documents });
    const second = parseObsidianDocument(await readFile(join(secondVault.root, "Caphub", "20 Capabilities", `${stored.slug}.md`), "utf8"));

    expect(second.managed_digest).toBe(first.managed_digest);
    expect(second.human_content).toBe(first.human_content);
    expect(pkg.slug).toBe(stored.slug);
  });
});
