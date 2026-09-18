import "server-only";

import { createHash } from "node:crypto";
import { APICallError, generateText, type ModelMessage } from "ai";
import {
  createMiniMaxTokenPlanModel,
  MINIMAX_TOKEN_PLAN_MODEL
} from "../../assistant/minimax-token-plan";
import { CAPHUB_ANALYSIS_LIMITS } from "../analysis/limits";
import {
  ProviderInvocationError,
  type StructuredProvider,
  type StructuredProviderInput,
  type StructuredProviderOutput
} from "./contracts";
import {
  buildMiniMaxCorrectionPrompt,
  buildMiniMaxCriticPrompt,
  buildMiniMaxVisualObservationPrompt
} from "./prompts";

type MiniMaxContentPart =
  | { type: "text"; text: string }
  | { type: "file"; data: Uint8Array; mediaType: string };

export interface MiniMaxGenerationRequest {
  model: typeof MINIMAX_TOKEN_PLAN_MODEL;
  messages: Array<{
    role: "user";
    content: MiniMaxContentPart[];
  }>;
  maxOutputTokens: number;
  maxRetries: 0;
  abortSignal: AbortSignal;
}

export interface MiniMaxGenerationResult {
  text: string;
  finishReason: string;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
  };
}

export type MiniMaxGenerate = (
  request: MiniMaxGenerationRequest
) => Promise<MiniMaxGenerationResult>;

export type NormalizedImageInput = {
  index: number;
  data: Uint8Array;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
};

export type MiniMaxExtractionInput = {
  preprocess: unknown;
  normalizedImages: NormalizedImageInput[];
};

export type MiniMaxInvocationOptions = {
  inputDigest: string;
  signal: AbortSignal;
};

type MiniMaxUsage = {
  inputTokens: number;
  outputTokens: number;
};

export interface MiniMaxVisualObservationResult {
  text: string;
  usage: MiniMaxUsage;
  finishReason: string;
  outputBytes: number;
}

export interface MiniMaxVisualObservationErrorMetadata {
  finishReason: string;
  outputBytes: number;
  outputDigest: string;
  usage?: MiniMaxUsage;
}

export class MiniMaxVisualObservationError extends ProviderInvocationError {
  readonly metadata: Readonly<MiniMaxVisualObservationErrorMetadata>;

  constructor(metadata: MiniMaxVisualObservationErrorMetadata) {
    super("INVALID_OUTPUT");
    this.name = "MiniMaxVisualObservationError";
    this.metadata = Object.freeze(metadata.usage
      ? { ...metadata, usage: Object.freeze({ ...metadata.usage }) }
      : {
          finishReason: metadata.finishReason,
          outputBytes: metadata.outputBytes,
          outputDigest: metadata.outputDigest
        });
  }
}

function extractionInput(value: unknown): MiniMaxExtractionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderInvocationError("INVALID_OUTPUT");
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.normalizedImages)) {
    throw new ProviderInvocationError("INVALID_OUTPUT");
  }
  const normalizedImages = record.normalizedImages.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new ProviderInvocationError("INVALID_OUTPUT");
    }
    const image = candidate as Record<string, unknown>;
    if (!Number.isInteger(image.index)
      || !(image.data instanceof Uint8Array)
      || !["image/png", "image/jpeg", "image/webp"].includes(String(image.mediaType))) {
      throw new ProviderInvocationError("INVALID_OUTPUT");
    }
    return image as NormalizedImageInput;
  });
  return { preprocess: record.preprocess, normalizedImages };
}

async function generateMiniMax(
  request: MiniMaxGenerationRequest,
  apiKey?: string
): Promise<MiniMaxGenerationResult> {
  const result = await generateText({
    model: createMiniMaxTokenPlanModel({ mode: "standard", apiKey }),
    messages: request.messages as ModelMessage[],
    maxOutputTokens: request.maxOutputTokens,
    maxRetries: request.maxRetries,
    abortSignal: request.abortSignal
  });
  return {
    text: result.text,
    finishReason: result.finishReason,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens
    }
  };
}

function parseTerminalJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ProviderInvocationError("INVALID_OUTPUT", { cause: error });
  }
}

const MINIMAX_FINISH_REASONS = new Set([
  "stop",
  "length",
  "content-filter",
  "tool-calls",
  "error",
  "other"
]);

function normalizedFinishReason(value: unknown): string {
  return typeof value === "string" && MINIMAX_FINISH_REASONS.has(value) ? value : "other";
}

