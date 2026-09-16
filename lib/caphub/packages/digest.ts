import { createHash } from "node:crypto";

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | {
  [key: string]: CanonicalValue;
};

// Fields whose arrays are semantic sets: their order must not affect the
// canonical digest, so they are sorted during canonicalization.
const SET_ORDER_FIELDS = new Set(["permissions"]);

function canonicalize(value: unknown, ancestors: WeakSet<object>): CanonicalValue {
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
      const items = value.map((item) => canonicalize(item, ancestors));
      return items;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON requires plain objects");
    }

    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key], ancestors)])
    );
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Canonical JSON for CapabilityPackageV1 digests: recursively sorted object
 * keys, semantic array order (except documented set-order fields), UTF-8
 * strings preserved, and the top-level `digest` field excluded.
 */
export function canonicalPackageJson(value: unknown): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const record = value as Record<string, unknown>;
    const setOrderNormalized = Object.fromEntries(Object.entries(record).map(([key, item]) => {
      if (SET_ORDER_FIELDS.has(key) && Array.isArray(item)) {
        return [key, item.map((entry) => JSON.stringify(canonicalize(entry, new WeakSet()))).sort()
          .map((entry) => JSON.parse(entry))];
      }
      return [key, item];
    }));
    const { digest: _excluded, ...rest } = setOrderNormalized;
    return JSON.stringify(canonicalize(rest, new WeakSet()));
  }
  return JSON.stringify(canonicalize(value, new WeakSet()));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function packageContentDigest(pkg: unknown): string {
  return sha256Hex(canonicalPackageJson(pkg));
}

export function verifyPackageContentDigest(pkg: { digest: string }): boolean {
  return packageContentDigest(pkg) === pkg.digest;
}
