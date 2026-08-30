import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DocumentTriage,
  PlanningSourceState
} from "@/lib/planning/providers/contracts";
import { DocumentHealth } from "./document-health";

const missingBacklog: DocumentTriage = {
  document: "backlog",
  state: "missing",
  sourcePath: "docs/BACKLOG.md",
  diagnostics: [],
  candidates: []
};

const unstructuredRoadmap: DocumentTriage = {
  document: "roadmap",
  state: "unstructured",
  sourcePath: "docs/ROADMAP.md",
  digest: "roadmap-digest",
  revision: "abc1234",
  diagnostics: [],
  candidates: [
    {
      heading: "Release outline",
      line: 3,
      evidence: "## Release outline",
      confidence: "ambiguous",
      missingCanonicalFields: ["id", "kind", "status", "order"]
    }
  ]
};

const localReadOnly: PlanningSourceState = {
  mode: "local-working-tree",
  writable: false,
  readAt: "2026-08-30T00:00:00.000Z"
};

const remoteReadOnly: PlanningSourceState = {
  mode: "remote-commit",
  writable: false,
  readAt: "2026-08-30T00:00:00.000Z"
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DocumentHealth", () => {
  it("names a missing local document and offers a copy-only repository handoff", () => {
    render(
      <DocumentHealth
        documents={[missingBacklog]}
        source={localReadOnly}
        projectSlug="code-project"
      />
    );

    expect(screen.getByRole("region", { name: "Planning document health" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Missing document");
    expect(screen.getByText("docs/BACKLOG.md")).toBeVisible();
    expect(screen.getByText("Local working tree")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy repository-agent handoff" })).toBeEnabled();
  });

  it("keeps unstructured candidates visibly outside canonical planning data", () => {
    render(
      <DocumentHealth
        documents={[unstructuredRoadmap]}
        source={remoteReadOnly}
        projectSlug="code-project"
      />
    );

    expect(screen.getByText("Not canonical planning data")).toBeVisible();
    expect(screen.getByText("Candidate section")).toBeVisible();
    expect(screen.getByText("Release outline")).toBeVisible();
    expect(screen.getByText("id, kind, status, order")).toBeVisible();
    expect(screen.getByText("abc1234")).toBeVisible();
    expect(screen.getByText("roadmap-digest")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Manage ordering/i })).not.toBeInTheDocument();
  });

  it("copies the bounded handoff through keyboard activation and announces success", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(
      <DocumentHealth
        documents={[missingBacklog]}
        source={localReadOnly}
        projectSlug="code-project"
      />
    );

    const copyButton = screen.getByRole("button", { name: "Copy repository-agent handoff" });
    copyButton.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("Project: code-project");
    expect(writeText.mock.calls[0][0]).toContain("Document: docs/BACKLOG.md");
    expect(screen.getByText("Repository-agent handoff copied.")).toBeVisible();
  });

  it("reveals selectable handoff text when clipboard access is rejected", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard unavailable")) }
    });
    render(
      <DocumentHealth
        documents={[unstructuredRoadmap]}
        source={remoteReadOnly}
        projectSlug="code-project"
      />
    );

    await user.click(screen.getByRole("button", { name: "Copy repository-agent handoff" }));

    expect(await screen.findByText("Copy failed. Select and copy the handoff text below.")).toBeVisible();
    const fallback = screen.getByRole("textbox", { name: "Repository-agent handoff text" });
    expect((fallback as HTMLTextAreaElement).value).toContain("Candidate: Release outline");
    expect(screen.queryByText("Repository-agent handoff copied.")).not.toBeInTheDocument();
  });
});
