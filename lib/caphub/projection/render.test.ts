import { describe, expect, it } from "vitest";
import { sha256Hex } from "../packages/digest";
import {
  DEFAULT_HUMAN_CONTENT,
  FIXTURE_RECORD_DIGEST,
  FIXTURE_RECORD_ID,
  OBSIDIAN_HUMAN_START,
  ownedDocument
} from "./fixtures";
import { parseObsidianDocument } from "./markers";
import { renderObsidianDocument } from "./render";

const RECORD_ID = FIXTURE_RECORD_ID;
const RECORD_DIGEST = FIXTURE_RECORD_DIGEST;

describe("renderObsidianDocument", () => {
  it("renders a new document with the four required human headings and stable properties", () => {
    const rendered = renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: "Summary line.\nDetails line."
    });

    expect(rendered.content.startsWith("---\ncaphub_schema: 1\n")).toBe(true);
    expect(rendered.content).toContain(`caphub_record_id: ${RECORD_ID}`);
    expect(rendered.content).toContain("caphub_record_version: 1");
    expect(rendered.content).toContain(`caphub_record_digest: ${RECORD_DIGEST}`);
    expect(rendered.content).toContain(`caphub_managed_digest: ${rendered.managed_digest}`);
    expect(rendered.content).toContain("<!-- caphub:managed:start -->\nSummary line.\nDetails line.\n<!-- caphub:managed:end -->");
    expect(rendered.content).toContain(`<!-- caphub:human:start -->\n${DEFAULT_HUMAN_CONTENT}<!-- caphub:human:end -->\n`);
    expect(rendered.content.endsWith("<!-- caphub:human:end -->\n")).toBe(true);

    const parsed = parseObsidianDocument(rendered.content);
    expect(parsed.human_content).toBe(DEFAULT_HUMAN_CONTENT);
    expect(parsed.managed_digest).toBe(rendered.managed_digest);
  });

  it("normalizes managed markdown to LF and computes a stable managed digest", () => {
    const withCrLf = renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: "one\r\ntwo\r\n"
    });
    const plain = renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: "one\ntwo\n"
    });
    expect(withCrLf.managed_digest).toBe(plain.managed_digest);
    expect(withCrLf.content).toBe(plain.content);
    expect(plain.managed_digest).toBe(sha256Hex("one\ntwo\n"));
  });

  it("preserves the human region byte-for-byte across updates and keeps the managed digest stable", () => {
    const first = renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: "Version one summary."
    });
    const humanNotes = "## 我的判断\n\n这是我自己写的内容，保留原样。\n\n## 使用经验\n\n- 好用\n";
    const userEdited = first.content.replace(
      `${OBSIDIAN_HUMAN_START}\n${DEFAULT_HUMAN_CONTENT}`,
      `${OBSIDIAN_HUMAN_START}\n${humanNotes}`
    );

    const parsed = parseObsidianDocument(userEdited);
    expect(parsed.human_content).toBe(humanNotes);
    const second = renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 2,
      record_digest: RECORD_DIGEST,
      managed_markdown: "Version two summary with more evidence.",
      human_content: parsed.human_content
    });

    expect(second.managed_digest).not.toBe(first.managed_digest);
    const reparsed = parseObsidianDocument(second.content);
    expect(reparsed.human_content).toBe(parsed.human_content);
    expect(reparsed.record_version).toBe(2);
    expect(second.content).not.toContain("Version one summary.");
    expect(second.content).toContain("Version two summary with more evidence.");
  });

  it("rebuilds an identical managed digest after deleting and recreating a managed document", () => {
    const managed = "Deterministic managed block.\n- point one\n- point two\n";
    const first = renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: managed
    });
    const rebuilt = renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: managed
    });
    expect(rebuilt.managed_digest).toBe(first.managed_digest);
    expect(rebuilt.postimage_digest).toBe(first.postimage_digest);
  });

  it("changes only the postimage digest when the human content changes", () => {
    const managed = "Same managed block.\n";
    const first = renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: managed,
      human_content: "## 我的判断\n\nA\n"
    });
    const second = renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: managed,
      human_content: "## 我的判断\n\nB\n"
    });
    expect(second.managed_digest).toBe(first.managed_digest);
    expect(second.postimage_digest).not.toBe(first.postimage_digest);
  });

  it("rejects managed markdown containing caphub markers or frontmatter starts", () => {
    expect(() => renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: "<!-- caphub:human:start -->"
    })).toThrow();
    expect(() => renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: "---\ninjected: yes"
    })).toThrow();
  });

  it("rejects human content that contains caphub markers", () => {
    expect(() => renderObsidianDocument({
      record_id: RECORD_ID,
      record_version: 1,
      record_digest: RECORD_DIGEST,
      managed_markdown: "ok",
      human_content: "## 我的判断\n<!-- caphub:managed:end -->\n"
    })).toThrow();
  });

  it("round-trips a fixture-owned document through parse and re-render", () => {
    const raw = ownedDocument({ humanContent: "## 我的判断\n\nnotes\n" });
    const parsed = parseObsidianDocument(raw);
    const reRendered = renderObsidianDocument({
      record_id: parsed.record_id,
      record_version: parsed.record_version,
      record_digest: parsed.record_digest,
      managed_markdown: parsed.managed_markdown,
      human_content: parsed.human_content
    });
    expect(reRendered.content).toBe(raw);
    expect(reRendered.managed_digest).toBe(parsed.managed_digest);
  });
});
