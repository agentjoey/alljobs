import { isIP } from "node:net";
import { Pool } from "pg";
import {
  createNeonS3CommandPort,
  parseNeonS3Environment,
  type NeonS3EnvironmentRefs,
  type S3ImmutableCommandPort
} from "../../lib/caphub/storage/neon-s3";

type ValidationSide = "source" | "recovery";

interface NeonValidationSideFixture {
  alias: string;
  pool: Pool;
  objectPort: S3ImmutableCommandPort;
}

export interface NeonValidationFixtureReferences {
  source: { alias: string; databaseUrl: string; storage: Record<string, string | undefined> };
  recovery: { alias: string; databaseUrl: string; storage: Record<string, string | undefined> };
}

export interface NeonValidationFixture {
  source: NeonValidationSideFixture;
  recovery: NeonValidationSideFixture;
}

const requiredNames = [
  "CAPHUB_NEON_VALIDATION_BRANCH_ALIAS",
  "CAPHUB_NEON_VALIDATION_DATABASE_URL",
  "CAPHUB_NEON_VALIDATION_S3_ACCESS_KEY_ID",
  "CAPHUB_NEON_VALIDATION_S3_SECRET_ACCESS_KEY",
  "CAPHUB_NEON_VALIDATION_S3_ENDPOINT",
  "CAPHUB_NEON_VALIDATION_S3_REGION",
  "CAPHUB_NEON_RECOVERY_BRANCH_ALIAS",
  "CAPHUB_NEON_RECOVERY_DATABASE_URL",
  "CAPHUB_NEON_RECOVERY_S3_ACCESS_KEY_ID",
  "CAPHUB_NEON_RECOVERY_S3_SECRET_ACCESS_KEY",
  "CAPHUB_NEON_RECOVERY_S3_ENDPOINT",
  "CAPHUB_NEON_RECOVERY_S3_REGION"
] as const;

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name];
  if (!value || value.length > 4_096) throw new Error(`Missing required non-Production validation reference: ${name}`);
  return value;
}

function isSafeNonProductionAlias(value: string): boolean {
  return /^[a-z][a-z0-9-]{2,63}$/i.test(value) && !["production", "prod", "main", "default"].includes(value.toLowerCase());
}

function storageRefs(side: ValidationSide): NeonS3EnvironmentRefs {
  const prefix = side === "source" ? "CAPHUB_NEON_VALIDATION" : "CAPHUB_NEON_RECOVERY";
  return {
    accessKeyIdEnv: `${prefix}_S3_ACCESS_KEY_ID`,
    secretAccessKeyEnv: `${prefix}_S3_SECRET_ACCESS_KEY`,
    endpointEnv: `${prefix}_S3_ENDPOINT`,
    regionEnv: `${prefix}_S3_REGION`
  };
}

function openValidationPool(databaseUrl: string): Pool {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Validation database URL is invalid");
  }
  const allowedParameters = new Set(["sslmode", "channel_binding"]);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || parsed.username !== "caphub_app" || parsed.password === "" || parsed.pathname !== "/caphub"
    || !parsed.hostname.endsWith(".neon.tech") || isIP(parsed.hostname) !== 0 || parsed.hash !== ""
    || [...parsed.searchParams.keys()].some((key) => !allowedParameters.has(key))) {
    throw new Error("Validation database URL does not meet the non-Production TLS contract");
  }
  const port = parsed.port === "" ? 5_432 : Number(parsed.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("Validation database port is invalid");
  return new Pool({
    host: parsed.hostname,
    port,
    database: "caphub",
    user: "caphub_app",
    password: decodeURIComponent(parsed.password),
    ssl: { rejectUnauthorized: true },
    max: 1,
    statement_timeout: 5_000,
    application_name: "alljobs-caphub-neon-validation"
  });
}

function sideFixture(
  side: ValidationSide,
  input: { alias: string; databaseUrl: string; storage: Record<string, string | undefined> }
): NeonValidationSideFixture {
  if (!isSafeNonProductionAlias(input.alias)) throw new Error("Validation branch alias must name a non-Production branch");
  const environment = parseNeonS3Environment({ bucket: "caphub-objects", refs: storageRefs(side), env: input.storage });
  return {
    alias: input.alias,
    pool: openValidationPool(input.databaseUrl),
    objectPort: createNeonS3CommandPort(environment)
  };
}

export function readNeonValidationFixture(
  env: Readonly<Record<string, string | undefined>> = process.env
): NeonValidationFixtureReferences | null {
  if (requiredNames.some((name) => !env[name])) return null;
  const sourceAlias = required(env, "CAPHUB_NEON_VALIDATION_BRANCH_ALIAS");
  const recoveryAlias = required(env, "CAPHUB_NEON_RECOVERY_BRANCH_ALIAS");
  if (sourceAlias === recoveryAlias) throw new Error("Validation and recovery branch aliases must differ");
  return {
    source: {
      alias: sourceAlias,
      databaseUrl: required(env, "CAPHUB_NEON_VALIDATION_DATABASE_URL"),
      storage: { ...env }
    },
    recovery: {
      alias: recoveryAlias,
      databaseUrl: required(env, "CAPHUB_NEON_RECOVERY_DATABASE_URL"),
      storage: { ...env }
    }
  };
}

export function createNeonValidationFixture(references: NeonValidationFixtureReferences): NeonValidationFixture {
  return {
    source: sideFixture("source", references.source),
    recovery: sideFixture("recovery", references.recovery)
  };
}

export function validationEvidence(
  fixture: NeonValidationFixtureReferences,
  result: { sourceDigest: string; objectCount: number; passed: boolean }
): { sourceAlias: string; recoveryAlias: string; sourceDigest: string; objectCount: number; passed: boolean } {
  return {
    sourceAlias: fixture.source.alias,
    recoveryAlias: fixture.recovery.alias,
    sourceDigest: result.sourceDigest,
    objectCount: result.objectCount,
    passed: result.passed
  };
}
