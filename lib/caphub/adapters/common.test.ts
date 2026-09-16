import { describe, expect, it } from "vitest";
import { digestCanonicalJson } from "../analysis/digest";
import { testCapabilityPackage } from "../packages/fixtures";
import type { CapabilityPackage } from "../packages/types";
import { renderClaudePreview } from "./claude";
import { runAdapterContract, type AdapterContract } from "./common";
import { renderCodexPreview } from "./codex";
import { renderHermesPreview } from "./hermes";

const ALL_ADAPTERS = [
  { name: "codex", render: renderCodexPreview },
  { name: "claude", render: renderClaudePreview },
  { name: "hermes", render: renderHermesPreview }
] as const;

function adapterPackage(overrides: Partial<CapabilityPackage> = {}): CapabilityPackage {
  // P4 adapters never resolve dependencies; successful previews use dependency-free packages.
  return testCapabilityPackage({ dependencies: [], ...overrides });
}

function expectSupported(result: ReturnType<typeof renderCodexPreview>) {
  if (!result.ok) throw new Error(`expected supported result, got ${result.code}: ${result.diagnostics.join("; ")}`);
  return result.result;
}

describe("adapter contract suite", () => {
  it("produces identical bytes and manifest digests for identical inputs", () => {
    const pkg = adapterPackage();
    for (const { name, render } of ALL_ADAPTERS) {
      const first = expectSupported(render(pkg));
      const second = expectSupported(render(adapterPackage()));
      expect(first.adapter).toBe(name);
      expect(first.adapter_version).toBe(second.adapter_version);
      expect(first.source_digest).toBe(second.source_digest);
      expect(first.input_digest).toBe(pkg.digest);
      expect(first.output_manifest_digest).toBe(second.output_manifest_digest);
      expect(first.files.map((file) => [file.path, file.sha256])).toEqual(
        second.files.map((file) => [file.path, file.sha256])
      );
    }
  });

  it("emits sorted text-only output with bounded descriptions and triggers", () => {
    const pkg = adapterPackage();
    for (const { render } of ALL_ADAPTERS) {
      const result = expectSupported(render(pkg));
      expect(result.files).toHaveLength(1);
      const paths = result.files.map((file) => file.path);
      expect(paths).toEqual([...paths].sort());
      for (const file of result.files) {
        expect(["text/markdown"]).toContain(file.media_type);
        expect(file.content.includes("\r")).toBe(false);
      }
      expect(result.diagnostics.join(" ")).not.toMatch(/truncat/);
    }
  });

  it("survives provenance, license, and known limits into the rendered text", () => {
    const pkg = adapterPackage();
    for (const { render } of ALL_ADAPTERS) {
      const result = expectSupported(render(pkg));
      const text = result.files.map((file) => file.content).join("\n");
      expect(text).toContain(pkg.license.spdx_id);
      expect(text).toContain(pkg.known_limits[0]);
      expect(text).toContain(pkg.triggers[0]);
      expect(text).toContain(pkg.evidence[0].citation);
    }
  });

  it("never emits absolute roots, installers, scripts, or executable content", () => {
    const pkg = adapterPackage();
    for (const { render } of ALL_ADAPTERS) {
      const result = expectSupported(render(pkg));
      for (const file of result.files) {
        expect(file.path.includes("\\")).toBe(false);
        expect(/^(?:\$CODEX_HOME|\.claude|~\/\.hermes)/.test(file.path)).toBe(true);
        expect(file.content).not.toMatch(/\/Users\//);
        expect(file.content).not.toMatch(/curl |bash |npm install|brew install/i);
        expect(file.path.endsWith(".sh")).toBe(false);
      }
    }
  });

  it("fails closed on unsupported permissions, dependencies, and oversized content", () => {
    for (const { render } of ALL_ADAPTERS) {
      const badPermission = render(adapterPackage({ permissions: ["shell_exec"] }));
      expect(badPermission.ok).toBe(false);
      if (!badPermission.ok) expect(badPermission.code).toBe("ADAPTER_UNSUPPORTED");

      const withDeps = render(adapterPackage({
        dependencies: [{ name: "pdf-parse", version: "^2.0.0" }]
      }));
      expect(withDeps.ok).toBe(false);
      if (!withDeps.ok) expect(withDeps.code).toBe("ADAPTER_UNSUPPORTED");

      const huge = render(adapterPackage({ description: "d".repeat(50_000) }));
      expect(huge.ok).toBe(false);
    }
  });

  it("unsupported results carry no partial output", () => {
    for (const { render } of ALL_ADAPTERS) {
      const result = render(adapterPackage({ permissions: ["write_file"] }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect("result" in result ? (result as { result?: unknown }).result : undefined).toBeUndefined();
      }
    }
  });

  it("records a deterministic source digest tied to documented assumptions", () => {
    const pkg = adapterPackage();
    const first = expectSupported(renderCodexPreview(pkg));
    const assumptions = {
      schema_version: 1,
      adapter: "codex",
      version: first.adapter_version,
      skill_frontmatter_keys: ["description", "name"],
      max_description_bytes: 4096,
      max_triggers: 16,
      max_trigger_bytes: 120,
      logical_root: "$CODEX_HOME/skills"
    };
    expect(first.source_digest).toBe(digestCanonicalJson(assumptions));
  });

  it("supports the contract-driven custom adapter shape", () => {
    const contract: AdapterContract = {
      name: "hermes",
      adapter_version: "9.9.9-test",
      logical_root: "~/.hermes/skills",
      destination: (pkg: CapabilityPackage) => `~/.hermes/skills/custom/${pkg.slug}/SKILL.md`,
      supported_kinds: ["skill"],
      allowed_permissions: ["read_file"],
      allow_dependencies: false,
      max_description_bytes: 4096,
      max_triggers: 16,
      max_trigger_bytes: 120,
      skill_frontmatter_keys: ["description", "name"]
    };
    const ok = runAdapterContract(contract, adapterPackage());
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.result.files[0]?.path).toContain("~/.hermes/skills/custom/");
      expect(ok.result.adapter_version).toBe("9.9.9-test");
    }
    const unsupported = runAdapterContract(contract, adapterPackage({ kind: "experience_card" }));
    expect(unsupported.ok).toBe(false);
  });
});
