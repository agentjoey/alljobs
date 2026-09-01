import { describe, expect, it } from "vitest";
import {
  MINIMAX_TOKEN_PLAN_BASE_URL,
  MINIMAX_TOKEN_PLAN_MODEL,
  createMiniMaxTokenPlanModel
} from "./minimax-token-plan";

describe("MiniMax Token Plan adapter", () => {
  it("uses the official OpenAI-compatible endpoint and fixed M3 model", () => {
    const model = createMiniMaxTokenPlanModel("test-token");
    expect(MINIMAX_TOKEN_PLAN_BASE_URL).toBe("https://api.minimax.io/v1");
    expect(MINIMAX_TOKEN_PLAN_MODEL).toBe("MiniMax-M3");
    expect(model.provider).toBe("minimax-token-plan.chat");
    expect(model.modelId).toBe("MiniMax-M3");
  });
});
