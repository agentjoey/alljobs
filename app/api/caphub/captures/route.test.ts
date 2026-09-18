// @vitest-environment node

import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptureRecord } from "@/lib/caphub/domain/types";
import {
  CaptureServiceError,
  type CaptureService,
  type ReceiveCaptureResult
} from "@/lib/caphub/service/capture";
import { captureReceivedEventId } from "@/lib/caphub/storage/audit-log";
import { createCapturePostRoute } from "./route-factory";
import { FilenameConflictError } from "@/lib/caphub/automation/intake";

const CAPTURE_ID = `cap_${"1".repeat(32)}`;
const IDEMPOTENCY_KEY = "capture.request-20260916:route-a";
const CREATED_AT = "2026-09-16T02:03:04.000Z";
const IMAGE_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const DIGEST = createHash("sha256").update(IMAGE_BYTES).digest("hex");
const ALLOWED_ORIGIN = "https://alljobs.agentjoey.ai";
const ROUTE_URL = "http://127.0.0.1:3456/api/caphub/captures";
const previousHome = process.env.ALLJOBS_HOME;

it("returns a safe filename conflict and passes an explicit confirmation to intake", async () => {
  const receive = vi.fn().mockRejectedValueOnce(new FilenameConflictError("FILENAME_CONFLICT", captureRecord()))
    .mockResolvedValueOnce({ kind: "created", capture: captureRecord() });
  const route = createCapturePostRoute({ receive, maxUploadBytes: 1000, allowedOrigins: [ALLOWED_ORIGIN] });
  const conflict = await route(request(form()));
  expect(conflict.status).toBe(409);
  const body = await conflict.json();
  expect(body.error.existing).toEqual({ id: CAPTURE_ID, filename: "browser-capture.png", digest: DIGEST, createdAt: CREATED_AT });
  expect(JSON.stringify(body)).not.toContain("sha256/");
  const confirmed = form();
  confirmed.set("expected_current_capture_id", CAPTURE_ID);
  confirmed.set("expected_current_object_digest", DIGEST);
  expect((await route(request(confirmed))).status).toBe(201);
  expect(receive.mock.calls[1][0]).toMatchObject({ expectedCurrentCaptureId: CAPTURE_ID, expectedCurrentObjectDigest: DIGEST });
});

function captureRecord(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    schema_version: 1,
    id: CAPTURE_ID,
    source: {
      kind: "web",
      original_filename: "browser-capture.png",
      source_url: "https://example.com/source"
    },
    note: "Review the visible workflow",
    mime_type: "image/png",
    object: {
      algorithm: "sha256",
      digest: DIGEST,
      key: `sha256/${DIGEST.slice(0, 2)}/${DIGEST}`,
      bytes: IMAGE_BYTES.byteLength
    },
    idempotency_key: IDEMPOTENCY_KEY,
    status: "received",
    human_review_required: true,
    created_at: CREATED_AT,
    ...overrides
  };
}

function form(overrides: {
  image?: File | string | null;
  idempotencyKey?: string | null;
  note?: string | null;
  sourceUrl?: string | null;
} = {}): FormData {
  const data = new FormData();
  const image = overrides.image === undefined
    ? new File([IMAGE_BYTES], "browser-capture.png", { type: "image/png" })
    : overrides.image;
  const key = overrides.idempotencyKey === undefined ? IDEMPOTENCY_KEY : overrides.idempotencyKey;
  const note = overrides.note === undefined ? "Review the visible workflow" : overrides.note;
  const sourceUrl = overrides.sourceUrl === undefined ? "https://example.com/source" : overrides.sourceUrl;
  if (image !== null) data.append("image", image);
  if (key !== null) data.append("idempotency_key", key);
  if (note !== null) data.append("note", note);
  if (sourceUrl !== null) data.append("source_url", sourceUrl);
  return data;
}

function request(
  data: FormData,
  options: { origin?: string | null; contentLength?: string | null; contentType?: string } = {}
): Request {
  const headers = new Headers();
  if (options.origin !== null) headers.set("origin", options.origin ?? ALLOWED_ORIGIN);
  if (options.contentLength !== null) headers.set("content-length", options.contentLength ?? "1024");
  if (options.contentType) headers.set("content-type", options.contentType);
  return new Request(ROUTE_URL, { method: "POST", headers, body: data });
}

async function requestWithActualLength(data: FormData): Promise<Request> {
  const encoded = new Request(ROUTE_URL, { method: "POST", body: data });
  const body = await encoded.arrayBuffer();
  return new Request(ROUTE_URL, {
    method: "POST",
    headers: {
      origin: ALLOWED_ORIGIN,
      "content-type": encoded.headers.get("content-type") ?? "",
      "content-length": String(body.byteLength)
    },
    body
  });
}

