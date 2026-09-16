import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import type { z } from "zod";
import { ProviderInvocationError, type StructuredProviderStage } from "./contracts";
import type { KimiStageAdapter, KimiStageRequest, KimiStageResult } from "./kimi";

export const KIMI_API_BASE_URL = "https://api.kimi.com/coding/v1";
export const KIMI_API_MODEL = "k3-256k";

export interface KimiApiTransportRequest {
  baseURL: typeof KIMI_API_BASE_URL;
  model: typeof KIMI_API_MODEL;
  apiKey: string;
  stage: Extract<StructuredProviderStage, "research" | "assessment">;
  prompt: string;
  schema: z.ZodType<unknown>;
  structuredOutput: true;
  maxOutputTokens: number;
  maxRetries: 0;
  abortSignal: AbortSignal;
}

export type KimiApiTransport = (
  request: KimiApiTransportRequest
) => Promise<KimiStageResult>;

async function directKimiTransport(request: KimiApiTransportRequest): Promise<KimiStageResult> {
  const provider = createOpenAI({
    name: "kimi-coding",
    baseURL: request.baseURL,
    apiKey: request.apiKey
  });
  const result = await generateText({
    model: provider.chat(request.model),
    output: Output.object({ schema: request.schema }),
    prompt: request.prompt,
    maxOutputTokens: request.maxOutputTokens,
    maxRetries: request.maxRetries,
    abortSignal: request.abortSignal
  });
  return {
    output: result.output,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0
    }
  };
}

export class KimiApiAdapter implements KimiStageAdapter {
  private readonly apiKey: string;
  private readonly transport: KimiApiTransport;

  constructor(options: { apiKey: string; transport?: KimiApiTransport }) {
    if (!options.apiKey) throw new ProviderInvocationError("AUTHENTICATION");
    this.apiKey = options.apiKey;
    this.transport = options.transport ?? directKimiTransport;
  }

  async generate(request: KimiStageRequest): Promise<KimiStageResult> {
    if (!request.schema) throw new ProviderInvocationError("INVALID_OUTPUT");
    try {
      return await this.transport({
        baseURL: KIMI_API_BASE_URL,
        model: KIMI_API_MODEL,
        apiKey: this.apiKey,
        stage: request.stage,
        prompt: request.prompt,
        schema: request.schema,
        structuredOutput: true,
        maxOutputTokens: request.maxOutputTokens,
        maxRetries: 0,
        abortSignal: request.signal
      });
    } catch (error) {
      if (error instanceof ProviderInvocationError) throw error;
      if (request.signal.aborted) {
        throw new ProviderInvocationError("ABORTED", { cause: error });
      }
      throw new ProviderInvocationError("UNAVAILABLE", { cause: error });
    }
  }
}
