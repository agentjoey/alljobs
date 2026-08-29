# R1 Backlog Control — T3 Brief

**Revision:** 3  
**Status:** Human Owner approved rendered Mockup Gate — Task 1 authorized  
**Date:** 2026-08-29  
**Canonical inputs:** `docs/superpowers/specs/2026-08-29-alljobs-r1-backlog-control-design.md` · `docs/superpowers/plans/2026-08-29-alljobs-r1-backlog-control.md` · `docs/superpowers/specs/2026-08-29-alljobs-product-roadmap-design.md`

## Start Card

```md
Workflow: 3.3
Task: R1 Task 0 — Backlog Control rendered Mockup Gate
Role: Primary Agent
Tier / 理由: T3 — a new core Backlog journey with consequential repository write-back
Canonical record: .agent/frontend-design/r1-backlog-control/
Branch / worktree: codex/r1-backlog-control · .worktrees/r1-backlog-control
Mockup Gate: Required — Human Owner must approve the rendered revision before Task 1
Review path: Review Packet now; independent Review + Verification must run in a fresh authorized session
Human checkpoints: rendered mockup direction; later final build, pilot write, and release
```

## Outcome and boundary

- **Baseline:** code-project Backlog is a mirror/cache read-only projection and has no canonical rank.
- **Target:** one real pilot can initialize and reorder existing items with an exact field-level diff, full-file stale protection, and zero Git mutation.
- **Allowed direct mutation only:** existing `priority` and `rank`; rank is unique within `project + phase + priority`.
- **Source precedence:** validated Control Host local working tree (including uncommitted changes) → remote commit/mirror → cached projection. A present invalid local source remains visible and non-writable; it never falls through to remote content.
- **Non-goals:** no new item write, Phase move, Markdown editor, commit/push/merge/fetch, repository-code execution, automatic agent start, production service or deployment change.
- **Release blocker:** any unrelated byte change, path escape, missing Human Gate, or failed boundary test.

## Shape record — accepted implementation direction

- **Mode / audience:** Operate. The single owner arrives to inspect the real source of a code-project Backlog and make a small, deliberate ordering change without hiding human work.
- **Structural thesis:** a Backlog ledger remains the dominant reading plane; a compact provenance rail and a single inline review plane make source authority, digest, and pending field changes impossible to miss.
- **Paper Workbench continuity:** retain warm paper, ink/hairline ledger discipline, General Sans + IBM Plex Mono, and the amber provenance strip. The retired Star Atlas / “星图坐标册” language is expressly excluded.
- **Focal moment:** review makes the exact affected fields, full-file digest, renumbering scope, and explicit Human Gate legible together; no simulated write ever occurs in this mockup.
- **Responsive decision:** desktop may expose a drag affordance as progressive enhancement. Keyboard and narrow/mobile controls always provide labeled Move Up, Move Down, and Change Priority actions; mobile recomposes each ledger row rather than horizontally scrolling a table.
- **Revision 2 (Human-directed):** Header, main navigation, universal search, source strip, and page rhythm follow the existing Planning Core shell. Backlog items now read as a single-column card stream rather than a multi-column ledger; cards retain compact technical provenance and explicit ordering controls.
- **Revision 3 (review repair):** completes every state-matrix view; keeps priority-only changes available before rank initialization; recomposes review diffs and confirmation controls into readable 390px cards; includes handoff Notes in the visible copy text; and aligns typography to General Sans + IBM Plex Mono.

## State matrix

| State | Mockup evidence / required outcome |
|---|---|
| Loading | Source read/proposal line is visibly pending; content remains structurally stable. |
| Empty | A valid empty Backlog gives proposal guidance without inventing a second source. |
| Unranked | Local modified source; readable ledger; priority edit available; reorder disabled; `Initialize ordering` proposes ranks. |
| Editing | Local ranked source; page-local draft bar counts changes; no repository write. |
| Reviewing | Single-item move and group-renumbering previews show exact `priority`/`rank` values, source facts, and digest. |
| Applying | Confirmation is disabled and names the bounded action. |
| Success | Result digest and affected IDs are explicit. |
| Stale | `STALE_WRITE` says zero write occurred, preserves the intent summary, and provides refresh/review recovery. |
| Locked | Temporary AllJobs lock has retry guidance. |
| Invalid | Present local source exposes proof issues and repo-agent repair guidance; it does not show remote fallback. |
| Read-only | Remote commit and cache show non-writable provenance plus proposal-only route. |
| Unavailable | No readable planning source states the recovery prerequisite. |
| New item | Copyable repository-agent handoff contains request facts but no save, AI, or write action. |

## Interaction and safety contract

1. `Manage ordering` opens a page-local draft only.
2. Drag is labeled as desktop assistance, never sole capability. Move Up, Move Down, and Change Priority are visible in editing and narrow modes.
3. `Review changes` presents a field-only proposal with expected source digest and proposal digest.
4. `Apply` is a Human Gate in the eventual product. This standalone mockup never changes a document.
5. Cross-Phase movement is unavailable and explains that a repository-agent proposal is required.
6. Reduced motion removes all transition/lift behavior without hiding feedback or controls.

## Evidence, rollback, and gates

- Mockup preview is standalone, synthetic, and uses no production imports or services.
- Screenshots must use `scripts/shot.mjs` at 1440, 900, and true CDP 390px mobile metrics.
- Application rollback returns to prior read-only behavior; it never silently undoes a confirmed repository edit.
- A Human Owner-selected real pilot is required before any later production write; this task selects no pilot and changes no repository Backlog.
- Human Owner explicitly authorized the repaired revision 3 and Task 1 on 2026-08-29, with no repeat independent review requested. The mockup remains a synthetic, non-production artifact.
