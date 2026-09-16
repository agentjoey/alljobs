import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
  RGBLuminanceSource
} from "@zxing/library";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import type { ObjectRef } from "../domain/types";
import type { PreprocessResult } from "../analysis/types";

export interface OcrBlockInput {
  page: number;
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface BarcodeFinding {
  format: string;
  payload: string;
}

export interface ImagePreprocessorDependencies {
  recognizeText(bytes: Uint8Array, imageIndex: number): Promise<readonly OcrBlockInput[]>;
  decodeBarcodes(bytes: Uint8Array, imageIndex: number): Promise<readonly BarcodeFinding[]>;
}

export interface ImageMetadata {
  width: number;
  height: number;
  orientation: number;
  pixels: number;
}

const localRequire = createRequire(import.meta.url);

export function createPackagedTesseractRecognizer(language: "eng" | "chi_sim" = "eng") {
  return async (bytes: Uint8Array): Promise<readonly OcrBlockInput[]> => {
    const packageName = language === "eng" ? "@tesseract.js-data/eng" : "@tesseract.js-data/chi_sim";
    const languageData = localRequire(packageName) as { code: string; gzip: boolean; langPath: string };
    const worker = await createWorker(languageData.code, 1, {
      langPath: languageData.langPath,
      gzip: languageData.gzip,
      cacheMethod: "none"
    });
    try {
      const result = await worker.recognize(Buffer.from(bytes), {}, { blocks: true });
      const output: OcrBlockInput[] = [];
      for (const block of result.data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            for (const word of line.words) {
              output.push({
                page: 0,
                text: word.text,
                confidence: Math.max(0, Math.min(1, word.confidence / 100)),
                bbox: {
                  x: word.bbox.x0,
                  y: word.bbox.y0,
                  width: word.bbox.x1 - word.bbox.x0,
                  height: word.bbox.y1 - word.bbox.y0
                }
              });
            }
          }
        }
      }
      return output;
    } finally {
      await worker.terminate();
    }
  };
}

export async function decodeBarcodesWithZxing(bytes: Uint8Array): Promise<readonly BarcodeFinding[]> {
  const image = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
  const source = new RGBLuminanceSource(
    new Uint8ClampedArray(image.data),
    image.info.width,
    image.info.height
  );
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  try {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.CODE_128,
      BarcodeFormat.EAN_13
    ]);
    const result = new MultiFormatReader().decode(bitmap, hints);
    return [{
      format: BarcodeFormat[result.getBarcodeFormat()],
      payload: result.getText()
    }];
  } catch (error) {
    if (error instanceof NotFoundException) return [];
    throw error;
  }
}

type PreprocessImage = PreprocessResult["images"][number];

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

export async function inspectImage(bytes: Uint8Array): Promise<ImageMetadata> {
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) throw new Error("INVALID_IMAGE_DIMENSIONS");
  const orientation = metadata.orientation ?? 1;
  const swapsAxes = orientation >= 5 && orientation <= 8;
  const width = swapsAxes ? metadata.height : metadata.width;
  const height = swapsAxes ? metadata.width : metadata.height;
  return { width, height, orientation, pixels: width * height };
}

function calculateSharpness(pixels: Uint8Array, width: number, height: number): number {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const difference = pixels[y * width + x] - pixels[y * width + x - 1];
      sum += difference * difference;
      count += 1;
    }
  }
  return Number((count === 0 ? 0 : sum / count).toFixed(6));
}

function calculateBlackBorderRatio(pixels: Uint8Array, width: number, height: number): number {
  const thickness = Math.max(1, Math.floor(Math.min(width, height) * 0.05));
  let borderPixels = 0;
  let blackPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= thickness && y >= thickness && x < width - thickness && y < height - thickness) continue;
      borderPixels += 1;
      if (pixels[y * width + x] <= 16) blackPixels += 1;
    }
  }
  return Number((blackPixels / borderPixels).toFixed(6));
}

async function perceptualHash(bytes: Uint8Array): Promise<string> {
  const pixels = await sharp(bytes).greyscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
  const average = pixels.reduce((total, value) => total + value, 0) / pixels.length;
  let bits = "";
  for (const pixel of pixels) bits += pixel >= average ? "1" : "0";
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

function classifyRegion(block: OcrBlockInput, height: number): PreprocessImage["regions"][number]["kind"] {
  const center = (block.bbox.y + block.bbox.height / 2) / height;
  if (center <= 0.15) return "platform_ui";
  if (center >= 0.8) return block.text.length <= 80 ? "subtitle" : "comment";
  return block.text.trim() ? "body" : "unknown";
}

export async function preprocessImage(
  input: { index: number; bytes: Uint8Array; sourceObject: ObjectRef },
  dependencies: ImagePreprocessorDependencies,
  options: { ocrTimeoutMs?: number } = {}
): Promise<PreprocessImage> {
  const metadata = await inspectImage(input.bytes);
  const normalized = new Uint8Array(await sharp(input.bytes)
    .rotate()
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer());
  const raw = await sharp(normalized).greyscale().raw().toBuffer();
  const ocr = await withTimeout(
    dependencies.recognizeText(normalized, input.index),
    options.ocrTimeoutMs ?? 15_000,
    "OCR_TIMEOUT"
  );
  const sortedOcr = [...ocr].sort((left, right) =>
    left.page - right.page
    || left.bbox.y - right.bbox.y
    || left.bbox.x - right.bbox.x
    || left.text.localeCompare(right.text)
  );
  const barcodes = await dependencies.decodeBarcodes(normalized, input.index);
  const sharpness = calculateSharpness(raw, metadata.width, metadata.height);

  return {
    index: input.index,
    source_object: input.sourceObject,
    original_digest: sha256(input.bytes),
    normalized_digest: sha256(normalized),
    width: metadata.width,
    height: metadata.height,
    orientation_applied: metadata.orientation,
    perceptual_hash: await perceptualHash(normalized),
    quality: {
      sharpness,
      black_border_ratio: calculateBlackBorderRatio(raw, metadata.width, metadata.height),
      ocr_usable: metadata.width >= 32 && metadata.height >= 32 && sharpness >= 1
    },
    regions: sortedOcr.map((block) => ({
      kind: classifyRegion(block, metadata.height),
      bbox: block.bbox,
      text: block.text
    })),
    ocr_blocks: sortedOcr.map((block) => ({
      text: block.text,
      confidence: block.confidence,
      bbox: block.bbox
    })),
    barcode_payloads: [...new Set(barcodes.map((finding) => finding.payload))].sort()
  };
}