function setup(result: ReceiveCaptureResult = { kind: "created", capture: captureRecord() }) {
  const receive = vi.fn<CaptureService["receive"]>().mockResolvedValue(result);
  return {
    receive,
    POST: createCapturePostRoute({
      receive,
      maxUploadBytes: 1024,
      allowedOrigins: [ALLOWED_ORIGIN]
    })
  };
}

async function expectSafeError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await response.clone().json()).toMatchObject({ error: { code } });
}

afterEach(() => {
  if (previousHome === undefined) delete process.env.ALLJOBS_HOME;
  else process.env.ALLJOBS_HOME = previousHome;
  vi.restoreAllMocks();
});

describe("POST /api/caphub/captures", () => {
  it("returns 503 at the real production route while Caphub is disabled", async () => {
    const home = await mkdtemp(join(realpathSync(tmpdir()), "alljobs-caphub-disabled-route-"));
    try {
      await writeFile(join(home, "config.json"), JSON.stringify({
        trustedCodeRoots: [home],
        caphub: { enabled: false, allowedOrigins: [ALLOWED_ORIGIN], maxUploadBytes: 1_048_576 }
      }));
      process.env.ALLJOBS_HOME = home;
      const route = await import("./route");

      expect(route.runtime).toBe("nodejs");
      expect(route.dynamic).toBe("force-dynamic");
      await expectSafeError(await route.POST(request(form())), 503, "CAPHUB_DISABLED");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("reports enabled-but-unavailable local storage without exposing its server path", async () => {
    const parent = await mkdtemp(join(realpathSync(tmpdir()), "alljobs-caphub-bad-root-"));
    const target = join(parent, "target");
    const alias = join(parent, "alias");
    try {
      await mkdir(target);
      await symlink(target, alias);
      await writeFile(join(target, "config.json"), JSON.stringify({
        trustedCodeRoots: [target],
        caphub: { enabled: true, allowedOrigins: [ALLOWED_ORIGIN], maxUploadBytes: 1_048_576 }
      }));
      process.env.ALLJOBS_HOME = alias;
      const { POST } = await import("./route");
      const response = await POST(request(form()));
      const text = await response.clone().text();

      await expectSafeError(response, 503, "STORAGE_UNAVAILABLE");
      expect(text).not.toContain(parent);
      expect(text).not.toContain(target);
      expect(text).not.toContain(alias);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it.each([
    ["missing", null],
    ["foreign", "https://foreign.example"]
  ])("rejects a %s Origin before capture work", async (_label, origin) => {
    const { POST, receive } = setup();
    const incoming = request(form(), { origin });
    const parser = vi.spyOn(incoming, "formData");
    const response = await POST(incoming);

    await expectSafeError(response, 403, "ORIGIN_NOT_ALLOWED");
    expect(parser).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
    expect(await response.clone().text()).not.toContain(origin ?? "undefined");
  });

  it("rejects non-multipart media before capture work", async () => {
    const { POST, receive } = setup();
    const response = await POST(request(form(), { contentType: "application/json" }));

    await expectSafeError(response, 415, "UNSUPPORTED_MEDIA_TYPE");
    expect(receive).not.toHaveBeenCalled();
  });

  it("requires Content-Length before parsing FormData", async () => {
    const { POST, receive } = setup();
    const incoming = request(form(), { contentLength: null });
    const parser = vi.spyOn(incoming, "formData");

    await expectSafeError(await POST(incoming), 411, "CONTENT_LENGTH_REQUIRED");
    expect(parser).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before parsing FormData", async () => {
    const { POST, receive } = setup();
    const incoming = request(form(), { contentLength: "33793" });
    const parser = vi.spyOn(incoming, "formData");

    await expectSafeError(await POST(incoming), 413, "PAYLOAD_TOO_LARGE");
    expect(parser).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
  });

  it("returns 413 for a digit-only Content-Length beyond Number.MAX_SAFE_INTEGER", async () => {
    const { POST, receive } = setup();
    const incoming = request(form(), { contentLength: "9007199254740992" });
    const parser = vi.spyOn(incoming, "formData");

    await expectSafeError(await POST(incoming), 413, "PAYLOAD_TOO_LARGE");
    expect(parser).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
  });

  it.each(["01", "1e3", "-1"])(
    "returns 400 for malformed or noncanonical Content-Length %s",
    async (contentLength) => {
      const { POST, receive } = setup();
      const incoming = request(form(), { contentLength });
      const parser = vi.spyOn(incoming, "formData");

      await expectSafeError(await POST(incoming), 400, "INVALID_REQUEST");
      expect(parser).not.toHaveBeenCalled();
      expect(receive).not.toHaveBeenCalled();
    }
  );

  it("accepts a file at the configured limit inside a larger bounded multipart envelope", async () => {
    const { POST, receive } = setup();
    const image = new File([new Uint8Array(1024)], "limit.png", { type: "image/png" });
    const incoming = await requestWithActualLength(form({ image, note: null, sourceUrl: null }));

    const response = await POST(incoming);

    expect(response.status).toBe(201);
    expect(Number(incoming.headers.get("content-length"))).toBeGreaterThan(1024);
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({
      filename: "limit.png",
      bytes: expect.any(Uint8Array)
    }));
    expect(receive.mock.calls[0][0].bytes.byteLength).toBe(1024);
  });

  it("allows the fixed valid text and filename ranges inside the bounded envelope", async () => {
    const { POST, receive } = setup();
    const idempotencyKey = "k".repeat(128);
    const note = "界".repeat(4000);
    const sourceUrl = `https://example.com/${"界".repeat(2028)}`;
    const image = new File([new Uint8Array(1024)], `${"界".repeat(251)}.png`, {
      type: "image/png"
    });
    const incoming = await requestWithActualLength(form({
      image,
      idempotencyKey,
      note,
      sourceUrl
    }));

    const response = await POST(incoming);

    expect(idempotencyKey).toHaveLength(128);
    expect(sourceUrl).toHaveLength(2048);
    expect(response.status).toBe(201);
    expect(Number(incoming.headers.get("content-length"))).toBeGreaterThan(17_408);
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey,
      note,
      sourceUrl
    }));
  });

  it.each([
    ["missing image", () => form({ image: null })],
    ["string image", () => form({ image: "not-a-file" })],
    ["missing key", () => form({ idempotencyKey: null })],
    ["duplicate image", () => {
      const data = form();
      data.append("image", new File([IMAGE_BYTES], "second.png", { type: "image/png" }));
      return data;
    }],
    ["duplicate key", () => {
      const data = form();
      data.append("idempotency_key", "capture.request-20260916:route-b");
      return data;
    }],
    ["duplicate optional field", () => {
      const data = form();
      data.append("note", "second note");
      return data;
    }],
    ["file-valued optional field", () => {
      const data = form({ note: null });
      data.append("note", new File([IMAGE_BYTES], "not-a-note.png", { type: "image/png" }));
      return data;
    }],
    ["duplicate source URL", () => {
      const data = form();
      data.append("source_url", "https://example.com/second");
      return data;
    }],
    ["unknown field", () => {
      const data = form();
      data.append("root", "/Users/secret/caphub");
      return data;
    }]
  ])("rejects %s at the real FormData boundary", async (_label, makeForm) => {
    const { POST, receive } = setup();
    const response = await POST(request(makeForm()));

    await expectSafeError(response, 400, "INVALID_REQUEST");
    expect(receive).not.toHaveBeenCalled();
    expect(await response.clone().text()).not.toContain("/Users/secret/caphub");
  });

  it("rejects an unsupported File MIME before reading bytes", async () => {
    const { POST, receive } = setup();
    const data = form({
      image: new File([IMAGE_BYTES], "browser-capture.gif", { type: "image/gif" })
    });
    const arrayBuffer = vi.spyOn(File.prototype, "arrayBuffer");
    const response = await POST(request(data));

    await expectSafeError(response, 415, "UNSUPPORTED_MEDIA_TYPE");
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
  });

  it("checks File.size before arrayBuffer", async () => {
    const { POST, receive } = setup();
    const image = new File([new Uint8Array(1025)], "large.png", { type: "image/png" });
    const data = form({ image });
    const arrayBuffer = vi.spyOn(image, "arrayBuffer");
    const incoming = request(data);
    vi.spyOn(incoming, "formData").mockResolvedValue(data);

    await expectSafeError(await POST(incoming), 413, "PAYLOAD_TOO_LARGE");
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
  });

  it.each([
    ["created", 201],
    ["duplicate", 200]
  ] as const)("returns a safe metadata-only %s receipt", async (kind, status) => {
    const capture = captureRecord();
    Object.assign(capture.source, {
      internal_path: "/Users/operator/.alljobs/state/caphub/private",
      secret: "SOURCE_SECRET"
    });
    const { POST, receive } = setup({ kind, capture });
    const response = await POST(request(form()));
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toEqual({
      kind,
      capture: {
        schema_version: 1,
        id: CAPTURE_ID,
        source: {
          kind: "web",
          original_filename: "browser-capture.png",
          source_url: "https://example.com/source"
        },
        note: capture.note,
        mime_type: "image/png",
        object: { algorithm: "sha256", digest: DIGEST, bytes: IMAGE_BYTES.byteLength },
        status: "received",
        human_review_required: true,
        created_at: CREATED_AT
      }
    });
    expect(JSON.stringify(body)).not.toContain(capture.object.key);
    expect(JSON.stringify(body)).not.toContain(IDEMPOTENCY_KEY);
    expect(JSON.stringify(body)).not.toContain("internal_path");
    expect(JSON.stringify(body)).not.toContain("SOURCE_SECRET");
    expect(receive).toHaveBeenCalledWith({
      idempotencyKey: IDEMPOTENCY_KEY,
      filename: "browser-capture.png",
      mimeType: "image/png",
      bytes: expect.any(Uint8Array),
      note: "Review the visible workflow",
      sourceUrl: "https://example.com/source"
    });
    expect(Array.from(receive.mock.calls[0][0].bytes)).toEqual(Array.from(IMAGE_BYTES));
  });

  it("maps idempotency conflict to 409 without leaking the service message", async () => {
    const secret = "TOP_SECRET_CAPTURE_TOKEN";
    const unsafePath = "/Users/operator/.alljobs/state/caphub";
    const receive = vi.fn<CaptureService["receive"]>().mockRejectedValue(
      new CaptureServiceError("IDEMPOTENCY_CONFLICT", `${secret} at ${unsafePath}`)
    );
    const response = await createCapturePostRoute({
      receive,
      maxUploadBytes: 1024,
      allowedOrigins: [ALLOWED_ORIGIN]
    })(request(form()));
    const text = await response.clone().text();

    await expectSafeError(response, 409, "IDEMPOTENCY_CONFLICT");
    expect(text).not.toContain(secret);
    expect(text).not.toContain(unsafePath);
  });

  it.each([
    ["INVALID_INPUT", 400],
    ["UNSUPPORTED_MEDIA_TYPE", 415],
    ["PAYLOAD_TOO_LARGE", 413],
    ["STORAGE_UNAVAILABLE", 503],
    ["AUDIT_WRITE_FAILED", 500]
  ] as const)("maps stable service error %s to a safe response", async (code, status) => {
    const unsafe = `sensitive-${code} /Users/operator/private`;
    const receive = vi.fn<CaptureService["receive"]>().mockRejectedValue(
      new CaptureServiceError(code, unsafe)
    );
    const response = await createCapturePostRoute({
      receive,
      maxUploadBytes: 1024,
      allowedOrigins: [ALLOWED_ORIGIN]
    })(request(form()));
    const text = await response.clone().text();

    await expectSafeError(response, status, code);
    expect(text).not.toContain(unsafe);
    expect(text).not.toContain("/Users/operator/private");
  });

  it("collapses an unexpected failure to a generic 500 response", async () => {
    const receive = vi.fn<CaptureService["receive"]>().mockRejectedValue(
      new Error("TOP_SECRET at /Users/operator/private")
    );
    const response = await createCapturePostRoute({
      receive,
      maxUploadBytes: 1024,
      allowedOrigins: [ALLOWED_ORIGIN]
    })(request(form()));
    const text = await response.clone().text();

    await expectSafeError(response, 500, "INTERNAL_ERROR");
    expect(text).not.toContain("TOP_SECRET");
    expect(text).not.toContain("/Users/operator/private");
  });

  it("composes the enabled production route from the server-derived Caphub root", async () => {
    const home = await mkdtemp(join(realpathSync(tmpdir()), "alljobs-caphub-enabled-route-"));
    try {
      await writeFile(join(home, "config.json"), JSON.stringify({
        trustedCodeRoots: [home],
        caphub: { enabled: true, allowedOrigins: [ALLOWED_ORIGIN], maxUploadBytes: 1_048_576 }
      }));
      process.env.ALLJOBS_HOME = home;
      const { POST } = await import("./route");
      const response = await POST(request(form(), { contentLength: "4096" }));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.kind).toBe("created");
      expect(body.capture.id).toMatch(/^cap_[0-9a-f]{32}$/);
      const record = JSON.parse(await readFile(
        join(home, "state", "caphub", "records", "captures", `${body.capture.id}.json`),
        "utf8"
      ));
      expect(record.id).toBe(body.capture.id);
      expect(record.object.key).toMatch(/^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/);
      const eventLine = await readFile(
        join(home, "state", "caphub", "events", `${record.created_at.slice(0, 7)}.jsonl`),
        "utf8"
      );
      expect(JSON.parse(eventLine).event_id).toBe(captureReceivedEventId(body.capture.id));
      expect(JSON.stringify(body)).not.toContain(home);
      expect(JSON.stringify(body)).not.toContain(record.object.key);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
