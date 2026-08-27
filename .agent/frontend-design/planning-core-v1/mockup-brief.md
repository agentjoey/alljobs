# Planning Core V1 Mockup Surface Brief

## Scope and mode

- Artifact: `.agent/frontend-design/planning-core-v1/mockup/index.html`
- Mode: Operate
- Boundary: standalone, synthetic, non-production Task 1 evidence; no Next.js replacement runtime and no canonical data writes
- Required surfaces: Portfolio, Projects, Tasks, code-project detail, business-project detail, Register, Archived

## Audience, job, and priority

Joey uses AllJobs to find and inspect work across code-development and business-operation projects. Backlog and Task content are the highest-frequency reading surfaces and must dominate available space. Roadmap, source provenance, project identity, and attention state provide context without displacing those lists.

## Direction and approval

- Visual world revision 3: pleurat.com-derived paper workbench — warm cream paper field with fine hairline texture, ink typography, a single amber accent, uppercase mono technical annotation, hairline rules, and hatch-versus-solid provenance fills.
- Human direction decision: 2026-08-27, "全面转向 pleurat 风格", after a live technical inspection of pleurat.com. This explicit Human Owner decision supersedes both the 2026-08-26 Star Atlas selection and the round-1 rejection of the earlier Pleurat-derived candidate.
- Workflow red-line note: a cream default ground and uppercase mono labels are workflow red lines unless the brand system explicitly requires them; the Human Owner's 2026-08-27 pin is that explicit requirement, recorded here as the exception.
- Composition decision: Backlog and Task ledgers remain the dominant reading plane (unchanged from revision 1/2).
- Direction evidence: live CDP inspection of `https://www.pleurat.com` (fonts, palette, hover transitions, curtain route transition, scroll reveals) on 2026-08-27; notes in `mockup-review.md`.

## Revision 3 decisions (Human Owner, 2026-08-27)

- **Atlas/diagrams removed.** No star atlas, no dot-grid relationship diagrams, no decorative canvas. Pure ledger lists plus provenance panels; the interface earns its identity from typography, rules, and the status strip, not from diagrams.
- **Light paper only.** One cream colorway for revision 3; a dark variant is a later, separate decision.
- **Signature element: the amber provenance status bar.** A mono-typeset amber strip binds route path, source custody, revision/digest, and freshness state (`FRESH` / `STALE` / `READ ONLY`) to every consequential surface — the one deliberate element tying identity to planning and navigation.

## Surface concept

The interface is a paper workbench: dense ledger rows on a cream field, divided by hairlines, annotated in mono. Amber appears only as the provenance/status strip, the primary action, and the current-position mark. Motion is restrained: 0.2s opacity hovers, a 2px lift on interactive rows, and a 4px arrow nudge; no scroll reveals, no counters, no curtain.

## Implementation inventory

| Visible ingredient | Commitment | Medium |
|---|---|---|
| App frame and route navigation | fixed, quiet, keyboard-operable | semantic HTML/CSS |
| Backlog and Task ledgers | dominant density, full copy, stacked mobile rows | semantic HTML/CSS |
| Amber provenance status bar | route path + source custody + revision/digest + freshness, per surface | semantic HTML/CSS |
| Provenance and issue panels | compact source facts and explicit recovery | semantic HTML/CSS |
| Icons | one consistent 1.7px authored SVG line set | inline SVG |
| Synthetic data disclosure | visible on every route | semantic HTML |
| Atlas/diagram panels | removed in revision 3 | deliberate omission |
| Decorative raster imagery | none required | accepted omission |

## Typography and palette commitments

- General Sans (400/500/600/700) for display, titles, body, and actions; IBM Plex Mono (400/500) for IDs, paths, revisions, digests, and status annotation. Both are freely licensed (Fontshare / OFL).
- Cream paper ground (`#f1eee6` family) with ink `#16140e` text; muted inks for secondary copy; amber `#f3b44a` reserved for provenance strip, primary action, and current mark; muted rust reserved for attention/failure, always with text.
- Hairline `rgba(15,21,36,.1)` rules; flat surfaces, no card shadows at rest; dialogs may carry one structural shadow.
- Measured contrast must stay ≥4.5:1 for body text on paper.

## Responsive commitments

- Desktop: ledgers occupy the majority of the viewport; provenance and facts sit in a secondary column.
- Intermediate (~1120px): single-column composition; source facts move below the primary ledger.
- Mobile (~720px and below): header recomposes, navigation stays a horizontally scrollable row, ledger rows stack with two-line wrapping; no horizontally shrunk tables.
- Content is visible by default, focus is explicit, 44px minimum mobile targets, and reduced motion removes all non-essential transitions.

## Unresolved decisions

Whether the paper workbench survives production implementation remains a Human Mockup Gate decision. Production implementation remains blocked until revision-3 screenshots are regenerated, independent review is closed, and the Human Owner approves the rendered result.
