# R1 Backlog Control — Mockup Review Record

**Candidate:** Paper Workbench Backlog Control mockup, revision 3  
**Status:** Human Owner Mockup Gate passed; Task 1 authorized  
**Scope:** Task 0 only; standalone synthetic HTML/CSS/JS, no production imports

## Primary shape and bounded visual inspection

The Primary Agent used the `impeccable shape` process to record the established Paper Workbench direction, Operate-mode hierarchy, state matrix, and responsive/keyboard constraints in `brief.md`. The mockup was then rendered in a bounded desktop / intermediate / true-mobile pass.

Revision 2 is a Human-directed visual correction: it reuses the existing Planning Core header, navigation, universal search, source strip, and page rhythm; it changes only the Backlog reading unit from a multi-column ledger row to a single-column card. Revision 3 repairs the independent-review findings while preserving that direction. Earlier screenshots are superseded and must not be used for the Gate.

### Findings and disposition

| ID | Finding | Severity | Disposition |
|---|---|---:|---|
| MR-01 | At 390px the provenance strip held several source fields in one non-wrapping flex row, so the complete digest and source facts were not reliably visible. | P1 | Fixed in `mockup/styles.css` by allowing provenance facts to wrap. All final screenshots were regenerated afterward. |
| MR-02 | A desktop drag affordance could be interpreted as the sole ordering method. | P0 if unaddressed | Addressed: editing rows expose labeled `Move … up`, `Move … down`, and `Change priority …` buttons. The 390px final state is Editing specifically to evidence those controls. |
| MR-03 | A present invalid local source could be visually confused with an unavailable remote source. | P0 if unaddressed | Addressed: `LOCAL SOURCE INVALID` has its own rust proof-issue state and explicitly says no older remote mirror is substituted. |
| MR-04 | There is no independent assessment in this task context. | Gate blocker | Not self-waived. `review-packet.md` is ready for a fresh reviewer to run `$impeccable critique` plus an independent rendered inspection. |
| MR-05 | Revision 1's multi-column ledger did not match the Human Owner's preferred current-project layout. | Human-directed revision | Resolved in revision 2: the existing Header / search / navigation / provenance shell is retained, and Backlog items become a single-column card stream. All screenshots in `mockup-screens/` were re-rendered. |

## State coverage

| Required state | Interactive state selector | Evidence |
|---|---|---|
| Local modified + unranked | `Unranked` | `mockup-screens/backlog-1440.png` |
| Ranked + editing | `Editing` | `mockup-screens/backlog-390.png` |
| Single-item move review | `One-item review` | `mockup-screens/backlog-review-390.png` |
| Group renumbering review | `Renumber review` | `mockup-screens/backlog-900.png` |
| Stale write | `Stale write` | `mockup-screens/backlog-stale-900.png` |
| Invalid local source | `Invalid local` | `mockup-screens/backlog-invalid-900.png` |
| Remote/cache read-only | `Read only` | `mockup-screens/backlog-readonly-900.png` |
| New repo-agent handoff | `New-item handoff` | `mockup-screens/backlog-handoff-900.png` |

## Checks run by Primary Agent

| Command / inspection | Result |
|---|---|
| `node --check .agent/frontend-design/r1-backlog-control/mockup/app.js` | Passed after the review-state template syntax correction. |
| `git diff --check` | Passed. |
| `node scripts/shot.mjs … 1440 2 0 light` | Passed; standalone unranked/local-modified capture. |
| `node scripts/shot.mjs … 900 2 0 light` | Passed; standalone group-renumber review capture. |
| `node scripts/shot.mjs … 390 2 1 light` | Passed; true CDP mobile editing capture. |
| Visual inspection of final 390 capture | Source facts wrap; controls are stacked and use labeled buttons rather than drag. |

## Gate statement

Independent critique was completed below. Following the recorded fixes, the Human Owner explicitly authorized the repaired rendered mockup and entry to Task 1 on 2026-08-29, with an explicit instruction not to repeat the review. This approval unlocks Task 1 only; it does not approve production release, deployment, Git mutation, or later tasks.

## Independent critique — 2026-08-29

**Method:** dual-agent independent assessment: design / interaction review plus rendered-evidence / detector review.  
**Disposition:** **REQUEST_CHANGES — not ready for Human Mockup Gate.**

| ID | Severity | Independent finding | Required disposition |
|---|---:|---|---|
| IR-01 | P1 | The canonical state matrix is not fully rendered: Loading, Empty, Applying (duplicate disabled), Success (result digest), Locked, Unavailable, and cached read-only are absent. | Add controller states and state-selector coverage; capture final rendered evidence. |
| IR-02 | P1 | Unranked items say priority edits remain available, but show no visible/labeled Change Priority action. | Preserve the no-rank ordering lock while exposing the allowed priority-only action. |
| IR-03 | P1 | At 390px, review forces a 610px table and a 420px action footer within a horizontally scrolling panel; the decisive field diff and Confirm action are clipped. | Recompose the review into vertically readable change cards and full-width confirmation controls on mobile. |
| IR-04 | P1 | The new-item handoff omits the required Notes field and copied Notes content. | Add Notes to the form and handoff text. |
| IR-05 | P2 | Mockup imports/uses Manrope, while current Paper Workbench authority specifies General Sans plus IBM Plex Mono. | Align the mockup type stack to the current design system. |
| IR-06 | P2 | Stale state promises a prior-intent view, but its control has no demonstrated transition. | Make the prior intent visible within the stale state or wire the control to a visible panel. |

### Confirmed strengths

- Revision 2 correctly adopts the current Planning Core header, navigation, universal search, amber provenance strip, and a calm single-column Backlog card stream.
- Local modified / invalid-local-no-fallback / remote read-only source authority is concrete and text-backed.
- 390px editing preserves 44px labeled Move up, Move down, and Change priority controls; reduced-motion behavior remains available.

### Independent evidence

- Both reviewers ran `node --check` and `git diff --check` successfully.
- The evidence review confirmed the eight supplied screenshots have the expected 1440/900/true-390 CDP dimensions; no production service was started and no file was changed by reviewers.
- The detector found one type-system warning: Manrope is undeclared relative to the documented Paper Workbench direction.

## Revision 3 repair disposition — 2026-08-29

| ID | Disposition in revision 3 | Evidence |
|---|---|---|
| IR-01 | Fixed: Loading, Empty, Applying, Applied, Locked, Unavailable, and Cached read-only are interactive selector states. | `mockup/app.js`; corresponding 900px captures for Applying, Cached, and Unavailable. |
| IR-02 | Fixed: each unranked card exposes Change Priority while Move Up/Down remain unavailable before initialization. | `mockup/app.js`; `backlog-1440.png`. |
| IR-03 | Fixed: review is a responsive change-card list, with vertical full-width 44px actions at 390px. | `backlog-390.png`, `backlog-review-390.png`. |
| IR-04 | Fixed: handoff has Notes and its copyable proposal includes Notes. | `backlog-handoff-900.png`. |
| IR-05 | Fixed: General Sans plus IBM Plex Mono replace Manrope. | `mockup/index.html`, `mockup/styles.css`. |
| IR-06 | Fixed: stale state shows a native Prior intent disclosure with the prior fields visible. | `backlog-stale-900.png`. |

**Human Owner authorization:** “授权，修复后进入 task1，不用反复评审” (2026-08-29). The owner authorized revision 3 after these fixes and explicitly waived a repeat independent review. Task 1 may begin.
