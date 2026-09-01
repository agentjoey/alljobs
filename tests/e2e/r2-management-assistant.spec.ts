import AxeBuilder from "@axe-core/playwright";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { AssistantRequestIntent, AssistantStreamEvent, BacklogProposal } from "@/lib/assistant/contracts";
import { mutateR2Manifest, readR2Activity, setR2AssistantEnabled } from "./r2-fixtures";

function ndjson(events: AssistantStreamEvent[]) {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function answer(digest: string, overrides: Record<string, unknown> = {}) {
  void digest;
  return {
    kind: "management_answer" as const,
    direct_answer: "AJ-B-101 is ready for owner review.",
    confirmed_facts: [{ id: "fact-ready", text: "AJ-B-101 is ready.", citation_source_ids: ["docs/BACKLOG.md"] }],
    inferences: [],
    unknowns: [],
    questions: [],
    recommendations: [{ id: "candidate-backlog", title: "Record boundary evidence", rationale: "Keep the reviewed evidence visible.", candidate_kind: "backlog" as const }],
    citations: [{ source_id: "docs/BACKLOG.md", label: "Dirty local Backlog" }],
    ...overrides
  };
}

function backlogProposal(digest: string): BacklogProposal {
  const unsigned = {
    problem: "Boundary evidence needs an owner-reviewed backlog entry.",
    desired_outcome: "A repository agent can apply a reviewed proposal.",
    suggested_title: "Record R2 boundary evidence",
    suggested_phase: "phase-1",
    suggested_priority: "P1" as const,
    suggested_dependencies: [],
    suggested_work_mode: "implementation" as const,
    done_when: "The owner has reviewed the evidence.",
    evidence: ["Dirty local Backlog was read."],
    assumptions: [],
    unknowns: [],
    questions: [],
    citation_source_ids: ["docs/BACKLOG.md"],
    manifest_digest: digest,
    model: "MiniMax-M3",
    mode: "standard" as const,
    generated_at: "2026-09-01T00:00:00.000Z"
  };
  return { ...unsigned, proposal_digest: "a".repeat(64) };
}

async function interceptAssistant(page: Page, responder: (intent: AssistantRequestIntent) => AssistantStreamEvent[]) {
  await page.route("**/api/assistant/respond", async (route) => {
    const intent = route.request().postDataJSON() as AssistantRequestIntent;
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
      body: ndjson(responder(intent))
    });
  });
}

async function openAssistant(page: Page) {
  await page.goto("/projects/r2-ready");
  await page.getByRole("button", { name: "Management assistant" }).click();
  await expect(page.getByRole("heading", { name: "Management assistant" })).toBeFocused();
  await expect(page.getByRole("region", { name: "Context receipt" })).toContainText("docs/ROADMAP.md");
}

async function assertNoHorizontalScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
}

