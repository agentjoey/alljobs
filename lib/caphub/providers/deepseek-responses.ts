import { z } from "zod";
import type { DeepSeekStageAdapter, DeepSeekStageRequest, DeepSeekStageResult } from "./deepseek";
import { ProviderInvocationError } from "./contracts";

export const DEEPSEEK_API_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_RESPONSES_URL = `${DEEPSEEK_API_BASE_URL}/responses`;
export const DEEPSEEK_API_MODEL = "deepseek-flash";

export type DeepSeekFetch = (input: string, init: RequestInit) => Promise<Response>;

const outputTextPartSchema = z.object({
  type: z.literal("output_text"),
  text: z.string()
}).passthrough();

const assistantMessageSchema = z.object({
  type: z.literal("message"),
  role: z.literal("assistant"),
  content: z.array(z.unknown())
}).passthrough();

const responseSchema = z.object({
  status: z.string(),
  output: z.array(z.unknown()).optional(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative()
  }).optional()
}).passthrough();

function failureForHttpStatus(status: number) {
  if (status === 401) return "AUTHENTICATION" as const;
  if (status === 402) return "BILLING" as const;
  if (status === 400 || status === 422) return "INVALID_OUTPUT" as const;
  return "UNAVAILABLE" as const;
}

function terminalJson(value: unknown): DeepSeekStageResult {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success || parsed.data.status !== "completed" || !parsed.data.output || !parsed.data.usage) {
    throw new ProviderInvocationError("INVALID_OUTPUT");
  }
  const messages = parsed.data.output
    .map((item) => assistantMessageSchema.safeParse(item))
    .filter((item): item is z.ZodSafeParseSuccess<z.infer<typeof assistantMessageSchema>> => item.success)
    .map((item) => item.data);
  if (messages.length !== 1) throw new ProviderInvocationError("INVALID_OUTPUT");
  const texts = messages[0].content
    .map((part) => outputTextPartSchema.safeParse(part))
    .filter((part): part is z.ZodSafeParseSuccess<z.infer<typeof outputTextPartSchema>> => part.success)
    .map((part) => part.data.text)
    .filter((text) => text.trim().length > 0);
  if (texts.length !== 1) throw new ProviderInvocationError("INVALID_OUTPUT");
  try {
    return {
      output: JSON.parse(texts[0]),
      usage: {
        inputTokens: parsed.data.usage.input_tokens,
        outputTokens: parsed.data.usage.output_tokens
      }
    };
  } catch (error) {
    throw new ProviderInvocationError("INVALID_OUTPUT", { cause: error });
  }
}

function schemaName(stage: DeepSeekStageRequest["stage"]): string {
  return stage === "extraction" ? "caphub_extraction" : `caphub_${stage}`;
}

async function directDeepSeekFetch(request: DeepSeekStageRequest, apiKey: string, fetch: DeepSeekFetch): Promise<DeepSeekStageResult> {
  if (request.signal.aborted) throw new ProviderInvocationError("ABORTED");
  let response: Response;
  try {
    response = await fetch(DEEPSEEK_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: DEEPSEEK_API_MODEL,
        input: request.prompt,
        stream: false,
        reasoning: { effort: "none" },
        max_output_tokens: request.maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: schemaName(request.stage),
            schema: z.toJSONSchema(request.schema)
          }
        }
      }),
      signal: request.signal
    });
  } catch (error) {
    if (request.signal.aborted) throw new ProviderInvocationError("ABORTED", { cause: error });
    throw new ProviderInvocationError("UNAVAILABLE", { cause: error });
  }
  if (!response.ok) throw new ProviderInvocationError(failureForHttpStatus(response.status));
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ProviderInvocationError("INVALID_OUTPUT", { cause: error });
  }
  return terminalJson(payload);
}

export class DeepSeekResponsesAdapter implements DeepSeekStageAdapter {
  private readonly apiKey: string;
  private readonly fetch: DeepSeekFetch;

  constructor(options: { apiKey: string; fetch?: DeepSeekFetch }) {
    if (!options.apiKey) throw new ProviderInvocationError("AUTHENTICATION");
    this.apiKey = options.apiKey;
    this.fetch = options.fetch ?? fetch;
  }

  generate(request: DeepSeekStageRequest): Promise<DeepSeekStageResult> {
    return directDeepSeekFetch(request, this.apiKey, this.fetch);
  }
}
