import { describe, expect, it } from "vitest";
import { testCapabilityPackage } from "../packages/fixtures";
import { renderClaudePreview } from "./claude";

function adapterPackage(overrides: Parameters<typeof testCapabilityPackage>[0] = {}) {
  return testCapabilityPackage({ dependencies: [], ...overrides });
}

describe("renderClaudePreview", () => {
  it("renders a skill under the logical .claude/skills destination", () => {
    const result = renderClaudePreview(adapterPackage());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.files[0]?.path).toBe(".claude/skills/pdf-table-extract/SKILL.md");
    expect(result.result.files[0]?.content).toContain("name: pdf-table-extract");
    expect(result.result.files[0]?.content).toContain("description: Extract tables from PDF files into structured rows.");
  });

  it("supports experience cards and references in addition to skills", () => {
    expect(renderClaudePreview(adapterPackage({ kind: "experience_card", version: "0.1.0" })).ok).toBe(true);
    expect(renderClaudePreview(adapterPackage({ kind: "reference", version: "0.2.0" })).ok).toBe(true);
  });
});
