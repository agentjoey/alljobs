import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortfolioOverview } from "./portfolio-overview";
import { ProjectList } from "./project-list";
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

  it("renders ProjectList with project card grid", () => {
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
