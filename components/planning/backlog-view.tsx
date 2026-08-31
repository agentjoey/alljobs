"use client";

import { useState } from "react";
import type { BacklogItem } from "@/lib/planning/domain/types";
import type { BacklogControlState } from "@/lib/planning/queries/project";
import { InlineMarkdown, Markdown } from "./markdown";
import { BacklogOrderingEditor } from "./backlog-ordering-editor";
import { planningSourceLabel } from "./source-status";
import { StatePanel } from "./state-panel";

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 } as const;
const HISTORY_STATUSES = new Set<BacklogItem["status"]>(["done", "cancelled"]);

function sortItems(items: BacklogItem[]) {
  return [...items].sort((left, right) => {
    const priority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    if (priority) return priority;
    return (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id);
  });
}

function phaseGroups(items: BacklogItem[]) {
  const groups = new Map<string, BacklogItem[]>();
  for (const item of items) {
    const phase = item.phase ?? "Unassigned phase";
    groups.set(phase, [...(groups.get(phase) ?? []), item]);
  }
  return [...groups.entries()].map(([phase, phaseItems]) => [phase, sortItems(phaseItems)] as const);
}

function BacklogCard({ item, onCreateTaskForBacklog }: { item: BacklogItem; onCreateTaskForBacklog?: (backlogId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="backlog-card" data-testid="backlog-card" data-item-id={item.id}>
      <header className="backlog-card__header">
        <div className="backlog-card__meta"><code>{item.id}</code><span className={`badge badge--${item.priority.toLowerCase()}`}>{item.priority}</span><span>Rank {item.rank ?? "—"}</span></div>
        <span className={`badge badge--${item.status}`}>{item.status}</span>
      </header>
      <div className="backlog-card__body"><strong><InlineMarkdown text={item.title} /></strong><span>{item.phase ?? "Unassigned phase"}</span></div>
      <footer className="backlog-card__footer">
        <span>Existing item · priority and rank are the only writable fields</span>
        <button type="button" className="btn" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Hide details" : "Show details"}</button>
      </footer>
      {expanded && (
        <div className="backlog-card__details">
          {item.body && <Markdown text={item.body} />}
          <dl><div><dt>Work mode</dt><dd>{item.work_mode}</dd></div><div><dt>Dependencies</dt><dd>{item.dependencies.length ? item.dependencies.join(", ") : "None"}</dd></div></dl>
          {item.done_when && <p><strong>Definition of Done:</strong> <InlineMarkdown text={item.done_when} /></p>}
          {onCreateTaskForBacklog && <button type="button" className="btn btn--primary" onClick={() => onCreateTaskForBacklog(item.id)}>Create Native Task</button>}
        </div>
      )}
    </article>
  );
}

export function BacklogView({
  items,
  projectSlug,
  control,
  onCreateTaskForBacklog
}: {
  items: BacklogItem[];
  projectSlug: string;
  control?: BacklogControlState;
  onCreateTaskForBacklog?: (backlogId: string) => void;
}) {
  const [managing, setManaging] = useState(false);
  const active = items.filter((item) => !HISTORY_STATUSES.has(item.status));
  const history = items.filter((item) => HISTORY_STATUSES.has(item.status));
  const orderingAvailable = control?.writable ?? false;

  if (items.length === 0) {
    return <section className="backlog-surface"><header className="backlog-surface__header"><div><h2>Backlog ledger</h2><p>Phase → Priority → Rank</p></div></header><StatePanel title="No canonical backlog items currently available" description="Review planning document health above before adding items to docs/BACKLOG.md." /></section>;
  }

  if (managing && control?.writable) return <BacklogOrderingEditor items={items} projectSlug={projectSlug} control={control} onExit={() => setManaging(false)} />;

  return (
    <section className="backlog-surface">
      <header className="backlog-surface__header">
        <div>
          <h2>Backlog ledger</h2>
          <p>{active.length} active item{active.length === 1 ? "" : "s"} · Phase → Priority → Rank</p>
          {control && <p className="backlog-source-label">{planningSourceLabel(control.source)}</p>}
        </div>
        {control && orderingAvailable && <button type="button" className="btn btn--primary" onClick={() => setManaging(true)}>Manage ordering</button>}
      </header>
      {control && !control.writable && (
        <div className="backlog-read-only" role="status">
          <strong>{planningSourceLabel(control.source)}</strong>
          {control.blockers.map((blocker) => <p key={`${blocker.code}-${blocker.message}`}><code>{blocker.code}</code> {blocker.message}</p>)}
        </div>
      )}
      {phaseGroups(active).map(([phase, phaseItems]) => (
        <section className="backlog-phase" key={phase} aria-label={`Phase ${phase}`}><h3>{phase}</h3><div className="backlog-card-list">{phaseItems.map((item) => <BacklogCard key={item.id} item={item} onCreateTaskForBacklog={onCreateTaskForBacklog} />)}</div></section>
      ))}
      {history.length > 0 && <details className="backlog-history"><summary>History ({history.length})</summary><div role="group" aria-label={`History (${history.length})`} className="backlog-card-list">{sortItems(history).map((item) => <BacklogCard key={item.id} item={item} onCreateTaskForBacklog={onCreateTaskForBacklog} />)}</div></details>}
    </section>
  );
}
