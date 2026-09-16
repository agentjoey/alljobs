import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewCenter } from "./review-center";
import { reviewDetail, reviewQueue } from "./test-fixtures";

describe("Review Center state matrix", () => {
  it.each([
    ["loading", "Loading the immutable review docket"],
    ["disabled", "Review Center is safe-off"],
    ["unavailable", "Review Center is unavailable"]
  ] as const)("renders the %s safe state", (state, text) => {
    render(<ReviewCenter initialView={{ state }} />);
    expect(screen.getByText(new RegExp(text, "i"))).toBeInTheDocument();
  });

  it("renders the docket, dossier, Diff, and decision in semantic order", () => {
    const { container } = render(<ReviewCenter initialView={{ state: "ready", queue: reviewQueue(), detail: reviewDetail() }} />);
    expect(screen.getByRole("heading", { name: /Decide with the evidence/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Docket" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Browser Use Safety Layer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exact-version Diff" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decision ledger" })).toBeInTheDocument();
    expect([...container.querySelectorAll("#docket, #evidence, #diff, #decision")].map((node) => node.id)).toEqual(["docket", "evidence", "diff", "decision"]);
    expect(screen.getByLabelText("Full subject SHA-256 digest")).toHaveTextContent("3".repeat(64));
    expect(container.innerHTML).not.toContain("dangerouslySetInnerHTML");
  });

  it("distinguishes global empty from filtered empty", () => {
    const empty = reviewQueue();
    empty.items = [];
    const { rerender } = render(<ReviewCenter initialView={{ state: "ready", queue: empty, detail: { kind: "not_found" } }} />);
    expect(screen.getByText(/No review requests exist/i)).toBeInTheDocument();
    rerender(<ReviewCenter initialView={{ state: "ready", queue: reviewQueue(), detail: reviewDetail() }} />);
    fireEvent.change(screen.getByLabelText(/Kind/i), { target: { value: "release" } });
    expect(screen.getByText(/No reviews match these filters/i)).toBeInTheDocument();
  });
});
