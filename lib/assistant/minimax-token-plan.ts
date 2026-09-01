import "server-only";

import { createOpenAI } from "@ai-sdk/openai";

export const MINIMAX_TOKEN_PLAN_BASE_URL = "https://api.minimax.io/v1";
export const MINIMAX_TOKEN_PLAN_MODEL = "MiniMax-M3";

export function requireMiniMaxTokenPlanKey(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const apiKey = env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY must be set in the Control Host environment.");
  }
  return apiKey;
}

/**
 * Token Plan exposes MiniMax-M3 through its official OpenAI-compatible endpoint.
 * The key is server-only and is never represented in Control Host JSON.
 */
export function createMiniMaxTokenPlanModel(apiKey = requireMiniMaxTokenPlanKey()) {
  const provider = createOpenAI({
    name: "minimax-token-plan",
    baseURL: MINIMAX_TOKEN_PLAN_BASE_URL,
    apiKey
  });

  return provider.chat(MINIMAX_TOKEN_PLAN_MODEL);
}
