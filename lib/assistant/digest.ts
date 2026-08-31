import { computeDigest } from "../planning/native/digest";

/**
 * Recursively sorts object keys while preserving array order so that two
 * structurally equal values canonicalize to the same JSON regardless of
 * key insertion order.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  return value;
}

/** Deterministic SHA-256 hex digest of a canonicalized JSON value. */
export function assistantDigest(value: unknown): string {
  return computeDigest(JSON.stringify(canonicalize(value)));
}
