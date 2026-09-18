# Caphub Extraction V2 — implementation closeout

Date: 2026-09-18

Status: **Local implementation, review correction, and evidence closeout complete.**
Production and live-provider gates remain separate.

Branch/worktree: `codex/caphub-release` /
`/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/caphub-release`.

Final code: `9f3f1121b53060d63cef80b1bb5125079a0c4161`.
This evidence batch changes documentation only; it does not change that code.

## Approved scope and commit chain

Scheme B and the written contract were approved on 2026-09-18. The binding
documents are:

- [Design](../../docs/superpowers/specs/2026-09-18-caphub-extraction-contract-v2-design.md):
  SHA-256 `0979372cfe43e9816333e8a80e38fada7fca6b83a0ed7d5e8065ebcb8e30902a`.
- [Plan](../../docs/superpowers/plans/2026-09-18-caphub-extraction-contract-v2.md):
  SHA-256 `67ba696941aa15c34fb74a3be7aac4db33fad14204580fafc8703b24fa2e985e`.

| Commit | Delivered scope |
| --- | --- |
| `9dc596be1c6f43563367bdf273b09d3730af0549` | Approved extraction V2 plan and design |
| `49e4a30b796e21d03aacc564d47ee67dac7e9f87` | Strict draft/source-locator contract, bounded limits, deterministic host IDs/composition |
| `86e7ef9f62910bd3a39deef3b1c7191961bd0acb` | Bounded MiniMax visual observation and prompt; existing critic behavior retained |
| `968fa6e8201301085287498dca144e922ffadb43` | DeepSeek native structured extraction draft and fixed request schema name |
| `5a8a88dea7fa113775492ffee5413b3d2912a831` | Atomic two-call extraction, shared budgets/deadlines, redacted operation-aware audits, compatible stores |
| `730e40602884b9d3c3b00bbcd25642945d186c29` | Versioned analysis/runtime integration and immutable lineage through Registry/import/review |
| `039a7266ccddec37f9be06f1c4908878c6c2d9e6` | Read-only Analysis stops, bounded Registry projection, browser and screenshot evidence |
| `fd341fe3bea50967d8329c9e520b54eddeeffde6` | R1/R2 fixes: HTTPS/V1 output validation and real SDK authentication/billing error normalization |
| `2e9433b` | Durable local verification, review, and implementation closeout records |
| `9f3f1121b53060d63cef80b1bb5125079a0c4161` | Accept the two bounded visual-observation limits in strict Control Host configuration |

MiniMax sees normalized images and returns untrusted text held only in memory.
DeepSeek receives that observation and deterministic preprocessing data, never
the original image. The host validates locators and the final existing V1
`ExtractionResult`, and owns IDs, artifact links, contract versions, and job
lineage. Extraction makes at most one call per provider, with no retry,
schema correction, tools, or provider-triggered side effects.

Terminal V1 jobs remain immutable. Any later authorized V2 analysis is a
distinct versioned job with explicit predecessor lineage. The Review Center
adds only a read-only stop panel and Capture navigation.

## Implementation rulings

- One final coherent-changeset independent review replaced repeated per-task
  reviews, as required by the approved plan.
- A rejected DeepSeek draft may lack token/output metadata because local Zod
  parsing failed before the adapter exposed it. Only available bounded
  validation paths are retained; missing counts/digests are not fabricated.
- Task 5 included direct Registry import/review lineage consumers and existing
  pilot fixtures/specs so strict observer/structurer roles and immutable V2
  lineage remain valid across downstream boundaries.
- The focused browser command is
  `pnpm run test:e2e:caphub-review-registry --grep "analysis stops"`.
  The plan's extra `--` ran the full file during Task 6; that six-test run is
  not represented as focused evidence. The corrected Task 7 command ran 1/1.
- No deployment-verifier script change was required.

## Verification and review closure

The [verification record](extraction-v2-verification.md) distinguishes source
bindings. At `039a726`, the exact Task 7 matrix passed 19 files / 169 tests;
typecheck, webpack build, deployment invariants, and focused browser 1/1 passed.
Lint had 0 errors / 79 existing warnings.

The [final scoped review](extraction-v2-review.md) initially found 0 Blocker,
2 Important, and 0 Optional issues: a V2/V1 repository URL mismatch plus a
missing final output guard (R1), and lost MiniMax SDK 401/402 classifications
(R2). Both were corrected in `fd341fe`. Nine targeted regressions were observed
RED then GREEN; the affected suite passed 8 files / 96 tests, with typecheck,
focused ESLint, and diff checks passing. Focused independent re-review passed
with R1/R2 addressed and no new finding.

During final Codex acceptance at `9f3f112`, the exact affected Task 7 matrix
plus the configuration regression passed as 20 files / 221 tests. Typecheck,
focused ESLint, production webpack build, deployment invariants, and the
single final-build Analysis-stops browser scenario also passed. Fresh 1440px
and true 390px screenshots were visually inspected and rebound to the final
code. The acceptance found no code Blocker or Important issue; the stale
source binding in these evidence records was the only required correction.

## Preserved boundaries and handoff

No real provider call, real Capture read/reanalysis, production configuration
or service change, export/target operation, push, merge, tag, or release occurred
in this extraction V2 implementation. Test activity used fake HTTPS responses,
owned temporary filesystem/PostgreSQL stores, and loopback fixture servers.
Earlier separately authorized production/provider events in `CURRENT.md` are
historical context, not actions performed by this implementation.

Remaining explicit gates, in order:

1. **Synthetic live V2 probe:** separate authorization for one fixture image
   through the exact MiniMax-observation → DeepSeek-schema path; retain only
   redacted audit metadata.
2. **Control Host rebuild/reload:** separate production authorization; build
   and bind the final code candidate, preserve loopback `127.0.0.1:3456`, and
   keep exports/targets disabled.
3. **Real Capture V2 canary:** separate Capture authorization for one distinct
   V2 job linked to the immutable V1 terminal job; verify Registry/Object
   Storage, extraction, ReviewPacket, Review Center, and audit evidence.
4. Push, merge, tag, and release remain separate Human decisions.

Local closeout is complete. **Linear and all other external coordination were
intentionally not performed in this execution**, per the closeout instruction.
No external update attempt, failure, or completion is claimed.
