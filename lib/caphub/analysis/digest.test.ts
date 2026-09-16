import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, digestCanonicalJson } from "./digest";

describe("canonical P2 analysis digests", () => {
  it("sorts object keys recursively while preserving array order", () => {
    const left = {
      z: [{ beta: 2, alpha: 1 }],
      a: { y: true, x: null }
    };
    const right = {
      a: { x: null, y: true },
      z: [{ alpha: 1, beta: 2 }]
    };

    expect(canonicalJson(left)).toBe('{"a":{"x":null,"y":true},"z":[{"alpha":1,"beta":2}]}');
    expect(canonicalJson(right)).toBe(canonicalJson(left));
    expect(digestCanonicalJson(right)).toBe(digestCanonicalJson(left));
    expect(digestCanonicalJson({ values: [1, 2] })).not.toBe(
      digestCanonicalJson({ values: [2, 1] })
    );
  });

  it("hashes the UTF-8 canonical JSON with SHA-256", () => {
    const canonical = canonicalJson({ emoji: "证据", enabled: true });
    expect(digestCanonicalJson({ enabled: true, emoji: "证据" })).toBe(
      createHash("sha256").update(canonical, "utf8").digest("hex")
    );
  });

  it("does not mutate the source value", () => {
    const source = { nested: { b: 2, a: 1 }, array: [{ d: 4, c: 3 }] };
    const snapshot = structuredClone(source);
    canonicalJson(source);
    expect(source).toEqual(snapshot);
  });

  it("rejects values that JSON cannot represent canonically", () => {
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, BigInt(1)]) {
      expect(() => canonicalJson(value)).toThrow();
    }
    expect(() => canonicalJson({ missing: undefined })).toThrow();
  });
});
