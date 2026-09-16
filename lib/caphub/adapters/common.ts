import { createHash } from "node:crypto";
import { digestCanonicalJson } from "../analysis/digest";
import { packageFileSchema } from "../packages/schemas";
import { yamlScalar } from "../packages/render";
import type { CapabilityPackage } from "../packages/types";
import type { AdapterName, AdapterRenderResult, AdapterResult } from "./contracts";

const CAPHUB_MARKER_PATTERN = /<!--\s*caphub:/i;
const COMMAND_GRANT_PATTERN = /\b(?:curl|wget|bash|sh|npm|npx|brew|pip|pip3|apt|apt-get)\s+[^\n]*(?:install|i\b|add)/i;

export interface AdapterContract {
  name: AdapterName;
  adapter_version: string;
  logical_root: string;
  destination: (pkg: CapabilityPackage) => string;
  supported_kinds: CapabilityPackage["kind"][];
  allowed_permissions: readonly string[];
  allow_dependencies: boolean;
  max_description_bytes: number;
  max_triggers: number;
  max_trigger_bytes: number;
  skill_frontmatter_keys: readonly string[];
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function bulletList(items: string[], empty: string): string {
  if (items.length === 0) return `${empty}\n`;
  return items.map((item) => `- ${item}`).join("\n") + "\n";
}

export function sourceDigestFor(contract: AdapterContract): string {
  return digestCanonicalJson({
    schema_version: 1,
    adapter: contract.name,
    version: contract.adapter_version,
    skill_frontmatter_keys: contract.skill_frontmatter_keys.slice().sort(),
    max_description_bytes: contract.max_description_bytes,
    max_triggers: contract.max_triggers,
    max_trigger_bytes: contract.max_trigger_bytes,
    logical_root: contract.logical_root
  });
}

export function runAdapterContract(
  contract: AdapterContract,
  pkg: CapabilityPackage
): AdapterRenderResult {
  const diagnostics: string[] = [];
  const unsupported = (reason: string): AdapterRenderResult => ({
    ok: false,
    code: "ADAPTER_UNSUPPORTED",
    diagnostics: [reason]
  });

  if (!contract.supported_kinds.includes(pkg.kind)) {
    return unsupported(`${contract.name} adapter cannot represent kind "${pkg.kind}" safely`);
  }
  if (!contract.allow_dependencies && pkg.dependencies.length > 0) {
    return unsupported(`${contract.name} adapter does not resolve dependencies in P4 previews`);
  }
  for (const permission of pkg.permissions) {
    if (!contract.allowed_permissions.includes(permission)) {
      return unsupported(`${contract.name} adapter does not support permission "${permission}"`);
    }
  }
  if (Buffer.byteLength(pkg.description, "utf8") > contract.max_description_bytes) {
    return unsupported(`description exceeds the ${contract.name} adapter bound of ${contract.max_description_bytes} bytes`);
  }
  const triggers = [...pkg.triggers, ...pkg.non_triggers];
  if (triggers.length > contract.max_triggers) {
    return unsupported(`trigger list exceeds the ${contract.name} adapter bound of ${contract.max_triggers}`);
  }
  for (const trigger of triggers) {
    if (Buffer.byteLength(trigger, "utf8") > contract.max_trigger_bytes) {
      return unsupported(`trigger exceeds the ${contract.max_trigger_bytes}-byte adapter bound`);
    }
  }

  const managedText = [pkg.title, pkg.description, pkg.instructions, ...pkg.known_limits].join("\n");
  if (CAPHUB_MARKER_PATTERN.test(managedText) || managedText.split("\n").some((line) => line.trimStart().startsWith("---"))) {
    return unsupported("package text would inject frontmatter or Caphub markers into a skill document");
  }
  if (COMMAND_GRANT_PATTERN.test(pkg.instructions)) {
    return unsupported("package instructions contain an install/command grant shape that P4 adapters must not emit");
  }

  const frontmatter = contract.skill_frontmatter_keys
    .slice()
    .sort()
    .map((key) => (key === "name" ? `name: ${yamlScalar(pkg.slug)}` : `${key}: ${yamlScalar(key === "description" ? pkg.description : String(pkg[key as "description"] ?? ""))}`))
    .join("\n");

  const body = [
    "---",
    frontmatter,
    "---",
    "",
    `# ${pkg.title}`,
    "",
    pkg.description,
    "",
    "## Instructions",
    "",
    pkg.instructions,
    "",
    "## When to use",
    "",
    bulletList(pkg.triggers, "None recorded."),
    "",
    "## When not to use",
    "",
    bulletList(pkg.non_triggers, "None recorded."),
    "",
    "## Known limits",
    "",
    bulletList(pkg.known_limits, "None recorded."),
    "",
    "## Provenance",
    "",
    bulletList([
      `License: ${pkg.license.spdx_id} (${pkg.license.provenance_confidence} confidence)`,
      ...pkg.evidence.map((item) => `Evidence: ${item.citation}`),
      ...pkg.lineage.map((item) => `Lineage: ${item.record_kind} ${item.record_id} v${item.version}`)
    ], "None recorded."),
    ""
  ].join("\n");

  const normalized = body.replace(/\r\n/g, "\n");
  const path = contract.destination(pkg);
  const file = packageFileSchema.parse({
    path,
    media_type: "text/markdown",
    content: normalized,
    sha256: sha256(normalized),
    bytes: Buffer.byteLength(normalized, "utf8")
  });

  diagnostics.push("no resources inlined: the neutral package carries no safe text resources");
  const result: AdapterResult = {
    adapter: contract.name,
    adapter_version: contract.adapter_version,
    source_digest: sourceDigestFor(contract),
    input_digest: pkg.digest,
    output_manifest_digest: digestCanonicalJson({
      schema_version: 1,
      files: [{ path: file.path, sha256: file.sha256, bytes: file.bytes }]
    }),
    diagnostics,
    files: [file]
  };
  return { ok: true, result };
}
