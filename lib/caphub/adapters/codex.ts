import type { CapabilityPackage } from "../packages/types";
import { runAdapterContract, type AdapterContract } from "./common";
import type { AdapterRenderResult } from "./contracts";

export const CODEX_ADAPTER_VERSION = "1.0.0";

const codexContract: AdapterContract = {
  name: "codex",
  adapter_version: CODEX_ADAPTER_VERSION,
  logical_root: "$CODEX_HOME/skills",
  destination: (pkg: CapabilityPackage) => `$CODEX_HOME/skills/${pkg.slug}/SKILL.md`,
  supported_kinds: ["skill", "reference"],
  allowed_permissions: ["clipboard_read", "network", "read_file", "read_media"],
  allowed_licenses: ["Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC-BY-4.0", "CC0-1.0", "ISC", "MIT", "MPL-2.0", "Unlicense", "WTFPL"],
  allow_dependencies: false,
  max_description_bytes: 4096,
  max_triggers: 16,
  max_trigger_bytes: 120,
  skill_frontmatter_keys: ["description", "name"]
};

export function renderCodexPreview(pkg: CapabilityPackage): AdapterRenderResult {
  return runAdapterContract(codexContract, pkg);
}
