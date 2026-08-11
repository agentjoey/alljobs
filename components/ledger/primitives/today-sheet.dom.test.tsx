// @vitest-environment jsdom
/**
 * 落账提交生命周期回归（真实 DOM + React 19 form action 隐式 reset）。
 *
 * 背景缺陷：React 19 在 form action 完成后会对 <form> 执行隐式 reset()，
 * 把受控 select 的 DOM 值打回默认，而 slug/agent 的 state 没变、不再触发重渲染
 * 去重新施加受控值——显示与 state 脱节，下一笔回车按 state 静默落账。
 * 静态标记断言（renderToStaticMarkup）完全走不到这条路径，必须真跑 submit → reset。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { quickAdd } from "../../../app/actions/quickadd";
import { TodaySheet } from "./today-sheet";

vi.mock("../../../app/actions/quickadd", () => ({
  quickAdd: vi.fn(async () => ({
    status: "success",
    entry: { date: "2026-08-11", time: "21:49", slug: "diskwatch", agent: "kimi", text: "syncprobe-1" },
  })),
}));

// jsdom 默认无 rAF（pretendToBeVisual 未开）。polyfill 为「只登记、不回调」：
// 回归断言必须在没有任何帧回调救场的情况下成立（浏览器里 rAF 回调跑在隐式 reset
// 之前，对 reset 后的脱节同样无救——见 today-sheet.tsx 注释），定时器时序不入测试。
window.requestAnimationFrame = () => 0;
window.cancelAnimationFrame = () => {};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

describe("TodaySheet 落账提交生命周期（submit → 隐式 reset）", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.mocked(quickAdd).mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<TodaySheet entries={[]} slugs={["diskwatch", "petcare-app"]} />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  const els = () => ({
    form: container.querySelector("form")!,
    input: container.querySelector<HTMLInputElement>('input[name="text"]')!,
    slug: container.querySelector<HTMLSelectElement>('select[name="slug"]')!,
    agent: container.querySelector<HTMLSelectElement>('select[name="agent"]')!,
  });

  const submit = () =>
    act(async () => {
      els().form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

  test("成功落账后受控 select 显示与 state 一致，第二笔落账与屏幕所见一致", async () => {
    const { input, slug, agent } = els();
    await act(async () => {
      setNativeValue(slug, "diskwatch");
      setNativeValue(agent, "kimi");
      setNativeValue(input, "syncprobe-1");
    });
    expect(slug.value).toBe("diskwatch");
    expect(agent.value).toBe("kimi");

    await submit();

    // 回归断言：隐式 reset 之后，select 的 DOM 显示必须仍是受控 state 的值
    // （修复前：reset 打回默认 ""/joey 且再无重渲染，显示与 state 全程脱节）
    expect(slug.value).toBe("diskwatch");
    expect(agent.value).toBe("kimi");
    // 文本按规格清空
    expect(input.value).toBe("");

    // 第二笔：完全不碰 select，只敲内容——屏幕显示什么，就得落账什么
    await act(async () => {
      setNativeValue(input, "q");
    });
    await submit();

    expect(slug.value).toBe("diskwatch");
    expect(agent.value).toBe("kimi");
    const calls = vi.mocked(quickAdd).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [, formData] of calls) {
      expect(formData.get("slug")).toBe("diskwatch");
      expect(formData.get("agent")).toBe("kimi");
    }
    expect(calls[0][1].get("text")).toBe("syncprobe-1");
    expect(calls[1][1].get("text")).toBe("q");
  });
});
