import { backlogItemSchema } from "../domain/schemas";
import type {
  BacklogItem,
  BacklogStatus,
  Priority,
  ProofIssue,
  WorkMode
} from "../domain/types";

/**
 * Parser/converter for "bullet-style" legacy backlog documents: `## ` group
 * headings, `### ID — Title` item headings, `- **Field**: value` bullet fields,
 * plus `### Phase N — ...` sections whose `**范围**`/`**Scope**` lines bind
 * item IDs to phases.
 */

export interface LegacyItem {
  id: string;
  title: string;
  /** The `## ` group heading the item appeared under (e.g. "Active backlog"). */
  group: string;
  fields: Record<string, string>;
  /** Non-bullet lines inside the item section. */
  bodyLines: string[];
}

export interface LegacyPhase {
  /** Full original heading text, e.g. "Phase 7 — Reliability Foundation". */
  name: string;
  statusText?: string;
  itemIds: string[];
  bodyLines: string[];
}

export interface LegacyBacklogParseResult {
  items: LegacyItem[];
  phases: LegacyPhase[];
  issues: ProofIssue[];
}

export interface UnmappableItem {
  id: string;
  reason: string;
}

export interface LegacyConvertResult {
  items: BacklogItem[];
  unmappable: UnmappableItem[];
}

export interface ConvertOptions {
  workMode?: WorkMode;
  /** Phase assigned to items not bound by any phase scope list. */
  defaultPhase?: string;
}

/** e.g. `GG-BL-006`, `AJ-B-001`: uppercase segments joined by hyphens. */
const ID_TOKEN_PATTERN = "[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+";
const ITEM_HEADING_PATTERN = new RegExp(
  `^(${ID_TOKEN_PATTERN})(?:\\s*[—–\\-:：]\\s*(.+))?$`
);
const PHASE_HEADING_PATTERN = /^phase\s+(\d+)/i;
const BULLET_FIELD_PATTERN = /^-\s+\*\*(.+?)\*\*\s*[:：]\s*(.*)$/;
const PHASE_STATUS_PATTERN = /^\s*-?\s*\*\*Status\*\*\s*[:：]\s*(.+)$/i;
const PHASE_SCOPE_PATTERN = /^\s*-?\s*\*\*(范围|Scope)\*\*\s*[:：]\s*(.+)$/i;
const ID_TOKEN_GLOBAL = new RegExp(ID_TOKEN_PATTERN, "g");

/** Derived roadmap id for a legacy phase heading ("Phase 7 — ..." → "phase-7"). */
export function legacyPhaseId(name: string): string {
  const numbered = PHASE_HEADING_PATTERN.exec(name);
  if (numbered) return `phase-${numbered[1]}`;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "phase";
}

export function parseLegacyBacklog(
  source: string,
  sourcePath = ""
): LegacyBacklogParseResult {
  const issues: ProofIssue[] = [];
  const items: LegacyItem[] = [];
  const phases: LegacyPhase[] = [];
  const seenItemIds = new Set<string>();

  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let group = "";
  let currentItem: LegacyItem | null = null;
  let currentPhase: LegacyPhase | null = null;

  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2 && !line.startsWith("###")) {
      group = h2[1].trim();
      currentItem = null;
      currentPhase = null;
      continue;
    }

    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) {
      const text = h3[1].trim();
      const itemMatch = ITEM_HEADING_PATTERN.exec(text);
      if (itemMatch) {
        if (seenItemIds.has(itemMatch[1])) {
          issues.push({
            scope: "object",
            code: "DUPLICATE_ITEM_ID",
            sourcePath,
            objectId: itemMatch[1],
            message: `Duplicate legacy backlog item ID "${itemMatch[1]}"`
          });
          currentItem = null;
          currentPhase = null;
          continue;
        }
        seenItemIds.add(itemMatch[1]);
        currentItem = {
          id: itemMatch[1],
          title: (itemMatch[2] ?? "").trim(),
          group,
          fields: {},
          bodyLines: []
        };
        items.push(currentItem);
        currentPhase = null;
        continue;
      }
      if (PHASE_HEADING_PATTERN.test(text)) {
        currentPhase = { name: text, itemIds: [], bodyLines: [] };
        phases.push(currentPhase);
        currentItem = null;
        continue;
      }
      // Headings without an ID token are prose subsections, not items.
      currentItem = null;
      currentPhase = null;
      continue;
    }

    if (currentItem) {
      const field = BULLET_FIELD_PATTERN.exec(line);
      if (field) {
        currentItem.fields[field[1].trim()] = field[2].trim();
      } else if (line.trim()) {
        currentItem.bodyLines.push(line);
      }
      continue;
    }

    if (currentPhase) {
      const statusLine = PHASE_STATUS_PATTERN.exec(line);
      if (statusLine && !currentPhase.statusText) {
        currentPhase.statusText = statusLine[1].trim();
      }
      const scopeLine = PHASE_SCOPE_PATTERN.exec(line);
      if (scopeLine) {
        currentPhase.itemIds.push(...(scopeLine[2].match(ID_TOKEN_GLOBAL) ?? []));
      }
      if (line.trim()) {
        currentPhase.bodyLines.push(line);
      }
    }
  }

  return { items, phases, issues };
}