test.describe("R2 management assistant browser and authority boundaries", () => {
  test("runs a fresh standard answer, then copies a server-shaped Backlog handoff", async ({ page, context }) => {
    const requests: AssistantRequestIntent[] = [];
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3466" });
    await interceptAssistant(page, (intent) => {
      requests.push(intent);
      if (intent.intent === "draft_backlog") {
        const proposal = backlogProposal(intent.expected_manifest_digest);
        return [{ type: "backlog_proposal", stale: false, proposal, handoff: "Application owner: repository agent or Human Owner\nAllJobs did not write to docs/BACKLOG.md." }];
      }
      return [{ type: "assistant_complete", stale: false, outcome: answer(intent.expected_manifest_digest) }];
    });

    await openAssistant(page);
    await page.getByLabel("Ask management assistant").fill("What is ready?");
    await page.getByRole("button", { name: "Ask Companion" }).click();
    await expect(page.getByRole("region", { name: "Companion output" })).toContainText("AJ-B-101 is ready for owner review.");
    await expect(page.getByRole("button", { name: "Draft Backlog proposal" })).toBeVisible();
    await page.getByRole("button", { name: "Draft Backlog proposal" }).click();
    await expect(page.getByRole("region", { name: "Repository-agent Backlog handoff" })).toContainText("Copy-only Backlog handoff");
    await page.getByRole("button", { name: "Copy repository-agent handoff" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("AllJobs did not write to docs/BACKLOG.md.");

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ intent: "ask", mode: "standard", project_slug: "r2-ready", selected_optional_source_ids: [] });
    expect(JSON.stringify(requests)).not.toMatch(/root|model|tool|budget|content/i);
  });

  test("keeps source access owner-gated, keyboard reachable, and usable at mobile width", async ({ page }) => {
    await interceptAssistant(page, (intent) => {
      if (intent.intent === "answer_without_source") {
        return [{ type: "assistant_complete", stale: false, outcome: answer(intent.expected_manifest_digest, { direct_answer: "Document-only answer.", unknowns: ["Source inspection was declined."], recommendations: [] }) }];
      }
      return [
        { type: "source_access_requested", proposal: { kind: "source_access_proposal", gate_id: "gate-r2", purpose: "Inspect one repository file.", unanswered_question: "Which implementation file is affected?", requested_capabilities: ["list_project_files"], max_files: 1, max_bytes: 1024, max_tool_calls: 1, expected_facts: ["Affected file"], manifest_digest: intent.expected_manifest_digest, expires_at: "2099-01-01T00:00:00.000Z" } },
        { type: "assistant_complete", stale: false, outcome: { kind: "source_access_proposal", gate_id: "gate-r2", purpose: "Inspect one repository file.", unanswered_question: "Which implementation file is affected?", requested_capabilities: ["list_project_files"], max_files: 1, max_bytes: 1024, max_tool_calls: 1, expected_facts: ["Affected file"], manifest_digest: intent.expected_manifest_digest, expires_at: "2099-01-01T00:00:00.000Z" } }
      ];
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openAssistant(page);
    await page.getByLabel("Ask management assistant").fill("Need more source?");
    await page.getByRole("button", { name: "Ask Companion" }).click();
    await expect(page.getByRole("region", { name: "Additional source access" })).toBeVisible();
    await page.getByRole("button", { name: "Answer without source" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Companion output" })).toContainText("Document-only answer.");
    await expect(page.getByText("Source inspection was declined.")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByRole("heading", { name: "Management assistant" })).toBeVisible();
    const optionalPath = page.getByRole("region", { name: "Context receipt" }).getByText("docs/ARCHITECTURE.md", { exact: true });
    await expect(optionalPath).toBeVisible();
    expect(await optionalPath.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(40);
    await assertNoHorizontalScroll(page);
    const sheet = page.locator(".assistant-sheet");
    await expect(sheet).toHaveCSS("height", "844px");
    const axe = await new AxeBuilder({ page }).include(".assistant-sheet").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations).toEqual([]);
  });

  test("shows stale and incomplete outcomes without exposing an action", async ({ page }) => {
    let call = 0;
    await interceptAssistant(page, (intent) => {
      call += 1;
      if (call === 1) {
        mutateR2Manifest();
        return [{ type: "assistant_complete", stale: true, outcome: answer(intent.expected_manifest_digest, { recommendations: [{ id: "stale-task", title: "Do not use", rationale: "Context changed.", candidate_kind: "task" }] }) }];
      }
      return [{ type: "run_status", stage: "generating" }];
    });
    await openAssistant(page);
    await page.getByLabel("Ask management assistant").fill("Is this still current?");
    await page.getByRole("button", { name: "Ask Companion" }).click();
    await expect(page.getByText("Stale — refresh context")).toBeVisible();
    await expect(page.getByRole("button", { name: "Use as Task draft" })).toHaveCount(0);
    await page.getByRole("button", { name: "Ask Companion" }).click();
    await expect(page.getByRole("status")).toContainText("ended before a complete result");
  });

  test("prefills a normal Task form only after a fresh task draft and never submits it", async ({ page }) => {
    const before = readR2Activity();
    await interceptAssistant(page, (intent) => {
      if (intent.intent === "draft_task") {
        return [{ type: "task_draft", stale: false, model: "MiniMax-M3", mode: "standard", draft: { title: "Verify R2 fixture", status: "todo", work_mode: "implementation", backlog: "AJ-B-101", evidence: ["Dirty local planning"], assumptions: [], citation_source_ids: ["docs/BACKLOG.md"], manifest_digest: intent.expected_manifest_digest } }];
      }
      return [{ type: "assistant_complete", stale: false, outcome: answer(intent.expected_manifest_digest, { recommendations: [{ id: "task-candidate", title: "Verify R2 fixture", rationale: "A normal task needs review.", candidate_kind: "task" }] }) }];
    });
    await openAssistant(page);
    await page.getByLabel("Ask management assistant").fill("Draft the verification task.");
    await page.getByRole("button", { name: "Ask Companion" }).click();
    await page.getByRole("button", { name: "Use as Task draft" }).click();
    await expect(page.getByRole("heading", { name: "Create Native Task (r2-ready)" })).toBeVisible();
    await expect(page.getByText("Assistant draft provenance")).toBeVisible();
    await expect(page.locator("#ntf-task-id")).toHaveValue("");
    await expect(page.locator("#ntf-title")).toHaveValue("Verify R2 fixture");
    await expect(page.getByRole("button", { name: "Create Task" })).toHaveCount(1);
    expect(readR2Activity()).toBe(before);
  });

  test("surfaces disabled, invalid, and safe provider error states", async ({ page }) => {
    setR2AssistantEnabled(false);
    await page.goto("/projects/r2-ready");
    await expect(page.getByRole("button", { name: "Management assistant" })).toBeDisabled();
    await expect(page.getByText("disabled on this Control Host")).toBeVisible();
    setR2AssistantEnabled(true);
    await interceptAssistant(page, () => [{ type: "assistant_error", code: "PROVIDER_UNAVAILABLE", message: "Management assistant is temporarily unavailable." }]);
    await openAssistant(page);
    await page.getByLabel("Ask management assistant").fill("Retry safely.");
    await page.getByRole("button", { name: "Ask Companion" }).click();
    await expect(page.getByRole("status")).toHaveText("Management assistant is temporarily unavailable.");
  });

  test("captures final R2 evidence", async ({ page }) => {
    test.skip(process.env.R2_CAPTURE_EVIDENCE !== "1", "Set R2_CAPTURE_EVIDENCE=1 to write final screenshots.");
    const evidenceDir = resolve(process.cwd(), ".agent/frontend-design/r2-management-assistant/final-screens");
    mkdirSync(evidenceDir, { recursive: true });
    await interceptAssistant(page, (intent) => [{ type: "assistant_complete", stale: false, outcome: answer(intent.expected_manifest_digest) }]);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await openAssistant(page);
    await page.getByLabel("Ask management assistant").fill("What is ready for review?");
    await page.getByRole("button", { name: "Ask Companion" }).click();
    await expect(page.getByRole("region", { name: "Companion output" })).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDir, "r2-assistant-output-1440.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByRole("heading", { name: "Management assistant" })).toBeVisible();
    await assertNoHorizontalScroll(page);
    await page.screenshot({ path: resolve(evidenceDir, "r2-assistant-output-390.png"), fullPage: true });
    expect(existsSync(resolve(evidenceDir, "r2-assistant-output-390.png"))).toBe(true);
  });

});
