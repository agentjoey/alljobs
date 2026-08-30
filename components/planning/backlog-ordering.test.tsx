import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BacklogItem } from "@/lib/planning/domain/types";
import type { BacklogControlState } from "@/lib/planning/queries/project";

const mocks = vi.hoisted(() => ({
  propose: vi.fn(),
  apply: vi.fn(),
  refresh: vi.fn()
}));

vi.mock("@/app/actions/backlog", () => ({
  proposeBacklogOrderingAction: mocks.propose,
  applyBacklogOrderingAction: mocks.apply
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { BacklogView } from "./backlog-view";
import { SourceStatus } from "./source-status";

const digest = "a".repeat(64);

const rankedItems: BacklogItem[] = [
  { id: "AJ-B-003", title: "Third priority item", work_mode: "implementation", phase: "delivery", status: "ready", priority: "P1", rank: 100, dependencies: [] },
  { id: "AJ-B-002", title: "Second priority item", work_mode: "implementation", phase: "delivery", status: "ready", priority: "P1", rank: 200, dependencies: [] },
  { id: "AJ-B-001", title: "Critical item", work_mode: "implementation", phase: "delivery", status: "ready", priority: "P0", rank: 100, dependencies: [] },
  { id: "AJ-B-004", title: "Completed item", work_mode: "implementation", phase: "delivery", status: "done", priority: "P0", rank: 200, dependencies: [] }
];

function control(overrides: Partial<BacklogControlState> = {}): BacklogControlState {
  return {
    source: { mode: "local-working-tree", writable: true, headRevision: "5466c33", backlogDigest: digest, backlogModified: true, readAt: "2026-08-29T00:00:00.000Z" },
    ordering: "initialized",
    conflictLanes: [],
    writable: true,
    blockers: [],
    ...overrides
  };
}

function reviewedProposal() {
  return {
    projectSlug: "alljobs",
    intent: { kind: "move", itemId: "AJ-B-002", targetPriority: "P1", beforeId: "AJ-B-003" } as const,
    expectedFileDigest: digest,
    headRevision: "5466c33",
    backlogModified: true,
    sourceMode: "local-working-tree" as const,
    changes: [{ itemId: "AJ-B-002", priority: "P1" as const, rank: 100 }],
    renumbered: false,
    diff: "alljobs AJ-B-002: priority P1 -> P1; rank 200 -> 100",
    proposalDigest: "b".repeat(64)
  };
}

describe("Backlog ordering UI", () => {
  beforeEach(() => {
    mocks.propose.mockReset();
    mocks.apply.mockReset();
    mocks.refresh.mockReset();
  });

  it("groups active cards by Phase, Priority, then Rank and folds history", () => {
    render(<BacklogView items={rankedItems} projectSlug="alljobs" control={control()} />);

    expect(screen.getByRole("region", { name: "Phase delivery" })).toBeVisible();
    const activeCards = within(screen.getByRole("region", { name: "Phase delivery" })).getAllByTestId("backlog-card");
    expect(activeCards.map(card => card.getAttribute("data-item-id"))).toEqual(["AJ-B-001", "AJ-B-003", "AJ-B-002"]);
    expect(screen.getByText("History (1)")).toBeVisible();
  });

  it("labels an authoritative local source and disables ordering for read-only sources", () => {
    render(
      <>
        <SourceStatus
          routePath="/projects/alljobs"
          custody="REPO: GIT-MIRROR"
          source={control().source}
        />
        <BacklogView
          items={rankedItems}
          projectSlug="alljobs"
          control={control({
            source: { ...control().source, mode: "cached", writable: false, reason: "Cached projection only" },
            writable: false,
            blockers: [{ code: "SOURCE_NOT_WRITABLE", message: "Cached projection only" }]
          })}
        />
      </>
    );

    expect(screen.getByText("LOCAL WORKING TREE · MODIFIED")).toBeVisible();
    expect(screen.getByRole("button", { name: "Manage ordering" })).toBeDisabled();
    expect(screen.getByText("Cached projection only")).toBeVisible();
  });

  it("keeps keyboard ordering page-local until the owner reviews it", async () => {
    const user = userEvent.setup();
    mocks.propose.mockResolvedValue({ status: "success", data: reviewedProposal(), message: "Backlog ordering proposal prepared" });
    render(<BacklogView items={rankedItems} projectSlug="alljobs" control={control()} />);

    await user.click(screen.getByRole("button", { name: "Manage ordering" }));
    await user.click(screen.getByRole("button", { name: "Move AJ-B-002 up" }));
    expect(screen.getByText("1 item changed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Review changes" }));

    expect(await screen.findByRole("region", { name: "Proposal review" })).toBeVisible();
    expect(screen.getByRole("listitem")).toHaveTextContent(/AJ-B-002\s*priority P1 → P1\s*rank 200 → 100/);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("allows a priority-only draft before ranks are initialized and can discard it", async () => {
    const user = userEvent.setup();
    render(
      <BacklogView
        items={rankedItems.map(item => item.status === "done" ? item : { ...item, rank: undefined })}
        projectSlug="alljobs"
        control={control({ ordering: "uninitialized" })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Manage ordering" }));
    expect(screen.getByRole("button", { name: "Move AJ-B-002 up" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Change priority for AJ-B-002"), "P0");
    expect(screen.getByText("1 item changed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("heading", { name: "Manage ordering" })).toBeVisible();
  });

  it("repairs the duplicate-rank lane instead of the first active lane", async () => {
    const user = userEvent.setup();
    const conflictingItems: BacklogItem[] = [
      { ...rankedItems[2], id: "AJ-B-001", phase: "phase-1", priority: "P0", rank: 100 },
      { ...rankedItems[0], id: "AJ-B-002", phase: "phase-2", priority: "P1", rank: 100 },
      { ...rankedItems[1], id: "AJ-B-003", phase: "phase-2", priority: "P1", rank: 100 }
    ];
    mocks.propose.mockResolvedValue({ status: "error", code: "STOP", message: "Captured intent" });
    render(
      <BacklogView
        items={conflictingItems}
        projectSlug="alljobs"
        control={control({
          ordering: "repair-required",
          conflictLanes: [{ phase: "phase-2", priority: "P1", itemIds: ["AJ-B-002", "AJ-B-003"] }]
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Manage ordering" }));
    expect(screen.queryByRole("button", { name: /phase-1 \/ P0/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Repair phase-2 / P1 ordering" }));
    await user.click(screen.getByRole("button", { name: "Review changes" }));

    expect(mocks.propose).toHaveBeenCalledWith({
      projectSlug: "alljobs",
      intent: { kind: "repair", phase: "phase-2", priority: "P1" }
    });
  });

  it("keeps a recoverable editor error when proposal preparation throws", async () => {
    const user = userEvent.setup();
    mocks.propose.mockRejectedValue(new Error("Control Host unavailable"));
    render(<BacklogView items={rankedItems} projectSlug="alljobs" control={control()} />);

    await user.click(screen.getByRole("button", { name: "Manage ordering" }));
    await user.click(screen.getByRole("button", { name: "Move AJ-B-002 up" }));
    await user.click(screen.getByRole("button", { name: "Review changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("PROPOSE_ERROR");
    expect(screen.getByRole("button", { name: "Back to draft" })).toBeVisible();
  });

  it("disables duplicate Apply and keeps the stale intent summary visible", async () => {
    const user = userEvent.setup();
    mocks.propose.mockResolvedValue({ status: "success", data: reviewedProposal(), message: "Backlog ordering proposal prepared" });
    let finishApply: ((value: unknown) => void) | undefined;
    mocks.apply.mockImplementation(() => new Promise(resolve => { finishApply = resolve; }));
    render(<BacklogView items={rankedItems} projectSlug="alljobs" control={control()} />);

    await user.click(screen.getByRole("button", { name: "Manage ordering" }));
    await user.click(screen.getByRole("button", { name: "Move AJ-B-002 up" }));
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    await user.click(await screen.findByRole("button", { name: "Confirm and apply" }));
    expect(screen.getByRole("button", { name: "Applying changes" })).toBeDisabled();
    expect(mocks.apply).toHaveBeenCalledTimes(1);

    finishApply?.({ status: "error", code: "STALE_WRITE", message: "Backlog changed after review; no write was made." });
    expect(await screen.findByText("Prior intent (reference only)")).toBeVisible();
    expect(screen.getByText(/Move AJ-B-002/)).toBeVisible();
  });

  it("keeps controls visible when reduced motion is requested", () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({ matches: query === "(prefers-reduced-motion: reduce)", addListener: vi.fn(), removeListener: vi.fn() }));
    render(<BacklogView items={rankedItems} projectSlug="alljobs" control={control()} />);
    expect(screen.getByRole("button", { name: "Manage ordering" })).toBeVisible();
  });
});
