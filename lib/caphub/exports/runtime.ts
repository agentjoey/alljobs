import "server-only";

import { lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { ControlHostConfig } from "../../planning/config";
import type { P4ErrorCode } from "../packages/types";

export type ExportTargetName = "obsidian" | "packageRepository" | "codex" | "claude" | "hermes";

export class ExportRuntimeError extends Error {
  constructor(
    readonly code: P4ErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "ExportRuntimeError";
  }
}

export interface ExportTargetView {
  enabled: boolean;
  alias: string | null;
}

export interface ExportRuntimeView {
  enabled: boolean;
  targets: Record<ExportTargetName, ExportTargetView>;
}

const UNSAFE_DIRECTORY_WRITE_BITS = 0o022;

interface ExportTargetConfig {
  enabled: boolean;
  root?: string;
  alias?: string;
}

export class ExportRuntime {
  private validatedRoots = new Map<ExportTargetName, string>();

  constructor(private readonly config: ControlHostConfig) {}

  private exportsConfig() {
    return this.config.caphub?.exports;
  }

  private targetConfig(target: ExportTargetName): ExportTargetConfig {
    const exports = this.exportsConfig();
    if (!exports) return { enabled: false };
    if (target === "obsidian") return exports.obsidian;
    if (target === "packageRepository") return exports.packageRepository;
    return exports.targets[target];
  }

  private allEnabledTargets(): Array<{ target: ExportTargetName; config: ExportTargetConfig }> {
    const exports = this.exportsConfig();
    if (!exports) return [];
    const entries: Array<{ target: ExportTargetName; config: ExportTargetConfig }> = [
      { target: "obsidian", config: exports.obsidian },
      { target: "packageRepository", config: exports.packageRepository },
      { target: "codex", config: exports.targets.codex },
      { target: "claude", config: exports.targets.claude },
      { target: "hermes", config: exports.targets.hermes }
    ];
    return entries.filter((entry) => entry.config.enabled);
  }

  assertEnabled(target?: ExportTargetName): void {
    const caphub = this.config.caphub;
    if (!caphub?.enabled || !caphub.registry?.enabled || !this.exportsConfig()?.enabled) {
      throw new ExportRuntimeError("P4_EXPORT_DISABLED");
    }
    if (!target) return;
    const config = this.targetConfig(target);
    if (!config.enabled) {
      throw new ExportRuntimeError("P4_EXPORT_DISABLED");
    }
    this.resolveTargetRoot(target);
  }

  resolveTargetRoot(target: ExportTargetName): string {
    const cached = this.validatedRoots.get(target);
    if (cached) return cached;

    const config = this.targetConfig(target);
    if (!config.enabled || !config.root || !config.alias) {
      throw new ExportRuntimeError("P4_EXPORT_DISABLED");
    }
    this.assertUniqueBindings();
    const root = this.validateRoot(config.root);
    this.validatedRoots.set(target, root);
    return root;
  }

  publicView(): ExportRuntimeView {
    const view = (target: ExportTargetName): ExportTargetView => {
      const config = this.targetConfig(target);
      return { enabled: config.enabled, alias: config.alias ?? null };
    };
    return {
      enabled: Boolean(this.config.caphub?.enabled && this.config.caphub.registry?.enabled && this.exportsConfig()?.enabled),
      targets: {
        obsidian: view("obsidian"),
        packageRepository: view("packageRepository"),
        codex: view("codex"),
        claude: view("claude"),
        hermes: view("hermes")
      }
    };
  }

  private assertUniqueBindings(): void {
    const seenAliases = new Map<string, ExportTargetName>();
    const seenRoots = new Map<string, ExportTargetName>();
    for (const { target, config } of this.allEnabledTargets()) {
      if (!config.root || !config.alias) {
        throw new ExportRuntimeError("P4_EXPORT_DISABLED", `enabled export target ${target} is missing its paired root or alias`);
      }
      const aliasOwner = seenAliases.get(config.alias);
      if (aliasOwner && aliasOwner !== target) {
        throw new ExportRuntimeError("UNSAFE_TARGET_ROOT", "export target aliases must be unique");
      }
      seenAliases.set(config.alias, target);
      const normalized = resolve(config.root);
      const rootOwner = seenRoots.get(normalized);
      if (rootOwner && rootOwner !== target) {
        throw new ExportRuntimeError("UNSAFE_TARGET_ROOT", "export targets must not share a root");
      }
      seenRoots.set(normalized, target);
    }
  }

  private validateRoot(candidate: string): string {
    if (candidate === "/" || candidate === homedir() || candidate === process.cwd()) {
      throw new ExportRuntimeError("UNSAFE_TARGET_ROOT", "export roots must not be broad, home, or workspace roots");
    }
    const metadata = lstatSyncSafe(candidate);
    if (!metadata) {
      throw new ExportRuntimeError("UNSAFE_TARGET_ROOT", "export root does not exist");
    }
    const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
    const mode = Number(metadata.mode);
    if (metadata.isSymbolicLink() || !metadata.isDirectory() || metadata.uid !== currentUid
      || (mode & UNSAFE_DIRECTORY_WRITE_BITS) !== 0) {
      throw new ExportRuntimeError("UNSAFE_TARGET_ROOT", "export roots must be owned real directories");
    }
    const canonical = realpathSyncSafe(candidate);
    if (canonical !== candidate) {
      throw new ExportRuntimeError("UNSAFE_TARGET_ROOT", "export root must be canonical");
    }
    return canonical;
  }
}

function lstatSyncSafe(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function realpathSyncSafe(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}
