import { createAssistantService } from "@/lib/assistant/service";
import { createAssistantResponseRoute } from "./route-factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const service = createAssistantService();
export const POST = createAssistantResponseRoute(service);
