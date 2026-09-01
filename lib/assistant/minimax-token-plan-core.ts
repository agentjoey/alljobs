import { createOpenAI } from "@ai-sdk/openai";

export const MINIMAX_TOKEN_PLAN_BASE_URL = "https://api.minimax.io/v1";
export const MINIMAX_TOKEN_PLAN_MODEL = "MiniMax-M3";

export function withMiniMaxM3StreamOptions(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    reasoning_split: true,
    thinking: { type: "disabled" }
  };
}

/**
 * The generic OpenAI provider does not expose MiniMax's M3-specific request
 * fields. Add only the two documented fields to this fixed provider request.
 */
export function createMiniMaxTokenPlanFetch(nextFetch: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const isMiniMaxJsonPost = request.url.startsWith(`${MINIMAX_TOKEN_PLAN_BASE_URL}/`)
      && request.method === "POST"
      && request.headers.get("content-type")?.includes("application/json");
    if (!isMiniMaxJsonPost) return nextFetch(input, init);

    let body: unknown;
    try {
      body = JSON.parse(await request.clone().text());
    } catch {
      return nextFetch(input, init);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return nextFetch(input, init);

    return nextFetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(withMiniMaxM3StreamOptions(body as Record<string, unknown>)),
      signal: request.signal
    });
  };
}

export function requireMiniMaxTokenPlanKey(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const apiKey = env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY must be set in the Control Host environment.");
  }
  return apiKey;
}

/** Creates the fixed official Token Plan OpenAI-compatible MiniMax-M3 model. */
export function createMiniMaxTokenPlanModel(apiKey = requireMiniMaxTokenPlanKey()) {
  const provider = createOpenAI({
    name: "minimax-token-plan",
    baseURL: MINIMAX_TOKEN_PLAN_BASE_URL,
    apiKey,
    fetch: createMiniMaxTokenPlanFetch()
  });

  return provider.chat(MINIMAX_TOKEN_PLAN_MODEL);
}
