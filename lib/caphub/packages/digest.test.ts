import { describe, expect, it } from "vitest";
import {
  canonicalPackageJson,
  packageContentDigest,
  sha256Hex,
  verifyPackageContentDigest
} from "./digest";

const NOW = "2026-09-16T05:30:00.000Z";

function basePackage(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    package_id: `pkg_${"1".repeat(32)}`,
    release_id: `rel_${"2".repeat(32)}`,
    release_version: 1,
    version: "1.2.3",
    slug: "pdf-table-extract",
    kind: "skill",
    title: "PDF Table Extraction",
    description: "Extract tables from PDF files into structured rows.",
    triggers: ["extract table", "pdf to csv"],
    non_triggers: ["edit pdf"],
    instructions: "Read the PDF, locate tables, emit CSV rows.",
    permissions: ["read_file", "network"],
    dependencies: [{ name: "pdf-parse", version: "^2.0.0" }],
    compatibility: { hosts: ["codex", "claude"] },
    resources: [],
    evidence: [],
    lineage: [],
    license: { spdx_id: "MIT", provenance_confidence: "high" },
    known_limits: [],
    evaluations: [],
    created_at: NOW,
    digest: "f".repeat(64),
    ...overrides
  };
}

describe("sha256Hex", () => {
  it("computes lowercase SHA-256 hex digests", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("canonicalPackageJson", () => {
  it("sorts object keys recursively", () => {
    const left = canonicalPackageJson({ b: { d: 1, c: 2 }, a: 3 });
    const right = canonicalPackageJson({ a: 3, b: { c: 2, d: 1 } });
    expect(left).toBe(right);
    expect(left.indexOf('"a"')).toBeLessThan(left.indexOf('"b"'));
    expect(left.indexOf('"c"')).toBeLessThan(left.indexOf('"d"'));
  });

  it("retains semantic array order", () => {
    const left = canonicalPackageJson({ items: ["b", "a"] });
    const right = canonicalPackageJson({ items: ["a", "b"] });
    expect(left).not.toBe(right);
  });

  it("sorts set-order fields (permissions) regardless of input order", () => {
    const left = canonicalPackageJson({ permissions: ["network", "read_file"] });
    const right = canonicalPackageJson({ permissions: ["read_file", "network"] });
    expect(left).toBe(right);
  });

  it("excludes the object's own digest field", () => {
    const without = canonicalPackageJson({ a: 1 });
    const withDigest = canonicalPackageJson({ a: 1, digest: "e".repeat(64) });
    expect(without).toBe(withDigest);
  });

  it("keeps nested digest keys that are not the top-level object digest", () => {
    const nested = canonicalPackageJson({ evidence: [{ digest: "a".repeat(64) }] });
    expect(nested).toContain('"digest"');
  });

  it("preserves unicode as UTF-8", () => {
    const value = canonicalPackageJson({ text: "表格提取" });
    expect(value).toContain("表格提取");
  });

  it("rejects non-plain objects and cyclic values", () => {
    expect(() => canonicalPackageJson(new Map([["a", 1]]))).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalPackageJson(cyclic)).toThrow();
  });
});

describe("packageContentDigest", () => {
  it("is stable for shuffled input map order", () => {
    const left = packageContentDigest(basePackage({ permissions: ["read_file", "network"] }));
    const right = packageContentDigest(basePackage({ permissions: ["network", "read_file"] }));
    expect(left).toBe(right);
  });

  it("changes when any meaningful field changes", () => {
    const baseline = packageContentDigest(basePackage());
    const changed = [
      basePackage({ version: "1.2.4" }),
      basePackage({ title: "PDF Table Extraction v2" }),
      basePackage({ instructions: "Different instructions." }),
      basePackage({ triggers: ["only this"] }),
      basePackage({ license: { spdx_id: "Apache-2.0", provenance_confidence: "high" } }),
      basePackage({ created_at: "2026-09-17T05:30:00.000Z" }),
      basePackage({ release_version: 2 })
    ];
    for (const candidate of changed) {
      expect(packageContentDigest(candidate)).not.toBe(baseline);
    }
  });

  it("ignores the carried digest field value", () => {
    const left = packageContentDigest(basePackage({ digest: "a".repeat(64) }));
    const right = packageContentDigest(basePackage({ digest: "b".repeat(64) }));
    expect(left).toBe(right);
  });

  it("verifyPackageContentDigest checks the carried digest", () => {
    const pkg = basePackage();
    const digest = packageContentDigest(pkg);
    expect(verifyPackageContentDigest({ ...pkg, digest })).toBe(true);
    expect(verifyPackageContentDigest(pkg)).toBe(false);
  });
});
