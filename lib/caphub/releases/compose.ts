import { createHash } from "node:crypto";
import { z } from "zod";
import { capabilityCandidateSchema, reviewPacketSchema } from "../analysis/schemas";
import { digestCanonicalJson } from "../analysis/digest";
import { capabilityPackageSchema, slugSchema } from "../packages/schemas";
import type { PackageLicense } from "../packages/types";
import { packageContentDigest } from "../packages/digest";
import type { CapabilityPackage, P4ErrorCode } from "../packages/types";
import type { RegistryVersion } from "../registry/types";

export type ComposeDisposition = "adopt" | "adapt" | "learn";
export type LearnKind = "experience_card" | "reference";

const LICENSE_IDENTIFIERS: Array<[RegExp, string]> = [
  [/apache(?: license)?[- ]?2/i, "Apache-2.0"],
  [/\bmit\b/i, "MIT"],
  [/gpl[- ]?3/i, "GPL-3.0"],
  [/gpl[- ]?2/i, "GPL-2.0"],
  [/bsd[- ]?3/i, "BSD-3-Clause"],
  [/bsd[- ]?2/i, "BSD-2-Clause"],
  [/mpl[- ]?2/i, "MPL-2.0"],
  [/\bisc\b/i, "ISC"],
  [/cc0/i, "CC0-1.0"],
  [/cc[- ]?by[- ]?sa/i, "CC-BY-SA-4.0"],
  [/cc[- ]?by/i, "CC-BY-4.0"],
  [/wtfpl/i, "WTFPL"],
  [/unlicense/i, "Unlicense"]
];

/**
 * Maps a dossier license declaration to a package license. Returns null when
 * the declaration cannot be matched to a known identifier; the composer
 * blocks rather than inventing a license.
 */
export function licenseFromDossierText(licenseText: string): PackageLicense | null {
  for (const [pattern, spdx_id] of LICENSE_IDENTIFIERS) {
    if (pattern.test(licenseText)) {
      return { spdx_id, provenance_confidence: "medium" };
    }
  }
  return null;
}

export interface ComposeCapabilityPackageInput {
  candidateVersion: RegistryVersion;
  reviewPacket: unknown;
  disposition: ComposeDisposition | "build" | "watch";
  learnKind?: LearnKind;
  license: PackageLicense | null;
  now: string;
}

export type ComposeCapabilityPackageResult =
  | { ok: true; pkg: CapabilityPackage; diagnostics: string[] }
  | { ok: false; code: P4ErrorCode; diagnostics: string[] };

const DIMENSION_ORDER = [
  "personal_fit",
  "capability_value",
  "evidence_confidence",
  "novelty",
  "reusability",
  "portability",
  "maturity",
  "maintenance_burden",
  "security_risk",
  "adoption_cost"
] as const;

export function slugifyCapabilityName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  if (slug.length > 0) return slug;
  return `capability-${createHash("sha256").update(name, "utf8").digest("hex").slice(0, 8)}`;
}

export function deriveReleaseId(
  candidateVersion: Pick<RegistryVersion, "record_id" | "version" | "payload_digest">,
  disposition: ComposeDisposition,
  learnKind: LearnKind | undefined
): string {
  return `rel_${digestCanonicalJson({
    schema_version: 1,
    candidate: {
      record_id: candidateVersion.record_id,
      version: candidateVersion.version,
      digest: candidateVersion.payload_digest
    },
    disposition,
    learn_kind: learnKind ?? null
  }).slice(0, 32)}`;
}

export function derivePackageId(releaseId: string, contentDigest: string): string {
  return `pkg_${digestCanonicalJson({ schema_version: 1, release_id: releaseId, content_digest: contentDigest }).slice(0, 32)}`;
}

function fail(code: P4ErrorCode, diagnostics: string[]): ComposeCapabilityPackageResult {
  return { ok: false, code, diagnostics };
}

