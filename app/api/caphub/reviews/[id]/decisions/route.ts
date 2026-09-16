import { loadControlHostConfig } from "@/lib/planning/config";
import { RegistryRuntimeError, loadControlHostRegistryRuntime } from "@/lib/caphub/registry/runtime";
import { createReviewDecisionService } from "@/lib/caphub/registry/review-service";
import { createReviewDecisionPostRoute } from "./route-factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

function unavailable(code: "REGISTRY_DISABLED" | "REGISTRY_UNAVAILABLE"): Response {
  return Response.json({ error: { code, message: code === "REGISTRY_DISABLED"
    ? "Caphub Registry is disabled."
    : "Caphub Registry is temporarily unavailable." } }, {
    status: 503,
    headers: SAFE_HEADERS
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  let resolved: ReturnType<typeof loadControlHostConfig>;
  try {
    resolved = loadControlHostConfig();
  } catch {
    return unavailable("REGISTRY_DISABLED");
  }
  const caphub = resolved.config.caphub;
  if (!caphub?.enabled || !caphub.registry.enabled) return unavailable("REGISTRY_DISABLED");
  try {
    const registry = await loadControlHostRegistryRuntime({ resolved });
    const service = createReviewDecisionService({
      pool: registry.pool,
      reviews: registry.reviews,
      jobs: registry.jobs,
      clock: () => new Date().toISOString()
    });
    return createReviewDecisionPostRoute({
      decide: service.decide,
      allowedOrigins: caphub.allowedOrigins
    })(request, context);
  } catch (error) {
    return unavailable(error instanceof RegistryRuntimeError ? error.code : "REGISTRY_UNAVAILABLE");
  }
}