function validatedUsage(value: MiniMaxGenerationResult["usage"]): MiniMaxUsage | undefined {
  return typeof value.inputTokens === "number"
    && Number.isInteger(value.inputTokens)
    && value.inputTokens >= 0
    && typeof value.outputTokens === "number"
    && Number.isInteger(value.outputTokens)
    && value.outputTokens >= 0
    ? { inputTokens: value.inputTokens, outputTokens: value.outputTokens }
    : undefined;
}

function observationError(
  result: MiniMaxGenerationResult,
  outputBytes: number,
  usage: MiniMaxUsage | undefined
): MiniMaxVisualObservationError {
  return new MiniMaxVisualObservationError({
    finishReason: normalizedFinishReason(result.finishReason),
    outputBytes,
    outputDigest: createHash("sha256").update(result.text, "utf8").digest("hex"),
    ...(usage ? { usage } : {})
  });
}

export class MiniMaxProvider implements StructuredProvider {
  readonly provider = "minimax" as const;
  readonly model = MINIMAX_TOKEN_PLAN_MODEL;
  private readonly generate: MiniMaxGenerate;

  constructor(options: { generate?: MiniMaxGenerate; apiKey?: string } = {}) {
    this.generate = options.generate ?? ((request) => generateMiniMax(request, options.apiKey));
  }

  async invoke(input: StructuredProviderInput): Promise<StructuredProviderOutput> {
    if (input.stage !== "critic") {
      throw new ProviderInvocationError("PERMISSION");
    }

    let content: MiniMaxContentPart[];
    if (input.kind === "correction") {
      content = [{
        type: "text",
        text: buildMiniMaxCorrectionPrompt({ stage: input.stage, ...input.correction })
      }];
    } else {
      content = [{ type: "text", text: buildMiniMaxCriticPrompt(input.input) }];
    }

    const result = await this.generate({
      model: MINIMAX_TOKEN_PLAN_MODEL,
      messages: [{ role: "user", content }],
      maxOutputTokens: CAPHUB_ANALYSIS_LIMITS.maxOutputTokens.critic,
      maxRetries: 0,
      abortSignal: input.signal
    });
    return {
      value: parseTerminalJson(result.text),
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0
      }
    };
  }

  async observe(
    input: MiniMaxExtractionInput,
    options: MiniMaxInvocationOptions
  ): Promise<MiniMaxVisualObservationResult> {
    const extraction = extractionInput(input);
    const content: MiniMaxContentPart[] = [
      { type: "text", text: buildMiniMaxVisualObservationPrompt(extraction.preprocess) },
      ...[...extraction.normalizedImages]
        .sort((left, right) => left.index - right.index)
        .map((image): MiniMaxContentPart => ({
          type: "file",
          data: image.data,
          mediaType: image.mediaType
        }))
    ];
    let result: MiniMaxGenerationResult;
    try {
      result = await this.generate({
        model: MINIMAX_TOKEN_PLAN_MODEL,
        messages: [{ role: "user", content }],
        maxOutputTokens: CAPHUB_ANALYSIS_LIMITS.maxVisualObservationOutputTokens,
        maxRetries: 0,
        abortSignal: options.signal
      });
    } catch (error) {
      if (APICallError.isInstance(error)) {
        // SDK errors may contain provider bodies, request headers, and credentials.
        // Retain only the closed application code, never the original cause.
        throw new ProviderInvocationError(error.statusCode === 401
          ? "AUTHENTICATION"
          : error.statusCode === 402 ? "BILLING" : "UNAVAILABLE");
      }
      throw error;
    }
    const outputBytes = Buffer.byteLength(result.text, "utf8");
    const usage = validatedUsage(result.usage);
    if (normalizedFinishReason(result.finishReason) !== "stop"
      || result.text.trim().length === 0
      || outputBytes > CAPHUB_ANALYSIS_LIMITS.maxVisualObservationBytes
      || !usage) {
      throw observationError(result, outputBytes, usage);
    }
    return {
      text: result.text,
      usage,
      finishReason: "stop",
      outputBytes
    };
  }

  critique(
    input: unknown,
    options: MiniMaxInvocationOptions
  ): Promise<StructuredProviderOutput> {
    return this.invoke({
      kind: "initial",
      stage: "critic",
      inputDigest: options.inputDigest,
      input,
      signal: options.signal
    });
  }
}
