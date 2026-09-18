import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewCenter } from "./review-center";
import { analysisStop, reviewDetail, reviewQueue } from "./test-fixtures";

describe("Review Center state matrix", () => {
  it("shows precise analysis stops before the docket with Capture navigation and no mutation controls", () => {
    const stop = analysisStop();
    const { container } = render(<ReviewCenter initialView={{ state: "ready", queue: reviewQueue(), detail: reviewDetail(), analysisStops: [stop] }} />);
    const panel = screen.getByRole("region", { name: "Analysis stops" });
    expect(within(panel).getByRole("heading", { name: "Analysis stops" })).toBeInTheDocument();
    expect(within(panel).getByText("DEEPSEEK_STRUCTURE_FAILED")).toBeInTheDocument();
    expect(within(panel).getByText(/schema structuring/i)).toBeInTheDocument();
    expect(within(panel).getByText("extraction")).toBeInTheDocument();
    expect(within(panel).getByText("caphub-analysis-v2")).toBeInTheDocument();
    expect(within(panel).getByText(stop.jobId)).toBeInTheDocument();
    expect(within(panel).getByText(stop.supersedesJobId)).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: stop.captureId })).toHaveAttribute("href", `/captures/${stop.captureId}`);
    expect(panel.querySelector("time")).toHaveAttribute("datetime", stop.stoppedAt);
    expect(panel.querySelector("form, button, input")).toBeNull();
    expect(screen.queryByRole("button", { name: /retry|rerun|analyze/i })).not.toBeInTheDocument();
    expect([...container.querySelectorAll("#analysis-stops, #docket")].map((node) => node.id)).toEqual(["analysis-stops", "docket"]);
  });

  it("keeps an explicit empty analysis stop state", () => {
    render(<ReviewCenter initialView={{ state: "ready", queue: reviewQueue(), detail: reviewDetail(), analysisStops: [] }} />);
    expect(screen.getByText("No analysis stops require attention")).toBeInTheDocument();
  });

  it.each([
    ["loading", "Loading the immutable review docket"],
    ["disabled", "Review Center is safe-off"],
    ["unavailable", "Review Center is unavailable"]
  ] as const)("renders the %s safe state", (state, text) => {
    render(<ReviewCenter initialView={{ state }} />);
    expect(screen.getByText(new RegExp(text, "i"))).toBeInTheDocument();
  });

  it("renders the docket, dossier, Diff, and decision in semantic order", () => {
    const { container } = render(<ReviewCenter initialView={{ state: "ready", queue: reviewQueue(), detail: reviewDetail(), analysisStops: [] }} />);
    expect(screen.getByRole("heading", { name: /Decide with the evidence/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Docket" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Browser Use Safety Layer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exact-version Diff" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decision ledger" })).toBeInTheDocument();
    expect([...container.querySelectorAll("#docket, #evidence, #diff, #decision")].map((node) => node.id)).toEqual(["docket", "evidence", "diff", "decision"]);
    expect(screen.getByLabelText("Full subject SHA-256 digest")).toHaveTextContent("3".repeat(64));
    expect(screen.getByText(/Value 4\/5 · Risk 3\/5/i)).toBeInTheDocument();
    expect(screen.getAllByText(/confirmed/i)).not.toHaveLength(0);
    expect(screen.getByRole("heading", { name: /Value, risk, and identity/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Alternatives and capability overlap/i })).toBeInTheDocument();
    expect(screen.getByText(/Manual review/i)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("dangerouslySetInnerHTML");
  });

  it("filters by kind, state, value, risk, and waiting age while naming every selection", () => {
    const queue = reviewQueue();
    queue.nextCursor = `rev_${"9".repeat(32)}`;
    render(<ReviewCenter initialView={{ state: "ready", queue, detail: reviewDetail(), analysisStops: [] }} />);
    expect(screen.getByLabelText(/Kind/i)).toHaveValue("all");
    expect(screen.getByLabelText(/State/i)).toHaveValue("all");
    expect(screen.getByLabelText(/^Value$/i)).toHaveValue("all");
    expect(screen.getByLabelText(/^Risk$/i)).toHaveValue("all");
    expect(screen.getByLabelText(/Waiting age/i)).toHaveValue("all");
    expect(screen.getByRole("button", { name: /Apply filters/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next 25 reviews/i })).toHaveAttribute("href", expect.stringContaining("cursor=rev_"));
  });

  it("distinguishes global empty from filtered empty", () => {
    const empty = reviewQueue();
    empty.items = [];
    const { unmount } = render(<ReviewCenter initialView={{ state: "ready", queue: empty, detail: { kind: "not_found" }, analysisStops: [] }} />);
    expect(screen.getByText(/No review requests exist/i)).toBeInTheDocument();
    unmount();
    empty.appliedFilters.reviewKind = "release";
    render(<ReviewCenter initialView={{ state: "ready", queue: empty, detail: { kind: "not_found" }, analysisStops: [] }} />);
    expect(screen.getByText(/No reviews match these filters/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Kind/i)).toHaveValue("release");
  });
});
