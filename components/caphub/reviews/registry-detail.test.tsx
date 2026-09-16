import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapabilityRegistryDetail, CaptureRegistryDetail } from "./registry-detail";
import { capabilityDetail, captureDetail } from "./test-fixtures";

describe("Registry detail surfaces", () => {
  it("renders Capture lineage and safe model metadata without storage internals", () => {
    const { container } = render(<CaptureRegistryDetail view={captureDetail} />);
    expect(screen.getByRole("heading", { name: /Trace the decision back/i })).toBeInTheDocument();
    expect(screen.getByText(/kimi · k3-256k/i)).toBeInTheDocument();
    expect(container.textContent).toMatch(/withheld/i);
    expect(container.textContent).not.toMatch(/private\/|api[_-]?key\s*[:=]|postgres(?:ql)?:\/\//i);
  });

  it("renders Candidate-only future states honestly", () => {
    render(<CapabilityRegistryDetail view={capabilityDetail} />);
    expect(screen.getByRole("heading", { name: /not a released capability/i })).toBeInTheDocument();
    expect(screen.getByText("No BuildProposal")).toBeInTheDocument();
    expect(screen.getByText("No Release")).toBeInTheDocument();
    expect(screen.getByText("No Deployment or Usage")).toBeInTheDocument();
  });

  it("renders generic not-found states", () => {
    const { rerender } = render(<CaptureRegistryDetail view={{ kind: "not_found" }} />);
    expect(screen.getByText("Capture not found")).toBeInTheDocument();
    rerender(<CapabilityRegistryDetail view={{ kind: "not_found" }} />);
    expect(screen.getByText("Capability Candidate not found")).toBeInTheDocument();
  });
});
