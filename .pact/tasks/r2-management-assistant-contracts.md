# R2 Management Assistant — Task 1: contracts, limits, and digests

## Authority and gate

The Human Owner approved the rendered Mockup revision 2 by directing the R2 work to
continue on 2026-09-01. This task is the next approved plan unit only. Read first:

- `.agent/frontend-design/r2-management-assistant/brief.md` (revision 17 + mockup revision 2)
- `docs/superpowers/specs/2026-08-30-alljobs-r2-planning-management-assistant-design.md`
- `docs/superpowers/plans/2026-08-31-alljobs-r2-planning-management-assistant.md` (Task 1)
- `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, and the relevant installed Next.js 16 docs before code

Start Card (persist in the handoff): workflow 3.3; Task 1; worker role; Tier T3
(core model-backed Project Detail journey); canonical record above; branch
`codex/r2-management-assistant`; rendered Mockup Gate approved for revision 2; independent
reviewer `claude`; final human/release checkpoints remain pending.

## Scope

Implement **only Task 1** from the canonical plan, using RED -> GREEN:

1. Add strict, additive Project assistant configuration (`context_paths`, at most 8,
   repository-relative) and strict Control Host assistant config (enabled; only provider
   `minimax`; only model `MiniMax-M3`; fixed Standard/Deep limits; no API-key field).
2. Add the assistant limits, strict schema graph, answer primitives, metadata-only run
   record, discriminated request/outcome/stream contracts, and deterministic SHA-256
   `assistantDigest()` canonicalizer exactly as planned.
3. Add focused tests for strict rejection, bounds/enumerations, unknown keys, digest key
   ordering and array-order preservation. Tests must prove that questions, answers,
   reasoning, fragments, drafts, proposal bodies, and credentials cannot enter an
   `AssistantRunRecord`.
4. Update the example config with `assistant.enabled: false` and no credential.

## Mandatory boundaries

- Project Detail only; no Console/R5, R3 queue, R6, direct writes, task creation, Git/shell
  execution, persistent conversation/memory, provider fallback, or autonomous run.
- Do **not** install dependencies, invoke a provider, add credentials, API routes, UI,
  source access, manifests, activity logging, drafts/proposals behavior, or any Task 2+
  work.
- Preserve the accepted mockup artifacts and all unrelated human changes. Do not modify
  `.pact/PROJECT.md`, other task specs, or the canonical plan/Brief except for a factual
  handoff/update required by this task.

## Verification and delivery

Run only the Task 1 focused tests named in the plan, plus typecheck and a whitespace diff
check. Do not run unrelated full suites. Record actual RED and GREEN evidence, exact commit,
scope audit, and any warning/failure in
`.agent/frontend-design/r2-management-assistant/handoff.md`. Commit the implementation and
call `pactify checkpoint r2-contracts --evidence "..."`; then stop for independent review.
