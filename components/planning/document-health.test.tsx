import { render, screen, waitFor, within } from "@testing-library/react";
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

const recoverableBacklog: DocumentTriage = {
  document: "backlog",
  state: "recoverable",
  sourcePath: "docs/BACKLOG.md",
  digest: "backlog-digest",
  revision: "abc1234",
  diagnostics: [
    {
      scope: "object",
      code: "INVALID_FIELD",
      sourcePath: "docs/BACKLOG.md",
      objectId: "BL-BAD",
      field: "priority",
      message: "Priority is invalid."
    }
  ],
  candidates: [
    {
      heading: "Backlog draft",
      line: 8,
      evidence: "## BL-BAD: Backlog draft",
      confidence: "recognized",
      missingCanonicalFields: ["priority"]
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

const canonicalDocuments: DocumentTriage[] = [
  {
    document: "roadmap",
    state: "canonical",
    sourcePath: "docs/ROADMAP.md",
    digest: "roadmap-digest",
    diagnostics: [],
    candidates: []
  },
  {
    document: "backlog",
    state: "canonical",
    sourcePath: "docs/BACKLOG.md",
    digest: "backlog-digest",
    diagnostics: [],
    candidates: []
  }
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DocumentHealth", () => {
  it("names a missing local Backlog document without offering a repository handoff", () => {
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
    expect(screen.queryByRole("button", { name: "Copy repository-agent handoff" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy only\. AllJobs will not write, commit, push, merge, fetch, or start an agent\./)).not.toBeInTheDocument();
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
    expect(screen.getByRole("heading", { level: 3, name: "Roadmap document" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 4, name: "Candidate section" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Manage ordering/i })).not.toBeInTheDocument();
  });

  it("keeps non-canonical Backlog evidence read-only while retaining the Roadmap handoff", () => {
    render(
      <DocumentHealth
        documents={[unstructuredRoadmap, recoverableBacklog]}
        source={remoteReadOnly}
        projectSlug="code-project"
      />
    );

    const backlogArticle = screen.getByRole("heading", { level: 3, name: "Backlog document" }).closest("article");
    const roadmapArticle = screen.getByRole("heading", { level: 3, name: "Roadmap document" }).closest("article");
    expect(backlogArticle).not.toBeNull();
    expect(roadmapArticle).not.toBeNull();
    if (!backlogArticle || !roadmapArticle) return;

    expect(within(backlogArticle).getByText("Backlog draft")).toBeVisible();
    expect(within(backlogArticle).getByText(/INVALID_FIELD/)).toBeVisible();
    expect(within(backlogArticle).queryByRole("button", { name: "Copy repository-agent handoff" })).not.toBeInTheDocument();
    expect(within(roadmapArticle).getByRole("button", { name: "Copy repository-agent handoff" })).toBeEnabled();
  });

  it("keeps concise canonical health tied to fixed paths, revision, digests, read time, and exact authority", () => {
    render(
      <DocumentHealth
        documents={canonicalDocuments}
        source={{
          mode: "local-working-tree",
          writable: true,
          headRevision: "abc1234",
          roadmapDigest: "roadmap-digest",
          backlogDigest: "backlog-digest",
          readAt: "2026-08-30T00:00:00.000Z"
        }}
        projectSlug="code-project"
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Canonical/i);
    expect(screen.getByText("docs/ROADMAP.md")).toBeVisible();
    expect(screen.getByText("docs/BACKLOG.md")).toBeVisible();
    expect(screen.getAllByText("abc1234")).toHaveLength(2);
    expect(screen.getByText("roadmap-digest")).toBeVisible();
    expect(screen.getByText("backlog-digest")).toBeVisible();
    expect(screen.getByText("2026-08-30T00:00:00.000Z")).toBeVisible();
    expect(screen.getByText("Planning evidence only · no Backlog writes")).toBeVisible();
  });

  it("renders unavailable source coordinates and the known failure reason", () => {
    render(
      <DocumentHealth
        documents={[]}
        source={{
          mode: "cached",
          writable: false,
          reason: "Registered workspace is unavailable and no cache exists.",
          readAt: "2026-08-30T01:00:00.000Z"
        }}
        projectSlug="code-project"
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Source unavailable/i);
    expect(screen.getByText("docs/ROADMAP.md")).toBeVisible();
    expect(screen.getByText("docs/BACKLOG.md")).toBeVisible();
    expect(screen.getByText("2026-08-30T01:00:00.000Z")).toBeVisible();
    expect(screen.getByText("Registered workspace is unavailable and no cache exists.")).toBeVisible();
    expect(screen.getByText("Read only · copy handoff only")).toBeVisible();
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
        documents={[unstructuredRoadmap]}
        source={localReadOnly}
        projectSlug="code-project"
      />
    );

    const copyButton = screen.getByRole("button", { name: "Copy repository-agent handoff" });
    copyButton.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("Project: code-project");
    expect(writeText.mock.calls[0][0]).toContain("Document: docs/ROADMAP.md");
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
