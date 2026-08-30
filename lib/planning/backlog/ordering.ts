import type { BacklogItem, Priority } from "../domain/types";

const RANK_STEP = 100;
const HISTORY_STATUSES = new Set<BacklogItem["status"]>(["done", "cancelled"]);

export type BacklogOrderingState = "initialized" | "uninitialized" | "repair-required";

export interface BacklogConflictLane {
  phase: string;
  priority: Priority;
  itemIds: string[];
}

export interface BacklogFieldChange {
  itemId: string;
  priority: Priority;
  rank?: number;
}

export type BacklogOrderingIntent =
  | { kind: "initialize" }
  | { kind: "repair"; phase: string; priority: Priority }
  | { kind: "change-priority"; itemId: string; targetPriority: Priority }
  | { kind: "move"; itemId: string; targetPriority: Priority; beforeId?: string; afterId?: string };

export type OrderingPlanResult =
  | { ok: true; changes: BacklogFieldChange[]; renumbered: boolean }
  | { ok: false; code: "ORDERING_NOT_INITIALIZED" | "RANK_CONFLICT" | "NOT_FOUND" | "VALIDATION_ERROR"; message: string };

type IndexedItem = { item: BacklogItem; index: number };
type OrderingFailure = Extract<OrderingPlanResult, { ok: false }>;

function isActive(item: BacklogItem) {
  return !HISTORY_STATUSES.has(item.status);
}

function phaseKey(item: BacklogItem) {
  return item.phase ?? "";
}

function laneKey(item: BacklogItem, priority = item.priority) {
  return `${phaseKey(item)}\u0000${priority}`;
}

function sameLane(item: BacklogItem, phase: string, priority: Priority) {
  return phaseKey(item) === phase && item.priority === priority;
}

function activeIndexed(items: BacklogItem[]) {
  return items.map((item, index) => ({ item, index })).filter(({ item }) => isActive(item));
}

function byRankThenSource(left: IndexedItem, right: IndexedItem) {
  const leftRank = left.item.rank;
  const rightRank = right.item.rank;
  if (leftRank === undefined && rightRank === undefined) return left.index - right.index;
  if (leftRank === undefined) return 1;
  if (rightRank === undefined) return -1;
  return leftRank - rightRank || left.index - right.index;
}

function fail(code: OrderingFailure["code"], message: string): OrderingFailure {
  return { ok: false, code, message };
}

function indexedById(active: IndexedItem[], id: string) {
  return active.find(({ item }) => item.id === id);
}

function changesForLane(lane: IndexedItem[]): BacklogFieldChange[] {
  return [...lane]
    .sort(byRankThenSource)
    .map(({ item }, index) => ({ itemId: item.id, priority: item.priority, rank: (index + 1) * RANK_STEP }));
}

export function analyzeBacklogOrdering(items: BacklogItem[]): {
  state: BacklogOrderingState;
  missingIds: string[];
  conflictingIds: string[];
  conflictLanes: BacklogConflictLane[];
} {
  const active = activeIndexed(items);
  const missingIds = active.filter(({ item }) => item.rank === undefined).map(({ item }) => item.id);
  const conflictingIds = new Set<string>();
  const ranksByLane = new Map<string, Map<number, IndexedItem[]>>();

  for (const entry of active) {
    if (entry.item.rank === undefined) continue;
    const ranks = ranksByLane.get(laneKey(entry.item)) ?? new Map<number, IndexedItem[]>();
    const matches = ranks.get(entry.item.rank) ?? [];
    matches.push(entry);
    ranks.set(entry.item.rank, matches);
    ranksByLane.set(laneKey(entry.item), ranks);
  }

  for (const ranks of ranksByLane.values()) {
    for (const matches of ranks.values()) {
      if (matches.length > 1) matches.forEach(({ item }) => conflictingIds.add(item.id));
    }
  }

  const conflictLaneItems = new Map<string, BacklogConflictLane>();
  for (const { item } of active) {
    if (!conflictingIds.has(item.id)) continue;
    const key = laneKey(item);
    const lane = conflictLaneItems.get(key) ?? {
      phase: phaseKey(item),
      priority: item.priority,
      itemIds: []
    };
    lane.itemIds.push(item.id);
    conflictLaneItems.set(key, lane);
  }

  return {
    state: conflictingIds.size > 0 ? "repair-required" : missingIds.length > 0 ? "uninitialized" : "initialized",
    missingIds,
    conflictingIds: active.filter(({ item }) => conflictingIds.has(item.id)).map(({ item }) => item.id),
    conflictLanes: [...conflictLaneItems.values()]
  };
}

export function initializeBacklogOrdering(items: BacklogItem[]): BacklogFieldChange[] {
  const rankByLane = new Map<string, number>();
  return activeIndexed(items).map(({ item }) => {
    const key = laneKey(item);
    const rank = (rankByLane.get(key) ?? 0) + RANK_STEP;
    rankByLane.set(key, rank);
    return { itemId: item.id, priority: item.priority, rank };
  });
}

