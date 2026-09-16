import { describe, expect, it } from "vitest";
import {
  capabilityPackageSchema,
  deploymentPlanIdSchema,
  deploymentPlanSchema,
  packageFileSchema,
  packageIdSchema,
  p4ErrorCodeSchema,
  projectionEntrySchema,
  semverSchema,
  slugSchema
} from "./schemas";

const NOW = "2026-09-16T05:30:00.000Z";
const DIGEST = "a".repeat(64);

function validPackage(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    package_id: `pkg_${"1".repeat(32)}`,
    release_id: `rel_${"2".repeat(32)}`,
    release_version: 1,
    version: "1.2.3",
    slug: "pdf-table-extract",
    kind: "skill",
    title: "PDF Table Extraction",
    description: "Extract tables from PDF files into structured rows.",
    triggers: ["extract table", "pdf to csv"],
    non_triggers: ["edit pdf"],
    instructions: "Read the PDF, locate tables, emit CSV rows.",
    permissions: ["read_file"],
    dependencies: [{ name: "pdf-parse", version: "^2.0.0" }],
    compatibility: { hosts: ["codex", "claude", "hermes"] },
    resources: [{
      resource_id: "column-mapping",
      media_type: "text/markdown",
      sha256: DIGEST,
      bytes: 120
    }],
    evidence: [{
      evidence_id: `ev_${"3".repeat(32)}`,
      citation: "github.com/acme/pdf-tool README",
      digest: DIGEST
    }],
    lineage: [{
      record_id: `cand_${"4".repeat(32)}`,
      record_kind: "candidate",
      version: 1,
      digest: DIGEST
    }],
    license: { spdx_id: "MIT", source_url: "https://example.com/LICENSE", provenance_confidence: "high" },
    known_limits: ["scanned PDFs need OCR first"],
    evaluations: [{
      dimension: "capability_value",
      score: 4,
      reason: "Frequent personal need.",
      evaluated_at: NOW
    }],
    created_at: NOW,
    digest: DIGEST,
    ...overrides
  };
}

describe("capabilityPackageSchema", () => {
  it("accepts a valid CapabilityPackageV1", () => {
    expect(capabilityPackageSchema.parse(validPackage()).package_id).toBe(`pkg_${"1".repeat(32)}`);
  });

  it("rejects unknown keys", () => {
    expect(capabilityPackageSchema.safeParse(validPackage({ extra: true })).success).toBe(false);
  });

  it("rejects a non-1 schema_version", () => {
    expect(capabilityPackageSchema.safeParse(validPackage({ schema_version: 2 })).success).toBe(false);
  });

  it("requires strict SemVer without a leading v", () => {
    for (const version of ["1.2.3", "0.0.1", "1.0.0-alpha.1", "2.1.0+build.5"]) {
      expect(capabilityPackageSchema.safeParse(validPackage({ version })).success).toBe(true);
    }
    for (const version of ["v1.2.3", "1.2", "1.2.3.4", "1.02.3", "1.2.3-", ""]) {
      expect(capabilityPackageSchema.safeParse(validPackage({ version })).success).toBe(false);
    }
  });

  it("requires a lowercase kebab-case slug of 1..80 characters", () => {
    for (const slug of ["a", "pdf-table", "a1-b2", "x".repeat(80)]) {
      expect(capabilityPackageSchema.safeParse(validPackage({ slug })).success).toBe(true);
    }
    for (const slug of ["PDF-Table", "pdf_table", "-pdf", "pdf-", "pdf--table", "", "x".repeat(81), "pdf table"]) {
      expect(capabilityPackageSchema.safeParse(validPackage({ slug })).success).toBe(false);
    }
  });

  it("accepts only the three package kinds", () => {
    for (const kind of ["skill", "experience_card", "reference"]) {
      expect(capabilityPackageSchema.safeParse(validPackage({ kind })).success).toBe(true);
    }
    expect(capabilityPackageSchema.safeParse(validPackage({ kind: "plugin" })).success).toBe(false);
  });

  it("requires package_id, release_id, and digest in exact formats", () => {
    expect(capabilityPackageSchema.safeParse(validPackage({ package_id: "pkg_short" })).success).toBe(false);
    expect(capabilityPackageSchema.safeParse(validPackage({ package_id: `PKG_${"1".repeat(32)}` })).success).toBe(false);
    expect(capabilityPackageSchema.safeParse(validPackage({ release_id: `rel_${"z".repeat(32)}` })).success).toBe(false);
    expect(capabilityPackageSchema.safeParse(validPackage({ digest: "not-hex" })).success).toBe(false);
    expect(capabilityPackageSchema.safeParse(validPackage({ digest: "A".repeat(64) })).success).toBe(false);
  });

  it("requires an exact RFC 3339 timestamp with offset", () => {
    expect(capabilityPackageSchema.safeParse(validPackage({ created_at: NOW })).success).toBe(true);
    expect(capabilityPackageSchema.safeParse(validPackage({ created_at: "2026-09-16 05:30:00" })).success).toBe(false);
    expect(capabilityPackageSchema.safeParse(validPackage({ created_at: "2026-09-16T05:30:00.000" })).success).toBe(false);
  });

  it("rejects absolute local paths, approval phrases, and secret-shaped tokens in protected text", () => {
    expect(capabilityPackageSchema.safeParse(validPackage({ instructions: "Read /Users/owner/secret-notes.md first." })).success).toBe(false);
    expect(capabilityPackageSchema.safeParse(validPackage({ description: "APPROVE CANDIDATE 12345678 to enable." })).success).toBe(false);
    expect(capabilityPackageSchema.safeParse(validPackage({ instructions: "Use token sk-abcdef1234567890abcdef1234567890abcdef12 now." })).success).toBe(false);
    expect(capabilityPackageSchema.safeParse(validPackage({ known_limits: ["needs /home/owner/vault access"] })).success).toBe(false);
    expect(capabilityPackageSchema.safeParse(validPackage({ title: "C:\\Users\\owner\\tool" })).success).toBe(false);
  });

  it("requires evaluation scores to be integers between 0 and 5", () => {
    expect(capabilityPackageSchema.safeParse(validPackage({
      evaluations: [{ dimension: "novelty", score: 5, reason: "r", evaluated_at: NOW }]
    })).success).toBe(true);
    expect(capabilityPackageSchema.safeParse(validPackage({
      evaluations: [{ dimension: "novelty", score: 6, reason: "r", evaluated_at: NOW }]
    })).success).toBe(false);
    expect(capabilityPackageSchema.safeParse(validPackage({
      evaluations: [{ dimension: "Novelty!", score: 3, reason: "r", evaluated_at: NOW }]
    })).success).toBe(false);
  });

  it("requires license provenance confidence to be high, medium, or low", () => {
    for (const provenance_confidence of ["high", "medium", "low"]) {
      expect(capabilityPackageSchema.safeParse(validPackage({
        license: { spdx_id: "MIT", provenance_confidence }
      })).success).toBe(true);
    }
    expect(capabilityPackageSchema.safeParse(validPackage({
      license: { spdx_id: "MIT", provenance_confidence: "unknown" }
    })).success).toBe(false);
  });
});

