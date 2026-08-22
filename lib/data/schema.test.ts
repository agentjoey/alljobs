import { describe, it, expect } from "vitest";
import { projectFrontmatterSchema, logLineSchema } from "./schema";

const validFrontmatter = {
  title: "Pactify Apps",
  type: "code",
  status: "active",
  priority: "P0",
  agents: ["claude", "codex"],
  links: { repo: "~/AgentWorks/CodeSpace/pactify-apps", url: "https://pactify.app" },
  tags: ["ios", "app-store"],
  started: "2026-06-02",
  due: "2026-08-20",
};

describe("projectFrontmatterSchema", () => {
  it("接受合法 frontmatter（含可选字段）", () => {
    const r = projectFrontmatterSchema.safeParse(validFrontmatter);
    expect(r.success).toBe(true);
  });

  it("接受 blocked 项目（blocked_reason + blocked_since）", () => {
    const r = projectFrontmatterSchema.safeParse({
      ...validFrontmatter,
      status: "blocked",
      blocked_reason: "等海外供应商报价答复",
      blocked_since: "2026-08-06",
      due: undefined,
    });
    expect(r.success).toBe(true);
  });

  it("拒绝非法 status", () => {
    const r = projectFrontmatterSchema.safeParse({ ...validFrontmatter, status: "doing" });
    expect(r.success).toBe(false);
  });

  it("拒绝非法 priority", () => {
    const r = projectFrontmatterSchema.safeParse({ ...validFrontmatter, priority: "P9" });
    expect(r.success).toBe(false);
  });

  it("拒绝非法日期格式", () => {
    const r = projectFrontmatterSchema.safeParse({ ...validFrontmatter, started: "Aug 2026" });
    expect(r.success).toBe(false);
  });

  it("blocked 缺 blocked_reason 时拒绝", () => {
    const r = projectFrontmatterSchema.safeParse({ ...validFrontmatter, status: "blocked" });
    expect(r.success).toBe(false);
  });

  it("拒绝空 agents 数组", () => {
    const r = projectFrontmatterSchema.safeParse({ ...validFrontmatter, agents: [] });
    expect(r.success).toBe(false);
  });
});

describe("logLineSchema", () => {
  it("接受合法日志行", () => {
    const r = logLineSchema.safeParse({
      time: "09:42",
      slug: "pactify-apps",
      agent: "codex",
      text: "TestFlight #42 上传成功",
    });
    expect(r.success).toBe(true);
  });

  it("拒绝非法时间（25:99）", () => {
    const r = logLineSchema.safeParse({
      time: "25:99",
      slug: "alljobs",
      agent: "claude",
      text: "x",
    });
    expect(r.success).toBe(false);
  });

  it("拒绝空正文", () => {
    const r = logLineSchema.safeParse({
      time: "08:00",
      slug: "alljobs",
      agent: "claude",
      text: "",
    });
    expect(r.success).toBe(false);
  });

  it("接受 kind=session", () => {
    const r = logLineSchema.safeParse({
      time: "21:14",
      slug: "alljobs",
      agent: "kimi",
      kind: "session",
      text: "重设计 brief 定稿",
    });
    expect(r.success).toBe(true);
    expect((r as { success: true; data: { kind: string } }).data.kind).toBe("session");
  });

  it("kind 缺省为 null", () => {
    const r = logLineSchema.safeParse({
      time: "08:00",
      slug: "alljobs",
      agent: "claude",
      text: "无 kind 日志",
    });
    expect(r.success).toBe(true);
    expect((r as { success: true; data: { kind: unknown } }).data.kind).toBeNull();
  });

  it("拒绝未知 kind", () => {
    const r = logLineSchema.safeParse({
      time: "08:00",
      slug: "alljobs",
      agent: "claude",
      kind: "standup",
      text: "x",
    });
    expect(r.success).toBe(false);
  });
});
