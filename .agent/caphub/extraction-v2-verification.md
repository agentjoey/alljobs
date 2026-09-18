# Caphub Extraction V2 — verification record

Date: 2026-09-18

Final code candidate: `9f3f1121b53060d63cef80b1bb5125079a0c4161`.

Outcome: **PASS for the recorded local gates and affected fix verification.**
The full gate and post-fix evidence have different source bindings below.
This is not a claim of live V2 compatibility or production acceptance.

## Source-bound gates

| Source | Check | Result |
| --- | --- | --- |
| `039a7266ccddec37f9be06f1c4908878c6c2d9e6` | Exact Task 7 Vitest matrix | 19 files / 169 tests PASS, 5.51s |
| `039a726` | `pnpm typecheck` | PASS |
| `039a726` | `pnpm lint` | 0 errors / 79 existing warnings |
| `039a726` | `pnpm build` | Next.js 16.3.3 webpack build PASS; compile 6.3s |
| `039a726` | `pnpm run verify:deploy` | Deployment configuration invariants PASS |
| `039a726` | Focused browser command below | 1/1 PASS, total 21.2s |
| `fd341fe3bea50967d8329c9e520b54eddeeffde6` | Targeted R1/R2 regression command | 9 PASS / 47 skipped after 9 expected RED failures |
| `fd341fe` | Affected regression matrix | 8 files / 96 tests PASS, 1.99s |
| `fd341fe` | `pnpm typecheck` | PASS |
| `fd341fe` | Focused ESLint command below | PASS, no output |
| `fd341fe` | `git diff --check`; fix-range diff check | PASS |
| `9f3f1121b53060d63cef80b1bb5125079a0c4161` | Task 7 matrix plus strict config regression | 20 files / 221 tests PASS, 6.04s |
| `9f3f112` | `pnpm typecheck` | PASS |
| `9f3f112` | Focused ESLint over changed production surfaces | 0 errors / 1 existing `config.ts` warning |
| `9f3f112` | `pnpm build` | Next.js 16.3.3 webpack build PASS; compile 7.5s |
| `9f3f112` | `pnpm run verify:deploy` | Deployment configuration invariants PASS |
| `9f3f112` | Focused final-build browser scenario | 1/1 PASS, 20.7s |
| `9f3f112` | `git diff --check 9dc596b..9f3f112` | PASS |

Each pre-fix Task 7 gate ran once. The full 19-file matrix, full lint,
production build, deployment verification, and browser scenario were **not
rerun after the R1/R2 fix**. The affected checks and focused independent
re-review are the post-fix evidence; they are not relabeled as a second full
gate. The later final Codex acceptance reran only the coherent affected matrix
and the required final-build boundary. It did not rerun the full repository
suite. Production deployment and live-provider/Capture behavior remain
separate gates.

Environment: Node.js `v24.14.0`, pnpm `10.33.0`, Vitest `4.1.10`.
Committed `package-lock.json` SHA-256:
`370451973082936603d61a445b8a98d69d02902f68e5d6112a27e0bb57ae9b42`.
The [implementation log](extraction-v2-implementation-log.md) records the
approved spec/plan checksums and complete commit chain.

## Exact pre-fix commands

```bash
pnpm exec vitest run \
  lib/caphub/analysis/extraction-v2.test.ts \
  lib/caphub/analysis/schemas.test.ts \
  lib/caphub/analysis/review-packet.test.ts \
  lib/caphub/providers/minimax.test.ts \
  lib/caphub/providers/prompts.test.ts \
  lib/caphub/providers/deepseek.test.ts \
  lib/caphub/providers/deepseek-responses.test.ts \
  lib/caphub/providers/extraction-stage-v2.test.ts \
  lib/caphub/workflow/audit.test.ts \
  lib/caphub/workflow/filesystem.test.ts \
  lib/caphub/workflow/runner.test.ts \
  lib/caphub/service/analyze.test.ts \
  lib/caphub/service/analyze.behavior.test.ts \
  lib/caphub/service/analyze-runtime.test.ts \
  lib/caphub/registry/postgres/caphub-stores.test.ts \
  lib/caphub/registry/postgres/caphub-stores.behavior.test.ts \
  lib/caphub/registry/queries.test.ts \
  lib/caphub/registry/queries.postgres.test.ts \
  components/caphub/reviews/review-center.test.tsx
pnpm typecheck
pnpm lint
pnpm build
pnpm run verify:deploy
pnpm run test:e2e:caphub-review-registry --grep "analysis stops"
```

All returned exit 0. The E2E command deliberately omits the extra `--` in the
original plan so Playwright receives the grep filter and runs one test.
`verify:deploy` reads repository safety invariants; it does not deploy.

The 79 lint warnings span 43 files, none changed by Tasks 1–6. They were not
fixed or hidden. Browser output contained two harmless Node color-environment
warnings (`NO_COLOR` ignored because `FORCE_COLOR` is set). Build and Vitest
emitted no warning. Disposable PostgreSQL/browser runs used scoped escalation
for the previously diagnosed sandbox `initdb`/`shmget` restriction.

## Exact fix verification commands

