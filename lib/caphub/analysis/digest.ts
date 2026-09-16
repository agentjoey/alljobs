import { createHash } from "node:crypto";

type CanonicalJsonValue = null | boolean | number | string | CanonicalJsonValue[] | {
  [key: string]: CanonicalJsonValue;
};

function normalizeJson(value: unknown, ancestors: WeakSet<object>): CanonicalJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON requires finite numbers");
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`Canonical JSON cannot represent ${typeof value}`);
  }
  if (ancestors.has(value)) throw new TypeError("Canonical JSON cannot represent cyclic values");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeJson(item, ancestors));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON requires plain objects");
    }

    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, normalizeJson(record[key], ancestors)])
    );
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value, new WeakSet()));
}

export function digestCanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
