import { createHash } from "node:crypto";
import { z } from "zod";
import { sha256DigestSchema } from "../analysis/schemas";
import { registryRecordIdSchema } from "../registry/schemas";

const timestampSchema = z.string().datetime({ offset: true });

export const semverSchema = z.string().regex(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
  "version must be strict SemVer without a leading v"
);

export const slugSchema = z.string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");

export const packageIdSchema = z.string().regex(/^pkg_[a-f0-9]{32}$/);
export const deploymentPlanIdSchema = z.string().regex(/^dpl_[a-f0-9]{32}$/);

export const p4ErrorCodeSchema = z.enum([
  "P4_EXPORT_DISABLED",
  "INVALID_PACKAGE",
  "PACKAGE_DIGEST_CONFLICT",
  "PROJECTION_CONFLICT",
  "UNSAFE_TARGET_ROOT",
  "STALE_PREIMAGE",
  "ADAPTER_UNSUPPORTED",
  "DEPLOYMENT_NOT_APPROVED",
  "DEPLOYMENT_ALREADY_CONSUMED",
  "STALE_DEPLOYMENT",
  "PUBLISH_RECOVERY_REQUIRED"
]);

const ABSOLUTE_PATH_PATTERN = /(?:^|[\s"'(=:`])(?:\/(?:Users|home|root|tmp|var|etc|opt|private)\/|~\/|[A-Za-z]:[\\/])/;
const APPROVAL_PHRASE_PATTERN = /\b(?:APPROVE|ACCEPT|REJECT|REVOKE) (?:CANDIDATE|BUILD|IMPLEMENTATION|RELEASE|UPDATE|DEPLOYMENT) [a-f0-9]{8}\b/;
const SECRET_TOKEN_PATTERN = /(?:sk-[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

function rejectUnsafeText(value: string): boolean {
  return !ABSOLUTE_PATH_PATTERN.test(value)
    && !APPROVAL_PHRASE_PATTERN.test(value)
    && !SECRET_TOKEN_PATTERN.test(value);
}

const packageTextSchema = (max: number) => z.string()
  .min(1)
  .max(max)
  .refine(rejectUnsafeText, "text must not contain absolute local paths, approval phrases, or secret-shaped tokens");

const packageListTextSchema = (max: number, itemMax: number) => z.array(packageTextSchema(itemMax)).max(max);

export const packageDependencySchema = z.object({
  name: z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]*$/, "dependency name must be a safe package name"),
  version: z.string().min(1).max(64)
}).strict();

export const packageCompatibilitySchema = z.object({
  hosts: z.array(z.string().min(1).max(32)).min(1).max(8)
}).strict();

export const packageResourceSchema = z.object({
  resource_id: slugSchema,
  media_type: z.literal("text/markdown"),
  sha256: sha256DigestSchema,
  bytes: z.number().int().positive().max(1_048_576)
}).strict();

export const packageEvidenceRefSchema = z.object({
  evidence_id: z.string().regex(/^ev_[a-f0-9]{32}$/),
  citation: packageTextSchema(500),
  digest: sha256DigestSchema
}).strict();

export const packageLineageRefSchema = z.object({
  record_id: registryRecordIdSchema,
  record_kind: z.string().min(1).max(64),
  version: z.number().int().positive(),
  digest: sha256DigestSchema
}).strict();

export const packageLicenseSchema = z.object({
  spdx_id: z.string().min(1).max(64),
  source_url: z.string().url().startsWith("https://").max(500).optional(),
  provenance_confidence: z.enum(["high", "medium", "low"])
}).strict();

export const packageEvaluationSchema = z.object({
  dimension: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, "dimension must be snake_case"),
  score: z.number().int().min(0).max(5),
  reason: packageTextSchema(1_000),
  evaluated_at: timestampSchema
}).strict();

export const capabilityPackageSchema = z.object({
  schema_version: z.literal(1),
  package_id: packageIdSchema,
  release_id: z.string().regex(/^rel_[a-f0-9]{32}$/),
  release_version: z.number().int().positive(),
  version: semverSchema,
  slug: slugSchema,
  kind: z.enum(["skill", "experience_card", "reference"]),
  title: packageTextSchema(200),
  description: packageTextSchema(2_000),
  triggers: packageListTextSchema(32, 200),
  non_triggers: packageListTextSchema(32, 200),
  instructions: packageTextSchema(100_000),
  permissions: z.array(z.string().min(1).max(64)).max(32),
  dependencies: z.array(packageDependencySchema).max(32),
  compatibility: packageCompatibilitySchema,
  resources: z.array(packageResourceSchema).max(64),
  evidence: z.array(packageEvidenceRefSchema).max(64),
  lineage: z.array(packageLineageRefSchema).max(64),
  license: packageLicenseSchema,
  known_limits: packageListTextSchema(32, 1_000),
  evaluations: z.array(packageEvaluationSchema).max(16),
  created_at: timestampSchema,
  digest: sha256DigestSchema
}).strict();

const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;
const RESERVED_SEGMENT_PATTERN = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

export function isSafeRelativePackagePath(path: string): boolean {
  if (path.length === 0 || path.length > 512) return false;
  if (path.startsWith("/") || path.endsWith("/")) return false;
  if (path.includes("\\") || CONTROL_CHAR_PATTERN.test(path)) return false;
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment.length === 0) return false;
    if (segment === "." || segment === "..") return false;
    if (segment.startsWith(" ") || segment.endsWith(" ") || segment.endsWith(".")) return false;
    if (RESERVED_SEGMENT_PATTERN.test(segment)) return false;
  }
  return true;
}

