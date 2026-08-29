"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyBacklogOrderingAction, proposeBacklogOrderingAction } from "@/app/actions/backlog";
import type { BacklogChangeProposal } from "@/lib/planning/backlog/mutations";
import type { BacklogItem, Priority } from "@/lib/planning/domain/types";
import type { BacklogOrderingIntent } from "@/lib/planning/backlog/ordering";
import type { BacklogControlState } from "@/lib/planning/queries/project";
import { BacklogChangeReview } from "./backlog-change-review";

export type EditorState =
  | { mode: "reading" }
  | { mode: "editing"; intent: BacklogOrderingIntent | null }
  | { mode: "reviewing"; proposal: BacklogChangeProposal }
  | { mode: "applying"; proposal: BacklogChangeProposal }
  | { mode: "error"; code: string; message: string; intent?: BacklogOrderingIntent }
  | { mode: "success"; digest: string; changedIds: string[] };

const PRIORITIES: Priority[] = ["P0", "P1", "P2"];
const HISTORY_STATUSES = new Set<BacklogItem["status"]>(["done", "cancelled"]);

function orderedActive(items: BacklogItem[]) {
  return items
    .filter((item) => !HISTORY_STATUSES.has(item.status))
    .sort((left, right) => {
      const phase = (left.phase ?? "").localeCompare(right.phase ?? "");
      if (phase) return phase;
      const priority = PRIORITIES.indexOf(left.priority) - PRIORITIES.indexOf(right.priority);
      if (priority) return priority;
      return (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id);
    });
}

function summary(intent: BacklogOrderingIntent) {
  switch (intent.kind) {
    case "initialize": return "Initialize ranks for active Backlog items.";
    case "repair": return `Repair ${intent.phase} / ${intent.priority} ranks.`;
    case "change-priority": return `Change ${intent.itemId} to ${intent.targetPriority}.`;
    case "move": return `Move ${intent.itemId} within ${intent.targetPriority}.`;
  }
}

