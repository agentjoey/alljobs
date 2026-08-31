# R2 Management Assistant — Task 2: attributable context and receipts

## Authority

Implement only canonical plan Task 2. Read the Task 1 handoff and all of:

- `.agent/frontend-design/r2-management-assistant/brief.md` (revision 17 + approved mockup revision 2)
- `docs/superpowers/specs/2026-08-30-alljobs-r2-planning-management-assistant-design.md`
- `docs/superpowers/plans/2026-08-31-alljobs-r2-planning-management-assistant.md` (Task 2)
- `AGENTS.md`, existing planning resolver/providers/query contracts, and relevant Next.js 16 docs

## Required scope

Use RED -> GREEN to implement `assembleAssistantContext()` and `prepareAssistantEntry()` as
the plan specifies. Add deterministic attributable context fragments/manifest/digest and a
browser-safe receipt that never includes fragment content. Cover real temporary local
sources, local dirty precedence, optional allowlist, traversal/absolute/symlink rejection,
read-only remote/cache labels, nullable unavailable raw ranges, deterministic/digest-change
behavior, and explicit `CONTEXT_LIMIT` failure without silent omission.

Expose only `{ enabled, code/message }` or receipt + manifest digest at the Project page.
No source fragments, authoritative paths, raw source content, model configuration, budgets,
or permissions may reach browser props. If the current `ProjectDetail` prop type needs a
minimal additive, non-rendering typed field solely to receive that server-safe entry state,
that exact type-only bridge is permitted and must be covered by focused tests; do not start
the assistant UI/panel (Task 6) or make a visual/interaction change.

## Mandatory boundaries

- Keep Task 1's fresh bounded-run request contract: do not add conversation history or
  `sessionStorage` behavior.
- No provider/model dependency, credential, API route, model invocation, source-gate/tool,
  activity logging, Task/Backlog action, direct write, Git/shell execution, queue/R3,
  Console/R5, or R6 work.
- Use existing resolver authority; local invalid source must fail closed and must not fall
  back to cache. Never invent source ranges or include all `docs/` recursively.
- Preserve Task 0/Task 1 evidence and unrelated human work. Do not alter other Pact task
  specs, the canonical plan, or the Brief except a factual handoff record.

## Verification and delivery

Run only the Task 2 focused tests (`lib/assistant/context.test.ts` and
`lib/planning/queries/project.test.ts`), `npm run typecheck`, and a whitespace diff check.
Record actual RED/GREEN output, target commit, allowed scope, and any plan-file bridge in
`.agent/frontend-design/r2-management-assistant/handoff.md`. Commit implementation, call
`pactify checkpoint r2-context --evidence "..."`, then stop for independent review.
