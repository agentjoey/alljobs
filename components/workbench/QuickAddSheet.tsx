"use client";

import {
  useActionState,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { quickAdd, type QuickAddState } from "@/app/actions/quickadd";
import { X } from "lucide-react";

const AGENTS = ["joey", "claude", "codex", "kimi"] as const;
const VALIDATION_MSG = "写点内容并选择项目，再落账。";

export type QuickAddSheetProps = {
  open: boolean;
  onClose: () => void;
  slugs: string[];
};

export function QuickAddSheet({ open, onClose, slugs }: QuickAddSheetProps) {
  const [text, setText] = useState("");
  const [slug, setSlug] = useState("");
  const [agent, setAgent] = useState("joey");
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [, resyncSelects] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const resync = () => queueMicrotask(() => resyncSelects());
    form.addEventListener("reset", resync);
    return () => form.removeEventListener("reset", resync);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const [state, formAction, isPending] = useActionState<QuickAddState, FormData>(
    async (prev, formData) => {
      const result = await quickAdd(prev, formData);
      if (result.status === "success") {
        setText("");
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-label-primary/20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-2xl">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-4">
          <h2 className="text-[17px] font-semibold text-label-primary">
            新建日志
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-label-secondary hover:bg-surface-secondary"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <form
          ref={formRef}
          action={formAction}
          className="flex flex-1 flex-col gap-4 p-4"
          aria-label="快速添加日志"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="qa-text"
              className="text-[13px] font-medium text-label-secondary"
            >
              内容
            </label>
            <input
              ref={inputRef}
              id="qa-text"
              type="text"
              name="text"
              placeholder="记一笔…"
              className="w-full rounded-lg border border-hairline bg-bg px-3 py-2 text-[15px] text-label-primary placeholder:text-label-tertiary focus:border-accent focus:outline-none"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isPending}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? "qa-err" : undefined}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="qa-slug"
              className="text-[13px] font-medium text-label-secondary"
            >
              项目
            </label>
            <select
              id="qa-slug"
              name="slug"
              className="w-full rounded-lg border border-hairline bg-bg px-3 py-2 text-[15px] text-label-primary focus:border-accent focus:outline-none"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={isPending}
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
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="qa-agent"
              className="text-[13px] font-medium text-label-secondary"
            >
              记录者
            </label>
            <select
              id="qa-agent"
              name="agent"
              className="w-full rounded-lg border border-hairline bg-bg px-3 py-2 text-[15px] text-label-primary focus:border-accent focus:outline-none"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              disabled={isPending}
            >
              {AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {invalid && (
            <p id="qa-err" className="text-[13px] text-red-text" role="alert">
              {VALIDATION_MSG}
            </p>
          )}

          {state.status === "fs" && (
            <p className="text-[13px] text-red-text" role="alert">
              写入失败：{state.file} — {state.message}
            </p>
          )}

          <div className="mt-auto flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-label-secondary hover:bg-surface-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-accent-text px-4 py-2 text-[13px] font-medium text-label-inverse hover:bg-accent-hover disabled:opacity-50"
            >
              {isPending ? "落账中…" : "落账"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
