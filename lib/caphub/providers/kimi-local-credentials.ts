import "server-only";

import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const MAX_SOURCE_BYTES = 1024 * 1024;
const FIXED_MODEL = "kimi-code/k3-256k";
const FIXED_PROVIDER = "managed:kimi-code";
const FIXED_BASE_URL = "https://api.kimi.com/coding/v1";

export class KimiCredentialProjectionError extends Error {
  constructor(readonly code: "UNSAFE_CREDENTIAL_SOURCE" | "INVALID_CREDENTIAL_SOURCE") {
    super(code);
    this.name = "KimiCredentialProjectionError";
  }
}

const credentialSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_at: z.number().finite().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  expires_in: z.number().finite().optional()
}).strict();

async function readSafeOwnerFile(path: string): Promise<Buffer> {
  const stat = await lstat(path).catch(() => undefined);
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (!stat
    || !stat.isFile()
    || stat.isSymbolicLink()
    || (uid !== undefined && stat.uid !== uid)
    || (stat.mode & 0o022) !== 0
    || stat.size <= 0
    || stat.size > MAX_SOURCE_BYTES) {
    throw new KimiCredentialProjectionError("UNSAFE_CREDENTIAL_SOURCE");
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const current = await handle.stat();
    if (current.dev !== stat.dev || current.ino !== stat.ino || current.size !== stat.size) {
      throw new KimiCredentialProjectionError("UNSAFE_CREDENTIAL_SOURCE");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function assertSafeOwnerDirectory(path: string): Promise<void> {
  const stat = await lstat(path).catch(() => undefined);
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (!stat
    || !stat.isDirectory()
    || stat.isSymbolicLink()
    || (uid !== undefined && stat.uid !== uid)
    || (stat.mode & 0o022) !== 0) {
    throw new KimiCredentialProjectionError("UNSAFE_CREDENTIAL_SOURCE");
  }
}

function section(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|\\n)\\[${escaped}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\[|$)`));
  if (!match?.[1]) throw new KimiCredentialProjectionError("INVALID_CREDENTIAL_SOURCE");
  return match[1];
}

function quotedValue(source: string, key: string): string {
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*"([^"]+)"\\s*(?:#.*)?(?=\\n|$)`));
  if (!match?.[1]) throw new KimiCredentialProjectionError("INVALID_CREDENTIAL_SOURCE");
  return match[1];
}

function validateConfig(source: string): void {
  if (quotedValue(source, "default_model") !== FIXED_MODEL) {
    throw new KimiCredentialProjectionError("INVALID_CREDENTIAL_SOURCE");
  }
  const model = section(source, 'models."kimi-code/k3-256k"');
  const provider = section(source, 'providers."managed:kimi-code"');
  const oauth = section(source, 'providers."managed:kimi-code".oauth');
  if (quotedValue(model, "provider") !== FIXED_PROVIDER
    || quotedValue(model, "model") !== "k3-256k"
    || quotedValue(provider, "type") !== "managed"
    || quotedValue(provider, "base_url") !== FIXED_BASE_URL
    || quotedValue(oauth, "storage") !== "file"
    || quotedValue(oauth, "key") !== "kimi-code") {
    throw new KimiCredentialProjectionError("INVALID_CREDENTIAL_SOURCE");
  }
}

async function exclusiveWrite(path: string, bytes: string | Buffer): Promise<void> {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, 0o600);
}

export async function projectKimiLocalCredentials(options: {
  sourceHome: string;
  targetHome: string;
}): Promise<{ configPath: string; credentialPath: string }> {
  await assertSafeOwnerDirectory(options.sourceHome);
  const sourceHome = await realpath(options.sourceHome).catch(() => {
    throw new KimiCredentialProjectionError("UNSAFE_CREDENTIAL_SOURCE");
  });
  await assertSafeOwnerDirectory(join(sourceHome, "credentials"));
  const credentialNames = await readdir(join(sourceHome, "credentials")).catch(() => []);
  if (credentialNames.some((name) => name !== "kimi-code.json" && name !== "kimi-code.lock")) {
    throw new KimiCredentialProjectionError("INVALID_CREDENTIAL_SOURCE");
  }
  const configBytes = await readSafeOwnerFile(join(sourceHome, "config.toml"));
  const credentialBytes = await readSafeOwnerFile(join(sourceHome, "credentials", "kimi-code.json"));
  const configText = configBytes.toString("utf8");
  validateConfig(configText);

  let credential: z.infer<typeof credentialSchema>;
  try {
    credential = credentialSchema.parse(JSON.parse(credentialBytes.toString("utf8")));
  } catch {
    throw new KimiCredentialProjectionError("INVALID_CREDENTIAL_SOURCE");
  }

  const targetStat = await lstat(options.targetHome).catch(() => undefined);
  if (!targetStat?.isDirectory() || targetStat.isSymbolicLink()) {
    throw new KimiCredentialProjectionError("UNSAFE_CREDENTIAL_SOURCE");
  }
  await chmod(options.targetHome, 0o700);
  const credentialDirectory = join(options.targetHome, "credentials");
  await mkdir(credentialDirectory, { mode: 0o700 });
  await chmod(credentialDirectory, 0o700);

  const configPath = join(options.targetHome, "config.toml");
  const credentialPath = join(credentialDirectory, "kimi-code.json");
  const projectedConfig = [
    `default_model = "${FIXED_MODEL}"`,
    `[models."${FIXED_MODEL}"]`,
    `provider = "${FIXED_PROVIDER}"`,
    'model = "k3-256k"',
    `[providers."${FIXED_PROVIDER}"]`,
    'type = "managed"',
    `base_url = "${FIXED_BASE_URL}"`,
    `[providers."${FIXED_PROVIDER}".oauth]`,
    'storage = "file"',
    'key = "kimi-code"',
    ""
  ].join("\n");
  await exclusiveWrite(configPath, projectedConfig);
  await exclusiveWrite(credentialPath, `${JSON.stringify(credential)}\n`);
  return { configPath, credentialPath };
}
