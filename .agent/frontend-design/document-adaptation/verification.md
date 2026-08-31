# Document adaptation — Verification Record

## Bound target

- **Brief:** `.agent/frontend-design/document-adaptation/brief.md` revision 1; rendered mockup revision 2 approved by the Human Owner.
- **Tier:** T2.
- **Branch / worktree:** `codex/document-adaptation` · `.worktrees/document-adaptation`.
- **Final implementation build:** `1b3dbdcf94a36ddf44db7f8fe67207759d8c8e30` (`fix(ui): wrap document diagnostic paths`).
- **Build mode:** production Next.js build with Webpack fallback; no deployment or production service was used.
- **Fixture boundary:** private temporary root created by `tests/e2e/document-adaptation-fixtures.ts`, guarded by an unguessable sentinel and owner PID, with `ALLJOBS_HOME` and `ALLJOBS_DATA_ROOT` bound only to that root. Cleanup revalidates ownership before removal. Production checkout data and `~/.alljobs` were not used.

## TDD evidence

The first executable E2E run used a fixture containing only `canonical-code`. Result: **1 passed, 4 failed**. Missing, recoverable/unstructured, remote, and 390px keyboard journeys failed because those fixture projects did not yet exist. The completed fixture was then added and the same assertions were rerun.

The plan's literal `npm exec playwright test --config playwright.document-adaptation.config.ts` is misparsed by this repository's current npm as npm configuration and starts the default Playwright config on port 3456. The effective equivalent used for all valid evidence was:

```text
npm exec -- playwright test --config=playwright.document-adaptation.config.ts
```

## Final validation

| Check | Result |
| --- | --- |
| Focused Vitest command from Task 5 | PASS — 10 files, 59 tests |
| `npm run lint` | PASS — 0 errors, 64 pre-existing repository warnings |
| `npm run typecheck` | PASS |
| `npm run build` | ENVIRONMENTAL FAILURE — Turbopack attempted to bind a helper port while processing `app/globals.css`; sandbox returned `Operation not permitted (os error 1)` |
| `./node_modules/.bin/next build --webpack` | PASS — compiled production build; 7 routes reported |
| Final E2E against that Webpack build | PASS — 5 tests, 1 worker |

The five browser journeys prove:

1. canonical data remains in normal Roadmap/Backlog views;
2. a missing local Backlog beats an older cached Backlog and never renders its cached item;
3. recoverable and unstructured candidates stay evidence-only;
4. a remote canonical projection remains read-only; and
5. the copy-only repository-agent handoff is keyboard reachable and operable at a true 390 CSS px viewport with no horizontal page scroll.

## Plan-interface reconciliation

Task 5's early sample expected a disabled `Manage ordering` control for every degraded source. The approved Task 4 interface instead **withholds** the control whenever Backlog document health is missing, recoverable, unstructured, unavailable, or absent. The E2E therefore asserts zero such controls in degraded states. A canonical remote projection still renders `Manage ordering` disabled, proving the existing read-only-source behavior. This preserves the approved hierarchy and avoids presenting an irrelevant mutation affordance beside non-canonical evidence.

## Final responsive evidence

- `screenshots/final-canonical-1440.png` — canonical local source, normal counts and exact revision/digests.
- `screenshots/final-missing-900.png` — missing Backlog, exact fixed path, no zero-count disguise, copy-only handoff.
- `screenshots/final-missing-390.png` — true 390 CSS px via `scripts/shot.mjs` device metrics at scale 2.

All three were captured from the isolated final build after `1b3dbdc`. Visual inspection found no page clipping or contrast/state ambiguity. The long temporary source path wraps inside the health sheet; canonical and missing states remain distinct; the copy control remains fully visible. Keyboard focus and activation are evidenced by the automated 390px journey rather than a static focus screenshot.

## Gate status

- Human rendered Mockup Gate: **APPROVED** for mockup revision 2.
- Primary implementation validation: **PASS** for the checks above.
- Independent `impeccable critique` and browser/a11y verification: **PASS** for Task 5 artifact `e32b07d42d3e3e46eaf11e1df77a156c24381202`.
  - Assessment A independently scored the Paper Workbench surface **31/40**. It found no canonical/candidate, copy-only, keyboard, responsive, or state-matrix failure. Its two follow-up recommendations are recorded as non-blocking backlog candidates: elevate degraded handoff prominence and make the global provenance strip source-aware. They require a separate approved shell-level design task: Task 4 deliberately owns `DocumentHealth` and existing project surfaces only, while `AppShell` cannot receive route-specific source state from the root layout. The current health section remains directly above the tab panel with exact source facts and a copy-only action, as Task 4 requires.
  - Assessment B independently rebuilt the final Webpack target and ran the isolated Chromium suite: **5/5 passed**. It verified local-missing no-cache fallback, recoverable/unstructured evidence-only presentation, remote read-only disabled ordering, true-390 keyboard copy with a polite success message, and no horizontal page overflow. The DocumentHealth detector reported **0 findings**. Cache read-only is source/fixture-inspected, not separately browser-navigated; no broader WCAG claim is made because automated axe is not bundled.
- Final independent assessment: **PASS — no P0/P1 correction is required within this approved Task 5 scope.**
- Push, merge, deploy, production service, Tunnel, Access, DNS, port 3456, and refresh worker: **NOT TOUCHED**.
