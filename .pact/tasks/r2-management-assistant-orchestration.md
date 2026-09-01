# R2 Management Assistant — Task 5: bounded orchestration and response route

Implement only Task 5 of `docs/superpowers/plans/2026-08-31-alljobs-r2-planning-management-assistant.md`.
Task 1's strict current request contract and Task 4's Human Owner-accepted MiniMax Token Plan
adapter supersede the plan's obsolete provider and `history` examples.

Required files: `lib/assistant/service.ts`, `lib/assistant/service.test.ts`,
`lib/assistant/stream.ts`, `lib/assistant/stream.test.ts`,
`app/api/assistant/respond/route.ts`, `app/api/assistant/respond/route.test.ts`, and the
minimal metadata-only extension to `lib/planning/native/activity.ts`.

The route accepts only bounded same-origin JSON for the strict `AssistantRequestIntent` schema;
it must never accept browser-supplied workspace roots, paths, source text, model selection,
prompt policy, tool definitions, credentials, budgets, or conversation history. It produces only
strict NDJSON events with `no-store` and `nosniff` headers. It propagates cancellation, performs
no automatic retry, exposes no internal paths/errors, and performs no planning, task, backlog,
Git, filesystem, shell, queue, agent, or activity mutation other than recording one
metadata-only `ASSISTANT_RUN` record after each terminal state.

The service rebuilds the context before the provider call and compares the expected digest; a
mismatch must not call the model. It validates citations against current manifest sources,
rebuilds the manifest after generation, marks changed output stale and non-actionable, creates
digest-only source-access gates, and handles approval/denial as the existing gate contract
requires. Use the official Token Plan adapter (`MiniMax-M3`, server-only key), never restore the
obsolete Vercel provider or history contract.

Use RED → GREEN lifecycle, NDJSON codec, and real `Request`/`Response` tests. Run only the three
Task 5 focused test files, typecheck, and a diff check. Record exact evidence in the R2 handoff,
checkpoint `r2-orchestration`, then stop for independent review; do not start Task 6.
