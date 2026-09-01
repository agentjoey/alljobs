import { describe, expect, it, vi } from "vitest";
import { MINIMAX_TOKEN_PLAN_BASE_URL, MINIMAX_TOKEN_PLAN_MODEL, createMiniMaxTokenPlanFetch, withMiniMaxM3StreamOptions } from "./minimax-token-plan-core";

describe("MiniMax Token Plan request options", () => {
  it("uses the official M3 controls to keep streamed answer content separate from thinking", () => {
    expect(withMiniMaxM3StreamOptions({ model: MINIMAX_TOKEN_PLAN_MODEL, messages: [] })).toEqual({
      model: MINIMAX_TOKEN_PLAN_MODEL,
      messages: [],
      reasoning_split: true,
      thinking: { type: "disabled" }
    });
  });

  it("keeps adaptive thinking for a Deep request", () => {
    expect(withMiniMaxM3StreamOptions({ model: MINIMAX_TOKEN_PLAN_MODEL, messages: [] }, "deep")).toMatchObject({
      reasoning_split: true,
      thinking: { type: "adaptive" }
    });
  });

  it("injects M3-only controls only into the fixed MiniMax JSON request", async () => {
    const nextFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const wrapped = createMiniMaxTokenPlanFetch(nextFetch as typeof fetch, "deep");

    await wrapped(`${MINIMAX_TOKEN_PLAN_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MINIMAX_TOKEN_PLAN_MODEL, messages: [] })
    });

    const sent = JSON.parse((nextFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(sent).toMatchObject({ reasoning_split: true, thinking: { type: "adaptive" } });
  });
});
