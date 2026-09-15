import type { CaptureRecord } from "@/lib/caphub/domain/types";
import {
  CaptureServiceError,
  type CaptureService
} from "@/lib/caphub/service/capture";

const SAFE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
const ALLOWED_FIELDS = new Set(["image", "idempotency_key", "note", "source_url"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_MULTIPART_OVERHEAD_BYTES = 32 * 1024;

export interface CapturePostRouteDependencies {
  receive: CaptureService["receive"];
  maxUploadBytes: number;
  allowedOrigins?: readonly string[];
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
    source: capture.source,
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

function serviceFailure(error: CaptureServiceError): Response {
  switch (error.code) {
    case "INVALID_INPUT":
      return safeError(400, error.code, "Capture input is invalid.");
    case "UNSUPPORTED_MEDIA_TYPE":
      return safeError(415, error.code, "Capture image type is unsupported.");
    case "PAYLOAD_TOO_LARGE":
      return safeError(413, error.code, "Capture image exceeds the configured limit.");
    case "IDEMPOTENCY_CONFLICT":
      return safeError(409, error.code, "This idempotency key belongs to different Capture content.");
    case "STORAGE_UNAVAILABLE":
      return safeError(503, error.code, "Capture storage is temporarily unavailable.");
    case "AUDIT_WRITE_FAILED":
      return safeError(500, error.code, "Capture receipt could not be completed.");
  }
}

function singleString(formData: FormData, field: string, required: boolean): string | undefined {
  const values = formData.getAll(field);
  if (values.length === 0 && !required) return undefined;
  if (values.length !== 1 || typeof values[0] !== "string") return undefined;
  if (required && values[0].length === 0) return undefined;
  return values[0];
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object"
    && value !== null
    && Object.prototype.toString.call(value) === "[object File]"
    && typeof value.name === "string"
    && typeof value.type === "string"
    && typeof value.size === "number"
    && typeof value.arrayBuffer === "function";
}

export function createCapturePostRoute(dependencies: CapturePostRouteDependencies) {
  if (!Number.isSafeInteger(dependencies.maxUploadBytes) || dependencies.maxUploadBytes <= 0) {
    throw new TypeError("maxUploadBytes must be a positive safe integer");
  }
  const allowedOrigins = new Set(dependencies.allowedOrigins ?? []);

  return async function POST(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    if (origin === null || !allowedOrigins.has(origin)) {
      return safeError(403, "ORIGIN_NOT_ALLOWED", "Capture request origin is not allowed.");
    }

    const contentType = request.headers.get("content-type")?.trim() ?? "";
    if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) {
      return safeError(415, "UNSUPPORTED_MEDIA_TYPE", "Capture request must use multipart form data.");
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength === null) {
      return safeError(411, "CONTENT_LENGTH_REQUIRED", "Capture request must include Content-Length.");
    }
    if (!/^\d+$/.test(contentLength)) {
      return safeError(400, "INVALID_REQUEST", "Capture request is invalid.");
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes)) {
      return safeError(400, "INVALID_REQUEST", "Capture request is invalid.");
    }
    if (declaredBytes > dependencies.maxUploadBytes + MAX_MULTIPART_OVERHEAD_BYTES) {
      return safeError(413, "PAYLOAD_TOO_LARGE", "Capture request exceeds the configured limit.");
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return safeError(400, "INVALID_REQUEST", "Capture request is invalid.");
    }
    for (const field of formData.keys()) {
      if (!ALLOWED_FIELDS.has(field)) {
        return safeError(400, "INVALID_REQUEST", "Capture request contains invalid fields.");
      }
    }

    const images = formData.getAll("image");
    const idempotencyKey = singleString(formData, "idempotency_key", true);
    const note = singleString(formData, "note", false);
    const sourceUrlValue = singleString(formData, "source_url", false);
    const optionalFields = [formData.getAll("note"), formData.getAll("source_url")];
    const optionalFieldsValid = optionalFields.every(
      (values) => values.length <= 1 && values.every((value) => typeof value === "string")
    );
    if (
      images.length !== 1
      || !isFile(images[0])
      || idempotencyKey === undefined
      || !optionalFieldsValid
    ) {
      return safeError(400, "INVALID_REQUEST", "Capture request fields are invalid.");
    }

    const image = images[0];
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      return safeError(415, "UNSUPPORTED_MEDIA_TYPE", "Capture image must be PNG, JPEG, or WebP.");
    }
    if (image.size > dependencies.maxUploadBytes) {
      return safeError(413, "PAYLOAD_TOO_LARGE", "Capture image exceeds the configured limit.");
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await image.arrayBuffer());
    } catch {
      return safeError(400, "INVALID_REQUEST", "Capture image could not be read.");
    }

    try {
      const result = await dependencies.receive({
        idempotencyKey,
        filename: image.name,
        mimeType: image.type,
        bytes,
        ...(note === undefined ? {} : { note }),
        ...(sourceUrlValue === undefined || sourceUrlValue.length === 0
          ? {}
          : { sourceUrl: sourceUrlValue })
      });
      return Response.json({ kind: result.kind, capture: publicCapture(result.capture) }, {
        status: result.kind === "created" ? 201 : 200,
        headers: SAFE_HEADERS
      });
    } catch (error) {
      if (error instanceof CaptureServiceError) return serviceFailure(error);
      return safeError(500, "INTERNAL_ERROR", "Capture request could not be completed.");
    }
  };
}
