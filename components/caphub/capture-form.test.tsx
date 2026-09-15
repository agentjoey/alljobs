import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CaphubPage from "@/app/caphub/page";
import { CaptureForm } from "./capture-form";

const CAPTURE_ID = "cap_31f86a209ab84b72ad89f7f82d13e4c1";
const receipt = {
  kind: "created",
  capture: {
    schema_version: 1,
    id: CAPTURE_ID,
    source: { kind: "web", original_filename: "evidence.png", source_url: "https://example.com/source" },
    note: "Check the original claim.",
    mime_type: "image/png",
    object: { algorithm: "sha256", digest: "8f2a91d3" + "a".repeat(56), bytes: 8 },
    status: "received",
    human_review_required: true,
    created_at: "2026-09-15T08:42:19+08:00"
  }
};
const temporaryHomes: string[] = [];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const home of temporaryHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function setup() {
  const user = userEvent.setup({ applyAccept: false });
  const requests: { url: string; init: RequestInit }[] = [];
  const responses: (() => Promise<Response>)[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return responses.shift()?.() ?? Response.json(receipt, { status: 201 });
  });
  render(<CaptureForm enabled maxUploadBytes={1_048_576} />);
  return {
    user, requests, responses,
    fileInput: screen.getByLabelText("Screenshot image") as HTMLInputElement,
    image: new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "evidence.png", { type: "image/png", lastModified: 1 })
  };
}

