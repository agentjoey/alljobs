import type { CaptureRecord } from "@/lib/caphub/domain/types";
import { captureIdSchema } from "@/lib/caphub/domain/schemas";
import {
  CaptureServiceError,
  type CaptureService
} from "@/lib/caphub/service/capture";

const SAFE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

export interface CaptureGetRouteDependencies {
  get: CaptureService["get"];
}

function safeError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, {
    status,
    headers: SAFE_HEADERS
  });
}

function publicCapture(capture: CaptureRecord) {
  return {
    schema_version: capture.schema_version,
    id: capture.id,
    source: {
      kind: capture.source.kind,
      original_filename: capture.source.original_filename,
      ...(capture.source.source_url === undefined
        ? {}
        : { source_url: capture.source.source_url })
    },
    note: capture.note,
    mime_type: capture.mime_type,
    object: {
      algorithm: capture.object.algorithm,
      digest: capture.object.digest,
      bytes: capture.object.bytes
    },
    status: capture.status,
    human_review_required: capture.human_review_required,
    created_at: capture.created_at
  };
}

export function createCaptureGetRoute(dependencies: CaptureGetRouteDependencies) {
  return async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> }
  ): Promise<Response> {
    const { id } = await context.params;
    const parsed = captureIdSchema.safeParse(id);
    if (!parsed.success) {
      return safeError(400, "INVALID_CAPTURE_ID", "Capture ID is invalid.");
    }

    try {
      const capture = await dependencies.get(parsed.data);
      if (capture === null) {
        return safeError(404, "CAPTURE_NOT_FOUND", "Capture was not found.");
      }
      return Response.json({ capture: publicCapture(capture) }, {
        status: 200,
        headers: SAFE_HEADERS
      });
    } catch (error) {
      if (error instanceof CaptureServiceError) {
        if (error.code === "INVALID_INPUT") {
          return safeError(400, "INVALID_CAPTURE_ID", "Capture ID is invalid.");
        }
        if (error.code === "STORAGE_UNAVAILABLE") {
          return safeError(503, error.code, "Capture storage is temporarily unavailable.");
        }
        if (error.code === "AUDIT_WRITE_FAILED") {
          return safeError(500, error.code, "Capture receipt could not be read.");
        }
      }
      return safeError(500, "INTERNAL_ERROR", "Capture receipt could not be read.");
    }
  };
}
