import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PortfolioOverview } from "./portfolio-overview";
import { BacklogView } from "./backlog-view";
import { ProjectDetail } from "./project-detail";
import { ProjectList } from "./project-list";
import { RoadmapView } from "./roadmap-view";
import { SourceStatus } from "./source-status";

describe("planning UI components", () => {
  it("renders PortfolioOverview with KPI metrics and ongoing queue", () => {
    render(
      <PortfolioOverview
        data={{
          projects: [],
          ongoingTasks: [
            {
              id: "AJ-T-001",
              title: "Write documentation",
              project: "alljobs",
              status: "doing",
              source: { provider: "native" }
            }
          ],
          attentionItems: [
            {
              id: "att-1",
              type: "blocked_task",
              severity: "critical",
              project: "alljobs",
              title: "Blocked Task",
              message: "Waiting on external key"
            }
          ],
          kpis: {
            activeProjects: 2,
            ongoingWork: 1,
            attentionRequired: 1,
            completedRecent: 5
          }
        }}
      />
    );

    expect(screen.getByText("Personal Workbench")).toBeInTheDocument();
    expect(screen.getByText("Active Projects")).toBeInTheDocument();
    expect(screen.getByText("Write documentation")).toBeInTheDocument();
    expect(screen.getByText("Blocked Task")).toBeInTheDocument();
  });

  it("renders ProjectList with a compact non-color-only planning health label", () => {
    render(
      <ProjectList
        projects={[
          {
            project: {
              slug: "alljobs",
              name: "AllJobs",
              type: "code",
              work_modes: ["implementation"],
              execution_locations: [],
              archived: false
            },
            roadmap: [{ id: "phase-1", title: "Planning Core", kind: "phase", status: "active", order: 10 }],
            backlog: [],
            tasks: [],
            issues: [],
            attention: [],
            provenance: [],
            documents: [
              {
                document: "roadmap",
                state: "canonical",
                sourcePath: "docs/ROADMAP.md",
                diagnostics: [],
                candidates: []
              },
              {
                document: "backlog",
                state: "missing",
                sourcePath: "docs/BACKLOG.md",
                diagnostics: [],
                candidates: []
              }
            ],
            planningSource: {
              mode: "local-working-tree",
              writable: false,
              readAt: "2026-08-30T00:00:00.000Z"
            },
            metrics: { activeTasks: 3, totalBacklog: 4, doneCount: 1, blockedCount: 0 },
            digest: "abc"
          }
        ]}
      />
    );

    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("AllJobs")).toBeInTheDocument();
    expect(screen.getByText("Active: Planning Core")).toBeInTheDocument();
    expect(screen.getByText("REPO: GIT-MIRROR")).toBeInTheDocument();
    expect(screen.getByText("Planning docs: 1 missing")).toBeVisible();
    expect(screen.getByText("Backlog: Missing document")).toBeVisible();
    expect(screen.queryByText("4 Backlog")).not.toBeInTheDocument();
  });

  it("places document health above the Project tabs and replaces a missing count with state text", () => {
    const { container } = render(
      <ProjectDetail
        detail={{
          project: {
            slug: "alljobs",
            name: "AllJobs",
            type: "code",
            work_modes: ["implementation"],
            execution_locations: [],
            archived: false
          },
          roadmap: [{ id: "phase-1", title: "Planning Core", kind: "phase", status: "active", order: 10 }],
          backlog: [],
          tasks: [],
          issues: [],
          attention: [],
          provenance: [],
          documents: [
            {
              document: "roadmap",
              state: "canonical",
              sourcePath: "docs/ROADMAP.md",
              diagnostics: [],
              candidates: []
            },
            {
              document: "backlog",
              state: "missing",
              sourcePath: "docs/BACKLOG.md",
              diagnostics: [],
              candidates: []
            }
          ],
          planningSource: {
            mode: "local-working-tree",
            writable: false,
            readAt: "2026-08-30T00:00:00.000Z"
          },
          metrics: { activeTasks: 0, totalBacklog: 0, doneCount: 0, blockedCount: 0 },
          digest: "abc"
        }}
      />
    );

    const health = screen.getByRole("region", { name: "Planning document health" });
    const tabs = screen.getByRole("tablist", { name: "Project sections" });
    expect(health.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Roadmap (1)" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Backlog (Missing document)" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Backlog (0)" })).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-document-candidate]")).toHaveLength(0);
  });

  it("replaces unavailable Roadmap and Backlog counts in Project Detail and Project List", () => {
    const unavailableDocuments = [
      {
        document: "roadmap" as const,
        state: "unavailable" as const,
        sourcePath: "docs/ROADMAP.md",
        diagnostics: [],
        candidates: []
      },
      {
        document: "backlog" as const,
        state: "unavailable" as const,
        sourcePath: "docs/BACKLOG.md",
        diagnostics: [],
        candidates: []
      }
    ];
    const detail = {
      project: {
        slug: "offline-code",
        name: "Offline Code",
        type: "code" as const,
        work_modes: ["implementation" as const],
        execution_locations: [],
        archived: false
      },
      roadmap: [],
      backlog: [],
      tasks: [],
      issues: [],
      attention: [],
      provenance: [],
      documents: unavailableDocuments,
      planningSource: {
        mode: "cached" as const,
        writable: false,
        reason: "No source is available.",
        readAt: "2026-08-30T00:00:00.000Z"
      },
      metrics: { activeTasks: 0, totalBacklog: 0, doneCount: 0, blockedCount: 0 },
      digest: "abc"
    };
    const { unmount } = render(<ProjectDetail detail={detail} />);

    expect(screen.getByRole("tab", { name: "Roadmap (Source unavailable)" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Backlog (Source unavailable)" })).toBeVisible();
    unmount();

    render(<ProjectList projects={[detail]} />);
    expect(screen.getByText("Roadmap: Source unavailable")).toBeVisible();
    expect(screen.getByText("Backlog: Source unavailable")).toBeVisible();
    expect(screen.queryByText(/0 Backlog/)).not.toBeInTheDocument();
  });

  it("withholds Manage ordering for a degraded Backlog while retaining canonical siblings", async () => {
    const user = userEvent.setup();
    render(
      <ProjectDetail
        detail={{
          project: {
            slug: "degraded-code",
            name: "Degraded Code",
            type: "code",
            work_modes: ["implementation"],
            execution_locations: [],
            archived: false
          },
          roadmap: [{ id: "phase-1", title: "Canonical phase", kind: "phase", status: "active", order: 10 }],
          backlog: [{ id: "BL-001", title: "Canonical sibling", work_mode: "implementation", phase: "phase-1", status: "ready", priority: "P1", rank: 100, dependencies: [] }],
          tasks: [],
          issues: [],
          attention: [],
          provenance: [],
          documents: [
            { document: "roadmap", state: "canonical", sourcePath: "docs/ROADMAP.md", diagnostics: [], candidates: [] },
            {
              document: "backlog",
              state: "recoverable",
              sourcePath: "docs/BACKLOG.md",
              diagnostics: [{ scope: "object", code: "INVALID_FIELD", sourcePath: "docs/BACKLOG.md", objectId: "BL-BAD", message: "Priority is invalid." }],
              candidates: [{ heading: "Malformed sibling", line: 12, evidence: "## BL-BAD: Malformed sibling", confidence: "recognized", missingCanonicalFields: ["priority"] }]
            }
          ],
          planningSource: { mode: "local-working-tree", writable: false, reason: "Local planning source has validation issues.", readAt: "2026-08-30T00:00:00.000Z" },
          backlogControl: {
            source: { mode: "local-working-tree", writable: false, reason: "Local planning source has validation issues.", readAt: "2026-08-30T00:00:00.000Z" },
            ordering: "initialized",
            conflictLanes: [],
            writable: false,
            blockers: [{ code: "BACKLOG_DOCUMENT_NOT_CANONICAL", message: "Backlog control is unavailable while docs/BACKLOG.md is recoverable." }]
          },
          metrics: { activeTasks: 0, totalBacklog: 1, doneCount: 0, blockedCount: 0 },
          digest: "abc"
        }}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Backlog (1)" }));
    expect(screen.getByText("Canonical sibling")).toBeVisible();
    expect(screen.getByText(/Backlog control is unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Manage ordering" })).not.toBeInTheDocument();
  });

  it("uses canonical-empty wording without claiming that a source document is absent", () => {
    const { rerender } = render(<RoadmapView items={[]} isCodeProject />);
    expect(screen.getByText("No canonical phases currently available")).toBeVisible();
    expect(screen.queryByText(/missing document/i)).not.toBeInTheDocument();

    rerender(<BacklogView items={[]} projectSlug="alljobs" />);
    expect(screen.getByText("No canonical backlog items currently available")).toBeVisible();
    expect(screen.queryByText(/missing document/i)).not.toBeInTheDocument();
  });

  it("renders SourceStatus with amber provenance bar", () => {
    render(
      <SourceStatus
        routePath="/projects/alljobs"
        custody="REPO: GIT-MIRROR"
        revision="6656480d19"
        freshness="fresh"
        source={{ mode: "local-working-tree", writable: true, backlogModified: true, readAt: "2026-08-29T00:00:00.000Z" }}
      />
    );

    expect(screen.getByText("/projects/alljobs")).toBeInTheDocument();
    expect(screen.getByText("REPO: GIT-MIRROR")).toBeInTheDocument();
    expect(screen.getByText("FRESH")).toBeInTheDocument();
    expect(screen.getByText("LOCAL WORKING TREE · MODIFIED")).toBeInTheDocument();
  });
});
