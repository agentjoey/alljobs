import { sha256Hex } from "../packages/digest";
import {
  DEFAULT_HUMAN_CONTENT,
  OBSIDIAN_HUMAN_END,
  OBSIDIAN_HUMAN_START,
  OBSIDIAN_MANAGED_END,
  OBSIDIAN_MANAGED_START
} from "./markers";

const CAPHUB_MARKER_PATTERN = /<!--\s*caphub:/i;

export class ProjectionRenderError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ProjectionRenderError";
  }
}

export interface RenderObsidianDocumentInput {
  record_id: string;
  record_version: number;
  record_digest: string;
  managed_markdown: string;
  human_content?: string;
}

export interface RenderedObsidianDocument {
  content: string;
  managed_digest: string;
  postimage_digest: string;
  human_byte_start: number;
  human_byte_end: number;
}

function normalizeLf(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export function renderObsidianDocument(input: RenderObsidianDocumentInput): RenderedObsidianDocument {
  if (!/^rel_[a-f0-9]{32}$/.test(input.record_id)) {
    throw new ProjectionRenderError("record_id must be an exact Release record ID");
  }
  if (!/^[a-f0-9]{64}$/.test(input.record_digest)) {
    throw new ProjectionRenderError("record_digest must be a lowercase SHA-256 digest");
  }
  const managedInner = normalizeLf(input.managed_markdown).replace(/\n+$/, "");
  if (CAPHUB_MARKER_PATTERN.test(managedInner)) {
    throw new ProjectionRenderError("managed markdown must not contain Caphub markers");
  }
  if (managedInner.startsWith("---")) {
    throw new ProjectionRenderError("managed markdown must not start a frontmatter block");
  }
  const human = input.human_content ?? DEFAULT_HUMAN_CONTENT;
  if (CAPHUB_MARKER_PATTERN.test(human)) {
    throw new ProjectionRenderError("human content must not contain Caphub markers");
  }

  const managedDigest = sha256Hex(`${managedInner}\n`);
  const content = [
    "---\n",
    "caphub_schema: 1\n",
    `caphub_record_id: ${input.record_id}\n`,
    `caphub_record_version: ${input.record_version}\n`,
    `caphub_record_digest: ${input.record_digest}\n`,
    `caphub_managed_digest: ${managedDigest}\n`,
    "---\n",
    `${OBSIDIAN_MANAGED_START}\n`,
    `${managedInner}\n`,
    `${OBSIDIAN_MANAGED_END}\n`,
    `${OBSIDIAN_HUMAN_START}\n`,
    human,
    `${OBSIDIAN_HUMAN_END}\n`
  ].join("");

  const humanByteStart = byteLength(content.slice(0, content.indexOf(`${OBSIDIAN_HUMAN_START}\n`) + OBSIDIAN_HUMAN_START.length + 1));
  return {
    content,
    managed_digest: managedDigest,
    postimage_digest: sha256Hex(content),
    human_byte_start: humanByteStart,
    human_byte_end: humanByteStart + byteLength(human)
  };
}
