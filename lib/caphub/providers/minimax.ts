import "server-only";

import { generateText, type ModelMessage } from "ai";
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
  buildMiniMaxExtractionPrompt
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
  usage: {
    inputTokens: number;
    outputTokens: number;
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
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0
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

export class MiniMaxProvider implements StructuredProvider {
  readonly provider = "minimax" as const;
  readonly model = MINIMAX_TOKEN_PLAN_MODEL;
  private readonly generate: MiniMaxGenerate;

  constructor(options: { generate?: MiniMaxGenerate; apiKey?: string } = {}) {
    this.generate = options.generate ?? ((request) => generateMiniMax(request, options.apiKey));
  }

  async invoke(input: StructuredProviderInput): Promise<StructuredProviderOutput> {
    if (input.stage !== "extraction" && input.stage !== "critic") {
      throw new ProviderInvocationError("PERMISSION");
    }

    let content: MiniMaxContentPart[];
    if (input.kind === "correction") {
      content = [{
        type: "text",
        text: buildMiniMaxCorrectionPrompt({ stage: input.stage, ...input.correction })
      }];
    } else if (input.stage === "extraction") {
      const extraction = extractionInput(input.input);
      content = [
        { type: "text", text: buildMiniMaxExtractionPrompt(extraction.preprocess) },
        ...[...extraction.normalizedImages]
          .sort((left, right) => left.index - right.index)
          .map((image): MiniMaxContentPart => ({
            type: "file",
            data: image.data,
            mediaType: image.mediaType
          }))
      ];
    } else {
      content = [{ type: "text", text: buildMiniMaxCriticPrompt(input.input) }];
    }

    const result = await this.generate({
      model: MINIMAX_TOKEN_PLAN_MODEL,
      messages: [{ role: "user", content }],
      maxOutputTokens: CAPHUB_ANALYSIS_LIMITS.maxOutputTokens[input.stage],
      maxRetries: 0,
      abortSignal: input.signal
    });
    return {
      value: parseTerminalJson(result.text),
      usage: result.usage
    };
  }

  extract(
    input: MiniMaxExtractionInput,
    options: MiniMaxInvocationOptions
  ): Promise<StructuredProviderOutput> {
    return this.invoke({
      kind: "initial",
      stage: "extraction",
      inputDigest: options.inputDigest,
      input,
      signal: options.signal
    });
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
