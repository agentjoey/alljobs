import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { recordActivationAttestation } from "./caphub-activation-attest";

const roots: string[] = [];
const DIGEST = "a".repeat(64);

function privateHome(): string {
  const home = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "caphub-activation-attest-")));
  roots.push(home);
  return home;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => {
    await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true }));
  }));
});

describe("caphub activation attestation", () => {
  it("writes each minimal attestation once under a private owner-only activation directory", () => {
    const home = privateHome();
    expect(recordActivationAttestation([
      "object-transfer", "--source-digest", DIGEST, "--object-count", "2", "--matches-remote",
      "--confirm", "RECORD-CAPHUB-OBJECT-TRANSFER"
    ], home)).toEqual({ kind: "object-transfer", recorded: true });
    const objectPath = join(home, "state", "caphub", "activation", "object-transfer.json");
    expect(JSON.parse(readFileSync(objectPath, "utf8"))).toEqual({
      schema: "caphub.neon-object-transfer.v1",
      sourceDigest: DIGEST,
      objectCount: 2,
      matchesRemote: true
    });
    expect(recordActivationAttestation([
      "recovery", "--verified", "--confirm", "RECORD-CAPHUB-RECOVERY"
    ], home)).toEqual({ kind: "recovery", recorded: true });
    expect(() => recordActivationAttestation([
      "recovery", "--verified", "--confirm", "RECORD-CAPHUB-RECOVERY"
    ], home)).toThrow(/already exists/i);
  });

  it("rejects missing confirmations, false remote evidence, and unrecognized arguments", () => {
    const home = privateHome();
    expect(() => recordActivationAttestation([
      "object-transfer", "--source-digest", DIGEST, "--object-count", "2", "--confirm", "RECORD-CAPHUB-OBJECT-TRANSFER"
    ], home)).toThrow(/matches-remote/i);
    expect(() => recordActivationAttestation([
      "recovery", "--verified", "--confirm", "wrong"
    ], home)).toThrow(/confirmation/i);
    expect(() => recordActivationAttestation([
      "recovery", "--verified", "--confirm", "RECORD-CAPHUB-RECOVERY", "--replace"
    ], home)).toThrow(/arguments/i);
  });
});
