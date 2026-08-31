import "server-only";

import { randomUUID } from "node:crypto";
import type { AssistantMode } from "./contracts";
import { ASSISTANT_LIMITS } from "./limits";

export interface SourceGateRecord {
  gate_id: string;
  project_slug: string;
  question_digest: string;
  manifest_digest: string;
  capabilities: readonly ["list_project_files", "read_project_files"];
  max_files: number;
  max_bytes: number;
  max_tool_calls: number;
  expires_at: string;
}

export interface CreateSourceGateInput {
  projectSlug: string;
  questionDigest: string;
  manifestDigest: string;
  mode: AssistantMode;
  now?: Date;
}

export interface ConsumeSourceGateInput {
  gateId: string;
  projectSlug: string;
  questionDigest: string;
  manifestDigest: string;
  now?: Date;
}

export interface RejectSourceGateInput {
  gateId: string;
  reason?: "rejected" | "cancelled";
}

export type SourceGateErrorCode =
  | "SOURCE_GATE_NOT_FOUND"
  | "SOURCE_GATE_CONSUMED"
  | "SOURCE_GATE_REJECTED"
  | "SOURCE_GATE_CANCELLED"
  | "SOURCE_GATE_EXPIRED"
  | "SOURCE_GATE_PROJECT_MISMATCH"
  | "SOURCE_GATE_QUESTION_MISMATCH"
  | "SOURCE_GATE_MANIFEST_MISMATCH";

export type ConsumeSourceGateResult =
  | { ok: true; gate: SourceGateRecord }
  | { ok: false; code: SourceGateErrorCode; message: string };

export type RejectSourceGateResult =
  | { ok: true }
  | { ok: false; code: "SOURCE_GATE_NOT_FOUND"; message: string };

type GateStatus = "active" | "consumed" | "rejected" | "cancelled";

interface StoredGate {
  record: SourceGateRecord;
  status: GateStatus;
}

/**
 * Process-local, ephemeral gate store. A process restart invalidates every
 * gate; nothing is persisted to disk or activity. Each entry holds only the
 * bound Project/question/manifest digests — never the question, history,
 * source body, answer, or reasoning.
 */
const gateStore = new Map<string, StoredGate>();

const CLEANUP_GRACE_MS = 60 * 1000;

function lazyCleanup(nowMs: number): void {
  for (const [gateId, stored] of gateStore) {
    if (nowMs - Date.parse(stored.record.expires_at) > CLEANUP_GRACE_MS) {
      gateStore.delete(gateId);
    }
  }
}

export function createSourceGate(input: CreateSourceGateInput): SourceGateRecord {
  const limits = ASSISTANT_LIMITS[input.mode];
  const nowMs = (input.now ?? new Date()).getTime();

  const record: SourceGateRecord = {
    gate_id: randomUUID(),
    project_slug: input.projectSlug,
    question_digest: input.questionDigest,
    manifest_digest: input.manifestDigest,
    capabilities: ["list_project_files", "read_project_files"],
    max_files: limits.sourceFiles,
    max_bytes: limits.sourceBytes,
    max_tool_calls: limits.toolCalls,
    expires_at: new Date(nowMs + ASSISTANT_LIMITS.gateTtlMs).toISOString()
  };

  gateStore.set(record.gate_id, { record, status: "active" });
  lazyCleanup(nowMs);
  return record;
}

export function consumeSourceGate(input: ConsumeSourceGateInput): ConsumeSourceGateResult {
  const nowMs = (input.now ?? new Date()).getTime();
  lazyCleanup(nowMs);

  const stored = gateStore.get(input.gateId);
  if (!stored) {
    return {
      ok: false,
      code: "SOURCE_GATE_NOT_FOUND",
      message: "Source gate does not exist or has already expired and been removed."
    };
  }

  if (stored.status === "consumed") {
    return { ok: false, code: "SOURCE_GATE_CONSUMED", message: "Source gate has already been consumed." };
  }
  if (stored.status === "rejected") {
    return { ok: false, code: "SOURCE_GATE_REJECTED", message: "Source gate was rejected." };
  }
  if (stored.status === "cancelled") {
    return { ok: false, code: "SOURCE_GATE_CANCELLED", message: "Source gate was cancelled." };
  }

  const record = stored.record;
  if (nowMs >= Date.parse(record.expires_at)) {
    gateStore.delete(input.gateId);
    return { ok: false, code: "SOURCE_GATE_EXPIRED", message: "Source gate has expired." };
  }
  if (record.project_slug !== input.projectSlug) {
    return { ok: false, code: "SOURCE_GATE_PROJECT_MISMATCH", message: "Source gate is bound to a different project." };
  }
  if (record.question_digest !== input.questionDigest) {
    return { ok: false, code: "SOURCE_GATE_QUESTION_MISMATCH", message: "Source gate is bound to a different question digest." };
  }
  if (record.manifest_digest !== input.manifestDigest) {
    return { ok: false, code: "SOURCE_GATE_MANIFEST_MISMATCH", message: "Source gate is bound to a different manifest digest." };
  }

  stored.status = "consumed";
  return { ok: true, gate: record };
}

export function rejectSourceGate(input: RejectSourceGateInput): RejectSourceGateResult {
  const stored = gateStore.get(input.gateId);
  if (!stored) {
    return { ok: false, code: "SOURCE_GATE_NOT_FOUND", message: "Source gate does not exist." };
  }
  if (stored.status === "active") {
    stored.status = input.reason === "cancelled" ? "cancelled" : "rejected";
  }
  return { ok: true };
}
