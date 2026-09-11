"use server";

import { lookup as dnsLookup } from "node:dns/promises";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createMonitoringAdapterRegistry } from "@/lib/monitoring/adapters";
import type { DnsLookup, FetchLike } from "@/lib/monitoring/adapters/contracts";
import { ProviderBackoff } from "@/lib/monitoring/collector/backoff";
import { runCollectionCycle, type CollectionDeps } from "@/lib/monitoring/collector/collect";
import { BINDING_ID_PATTERN, PROJECT_SLUG_PATTERN } from "@/lib/monitoring/store/paths";
import { readCurrentIndex } from "@/lib/monitoring/store/store";
import { loadControlHostConfig } from "@/lib/planning/config";
import { NativePlanningStore } from "@/lib/planning/native/store";
import { errorResult, internalErrorResult, successResult, type ActionResult } from "./action-result";

// Manual monitoring refresh (design §5.2, §12.3; plan Task 7). The action
// accepts only an already registered Project/binding identifier — never
// credentials, provider endpoints, queries, or arbitrary resource IDs — and
// enqueues the same bounded collection path the scheduled worker uses. It
// respects global single-flight, per-provider backoff, and per-binding minimum
// intervals, returns the currently served snapshot identity with the ack, and
// never holds the request open for provider fan-out.

export interface MonitoringRefreshAck {
  refresh: "queued" | "collecting" | "backing_off";
  /** Identity of the snapshot generation the UI keeps serving during collection. */
  serving: { cycle_id: string; collected_at: string } | null;
  retry_after_seconds?: number;
}

const monitoringRefreshInputSchema = z
  .object({
    project: z.string().regex(PROJECT_SLUG_PATTERN),
    binding_id: z.string().regex(BINDING_ID_PATTERN).optional()
  })
  .strict();

// Module-level collection state: the single-flight promise and the persistent
// backoff tracker must survive across action invocations of this process.
let inFlight: Promise<unknown> | null = null;
let sharedBackoff: ProviderBackoff | null = null;

function getSharedBackoff(minIntervalSeconds: number): ProviderBackoff {
  if (!sharedBackoff) {
    sharedBackoff = new ProviderBackoff({ policy: { minIntervalSeconds } });
  }
  return sharedBackoff;
}

const serverFetch: FetchLike = (url, init) => fetch(url, init);
const serverLookup: DnsLookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

const FORBIDDEN = () => errorResult("Monitoring refresh must be a same-origin request", "FORBIDDEN");

export async function requestMonitoringRefresh(input: {
  project: string;
  binding_id?: string;
}): Promise<ActionResult<MonitoringRefreshAck>> {
  const parsed = monitoringRefreshInputSchema.safeParse(input);
  if (!parsed.success) {
    return errorResult("Invalid monitoring refresh request", "INVALID_INPUT");
  }

  // Same-origin enforcement. The framework already compares Origin against
  // Host for Server Action POSTs; this application-level check keeps the
  // boundary explicit and testable.
  const headerList = await headers();
  const origin = headerList.get("origin");
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!origin || !host) return FORBIDDEN();
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return FORBIDDEN();
  }
  if (originHost !== host) return FORBIDDEN();

  let paths;
  try {
    paths = loadControlHostConfig();
  } catch (err) {
    return internalErrorResult(err, "CONFIG_ERROR");
  }
  const monitoring = paths.config.monitoring;
  if (!monitoring || monitoring.enabled !== true || !paths.monitoringStateDir) {
    return errorResult("Monitoring is disabled on this Control Host", "MONITORING_DISABLED");
  }

  let project;
  try {
    project = await new NativePlanningStore().getProject(parsed.data.project);
  } catch (err) {
    return internalErrorResult(err, "REGISTRY_ERROR");
  }
  if (!project || project.archived) {
    return errorResult(`Project "${parsed.data.project}" is not monitored`, "NOT_FOUND");
  }
  const bindings = project.monitoring?.bindings ?? [];
  if (bindings.length === 0) {
    return errorResult(`Project "${parsed.data.project}" declares no monitoring bindings`, "NO_BINDINGS");
  }
  const selected = parsed.data.binding_id
    ? bindings.filter((binding) => binding.id === parsed.data.binding_id)
    : bindings;
  if (parsed.data.binding_id && selected.length === 0) {
    return errorResult(
      `Binding "${parsed.data.binding_id}" is not registered on Project "${parsed.data.project}"`,
      "UNKNOWN_BINDING"
    );
  }

  // The ack always carries the currently served snapshot identity; the
  // previous atomic projection stays visible throughout collection.
  const index = readCurrentIndex(paths.monitoringStateDir);
  const serving = index.ok
    ? { cycle_id: index.value.cycle_id, collected_at: index.value.collected_at }
    : null;

  // Global single-flight: a running cycle answers "collecting" instead of
  // fanning out again.
  if (inFlight) {
    return successResult({ refresh: "collecting", serving }, "A monitoring collection is already running");
  }

  // Per-provider backoff and per-binding minimum interval: manual refresh can
  // never bypass them. Only when every selected binding is blocked does the
  // whole request report backing_off; otherwise the cycle runs and skips the
  // blocked bindings itself.
  const backoff = getSharedBackoff(monitoring.refreshIntervalSeconds);
  const targets = selected.map((binding) => ({ project: project.slug, binding }));
  const denials = targets
    .map((target) => backoff.check(target.binding.provider, `${target.project}/${target.binding.id}`))
    .filter((check) => !check.allowed);
  if (denials.length === targets.length) {
    return successResult(
      {
        refresh: "backing_off",
        serving,
        retry_after_seconds: Math.min(...denials.map((check) => check.retryAfterSeconds))
      },
      "Monitoring refresh is backing off; the cached projection keeps being served"
    );
  }

  try {
    const deps: CollectionDeps = {
      root: paths.monitoringStateDir,
      targets,
      // Fixed server-side adapter resolution; no browser-selected provider.
      adapters: createMonitoringAdapterRegistry(),
      monitoring: {
        concurrency: monitoring.concurrency,
        refreshIntervalSeconds: monitoring.refreshIntervalSeconds,
        credentials: monitoring.credentials,
        probeAllowedHosts: monitoring.probeAllowedHosts
      },
      env: process.env,
      fetch: serverFetch,
      lookup: serverLookup,
      now: () => new Date().toISOString(),
      backoff
    };
    // Fire-and-forget with server-side error logging: the request never waits
    // on the provider fan-out. Attempt accounting stays inside the cycle —
    // collect.ts records each attempt only after the backoff check passes, so
    // queueing here must not spend the minimum interval itself.
    inFlight = runCollectionCycle(deps)
      .catch((error: unknown) => {
        console.error("[alljobs action] MONITORING_CYCLE_ERROR:", error);
      })
      .finally(() => {
        inFlight = null;
      });
  } catch (err) {
    return internalErrorResult(err, "MONITORING_REFRESH_ERROR");
  }

  revalidatePath("/monitoring");
  revalidatePath(`/monitoring/${project.slug}`);
  return successResult({ refresh: "queued", serving }, `Monitoring refresh queued for "${project.slug}"`);
}
