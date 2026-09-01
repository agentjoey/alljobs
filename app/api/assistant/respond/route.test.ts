import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantRequestIntent, AssistantStreamEvent } from "@/lib/assistant/contracts";
import { createAssistantResponseRoute } from "./route-factory";

const DIGEST = "a".repeat(64);
const validAsk: AssistantRequestIntent = {
  intent: "ask",
  project_slug: "sample-code",
  question: "What is ready?",
  mode: "standard",
  selected_optional_source_ids: [],
  expected_manifest_digest: DIGEST
};

async function* complete(): AsyncGenerator<AssistantStreamEvent> {
  yield { type: "run_status", stage: "preparing" };
  yield { type: "assistant_error", code: "PROVIDER_UNAVAILABLE", message: "Assistant is temporarily unavailable." };
}

describe("POST /api/assistant/respond", () => {
  it("blocks the real production route before provider creation when the Control Host disables the assistant", async () => {
    const previousHome = process.env.ALLJOBS_HOME;
    const home = await mkdtemp(join(tmpdir(), "alljobs-disabled-route-"));
    try {
      await writeFile(join(home, "config.json"), JSON.stringify({ trustedCodeRoots: [home], refreshIntervalSeconds: 300, assistant: { enabled: false } }), "utf8");
      process.env.ALLJOBS_HOME = home;
      const { POST } = await import("./route");
      const response = await POST(new Request("http://127.0.0.1:3456/api/assistant/respond", {
        method: "POST", headers: { origin: "http://127.0.0.1:3456", "content-type": "application/json" }, body: JSON.stringify(validAsk)
      }));
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).not.toContain("MINIMAX_API_KEY");
    } finally {
      if (previousHome === undefined) delete process.env.ALLJOBS_HOME;
      else process.env.ALLJOBS_HOME = previousHome;
      await rm(home, { recursive: true, force: true });
    }
  });

  it("rejects invalid origin, media type, oversize input, and unknown browser authority", async () => {
    const respond = vi.fn(() => complete());
    const POST = createAssistantResponseRoute({ respond, maxBodyBytes: 64 });

    const foreign = await POST(new Request("http://127.0.0.1:3456/api/assistant/respond", {
      method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" }, body: JSON.stringify(validAsk)
    }));
    const authority = await POST(new Request("http://127.0.0.1:3456/api/assistant/respond", {
      method: "POST", headers: { origin: "http://127.0.0.1:3456", "content-type": "application/json" }, body: JSON.stringify({ ...validAsk, root: "/tmp" })
    }));

    expect(foreign.status).toBe(403);
    expect(authority.status).toBe(413);
    expect(respond).not.toHaveBeenCalled();
    expect(await foreign.text()).not.toContain("example.test");
  });

  it("streams strict NDJSON with no-store and nosniff through a real Request and propagates the signal", async () => {
    const respond = vi.fn((_intent: AssistantRequestIntent, signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return complete();
    });
    const POST = createAssistantResponseRoute({ respond, maxBodyBytes: 4096 });
    const controller = new AbortController();
    const request = new Request("http://127.0.0.1:3456/api/assistant/respond", {
      method: "POST",
      signal: controller.signal,
      headers: { origin: "http://127.0.0.1:3456", "content-type": "application/json" },
      body: JSON.stringify(validAsk)
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await response.text()).trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      { type: "run_status", stage: "preparing" },
      { type: "assistant_error", code: "PROVIDER_UNAVAILABLE", message: "Assistant is temporarily unavailable." }
    ]);
    expect(respond).toHaveBeenCalledWith(validAsk, request.signal);
  });
});
