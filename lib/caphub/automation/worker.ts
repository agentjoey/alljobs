import type { ProductionAnalysisWorkflow } from "../service/production-workflow";
import type { AnalysisRequests } from "../registry/postgres/analysis-requests";

interface WorkerDependencies {
  requests: Pick<AnalysisRequests,"claim" | "heartbeat" | "finish">;
  workflow: ProductionAnalysisWorkflow;
  clock(): Date;
  ownerToken(): string;
}
export async function runAnalysisTick(deps: WorkerDependencies, signal: AbortSignal): Promise<"idle" | "processed"> {
  if (signal.aborted) return "idle";
  const lease = await deps.requests.claim(deps.ownerToken(), deps.clock());
  if (!lease) return "idle";
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  let renewal: Promise<void> | undefined;
  const heartbeat = setInterval(() => {
    if (renewal) return;
    renewal = deps.requests.heartbeat(lease, deps.clock()).then(owned => {
      if (!owned) controller.abort();
    }).catch(() => controller.abort()).finally(() => { renewal = undefined; });
  }, 30000);
  try {
    if (controller.signal.aborted) return "processed";
    const result = await deps.workflow.startAndImport(lease.captureId, controller.signal);
    if (controller.signal.aborted) return "processed";
    await deps.requests.finish(lease, {
      state: result.reviewRequestId ? (result.analysisStatus === "WAITING_FOR_REVIEW" ? "waiting_for_review" : "completed") : "needs_attention",
      jobId: result.jobId, reviewRequestId: result.reviewRequestId ?? undefined,
      ...(result.reviewRequestId ? {} : { errorCode: "ANALYSIS_STOPPED" })
    }, deps.clock());
    return "processed";
  } finally {
    clearInterval(heartbeat);
    signal.removeEventListener("abort", abort);
    await renewal;
    // Exceptions retain the lease: existing workflow audit/import recovery is used after expiry.
  }
}
