import { describe, expect, it } from "vitest";
import { assistantDigest, canonicalize } from "./digest";

describe("assistantDigest canonicalization", () => {
  it("sorts object keys recursively", () => {
    const a = { z: 1, a: { y: 2, b: 3 } };
    const b = { a: { b: 3, y: 2 }, z: 1 };
    expect(assistantDigest(a)).toBe(assistantDigest(b));
  });

  it("preserves array order", () => {
    expect(assistantDigest({ items: [1, 2, 3] })).not.toBe(assistantDigest({ items: [3, 2, 1] }));
  });

  it("produces different digests for different values", () => {
    expect(assistantDigest({ a: 1 })).not.toBe(assistantDigest({ a: 2 }));
  });

  it("is deterministic for repeated calls", () => {
    const value = { b: [1, { d: 4, c: 3 }], a: "x" };
    expect(assistantDigest(value)).toBe(assistantDigest(value));
  });

  it("returns a 64-character lowercase hex digest", () => {
    expect(assistantDigest({ a: 1 })).toMatch(/^[a-f0-9]{64}$/);
  });

  it("distinguishes arrays from objects at the top level", () => {
    expect(assistantDigest([1, 2])).not.toBe(assistantDigest({ 0: 1, 1: 2 }));
  });

  it("canonicalizes arrays to plain arrays and objects to sorted key objects", () => {
    expect(canonicalize({ b: 2, a: 1 })).toEqual({ a: 1, b: 2 });
    expect(canonicalize([{ b: 2, a: 1 }])).toEqual([{ a: 1, b: 2 }]);
  });
});
