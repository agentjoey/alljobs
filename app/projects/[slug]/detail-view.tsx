import { Fragment } from "react";
import Link from "next/link";
import {
  deriveProjects,
  mastheadCounts,
  weekdayZh,
} from "../../../lib/data/derive";
import type { LedgerData, Project } from "../../../lib/data/types";
import { cn } from "../../../lib/utils";
import { Footer } from "../../../components/ledger/footer";
import { Masthead } from "../../../components/ledger/masthead";
import {
  countInWindow,
  formatMmDd,
  groupByDay,
  rowStamp,
  toDateStr,
} from "../../../components/ledger/lib";
import { AgentMark } from "../../../components/ledger/primitives/agent-mark";
import { EntryRow } from "../../../components/ledger/primitives/entry-row";
import { ProofBanner } from "../../../components/ledger/primitives/proof-banner";
import { SectionHead } from "../../../components/ledger/primitives/section-head";
import { Sheet } from "../../../components/ledger/primitives/sheet";
import { Stamp } from "../../../components/ledger/primitives/stamp";

/** /projects/[slug]：详情头 + blocked 红条 + Now/Next/Notes + 活动流（倒序日分组）。调用方保证 slug 存在。 */
export function DetailView({
  data,
  slug,
  now,
}: {
  data: LedgerData;
  slug: string;
  now: Date;
}) {
  const project = data.projects.find((p) => p.slug === slug) as Project;
  const [derived] = deriveProjects([project], data.entries, now);
  const counts = mastheadCounts(data.projects, data.entries, now);
  const stamp = rowStamp(derived!);
  const mine = data.entries.filter((e) => e.slug === slug);
  const days = groupByDay(mine);
  const total14 = countInWindow(data.entries, slug, now);
  const done = project.status === "done";
  const todayStr = toDateStr(now);
  const dueDays =
    project.due !== undefined
      ? Math.round(
          (new Date(`${project.due}T00:00`).getTime() -
            new Date(`${todayStr}T00:00`).getTime()) /
            86_400_000,
        )
      : null;

  return (
    <>
      <Masthead current="projects" counts={counts} today={now} />
      <main className={cn("ledger", done && "is-done")}>
        <ProofBanner issues={data.issues} />

        <div className="detail-head">
          <p className="crumb">
            <Link href="/projects">项目</Link> / {slug}
          </p>
          <div className="detail-title">
            <Stamp kind={stamp.cls}>{stamp.text}</Stamp>
            <Stamp kind="priority">{project.priority}</Stamp>
            <h1>{project.title}</h1>
            <span className="slug">
              {slug} · [{project.type}]
            </span>
          </div>
          {(project.links?.repo ||
            project.links?.obsidian ||
            project.links?.folder ||
            project.links?.url) && (
            <div className="linkrow">
              {project.links?.repo && (
                <span className="linkrow-item">[repo] {project.links.repo}</span>
              )}
              {project.links?.obsidian && (
                <a href={project.links.obsidian}>
                  [vault] Obsidian <ExtArrow />
                </a>
              )}
              {project.links?.folder && (
                <span className="linkrow-item">[dir] {project.links.folder}</span>
              )}
              {project.links?.url && (
                <a href={project.links.url}>
                  [url] {project.links.url.replace(/^https?:\/\//, "")} <ExtArrow />
                </a>
              )}
            </div>
          )}
          <div className="kv">
            <span>
              started <b>{project.started}</b>
            </span>
            {project.due && (
              <span className={derived!.dueSoon ? "due-soon" : undefined}>
                due{" "}
                <b className={derived!.dueSoon ? "due-soon" : undefined}>
                  {project.due}
                  {dueDays !== null &&
                    `（${dueDays > 0 ? `${dueDays} 天` : dueDays === 0 ? "今日" : `逾期 ${-dueDays} 天`}）`}
                </b>
              </span>
            )}
            {project.tags.length > 0 && (
              <span>
                tags <b>{project.tags.join(" · ")}</b>
              </span>
            )}
            {project.agents.map((a) => (
              <AgentMark key={a} name={a} />
            ))}
            <span>
              近 14 天 <b>{total14} 笔</b>
            </span>
          </div>
        </div>

        {project.status === "blocked" && (
          <div className="blockbar" role="status">
            <Stamp kind="blocked">
              {derived!.blockedDays !== null ? `卡住 ${derived!.blockedDays} 天` : "卡住"}
            </Stamp>
            {project.blocked_reason}
            {project.blocked_since && `（自 ${formatMmDd(project.blocked_since)}）`}
          </div>
        )}

        <div className="spread spread--detail">
          <section className="page" aria-label="当前与下一步">
            <SectionHead title="当前 NOW" />
            {project.now ? (
              <div className="prose prose--section">
                <p>{project.now}</p>
              </div>
            ) : (
              <MissingSection section="## Now" margin="NOW" />
            )}

            <SectionHead title="下一步 NEXT" count={project.next.length > 0 ? `${project.next.length} 项` : undefined} />
            {project.next.length > 0 ? (
              <div className="prose">
                <ul>
                  {project.next.map((item, i) => (
                    <li key={i}>
                      <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <MissingSection section="## Next" margin="NEXT" />
            )}

            {project.notes && (
              <>
                <SectionHead title="笔记 NOTES" />
                <div className="prose prose--section">
                  <p>{project.notes}</p>
                </div>
              </>
            )}
          </section>

          <section className="page" aria-label="活动记录">
            <h2 className="sr-only">活动记录</h2>
            {days.length === 0 ? (
              <Sheet>
                <div className="row">
                  <span className="margin" aria-hidden="true">
                    —
                  </span>
                  <span className="body body--muted">
                    本页尚无记录。任何 agent 在{" "}
                    <span className="mono mono--sm">data/log/</span> 提到{" "}
                    <span className="mono mono--sm">{slug}</span> 即入账。
                  </span>
                </div>
              </Sheet>
            ) : (
              days.map((g) => (
                // Fragment：dayhead/sheet 须平铺（同 mockup），
                // 包裹 div 会让每个 dayhead 命中 :first-of-type，30px 日间距丢失
                <Fragment key={g.date}>
                  <SectionHead
                    day
                    title={`${g.date} ${weekdayZh(g.date)}`}
                    count={`${g.entries.length} 笔`}
                  />
                  <Sheet>
                    {g.entries.map((e) => (
                      <EntryRow key={`${e.date}-${e.line}`} entry={e} showSlug={false} />
                    ))}
                  </Sheet>
                </Fragment>
              ))
            )}
            <p className="empty-note">
              <Link className="empty-note-link" href={`/log?slug=${slug}`}>
                更早记录见日志 · 按月归档 →
              </Link>
            </p>
          </section>
        </div>
      </main>
      <Footer
        left={`alljobs 工作底账 · data/projects/${slug}.md`}
        right="在编辑器或 Obsidian 中修改此页数据"
      />
    </>
  );
}

function MissingSection({ section, margin }: { section: string; margin: string }) {
  return (
    <Sheet className="sheet--missing">
      <div className="row">
        <span className="margin" aria-hidden="true">
          {margin}
        </span>
        <span className="body body--muted">
          文件缺 <span className="mono mono--sm">{section}</span>{" "}
          段——在项目 md 里补一段，总览的 NEXT 列同时受益。
        </span>
      </div>
    </Sheet>
  );
}

function ExtArrow() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M2 8L8 2M3.5 2H8v4.5" />
    </svg>
  );
}
