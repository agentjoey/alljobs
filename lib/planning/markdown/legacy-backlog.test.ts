import { describe, expect, it } from "vitest";
import { parseBacklogDocument } from "./backlog";
import {
  convertLegacyBacklog,
  legacyPhaseId,
  parseLegacyBacklog
} from "./legacy-backlog";
import { buildLegacyRoadmap } from "./legacy-roadmap";
import { parseRoadmapDocument } from "./roadmap";
import { renderBacklogItem, renderRoadmapItem } from "./render";

const SAMPLE = `# Legacy Backlog

> Authority note.

## 维护规范

### ID

- 格式：\`GG-BL-NNN\`，一经分配不复用。

## Roadmap after Phase 6

### Phase 7 — Reliability Foundation

**Status**：DONE（2026-08-23）

**范围**：\`GG-BL-007\`、\`GG-BL-017\`。

**Closeout evidence**：PR #22。

### Phase 9 — Tool Surface Convergence

**Status**：BLOCKED before public contract change

**范围**：\`GG-BL-024\`。

目标是一次正式 Tool Epoch。

## Active backlog

### GG-BL-006 — \`selfcheck\` 误判

- **Priority**: P2
- **Status**: OPEN
- **Category**: operations UX
- **Problem**: 普通 shell 缺少 issuer。
- **Next**: 改善诊断文本。
- **Done when**: 输出区分 CLI 环境缺失与 Gateway 不健康。

### GG-BL-007 — Control-plane backup 不完整

- **Priority**: P1
- **Status**: DONE
- **Fix**: ordered migration。

### GG-BL-009: 历史文档过期描述

- **Priority**: P3
- **Status**: OPEN
- **Category**: docs
- **Done when**: 权威入口不误导。

### GG-BL-010 – 会话 channel 被禁用

- **Priority**: P0
- **Status**: MITIGATED
- **Problem**: pre-Gateway disable。

### GG-BL-011 — truncated 信号被忽略

- **Priority**: OBS
- **Status**: OBSERVATION
- **Category**: agent UX
`;

describe("parseLegacyBacklog", () => {
  it("parses items with — / - / : separators", () => {
    const { items, issues } = parseLegacyBacklog(SAMPLE, "BACKLOG.md");
    expect(issues).toEqual([]);
    const ids = items.map(i => i.id);
    expect(ids).toEqual(["GG-BL-006", "GG-BL-007", "GG-BL-009", "GG-BL-010", "GG-BL-011"]);
    expect(items[0].title).toBe("`selfcheck` 误判");
    expect(items[2].title).toBe("历史文档过期描述"); // `:` separator
    expect(items[3].title).toBe("会话 channel 被禁用"); // `–` separator
  });

  it("ignores prose sections (no ID token, not a Phase heading)", () => {
    const { items } = parseLegacyBacklog(SAMPLE);
    expect(items.some(i => i.title.includes("格式"))).toBe(false);
    expect(items.length).toBe(5);
  });

  it("records the ## group for each item", () => {
    const { items } = parseLegacyBacklog(SAMPLE);
    expect(items[0].group).toBe("Active backlog");
  });

  it("extracts phases with status text and 范围 item bindings", () => {
    const { phases } = parseLegacyBacklog(SAMPLE);
    expect(phases.length).toBe(2);
    expect(phases[0].name).toBe("Phase 7 — Reliability Foundation");
    expect(phases[0].statusText).toContain("DONE");
    expect(phases[0].itemIds).toEqual(["GG-BL-007", "GG-BL-017"]);
    expect(phases[1].itemIds).toEqual(["GG-BL-024"]);
  });

  it("flags duplicate item IDs as issues", () => {
    const dup = `## Active\n\n### GG-BL-001 — One\n\n- **Status**: OPEN\n\n### GG-BL-001 — Two\n\n- **Status**: OPEN\n`;
    const { items, issues } = parseLegacyBacklog(dup);
    expect(items.length).toBe(1);
    expect(issues.some(i => i.code === "DUPLICATE_ITEM_ID")).toBe(true);
  });
});

