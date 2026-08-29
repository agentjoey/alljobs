import { createHash } from "node:crypto";

export function computeDigest(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function decodeUtf8(content: Uint8Array): string {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content);
    if (!Buffer.from(decoded, "utf8").equals(Buffer.from(content))) {
      throw new Error("UTF-8 input did not round-trip byte-for-byte.");
    }
    return decoded;
  } catch {
    throw new Error("Planning document is not valid UTF-8.");
  }
}
