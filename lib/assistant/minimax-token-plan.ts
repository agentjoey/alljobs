import { createOpenAI } from "@ai-sdk/openai";

export const MINIMAX_TOKEN_PLAN_BASE_URL = "https://api.minimax.io/v1";
export const MINIMAX_TOKEN_PLAN_MODEL = "MiniMax-M3";

/**
 * Token Plan exposes MiniMax-M3 through its official OpenAI-compatible endpoint.
 * The key is server-only and is never represented in Control Host JSON.
 */
export function createMiniMaxTokenPlanModel(apiKey = process.env.MINIMAX_API_KEY) {
  const provider = createOpenAI({
    name: "minimax-token-plan",
    baseURL: MINIMAX_TOKEN_PLAN_BASE_URL,
    apiKey
  });

  return provider.chat(MINIMAX_TOKEN_PLAN_MODEL);
}
