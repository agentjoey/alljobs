import { describe, expect, it } from "vitest";
import { testCapabilityPackage } from "../packages/fixtures";
import { renderCodexPreview } from "./codex";

function adapterPackage(overrides: Parameters<typeof testCapabilityPackage>[0] = {}) {
  return testCapabilityPackage({ dependencies: [], ...overrides });
}

describe("renderCodexPreview", () => {
  it("renders a skill under the logical $CODEX_HOME destination", () => {
    const result = renderCodexPreview(adapterPackage());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.files[0]?.path).toBe("$CODEX_HOME/skills/pdf-table-extract/SKILL.md");
    expect(result.result.files[0]?.media_type).toBe("text/markdown");
    expect(result.result.files[0]?.content.startsWith("---\n")).toBe(true);
    expect(result.result.files[0]?.content).toContain("name: pdf-table-extract");
    expect(result.result.files[0]?.content).toContain("description: Extract tables from PDF files into structured rows.");
  });

  it("supports skill and reference kinds but not experience cards", () => {
    expect(renderCodexPreview(adapterPackage({ kind: "reference", version: "0.1.0" })).ok).toBe(true);
    const card = renderCodexPreview(adapterPackage({ kind: "experience_card" }));
    expect(card.ok).toBe(false);
    if (!card.ok) {
      expect(card.code).toBe("ADAPTER_UNSUPPORTED");
      expect(card.diagnostics.join(" ")).toMatch(/experience_card/);
    }
  });
});
