# AJ-003 header consolidation — verification

- Scope: the header keeps three primary areas (Portfolio, Monitoring, Caphub). Overview/Projects/Tasks/Register/Archived move to a Portfolio section nav. URLs are unchanged. Caphub's existing sub-nav uses the same `SectionNav` component and now shows the current item. `/capabilities/*` highlights Caphub.
- Files: `components/planning/{navigation.ts,section-nav.tsx,primary-nav.tsx,app-shell.tsx}`, `app/caphub/layout.tsx`, `app/globals.css`, `tests/smoke/app-shell.test.tsx`, `tests/e2e/planning-core.spec.ts`.
- TDD: 8 new/changed smoke assertions failed before the change (RED) and pass after it (GREEN).
- Full Vitest: 196 files / 1661 tests PASS. Typecheck PASS. Focused ESLint 0 errors; the 3 warnings are pre-existing in untouched files.
- Production webpack build PASS. `playwright.config.ts` (planning journeys + axe on home/projects/tasks) 6/6 PASS on the final build.
- Final-build screenshots at 1440 and true 390 CSS px, via Playwright viewport emulation with a fixture home: overview, projects, tasks, monitoring, caphub. Each shot asserts three primary links and no header or section-nav overflow or clipping. A keyboard Enter on a section link navigates, and `aria-current` follows.
- Pre-existing, out of scope: on the fixture Overview at 390, a missing-Backlog diagnostic row with a "View" button makes the page 481px wide. The section nav cannot cause this (`overflow-x:auto`).
- Not done: production deployment (needs separate authorization).
