import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UNSAFE_PRIVATE_BITS = 0o077;

type AttestationKind = "object-transfer" | "recovery";

interface ObjectTransferAttestation {
  schema: "caphub.neon-object-transfer.v1";
  sourceDigest: string;
  objectCount: number;
  matchesRemote: true;
}

interface RecoveryAttestation {
  schema: "caphub.neon-recovery.v1";
  verified: true;
}

function assertPrivateCanonicalDirectory(path: string): void {
  const metadata = lstatSync(path);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== currentUid
    || (metadata.mode & UNSAFE_PRIVATE_BITS) !== 0 || realpathSync(path) !== path) {
    throw new Error("Activation evidence directories must be private, owner-only, canonical directories");
  }
}

function ensurePrivateCanonicalDirectory(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
  assertPrivateCanonicalDirectory(path);
}

function parseObjectTransfer(args: readonly string[]): ObjectTransferAttestation {
  if (args.length !== 7 || args[0] !== "--source-digest" || args[2] !== "--object-count"
    || args[4] !== "--matches-remote" || args[5] !== "--confirm"
    || args[6] !== "RECORD-CAPHUB-OBJECT-TRANSFER") {
    throw new Error("Object transfer attestation requires --matches-remote and exact confirmation arguments");
  }
  const sourceDigest = args[1] ?? "";
  const count = args[3] ?? "";
  if (!SHA256_PATTERN.test(sourceDigest)) throw new Error("Object transfer source digest must be SHA-256");
  if (!/^(?:0|[1-9]\d*)$/.test(count) || !Number.isSafeInteger(Number(count))) {
    throw new Error("Object transfer count must be a safe non-negative integer");
  }
  return {
    schema: "caphub.neon-object-transfer.v1",
    sourceDigest,
    objectCount: Number(count),
    matchesRemote: true
  };
}

function parseRecovery(args: readonly string[]): RecoveryAttestation {
  if (args.length !== 3 || args[0] !== "--verified" || args[1] !== "--confirm"
    || args[2] !== "RECORD-CAPHUB-RECOVERY") {
    throw new Error("Recovery attestation requires exact arguments and confirmation");
  }
  return { schema: "caphub.neon-recovery.v1", verified: true };
}

export function recordActivationAttestation(
  args: readonly string[],
  resolvedHome: string = resolve(process.env.ALLJOBS_HOME ?? join(homedir(), ".alljobs"))
): { kind: AttestationKind; recorded: true } {
  const [kind, ...rest] = args;
  if (kind !== "object-transfer" && kind !== "recovery") throw new Error("Activation attestation arguments are invalid");
  assertPrivateCanonicalDirectory(resolvedHome);
  const stateDir = join(resolvedHome, "state");
  const caphubDir = join(stateDir, "caphub");
  const activationDir = join(caphubDir, "activation");
  ensurePrivateCanonicalDirectory(stateDir);
  ensurePrivateCanonicalDirectory(caphubDir);
  ensurePrivateCanonicalDirectory(activationDir);
  const attestation = kind === "object-transfer" ? parseObjectTransfer(rest) : parseRecovery(rest);
  const destination = join(activationDir, `${kind}.json`);
  if (existsSync(destination)) throw new Error("Activation attestation already exists and cannot be replaced");
  writeFileSync(destination, `${JSON.stringify(attestation)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return { kind, recorded: true };
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const result = recordActivationAttestation(args);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
