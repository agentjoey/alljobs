"use client";

import { useActionState, useRef, useState } from "react";
import { quickAdd, type QuickAddState } from "../../../app/actions/quickadd";
import type { LogEntry } from "../../../lib/data/types";
import { EntryRow } from "./entry-row";
import { Sheet } from "./sheet";

const AGENTS = ["joey", "claude", "codex", "kimi"] as const;
/** 样张 04 文案（校验失败：空内容/未选项目） */
const VALIDATION_MSG = "写点内容并选择项目，再落账。";

const entryKey = (e: { date: string; time: string; slug: string; text: string }) =>
  `${e.date}|${e.time}|${e.slug}|${e.text}`;

/**
 * 今日区（client）：条目升序（账本逻辑：新行落底）+ 快速添加表单。
 * T2 的占位行在此接线为真实 <form>（回车即落账）；落账成功后服务器重渲染带回新行，
 * 由 lastAdded 标记最后一行 is-new 印压（180ms ease-out；reduced-motion 由全局 CSS 降级为直接出现）。
 */
export function TodaySheet({ entries, slugs }: { entries: LogEntry[]; slugs: string[] }) {
  // 受控文本：失败时内容必须还在输入框里（样张 06），成功才清空
  const [text, setText] = useState("");
  const [slug, setSlug] = useState("");
  const [agent, setAgent] = useState("joey");
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, formAction, isPending] = useActionState<QuickAddState, FormData>(
    async (prev, formData) => {
      const result = await quickAdd(prev, formData);
      if (result.status === "success") {
        setLastAdded(entryKey(result.entry));
        setText(""); // 表单清空（项目/记录者保留，方便连续记同一项目）
        // 焦点回输入框：isPending=false 的提交可能晚一帧，输入框还 disabled 时 focus 静默失败——逐帧重试到解禁
        const refocus = (tries: number) => {
          const el = inputRef.current;
          if (!el || tries <= 0) return;
          if (el.disabled) requestAnimationFrame(() => refocus(tries - 1));
          else el.focus();
        };
        requestAnimationFrame(() => refocus(20));
      }
      return result;
    },
    { status: "idle" },
  );

  const invalid = state.status === "validation";

  return (
    <Sheet className="sheet--today">
      {entries.length === 0 && (
        <div className="row entry">
          <span className="margin" aria-hidden="true" />
          <span className="body body--muted">
            今天还没落过账。写下第一笔，或让手头的 agent 记上一行。
          </span>
        </div>
      )}
      {entries.map((e, i) => (
        <EntryRow
          key={`${e.date}-${e.line}`}
          entry={e}
          isNew={lastAdded !== null && i === entries.length - 1 && entryKey(e) === lastAdded}
        />
      ))}
      <form className="row quickadd" aria-label="快速添加日志" action={formAction}>
        <span className="margin" aria-hidden="true">
          —:—
        </span>
        <span className="body">
          <input
            ref={inputRef}
            type="text"
            name="text"
            placeholder="记一笔…（回车落账）"
            aria-label="日志内容"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? "quickadd-err" : undefined}
            disabled={isPending}
            value={text}
            onChange={(ev) => setText(ev.target.value)}
          />
          <select
            aria-label="项目"
            name="slug"
            disabled={isPending}
            value={slug}
            onChange={(ev) => setSlug(ev.target.value)}
          >
            <option value="" disabled>
              选择项目…
            </option>
            {slugs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="记录者"
            name="agent"
            disabled={isPending}
            value={agent}
            onChange={(ev) => setAgent(ev.target.value)}
          >
            {AGENTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button className="btn-stamp" type="submit" disabled={isPending}>
            {isPending ? "落账中…" : "落账"}
          </button>
          {invalid && (
            <span className="err-inline" id="quickadd-err" role="alert">
              {VALIDATION_MSG}
            </span>
          )}
        </span>
      </form>
      {state.status === "fs" && (
        <div className="proof" role="alert">
          <span className="k">写入失败</span>
          没写进 <code>{state.file}</code>（权限或磁盘问题）。你的内容还在输入框里；也可以直接在编辑器补记这一行：
          <code>- HH:MM slug @agent 内容</code>
        </div>
      )}
    </Sheet>
  );
}
