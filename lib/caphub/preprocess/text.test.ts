import { describe, expect, it } from "vitest";
import { extractTextIndicators, suggestPrivacyReviews } from "./text";

describe("preprocessed text evidence", () => {
  it("extracts deterministic URLs, repositories, packages, and command strings without executing them", () => {
    const result = extractTextIndicators([
      "Visit https://example.com/tool and https://github.com/example/tool.",
      "Install @example/tool, then run npm install @example/tool",
      "Duplicate https://example.com/tool"
    ]);
    expect(result.urls).toContain("https://example.com/tool");
    expect(result.repositories).toEqual(["https://github.com/example/tool"]);
    expect(result.packages).toEqual(["@example/tool"]);
    expect(result.commands).toEqual(["npm install @example/tool"]);
  });

  it("returns review-only privacy suggestions and never mutates the source strings", () => {
    const source = ["Contact owner@example.com with token sk-examplecandidate123456789"];
    const snapshot = [...source];
    const suggestions = suggestPrivacyReviews(source, 0);
    expect(suggestions.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["email", "token_candidate"])
    );
    expect(suggestions.every((item) => item.action === "human_redaction_review")).toBe(true);
    expect(source).toEqual(snapshot);
  });
});
