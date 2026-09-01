import "server-only";

/**
 * Token Plan exposes MiniMax-M3 through its official OpenAI-compatible endpoint.
 * The key is server-only and is never represented in Control Host JSON.
 */
export { MINIMAX_TOKEN_PLAN_BASE_URL, MINIMAX_TOKEN_PLAN_MODEL, createMiniMaxTokenPlanModel, requireMiniMaxTokenPlanKey } from "./minimax-token-plan-core";
export type { MiniMaxTokenPlanMode } from "./minimax-token-plan-core";