describe("convertLegacyBacklog", () => {
  it("maps status and priority, binds phases from 范围 lists", () => {
    const parsed = parseLegacyBacklog(SAMPLE);
    const { items, unmappable } = convertLegacyBacklog(parsed);
    expect(unmappable).toEqual([]);

    const byId = new Map(items.map(i => [i.id, i]));
    expect(byId.get("GG-BL-006")!.status).toBe("ready"); // OPEN
    expect(byId.get("GG-BL-006")!.priority).toBe("P2");
    expect(byId.get("GG-BL-007")!.status).toBe("done");
    expect(byId.get("GG-BL-007")!.phase).toBe("phase-7"); // bound via 范围
    expect(byId.get("GG-BL-010")!.status).toBe("doing"); // MITIGATED
    expect(byId.get("GG-BL-011")!.status).toBe("idea"); // OBSERVATION
  });

  it("assigns unbound items to the maintenance phase", () => {
    const parsed = parseLegacyBacklog(SAMPLE);
    const { items } = convertLegacyBacklog(parsed);
    const byId = new Map(items.map(i => [i.id, i]));
    expect(byId.get("GG-BL-006")!.phase).toBe("maintenance");
    expect(byId.get("GG-BL-010")!.phase).toBe("maintenance");
  });

  it("remaps non-canonical priorities to P2 and preserves the original in body", () => {
    const parsed = parseLegacyBacklog(SAMPLE);
    const { items } = convertLegacyBacklog(parsed);
    const obs = items.find(i => i.id === "GG-BL-011")!;
    expect(obs.priority).toBe("P2");
    expect(obs.body).toContain("- **Original priority**: OBS");
    const p3 = items.find(i => i.id === "GG-BL-009")!;
    expect(p3.priority).toBe("P2");
    expect(p3.body).toContain("- **Original priority**: P3");
  });

  it("moves Done when to done_when and keeps remaining fields plus original status in body", () => {
    const parsed = parseLegacyBacklog(SAMPLE);
    const { items } = convertLegacyBacklog(parsed);
    const item = items.find(i => i.id === "GG-BL-006")!;
    expect(item.done_when).toBe("输出区分 CLI 环境缺失与 Gateway 不健康。");
    expect(item.body).toContain("- **Category**: operations UX");
    expect(item.body).toContain("- **Problem**: 普通 shell 缺少 issuer。");
    expect(item.body).toContain("- **Original status**: OPEN");
    expect(item.body).not.toContain("**Priority**");
  });

  it("records unknown statuses in unmappable and falls back to ready", () => {
    const src = `## Active\n\n### GG-BL-050 — Weird\n\n- **Status**: WONTFIX-ISH\n- **Priority**: P1\n`;
    const { items, unmappable } = convertLegacyBacklog(parseLegacyBacklog(src));
    expect(items[0].status).toBe("ready");
    expect(unmappable).toEqual([
      { id: "GG-BL-050", reason: 'unknown status "WONTFIX-ISH" mapped to ready' }
    ]);
  });

  it("treats entries with a DONE date but no Status as done", () => {
    const src = `## Archive\n\n### GG-BL-001 — Already fixed\n\n- **DONE date**: 2026-08-22\n- **Fix**: shipped in PR #1。\n`;
    const { items, unmappable } = convertLegacyBacklog(parseLegacyBacklog(src));
    expect(unmappable).toEqual([]);
    expect(items[0].status).toBe("done");
  });

  it("round-trips: rendered output re-parses with zero issues", () => {
    const parsed = parseLegacyBacklog(SAMPLE);
    const { items } = convertLegacyBacklog(parsed);
    const text = items.map(renderBacklogItem).join("\n\n") + "\n";
    const reparsed = parseBacklogDocument(text, "round-trip.md");
    expect(reparsed.issues).toEqual([]);
    expect(reparsed.valid.map(i => i.id)).toEqual(items.map(i => i.id));
  });
});

describe("buildLegacyRoadmap", () => {
  it("maps phase status text and derives id/order from the name", () => {
    const parsed = parseLegacyBacklog(SAMPLE);
    const { items } = buildLegacyRoadmap(parsed.phases);
    expect(items.length).toBe(2);
    expect(items[0]).toMatchObject({
      id: "phase-7",
      title: "Phase 7 — Reliability Foundation",
      kind: "phase",
      status: "done",
      order: 70
    });
    expect(items[1]).toMatchObject({ id: "phase-9", status: "paused", order: 90 });
    expect(items[0].summary).toContain("Closeout evidence");
  });

  it("emits a maintenance phase only when requested", () => {
    const parsed = parseLegacyBacklog(SAMPLE);
    const without = buildLegacyRoadmap(parsed.phases);
    expect(without.items.some(i => i.id === "maintenance")).toBe(false);
    const withM = buildLegacyRoadmap(parsed.phases, { includeMaintenance: true });
    const maintenance = withM.items.find(i => i.id === "maintenance")!;
    expect(maintenance).toMatchObject({
      title: "Maintenance lane",
      status: "active",
      order: 99
    });
  });

  it("round-trips: rendered roadmap re-parses with zero issues", () => {
    const parsed = parseLegacyBacklog(SAMPLE);
    const { items } = buildLegacyRoadmap(parsed.phases, { includeMaintenance: true });
    const text = items.map(renderRoadmapItem).join("\n\n") + "\n";
    const reparsed = parseRoadmapDocument(text, "round-trip-roadmap.md");
    expect(reparsed.issues).toEqual([]);
    expect(reparsed.valid.length).toBe(3);
  });

  it("slugifies unnumbered phase names", () => {
    expect(legacyPhaseId("Phase 7 — Reliability Foundation")).toBe("phase-7");
    expect(legacyPhaseId("Hardening — Q3")).toBe("hardening-q3");
  });
});
