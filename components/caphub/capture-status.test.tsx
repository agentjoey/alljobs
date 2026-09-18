import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CaptureStatus } from "./capture-status";

afterEach(cleanup);

it.each(["created", "duplicate"] as const)("renders the %s public receipt with traceable metadata and required Human review", (kind) => {
  render(<CaptureStatus receipt={{
    kind,
    capture: {
      schema_version: 1,
      id: "cap_31f86a209ab84b72ad89f7f82d13e4c1",
      source: { kind: "web", original_filename: "a".repeat(251) + ".png", source_url: "https://example.com/untrusted" },
      note: "<script>untrusted notes are not receipt content</script>",
      mime_type: "image/png",
      object: { algorithm: "sha256", digest: "8f2a91d3" + "a".repeat(56), bytes: 1_048_576 },
      status: "received",
      human_review_required: true,
      created_at: "2026-09-15T08:42:19+08:00"
    }
  }} />);
  expect(screen.getByText(kind === "created" ? "Capture received" : "Duplicate — existing receipt returned")).toBeVisible();
  expect(screen.getByText("cap_31f86a209ab84b72ad89f7f82d13e4c1")).toBeVisible();
  expect(screen.getByText("a".repeat(251) + ".png")).toBeVisible();
  expect(screen.getByText("8f2a91d3…")).toBeVisible();
  expect(screen.getByText("received")).toBeVisible();
  expect(screen.getByText("Human review required")).toBeVisible();
  expect(document.querySelector("time")).toHaveAttribute("datetime", "2026-09-15T08:42:19+08:00");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("link",{name:"View analysis and results"})).toHaveAttribute("href","/caphub/captures/cap_31f86a209ab84b72ad89f7f82d13e4c1");
  expect(document.body).not.toHaveTextContent(/untrusted|sha256\//);
});

it("keeps the receipt area useful before any request", () => {
  render(<CaptureStatus receipt={null} />);
  expect(screen.getByRole("heading", { name: "Capture receipt" })).toBeVisible();
  expect(screen.getByText(/A receipt appears here after/)).toBeVisible();
  expect(screen.queryByText("Capture received")).not.toBeInTheDocument();
});