function validateNeighbour(
  active: IndexedItem[],
  neighbourId: string | undefined,
  phase: string,
  priority: Priority,
  label: "before" | "after"
): IndexedItem | OrderingFailure | undefined {
  if (!neighbourId) return undefined;
  const neighbour = indexedById(active, neighbourId);
  if (!neighbour) return fail("NOT_FOUND", `${label} item "${neighbourId}" was not found in the active Backlog.`);
  if (!sameLane(neighbour.item, phase, priority)) {
    return fail("VALIDATION_ERROR", `${label} item "${neighbourId}" is outside the target Phase + Priority lane.`);
  }
  return neighbour;
}

function isFailure(result: IndexedItem | OrderingFailure | undefined): result is OrderingFailure {
  return Boolean(result && "ok" in result && !result.ok);
}

function planRankedMove(
  active: IndexedItem[],
  itemToMove: IndexedItem,
  targetPriority: Priority,
  beforeId?: string,
  afterId?: string
): OrderingPlanResult {
  const phase = phaseKey(itemToMove.item);
  if (beforeId === itemToMove.item.id || afterId === itemToMove.item.id) {
    return fail("VALIDATION_ERROR", "An item cannot be its own ordering neighbour.");
  }

  const before = validateNeighbour(active, beforeId, phase, targetPriority, "before");
  if (isFailure(before)) return before;
  const after = validateNeighbour(active, afterId, phase, targetPriority, "after");
  if (isFailure(after)) return after;
  if (before && after && before.item.id === after.item.id) {
    return fail("VALIDATION_ERROR", "Before and after items must be distinct.");
  }

  const targetLane = active
    .filter(({ item }) => item.id !== itemToMove.item.id && sameLane(item, phase, targetPriority))
    .sort(byRankThenSource);
  const beforeIndex = before ? targetLane.findIndex(({ item }) => item.id === before.item.id) : -1;
  const afterIndex = after ? targetLane.findIndex(({ item }) => item.id === after.item.id) : -1;
  if (before && beforeIndex < 0) return fail("VALIDATION_ERROR", "Before item is not available in the target lane.");
  if (after && afterIndex < 0) return fail("VALIDATION_ERROR", "After item is not available in the target lane.");
  if (before && after && afterIndex + 1 !== beforeIndex) {
    return fail("VALIDATION_ERROR", "Before and after items must be adjacent in the target lane.");
  }

  const insertionIndex = before ? beforeIndex : after ? afterIndex + 1 : targetLane.length;
  const previous = targetLane[insertionIndex - 1]?.item.rank;
  const next = targetLane[insertionIndex]?.item.rank;
  let rank: number | undefined;
  if (previous !== undefined && next !== undefined && next - previous > 1) rank = Math.floor((previous + next) / 2);
  else if (previous !== undefined && next === undefined) rank = previous + RANK_STEP;
  else if (previous === undefined && next !== undefined && next > 1) rank = Math.floor(next / 2);
  else if (previous === undefined && next === undefined) rank = RANK_STEP;

  if (rank !== undefined && rank > 0) {
    return { ok: true, changes: [{ itemId: itemToMove.item.id, priority: targetPriority, rank }], renumbered: false };
  }

  const moved: IndexedItem = { item: { ...itemToMove.item, priority: targetPriority }, index: itemToMove.index };
  const repairedLane = [...targetLane];
  repairedLane.splice(insertionIndex, 0, moved);
  return { ok: true, changes: changesForLane(repairedLane), renumbered: true };
}

export function planBacklogOrderingChange(items: BacklogItem[], intent: BacklogOrderingIntent): OrderingPlanResult {
  const analysis = analyzeBacklogOrdering(items);
  const active = activeIndexed(items);

  if (intent.kind === "initialize") {
    if (analysis.state === "repair-required") return fail("RANK_CONFLICT", "Duplicate active ranks require a lane repair proposal.");
    return { ok: true, changes: initializeBacklogOrdering(items), renumbered: false };
  }

  if (intent.kind === "repair") {
    const conflictLane = analysis.conflictLanes.find(
      (lane) => lane.phase === intent.phase && lane.priority === intent.priority
    );
    if (!conflictLane) {
      return fail("RANK_CONFLICT", "The requested Phase + Priority lane does not contain duplicate active ranks.");
    }
    const lane = active.filter(({ item }) => sameLane(item, intent.phase, intent.priority));
    if (lane.length === 0) return fail("NOT_FOUND", "The requested Phase + Priority lane has no active items.");
    return { ok: true, changes: changesForLane(lane), renumbered: true };
  }

  const itemToMove = indexedById(active, intent.itemId);
  if (!itemToMove) return fail("NOT_FOUND", `Backlog item "${intent.itemId}" was not found in the active Backlog.`);

  if (analysis.state === "repair-required") return fail("RANK_CONFLICT", "Repair duplicate ranks before changing ordered items.");
  if (analysis.state === "uninitialized") {
    if (intent.kind === "change-priority") {
      return { ok: true, changes: [{ itemId: itemToMove.item.id, priority: intent.targetPriority }], renumbered: false };
    }
    return fail("ORDERING_NOT_INITIALIZED", "Initialize ordering before moving active items.");
  }

  return planRankedMove(
    active,
    itemToMove,
    intent.targetPriority,
    intent.kind === "move" ? intent.beforeId : undefined,
    intent.kind === "move" ? intent.afterId : undefined
  );
}
