import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../packages/digest";
import { FIXTURE_RECORD_DIGEST, FIXTURE_RECORD_ID } from "./fixtures";
import { validateTargetRoot, writeTargetSentinel, type ValidatedTargetRoot } from "./paths";
import { planProjection, ProjectionPlanError, type ProjectionDocumentInput } from "./planner";
import { renderObsidianDocument } from "./render";

const ALIAS = "obsidian-fixture";
const RECORD_ID = FIXTURE_RECORD_ID;
const RECORD_DIGEST = FIXTURE_RECORD_DIGEST;

let created: string[] = [];

async function freshValidatedRoot(): Promise<ValidatedTargetRoot> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "caphub-planner-")));
  created.push(root);
  await writeTargetSentinel(root, ALIAS);
  return validateTargetRoot({ root, alias: ALIAS });
}

afterEach(async () => {
  for (const root of created) {
    await rm(root, { recursive: true, force: true });
  }
  created = [];
});

function document(overrides: Partial<ProjectionDocumentInput> = {}): ProjectionDocumentInput {
  return {
    record_id: RECORD_ID,
    record_version: 1,
    record_digest: RECORD_DIGEST,
    relative_path: "Caphub/20 Capabilities/pdf-tool.md",
    managed_markdown: "Summary v1.\n",
    ...overrides
  };
}

describe("planProjection", () => {
  it("plans create entries for a fresh root with stable ordering and digests", async () => {
    const root = await freshValidatedRoot();
    const plan = await planProjection({
      root,
      documents: [
        document({ relative_path: "Caphub/20 Capabilities/b.md" }),
        document({ relative_path: "Caphub/20 Capabilities/a.md", record_id: `rel_${"2".repeat(32)}` })
      ]
    });
    expect(plan.entries.map((entry) => entry.relative_path)).toEqual([
      "Caphub/20 Capabilities/a.md",
      "Caphub/20 Capabilities/b.md"
    ]);
    expect(plan.entries.every((entry) => entry.action === "create")).toBe(true);
    expect(plan.entries.every((entry) => entry.preimage_digest === null)).toBe(true);
    expect(plan.preimage_digest).not.toBe(plan.postimage_digest);
    expect(plan.truncated).toBe(false);
    for (const entry of plan.entries) {
      const rendered = renderObsidianDocument({
        record_id: entry.record_id,
        record_version: entry.record_version,
        record_digest: entry.record_digest,
        managed_markdown: entry.record_id === RECORD_ID ? "Summary v1.\n" : "Summary v1.\n"
      });
      expect(entry.postimage_digest).toBe(rendered.postimage_digest);
      expect(entry.managed_digest).toBe(rendered.managed_digest);
    }
  });

  it("plans update and unchanged entries against an existing owned document", async () => {
    const root = await freshValidatedRoot();
    const existing = renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: "Summary v1.\n"
    });
    const path = join(root.root, "Caphub", "20 Capabilities");
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "pdf-tool.md"), existing.content, "utf8");

    const unchanged = await planProjection({ root, documents: [document()] });
    expect(unchanged.entries).toHaveLength(0);
    expect(unchanged.preimage_digest).toBe(unchanged.postimage_digest);

    const updated = await planProjection({ root, documents: [document({ managed_markdown: "Summary v2.\n" })] });
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0]?.action).toBe("update");
    expect(updated.entries[0]?.preimage_digest).toBe(sha256Hex(existing.content));
    expect(updated.entries[0]?.managed_digest).not.toBe(existing.managed_digest);
  });

  it("reports conflicts for foreign files, identity changes, and stale preimage at apply time", async () => {
    const root = await freshValidatedRoot();
    const path = join(root.root, "Caphub", "20 Capabilities");
    await mkdir(path, { recursive: true });

    await writeFile(join(path, "foreign.md"), "# Human note only\n");
    const foreign = await planProjection({
      root,
      documents: [document({ relative_path: "Caphub/20 Capabilities/foreign.md" })]
    });
    expect(foreign.entries[0]?.action).toBe("conflict");
    expect(foreign.entries[0]?.conflict_reason).toMatch(/not owned/i);

    const ownedByOther = renderObsidianDocument({
      record_id: `rel_${"9".repeat(32)}`,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: "Other record.\n"
    });
    await writeFile(join(path, "other.md"), ownedByOther.content, "utf8");
    const identity = await planProjection({
      root,
      documents: [document({ relative_path: "Caphub/20 Capabilities/other.md" })]
    });
    expect(identity.entries[0]?.action).toBe("conflict");
    expect(identity.entries[0]?.conflict_reason).toMatch(/identity/i);
  });

  it("reports unowned previously-managed files as orphans and never plans deletes", async () => {
    const root = await freshValidatedRoot();
    const path = join(root.root, "Caphub", "20 Capabilities");
    await mkdir(path, { recursive: true });
    const stale = renderObsidianDocument({
      record_id: `rel_${"5".repeat(32)}`,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: "Removed record page.\n"
    });
    await writeFile(join(path, "stale.md"), stale.content, "utf8");

    const plan = await planProjection({ root, documents: [document()] });
    const orphan = plan.entries.find((entry) => entry.action === "orphan");
    expect(orphan?.relative_path).toBe("Caphub/20 Capabilities/stale.md");
    expect(plan.entries.every((entry) => entry.action !== "conflict")).toBe(true);
  });

  it("rejects duplicate document paths and unsafe relative paths", async () => {
    const root = await freshValidatedRoot();
    await expect(planProjection({ root, documents: [document(), document()] }))
      .rejects.toBeInstanceOf(ProjectionPlanError);
    await expect(planProjection({ root, documents: [document({ relative_path: "../escape.md" })] }))
      .rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });
  });

  it("bounds the preview text and marks truncation", async () => {
    const root = await freshValidatedRoot();
    const documents = Array.from({ length: 6 }, (_, index) => document({
      relative_path: `Caphub/20 Capabilities/tool-${index}.md`,
      record_id: `rel_${(index + 1).toString(16).repeat(32).slice(0, 32)}`
    }));
    const plan = await planProjection({ root, documents, maxPreviewBytes: 120 });
    expect(plan.truncated).toBe(true);
    expect(plan.diff.length).toBeLessThanOrEqual(120 + 64);
    const full = await planProjection({ root, documents });
    expect(full.truncated).toBe(false);
    expect(full.diff.length).toBeGreaterThan(plan.diff.length);
  });

  it("records a preimage digest that changes when a planned file changes on disk", async () => {
    const root = await freshValidatedRoot();
    const first = await planProjection({ root, documents: [document()] });
    const path = join(root.root, "Caphub", "20 Capabilities");
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "pdf-tool.md"), "# foreign content\n", "utf8");
    const second = await planProjection({ root, documents: [document()] });
    expect(second.preimage_digest).not.toBe(first.preimage_digest);
    expect(second.entries[0]?.action).toBe("conflict");
  });

  it("reads only descendants named by computed safe paths (symlinked parent fails closed)", async () => {
    const root = await freshValidatedRoot();
    const outside = await realpath(await mkdtemp(join(tmpdir(), "caphub-outside-")));
    created.push(outside);
    await writeFile(join(outside, "secret.md"), "secret\n", "utf8");
    const { symlink } = await import("node:fs/promises");
    await mkdir(join(root.root, "Caphub"), { recursive: true });
    await symlink(outside, join(root.root, "Caphub", "link"));
    await expect(planProjection({ root, documents: [document({ relative_path: "Caphub/link/secret.md" })] }))
      .rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });
    const raw = await readFile(join(outside, "secret.md"), "utf8");
    expect(raw).toBe("secret\n");
  });
});
