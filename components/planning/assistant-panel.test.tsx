import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssistantEntryState } from "@/lib/assistant/context";
import { AssistantPanel } from "./assistant-panel";

const DIGEST = "a".repeat(64);
const enabled: AssistantEntryState = {
  enabled: true,
  manifest_digest: DIGEST,
  receipt: {
    project_slug: "sample-code",
    source_mode: "local-working-tree",
    head_revision: "abc123",
    issues: [],
    sources: [{ source_id: "docs/BACKLOG.md", path: "docs/BACKLOG.md", digest: DIGEST, bytes: 12, modified: false, optional: false, selected: true, read_at: "2026-09-01T00:00:00.000Z" }]
  }
};

describe("AssistantPanel", () => {
  it("keeps the entry visible but disabled when Control Host configuration is unavailable", () => {
    render(<AssistantPanel projectSlug="sample-code" entry={{ enabled: false, code: "NOT_CONFIGURED", message: "Not configured" }} />);
    expect(screen.getByRole("button", { name: "Management assistant" })).toBeDisabled();
    expect(screen.getByText("Not configured")).toBeVisible();
  });

  it("opens a labelled panel with focus, receipt metadata, Standard default, and no source body", async () => {
    const user = userEvent.setup();
    render(<AssistantPanel projectSlug="sample-code" entry={enabled} />);

    await user.click(screen.getByRole("button", { name: "Management assistant" }));
    expect(screen.getByRole("heading", { name: "Management assistant" })).toHaveFocus();
    expect(screen.getByText("docs/BACKLOG.md")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Standard" })).toBeChecked();
    expect(screen.queryByText("hidden source body")).not.toBeInTheDocument();
  });

  it("sends a fresh bounded request and retains the composer after a structured companion output", async () => {
    const user = userEvent.setup();
    const request = vi.fn().mockResolvedValue([
      { type: "run_status", stage: "preparing" },
      { type: "assistant_complete", stale: false, outcome: { kind: "management_answer", direct_answer: "One ready item.", confirmed_facts: [], inferences: [], unknowns: [], questions: [], recommendations: [], citations: [] } },
      { type: "run_status", stage: "complete" }
    ]);
    render(<AssistantPanel projectSlug="sample-code" entry={enabled} request={request} />);

    await user.click(screen.getByRole("button", { name: "Management assistant" }));
    await user.type(screen.getByLabelText("Ask management assistant"), "What is ready?");
    await user.click(screen.getByRole("button", { name: "Ask Companion" }));

    expect(request).toHaveBeenCalledWith(expect.objectContaining({ intent: "ask", question: "What is ready?", mode: "standard", expected_manifest_digest: DIGEST }));
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ history: expect.anything() }));
    expect(screen.getByText("Companion output")).toBeVisible();
    expect(screen.getByText("One ready item.")).toBeVisible();
    expect(screen.getByLabelText("Ask management assistant")).toBeVisible();
  });

  it("keeps optional source selection in the fresh request and renders an explicit source gate", async () => {
    const user = userEvent.setup();
    const optionalEntry: AssistantEntryState = { ...enabled, receipt: { ...enabled.receipt, sources: [...enabled.receipt.sources, { source_id: "docs/NOTES.md", path: "docs/NOTES.md", digest: DIGEST, bytes: 9, modified: false, optional: true, selected: false, read_at: "2026-09-01T00:00:00.000Z" }] } };
    const proposal = { kind: "source_access_proposal" as const, gate_id: "gate-1", purpose: "Check a bounded note.", unanswered_question: "What is ready?", requested_capabilities: ["read_project_files" as const], max_files: 1, max_bytes: 100, max_tool_calls: 1, expected_facts: [], manifest_digest: DIGEST, expires_at: "2026-09-01T01:00:00.000Z" };
    const request = vi.fn()
      .mockResolvedValueOnce([{ type: "source_access_requested", proposal }])
      .mockResolvedValueOnce([{ type: "assistant_complete", stale: false, outcome: { kind: "management_answer", direct_answer: "Checked.", confirmed_facts: [], inferences: [], unknowns: [], questions: [], recommendations: [], citations: [] } }]);
    render(<AssistantPanel projectSlug="sample-code" entry={optionalEntry} request={request} />);

    await user.click(screen.getByRole("button", { name: "Management assistant" }));
    await user.click(screen.getByRole("checkbox", { name: "docs/NOTES.md" }));
    await user.type(screen.getByLabelText("Ask management assistant"), "What is ready?");
    await user.click(screen.getByRole("button", { name: "Ask Companion" }));
    expect(await screen.findByRole("region", { name: "Additional source access" })).toBeVisible();
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ intent: "ask", selected_optional_source_ids: ["docs/NOTES.md"] }));

    await user.click(screen.getByRole("button", { name: "Inspect source" }));
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ intent: "inspect_source", gate_id: "gate-1", question: "What is ready?" }));
    expect(await screen.findByText("Checked.")).toBeVisible();
  });

  it("names validation and stale outcomes, then closes a switched project panel", async () => {
    const user = userEvent.setup();
    const request = vi.fn().mockResolvedValue([{ type: "assistant_complete", stale: true, outcome: { kind: "management_answer", direct_answer: "Refresh first.", confirmed_facts: [], inferences: [], unknowns: [], questions: [], recommendations: [], citations: [] } }]);
    const { rerender } = render(<AssistantPanel projectSlug="sample-code" entry={enabled} request={request} />);
    await user.click(screen.getByRole("button", { name: "Management assistant" }));
    await user.click(screen.getByRole("button", { name: "Ask Companion" }));
    expect(screen.getByText("Enter a question before asking Companion.")).toBeVisible();
    await user.type(screen.getByLabelText("Ask management assistant"), "Any issue?");
    await user.click(screen.getByRole("button", { name: "Ask Companion" }));
    expect(await screen.findByText("Stale — refresh context")).toBeVisible();

    rerender(<AssistantPanel projectSlug="other-project" entry={{ ...enabled, receipt: { ...enabled.receipt, project_slug: "other-project" } }} request={request} />);
    expect(screen.queryByRole("heading", { name: "Management assistant" })).not.toBeInTheDocument();
  });
});
