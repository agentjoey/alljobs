import "server-only";

import { readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { isDirectChildOfTrustedRoots, type ControlHostConfig } from "../config";

export interface TrustedWorkspace {
  name: string;
  candidatePath: string;
}

/**
 * Enumerates only direct children of configured trusted roots. Each candidate
 * is rechecked through the existing realpath containment guard before it can
 * be returned to a browser client.
 */
export function listTrustedWorkspaces(config: ControlHostConfig): TrustedWorkspace[] {
  const candidates = new Map<string, TrustedWorkspace>();

  for (const configuredRoot of config.trustedCodeRoots) {
    let trustedRoot: string;
    try {
      trustedRoot = realpathSync(configuredRoot);
    } catch {
      continue;
    }

    let entries;
    try {
      entries = readdirSync(trustedRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const candidatePath = join(trustedRoot, entry.name);

      try {
        if (!statSync(candidatePath).isDirectory()) continue;
      } catch {
        continue;
      }

      const containment = isDirectChildOfTrustedRoots(candidatePath, config);
      if (!containment.trusted || !containment.realCandidatePath) continue;

      candidates.set(containment.realCandidatePath, {
        name: entry.name,
        candidatePath
      });
    }
  }

  return [...candidates.values()].sort((a, b) => a.candidatePath.localeCompare(b.candidatePath));
}
