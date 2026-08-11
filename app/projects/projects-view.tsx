import Link from "next/link";
import { deriveProjects, mastheadCounts } from "../../lib/data/derive";
import type { LedgerData } from "../../lib/data/types";
import { Footer } from "../../components/ledger/footer";
import { Masthead } from "../../components/ledger/masthead";
import {
  filterProjects,
  sortForIndex,
  toggleHref,
  type ProjectFilters,
} from "../../components/ledger/lib";
import { ProjectRow } from "../../components/ledger/primitives/project-row";
import { ProofBanner } from "../../components/ledger/primitives/proof-banner";
import { SectionHead } from "../../components/ledger/primitives/section-head";
import { Sheet } from "../../components/ledger/primitives/sheet";

const STATUSES = ["active", "blocked", "paused", "done"] as const;
const TYPES = ["code", "product", "biz", "ops"] as const;
const AGENT_ORDER = ["claude", "codex", "kimi", "joey"];

/** /projects：全量底账行 + 过滤 chips（默认「全部」，URL searchParams 驱动） */
export function ProjectsView({
  data,
  filters,
  now,
}: {
  data: LedgerData;
  filters: ProjectFilters;
  now: Date;
}) {
  const derived = sortForIndex(deriveProjects(data.projects, data.entries, now));
  const filtered = filterProjects(derived, filters);
  const counts = mastheadCounts(data.projects, data.entries, now);
  const current: Record<string, string | undefined> = {
    status: filters.status,
    type: filters.type,
    agent: filters.agent,
  };
  const hasFilter = Boolean(filters.status || filters.type || filters.agent);
  const agents = [
    ...AGENT_ORDER.filter((a) => derived.some((p) => p.agents.includes(a))),
    ...new Set(
      derived.flatMap((p) => p.agents).filter((a) => !AGENT_ORDER.includes(a)),
    ),
  ];
  const filterDesc = [
    filters.type && `[${filters.type}]`,
    filters.status,
    filters.agent,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <>
      <Masthead current="projects" counts={counts} today={now} />
      <main className="ledger">
        <h1 className="sr-only">项目 · alljobs 工作底账</h1>
        <ProofBanner issues={data.issues} />

        <div className="filters" role="group" aria-label="过滤">
          <Link className="chip" href="/projects" aria-pressed={!hasFilter}>
            全部<span className="n">{derived.length}</span>
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              className="chip"
              href={toggleHref("/projects", current, "status", s)}
              aria-pressed={filters.status === s}
            >
              {s}
              <span className="n">{derived.filter((p) => p.status === s).length}</span>
            </Link>
          ))}
          <span className="chip-gap" aria-hidden="true" />
          {TYPES.map((t) => (
            <Link
              key={t}
              className="chip"
              href={toggleHref("/projects", current, "type", t)}
              aria-pressed={filters.type === t}
            >
              [{t}]<span className="n">{derived.filter((p) => p.type === t).length}</span>
            </Link>
          ))}
          <span className="chip-gap" aria-hidden="true" />
          {agents.map((a) => (
            <Link
              key={a}
              className="chip"
              href={toggleHref("/projects", current, "agent", a)}
              aria-pressed={filters.agent === a}
            >
              {a}
            </Link>
          ))}
        </div>

        <SectionHead
          title="项目底账"
          count={`${filtered.length} 个 · 按优先级`}
          aside="近 14 天活动 →"
        />
        <Sheet>
          {filtered.length === 0 ? (
            <div className="row">
              <span className="margin" aria-hidden="true">
                0 个
              </span>
              <span className="body body--muted">
                没有同时满足 <span className="mono mono--sm">{filterDesc}</span> 的项目。
                <Link className="chip chip--inline" href="/projects">
                  清除过滤
                </Link>
              </span>
            </div>
          ) : (
            filtered.map((p) => (
              <ProjectRow
                key={p.slug}
                project={p}
                entries={data.entries}
                today={now}
                showPriority
              />
            ))
          )}
        </Sheet>
      </main>
      <Footer
        left="alljobs 工作底账 · data/projects/*.md"
        right={`${derived.length} 个项目 · ${STATUSES.map(
          (s) => `${derived.filter((p) => p.status === s).length} ${s}`,
        ).join(" · ")}`}
      />
    </>
  );
}
