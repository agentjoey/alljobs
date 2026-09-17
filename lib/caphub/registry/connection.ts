import "server-only";

import { lstatSync, realpathSync } from "node:fs";
import { isIP } from "node:net";
import { isAbsolute, join } from "node:path";

export type RegistryConnectionMode = "local_socket" | "tls_verify_full";
export type RegistryConnectionRole = "application" | "migration";

export interface ParsedRegistryConnection {
  host: string;
  port: number;
  database: "caphub";
  user: "caphub_app" | "caphub_migrator";
  password?: string;
  ssl: false | { rejectUnauthorized: true };
}

const LOCAL_REGISTRY_PORT = 54_329;
const UNSAFE_DIRECTORY_WRITE_BITS = 0o022;

function expectedUser(role: RegistryConnectionRole): ParsedRegistryConnection["user"] {
  return role === "application" ? "caphub_app" : "caphub_migrator";
}

function parsePostgresUrl(databaseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Registry database URL is invalid");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Registry database URL must use PostgreSQL");
  }
  return parsed;
}

function assertPrivateOwnedCanonicalDirectory(path: string): void {
  if (!isAbsolute(path)) throw new Error("Registry socket path must be absolute");
  const metadata = lstatSync(path);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== currentUid
    || (metadata.mode & UNSAFE_DIRECTORY_WRITE_BITS) !== 0 || realpathSync(path) !== path) {
    throw new Error("Registry socket path must be a private owned canonical directory");
  }
}

function parseLocalSocketConnection(input: {
  parsed: URL;
  role: RegistryConnectionRole;
  resolvedHome: string;
}): ParsedRegistryConnection {
  assertPrivateOwnedCanonicalDirectory(input.resolvedHome);
  const socketDir = join(input.resolvedHome, "run", "caphub-postgres");
  assertPrivateOwnedCanonicalDirectory(socketDir);

  const user = expectedUser(input.role);
  const parameters = [...input.parsed.searchParams.keys()];
  const exactParameters = parameters.length === 2
    && input.parsed.searchParams.getAll("host").length === 1
    && input.parsed.searchParams.getAll("port").length === 1
    && parameters.every((key) => key === "host" || key === "port");
  if (input.parsed.username !== user || input.parsed.password !== ""
    || input.parsed.hostname !== "localhost" || input.parsed.port !== ""
    || input.parsed.pathname !== "/caphub" || input.parsed.hash !== ""
    || !exactParameters || input.parsed.searchParams.get("host") !== socketDir
    || input.parsed.searchParams.get("port") !== String(LOCAL_REGISTRY_PORT)) {
    throw new Error("Registry local-socket URL does not match the bounded Control Host contract");
  }

  return {
    host: socketDir,
    port: LOCAL_REGISTRY_PORT,
    database: "caphub",
    user,
    ssl: false
  };
}

function decodeCredential(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("Registry database credentials are not valid URL encoding");
  }
}

function assertManagedDnsHostname(hostname: string): void {
  const unwrapped = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const labels = unwrapped.split(".");
  if (!unwrapped || unwrapped === "localhost" || unwrapped.endsWith(".") || isIP(unwrapped) !== 0
    || unwrapped.length > 253 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    throw new Error("Registry TLS mode requires a non-loopback DNS hostname");
  }
}

function parseTlsConnection(input: {
  parsed: URL;
  role: RegistryConnectionRole;
}): ParsedRegistryConnection {
  const user = expectedUser(input.role);
  assertManagedDnsHostname(input.parsed.hostname);
  if (input.parsed.username !== user || input.parsed.password === ""
    || input.parsed.pathname !== "/caphub" || input.parsed.hash !== ""
    || [...input.parsed.searchParams.keys()].length !== 0) {
    throw new Error("Registry TLS URL does not match the bounded managed-database contract");
  }

  const port = input.parsed.port === "" ? 5_432 : Number(input.parsed.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Registry TLS port is invalid");
  }

  return {
    host: input.parsed.hostname,
    port,
    database: "caphub",
    user,
    password: decodeCredential(input.parsed.password),
    ssl: { rejectUnauthorized: true }
  };
}

export function parseRegistryConnection(input: {
  databaseUrl: string;
  mode: RegistryConnectionMode;
  role: RegistryConnectionRole;
  resolvedHome: string;
}): ParsedRegistryConnection {
  const parsed = parsePostgresUrl(input.databaseUrl);
  return input.mode === "local_socket"
    ? parseLocalSocketConnection({ parsed, role: input.role, resolvedHome: input.resolvedHome })
    : parseTlsConnection({ parsed, role: input.role });
}
