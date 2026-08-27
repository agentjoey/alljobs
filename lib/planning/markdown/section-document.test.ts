import { describe, expect, it } from "vitest";
import {
  appendSection,
  parseSectionDocument,
  replaceSection
} from "./section-document";

const sampleDoc = `# My Planning Document

Some leading documentation and instructions.

## item-1: First Item

\`\`\`yaml alljobs
id: item-1
status: ready
order: 10
\`\`\`

Detailed body text for first item.

## item-2: Second Item

\`\`\`yaml alljobs
id: item-2
status: doing
order: 20
\`\`\`

Body text for second item.
`;

describe("section-document", () => {
  it("splits sections and extracts yaml metadata and body", () => {
    const result = parseSectionDocument(sampleDoc, "test.md");
    expect(result.issues).toEqual([]);
    expect(result.sections.length).toBe(2);

    const [first, second] = result.sections;
    expect(first.id).toBe("item-1");
    expect(first.title).toBe("First Item");
    expect(first.metadata.status).toBe("ready");
    expect(first.body).toBe("Detailed body text for first item.");

    expect(second.id).toBe("item-2");
    expect(second.title).toBe("Second Item");
    expect(second.metadata.status).toBe("doing");
  });

  it("handles CRLF line endings transparently", () => {
    const crlfDoc = sampleDoc.replace(/\n/g, "\r\n");
    const result = parseSectionDocument(crlfDoc, "test-crlf.md");
    expect(result.issues).toEqual([]);
    expect(result.sections.length).toBe(2);
  });

  it("detects malformed YAML and records issue without crashing", () => {
    const badDoc = `## bad-item: Bad Item\n\n\`\`\`yaml\n: invalid: [yaml\n\`\`\`\n\nBody`;
    const result = parseSectionDocument(badDoc, "bad.md");
    expect(result.issues.length).toBe(1);
    expect(result.issues[0].code).toBe("MALFORMED_YAML");
  });

  it("detects duplicate section IDs", () => {
    const dupDoc = `## dup: First\n\`\`\`yaml\nid: dup\n\`\`\`\n\n## dup: Second\n\`\`\`yaml\nid: dup\n\`\`\``;
    const result = parseSectionDocument(dupDoc, "dup.md");
    expect(result.issues.some(i => i.code === "DUPLICATE_SECTION_ID")).toBe(true);
  });

  it("replaces a section preserving surrounding bytes", () => {
    const replacement = `## item-1: Updated First Item\n\n\`\`\`yaml alljobs\nid: item-1\nstatus: done\norder: 10\n\`\`\`\n\nUpdated body.`;
    const updated = replaceSection(sampleDoc, "item-1", replacement);

    expect(updated).toContain("## item-1: Updated First Item");
    expect(updated).toContain("status: done");
    expect(updated).toContain("## item-2: Second Item");
    expect(updated).toContain("Some leading documentation and instructions.");
  });

  it("appends a section cleanly", () => {
    const newSection = `## item-3: Third Item\n\n\`\`\`yaml alljobs\nid: item-3\nstatus: planned\n\`\`\``;
    const updated = appendSection(sampleDoc, newSection);

    expect(updated).toContain("## item-3: Third Item");
    expect(updated.endsWith("```\n")).toBe(true);
  });
});
