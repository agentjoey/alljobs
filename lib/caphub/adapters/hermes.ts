import type { CapabilityPackage } from "../packages/types";
import { runAdapterContract, type AdapterContract } from "./common";
import type { AdapterRenderResult } from "./contracts";

export const HERMES_ADAPTER_VERSION = "1.0.0";

const CATEGORY_BY_KIND: Record<CapabilityPackage["kind"], string> = {
  skill: "capabilities",
  experience_card: "experience",
  reference: "references"
};

const hermesContract: AdapterContract = {
  name: "hermes",
  adapter_version: HERMES_ADAPTER_VERSION,
  logical_root: "~/.hermes/skills",
  destination: (pkg: CapabilityPackage) => `~/.hermes/skills/${CATEGORY_BY_KIND[pkg.kind]}/${pkg.slug}/SKILL.md`,
  supported_kinds: ["skill", "experience_card", "reference"],
  allowed_permissions: ["clipboard_read", "network", "read_file", "read_media"],
  allow_dependencies: false,
  max_description_bytes: 4096,
  max_triggers: 16,
  max_trigger_bytes: 120,
  skill_frontmatter_keys: ["description", "name"]
};

export function renderHermesPreview(pkg: CapabilityPackage): AdapterRenderResult {
  return runAdapterContract(hermesContract, pkg);
}
