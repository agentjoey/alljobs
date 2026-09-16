import { loadControlHostConfig } from "@/lib/planning/config";
import { ReviewCenter, type ReviewCenterView } from "@/components/caphub/reviews/review-center";
import { createRegistryQueries } from "@/lib/caphub/registry/queries";
import { reviewRequestIdSchema } from "@/lib/caphub/registry/schemas";
import { RegistryRuntimeError, loadControlHostRegistryRuntime } from "@/lib/caphub/registry/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadReviewCenterView(
  searchParams: Promise<Record<string, string | string[] | undefined>>
): Promise<ReviewCenterView> {
  try {
    const resolved = loadControlHostConfig();
    const caphub = resolved.config.caphub;
    if (!caphub?.enabled || !caphub.registry.enabled) return { state: "disabled" };
    const runtime = await loadControlHostRegistryRuntime({ resolved });
    const queries = createRegistryQueries(runtime.pool);
    const queue = await queries.getReviewQueue();
    const params = await searchParams;
    const rawRequest = typeof params.request === "string" ? params.request : null;
    const selected = rawRequest && reviewRequestIdSchema.safeParse(rawRequest).success
      ? rawRequest
      : queue.items[0]?.request.id;
    const detail = selected ? await queries.getReviewDetail(selected) : { kind: "not_found" as const };
    return { state: "ready", queue, detail };
  } catch (error) {
    return error instanceof RegistryRuntimeError && error.code === "REGISTRY_DISABLED"
      ? { state: "disabled" }
      : { state: "unavailable", code: "REGISTRY_UNAVAILABLE" };
  }
}

export default async function ReviewsPage({
  searchParams
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = await loadReviewCenterView(searchParams);
  return <ReviewCenter initialView={view} />;
}
