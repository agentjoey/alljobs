import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BacklogProposalForm } from "./backlog-proposal-form";

describe("BacklogProposalForm", () => {
  it("validates the required request fields, then generates and copies a repository-agent handoff", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    render(
      <BacklogProposalForm
        projectSlug="alljobs"
        source={{
          mode: "local-working-tree",
          writable: true,
          headRevision: "015919a",
          backlogDigest: "a".repeat(64),
          readAt: "2026-08-29T00:00:00.000Z"
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Generate proposal" }));
    expect(screen.getByText("Title is required.")).toBeVisible();
    expect(screen.getByText("Problem is required.")).toBeVisible();
    expect(screen.getByText("Expected outcome is required.")).toBeVisible();

    await user.type(screen.getByLabelText("Title"), "Clarify Backlog handoffs");
    await user.type(screen.getByLabelText("Problem"), "New work needs a repository-owned Backlog item.");
    await user.type(screen.getByLabelText("Expected outcome"), "A validated Backlog item is committed.");
    await user.click(screen.getByRole("button", { name: "Generate proposal" }));

    expect((screen.getByRole("textbox", { name: "Repository-agent proposal" }) as HTMLTextAreaElement).value).toContain(
      "# Backlog change proposal — alljobs"
    );
    expect(screen.getByText("HEAD revision: 015919a")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Copy proposal" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Clarify Backlog handoffs"));
    expect(screen.getByRole("status")).toHaveTextContent("Proposal copied to clipboard.");
  });
});