describe("packageFileSchema", () => {
  const FILE_DIGEST = "13e04580c3f98fb192e91fc9e31e8ef1824c82e228978be1c1ad94476f0cccdf";
  const validFile = {
    path: "packages/pdf-table-extract/1.2.3/instructions.md",
    media_type: "text/markdown",
    content: "# Instructions\n",
    sha256: FILE_DIGEST,
    bytes: 15
  };

  it("accepts a valid text-only package file", () => {
    expect(packageFileSchema.parse(validFile).path).toBe(validFile.path);
  });

  it("accepts only the three text media types", () => {
    for (const media_type of ["text/markdown", "application/yaml", "application/json"]) {
      expect(packageFileSchema.safeParse({ ...validFile, media_type }).success).toBe(true);
    }
    for (const media_type of ["application/octet-stream", "image/png", "text/html", "application/x-sh"]) {
      expect(packageFileSchema.safeParse({ ...validFile, media_type }).success).toBe(false);
    }
  });

  it("rejects absolute paths, parent traversal, backslashes, and dot-only segments", () => {
    for (const path of ["/abs/path.md", "a/../../b.md", "a\\b.md", "a/./b.md", "./a.md", "a//b.md", "a/", "a/b ", "a/b."]) {
      expect(packageFileSchema.safeParse({ ...validFile, path }).success).toBe(false);
    }
  });

  it("rejects control characters, NUL bytes, and empty paths", () => {
    for (const path of ["", "a/b\u0000c.md", "a/b\tc.md", "a/b\nc.md"]) {
      expect(packageFileSchema.safeParse({ ...validFile, path }).success).toBe(false);
    }
  });

  it("rejects platform-reserved path components", () => {
    for (const path of ["CON.md", "a/PRN", "a/con.txt", "aux/b.md", "a/NUL.md", "a/LPT1.md", "COM9.md"]) {
      expect(packageFileSchema.safeParse({ ...validFile, path }).success).toBe(false);
    }
  });

  it("rejects mismatched byte counts and incorrect content digests", () => {
    expect(packageFileSchema.safeParse({ ...validFile, bytes: 14 }).success).toBe(false);
    expect(packageFileSchema.safeParse({ ...validFile, bytes: 16 }).success).toBe(false);
    expect(packageFileSchema.safeParse({ ...validFile, sha256: "b".repeat(64) }).success).toBe(false);
  });

  it("requires sha256 to be lowercase 64-character hex", () => {
    expect(packageFileSchema.safeParse({ ...validFile, sha256: "Z".repeat(64) }).success).toBe(false);
    expect(packageFileSchema.safeParse({ ...validFile, sha256: "abc" }).success).toBe(false);
  });
});

