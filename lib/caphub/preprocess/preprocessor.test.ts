import { describe, expect, it, vi } from "vitest";
import { CAPHUB_ANALYSIS_LIMITS } from "../analysis/limits";
import { createRasterFixture, objectRefFor } from "./fixtures";
import { preprocessCapture } from "./preprocessor";

const CAPTURE_ID = `cap_${"a".repeat(32)}`;

describe("capture-level deterministic preprocessing", () => {
  it("preserves order, detects exact duplicates, aggregates indicators, and returns schema-valid evidence", async () => {
    const first = await createRasterFixture();
    const second = Uint8Array.from(first);
    const sourceSnapshot = Uint8Array.from(first);
    const recognizeText = vi.fn(async (_bytes: Uint8Array, index: number) => [{
      page: 0,
      text: index === 0 ? "https://example.com/tool owner@example.com" : "@example/tool",
      confidence: 0.95,
      bbox: { x: 2, y: 20, width: 70, height: 12 }
    }]);
    const result = await preprocessCapture({
      captureId: CAPTURE_ID,
      images: [first, second].map((bytes) => ({ bytes, object: objectRefFor(bytes) })),
      now: () => new Date("2026-09-16T01:00:00.000Z")
    }, { recognizeText, decodeBarcodes: async () => [] });

    expect(result.images.map((image) => image.index)).toEqual([0, 1]);
    expect(result.duplicate_groups).toEqual([[0, 1]]);
    expect(result.indicators.urls).toContain("https://example.com/tool");
    expect(result.indicators.packages).toContain("@example/tool");
    expect(result.privacy_suggestions[0].action).toBe("human_redaction_review");
    expect(first).toEqual(sourceSnapshot);
  });

  it("groups perceptually similar but byte-distinct images", async () => {
    const first = await createRasterFixture({ border: 4 });
    const second = await createRasterFixture({ border: 5 });
    const result = await preprocessCapture({
      captureId: CAPTURE_ID,
      images: [first, second].map((bytes) => ({ bytes, object: objectRefFor(bytes) }))
    }, { recognizeText: async () => [], decodeBarcodes: async () => [] });
    expect(result.duplicate_groups).toEqual([]);
    expect(result.near_duplicate_groups).toEqual([[0, 1]]);
  });

  it("rejects image-count, aggregate-byte, and pixel ceilings before OCR", async () => {
    const bytes = await createRasterFixture({ width: 20, height: 20 });
    const recognizeText = vi.fn(async () => []);

    await expect(preprocessCapture({
      captureId: CAPTURE_ID,
      images: Array.from({ length: CAPHUB_ANALYSIS_LIMITS.maxImages + 1 }, () => ({
        bytes,
        object: objectRefFor(bytes)
      }))
    }, { recognizeText, decodeBarcodes: async () => [] })).rejects.toThrow(/MAX_IMAGES/);

    await expect(preprocessCapture({
      captureId: CAPTURE_ID,
      images: [{ bytes, object: objectRefFor(bytes) }]
    }, { recognizeText, decodeBarcodes: async () => [] }, {
      limits: { maxAggregateImageBytes: bytes.byteLength - 1 }
    })).rejects.toThrow(/MAX_AGGREGATE_IMAGE_BYTES/);

    await expect(preprocessCapture({
      captureId: CAPTURE_ID,
      images: [{ bytes, object: objectRefFor(bytes) }]
    }, { recognizeText, decodeBarcodes: async () => [] }, {
      limits: { maxPixelsPerImage: 399 }
    })).rejects.toThrow(/MAX_PIXELS_PER_IMAGE/);

    await expect(preprocessCapture({
      captureId: CAPTURE_ID,
      images: [bytes, bytes].map((imageBytes) => ({
        bytes: imageBytes,
        object: objectRefFor(imageBytes)
      }))
    }, { recognizeText, decodeBarcodes: async () => [] }, {
      limits: { maxAggregatePixels: 799 }
    })).rejects.toThrow(/MAX_AGGREGATE_PIXELS/);

    expect(recognizeText).not.toHaveBeenCalled();
  });

  it("aborts in-flight OCR when the whole preprocessing stage reaches its deadline", async () => {
    const bytes = await createRasterFixture();
    let observedSignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = preprocessCapture({
        captureId: CAPTURE_ID,
        images: [{ bytes, object: objectRefFor(bytes) }]
      }, {
        recognizeText: async (_input, _index, signal) => {
          observedSignal = signal;
          markStarted?.();
          return await new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(new Error("OCR_ABORTED")), { once: true });
          });
        },
        decodeBarcodes: async () => []
      }, {
        limits: { preprocessingTimeoutMs: 5, ocrTimeoutMsPerImage: 50 }
      });
      await started;
      const rejection = expect(pending).rejects.toThrow(/PREPROCESSING_TIMEOUT/);
      await vi.advanceTimersByTimeAsync(5);
      await rejection;
      expect(observedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