describe("Web Capture intake", () => {
  it("offers a keyboard-operable file chooser and shows the immutable Human-review consequence before selection", async () => {
    const { user, fileInput, requests } = setup();
    expect(fileInput).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
    expect(fileInput).not.toHaveAttribute("multiple");
    await user.tab();
    expect(screen.getByRole("button", { name: "Choose image" })).toHaveFocus();
    expect(screen.getByText("Immutable · Human review required")).toBeVisible();
    expect(screen.getByText(/One image · max 1 MiB/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose an image to continue" })).toBeDisabled();
    expect(requests).toHaveLength(0);
  });

  it.each(["image/png", "image/jpeg", "image/webp"])("stages %s and carries the filename into the custody strip", async (type) => {
    const { user, fileInput, requests } = setup();
    await user.upload(fileInput, new File(["image"], "capture-with-a-long-descriptive-filename.png", { type }));
    expect(screen.getByRole("button", { name: "Receive capture" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(/selected and ready/i);
    expect(within(screen.getByRole("region", { name: "Capture custody boundary" })).getByText(/capture-with-a-long-descriptive-filename.png/)).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("submits only the documented multipart fields, disables controls while pending, then focuses a public receipt", async () => {
    const { user, fileInput, image, requests, responses } = setup();
    let finish!: (response: Response) => void;
    responses.push(() => new Promise<Response>((resolve) => { finish = resolve; }));
    await user.upload(fileInput, image);
    await user.type(screen.getByLabelText(/Source URL/), "https://example.com/source");
    await user.type(screen.getByLabelText(/^Note/), "Check the original claim.");
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    expect(screen.getByRole("status")).toHaveTextContent("Receiving capture");
    expect(screen.getByRole("form", { name: "Receive one screenshot" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Receiving capture…" })).toBeDisabled();
    expect(fileInput).toBeDisabled();
    expect(screen.getByLabelText(/Source URL/)).toBeDisabled();
    expect(screen.getByLabelText(/^Note/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose different image" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form"));
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("/api/caphub/captures");
    expect(requests[0].init.method).toBe("POST");
    expect(requests[0].init.headers).toBeUndefined();
    const body = requests[0].init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect([...body.keys()].sort()).toEqual(["idempotency_key", "image", "note", "source_url"]);
    expect(body.get("image")).toBe(image);
    expect(body.get("idempotency_key")).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(body.get("note")).toBe("Check the original claim.");
    expect(body.get("source_url")).toBe("https://example.com/source");
    await act(async () => finish(Response.json(receipt, { status: 201 })));
    expect(await screen.findByText(CAPTURE_ID)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Capture receipt" })).toHaveFocus();
    expect(screen.getByText("Capture received")).toBeVisible();
    expect(screen.getByText("received")).toBeVisible();
    expect(screen.getByRole("button", { name: "Receipt returned" })).toBeDisabled();
  });

  it("receives an image with no optional context", async () => {
    const { user, fileInput, image, requests } = setup();
    await user.upload(fileInput, image);
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    expect(await screen.findByText(CAPTURE_ID)).toBeVisible();
    const body = requests[0].init.body as FormData;
    expect(body.get("note")).toBe("");
    expect(body.get("source_url")).toBe("");
  });

  it.each([
    { file: () => new File([new Uint8Array(1_048_577)], "large.png", { type: "image/png" }), error: /larger than 1 MiB/i },
    { file: () => new File(["image"], "photo.heic", { type: "image/heic" }), error: /Choose a PNG, JPEG, or WebP/i },
    { file: () => new File([], "empty.png", { type: "image/png" }), error: /empty/i }
  ])("rejects invalid selected bytes before any request: $error", async ({ file, error }) => {
    const { user, fileInput, image, requests } = setup();
    await user.upload(fileInput, file());
    expect(screen.getByRole("alert")).toHaveTextContent(error);
    expect(fileInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /Choose an image to continue/ })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form"));
    expect(requests).toHaveLength(0);
    await user.upload(fileInput, image);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Receive capture" })).toBeEnabled();
  });

  it("rejects multiple dropped files instead of silently receiving one", () => {
    const { image, requests } = setup();
    fireEvent.drop(screen.getByRole("group", { name: "Screenshot drop area" }), { dataTransfer: { files: [image, image] } });
    expect(screen.getByRole("alert")).toHaveTextContent(/one image/i);
    expect(screen.getByRole("button", { name: "Choose an image to continue" })).toBeDisabled();
    expect(requests).toHaveLength(0);
  });

  it("accepts a single dropped image through the same validation and submit flow", async () => {
    const { user, image } = setup();
    fireEvent.drop(screen.getByRole("group", { name: "Screenshot drop area" }), { dataTransfer: { files: [image] } });
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    expect(await screen.findByText(CAPTURE_ID)).toBeVisible();
  });

  it("rejects non-HTTPS source metadata before request and lets the owner correct it", async () => {
    const { user, fileInput, image, requests } = setup();
    await user.upload(fileInput, image);
    await user.type(screen.getByLabelText(/Source URL/), "http://example.com/source");
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/valid HTTPS URL/i);
    expect(requests).toHaveLength(0);
    expect(screen.getByLabelText(/Source URL/)).toHaveAttribute("aria-invalid", "true");
    await user.clear(screen.getByLabelText(/Source URL/));
    await user.type(screen.getByLabelText(/Source URL/), "https://example.com/source");
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    expect(await screen.findByText(CAPTURE_ID)).toBeVisible();
    expect(screen.queryByRole("link", { name: /example.com/ })).not.toBeInTheDocument();
  });

  it("enforces note and source length before request, including programmatic form input", async () => {
    const { user, fileInput, image, requests } = setup();
    await user.upload(fileInput, image);
    expect(screen.getByLabelText(/^Note/)).toHaveAttribute("maxlength", "4000");
    expect(screen.getByLabelText(/Source URL/)).toHaveAttribute("maxlength", "2048");
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: "a".repeat(4001) } });
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/4,000/);
    expect(requests).toHaveLength(0);
  });

  it.each(["STORAGE_UNAVAILABLE", "AUDIT_WRITE_FAILED", "network"])("retains the same UUID and payload after %s and displays an existing receipt on retry", async (code) => {
    const { user, fileInput, image, requests, responses } = setup();
    responses.push(async () => {
      if (code === "network") throw new Error("/private/secret network detail");
      return Response.json({ error: { code, message: "/private/secret storage detail" } }, { status: 503 });
    });
    responses.push(async () => Response.json({ ...receipt, kind: "duplicate" }, { status: 200 }));
    await user.upload(fileInput, image);
    await user.type(screen.getByLabelText(/^Note/), "Keep this context.");
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no receipt|not returned/i);
    expect(screen.queryByText(/private\/secret/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Note/)).toBeDisabled();
    expect(screen.getByLabelText(/Source URL/)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry same capture" }));
    expect(await screen.findByText("Duplicate — existing receipt returned")).toBeVisible();
    expect(screen.queryByText("Capture received")).not.toBeInTheDocument();
    const [first, second] = requests.map(({ init }) => init.body as FormData);
    expect(second.get("idempotency_key")).toBe(first.get("idempotency_key"));
    expect(second.get("image")).toBe(first.get("image"));
    expect(second.get("note")).toBe("Keep this context.");
    expect(second.get("source_url")).toBe(first.get("source_url"));
  });

  it("starts a new key only after new selection and retains the completed receipt while a chooser is cancelled", async () => {
    const { user, fileInput, image, requests } = setup();
    await user.upload(fileInput, image);
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    expect(await screen.findByText(CAPTURE_ID)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Receive another image" }));
    expect(screen.getByText(CAPTURE_ID)).toBeVisible();
    await user.upload(fileInput, new File(["different"], "different.png", { type: "image/png" }));
    expect(screen.queryByText(CAPTURE_ID)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Note/)).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    await screen.findByText(CAPTURE_ID);
    expect((requests[1].init.body as FormData).get("idempotency_key")).not.toBe((requests[0].init.body as FormData).get("idempotency_key"));
  });

  it.each(["CAPHUB_DISABLED", "ORIGIN_NOT_ALLOWED"])("renders safe unavailability after %s and disables all intake controls", async (code) => {
    const { user, fileInput, image, responses } = setup();
    responses.push(async () => Response.json({ error: { code, message: "secret-policy.example" } }, { status: 403 }));
    await user.upload(fileInput, image);
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
    expect(screen.getByRole("button", { name: "Capture unavailable" })).toBeDisabled();
    expect(fileInput).toBeDisabled();
    expect(screen.getByLabelText(/^Note/)).toBeDisabled();
    expect(screen.queryByText(/secret-policy/)).not.toBeInTheDocument();
  });

  it.each([
    { ...receipt, capture: { ...receipt.capture, status: "approved" } },
    { ...receipt, capture: { ...receipt.capture, human_review_required: false } },
    { ...receipt, capture: { ...receipt.capture, object: { ...receipt.capture.object, key: "sha256/8f/private-object" } } },
    { ...receipt, capture: { ...receipt.capture, source: { ...receipt.capture.source, storage_path: "/private/secret" } } },
    { ...receipt, capture: { ...receipt.capture, idempotency_key: "private-idempotency-key" } },
    { ...receipt, debug: "/private/secret" },
    { ...receipt, kind: "duplicate" }
  ])("refuses a non-public or contradictory success receipt without exposing it", async (payload) => {
    const { user, fileInput, image, responses } = setup();
    responses.push(async () => Response.json(payload, { status: 201 }));
    await user.upload(fileInput, image);
    await user.click(screen.getByRole("button", { name: "Receive capture" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/receipt.*verif/i);
    expect(screen.queryByText(CAPTURE_ID)).not.toBeInTheDocument();
    expect(screen.queryByText(/private-object|private\/secret|private-idempotency/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry same capture" })).toBeEnabled();
  });
});

describe("Caphub server configuration boundary", () => {
  function configure(value?: unknown) {
    const home = mkdtempSync(join(tmpdir(), "alljobs-caphub-page-"));
    temporaryHomes.push(home);
    vi.stubEnv("ALLJOBS_HOME", home);
    if (value !== undefined) writeFileSync(join(home, "config.json"), JSON.stringify(value));
    return home;
  }

  it.each([undefined, { trustedCodeRoots: [] }, { trustedCodeRoots: ["/tmp"] }])("fails closed without usable enabled configuration", async (config) => {
    const home = configure(config);
    render(await CaphubPage());
    expect(screen.getByRole("alert")).toHaveTextContent(/disabled.*Control Host/i);
    expect(screen.getByRole("button", { name: "Capture unavailable" })).toBeDisabled();
    expect(screen.getByLabelText("Screenshot image")).toBeDisabled();
    expect(document.body).not.toHaveTextContent(home);
  });

  it("passes the configured upload limit without rendering origins or host paths", async () => {
    const home = configure({ trustedCodeRoots: ["/tmp"], caphub: { enabled: true, maxUploadBytes: 2_097_152, allowedOrigins: ["https://private-origin.example"] } });
    render(await CaphubPage());
    expect(screen.getByText("One image · max 2 MiB")).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose image" })).toBeEnabled();
    expect(document.body).not.toHaveTextContent(home);
    expect(document.body).not.toHaveTextContent("private-origin.example");
  });
});
