import { describe, expect, it } from "vitest";
import { computeDigest, decodeUtf8 } from "./digest";

describe("complete-file byte handling", () => {
  it("distinguishes malformed byte sequences that lossy UTF-8 decoding conflates", () => {
    expect(computeDigest(Buffer.from([0xff]))).not.toBe(computeDigest(Buffer.from([0xfe])));
  });

  it("fails closed instead of replacing malformed UTF-8 bytes", () => {
    expect(() => decodeUtf8(Buffer.from([0x23, 0x20, 0xff]))).toThrow("valid UTF-8");
  });

  it("round-trips valid UTF-8 including a byte-order mark exactly", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("# Backlog\n你好\n", "utf8")]);

    expect(Buffer.from(decodeUtf8(bytes), "utf8")).toEqual(bytes);
  });
});
