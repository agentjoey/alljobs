import { randomUUID } from "node:crypto";
import { loadControlHostConfig } from "@/lib/planning/config";
import { createCaptureService } from "@/lib/caphub/service/capture";
import { FilesystemCaptureStore } from "@/lib/caphub/storage/filesystem";
import { LocalCaptureObjectStore } from "@/lib/caphub/storage/local-objects";
import {
  captureReceivedEventId,
  FilesystemCaptureAuditLog
} from "@/lib/caphub/storage/audit-log";
import { loadControlHostRegistryRuntime } from "@/lib/caphub/registry/runtime";
import { createCapturePostRoute } from "./route-factory";
import { createAutomatedIntake } from "@/lib/caphub/automation/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

function disabled(): Response {
  return Response.json({
    error: {
      code: "CAPHUB_DISABLED",
      message: "Caphub capture is not configured on this Control Host."
    }
  }, { status: 503, headers: SAFE_HEADERS });
}

function unavailable(): Response {
  return Response.json({
    error: {
      code: "STORAGE_UNAVAILABLE",
      message: "Capture storage is temporarily unavailable."
    }
  }, { status: 503, headers: SAFE_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  let resolved: ReturnType<typeof loadControlHostConfig>;
  try {
    resolved = loadControlHostConfig();
  } catch (error) {
    return error instanceof Error && /Control Host state directories/.test(error.message)
      ? unavailable()
      : disabled();
  }
  const config = resolved.config.caphub;
  if (config?.enabled !== true || resolved.caphubStateDir === undefined) return disabled();

  try {
    const root = resolved.caphubStateDir;
    const registry = config.registry.enabled
      ? await loadControlHostRegistryRuntime({ resolved })
      : null;
    const service = createCaptureService({
      store: registry?.captures ?? new FilesystemCaptureStore(root),
      objects: registry?.objects ?? new LocalCaptureObjectStore(root),
      audit: registry?.captureAudit ?? new FilesystemCaptureAuditLog(root),
      clock: () => new Date(),
      idFactory: () => `cap_${randomUUID().replaceAll("-", "")}`,
      eventIdFactory: captureReceivedEventId,
      maxUploadBytes: config.maxUploadBytes
    });
    return createCapturePostRoute({
      receive: registry ? createAutomatedIntake({ pool: registry.pool, objects: registry.objects,
        clock: () => new Date(), idFactory: () => `cap_${randomUUID().replaceAll("-", "")}`,
        maxUploadBytes: config.maxUploadBytes }) : service.receive,
      maxUploadBytes: config.maxUploadBytes,
      allowedOrigins: config.allowedOrigins
    })(request);
  } catch {
    return unavailable();
  }
}