describe("deploymentPlanSchema", () => {
  const validPlan = {
    schema_version: 1,
    action: "publish",
    target: "codex",
    target_alias: "codex-primary",
    release: { record_id: `rel_${"2".repeat(32)}`, version: 1, digest: DIGEST },
    adapter: { name: "codex", version: "1.0.0", digest: DIGEST },
    preview_manifest_digest: DIGEST,
    preview_diff_digest: DIGEST,
    expected_current_pointer: null,
    target_preimage_digest: DIGEST,
    created_at: NOW
  };

  it("accepts a valid publish DeploymentPlanV1", () => {
    expect(deploymentPlanSchema.parse(validPlan).action).toBe("publish");
  });

  it("accepts a rollback plan with an expected current pointer", () => {
    const pointer = {
      deployment_id: `dep_${"5".repeat(32)}`,
      release_id: `rel_${"6".repeat(32)}`,
      release_version: 1,
      release_digest: DIGEST,
      pointer_digest: DIGEST
    };
    expect(deploymentPlanSchema.safeParse({
      ...validPlan,
      action: "rollback",
      target: "obsidian",
      expected_current_pointer: pointer
    }).success).toBe(true);
  });

  it("rejects unknown targets, actions, and unknown keys", () => {
    expect(deploymentPlanSchema.safeParse({ ...validPlan, target: "mcp" }).success).toBe(false);
    expect(deploymentPlanSchema.safeParse({ ...validPlan, action: "preview" }).success).toBe(false);
    expect(deploymentPlanSchema.safeParse({ ...validPlan, extra: 1 }).success).toBe(false);
  });

  it("requires a bounded target alias", () => {
    expect(deploymentPlanSchema.safeParse({ ...validPlan, target_alias: "" }).success).toBe(false);
    expect(deploymentPlanSchema.safeParse({ ...validPlan, target_alias: "x".repeat(65) }).success).toBe(false);
    expect(deploymentPlanSchema.safeParse({ ...validPlan, target_alias: "/tmp/vault" }).success).toBe(false);
  });
});

describe("projectionEntrySchema", () => {
  const validEntry = {
    schema_version: 1,
    record_id: `rel_${"2".repeat(32)}`,
    record_version: 1,
    record_digest: DIGEST,
    relative_path: "Caphub/20 Capabilities/pdf-table-extract.md",
    managed_digest: DIGEST,
    preimage_digest: null,
    postimage_digest: DIGEST,
    action: "create",
    conflict_reason: null
  };

  it("accepts every projection action", () => {
    for (const action of ["create", "update", "unchanged", "conflict", "orphan"] as const) {
      const entry: Record<string, unknown> = { ...validEntry, action };
      if (action === "conflict") entry.conflict_reason = "missing markers";
      expect(projectionEntrySchema.safeParse(entry).success).toBe(true);
    }
  });

  it("requires a conflict reason exactly when the action is conflict", () => {
    expect(projectionEntrySchema.safeParse({ ...validEntry, action: "conflict", conflict_reason: "missing markers" }).success).toBe(true);
    expect(projectionEntrySchema.safeParse({ ...validEntry, action: "conflict" }).success).toBe(false);
    expect(projectionEntrySchema.safeParse({ ...validEntry, action: "create", conflict_reason: "nope" }).success).toBe(false);
  });

  it("rejects unsafe relative paths and unknown keys", () => {
    expect(projectionEntrySchema.safeParse({ ...validEntry, relative_path: "../escape.md" }).success).toBe(false);
    expect(projectionEntrySchema.safeParse({ ...validEntry, relative_path: "/abs.md" }).success).toBe(false);
    expect(projectionEntrySchema.safeParse({ ...validEntry, extra: true }).success).toBe(false);
  });
});

describe("primitive schemas", () => {
  it("semverSchema accepts strict SemVer only", () => {
    expect(semverSchema.safeParse("1.2.3").success).toBe(true);
    expect(semverSchema.safeParse("v1.2.3").success).toBe(false);
    expect(semverSchema.safeParse("1.2").success).toBe(false);
  });

  it("slugSchema accepts lowercase kebab-case only", () => {
    expect(slugSchema.safeParse("a-b1").success).toBe(true);
    expect(slugSchema.safeParse("A").success).toBe(false);
  });

  it("package and deployment-plan IDs use their exact prefixes", () => {
    expect(packageIdSchema.safeParse(`pkg_${"1".repeat(32)}`).success).toBe(true);
    expect(packageIdSchema.safeParse(`rel_${"1".repeat(32)}`).success).toBe(false);
    expect(deploymentPlanIdSchema.safeParse(`dpl_${"1".repeat(32)}`).success).toBe(true);
    expect(deploymentPlanIdSchema.safeParse(`dep_${"1".repeat(32)}`).success).toBe(false);
  });

  it("p4ErrorCodeSchema lists every stable P4 error code", () => {
    for (const code of [
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
    ]) {
      expect(p4ErrorCodeSchema.safeParse(code).success).toBe(true);
    }
    expect(p4ErrorCodeSchema.safeParse("SOMETHING_ELSE").success).toBe(false);
  });
});
