import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CapabilityExportDto } from "@/lib/caphub/registry/queries";
import { CapabilityExportPanel } from "./capability-export";

const RELEASE = {
  recordId: `rel_${"1".repeat(32)}`,
  version: 1,
  digest: "a".repeat(64),
  packageDigest: "b".repeat(64),
  slug: "pdf-table-extract",
  title: "PDF Table Extraction",
  semver: "1.0.0",
  state: "approved_finalized" as const,
  reviewState: "APPROVED" as const
};

function readyView(overrides: Record<string, unknown> = {}): CapabilityExportDto {
  return {
    kind: "ready",
    candidateId: `cand_${"2".repeat(32)}`,
    release: RELEASE,
    packageManifest: { fileCount: 5, manifestDigest: "c".repeat(64) },
    adapters: [
      { target: "codex", state: "supported", manifestDigest: "d".repeat(64), diagnostics: [] },
      { target: "claude", state: "supported", manifestDigest: "e".repeat(64), diagnostics: [] },
      { target: "hermes", state: "unsupported", manifestDigest: null, diagnostics: ["hermes adapter cannot represent license \"GPL-3.0\" safely"] }
    ],
    obsidian: { state: "conflict", conflicts: [{ path: "Caphub/20 Capabilities/pdf-table-extract.md", reason: "existing file is not owned by Caphub" }] },
    deployment: {
      plans: [{
        planId: `dpl_${"3".repeat(32)}`,
        version: 1,
        digest: "f".repeat(64),
        action: "publish",
        target: "codex",
        targetAlias: "codex-primary",
        reviewState: "APPROVED",
        decisionConsumed: false,
        createdAt: "2026-09-16T13:00:00.000Z"
      }],
      history: [{
        deploymentId: `dep_${"4".repeat(32)}`,
        action: "publish",
        targetAlias: "codex-primary",
        releaseVersion: 1,
        createdAt: "2026-09-16T13:00:00.000Z"
      }],
      activePointer: {
        deploymentId: `dep_${"4".repeat(32)}`,
        releaseId: RELEASE.recordId,
        releaseVersion: 1,
        pointerDigest: "a1".repeat(32)
      }
    },
    ...overrides
  } as CapabilityExportDto;
}

describe("CapabilityExportPanel", () => {
  it("explains the disabled state without roots or secrets", () => {
    const { container } = render(<CapabilityExportPanel view={{ kind: "disabled" }} />);
    expect(screen.getByRole("heading", { name: "Exports are safe-off" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\/Users\/|\/private\/tmp/);
  });

  it("explains eligible dispositions when no release exists", () => {
    render(<CapabilityExportPanel view={{ kind: "no_release", candidateId: `cand_${"2".repeat(32)}` }} />);
    expect(screen.getByRole("heading", { name: "No Release candidate" })).toBeInTheDocument();
    expect(screen.getByText(/build/)).toBeInTheDocument();
  });

  it("renders the full read-only release state matrix with semantic headings", () => {
    render(<CapabilityExportPanel view={readyView()} />);
    for (const heading of ["Release candidate", "Neutral package manifest", "Adapter previews", "Obsidian projection", "Deployment plans", "Deployment history"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(/finalized; deployment planning may proceed/)).toBeInTheDocument();
    expect(screen.getByText(/Unsupported adapter output blocks every target publish/)).toBeInTheDocument();
    expect(screen.getByText(/existing file is not owned by Caphub/)).toBeInTheDocument();
    expect(screen.getAllByText(/codex-primary/).length).toBeGreaterThan(0);
    expect(screen.getByText(/stays read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
  });

  it("survives long untrusted strings without breaking structure", () => {
    const longTitle = "超长标题".repeat(200);
    render(<CapabilityExportPanel view={readyView({ release: { ...RELEASE, title: longTitle } })} />);
    expect(screen.getByText(new RegExp(longTitle.slice(0, 12)))).toBeInTheDocument();
  });

  it("shows unavailable generically", () => {
    render(<CapabilityExportPanel view={{ kind: "unavailable", candidateId: `cand_${"2".repeat(32)}` }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("REGISTRY_UNAVAILABLE");
  });
});
