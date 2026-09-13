import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortfolioOverview } from "./portfolio-overview";
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
    expect(screen.queryByRole("tab", { name: /^Backlog/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-document-candidate]")).toHaveLength(0);
  });

  it("keeps read-only project sections while removing Backlog management entry points", () => {
    render(
      <ProjectDetail
        detail={{
          project: {
            slug: "retired-backlog-code",
            name: "Retired Backlog Code",
            type: "code",
            work_modes: ["implementation"],
            execution_locations: [],
            archived: false
          },
          roadmap: [{ id: "phase-1", title: "Canonical phase", kind: "phase", status: "active", order: 10 }],
          backlog: [{ id: "BL-001", title: "Read-only evidence", work_mode: "implementation", phase: "phase-1", status: "ready", priority: "P1", rank: 100, dependencies: [] }],
          tasks: [],
          issues: [],
          attention: [],
          provenance: [{ provider: "git", location: "docs/BACKLOG.md", revision: "abc1234", digest: "backlog-digest", fetchedAt: "2026-09-14T00:00:00.000Z" }],
          documents: [
            { document: "roadmap", state: "canonical", sourcePath: "docs/ROADMAP.md", diagnostics: [], candidates: [] },
            { document: "backlog", state: "canonical", sourcePath: "docs/BACKLOG.md", diagnostics: [], candidates: [] }
          ],
          planningSource: { mode: "local-working-tree", writable: true, headRevision: "abc1234", backlogDigest: "backlog-digest", readAt: "2026-09-14T00:00:00.000Z" },
          metrics: { activeTasks: 0, totalBacklog: 1, doneCount: 0, blockedCount: 0 },
          digest: "task-digest"
        }}
      />
    );

    expect(screen.getByRole("tab", { name: "Roadmap (1)" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Tasks (0)" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Provenance (1)" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: /^Backlog/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage ordering" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate proposal" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("tab", { name: /^Backlog/ })).not.toBeInTheDocument();
    unmount();

    render(<ProjectList projects={[detail]} />);
    expect(screen.getByText("Roadmap: Source unavailable")).toBeVisible();
    expect(screen.getByText("Backlog: Source unavailable")).toBeVisible();
    expect(screen.queryByText(/0 Backlog/)).not.toBeInTheDocument();
  });

  it("keeps no-triage cached Backlog evidence in Project List without exposing a Project Detail surface", () => {
    const detail = {
      project: {
        slug: "legacy-cache-code",
        name: "Legacy Cache Code",
        type: "code" as const,
        work_modes: ["implementation" as const],
        execution_locations: [],
        archived: false
      },
      roadmap: [{ id: "phase-1", title: "Retained phase", kind: "phase" as const, status: "active" as const, order: 10 }],
      backlog: [{ id: "BL-001", title: "Retained item", work_mode: "implementation" as const, phase: "phase-1", status: "ready" as const, priority: "P1" as const, rank: 100, dependencies: [] }],
      tasks: [],
      issues: [],
      attention: [],
      provenance: [],
      documents: [],
      planningSource: {
        mode: "cached" as const,
        writable: false,
        reason: "Legacy cache has no document triage.",
        readAt: "2026-08-30T00:00:00.000Z"
      },
      metrics: { activeTasks: 0, totalBacklog: 1, doneCount: 0, blockedCount: 0 },
      digest: "abc"
    };
    const { unmount } = render(<ProjectDetail detail={detail} />);

    expect(screen.getByRole("tab", { name: "Roadmap (Source unavailable)" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: /^Backlog/ })).not.toBeInTheDocument();
    unmount();

    render(<ProjectList projects={[detail]} />);
    expect(screen.getByText("Roadmap: Source unavailable")).toBeVisible();
    expect(screen.getByText("Backlog: Source unavailable")).toBeVisible();
    expect(screen.queryByText(/Backlog: 1/)).not.toBeInTheDocument();
  });

  it("uses canonical-empty Roadmap wording without claiming that a source document is absent", () => {
    render(<RoadmapView items={[]} isCodeProject />);
    expect(screen.getByText("No canonical phases currently available")).toBeVisible();
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
