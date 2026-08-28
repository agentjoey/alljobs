import { roadmapItemSchema } from "../domain/schemas";
import type { RoadmapItem, RoadmapItemStatus } from "../domain/types";
import { legacyPhaseId, type LegacyPhase } from "./legacy-backlog";

/**
 * Builds canonical RoadmapItems from the phase sections found by
 * parseLegacyBacklog (e.g. `### Phase 7 — Reliability Foundation` with a
 * `**Status**：DONE` line and `**范围**：GG-BL-007、...` scope list).
 */

export const MAINTENANCE_PHASE_ID = "maintenance";

function mapPhaseStatus(statusText: string | undefined): RoadmapItemStatus {
  const text = (statusText ?? "").toLowerCase();
  if (text.includes("done")) return "done";
  if (text.includes("blocked")) return "paused";
  if (text.includes("active") || text.includes("进行中")) return "active";
  return "planned";
}

function phaseOrder(name: string, fallbackIndex: number): number {
  const numbered = /^phase\s+(\d+)/i.exec(name);
  if (numbered) return Number(numbered[1]) * 10;
  return 90 + fallbackIndex;
}

/** Summaries render after the yaml fence; drop lines that could inject sections. */
function sanitizeSummary(lines: string[]): string | undefined {
  const safe = lines.filter(l => !/^##\s/.test(l) && !/^```/.test(l));
  const summary = safe.join("\n").trim();
  return summary || undefined;
}

export interface BuildRoadmapOptions {
  /**
   * Emit a `maintenance` phase (order 99, active) — pass true when any
   * converted backlog item fell back to the maintenance lane.
   */
  includeMaintenance?: boolean;
}

export interface BuildRoadmapResult {
  items: RoadmapItem[];
  unmappable: { id: string; reason: string }[];
}

export function buildLegacyRoadmap(
  phases: LegacyPhase[],
  options: BuildRoadmapOptions = {}
): BuildRoadmapResult {
  const items: RoadmapItem[] = [];
  const unmappable: { id: string; reason: string }[] = [];

  phases.forEach((phase, index) => {
    const candidate = {
      id: legacyPhaseId(phase.name),
      title: phase.name,
      kind: "phase" as const,
      status: mapPhaseStatus(phase.statusText),
      order: phaseOrder(phase.name, index),
      summary: sanitizeSummary(phase.bodyLines)
    };
    const validated = roadmapItemSchema.safeParse(candidate);
    if (validated.success) {
      items.push(validated.data);
    } else {
      unmappable.push({
        id: candidate.id,
        reason: `schema validation failed: ${validated.error.issues
          .map(i => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`
      });
    }
  });

  if (options.includeMaintenance) {
    items.push({
      id: MAINTENANCE_PHASE_ID,
      title: "Maintenance lane",
      kind: "phase",
      status: "active",
      order: 99
    });
  }

  return { items, unmappable };
}
