import { createAssistantService } from "@/lib/assistant/service";
import { loadControlHostConfig } from "@/lib/planning/config";
import { createAssistantResponseRoute } from "./route-factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const service = createAssistantService();
const respond = createAssistantResponseRoute(service);

function assistantIsEnabled(): boolean {
  try {
    return loadControlHostConfig().config.assistant?.enabled === true;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!assistantIsEnabled()) {
    return Response.json(
      { error: "Management assistant is not configured on this Control Host." },
      { status: 503, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }
    );
  }
  return respond(request);
}
