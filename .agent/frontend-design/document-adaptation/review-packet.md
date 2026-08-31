# Document adaptation — Final Independent Review Packet

## Dispatch record

- **Task / Brief:** Document adaptation and degradation · `.agent/frontend-design/document-adaptation/brief.md` revision 1.
- **Tier / approved visual direction:** T2 · rendered mockup revision 2 approved by the Human Owner.
- **Reviewer roles:** fresh independent Review agent using `impeccable critique`; fresh independent Verification run for browser behavior, keyboard, a11y, and responsive evidence. One fresh session may perform both only if it did not implement or direct the work.
- **Target implementation build:** `1b3dbdcf94a36ddf44db7f8fe67207759d8c8e30`.
- **Target branch/worktree:** `codex/document-adaptation` · `.worktrees/document-adaptation`.
- **Task 5 artifact commit:** controller must append the exact commit created from this packet, E2E/config, and final screenshots before dispatch.
- **Independence:** do not inherit or trust the implementation agent's conclusions; reproduce the relevant evidence read-only.
- **Result write-back:** `.agent/frontend-design/document-adaptation/verification.md` and an independent report under `.superpowers/sdd/2026-08-30-alljobs-document-adaptation/`.

## Authoritative inputs

1. `docs/superpowers/specs/2026-08-30-alljobs-document-adaptation-design.md`
2. `docs/superpowers/plans/2026-08-30-alljobs-document-adaptation.md`, Task 5
3. `.agent/frontend-design/document-adaptation/brief.md`
4. `DESIGN.md` — Paper Workbench
5. `/Users/xtation/AgentWorks/Tools/FRONTEND-DESIGN-WORKFLOW.md` version 3.3
6. `.agent/frontend-design/document-adaptation/verification.md`

## Non-negotiable boundaries

- Only strict canonical parser output may affect counts, relations, ordering, tasks, or mutation authority.
- Missing, recoverable, unstructured, unavailable, and legacy no-triage sources must not expose ordering.
- A selected local source never falls back to an older mirror/cache merely because the local document is missing or invalid.
- Candidates are evidence only. The sole adaptation action is copy-only repository-agent handoff.
- No review action may write a planning document, run project code, use production data, or touch service/deployment configuration.

## Required functional and state verification

Re-run:

```text
npm test -- lib/planning/document-triage.test.ts lib/planning/providers/local-paths.test.ts lib/planning/providers/local-working-tree.test.ts lib/planning/providers/source-resolver.test.ts lib/planning/providers/git-markdown.test.ts lib/planning/providers/refresh.test.ts lib/planning/document-handoff.test.ts lib/planning/queries/project.test.ts components/planning/document-health.test.tsx components/planning/components.test.tsx
npm run lint
npm run typecheck
./node_modules/.bin/next build --webpack
npm exec -- playwright test --config=playwright.document-adaptation.config.ts
```

Confirm in the isolated fixture:

- canonical local source keeps normal data and ordering behavior;
- missing local Backlog shows `Missing document`, exact path, no cached item, and no ordering control;
- recoverable and unstructured content shows candidates only as `Not canonical planning data` / evidence;
- canonical remote source shows `REMOTE COMMIT · READ ONLY` and a disabled ordering control;
- true 390px keyboard traversal reaches and activates `Copy repository-agent handoff`;
- no degraded state shows priority/rank/drag/apply/create-planning affordances; and
- no horizontal page scroll exists at 390px, including long absolute diagnostic paths.

## `impeccable critique` brief

Evaluate the final build, not the static mockup. Score the ten Nielsen heuristics from 0–4 and report the total/available score. Also assess the workflow Design Quality Model: usefulness, clarity, efficiency, consistency, brand fit, accessibility, responsive robustness, performance, and appropriate delight.

Use at least these personas:

- **Alex, impatient power user:** can source authority and the only safe action be found immediately without a misleading disabled control in degraded states?
- **Sam, keyboard/screen-reader user:** are headings, status announcements, focus order, copy feedback, and fallback text usable without a pointer?
- **Casey, distracted mobile user:** at true 390px are source facts, state, and the 44px copy action retained without page clipping?

Prioritize findings as P0 blocking, P1 major, P2 minor, or P3 polish. For every finding cite route/state, viewport, element, evidence, violated requirement, and a concrete correction. Explicitly inspect:

- canonical vs candidate visual identity;
- path/revision/digest wrapping and legibility;
- missing vs numeric-zero distinction;
- remote/cache read-only language;
- absence of degraded mutation affordances;
- copy success and clipboard-unavailable recovery;
- focus visibility, color-independent status, text contrast, reduced motion, and 200% zoom resilience; and
- Paper Workbench header, provenance strip, density, and single-column health hierarchy.

## Evidence to inspect

- `.agent/frontend-design/document-adaptation/screenshots/final-canonical-1440.png`
- `.agent/frontend-design/document-adaptation/screenshots/final-missing-900.png`
- `.agent/frontend-design/document-adaptation/screenshots/final-missing-390.png`

The three images are post-`1b3dbdc` final-build evidence. Reproduce recoverable, unstructured, unavailable, and clipboard-fallback states in the isolated browser fixture when visual verification beyond these bound images is needed; do not substitute older pre-target screenshots.

## Required output and gate

Return `PASS`, `PASS_WITH_FIXES`, or `BLOCK`, followed by P0–P3 findings and the heuristic/Design Quality Model assessment. State exact commands and counts. Mark each prior 390 overflow issue addressed or still present. Do not mark Human approval, release readiness, merge, push, or deployment. Any P0/P1 finding requires correction and affected test/screenshot rerun before the T2 independent gate can pass.

**Current status:** review packet ready; independent final review and verification are pending.
