import { sha256Hex } from "../packages/digest";
import {
  DEFAULT_HUMAN_CONTENT,
  OBSIDIAN_HUMAN_END,
  OBSIDIAN_HUMAN_START,
  OBSIDIAN_MANAGED_END,
  OBSIDIAN_MANAGED_START
} from "./markers";

export {
  DEFAULT_HUMAN_CONTENT,
  OBSIDIAN_HUMAN_END,
  OBSIDIAN_HUMAN_START,
  OBSIDIAN_MANAGED_END,
  OBSIDIAN_MANAGED_START
};

export const PROJECTION_FIXTURE_NOW = "2026-09-16T09:00:00.000Z";

export const FIXTURE_RECORD_ID = `rel_${"1".repeat(32)}`;
export const FIXTURE_RECORD_DIGEST = "b".repeat(64);

export interface OwnedDocumentFixtureOptions {
  recordId?: string;
  recordVersion?: number;
  recordDigest?: string;
  managedMarkdown?: string;
  humanContent?: string;
}

export function ownedManagedDigest(managedMarkdown: string): string {
  const inner = managedMarkdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
  return sha256Hex(`${inner}\n`);
}

export function ownedDocument(options: OwnedDocumentFixtureOptions = {}): string {
  const recordId = options.recordId ?? FIXTURE_RECORD_ID;
  const recordVersion = options.recordVersion ?? 1;
  const recordDigest = options.recordDigest ?? FIXTURE_RECORD_DIGEST;
  const managedInner = (options.managedMarkdown ?? "Managed summary line.\n")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
  const humanContent = options.humanContent ?? DEFAULT_HUMAN_CONTENT;
  const managedDigest = ownedManagedDigest(managedInner);
  return [
    "---\n",
    "caphub_schema: 1\n",
    `caphub_record_id: ${recordId}\n`,
    `caphub_record_version: ${recordVersion}\n`,
    `caphub_record_digest: ${recordDigest}\n`,
    `caphub_managed_digest: ${managedDigest}\n`,
    "---\n",
    `${OBSIDIAN_MANAGED_START}\n`,
    `${managedInner}\n`,
    `${OBSIDIAN_MANAGED_END}\n`,
    `${OBSIDIAN_HUMAN_START}\n`,
    humanContent,
    `${OBSIDIAN_HUMAN_END}\n`
  ].join("");
}
