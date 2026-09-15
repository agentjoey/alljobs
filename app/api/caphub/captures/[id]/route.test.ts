import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptureRecord } from "@/lib/caphub/domain/types";
import { CaptureServiceError, type CaptureService } from "@/lib/caphub/service/capture";
import { createCaptureGetRoute } from "./route-factory";

const CAPTURE_ID = `cap_${"1".repeat(32)}`;
const IMAGE_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const DIGEST = createHash("sha256").update(IMAGE_BYTES).digest("hex");
const ROUTE_URL = `http://127.0.0.1:3456/api/caphub/captures/${CAPTURE_ID}`;
const previousHome = process.env.ALLJOBS_HOME;

function captureRecord(): CaptureRecord {
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
    idempotency_key: "capture.request-20260916:route-a",
    status: "received",
    human_review_required: true,
    created_at: "2026-09-16T02:03:04.000Z"
  };
}

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
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

describe("GET /api/caphub/captures/[id]", () => {
  it("awaits Next 16 params and rejects an invalid Capture ID before storage", async () => {
    let paramsResolved = false;
    const get = vi.fn<CaptureService["get"]>();
    const GET = createCaptureGetRoute({ get });
    const params = Promise.resolve({ id: "../../private" }).then((value) => {
      paramsResolved = true;
      return value;
    });
    const response = await GET(new Request(ROUTE_URL), { params });

    await expectSafeError(response, 400, "INVALID_CAPTURE_ID");
    expect(paramsResolved).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing Capture", async () => {
    const get = vi.fn<CaptureService["get"]>().mockResolvedValue(null);
    const response = await createCaptureGetRoute({ get })(
      new Request(ROUTE_URL),
      context(CAPTURE_ID)
    );

    await expectSafeError(response, 404, "CAPTURE_NOT_FOUND");
    expect(get).toHaveBeenCalledWith(CAPTURE_ID);
  });

  it("returns stored metadata without bytes, paths, object keys, or idempotency keys", async () => {
    const capture = captureRecord();
    const get = vi.fn<CaptureService["get"]>().mockResolvedValue(capture);
    const response = await createCaptureGetRoute({ get })(
      new Request(ROUTE_URL),
      context(CAPTURE_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toEqual({
      capture: {
        schema_version: 1,
        id: CAPTURE_ID,
        source: capture.source,
        note: capture.note,
        mime_type: "image/png",
        object: { algorithm: "sha256", digest: DIGEST, bytes: IMAGE_BYTES.byteLength },
        status: "received",
        human_review_required: true,
        created_at: "2026-09-16T02:03:04.000Z"
      }
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain(capture.object.key);
    expect(text).not.toContain(capture.idempotency_key);
    expect(text).not.toContain("/Users/");
  });

  it("returns 503 at the real production route while Caphub is disabled", async () => {
    const home = await mkdtemp(join(realpathSync(tmpdir()), "alljobs-caphub-disabled-get-"));
    try {
      await writeFile(join(home, "config.json"), JSON.stringify({
        trustedCodeRoots: [home],
        caphub: {
          enabled: false,
          allowedOrigins: ["https://alljobs.agentjoey.ai"],
          maxUploadBytes: 1_048_576
        }
      }));
      process.env.ALLJOBS_HOME = home;
      const route = await import("./route");

      expect(route.runtime).toBe("nodejs");
      expect(route.dynamic).toBe("force-dynamic");
      await expectSafeError(
        await route.GET(new Request(ROUTE_URL), context(CAPTURE_ID)),
        503,
        "CAPHUB_DISABLED"
      );
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("reports enabled-but-unavailable local storage without exposing its server path", async () => {
    const parent = await mkdtemp(join(realpathSync(tmpdir()), "alljobs-caphub-bad-get-root-"));
    const target = join(parent, "target");
    const alias = join(parent, "alias");
    try {
      await mkdir(target);
      await symlink(target, alias);
      await writeFile(join(target, "config.json"), JSON.stringify({
        trustedCodeRoots: [target],
        caphub: {
          enabled: true,
          allowedOrigins: ["https://alljobs.agentjoey.ai"],
          maxUploadBytes: 1_048_576
        }
      }));
      process.env.ALLJOBS_HOME = alias;
      const { GET } = await import("./route");
      const response = await GET(new Request(ROUTE_URL), context(CAPTURE_ID));
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
    ["INVALID_INPUT", 400, "INVALID_CAPTURE_ID"],
    ["STORAGE_UNAVAILABLE", 503, "STORAGE_UNAVAILABLE"],
    ["AUDIT_WRITE_FAILED", 500, "AUDIT_WRITE_FAILED"]
  ] as const)("maps service error %s without leaking details", async (serviceCode, status, responseCode) => {
    const get = vi.fn<CaptureService["get"]>().mockRejectedValue(
      new CaptureServiceError(serviceCode, "TOP_SECRET at /Users/operator/private")
    );
    const response = await createCaptureGetRoute({ get })(
      new Request(ROUTE_URL),
      context(CAPTURE_ID)
    );
    const text = await response.clone().text();

    await expectSafeError(response, status, responseCode);
    expect(text).not.toContain("TOP_SECRET");
    expect(text).not.toContain("/Users/operator/private");
  });

  it("collapses an unexpected read failure to a generic 500 response", async () => {
    const get = vi.fn<CaptureService["get"]>().mockRejectedValue(
      new Error("TOP_SECRET at /Users/operator/private")
    );
    const response = await createCaptureGetRoute({ get })(
      new Request(ROUTE_URL),
      context(CAPTURE_ID)
    );
    const text = await response.clone().text();

    await expectSafeError(response, 500, "INTERNAL_ERROR");
    expect(text).not.toContain("TOP_SECRET");
    expect(text).not.toContain("/Users/operator/private");
  });
});
