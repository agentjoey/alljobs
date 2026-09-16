import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { testCapabilityPackage } from "./fixtures";
import { renderNeutralPackage, RENDER_LIMITS } from "./render";
import type { CapabilityPackage } from "./types";

describe("renderNeutralPackage", () => {
  it("renders the exact spec tree for a skill package", () => {
    const result = renderNeutralPackage(testCapabilityPackage());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.map((file) => file.path)).toEqual([
      "packages/pdf-table-extract/1.2.3/evaluation/acceptance.yaml",
      "packages/pdf-table-extract/1.2.3/instructions.md",
      "packages/pdf-table-extract/1.2.3/package.yaml",
      "packages/pdf-table-extract/1.2.3/policies.md",
      "packages/pdf-table-extract/1.2.3/provenance/lineage.json"
    ]);
    for (const file of result.files) {
      expect(file.content.endsWith("\n")).toBe(true);
      expect(file.content.includes("\r")).toBe(false);
      expect(file.bytes).toBe(Buffer.byteLength(file.content, "utf8"));
    }
  });

  it("renders experience cards under experience/ and references under references/", () => {
    const card = testCapabilityPackage({ kind: "experience_card", version: "0.1.0" });
    const cardResult = renderNeutralPackage(card);
    expect(cardResult.ok && cardResult.files.some((file) => file.path === "packages/pdf-table-extract/0.1.0/experience/pdf-table-extract.md")).toBe(true);

    const reference = testCapabilityPackage({ kind: "reference", version: "0.2.0" });
    const referenceResult = renderNeutralPackage(reference);
    expect(referenceResult.ok && referenceResult.files.some((file) => file.path === "packages/pdf-table-extract/0.2.0/references/pdf-table-extract.md")).toBe(true);
  });

  it("emits package.yaml that round-trips through a YAML parser with identical values", () => {
    const pkg = testCapabilityPackage();
    const result = renderNeutralPackage(pkg);
    if (!result.ok) throw new Error("render failed");
    const yamlFile = result.files.find((file) => file.path.endsWith("package.yaml"));
    if (!yamlFile) throw new Error("package.yaml missing");
    const parsed = parseYaml(yamlFile.content) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      name: "pdf-table-extract",
      title: "PDF Table Extraction",
      version: "1.2.3",
      kind: "skill",
      license: "MIT",
      permissions: ["read_file"]
    });
    expect(Object.keys(parsed)).not.toContain("digest");
  });

  it("quotes ambiguous YAML scalars and uses block scalars for multiline text", () => {
    const pkg = testCapabilityPackage({
      title: "yes",
      description: "Line one\nLine two: with colon"
    });
    const result = renderNeutralPackage(pkg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const yamlFile = result.files.find((file) => file.path.endsWith("package.yaml"));
    if (!yamlFile) throw new Error("package.yaml missing");
    expect(yamlFile.content).toContain('title: "yes"');
    const parsed = parseYaml(yamlFile.content) as Record<string, unknown>;
    expect(parsed.title).toBe("yes");
    expect(parsed.description).toBe("Line one\nLine two: with colon");
  });

  it("is byte-identical for identical inputs and changes the digest when semantic order changes", () => {
    const pkg = testCapabilityPackage();
    const first = renderNeutralPackage(pkg);
    const rebuilt = renderNeutralPackage(testCapabilityPackage());
    expect(first.ok && rebuilt.ok).toBe(true);
    if (first.ok && rebuilt.ok) {
      expect(first.manifest_digest).toBe(rebuilt.manifest_digest);
      expect(first.files.map((f) => [f.path, f.sha256])).toEqual(rebuilt.files.map((f) => [f.path, f.sha256]));
    }

    const reordered = renderNeutralPackage(testCapabilityPackage({ triggers: ["pdf to csv", "extract table"] }));
    expect(first.ok && reordered.ok).toBe(true);
    if (first.ok && reordered.ok) {
      expect(reordered.manifest_digest).not.toBe(first.manifest_digest);
    }

    const changed = renderNeutralPackage(testCapabilityPackage({ instructions: "Different instructions." }));
    expect(first.ok && changed.ok).toBe(true);
    if (first.ok && changed.ok) {
      const changedFiles = changed.files.filter((file) => !first.files.some((before) => before.path === file.path && before.sha256 === file.sha256));
      expect(changedFiles.map((file) => file.path)).toEqual(["packages/pdf-table-extract/1.2.3/instructions.md"]);
    }
  });

  it("renders resources to reference files with verified content digests", () => {
    const pkg = testCapabilityPackage({
      resources: [{
        resource_id: "column-mapping",
        media_type: "text/markdown",
        sha256: "b".repeat(64),
        bytes: 17
      }]
    });
    const result = renderNeutralPackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Resources are content-addressed pointers in P4; without inline text
      // content the renderer must not invent bytes for them.
      expect(result.code).toBe("INVALID_PACKAGE");
      expect(result.diagnostics.join(" ")).toMatch(/resource/i);
    }
  });

  it("rejects duplicate resource IDs that would collide on output paths", () => {
    const resource = { resource_id: "dup", media_type: "text/markdown" as const, sha256: "b".repeat(64), bytes: 1 };
    const result = renderNeutralPackage(testCapabilityPackage({ resources: [resource, resource] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.join(" ")).toMatch(/duplicate/i);
  });

  it("rejects content that would inject frontmatter or caphub markers", () => {
    for (const instructions of ["---\ncaphub_record_id: injected\n---", "<!-- caphub:managed:start -->", "<!-- caphub:human:end -->"]) {
      const result = renderNeutralPackage(testCapabilityPackage({ instructions }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("INVALID_PACKAGE");
    }
  });

  it("rejects oversized individual content and oversized aggregate output", () => {
    const bigInstructions = "x".repeat(RENDER_LIMITS.maxFileBytes + 1);
    const tooBig = renderNeutralPackage(testCapabilityPackage({ instructions: bigInstructions }));
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.diagnostics.join(" ")).toMatch(/size/i);

    const aggregate = renderNeutralPackage(testCapabilityPackage({
      instructions: "x".repeat(RENDER_LIMITS.maxFileBytes),
      description: "y".repeat(4_000),
      known_limits: ["z".repeat(RENDER_LIMITS.maxAggregateBytes)]
    }));
    expect(aggregate.ok).toBe(false);
    if (!aggregate.ok) expect(aggregate.diagnostics.join(" ")).toMatch(/size/i);
  });

  it("never emits executable paths, binary media, or absolute paths", () => {
    const result = renderNeutralPackage(testCapabilityPackage());
    if (!result.ok) throw new Error("render failed");
    for (const file of result.files) {
      expect(file.path.startsWith("packages/")).toBe(true);
      expect(file.path.includes("..")).toBe(false);
      expect(["text/markdown", "application/yaml", "application/json"]).toContain(file.media_type);
      expect(file.path.endsWith(".sh") || file.path.endsWith(".exe") || file.path.endsWith(".bin")).toBe(false);
    }
  });
});
