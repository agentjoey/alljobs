import { CAPHUB_ANALYSIS_LIMITS } from "../analysis/limits";
import { preprocessResultSchema } from "../analysis/schemas";
import type { PreprocessResult } from "../analysis/types";
import type { CaptureId, ObjectRef } from "../domain/types";
import { inspectImage, preprocessImage, type ImagePreprocessorDependencies } from "./image";
import { extractTextIndicators, suggestPrivacyReviews } from "./text";

interface CaptureImageInput {
  bytes: Uint8Array;
  object: ObjectRef;
}

interface PreprocessCaptureInput {
  captureId: CaptureId;
  images: readonly CaptureImageInput[];
  now?: () => Date;
}

interface LimitOverrides {
  maxImages?: number;
  maxAggregateImageBytes?: number;
  maxAggregatePixels?: number;
  maxPixelsPerImage?: number;
  preprocessingTimeoutMs?: number;
  ocrTimeoutMsPerImage?: number;
}

function boundedLimit(value: number | undefined, ceiling: number): number {
  if (value === undefined) return ceiling;
  if (!Number.isInteger(value) || value < 1 || value > ceiling) throw new Error("INVALID_LIMIT_OVERRIDE");
  return value;
}

function groupDuplicates(
  values: readonly string[],
  predicate: (left: string, right: string, leftIndex: number, rightIndex: number) => boolean
): number[][] {
  const visited = new Set<number>();
  const groups: number[][] = [];
  for (let left = 0; left < values.length; left += 1) {
    if (visited.has(left)) continue;
    const group = [left];
    for (let right = left + 1; right < values.length; right += 1) {
      if (predicate(values[left], values[right], left, right)) group.push(right);
    }
    if (group.length > 1) {
      group.forEach((index) => visited.add(index));
      groups.push(group);
    }
  }
  return groups;
}

function hammingDistance(left: string, right: string): number {
  const leftBits = BigInt(`0x${left}`);
  const rightBits = BigInt(`0x${right}`);
  let difference = leftBits ^ rightBits;
  let count = 0;
  while (difference > BigInt(0)) {
    count += Number(difference & BigInt(1));
    difference >>= BigInt(1);
  }
  return count;
}

export async function preprocessCapture(
  input: PreprocessCaptureInput,
  dependencies: ImagePreprocessorDependencies,
  options: { limits?: LimitOverrides } = {}
): Promise<PreprocessResult> {
  const limits = {
    maxImages: boundedLimit(options.limits?.maxImages, CAPHUB_ANALYSIS_LIMITS.maxImages),
    maxAggregateImageBytes: boundedLimit(options.limits?.maxAggregateImageBytes, CAPHUB_ANALYSIS_LIMITS.maxAggregateImageBytes),
    maxAggregatePixels: boundedLimit(options.limits?.maxAggregatePixels, CAPHUB_ANALYSIS_LIMITS.maxAggregatePixels),
    maxPixelsPerImage: boundedLimit(options.limits?.maxPixelsPerImage, CAPHUB_ANALYSIS_LIMITS.maxPixelsPerImage),
    preprocessingTimeoutMs: boundedLimit(options.limits?.preprocessingTimeoutMs, CAPHUB_ANALYSIS_LIMITS.preprocessingTimeoutMs),
    ocrTimeoutMsPerImage: boundedLimit(options.limits?.ocrTimeoutMsPerImage, CAPHUB_ANALYSIS_LIMITS.ocrTimeoutMsPerImage)
  };
  if (input.images.length < 1 || input.images.length > limits.maxImages) throw new Error("MAX_IMAGES");
  if (input.images.reduce((sum, image) => sum + image.bytes.byteLength, 0) > limits.maxAggregateImageBytes) {
    throw new Error("MAX_AGGREGATE_IMAGE_BYTES");
  }

  const metadata = await Promise.all(input.images.map((image) => inspectImage(image.bytes)));
  if (metadata.some((item) => item.pixels > limits.maxPixelsPerImage)) throw new Error("MAX_PIXELS_PER_IMAGE");
  if (metadata.reduce((sum, item) => sum + item.pixels, 0) > limits.maxAggregatePixels) {
    throw new Error("MAX_AGGREGATE_PIXELS");
  }

  const work = async () => {
    const images: PreprocessResult["images"] = [];
    for (let index = 0; index < input.images.length; index += 1) {
      const image = input.images[index];
      images.push(await preprocessImage({
        index,
        bytes: image.bytes,
        sourceObject: image.object
      }, dependencies, { ocrTimeoutMs: limits.ocrTimeoutMsPerImage }));
    }
    const textByImage = images.map((image) => image.ocr_blocks.map((block) => block.text));
    const indicators = extractTextIndicators(textByImage.flat());
    for (const image of images) {
      indicators.urls.push(...image.barcode_payloads.filter((value) => value.startsWith("https://")));
    }
    for (const key of Object.keys(indicators) as Array<keyof typeof indicators>) {
      indicators[key] = [...new Set(indicators[key])].sort();
    }

    return preprocessResultSchema.parse({
      schema_version: 1,
      capture_id: input.captureId,
      images,
      indicators,
      duplicate_groups: groupDuplicates(images.map((image) => image.original_digest), (left, right) => left === right),
      near_duplicate_groups: groupDuplicates(
        images.map((image) => image.perceptual_hash),
        (left, right, leftIndex, rightIndex) =>
          images[leftIndex].original_digest !== images[rightIndex].original_digest
          && hammingDistance(left, right) <= 4
      ),
      privacy_suggestions: textByImage.flatMap((texts, index) => suggestPrivacyReviews(texts, index)),
      created_at: (input.now ?? (() => new Date()))().toISOString()
    });
  };

  return new Promise<PreprocessResult>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("PREPROCESSING_TIMEOUT")), limits.preprocessingTimeoutMs);
    work().then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}
