// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createQrFixture, createRasterFixture, objectRefFor } from "./fixtures";
import {
  createPackagedTesseractRecognizer,
  decodeBarcodesWithZxing,
  preprocessImage
} from "./image";

describe("deterministic image preprocessing", () => {
  it("normalizes EXIF orientation and reports deterministic quality, OCR, regions, and barcode evidence", async () => {
    const bytes = await createRasterFixture({ width: 80, height: 48, orientation: 6 });
    const result = await preprocessImage({ index: 0, bytes, sourceObject: objectRefFor(bytes) }, {
      recognizeText: async () => [
        { page: 0, text: "Toolbar", confidence: 0.99, bbox: { x: 2, y: 2, width: 40, height: 8 } },
        { page: 0, text: "https://example.com/tool", confidence: 0.98, bbox: { x: 5, y: 25, width: 60, height: 10 } }
      ],
      decodeBarcodes: async () => [{ format: "QR_CODE", payload: "https://example.com/qr" }]
    });

    expect(result.orientation_applied).toBe(6);
    expect([result.width, result.height]).toEqual([48, 80]);
    expect(result.quality).toEqual(expect.objectContaining({
      sharpness: expect.any(Number),
      black_border_ratio: expect.any(Number),
      ocr_usable: expect.any(Boolean)
    }));
    expect(result.ocr_blocks.map((block) => block.text)).toEqual([
      "Toolbar",
      "https://example.com/tool"
    ]);
    expect(result.regions.map((region) => region.kind)).toEqual(
      expect.arrayContaining(["platform_ui", "body"])
    );
    expect(result.barcode_payloads).toEqual(["https://example.com/qr"]);
    expect(result.normalized_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.perceptual_hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("sorts OCR blocks by page, y, x, and text", async () => {
    const bytes = await createRasterFixture();
    const result = await preprocessImage({ index: 0, bytes, sourceObject: objectRefFor(bytes) }, {
      recognizeText: async () => [
        { page: 1, text: "later", confidence: 1, bbox: { x: 0, y: 0, width: 10, height: 10 } },
        { page: 0, text: "beta", confidence: 1, bbox: { x: 20, y: 10, width: 10, height: 10 } },
        { page: 0, text: "alpha", confidence: 1, bbox: { x: 10, y: 10, width: 10, height: 10 } }
      ],
      decodeBarcodes: async () => []
    });
    expect(result.ocr_blocks.map((block) => block.text)).toEqual(["alpha", "beta", "later"]);
  });

  it("fails closed when OCR exceeds its deadline", async () => {
    const bytes = await createRasterFixture();
    let observedSignal: AbortSignal | undefined;
    await expect(preprocessImage(
      { index: 0, bytes, sourceObject: objectRefFor(bytes) },
      {
        recognizeText: async (_input, _index, signal) => {
          observedSignal = signal;
          return await new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(new Error("OCR_ABORTED")), { once: true });
          });
        },
        decodeBarcodes: async () => []
      },
      { ocrTimeoutMs: 5 }
    )).rejects.toThrow(/OCR_TIMEOUT/);
    expect(observedSignal?.aborted).toBe(true);
  });

  it("decodes a generated QR fixture through the real ZXing boundary", async () => {
    const bytes = await createQrFixture("https://example.com/qr");
    await expect(decodeBarcodesWithZxing(bytes)).resolves.toEqual([
      { format: "QR_CODE", payload: "https://example.com/qr" }
    ]);
  });

  it("loads OCR exclusively from the installed English and Simplified-Chinese packages", async () => {
    const bytes = await createRasterFixture({ width: 96, height: 64 });
    for (const language of ["eng", "chi_sim"] as const) {
      const recognize = createPackagedTesseractRecognizer(language);
      await expect(recognize(bytes)).resolves.toEqual(expect.any(Array));
    }
  }, 30_000);
});