export function BacklogOrderingEditor({
  items,
  projectSlug,
  control,
  onExit
}: {
  items: BacklogItem[];
  projectSlug: string;
  control: BacklogControlState;
  onExit: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<EditorState>({ mode: "editing", intent: null });
  const [proposing, setProposing] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const active = orderedActive(items);
  const intent = state.mode === "editing" ? state.intent : state.mode === "error" ? state.intent ?? null : null;
  const canMove = control.ordering === "initialized";

  const setIntent = (next: BacklogOrderingIntent) => setState({ mode: "editing", intent: next });
  const move = (item: BacklogItem, direction: "up" | "down") => {
    const lane = active.filter((candidate) => candidate.phase === item.phase && candidate.priority === item.priority);
    const index = lane.findIndex((candidate) => candidate.id === item.id);
    const neighbour = lane[index + (direction === "up" ? -1 : 1)];
    if (!neighbour) return;
    setIntent(direction === "up"
      ? { kind: "move", itemId: item.id, targetPriority: item.priority, beforeId: neighbour.id }
      : { kind: "move", itemId: item.id, targetPriority: item.priority, afterId: neighbour.id });
  };

  const review = async () => {
    if (!intent) return;
    setProposing(true);
    try {
      const result = await proposeBacklogOrderingAction({ projectSlug, intent });
      if (result.status === "success") {
        setState({ mode: "reviewing", proposal: result.data });
      } else {
        setState({ mode: "error", code: result.code, message: result.message, intent });
      }
    } catch {
      setState({ mode: "error", code: "PROPOSE_ERROR", message: "Failed to prepare the change proposal.", intent });
    } finally {
      setProposing(false);
    }
  };

  const apply = async (proposal: BacklogChangeProposal) => {
    setState({ mode: "applying", proposal });
    try {
      const result = await applyBacklogOrderingAction({ proposal, proposalDigest: proposal.proposalDigest });
      if (result.status === "success") {
        setState({ mode: "success", digest: result.data.digest, changedIds: result.data.changes.map((change) => change.itemId) });
        router.refresh();
      } else {
        setState({ mode: "error", code: result.code, message: result.message, intent: proposal.intent });
      }
    } catch {
      setState({ mode: "error", code: "WRITE_FAILED", message: "Failed to write changes to disk.", intent: proposal.intent });
    }
  };

  if (state.mode === "reviewing" || state.mode === "applying") {
    return (
      <BacklogChangeReview
        proposal={state.proposal}
        items={items}
        applying={state.mode === "applying"}
        onBack={() => setState({ mode: "editing", intent: state.proposal.intent })}
        onApply={() => apply(state.proposal)}
      />
    );
  }

  if (state.mode === "success") {
    return (
      <section className="backlog-notice backlog-notice--success" role="status">
        <strong>Ordering changes applied locally.</strong> Changed {state.changedIds.join(", ")} · resulting digest {state.digest.slice(0, 10)}…
        No commit, push, merge, fetch, or agent start occurred.
        <button type="button" className="btn" onClick={onExit}>Continue reading</button>
      </section>
    );
  }

  if (state.mode === "error") {
    return (
      <section className="backlog-error-state" role="alert">
        <p className="backlog-notice backlog-notice--error"><strong>{state.code}</strong> {state.message}</p>
        {state.code === "STALE_WRITE" && state.intent && (
          <details open className="backlog-prior-intent">
            <summary>Prior intent (reference only)</summary>
            <p>{summary(state.intent)}</p>
          </details>
        )}
        <div className="backlog-action-row">
          {state.code === "STALE_WRITE" && <button type="button" className="btn btn--primary" onClick={() => router.refresh()}>Refresh local source</button>}
          <button type="button" className="btn" onClick={() => setState({ mode: "editing", intent: state.intent ?? null })}>Back to draft</button>
        </div>
      </section>
    );
  }

  const firstActive = active[0];
  return (
    <section className="backlog-editor" aria-label="Manage Backlog ordering">
      <header className="backlog-editor__header">
        <div>
          <h2>Manage ordering</h2>
          <p>Drafts stay on this page until a digest-bound review is prepared.</p>
        </div>
        <button type="button" className="btn" onClick={onExit}>Cancel editing</button>
      </header>

      {control.ordering === "uninitialized" && (
        <p className="backlog-notice backlog-notice--warning">
          <strong>ORDERING_NOT_INITIALIZED.</strong> Change Priority remains available. Initialize ranks before Move Up,
          Move Down, or drag assistance.
          <button type="button" className="btn btn--primary" onClick={() => setIntent({ kind: "initialize" })}>Initialize ordering</button>
        </p>
      )}
      {control.ordering === "repair-required" && firstActive && (
        <p className="backlog-notice backlog-notice--error">
          <strong>RANK_CONFLICT.</strong> Repair the affected lane before ordinary moves.
          <button type="button" className="btn" onClick={() => setIntent({ kind: "repair", phase: firstActive.phase ?? "", priority: firstActive.priority })}>Repair ordering</button>
        </p>
      )}

      <div className="backlog-editor__list">
        {active.map((item) => (
          <article
            key={item.id}
            className="backlog-card backlog-card--editing"
            draggable={canMove}
            onDragStart={() => setDraggedId(item.id)}
            onDragOver={(event) => { if (canMove) event.preventDefault(); }}
            onDrop={() => {
              const dragged = active.find((candidate) => candidate.id === draggedId);
              if (canMove && dragged && dragged.id !== item.id && dragged.phase === item.phase && dragged.priority === item.priority) {
                setIntent({ kind: "move", itemId: dragged.id, targetPriority: item.priority, beforeId: item.id });
              }
              setDraggedId(null);
            }}
          >
            <div className="backlog-card__meta">
              <span className="backlog-drag-handle" aria-label={`Desktop drag assistance for ${item.id}`}>Drag</span>
              <code>{item.id}</code>
              <span className={`badge badge--${item.priority.toLowerCase()}`}>{item.priority}</span>
              <span>Rank {item.rank ?? "—"}</span>
              <span>{item.phase ?? "No phase"}</span>
            </div>
            <strong>{item.title}</strong>
            <div className="backlog-card__controls">
              <button type="button" className="btn" aria-label={`Move ${item.id} up`} disabled={!canMove} onClick={() => move(item, "up")}>Move up</button>
              <button type="button" className="btn" aria-label={`Move ${item.id} down`} disabled={!canMove} onClick={() => move(item, "down")}>Move down</button>
              <label>
                <span className="sr-only">Change priority for {item.id}</span>
                <select aria-label={`Change priority for ${item.id}`} value={item.priority} onChange={(event) => setIntent({ kind: "change-priority", itemId: item.id, targetPriority: event.target.value as Priority })}>
                  {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </label>
            </div>
          </article>
        ))}
      </div>

      {intent && (
        <div className="backlog-draft-bar" role="status">
          <p><strong>1 item changed</strong> · {summary(intent)} This remains a page-local draft.</p>
          <div>
            <button type="button" className="btn" onClick={() => setState({ mode: "editing", intent: null })}>Discard</button>
            <button type="button" className="btn btn--primary" onClick={review} disabled={proposing}>{proposing ? "Preparing review" : "Review changes"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
