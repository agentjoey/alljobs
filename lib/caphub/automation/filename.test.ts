import { describe, expect, it } from "vitest";
import { normalizeCaptureFilename } from "./filename";

describe("Capture filename identity", () => {
  it("normalizes case, surrounding whitespace and Unicode without changing interior spaces", () => {
    expect(normalizeCaptureFilename(" IMG_1194.PNG ")).toBe("img_1194.png");
    expect(normalizeCaptureFilename("e\u0301.png")).toBe("é.png");
    expect(normalizeCaptureFilename("A B.PNG")).toBe("a b.png");
  });
  it.each(["", "   ", ".", "..", "../a.png", "a\\b.png", "a\u0000.png", "a\n.png", "a".repeat(256)])("rejects invalid filename %j", (name) => {
    expect(() => normalizeCaptureFilename(name)).toThrow("INVALID_FILENAME");
  });
});
