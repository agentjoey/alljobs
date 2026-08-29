import { describe, expect, it } from "vitest";
import { buildRepoAgentBacklogProposal } from "./handoff";

describe("buildRepoAgentBacklogProposal", () => {
  it("creates a repository-owned proposal with source facts and required safeguards", () => {
    const proposal = buildRepoAgentBacklogProposal({
      projectSlug: "alljobs",
      title: "Clarify Backlog handoffs",
      problem: "New work needs a reviewed repository-owned Backlog item.",
      expectedOutcome: "A validated Backlog item is committed by the repository agent.",
      suggestedPhase: "phase-2",
      suggestedPriority: "P1",
      doneWhen: "The handoff is documented and tested.",
      notes: "Keep the proposed scope narrow.",
      headRevision: "015919a",
      backlogDigest: "a".repeat(64)
    });

    expect(proposal).toContain("# Backlog change proposal — alljobs");
    expect(proposal).toContain("Inspect the current code, architecture, ROADMAP, and BACKLOG.");
    expect(proposal).toContain("Confirm Phase, dependencies, priority, and Done When.");
    expect(proposal).toContain("Choose a stable item ID and edit docs/BACKLOG.md.");
    expect(proposal).toContain("Run the repository planning validation and report the diff and commit.");
    expect(proposal).toContain("HEAD revision: 015919a");
    expect(proposal).toContain(`Backlog digest: ${"a".repeat(64)}`);
    expect(proposal).not.toContain("AllJobs wrote");
  });
});