export const packageFilePathSchema = z.string()
  .superRefine((path, context) => {
    if (!isSafeRelativePackagePath(path)) {
      context.addIssue({ code: "custom", path: [], message: "path must be a normalized relative POSIX path" });
    }
  });

export const packageFileSchema = z.object({
  path: packageFilePathSchema,
  media_type: z.enum(["text/markdown", "application/yaml", "application/json"]),
  content: z.string(),
  sha256: sha256DigestSchema,
  bytes: z.number().int().nonnegative()
}).strict().superRefine((file, context) => {
  const contentBytes = Buffer.byteLength(file.content, "utf8");
  if (file.bytes !== contentBytes) {
    context.addIssue({ code: "custom", path: ["bytes"], message: "bytes must equal the UTF-8 content length" });
  }
  if (createHash("sha256").update(file.content, "utf8").digest("hex") !== file.sha256) {
    context.addIssue({ code: "custom", path: ["sha256"], message: "sha256 must equal the UTF-8 content digest" });
  }
});

export const deploymentTargetSchema = z.enum(["codex", "claude", "hermes", "obsidian"]);

const targetAliasSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "target alias must be a bounded alias without path separators");

export const deploymentPlanSchema = z.object({
  schema_version: z.literal(1),
  action: z.enum(["publish", "rollback"]),
  target: deploymentTargetSchema,
  target_alias: targetAliasSchema,
  release: z.object({
    record_id: z.string().regex(/^rel_[a-f0-9]{32}$/),
    version: z.number().int().positive(),
    digest: sha256DigestSchema
  }).strict(),
  adapter: z.object({
    name: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/, "adapter name must be a bounded safe identifier"),
    version: semverSchema,
    digest: sha256DigestSchema
  }).strict(),
  preview_manifest_digest: sha256DigestSchema,
  preview_diff_digest: sha256DigestSchema,
  expected_current_pointer: z.object({
    deployment_id: z.string().regex(/^dep_[a-f0-9]{32}$/),
    release_id: z.string().regex(/^rel_[a-f0-9]{32}$/),
    release_version: z.number().int().positive(),
    release_digest: sha256DigestSchema,
    pointer_digest: sha256DigestSchema
  }).strict().nullable(),
  target_preimage_digest: sha256DigestSchema,
  created_at: timestampSchema
}).strict();

export const projectionEntrySchema = z.object({
  schema_version: z.literal(1),
  record_id: registryRecordIdSchema,
  record_version: z.number().int().positive(),
  record_digest: sha256DigestSchema,
  relative_path: packageFilePathSchema,
  managed_digest: sha256DigestSchema,
  preimage_digest: sha256DigestSchema.nullable(),
  postimage_digest: sha256DigestSchema,
  action: z.enum(["create", "update", "unchanged", "conflict", "orphan"]),
  conflict_reason: z.string().min(1).max(300).nullable()
}).strict().superRefine((entry, context) => {
  if ((entry.action === "conflict") !== (entry.conflict_reason !== null)) {
    context.addIssue({
      code: "custom",
      path: ["conflict_reason"],
      message: "conflict_reason is required exactly when the action is conflict"
    });
  }
});
