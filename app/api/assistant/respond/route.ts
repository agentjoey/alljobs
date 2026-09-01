import { createAssistantService } from "@/lib/assistant/service";
import { loadControlHostConfig } from "@/lib/planning/config";
import { createAssistantResponseRoute } from "./route-factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const service = createAssistantService();

function getAssistantConfig() {
  try {
    return loadControlHostConfig().config.assistant;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request): Promise<Response> {
  const assistant = getAssistantConfig();
  if (assistant?.enabled !== true) {
    return Response.json(
      { error: "Management assistant is not configured on this Control Host." },
      { status: 503, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }
    );
  }
  return createAssistantResponseRoute({ ...service, allowedOrigins: assistant.allowedOrigins })(request);
}
