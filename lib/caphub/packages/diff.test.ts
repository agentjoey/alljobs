import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testCapabilityPackage } from "./fixtures";
import type { PackageFile } from "./types";
import { diffPackageFiles } from "./diff";
import { renderNeutralPackage } from "./render";

function renderedFiles(): PackageFile[] {
  const result = renderNeutralPackage(testCapabilityPackage());
  if (!result.ok) throw new Error("fixture render failed");
  return result.files;
}

describe("diffPackageFiles", () => {
  it("emits create entries for a null snapshot and omits unchanged files", () => {
    const files = renderedFiles();
    const diff = diffPackageFiles({ baseFiles: null, nextFiles: files });
    expect(diff.entries).toHaveLength(files.length);
    expect(diff.entries.every((entry) => entry.action === "create")).toBe(true);
    expect(diff.truncated).toBe(false);
    for (const entry of diff.entries) {
      expect(entry.before_sha256).toBeNull();
      expect(entry.after_sha256).toBe(entry.after_sha256);
    }
  });

  it("emits update entries with unified hunks and delete entries without implying target deletion", () => {
    const base = renderedFiles();
    const next = renderedFiles();
    const instructions = next.find((file) => file.path.endsWith("instructions.md"));
    if (!instructions) throw new Error("missing instructions");
    const changedContent = "# New instructions\nsecond line\n";
    const changedFile: PackageFile = {
      ...instructions,
      content: changedContent,
      sha256: createHash("sha256").update(changedContent, "utf8").digest("hex"),
      bytes: Buffer.byteLength(changedContent, "utf8")
    };
    const removed = next.find((file) => file.path.endsWith("policies.md"));
    const nextFiles = next
      .map((file) => (file.path === instructions.path ? changedFile : file))
      .filter((file) => file.path !== removed?.path);

    const diff = diffPackageFiles({ baseFiles: base, nextFiles });
    const update = diff.entries.find((entry) => entry.action === "update");
    expect(update?.path).toBe(instructions.path);
    expect(update?.hunks).toContain(`--- a/${instructions.path}`);
    expect(update?.hunks).toContain(`+++ b/${instructions.path}`);
    expect(update?.hunks).toContain("-Read the PDF, locate tables, emit CSV rows.");
    expect(update?.hunks).toContain("+# New instructions");

    const del = diff.entries.find((entry) => entry.action === "delete");
    expect(del?.path).toBe(removed?.path);
    expect(del?.after_sha256).toBeNull();
    expect(diff.entries.every((entry) => entry.before_sha256 !== entry.after_sha256)).toBe(true);
  });

  it("bounds files, lines, and bytes and reports truncation", () => {
    const files = renderedFiles();
    const limited = diffPackageFiles({ baseFiles: null, nextFiles: files, maxFiles: 2 });
    expect(limited.entries).toHaveLength(2);
    expect(limited.truncated).toBe(true);

    const base = renderedFiles();
    const next = renderedFiles();
    const instructions = next.find((file) => file.path.endsWith("instructions.md"));
    if (!instructions) throw new Error("missing instructions");
    const bigContent = `${Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n")}\n`;
    const bigFile: PackageFile = {
      ...instructions,
      content: bigContent,
      sha256: createHash("sha256").update(bigContent, "utf8").digest("hex"),
      bytes: Buffer.byteLength(bigContent, "utf8")
    };
    const lineLimited = diffPackageFiles({
      baseFiles: base,
      nextFiles: next.map((file) => (file.path === instructions.path ? bigFile : file)),
      maxLinesPerFile: 5
    });
    const entry = lineLimited.entries.find((item) => item.action === "update");
    expect(entry?.hunks).toContain("... diff truncated ...");

    const byteLimited = diffPackageFiles({ baseFiles: null, nextFiles: files, maxBytes: 10 });
    expect(byteLimited.truncated).toBe(true);
  });

  it("redacts configured absolute roots from headers and hunks", () => {
    const files = renderedFiles();
    const withRoot = files.map((file) => ({
      ...file,
      content: file.content + "\nsee /Users/owner/vault/notes.md for context\n",
      sha256: createHash("sha256")
        .update(file.content + "\nsee /Users/owner/vault/notes.md for context\n", "utf8")
        .digest("hex")
    }));
    for (const file of withRoot) {
      file.bytes = Buffer.byteLength(file.content, "utf8");
    }
    const diff = diffPackageFiles({ baseFiles: files, nextFiles: withRoot, redactRoots: ["/Users/owner/vault"] });
    for (const entry of diff.entries) {
      expect(entry.hunks.includes("/Users/owner/vault")).toBe(false);
    }
    expect(diff.entries.some((entry) => entry.hunks.includes("<redacted-root>"))).toBe(true);
  });

  it("produces a stable diff digest for identical inputs", () => {
    const files = renderedFiles();
    const first = diffPackageFiles({ baseFiles: null, nextFiles: files });
    const second = diffPackageFiles({ baseFiles: null, nextFiles: renderedFiles() });
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
  });
});