const STATUS_MAP: Record<string, BacklogStatus> = {
  open: "ready",
  mitigated: "doing",
  observation: "idea",
  obs: "idea",
  blocked: "blocked",
  done: "done",
  cancelled: "cancelled"
};

const MAPPED_FIELD_KEYS = new Set(["priority", "status", "done when"]);

function getField(fields: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(fields)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/** Bodies are rendered after the yaml fence; drop lines that could inject sections. */
function sanitizeBodyLines(lines: string[]): string[] {
  return lines.filter(l => !/^##\s/.test(l) && !/^```/.test(l));
}

export function convertLegacyBacklog(
  parsed: LegacyBacklogParseResult,
  options: ConvertOptions = {}
): LegacyConvertResult {
  const workMode: WorkMode = options.workMode ?? "implementation";
  const defaultPhase = options.defaultPhase ?? "maintenance";

  const phaseByItemId = new Map<string, string>();
  for (const phase of parsed.phases) {
    const phaseId = legacyPhaseId(phase.name);
    for (const itemId of phase.itemIds) {
      // Later scope lists win; an item belongs to exactly one phase.
      phaseByItemId.set(itemId, phaseId);
    }
  }

  const items: BacklogItem[] = [];
  const unmappable: UnmappableItem[] = [];

  for (const legacy of parsed.items) {
    const originalStatus = (getField(legacy.fields, "Status") ?? "").trim();
    const mappedStatus = STATUS_MAP[originalStatus.toLowerCase()];
    // Archive-style entries often omit Status and only carry a DONE date.
    const hasDoneDate = getField(legacy.fields, "DONE date") !== undefined;
    const status: BacklogStatus = mappedStatus ?? (hasDoneDate ? "done" : "ready");
    if (!mappedStatus && !hasDoneDate) {
      unmappable.push({
        id: legacy.id,
        reason: `unknown status "${originalStatus || "(missing)"}" mapped to ready`
      });
    }

    const originalPriority = (getField(legacy.fields, "Priority") ?? "").trim();
    let priority: Priority = "P2";
    let priorityRemapped = false;
    if (originalPriority === "P0" || originalPriority === "P1" || originalPriority === "P2") {
      priority = originalPriority;
    } else {
      priorityRemapped = true;
    }

    const bodyLines: string[] = [];
    for (const [key, value] of Object.entries(legacy.fields)) {
      if (MAPPED_FIELD_KEYS.has(key.toLowerCase())) continue;
      bodyLines.push(`- **${key}**: ${value}`);
    }
    if (priorityRemapped) {
      bodyLines.push(`- **Original priority**: ${originalPriority || "(missing)"}`);
    }
    bodyLines.push(`- **Original status**: ${originalStatus || "(missing)"}`);
    bodyLines.push(...sanitizeBodyLines(legacy.bodyLines));

    const candidate = {
      id: legacy.id,
      title: legacy.title || legacy.id,
      work_mode: workMode,
      phase: phaseByItemId.get(legacy.id) ?? defaultPhase,
      status,
      priority,
      dependencies: [],
      done_when: getField(legacy.fields, "Done when"),
      body: bodyLines.length > 0 ? bodyLines.join("\n") : undefined
    };

    const validated = backlogItemSchema.safeParse(candidate);
    if (!validated.success) {
      unmappable.push({
        id: legacy.id,
        reason: `schema validation failed: ${validated.error.issues
          .map(i => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`
      });
      continue;
    }
    items.push(validated.data);
  }

  return { items, unmappable };
}
