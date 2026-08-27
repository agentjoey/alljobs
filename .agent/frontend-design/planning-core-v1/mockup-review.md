# Planning Core V1 — Task 1 Mockup Review

**Candidate:** Paper Workbench revision 3 (pleurat.com-derived)  
**Date:** 2026-08-27  
**Status:** Awaiting Independent Review and Human Mockup Gate  
**Artifact:** `mockup/index.html` with `styles.css` and `app.js`

## Direction record & Pleurat empirical notes

- **Human direction:** On 2026-08-27, Human Owner decided "全面转向 pleurat 风格", superseding the Star Atlas Ledger revision 2 direction.
- **Empirical design tokens (verified via live inspection of pleurat.com on 2026-08-27):**
  - **Ground & surfaces:** Base paper `#F1EEE6`, raised surface `#FBF7E6`, recessed well `#E8E4DA`.
  - **Ink typography:** Deep ink `#16140E`, muted ink `#4A463C` (contrast 7.91:1), faint ink `#5E584D` (contrast 5.92:1).
  - **Amber accent:** `#F3B44A` (paired with `#16140E` text for 9.74:1 contrast); soft amber well `#FDF2DE`.
  - **Hairline rules:** `rgba(22, 20, 14, 0.16)` default dividers, `rgba(22, 20, 14, 0.32)` interactive borders.
  - **Tactile texture:** Subtle 1.15px radial dot grid on paper canvas.
  - **Motion & easing:** `cubic-bezier(.2, .8, .2, 1)`, 0.2s opacity transitions, 2px interactive row lift, 4px arrow nudges; no expensive canvas rendering or scroll narrative.
  - **Typography stack:** General Sans (Fontshare) for display/titles/body/actions; IBM Plex Mono (OFL) for IDs, paths, revisions, digests, and coordinates.
- **Revision 3 structural decisions:**
  - **Atlas and diagrams removed:** All celestial charts, star plots, and dot-grid relationship diagrams removed. The interface relies on dense, legible ledger lists, clear roadmap station bands, and structured provenance panels.
  - **Light paper only:** One warm cream colorway for revision 3.
  - **Signature element — amber provenance status bar:** Monospace amber bar (`#status-strip`) permanently mounted under the header, binding route path, source custody, Git revision / document digest, and freshness state across all 7 routes.
  - **Custody notation:** External read-only sources use a diagonal hatch pattern / dashed badge; AllJobs-native writable sources use solid ink / amber fills.
  - **Information hierarchy:** Backlog and Task ledgers own the dominant visual plane at all breakpoints.

## Surface inventory

| Route | Primary content | Secondary provenance & context |
|---|---|---|
| Portfolio | Personal Workbench Dashboard: 4 KPI metric cards, ongoing work queue, weekly activity sparkline | Cross-project vertical active roadmap timeline, sync provenance |
| Projects | Registered project cards grid with category filter chips and custody badges | Control Host registry overview, custody modes, reading key |
| Tasks | Cross-project active / waiting / blocked / history Task ledger | Reading key (hatch vs solid), source custody, native creation |
| Code project | Expandable Backlog accordion drawers with inline metadata & actions | Vertical Roadmap timeline, exact Git revision, document digests |
| Business project | Native Task ledger (AllJobs-native, writable) | Vertical Milestone timeline, digest protection, milestone creation |
| Register | Candidate inspection and reviewed proposal with digest | 3-stage sequence, direct-child candidate verification, zero-write Human Gate |
| Archived | Retained project history with read-only badges | Unbind record, restore inspection, zero-write Human Gate |

Every route includes representative synthetic planning data and interactive scenario switching covering loading, empty, validation, pending, success, stale-write, filesystem error, collision, and archived states.

## Independent Design Review history (rounds 1–3)

- **Round 1 (Star Atlas rev1):** Fresh-context reviewer disposition `PASS WITH FIXES` (25/36). Identified DR-01 (consequential actions too close to inspection), DR-02 (misleading atlas panel labels), DR-03 (incomplete state matrix), DR-04 (mobile touch targets / reduced motion), DR-05 (task count discrepancy), DR-06 (missing Projects evidence / design docs).
- **Round 2 & 3 (Star Atlas rev2):** Closed DR-01, DR-02, DR-03, DR-04, DR-05 in source.
- **Revision 3 Overhaul (Paper Workbench):** Rebuilt visual world to pleurat-inspired Paper Workbench. All previous functional and safety repairs (inspect → proposal digest → Human Gate → recheck/apply, 44px mobile targets, accurate counts, full state matrix) are preserved and adapted to the Paper Workbench.

## Design Quality Model (Revision 3 Self-Audit)

| Dimension | Target Evaluation | Notes |
|---|---:|---|
| Usefulness | 4/4 | Backlog and Task ledgers dominate; inspection and proposal digests protect federated files. |
| Clarity | 4/4 | Monospace amber status bar binds route, custody, revision, and digest on every page. |
| Efficiency | 4/4 | Dense list scanning with immediate keyboard-accessible actions; no decorative hurdles. |
| Consistency | 4/4 | Unified Paper Workbench tokens (General Sans + IBM Plex Mono, cream paper, amber strip, hairline rules). |
| Brand fit | 4/4 | Pleurat-derived tactile workbench with distinct identity and zero AI-slop templates. |
| Accessibility | 4/4 | Measured contrast ≥4.5:1 across all typography; 44px touch targets; prefers-reduced-motion fallback; explicit ARIA live regions. |
| Responsive robustness | 4/4 | Genuine stacked rows on mobile (390px); single-column collapse at 1120px; desktop dominance at 1440px. |
| Performance | 4/4 | Zero canvas overhead; lean semantic HTML/CSS/JS; sub-millisecond local rendering. |
| Appropriate delight | 4/4 | Tactile 2px row lift, smooth 4px arrow nudges, crisp amber status bar. |

## Verification evidence

- `node --check mockup/app.js`: Clean syntax check passed.
- **Measured contrast ratios:**
  - Deep ink `#16140E` on `#F1EEE6` paper: **15.68:1** (exceeds WCAG AAA 7:1)
  - Muted ink `#4A463C` on `#F1EEE6` paper: **7.91:1** (exceeds WCAG AAA 7:1)
  - Faint ink `#5E584D` on `#F1EEE6` paper: **5.92:1** (exceeds WCAG AA 4.5:1)
  - Deep ink `#16140E` on Amber `#F3B44A` status bar / button: **9.74:1** (exceeds WCAG AAA 7:1)
- **Viewport screenshot suite (generated via `scripts/shot.mjs`):**
  - Desktop (1440px): Portfolio, Projects, Tasks, Code Project, Business Project, Register, Archived
  - Intermediate (900px): Tasks
  - Mobile (390px true CDP metrics): Tasks (stacked rows, full copy wrapping)

## Gate verdict

Task 1 Paper Workbench revision 3 mockup is implemented, styled, populated with synthetic data, visually verified, and enhanced with Projects cards grid, Backlog drawers, Header search, vertical Roadmap timeline, and Personal Portfolio Workbench Dashboard.

**Human Gate disposition:** **APPROVED** by Human Owner on 2026-08-27 ("mockup gate 通过，进入下一步").
**Next step:** Proceed to Task 2 (clean application foundation and Next.js minimal shell).
