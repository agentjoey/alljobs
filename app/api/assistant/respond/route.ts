import { assistantRequestIntentSchema, type AssistantRequestIntent, type AssistantStreamEvent } from "@/lib/assistant/contracts";
import { createAssistantService } from "@/lib/assistant/service";
import { encodeAssistantEvent } from "@/lib/assistant/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

export interface AssistantResponseRouteDependencies {
  respond: (intent: AssistantRequestIntent, signal: AbortSignal) => AsyncIterable<AssistantStreamEvent>;
  maxBodyBytes?: number;
}

function safeError(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

async function readBoundedJson(request: Request, maxBodyBytes: number): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!Number.isSafeInteger(Number(contentLength)) || Number(contentLength) > maxBodyBytes)) {
    throw new RangeError("body too large");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBodyBytes) throw new RangeError("body too large");
  return JSON.parse(body);
}

export function createAssistantResponseRoute(deps: AssistantResponseRouteDependencies) {
  const maxBodyBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  return async function POST(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (request.headers.get("origin") !== requestUrl.origin) return safeError(403, "Assistant request origin is not allowed.");
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return safeError(415, "Assistant request must use JSON.");
    }

    let raw: unknown;
    try {
      raw = await readBoundedJson(request, maxBodyBytes);
    } catch (error) {
      return safeError(error instanceof RangeError ? 413 : 400, error instanceof RangeError ? "Assistant request is too large." : "Assistant request is invalid.");
    }
    const parsed = assistantRequestIntentSchema.safeParse(raw);
    if (!parsed.success) return safeError(400, "Assistant request is invalid.");

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of deps.respond(parsed.data, request.signal)) controller.enqueue(encodeAssistantEvent(event));
        } catch {
          controller.enqueue(encodeAssistantEvent({ type: "assistant_error", code: "PROVIDER_UNAVAILABLE", message: "Management assistant is temporarily unavailable." }));
        } finally {
          controller.close();
        }
      }
    });
    return new Response(body, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  };
}

const service = createAssistantService();
export const POST = createAssistantResponseRoute(service);
