import { Fragment } from "react";
import Link from "next/link";
import {
  attentionList,
  deriveProjects,
  formatRelative,
  mastheadCounts,
  weekdayZh,
  type DerivedProject,
} from "../lib/data/derive";
import type { LedgerData } from "../lib/data/types";
import { Footer } from "../components/ledger/footer";
import { Masthead } from "../components/ledger/masthead";
import {
  attentionStamp,
  attentionWhy,
  formatMmDd,
  sortForIndex,
  toDateStr,
} from "../components/ledger/lib";
import { DateStamp } from "../components/ledger/primitives/date-stamp";
import { EntryRow } from "../components/ledger/primitives/entry-row";
import { ProjectRow } from "../components/ledger/primitives/project-row";
import { ProofBanner } from "../components/ledger/primitives/proof-banner";
import { QuickAddRow } from "../components/ledger/primitives/quick-add-row";
import { SectionHead } from "../components/ledger/primitives/section-head";
import { Sheet } from "../components/ledger/primitives/sheet";
import { Stamp } from "../components/ledger/primitives/stamp";

const PRIORITIES = ["P0", "P1", "P2"] as const;

/** 总览 /：左页=需要注意+今日+最近完成，右页=活跃项目底账（P0→P2），桌面对开双页 */
export function OverviewView({ data, now }: { data: LedgerData; now: Date }) {
  const derived = deriveProjects(data.projects, data.entries, now);
  const attention = attentionList(derived);
  const counts = mastheadCounts(data.projects, data.entries, now);
  const todayStr = toDateStr(now);
  // 账本逻辑：今日按时间升序（新行落底，快速添加即下一空行）
  const todayEntries = data.entries
    .filter((e) => e.date === todayStr)
    .sort((a, b) => a.time.localeCompare(b.time));
  const doneProjects = sortForIndex(derived.filter((p) => p.status === "done"));
  const writable = sortForIndex(
    derived.filter((p) => p.status === "active" || p.status === "blocked"),
  ).map((p) => p.slug);
  const groups = PRIORITIES.map((priority) => ({
    priority,
    items: sortForIndex(
      derived.filter((p) => p.priority === priority && p.status !== "done"),
    ),
  })).filter((g) => g.items.length > 0);
  const lastEntry = [...data.entries].sort((a, b) =>
    `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`),
  )[0];
  const lastWrite = lastEntry
    ? lastEntry.date === todayStr
      ? lastEntry.time
      : formatRelative(lastEntry.date, lastEntry.time, now)
    : "—";

  return (
    <>
      <Masthead current="overview" counts={counts} today={now} />
      <main className="ledger">
        <h1 className="sr-only">总览 · alljobs 工作底账</h1>
        <ProofBanner issues={data.issues} />
        {data.projects.length === 0 ? (
          <EmptyLedger />
        ) : (
          <div className="spread">
            <section className="page" aria-label="今日与注意">
              <SectionHead title="需要注意" count={`${attention.length} 项`} />
              <Sheet>
                {attention.length === 0 ? (
                  <div className="row attn attn-ok">
                    <span className="margin">
                      <Stamp kind="active">无事</Stamp>
                    </span>
                    <span className="body">
                      今日无风险——0 卡住 · 0 停滞 · 0 到期。直接看今日与 NEXT。
                    </span>
                  </div>
                ) : (
                  attention.map((item) => {
                    const stamp = attentionStamp(item, now);
                    return (
                      <Link
                        key={item.project.slug}
                        className="row attn"
                        href={`/projects/${item.project.slug}`}
                      >
                        <span className="margin">
                          <Stamp kind={stamp.cls}>{stamp.text}</Stamp>
                        </span>
                        <span className="body">
                          <span className="title">{item.project.title}</span>
                          <span className="why">{attentionWhy(item)}</span>
                        </span>
                      </Link>
                    );
                  })
                )}
              </Sheet>

              <div className="section-head section-head--datestamp">
                <DateStamp date={todayStr} />
                <span className="aside">
                  {formatMmDd(todayStr)} {weekdayZh(now)} · 已记 {todayEntries.length} 笔
                </span>
              </div>
              <h2 className="sr-only">今日</h2>
              <Sheet className="sheet--today">
                {todayEntries.length === 0 && (
                  <div className="row entry">
                    <span className="margin" aria-hidden="true" />
                    <span className="body body--muted">
                      今天还没落过账。写下第一笔，或让手头的 agent 记上一行。
                    </span>
                  </div>
                )}
                {todayEntries.map((e) => (
                  <EntryRow key={`${e.date}-${e.line}`} entry={e} />
                ))}
                <QuickAddRow slugs={writable} />
              </Sheet>

              {doneProjects.length > 0 && (
                <>
                  <SectionHead title="最近完成" className="section-head--spaced" />
                  <Sheet>
                    {doneProjects.map((p) => (
                      <DoneRow key={p.slug} project={p} />
                    ))}
                  </Sheet>
                </>
              )}
            </section>

            <section className="page" aria-label="活跃项目">
              {groups.map((g, i) => (
                <Fragment key={g.priority}>
                  <SectionHead
                    title={g.priority === "P0" ? "P0 · 现在最重要" : g.priority}
                    aside={i === 0 ? "近 14 天活动 →" : undefined}
                    className="group-head"
                  />
                  <Sheet>
                    {g.items.map((p) => (
                      <ProjectRow key={p.slug} project={p} entries={data.entries} today={now} />
                    ))}
                  </Sheet>
                </Fragment>
              ))}
            </section>
          </div>
        )}
      </main>
      <Footer
        left="alljobs 工作底账 · data/ 即真相"
        right={`LOCAL · ${data.projects.length} 个项目 · 最后写入 ${lastWrite}`}
      />
    </>
  );
}

function DoneRow({ project }: { project: DerivedProject }) {
  return (
    <div className="row entry">
      <span className="margin">
        {project.lastEntry ? formatMmDd(project.lastEntry.date) : "—"}
      </span>
      <span className="body">
        <span className="slug slug--quiet">{project.slug}</span>
        <Stamp kind="done">DONE</Stamp>
        <span className="text text--quiet">
          {project.lastEntry?.text ?? project.now ?? project.title}
        </span>
      </span>
    </div>
  );
}

/** 空账引导：教 schema 而非只说「什么都没有」（同款用于 data/ 缺失） */
function EmptyLedger() {
  return (
    <div className="empty-ledger">
      <span className="bigstamp">空 账</span>
      <p className="empty-ledger-lead">
        还没有项目。在 <code className="mono">data/projects/</code>{" "}
        下新建一个 md 文件，或让任何 agent 替你建——文件即真相：
      </p>
      <pre className="fm">{`---
title: 我的第一个项目
type: code          # code | product | biz | ops
status: active      # active | blocked | paused | done
priority: P1        # P0 | P1 | P2
agents: [claude]
---
## Now
现在正在做的一件事

## Next
- 下一步`}</pre>
      <p className="spec-note">
        日志记在 <code className="mono">data/log/YYYY-MM-DD.md</code>：
        <code className="mono">- HH:MM slug @agent 内容</code>
      </p>
    </div>
  );
}
