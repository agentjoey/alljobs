import { describe, expect, it } from "vitest";
import { sha256Hex } from "../packages/digest";
import {
  DEFAULT_HUMAN_CONTENT,
  FIXTURE_RECORD_DIGEST,
  FIXTURE_RECORD_ID,
  OBSIDIAN_HUMAN_START,
  ownedDocument,
  ownedManagedDigest
} from "./fixtures";
import { parseObsidianDocument, ProjectionParseError } from "./markers";

describe("parseObsidianDocument", () => {
  it("parses an owned document with exact human byte offsets and content", () => {
    const humanContent = "## 我的判断\n\n我的笔记内容\n\n## 使用经验\n";
    const raw = ownedDocument({ humanContent });
    const parsed = parseObsidianDocument(raw);

    expect(parsed.record_id).toBe(FIXTURE_RECORD_ID);
    expect(parsed.record_version).toBe(1);
    expect(parsed.record_digest).toBe(FIXTURE_RECORD_DIGEST);
    expect(parsed.managed_digest).toBe(ownedManagedDigest("Managed summary line.\n"));
    expect(parsed.managed_markdown).toBe("Managed summary line.");
    expect(parsed.human_content).toBe(humanContent);
    const byteStart = Buffer.byteLength(raw.slice(0, raw.indexOf(OBSIDIAN_HUMAN_START) + OBSIDIAN_HUMAN_START.length + 1), "utf8");
    expect(parsed.human_byte_start).toBe(byteStart);
    expect(parsed.human_byte_end).toBe(byteStart + Buffer.byteLength(humanContent, "utf8"));
  });

  it("rejects files that carry no Caphub ownership markers", () => {
    for (const raw of [
      "# Random note\n\nNothing owned here.\n",
      "---\ntitle: other\n---\n\nBody\n",
      "<!-- caphub:managed:start -->\nonly one marker\n"
    ]) {
      expect(() => parseObsidianDocument(raw)).toThrow(ProjectionParseError);
    }
  });

  it("rejects missing, duplicated, unbalanced, nested, or reordered markers", () => {
    const valid = ownedDocument();
    const managedStart = "<!-- caphub:managed:start -->";
    const managedEnd = "<!-- caphub:managed:end -->";
    const humanEnd = "<!-- caphub:human:end -->";
    const humanStart = "<!-- caphub:human:start -->";
    const cases: string[] = [
      valid.replace(managedEnd, ""),
      valid.replace(managedStart, `${managedStart}\n${managedStart}`),
      valid.replace(humanStart, ""),
      valid.replace(humanStart, "").replace(humanEnd, ""),
      valid.replace(managedStart, humanStart),
      valid.split("\n").reverse().join("\n")
    ];
    for (const raw of cases) {
      expect(() => parseObsidianDocument(raw)).toThrow(ProjectionParseError);
    }
  });

  it("rejects marker-like text inside the managed or human content", () => {
    expect(() => parseObsidianDocument(ownedDocument({
      managedMarkdown: "summary\n<!-- caphub:human:start -->\ninjection"
    }))).toThrow(ProjectionParseError);
    expect(() => parseObsidianDocument(ownedDocument({
      humanContent: "## 我的判断\n<!-- caphub:managed:end -->\n"
    }))).toThrow(ProjectionParseError);
  });

  it("rejects malformed frontmatter, duplicate keys, and unknown caphub keys", () => {
    const valid = ownedDocument();
    expect(() => parseObsidianDocument(valid.replace("---\ncaphub_schema", "---   \ncaphub_schema"))).toThrow(ProjectionParseError);
    expect(() => parseObsidianDocument(
      valid.replace("caphub_schema: 1", "caphub_schema: 1\ncaphub_schema: 1")
    )).toThrow(ProjectionParseError);
    expect(() => parseObsidianDocument(
      valid.replace("caphub_managed_digest:", "caphub_extra: nope\ncaphub_managed_digest:")
    )).toThrow(ProjectionParseError);
    expect(() => parseObsidianDocument(valid.replace("caphub_schema: 1", "caphub_schema: 2"))).toThrow(ProjectionParseError);
    expect(() => parseObsidianDocument(valid.replace(
      `caphub_record_id: ${FIXTURE_RECORD_ID}`, "caphub_record_id: not-an-id"
    ))).toThrow(ProjectionParseError);
  });

  it("rejects a leading BOM and unsafe carriage returns outside the human region", () => {
    expect(() => parseObsidianDocument(`\uFEFF${ownedDocument()}`)).toThrow(ProjectionParseError);
    const crlf = ownedDocument().split("\n").join("\r\n");
    expect(() => parseObsidianDocument(crlf)).toThrow(ProjectionParseError);
  });

  it("preserves CRLF inside the human region byte-for-byte", () => {
    const humanContent = "## 我的判断\r\n\r\nwindows notes\r\n";
    const raw = ownedDocument({ humanContent });
    const parsed = parseObsidianDocument(raw);
    expect(parsed.human_content).toBe(humanContent);
  });

  it("reports the human headings actually present", () => {
    const parsed = parseObsidianDocument(ownedDocument());
    expect(parsed.human_headings).toEqual(["我的判断", "使用经验", "可以组合的能力", "后续想法"]);
    const sparse = parseObsidianDocument(ownedDocument({ humanContent: "## 我的判断\n\ntext\n" }));
    expect(sparse.human_headings).toEqual(["我的判断"]);
  });

  it("keeps the default human skeleton available for new documents", () => {
    expect(DEFAULT_HUMAN_CONTENT).toContain("## 我的判断");
    expect(DEFAULT_HUMAN_CONTENT).toContain("## 后续想法");
  });

  it("produces a stable digest helper for fixtures", () => {
    expect(ownedManagedDigest("one\ntwo\n")).toBe(sha256Hex("one\ntwo\n"));
  });
});
