import { randomUUID } from "node:crypto";
import { loadControlHostConfig } from "@/lib/planning/config";
import { createCaptureService } from "@/lib/caphub/service/capture";
import { FilesystemCaptureStore } from "@/lib/caphub/storage/filesystem";
import { LocalCaptureObjectStore } from "@/lib/caphub/storage/local-objects";
import {
  captureReceivedEventId,
  FilesystemCaptureAuditLog
} from "@/lib/caphub/storage/audit-log";
import { createCapturePostRoute } from "./route-factory";

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
    const service = createCaptureService({
      store: new FilesystemCaptureStore(root),
      objects: new LocalCaptureObjectStore(root),
      audit: new FilesystemCaptureAuditLog(root),
      clock: () => new Date(),
      idFactory: () => `cap_${randomUUID().replaceAll("-", "")}`,
      eventIdFactory: captureReceivedEventId,
      maxUploadBytes: config.maxUploadBytes
    });
    return createCapturePostRoute({
      receive: service.receive,
      maxUploadBytes: config.maxUploadBytes,
      allowedOrigins: config.allowedOrigins
    })(request);
  } catch {
    return unavailable();
  }
}
