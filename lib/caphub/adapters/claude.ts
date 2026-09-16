import type { CapabilityPackage } from "../packages/types";
import { runAdapterContract, type AdapterContract } from "./common";
import type { AdapterRenderResult } from "./contracts";

export const CLAUDE_ADAPTER_VERSION = "1.0.0";

const claudeContract: AdapterContract = {
  name: "claude",
  adapter_version: CLAUDE_ADAPTER_VERSION,
  logical_root: ".claude/skills",
  destination: (pkg: CapabilityPackage) => `.claude/skills/${pkg.slug}/SKILL.md`,
  supported_kinds: ["skill", "experience_card", "reference"],
  allowed_permissions: ["clipboard_read", "network", "read_file", "read_media"],
  allow_dependencies: false,
  max_description_bytes: 4096,
  max_triggers: 16,
  max_trigger_bytes: 120,
  skill_frontmatter_keys: ["description", "name"]
};

export function renderClaudePreview(pkg: CapabilityPackage): AdapterRenderResult {
  return runAdapterContract(claudeContract, pkg);
}
