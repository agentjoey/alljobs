import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ManifestDiff } from "./manifest-diff";

describe("ManifestDiff", () => {
  it("renders actions and paths with bounded hunks", () => {
    render(<ManifestDiff label="Neutral package diff" entries={[
      { path: "packages/tool/1.0.0/instructions.md", action: "update", hunks: "-old\n+new" },
      { path: "packages/tool/1.0.0/policies.md", action: "delete", hunks: "" }
    ]} />);
    expect(screen.getByRole("list", { name: "Neutral package diff" })).toBeInTheDocument();
    expect(screen.getByText("packages/tool/1.0.0/instructions.md")).toBeInTheDocument();
    expect(screen.getByText("update")).toBeInTheDocument();
    expect(screen.getByText("delete")).toBeInTheDocument();
    expect(screen.queryByText(/diff display bounded/)).toBeNull();
  });

  it("bounds oversized hunks for display", () => {
    render(<ManifestDiff label="Bounded" entries={[
      { path: "big.md", action: "create", hunks: `+${"x".repeat(10_000)}` }
    ]} />);
    expect(screen.getByText(/diff display bounded/)).toBeInTheDocument();
  });

  it("renders an explicit empty state", () => {
    render(<ManifestDiff label="Empty" entries={[]} />);
    expect(screen.getByText(/No file-level differences/)).toBeInTheDocument();
  });
});
