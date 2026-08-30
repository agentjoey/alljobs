import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  propose: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/planning/backlog/mutations", () => ({
  proposeBacklogOrderingChange: mocks.propose
}));

import * as backlogActions from "./backlog";

const { proposeBacklogOrderingAction } = backlogActions;

const digest = "a".repeat(64);

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    projectSlug: "code-proj",
    intent: { kind: "initialize" },
    expectedFileDigest: digest,
    headRevision: "abc1234",
    backlogModified: true,
    sourceMode: "local-working-tree",
    changes: [{ itemId: "AJ-B-001", priority: "P0", rank: 100 }],
    renumbered: false,
    diff: "code-proj AJ-B-001: priority P1 -> P0; rank 200 -> 100",
    proposalDigest: digest,
    ...overrides
  };
}

describe("backlog ordering actions", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset();
    mocks.propose.mockReset();
  });

  it.each([
    ["malformed project slug", { projectSlug: "../code-proj", intent: { kind: "initialize" } }],
    ["unknown intent kind", { projectSlug: "code-proj", intent: { kind: "delete-item" } }],
    ["both move neighbours", {
      projectSlug: "code-proj",
      intent: { kind: "move", itemId: "AJ-B-001", targetPriority: "P0", beforeId: "AJ-B-002", afterId: "AJ-B-003" }
    }],
    ["path-like item id", {
      projectSlug: "code-proj",
      intent: { kind: "change-priority", itemId: "../AJ-B-001", targetPriority: "P0" }
    }],
    ["raw Markdown property", { projectSlug: "code-proj", markdown: "# Backlog", intent: { kind: "initialize" } }]
  ])("rejects %s without preparing a proposal", async (_label, input) => {
    const result = await proposeBacklogOrderingAction(input);

    expect(result).toMatchObject({ status: "error", code: "INVALID_INPUT" });
    expect(mocks.propose).not.toHaveBeenCalled();
  });

  it("does not expose a direct-apply Server Action", () => {
    expect(backlogActions).not.toHaveProperty("applyBacklogOrderingAction");
  });

  it("returns the proposal without source Markdown", async () => {
    const reviewed = proposal();
    mocks.propose.mockResolvedValue({ ok: true, proposal: reviewed });

    const result = await proposeBacklogOrderingAction({
      projectSlug: "code-proj",
      intent: { kind: "initialize" }
    });

    expect(result).toEqual({ status: "success", data: reviewed, message: "Backlog ordering proposal prepared" });
    expect(mocks.propose).toHaveBeenCalledWith({ projectSlug: "code-proj", intent: { kind: "initialize" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a generic message for an unexpected proposal failure", async () => {
    mocks.propose.mockRejectedValue(new Error("/private/control-host/repos/code-proj is unavailable"));

    const result = await proposeBacklogOrderingAction({
      projectSlug: "code-proj",
      intent: { kind: "initialize" }
    });

    expect(result).toEqual({
      status: "error",
      code: "PROPOSE_ERROR",
      message: "Failed to prepare the change proposal",
      fieldErrors: undefined
    });
  });

});
