import { createHash } from "node:crypto";
import { digestCanonicalJson } from "../analysis/digest";
import { packageFileSchema } from "./schemas";
import type { CapabilityPackage, PackageFile, P4ErrorCode } from "./types";

export const RENDER_LIMITS = {
  maxFileBytes: 256 * 1024,
  maxAggregateBytes: 4 * 1024 * 1024
} as const;

const CAPHUB_MARKER_PATTERN = /<!--\s*caphub:/i;

export type RenderResult =
  | { ok: true; files: PackageFile[]; manifest_digest: string }
  | { ok: false; code: P4ErrorCode; diagnostics: string[] };

function fail(code: P4ErrorCode, diagnostics: string[]): RenderResult {
  return { ok: false, code, diagnostics };
}

function normalizeLf(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function assertSafeMarkdown(label: string, text: string, diagnostics: string[]): void {
  if (CAPHUB_MARKER_PATTERN.test(text)) {
    diagnostics.push(`${label} contains a Caphub marker comment`);
  }
  if (normalizeLf(text).trimStart().startsWith("---")) {
    diagnostics.push(`${label} would inject frontmatter at the start of a generated file`);
  }
}

function needsQuoting(value: string): boolean {
  if (value.length === 0) return true;
  if (/[:#\[\]{}&*!|>'"%@`,?]/.test(value)) return true;
  if (/^\s|\s$/.test(value)) return true;
  if (/^(?:-|\?|:)/.test(value)) return true;
  if (/^(?:yes|no|true|false|null|on|off)$/i.test(value)) return true;
  if (/^[-+]?\d+(?:\.\d+)?$/.test(value)) return true;
  if (/^0x[0-9a-f]+$/i.test(value)) return true;
  return false;
}

function yamlScalar(value: string): string {
  if (value.includes("\n")) {
    const body = value.replace(/\n$/, "");
    return `|-\n${body.split("\n").map((line) => `  ${line}`).join("\n")}`;
  }
  return needsQuoting(value) ? JSON.stringify(value) : value;
}

function yamlList(items: string[], indent: string): string {
  if (items.length === 0) return " []";
  return `\n${items.map((item) => {
    const scalar = yamlScalar(item);
    if (scalar.startsWith("|-\n")) {
      return `${indent}- ${scalar}`;
    }
    return `${indent}- ${scalar}`;
  }).join("\n")}`;
}

function packageYaml(pkg: CapabilityPackage): string {
  const lines = [
    `# Capability Package: ${pkg.title}`,
    "schema_version: 1",
    `name: ${yamlScalar(pkg.slug)}`,
    `title: ${yamlScalar(pkg.title)}`,
    `description: ${yamlScalar(pkg.description)}`,
    `version: ${yamlScalar(pkg.version)}`,
    `kind: ${pkg.kind}`,
    `triggers:${yamlList(pkg.triggers, "  ")}`,
    `non_triggers:${yamlList(pkg.non_triggers, "  ")}`,
    `license: ${yamlScalar(pkg.license.spdx_id)}`,
    `license_provenance: ${pkg.license.provenance_confidence}`
  ];
  if (pkg.license.source_url) {
    lines.push(`license_source_url: ${yamlScalar(pkg.license.source_url)}`);
  }
  lines.push(
    `permissions:${yamlList(pkg.permissions, "  ")}`,
    `dependencies:${pkg.dependencies.length === 0 ? " []" : `\n${pkg.dependencies.map((dep) => `  - name: ${yamlScalar(dep.name)}\n    version: ${yamlScalar(dep.version)}`).join("\n")}`}`,
    `compatibility:\n  hosts:${yamlList(pkg.compatibility.hosts, "    ")}`,
    `resources:${pkg.resources.length === 0 ? " []" : ""}`,
    `evidence:${pkg.evidence.length === 0 ? " []" : `\n${pkg.evidence.map((item) => `  - citation: ${yamlScalar(item.citation)}\n    digest: ${item.digest}\n    evidence_id: ${item.evidence_id}`).join("\n")}`}`,
    `known_limits:${yamlList(pkg.known_limits, "  ")}`,
    ""
  );
  return lines.join("\n");
}

function markdownOrList(items: string[], empty: string): string {
  if (items.length === 0) return `${empty}\n`;
  return items.map((item) => `- ${item}`).join("\n") + "\n";
}

function policiesMarkdown(pkg: CapabilityPackage): string {
  return [
    `# Policies: ${pkg.title}`,
    "",
    "## Permissions",
    "",
    markdownOrList(pkg.permissions, "None declared."),
    "",
    "## Dependencies",
    "",
    markdownOrList(pkg.dependencies.map((dep) => `${dep.name} (${dep.version})`), "None declared."),
    "",
    "## Compatibility",
    "",
    markdownOrList(pkg.compatibility.hosts.slice().sort(), "None declared."),
    "",
    "## Known Limits",
    "",
    markdownOrList(pkg.known_limits, "None recorded."),
    ""
  ].join("\n");
}

function acceptanceYaml(pkg: CapabilityPackage): string {
  const lines = ["schema_version: 1", `evaluations:${pkg.evaluations.length === 0 ? " []" : ""}`];
  for (const evaluation of pkg.evaluations) {
    lines.push(
      `  - dimension: ${yamlScalar(evaluation.dimension)}`,
      `    score: ${evaluation.score}`,
      `    reason: ${yamlScalar(evaluation.reason)}`,
      `    evaluated_at: ${yamlScalar(evaluation.evaluated_at)}`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => [key, normalize(item)])
      );
    }
    return input;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

function lineageJson(pkg: CapabilityPackage): string {
  return stableJson({
    schema_version: 1,
    release: {
      record_id: pkg.release_id,
      version: pkg.release_version
    },
    package: {
      package_id: pkg.package_id,
      version: pkg.version
    },
    lineage: pkg.lineage,
    evidence: pkg.evidence,
    license: pkg.license,
    created_at: pkg.created_at
  });
}

function toFile(path: string, mediaType: PackageFile["media_type"], content: string): PackageFile {
  const normalized = normalizeLf(content);
  return packageFileSchema.parse({
    path,
    media_type: mediaType,
    content: normalized,
    sha256: sha256(normalized),
    bytes: Buffer.byteLength(normalized, "utf8")
  });
}

export function renderNeutralPackage(pkg: CapabilityPackage): RenderResult {
  const diagnostics: string[] = [];

  assertSafeMarkdown("instructions", pkg.instructions, diagnostics);
  assertSafeMarkdown("description", pkg.description, diagnostics);
  for (const limit of pkg.known_limits) assertSafeMarkdown("known_limits", limit, diagnostics);
  for (const trigger of [...pkg.triggers, ...pkg.non_triggers]) {
    assertSafeMarkdown("trigger text", trigger, diagnostics);
  }
  if (diagnostics.length > 0) return fail("INVALID_PACKAGE", diagnostics);

  if (pkg.resources.length > 0) {
    const ids = pkg.resources.map((resource) => resource.resource_id);
    if (new Set(ids).size !== ids.length) {
      return fail("INVALID_PACKAGE", ["duplicate resource IDs would collide on output paths"]);
    }
    return fail("INVALID_PACKAGE", [
      "resources are content-addressed pointers in P4 and carry no inline text; refusing to invent reference bytes"
    ]);
  }

  const base = `packages/${pkg.slug}/${pkg.version}`;
  const files: Array<{ path: string; mediaType: PackageFile["media_type"]; content: string }> = [
    { path: `${base}/package.yaml`, mediaType: "application/yaml", content: packageYaml(pkg) },
    { path: `${base}/instructions.md`, mediaType: "text/markdown", content: `# ${pkg.title}\n\n${pkg.instructions}\n` },
    { path: `${base}/policies.md`, mediaType: "text/markdown", content: policiesMarkdown(pkg) },
    { path: `${base}/evaluation/acceptance.yaml`, mediaType: "application/yaml", content: acceptanceYaml(pkg) },
    { path: `${base}/provenance/lineage.json`, mediaType: "application/json", content: lineageJson(pkg) }
  ];

  if (pkg.kind === "experience_card") {
    files.push({
      path: `${base}/experience/${pkg.slug}.md`,
      mediaType: "text/markdown",
      content: `# ${pkg.title}\n\n${pkg.instructions}\n`
    });
  } else if (pkg.kind === "reference") {
    files.push({
      path: `${base}/references/${pkg.slug}.md`,
      mediaType: "text/markdown",
      content: `# ${pkg.title}\n\n${pkg.instructions}\n`
    });
  }

  let aggregate = 0;
  const rendered: PackageFile[] = [];
  for (const file of files) {
    const bytes = Buffer.byteLength(normalizeLf(file.content), "utf8");
    if (bytes > RENDER_LIMITS.maxFileBytes) {
      return fail("INVALID_PACKAGE", [`${file.path} exceeds the per-file size limit of ${RENDER_LIMITS.maxFileBytes} bytes`]);
    }
    aggregate += bytes;
    if (aggregate > RENDER_LIMITS.maxAggregateBytes) {
      return fail("INVALID_PACKAGE", [`rendered package exceeds the aggregate size limit of ${RENDER_LIMITS.maxAggregateBytes} bytes`]);
    }
    rendered.push(toFile(file.path, file.mediaType, file.content));
  }

  rendered.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const manifest_digest = digestCanonicalJson({
    schema_version: 1,
    files: rendered.map(({ path, sha256: fileDigest, bytes }) => ({ path, sha256: fileDigest, bytes }))
  });
  return { ok: true, files: rendered, manifest_digest };
}
