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

describe("combined lifecycle states (acceptance fix 7)", () => {
  function exportViewFixture(overrides: Record<string, unknown> = {}) {
    return {
      kind: "ready",
      candidateId: capabilityDetail.kind === "found" ? capabilityDetail.candidateId : `cand_${"2".repeat(32)}`,
      release: {
        recordId: `rel_${"1".repeat(32)}`,
        version: 1,
        digest: "a".repeat(64),
        packageDigest: "b".repeat(64),
        slug: "browser-use-safety",
        title: "Browser Use Safety Layer",
        semver: "1.0.0",
        state: "waiting",
        reviewState: "WAITING_FOR_REVIEW"
      },
      packageManifest: { fileCount: 5, manifestDigest: "c".repeat(64) },
      adapters: [],
      obsidian: { state: "unavailable", conflicts: [] },
      deployment: { plans: [], history: [], activePointer: null },
      ...overrides
    } as never;
  }

  it("release-bound state shows no candidate-only or deployment contradictions", () => {
    const { container } = render(<CapabilityRegistryDetail view={capabilityDetail} exportView={exportViewFixture()} />);
    expect(screen.getByRole("heading", { name: "A Release candidate binds this capability." })).toBeInTheDocument();
    expect(screen.getByText("No deployment recorded yet")).toBeInTheDocument();
    expect(screen.getByText(/browser-use-safety · v1.0.0/)).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).not.toContain("not a released capability");
    expect(text).not.toContain("No Release");
    expect(text).not.toContain("No Deployment or Usage");
  });

  it("deployed state shows the active pointer and no missing-artifact copy", () => {
    const base = exportViewFixture() as { release: Record<string, unknown> } & Record<string, unknown>;
    const deployedView = {
      ...base,
      release: { ...base.release, state: "approved_finalized" },
      deployment: {
        plans: [],
        history: [{
          deploymentId: `dep_${"4".repeat(32)}`,
          action: "publish",
          targetAlias: "codex-primary",
          releaseVersion: 1,
          createdAt: "2026-09-16T13:00:00.000Z"
        }],
        activePointer: {
          deploymentId: `dep_${"4".repeat(32)}`,
          releaseId: `rel_${"1".repeat(32)}`,
          releaseVersion: 1,
          pointerDigest: "a1".repeat(32)
        }
      }
    };
    const { container } = render(<CapabilityRegistryDetail view={capabilityDetail} exportView={deployedView as never} />);
    expect(screen.getByRole("heading", { name: "Deployed and reviewable end to end." })).toBeInTheDocument();
    expect(screen.getByText("Active deployment")).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).not.toContain("not a released capability");
    expect(text).not.toContain("No Release");
    expect(text).not.toContain("No Deployment or Usage");
    expect(text).not.toContain("No deployment recorded yet");
  });

  it("candidate-only state keeps the honest P3 copy when no export state exists", () => {
    render(<CapabilityRegistryDetail view={capabilityDetail} />);
    expect(screen.getByRole("heading", { name: /not a released capability/i })).toBeInTheDocument();
    expect(screen.getByText("No Release")).toBeInTheDocument();
  });
});