```bash
pnpm exec vitest run lib/caphub/analysis/extraction-v2.test.ts lib/caphub/providers/minimax.test.ts lib/caphub/providers/extraction-stage-v2.test.ts -t "non-HTTPS|complete V1|composed V1|SDK HTTP"
pnpm exec vitest run lib/caphub/analysis/extraction-v2.test.ts lib/caphub/providers/minimax.test.ts lib/caphub/providers/deepseek.test.ts lib/caphub/providers/deepseek-responses.test.ts lib/caphub/providers/extraction-stage-v2.test.ts lib/caphub/service/analyze.test.ts lib/caphub/service/analyze.behavior.test.ts lib/caphub/service/analyze-runtime.test.ts
pnpm typecheck
pnpm exec eslint lib/caphub/analysis/extraction-v2.ts lib/caphub/analysis/extraction-v2.test.ts lib/caphub/providers/minimax.ts lib/caphub/providers/minimax.test.ts lib/caphub/providers/extraction-stage-v2.test.ts
git diff --check
git diff --check 039a7266ccddec37f9be06f1c4908878c6c2d9e6 fd341fe3bea50967d8329c9e520b54eddeeffde6
```

Before production edits, the first command failed all 9 selected regressions
across 3 files (47 skipped), reproducing the missing HTTPS/final-result guard
and actual SDK 401/402 misclassification. After the fix it passed all 9. The
subsequent full affected command passed 96/96 across 8 files; static checks
returned exit 0. Valid HTTPS extraction and the unchanged critic path remain
covered. See the [review record](extraction-v2-review.md) for exact outcomes.

## Exact final-code acceptance commands

```bash
pnpm exec vitest run lib/planning/config.test.ts \
  lib/caphub/analysis/extraction-v2.test.ts lib/caphub/analysis/schemas.test.ts \
  lib/caphub/analysis/review-packet.test.ts lib/caphub/providers/minimax.test.ts \
  lib/caphub/providers/prompts.test.ts lib/caphub/providers/deepseek.test.ts \
  lib/caphub/providers/deepseek-responses.test.ts \
  lib/caphub/providers/extraction-stage-v2.test.ts lib/caphub/workflow/audit.test.ts \
  lib/caphub/workflow/filesystem.test.ts lib/caphub/workflow/runner.test.ts \
  lib/caphub/service/analyze.test.ts lib/caphub/service/analyze.behavior.test.ts \
  lib/caphub/service/analyze-runtime.test.ts \
  lib/caphub/registry/postgres/caphub-stores.test.ts \
  lib/caphub/registry/postgres/caphub-stores.behavior.test.ts \
  lib/caphub/registry/queries.test.ts lib/caphub/registry/queries.postgres.test.ts \
  components/caphub/reviews/review-center.test.tsx
pnpm typecheck
pnpm exec eslint lib/planning/config.ts lib/planning/config.test.ts \
  lib/caphub/analysis/extraction-v2.ts lib/caphub/providers/minimax.ts \
  lib/caphub/providers/deepseek.ts lib/caphub/providers/extraction-stage-v2.ts \
  lib/caphub/service/analyze.ts lib/caphub/registry/queries.ts \
  app/reviews/page.tsx components/caphub/reviews/review-center.tsx
git diff --check 9dc596be1c6f43563367bdf273b09d3730af0549 \
  9f3f1121b53060d63cef80b1bb5125079a0c4161
pnpm build
pnpm run verify:deploy
pnpm run test:e2e:caphub-review-registry --grep "analysis stops"
```

## Browser and screenshot provenance

Current browser source: `9f3f1121b53060d63cef80b1bb5125079a0c4161`.
Build ID: `3OxkPJBHUSOc0UiA8Vr4u`.
`.next/BUILD_ID` SHA-256:
`c194799830fd095546e7d313e373aef0a6b0236c8aabe655d28c4ac2ab499a67`.

The fixture ran `next start -p 3470 -H 127.0.0.1` with temporary storage,
local-only PostgreSQL, analysis disabled, and HTTPS proxy `127.0.0.1:3471`.
The single scenario verified precise stop metadata and lineage, no mutation
surface/request, no external request, no secret/path/object-key disclosure,
unchanged Registry version count, keyboard Capture navigation, no horizontal
overflow, and zero Axe WCAG 2/2.1 A/AA violations at 1440 and true 390 CSS pixels.

| Screenshot | Dimensions | SHA-256 |
| --- | --- | --- |
| [Desktop](extraction-v2-screenshots/analysis-stops-1440.png) | 1440 × 2050 | `377b4a2cb0fe6c59c140b4e5586c38c559c604bc4ff601a46f71a2bc209c4ef0` |
| [Mobile](extraction-v2-screenshots/analysis-stops-390.png) | 390 × 4078 | `1c271badd96d8bfd4bb2d5727603623ff9781e2d86689deba92c86a17588f691` |

`scripts/shot.mjs` captured the same build's
`http://127.0.0.1:3470/reviews` using CDP width 1440/390, scale 1, mobile 0/1.
Both current-build images were visually inspected. The browser scenario also
verified no mutation or external request, Registry version stability, Capture
keyboard navigation, responsive layout, and zero selected Axe violations.
The first sandboxed attempt was blocked by local PostgreSQL shared-memory
policy; the same command passed outside that sandbox with an owned disposable
cluster and loopback-only servers.

## Evidence limits and operations

The full repository Vitest/E2E suites were not claimed or run as Task 7 gates.
Independent re-review at `fd341fe` passed both findings and reported no new
finding; it reused source-bound tests and ran independent fake-transport probes.

No live provider call, real Capture action, production configuration/service
change, export/target operation, push, merge, tag, or release occurred in this
implementation. No Linear or other external coordination was attempted in
this closeout. The synthetic live V2 probe, final Control Host rebuild/reload,
and one real Capture V2 canary still require distinct authorization.
