import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapabilityRegistryDetail, CaptureRegistryDetail } from "./registry-detail";
import { capabilityDetail, captureDetail } from "./test-fixtures";

describe("Registry detail surfaces", () => {
  it("renders Capture lineage and safe model metadata without storage internals", () => {
    const { container } = render(<CaptureRegistryDetail view={captureDetail} />);
    expect(screen.getByRole("heading", { name: /Trace the decision back/i })).toBeInTheDocument();
    expect(screen.getByText(/kimi · k3-256k/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ordered OCR" })).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.tagName === "LI" && element.textContent?.includes("Browser Use Safety Layer") === true)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Entities, Claims, and source checks/i })).toBeInTheDocument();
    expect(screen.getByText(/ReviewPacket v1/i)).toBeInTheDocument();
    expect(screen.getByText(/Registry import/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decision timeline" })).toBeInTheDocument();
    expect(container.textContent).toMatch(/withheld/i);
    expect(container.textContent).not.toMatch(/private\/|api[_-]?key\s*[:=]|postgres(?:ql)?:\/\//i);
  });

  it("renders Candidate-only future states honestly", () => {
    render(<CapabilityRegistryDetail view={capabilityDetail} />);
    expect(screen.getByRole("heading", { name: /not a released capability/i })).toBeInTheDocument();
    expect(screen.getByText("No BuildProposal")).toBeInTheDocument();
    expect(screen.getByText("No Release")).toBeInTheDocument();
    expect(screen.getByText("No Deployment or Usage")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Versions and relationships/i })).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.tagName === "P" && element.textContent?.startsWith("Version 1 ·") === true)).toBeInTheDocument();
  });

  it("names partial Capture and stale Candidate states instead of inventing data", () => {
    if (captureDetail.kind !== "found" || capabilityDetail.kind !== "found") throw new Error("invalid fixtures");
    const { rerender } = render(<CaptureRegistryDetail view={{ ...captureDetail, analysisState: "partial", packetVersion: null, packetDigest: null, registryImport: null, decisions: [] }} />);
    expect(screen.getByText(/Partial analysis · ReviewPacket not available/i)).toBeInTheDocument();
    rerender(<CapabilityRegistryDetail view={{ ...capabilityDetail, currentVersion: 2, staleVersion: true }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/binds v1, not current v2/i);
  });

  it("renders generic not-found states", () => {
    const { rerender } = render(<CaptureRegistryDetail view={{ kind: "not_found" }} />);
    expect(screen.getByText("Capture not found")).toBeInTheDocument();
    rerender(<CapabilityRegistryDetail view={{ kind: "not_found" }} />);
    expect(screen.getByText("Capability Candidate not found")).toBeInTheDocument();
  });
});