export function composeCapabilityPackage(input: ComposeCapabilityPackageInput): ComposeCapabilityPackageResult {
  const candidate = capabilityCandidateSchema.parse(input.candidateVersion.payload);
  if (digestCanonicalJson(candidate) !== input.candidateVersion.payload_digest) {
    throw new Error("candidate payload digest does not match the immutable version");
  }
  const packet = reviewPacketSchema.parse(input.reviewPacket);

  if (input.disposition === "watch" || input.disposition === "build") {
    return fail("INVALID_PACKAGE", [
      `disposition "${input.disposition}" does not compose a Capability Package${input.disposition === "build" ? "; build is implemented in P5" : ""}`
    ]);
  }
  if (input.disposition === "learn" && !input.learnKind) {
    return fail("INVALID_PACKAGE", ["learn disposition requires an explicit learnKind of experience_card or reference"]);
  }
  if (!input.license) {
    return fail("INVALID_PACKAGE", ["license is missing; compose requires an explicitly supplied license"]);
  }
  if (packet.evidence.length === 0) {
    return fail("INVALID_PACKAGE", ["review packet carries no evidence; a Release requires at least one evidence reference"]);
  }

  const kind = input.disposition === "learn" ? input.learnKind! : "skill";
  const slug = slugifyCapabilityName(candidate.name);
  if (!slugSchema.safeParse(slug).success) {
    return fail("INVALID_PACKAGE", [`candidate name "${candidate.name}" cannot produce a safe slug`]);
  }

  const joinList = (items: string[]) => (items.length > 0 ? items.join("; ") : "none recorded");
  const instructions = [
    `Purpose: ${packet.disposition_reason}`,
    `Use when: ${joinList(candidate.novel_capabilities)}.`,
    `Avoid when: ${joinList(candidate.capability_gaps)}.`,
    `Complements: ${joinList(candidate.complements)}.`,
    `Alternatives considered: ${joinList(packet.alternatives.map((item) => item.name))}.`,
    `Open questions: ${joinList(packet.unresolved_questions)}.`
  ].join("\n");

  const diagnostics = [
    "permissions are not declared in the source packet; the package declares none",
    "dependencies are not resolved in P4; the package declares none"
  ];

  const draft = {
    schema_version: 1,
    package_id: "",
    release_id: deriveReleaseId(input.candidateVersion, input.disposition, input.learnKind),
    release_version: 1,
    version: "1.0.0",
    slug,
    kind,
    title: candidate.name,
    description: packet.disposition_reason,
    triggers: candidate.novel_capabilities,
    non_triggers: candidate.capability_gaps,
    instructions,
    permissions: [],
    dependencies: [],
    compatibility: { hosts: ["codex", "claude", "hermes"] },
    resources: [],
    evidence: packet.evidence.map((item) => ({
      evidence_id: item.id,
      citation: item.title,
      digest: item.content_digest
    })),
    lineage: [{
      record_id: input.candidateVersion.record_id,
      record_kind: "candidate",
      version: input.candidateVersion.version,
      digest: input.candidateVersion.payload_digest
    }],
    license: input.license,
    known_limits: [...candidate.conflicts_with, ...packet.unresolved_questions],
    evaluations: DIMENSION_ORDER.map((dimension) => ({
      dimension,
      score: packet.dimensions[dimension].score,
      reason: packet.dimensions[dimension].reason,
      evaluated_at: packet.created_at
    })),
    created_at: input.now,
    digest: ""
  };

  // Identity digest first (digest field excluded by canonicalization), then
  // the deterministic package ID, then the final carried digest.
  const identityDigest = packageContentDigest(draft);
  const packageId = derivePackageId(draft.release_id, identityDigest);
  const parsed = capabilityPackageSchema.safeParse({ ...draft, package_id: packageId, digest: "0".repeat(64) });
  if (!parsed.success) {
    return fail("INVALID_PACKAGE", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  const digest = packageContentDigest(parsed.data);
  const pkg: CapabilityPackage = { ...parsed.data, digest, package_id: packageId };
  return { ok: true, pkg, diagnostics };
}
