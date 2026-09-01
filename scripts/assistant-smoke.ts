import { streamText } from "ai";
import { z } from "zod";
import { MINIMAX_TOKEN_PLAN_MODEL, createMiniMaxTokenPlanModel } from "../lib/assistant/minimax-token-plan-core";
import { ASSISTANT_LIMITS } from "../lib/assistant/limits";

const mode = process.argv[2];

if (mode !== "standard" && mode !== "deep") {
  console.error(JSON.stringify({ status: "invalid_invocation", message: "Use -- standard or -- deep." }));
  process.exitCode = 2;
} else {
  void run(mode);
}

async function run(selectedMode: "standard" | "deep") {
  try {
    const result = streamText({
      model: createMiniMaxTokenPlanModel({ mode: selectedMode }),
      instructions: "Return exactly the requested JSON object with no Markdown fences or surrounding text.",
      prompt: 'Synthetic compatibility check. Return exactly {"verified":true}.',
      maxOutputTokens: ASSISTANT_LIMITS[selectedMode].outputTokens,
      maxRetries: 0
    });

    let textChunks = 0;
    let textCharacters = 0;
    let terminalText = "";
    for await (const chunk of result.textStream) {
      textChunks += 1;
      textCharacters += chunk.length;
      terminalText += chunk;
    }
    const [usage, finishReason] = await Promise.all([result.totalUsage, result.finishReason]);
    const terminalObject = z.object({ verified: z.literal(true) }).strict().parse(JSON.parse(terminalText));

    console.log(JSON.stringify({
      status: "passed",
      mode: selectedMode,
      model: MINIMAX_TOKEN_PLAN_MODEL,
      streaming: true,
      structured_output: false,
      terminal_json_valid: terminalObject.verified,
      text_chunks: textChunks,
      text_characters: textCharacters,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      finish_reason: finishReason
    }));
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(JSON.stringify({ status: "failed", mode: selectedMode, error_type: name }));
    process.exitCode = 1;
  }
}
