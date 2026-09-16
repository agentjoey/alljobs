import type { CapabilityPackage, PackageFile, P4ErrorCode } from "../packages/types";

export const ADAPTER_SCHEMA_VERSION = 1;

export type AdapterName = "codex" | "claude" | "hermes";

export interface AdapterResult {
  adapter: AdapterName;
  adapter_version: string;
  source_digest: string;
  input_digest: string;
  output_manifest_digest: string;
  diagnostics: string[];
  files: PackageFile[];
}

export type AdapterRenderResult =
  | { ok: true; result: AdapterResult }
  | { ok: false; code: P4ErrorCode; diagnostics: string[] };
