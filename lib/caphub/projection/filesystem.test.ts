import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../packages/digest";
import { parseObsidianDocument } from "./markers";
import { validateTargetRoot, writeTargetSentinel, type ValidatedTargetRoot } from "./paths";
import { planProjection, type ProjectionDocumentInput } from "./planner";
import { applyProjectionPlan, reconcileProjection, ProjectionApplyError } from "./filesystem";
import { renderObsidianDocument } from "./render";
import { FIXTURE_RECORD_DIGEST, FIXTURE_RECORD_ID } from "./fixtures";

const ALIAS = "obsidian-fixture";

let created: string[] = [];

async function freshValidatedRoot(): Promise<ValidatedTargetRoot> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "caphub-apply-")));
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
    record_id: FIXTURE_RECORD_ID,
    record_version: 1,
    record_digest: FIXTURE_RECORD_DIGEST,
    relative_path: "Caphub/20 Capabilities/pdf-tool.md",
    managed_markdown: "Summary v1.\n",
    ...overrides
  };
}

async function planned(root: ValidatedTargetRoot, documents: ProjectionDocumentInput[]) {
  return planProjection({ root, documents });
}

describe("applyProjectionPlan", () => {
  it("applies create and update entries and preserves the human region", async () => {
    const root = await freshValidatedRoot();
    const doc = document();
    const first = await planned(root, [doc]);
    const applied = await applyProjectionPlan({ root, plan: first, documents: [doc] });
    expect(applied.applied).toBe(1);

    const raw = await readFile(join(root.root, "Caphub", "20 Capabilities", "pdf-tool.md"), "utf8");
    const parsed = parseObsidianDocument(raw);
    expect(parsed.record_id).toBe(FIXTURE_RECORD_ID);
    expect(parsed.human_content).toContain("## 我的判断");

    const userEdited = raw.replace("## 我的判断\n", "## 我的判断\n\n人工笔记保留。\n");
    await writeFile(join(root.root, "Caphub", "20 Capabilities", "pdf-tool.md"), userEdited, "utf8");
    const updatedDoc = document({
      managed_markdown: "Summary v2.\n",
      human_content: parseObsidianDocument(userEdited).human_content
    });
    const second = await planned(root, [updatedDoc]);
    expect(second.entries[0]?.action).toBe("update");
    await applyProjectionPlan({ root, plan: second, documents: [updatedDoc] });
    const updated = parseObsidianDocument(await readFile(join(root.root, "Caphub", "20 Capabilities", "pdf-tool.md"), "utf8"));
    expect(updated.human_content).toBe(parseObsidianDocument(userEdited).human_content);
    expect(updated.managed_markdown).toBe("Summary v2.");
  });

  it("refuses to apply when the preimage changed between planning and apply", async () => {
    const root = await freshValidatedRoot();
    const doc = document();
    const plan = await planned(root, [doc]);
    await mkdir(join(root.root, "Caphub", "20 Capabilities"), { recursive: true });
    await writeFile(join(root.root, "Caphub", "20 Capabilities", "pdf-tool.md"), "# foreign\n", "utf8");
    await expect(applyProjectionPlan({ root, plan, documents: [doc] }))
      .rejects.toMatchObject({ code: "PROJECTION_CONFLICT" });
  });

  it("rejects apply when a planned file is stale", async () => {
    const root = await freshValidatedRoot();
    const doc = document();
    await applyProjectionPlan({ root, plan: await planned(root, [doc]), documents: [doc] });
    const path = join(root.root, "Caphub", "20 Capabilities", "pdf-tool.md");
    const current = await readFile(path, "utf8");
    await writeFile(path, current.replace("## 我的判断\n", "## 我的判断\n\nuser tweak\n"), "utf8");
    const updatedDoc = document({
      managed_markdown: "Summary v2.\n",
      human_content: parseObsidianDocument(await readFile(path, "utf8")).human_content
    });
    const plan = await planned(root, [updatedDoc]);
    await writeFile(path, current.replace("## 我的判断\n", "## 我的判断\n\nuser tweak changed again\n"), "utf8");
    await expect(applyProjectionPlan({ root, plan, documents: [updatedDoc] }))
      .rejects.toMatchObject({ code: "STALE_PREIMAGE" });
  });

  it("uses an exclusive target lock and refuses concurrent applies", async () => {
    const root = await freshValidatedRoot();
    await mkdir(join(root.root, ".caphub-projection.lock"));
    const doc = document();
    await expect(applyProjectionPlan({ root, plan: await planned(root, [doc]), documents: [doc] }))
      .rejects.toMatchObject({ code: "PUBLISH_RECOVERY_REQUIRED" });
  });

  it("leaves a recovery record on injected failure and reconciles idempotently", async () => {
    const root = await freshValidatedRoot();
    const docs = [
      document({ relative_path: "Caphub/20 Capabilities/a.md", record_id: `rel_${"a1".repeat(16)}` }),
      document({ relative_path: "Caphub/20 Capabilities/b.md", record_id: `rel_${"b2".repeat(16)}` })
    ];
    const plan = await planned(root, docs);
    let calls = 0;
    await expect(applyProjectionPlan({
      root,
      plan,
      documents: docs,
      hooks: {
        async afterWrite() {
          calls += 1;
          if (calls === 1) throw new Error("injected failure after first durable write");
        }
      }
    })).rejects.toMatchObject({ code: "PUBLISH_RECOVERY_REQUIRED" });

    const recovery = JSON.parse(await readFile(join(root.root, ".caphub-projection-recovery.json"), "utf8"));
    expect(recovery.schema_version).toBe(1);

    await expect(applyProjectionPlan({ root, plan, documents: docs }))
      .rejects.toMatchObject({ code: "PUBLISH_RECOVERY_REQUIRED" });

    const reconciled = await reconcileProjection({ root, plan, documents: docs });
    expect(reconciled.applied).toBe(1);
    const a = parseObsidianDocument(await readFile(join(root.root, "Caphub", "20 Capabilities", "a.md"), "utf8"));
    const b = parseObsidianDocument(await readFile(join(root.root, "Caphub", "20 Capabilities", "b.md"), "utf8"));
    expect(a.record_id).toBe(`rel_${"a1".repeat(16)}`);
    expect(b.record_id).toBe(`rel_${"b2".repeat(16)}`);
    await expect(readFile(join(root.root, ".caphub-projection-recovery.json"), "utf8")).rejects.toThrow();
  });

  it("never follows symlinks, never deletes orphans, and preserves file permissions", async () => {
    const root = await freshValidatedRoot();
    const outside = await realpath(await mkdtemp(join(tmpdir(), "caphub-outside-")));
    created.push(outside);
    await writeFile(join(outside, "target.md"), "outside\n", "utf8");

    const orphan = renderObsidianDocument({
      record_id: `rel_${"7".repeat(32)}`,
      record_version: 1,
      record_digest: FIXTURE_RECORD_DIGEST,
      managed_markdown: "Orphan page.\n"
    });
    await mkdir(join(root.root, "Caphub", "20 Capabilities"), { recursive: true });
    await writeFile(join(root.root, "Caphub", "20 Capabilities", "orphan.md"), orphan.content, "utf8");
    await chmod(join(root.root, "Caphub", "20 Capabilities", "orphan.md"), 0o640);

    const doc = document({ relative_path: "Caphub/20 Capabilities/linked.md" });
    const plan = await planned(root, [doc]);
    await symlink(join(outside, "target.md"), join(root.root, "Caphub", "20 Capabilities", "linked.md"));
    await expect(applyProjectionPlan({ root, plan, documents: [doc] }))
      .rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });
    expect(await readFile(join(outside, "target.md"), "utf8")).toBe("outside\n");

    const orphanAfter = await stat(join(root.root, "Caphub", "20 Capabilities", "orphan.md"));
    expect(orphanAfter.isFile()).toBe(true);
    expect(orphanAfter.mode & 0o777).toBe(0o640);
  });

  it("reuses existing file permissions on update where safe", async () => {
    const root = await freshValidatedRoot();
    const doc = document();
    await applyProjectionPlan({ root, plan: await planned(root, [doc]), documents: [doc] });
    const path = join(root.root, "Caphub", "20 Capabilities", "pdf-tool.md");
    await chmod(path, 0o600);
    const updatedDoc = document({ managed_markdown: "Summary v2.\n" });
    await applyProjectionPlan({ root, plan: await planned(root, [updatedDoc]), documents: [updatedDoc] });
    const after = await stat(path);
    expect(after.mode & 0o777).toBe(0o600);
  });

  it("skips unchanged and orphan entries without touching them", async () => {
    const root = await freshValidatedRoot();
    const doc = document();
    await applyProjectionPlan({ root, plan: await planned(root, [doc]), documents: [doc] });
    const again = await planned(root, [doc]);
    expect(again.entries).toHaveLength(0);
    const result = await applyProjectionPlan({ root, plan: again, documents: [doc] });
    expect(result.applied).toBe(0);
  });

  it("validates the plan against re-rendered documents before writing", async () => {
    const root = await freshValidatedRoot();
    const doc = document();
    const plan = await planned(root, [doc]);
    const tampered = document({ managed_markdown: "Tampered after planning.\n" });
    await expect(applyProjectionPlan({ root, plan, documents: [tampered] }))
      .rejects.toBeInstanceOf(ProjectionApplyError);
  });
});
