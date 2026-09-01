import { describe, expect, it } from "vitest";
import { MINIMAX_TOKEN_PLAN_MODEL, withMiniMaxM3StreamOptions } from "./minimax-token-plan-core";

describe("MiniMax Token Plan request options", () => {
  it("uses the official M3 controls to keep streamed answer content separate from thinking", () => {
    expect(withMiniMaxM3StreamOptions({ model: MINIMAX_TOKEN_PLAN_MODEL, messages: [] })).toEqual({
      model: MINIMAX_TOKEN_PLAN_MODEL,
      messages: [],
      reasoning_split: true,
      thinking: { type: "disabled" }
    });
  });
});
