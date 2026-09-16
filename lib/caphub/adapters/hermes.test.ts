import { describe, expect, it } from "vitest";
import { testCapabilityPackage } from "../packages/fixtures";
import { renderHermesPreview } from "./hermes";

function adapterPackage(overrides: Parameters<typeof testCapabilityPackage>[0] = {}) {
  return testCapabilityPackage({ dependencies: [], ...overrides });
}

describe("renderHermesPreview", () => {
  it("renders skills under ~/.hermes/skills/<category>/<slug>/", () => {
    const result = renderHermesPreview(adapterPackage());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.files[0]?.path).toBe("~/.hermes/skills/capabilities/pdf-table-extract/SKILL.md");
  });

  it("maps package kinds to stable Hermes categories", () => {
    const card = renderHermesPreview(adapterPackage({ kind: "experience_card", version: "0.1.0" }));
    expect(card.ok && card.result.files[0]?.path).toContain("~/.hermes/skills/experience/");
    const reference = renderHermesPreview(adapterPackage({ kind: "reference", version: "0.2.0" }));
    expect(reference.ok && reference.result.files[0]?.path).toContain("~/.hermes/skills/references/");
  });
});
