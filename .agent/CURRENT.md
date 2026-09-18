# Current Status — alljobs

Version:        v1.0.0 (Planning Core V1 live and healthy)
Phase:          Planning Core V1 — Live Production
Phase Status:   Tasks 0 through 14 COMPLETE; Live on Control Host (127.0.0.1:3456) & Cloudflare Tunnel
Last Updated:   2026-09-18 by Codex during Caphub Analysis Contract V3 rollout

## Current decision

The previously developed AllJobs product was retired and replaced with the federated Planning Core V1 greenfield build. All legacy routes, UI directions, and sample data were removed.

Linear now owns Backlog management. AllJobs retains repository Backlog only as read-only planning evidence and has no Backlog management, proposal, conversion, repair, or handoff path.

The legacy release remains recoverable only through Git history and `archive/v0.1.0-retired`.

## Preserved production assets

- Cloudflare Tunnel identity and credentials;
- `alljobs.agentjoey.ai` DNS route;
- Cloudflare Access application and allow policy;
- current development machine as the single Control Host;
- `127.0.0.1:3456` as the mandatory loopback-only origin boundary.

## Canonical planning documents

- Architecture baseline: `docs/superpowers/specs/2026-08-26-alljobs-federated-planning-core-design.md`
- T3 implementation spec / Brief revision 1: `.agent/frontend-design/planning-core-v1/brief.md`
- Development plan: `docs/superpowers/plans/2026-08-26-alljobs-federated-planning-core-rebuild.md`
- Mockup brief revision 3: `.agent/frontend-design/planning-core-v1/mockup-brief.md`
- Mockup review & evidence: `.agent/frontend-design/planning-core-v1/mockup-review.md`
- Verification record: `.agent/frontend-design/planning-core-v1/verification.md`
- Independent review packet: `.agent/frontend-design/planning-core-v1/review-packet.md`

## Live Services on Control Host

- **App Listener (`com.agentjoey.alljobs`)**: Running on `127.0.0.1:3456`
- **Refresh Worker (`com.agentjoey.alljobs-refresh`)**: Running bare mirror sync every 300s
- **Cloudflare Tunnel (`com.agentjoey.cloudflared`)**: Forwarding `alljobs.agentjoey.ai` → `http://localhost:3456` with Access OTP auth
- **Verification Evidence**: 68 Vitest files / 744 tests passing, 27 Playwright E2E tests passing with 1 conditional evidence capture skipped, Next.js 16.3 Turbopack production build verified, deployment safety invariants verified, loopback smoke 200, and Cloudflare Access entry 302.

## Completed Tasks Summary

- **Task 0 & 0A (Cleanup & Gate)**: 147 legacy files removed, rollback tag anchored, Brief revision 1 approved.
- **Task 1 (Mockup Gate)**: Paper Workbench revision 3 (pleurat aesthetic, amber status bar, Backlog drawers, vertical Roadmap timeline, Personal Workbench dashboard) APPROVED by Human Owner.
- **Task 2 (Clean Foundation)**: Next.js minimal semantic shell (`app/layout.tsx`, `app/page.tsx`, `app/globals.css`), documentation rebuild, smoke tests passing.
- **Task 3 (Canonical Domain & Relations)**: `lib/planning/domain/schemas.ts`, `relations.ts`, `errors.ts`, ProofIssue isolation, cycle detection.
- **Task 4 (Pure Markdown Parsers)**: `lib/planning/markdown/section-document.ts`, `roadmap.ts`, `backlog.ts`, `tasks.ts`, `render.ts`, test fixtures.
- **Task 5 (Atomic Native Storage)**: `lib/planning/native/store.ts`, `lock.ts`, `digest.ts`, `activity.ts`, `paths.ts`, `STALE_WRITE` protection.
- **Task 6 (Control Host Config & Git Refresh)**: `lib/planning/config.ts`, `providers/git-runner.ts`, `providers/git-markdown.ts`, `providers/refresh.ts`, `scripts/planning-refresh.ts`.
- **Task 7 (Registration, Archive, Restore Lifecycle)**: `lib/planning/registry/inspect.ts`, `apply.ts`, `archive.ts`, `restore.ts`, `proposal.ts`.
- **Task 8 (Projections & Typed Server Actions)**: `lib/planning/queries/portfolio.ts`, `project.ts`, `tasks.ts`, `attention.ts`, `app/actions/projects.ts`, `native-planning.ts`, `refresh.ts`.
- **Task 9 (Agent Skill)**: `skills/alljobs-planning/SKILL.md`, references, examples, and `planning:skill:validate`.
- **Task 10 (Shell & Overview)**: AppShell, Universal Search (`⌘K`), SourceStatus amber strip, Portfolio Personal Workbench, Project Card Grid.
- **Task 11 (Historical V1 Detail & Journeys)**: Vertical Roadmap timeline, former Backlog drawers retired by P0, Universal Task Ledger, Native Task Form, 2-phase Registration & Restore flows.
- **Task 12 (E2E & Accessibility)**: Playwright E2E suites, Axe WCAG AA audits, Verification Record, Review Packet.
- **Task 13 (Deployment & Operations)**: LaunchAgents (`alljobs`, `alljobs-refresh`), deployment invariant verifier, operational recovery documentation.
- **Task 14 (Release & Cutover)**: Merged to `main`, launchd services active, live domain verified.

## Caphub P4 (implementation accepted locally)

- **Branch / worktree:** `codex/caphub-p4-implementation` · `.worktrees/caphub-p4-implementation`
- **Scope:** Capability Package contracts, deterministic renderers, Obsidian projection with byte-preserved human regions, Codex/Claude/Hermes preview adapters, exact Deployment plans, fixture publish/rollback, disabled-by-default export runtime, safe CLIs, read-only P4 UI.
- **Status:** Codex final acceptance fixes complete through `d595e64`: approved-manifest binding survives joint operation+marker forgery, exact Release/plan/Deployment authority is checked before the lease and again under lock on normal and realized-recovery paths, root/sentinel state is freshly validated, rollback bytes are verified, and marker-less unsafe directories fail closed. Final gate: 152 files / 1373 tests PASS; typecheck PASS; lint 0 errors / 79 warnings; warning-free production build; deploy invariants PASS; P4 E2E 11/11. Scoped final Review PASS after 1 Critical/3 Important fixes; the verifier's additional realized-recovery TOCTOU finding is fixed; independent re-verification PASS bound to evidence SHA `20e2a71`.
- **Boundary:** no real Vault/Agent root, production database, provider call, push, merge, deploy, or release occurred. Gates P4-A/P4-B/P4-C remain open Human gates; local implementation acceptance does not authorize them.
- **Evidence:** `.agent/caphub/p4-implementation-log.md` · `p4-threat-model.md` · `p4-verification.md` · `p4-screenshots/`

## Next safe action

Caphub V3 autonomous web research was deployed and its single authorized
canary ran for `cap_379e2508ead34c349fcb303bcd39eff2`. Extraction and the
single MiniMax web search succeeded, but DeepSeek research returned
schema-invalid drafts twice. Immutable job
`job_4782630f05b514c1d795849da23cd508` stopped closed at research as
`HUMAN_REVIEW_REQUIRED`; no ReviewPacket or Review Request was created.

The minimal corrective Analysis Contract V4 is implemented locally through
commit `866e6d4`. Providers now generate model-owned drafts and the host composes
authoritative IDs, evidence, lineage, and timestamps. A correction can
regenerate from the original stage input without retaining the rejected output.
V4 creates a new deterministic job and supersedes V3.

V4 verification passed 20 focused files / 135 tests, typecheck, focused ESLint,
deployment invariants, and webpack build. Build ID is
`fx9z2aq8zWKkWF5IIXKfM`, SHA-256
`37a66478c3ef171e34196158c28f96905d828876db40bb294a1cf92ef8e35689`.

V4 is now live on the Control Host. The single authorized canary created job
`job_5b7b22850262f5e31d17755f54af639d`, six stage artifacts, ReviewPacket
`rvp_915a132845c495dd5c2a20d14f70cb5b`, and Review Request
`rev_5c95aa800c6562f7c6b14fb71dbb1454`. Both job and request are
`WAITING_FOR_REVIEW`; all six provider operations succeeded without correction
or failure.

The final Review Center SSR check exposed and repaired one read compatibility
bug: its analysis-stop DTO still accepted only V1/V2 labels and rejected
existing V3/V4 records. Commit `9b56961` adds V3/V4 coverage. Focused unit and
PostgreSQL tests, typecheck, ESLint, deployment invariants, and the production
build passed. The reloaded final build is `4t9_GarllIl8ZFU7fIHuN` (BUILD_ID
SHA-256 `5d3e58e71a95a7e4fe8176837d37c7d1d341a5b917a1c0673c7db55d5a52e2e6`).
Review Center now renders the V4 request, candidate, and waiting state; Capture
detail renders the V4 job and request. No second analysis or provider request
was performed.

The next safe product action is Human review of that candidate in Review
Center. Exports and targets remain disabled. Approval, export, publication,
installation, push, merge, tag, and release remain separate actions and were
not performed.

## Caphub Extraction V2 — local closeout (2026-09-18)

- MiniMax returns one bounded, memory-only visual observation; DeepSeek native
  JSON Schema produces the V2 draft; the host owns IDs, linkage, and final V1
  result validation. The atomic extraction stage has no retry or correction.
- Versioned jobs preserve terminal V1 data and downstream lineage. Review
  Center shows bounded read-only Analysis stops with Capture navigation.
- Pre-fix Task 7 gate at `039a726`: 19 files / 169 tests, typecheck, webpack
  build, deployment invariants, and focused E2E 1/1 PASS; lint had 0 errors and
  79 existing warnings. Final-build screenshots cover 1440 and true 390 widths.
- Fix `fd341fe`: HTTPS-only repository validation and complete V1 composition
  validation; real MiniMax SDK 401/402 normalization to authentication/billing
  stops. Nine regressions failed before the fix and passed after it; the
  affected suite passed 8 files / 96 tests. Focused re-review: PASS, no remaining
  finding. Live V2 provider/Capture success remains unverified.

## Caphub development status — 2026-09-16

- P1 Foundation is accepted; P2 fixture analysis is complete while live Kimi structured output remains unproven.
- P3 Review Center and PostgreSQL Registry implementation/fixture verification passed independent Review and Verification with zero blocker/high/medium findings, was merged to `main`, and was deployed at `bac60042064e258072f025d42ce2d6633ba21a43` with production Registry and Analysis disabled.
- Human separately authorized a Capture-only production trial. Capture is enabled on the Control Host; Analysis and Registry remain disabled, and the enablement verification did not create a Capture.
- Gate P3-D remains a hard stop for production PostgreSQL selection, credentials, backup/PITR, migration, or Registry/Analysis enablement.
- P4 design, plan, local implementation, Codex acceptance, scoped Review, and independent Verification are complete on `codex/caphub-p4-implementation`; integration remains a separate Human decision.
- No real Vault/Agent root, dry run, publish, rollback, push, merge, deployment, or P4-A/P4-B/P4-C approval has occurred.

## Caphub P1–P4 Production activation planning — 2026-09-17

- Human approved scheme A: dedicated local PostgreSQL 17 for the initial pilot,
  standard PostgreSQL contracts only, and a Neon review before P6 or earlier if
  RPO/PITR/multi-host/operations triggers occur.
- Canonical activation spec:
  `docs/superpowers/specs/2026-09-17-caphub-production-activation-design.md`.
- Canonical activation plan:
  `docs/superpowers/plans/2026-09-17-caphub-production-activation.md`.
- Initial product goal is third-party capability recognition and management:
  Capture, operator-started analysis, Registry/Review, exact Candidate/Release
  decisions, and read-only neutral/adapter previews.
- P5 self-development and P6 automation are deferred. Real export targets,
  publish/install/rollback, and every P4-A/P4-B/P4-C gate remain untouched.
- Activation Tasks 0–8 are implemented and accepted on the isolated branch,
  including the fixture-only P1–P4 pilot, final-build screenshots,
  metadata-only preflight, threat model, and operator runbook. PA-A Review and
  Verification PASS; the next hard stop is PA-B plus the explicit S1
  listener-stop action.
- No real database/bootstrap/migration/import/backup, LaunchAgent, config/secret
  change, provider call, service reload, push, merge, deploy, or release has
  occurred from this implementation branch.

## Caphub P1–P4 Production activation — PA-D complete

- Neon Registry and private Object Storage activation N1–N4 completed with a
  recovery-branch proof. The managed-TLS privilege boundary is explicitly
  `neon_project_admin_accepted`; it is not represented as PostgreSQL least
  privilege.
- Accepted candidate `d7081a5` was fast-forwarded only into the dedicated
  deployment worktree and rebuilt from the committed lockfile. Full phase gate:
  172 files / 1459 tests PASS; final webpack build, TypeScript, and deployment
  invariants PASS.
- `com.agentjoey.alljobs` is running locally on `127.0.0.1:3456`; host-level
  `GET /caphub` returned 200. Evidence: `.agent/caphub/production-activation-log.md`
  and `.agent/caphub/production-activation-screenshots/caphub-production-1440.png`.
- PA-C is still a separate Human gate. No real provider request, Capture input,
  analysis, target/export operation, Git push, PR, `main` merge, tag, or public
  release occurred in PA-D.

## Caphub PA-C intermediate failures (historical)

These bounded probes used a 32-token synthetic cap and are superseded by the
successful 1024-token contract diagnosis below.

- The Human authorized one Kimi `k3-256k` synthetic structured-output canary.
  The only real request did not produce a schema-valid result; it was not
  retried and no raw provider output was retained.
- Caphub automatically returned to S3. The service is healthy and loopback
  only; Registry remains enabled, while analysis and all export/target gates
  are disabled. MiniMax stays configured but has made no real request.
- A newly authorized single Kimi retry after the Human restored account capacity
  also did not return a schema-valid result. No further Provider request is
  authorized; the failure cannot be attributed from the redacted canary record.
- A separately authorized MiniMax `MiniMax-M3` synthetic smoke passed with no
  retry. It validates only MiniMax; Kimi remains the analysis blocker and the
  runtime stays in S3.

## Caphub PA-C contract diagnosis passed

- A one-request Kimi `k3-256k` diagnostic using the application’s strict
  `json_schema` protocol passed. The prior 32-token synthetic cap was too low
  for a response that includes reasoning plus final JSON; the bounded 1024-token
  diagnostic completed with 52 output tokens.
- Analysis is enabled and the Control Host service remains healthy/loopback
  only. No Capture has been analyzed automatically, and Registry review,
  export, target, publication, and release boundaries remain unchanged.

## P0 Backlog retirement (live)

- **Branch / worktree:** `codex/p0-backlog-retirement` · `.worktrees/p0-backlog-retirement`
- **Status:** R1 Backlog management is retired on `main` and live on the Control Host. Human Gates P0-A, P0-B, and P0-C are complete.
- **Current boundary:** Linear owns Backlog management. AllJobs may ingest repository Backlog only as read-only transition evidence for document health, provenance, diagnostics, counts, search, citations, assistant context, and Task references.
- **Retired surfaces:** no Backlog tab, ordering editor, proposal/apply path, conversion command, assistant Backlog candidate, repository-agent Backlog handoff, or R1 runner remains.
- **Historical evidence:** former R1 design, implementation, and frontend records remain in Git as retired evidence; they are not current instructions or release candidates.
- **Release boundary:** the app service was rebuilt and restarted without changing the refresh worker, Tunnel, Cloudflare Access, domain, or mandatory loopback binding. No external project-owned Backlog was mutated.

## Release history

| Version | Date | Status | Summary |
|---|---|---|---|
| v0.1.0 | 2026-08-12 | Retired and offline | Legacy multi-project activity ledger; removed from the current tree and retained only by Git history plus `archive/v0.1.0-retired` |
| v1.0.0 | 2026-08-28 | Live in Production | Greenfield rebuild of AllJobs Federated Planning Core with Paper Workbench UI, zero DB, safe Git bare mirrors, and digest protection |
| P0 retirement | 2026-09-14 | Live in Production | Removed R1 Backlog management and proposal paths; retained repository Backlog solely as read-only evidence under Linear ownership |

## DeepSeek provider replacement — local implementation verified (2026-09-18)

- The approved provider-replacement design and plan are implemented locally on
  `codex/caphub-release` in commits `f6d75b1`, `5e36c49`, and `71e6f1a`.
  Research and assessment now use the fixed first-party DeepSeek Responses
  endpoint `https://api.deepseek.com/responses` and API model
  `deepseek-flash`; MiniMax remains fixed for extraction and critic.
- The adapter uses one non-streaming, tool-free request with
  `text.format.json_schema` and `reasoning.effort: "none"`. It does not persist
  prompts, provider output, reasoning, headers, or credentials. Historic Kimi
  records remain parseable, but active runtime/configuration and preflight no
  longer route to Kimi.
- Local verification passed: 14 affected Vitest files / 136 tests, typecheck,
  lint with 0 errors (79 existing warnings), and webpack production build. The
  final scoped review found no blocking or important issue: fixed origin/model,
  error mapping, no tools/retries, stage assignment, audit compatibility, and
  historical decoding were checked.
- At the end of local implementation, no `DEEPSEEK_API_KEY` had been added and
  no DeepSeek request had been issued. The subsequent separately authorized
  diagnostic is recorded below; no LaunchAgent reload, deployed configuration,
  service, Capture, target/export, push, merge, or release changed.

## DeepSeek no-Capture contract diagnosis — passed (2026-09-18)

- With explicit authorization, one synthetic DeepSeek Responses API request
  used the fixed `deepseek-flash` model, no tools, non-streaming JSON schema,
  and a 30-second deadline. It completed with a schema-valid result using 95
  input tokens and 5 output tokens.
- No credential, prompt, response body, or reasoning content was retained.
  No Capture was read or created, and no service reload, deployed config
  change, export/target operation, push, merge, or release occurred.
- The required live provider compatibility gate is now evidenced. A separate
  rebuild/reload authorization is still required; it must retain analysis
  disabled until a new, separately authorized Capture action.

## DeepSeek production cutover — reload verified (2026-09-18)

- Under explicit authorization, the Control Host config was changed only to
  disable analysis. Parsed runtime settings use the fixed DeepSeek endpoint,
  `deepseek-flash` model, and `DEEPSEEK_API_KEY` reference; Registry remains
  enabled and exports remain disabled.
- The exact release worktree was rebuilt with webpack, deployment invariants
  passed, and `com.agentjoey.alljobs` was reloaded. launchd reports `running`,
  and loopback `GET /caphub` succeeded on `127.0.0.1:3456`.
- No Capture, provider request, Registry write, export/target operation, push,
  merge, tag, or public release occurred during cutover. Analysis stays
  disabled pending a new specific Capture authorization.

## MiniMax interrupted-call diagnosis — inconclusive, no retry (2026-09-18)

- Read-only Registry evidence for `job_d21922e7bb363b4734573206709e70ab`
  confirms that preprocessing completed, extraction recorded one MiniMax
  `started` audit event, and no terminal model audit event was persisted. The
  runner therefore correctly sealed the job as `HUMAN_REVIEW_REQUIRED` at
  extraction with reason `INTERRUPTED_PROVIDER_CALL`.
- The relevant application logs contain no job/capture/provider failure entry,
  and the matching launchd time window contains no alljobs lifecycle event.
  These facts do not support attributing the interruption to MiniMax,
  credentials, or the DeepSeek cutover; the actual cause is unavailable.
- The terminal job was not retried and no provider request or Capture action
  was performed during diagnosis. A separately authorized no-Capture MiniMax
  synthetic diagnostic is required before considering a new Capture analysis.

## MiniMax no-Capture compatibility diagnostic — passed (2026-09-18)

- With explicit authorization, one synthetic text-only request used the active
  Caphub MiniMax standard provider path: `MiniMax-M3`, no tools, no retry, a
  30-second deadline, and a strict JSON response contract. It completed with
  a schema-valid result using 187 input tokens and 6 output tokens.
- No Capture was read or created, no job was retried, and no prompt, provider
  response, credential, or reasoning content was retained. No service or
  configuration change, Registry write, export/target action, push, merge,
  tag, or release occurred.
- This establishes current text provider/transport compatibility only. It does
  not reconstruct the missing terminal audit for the prior image-extraction
  job and does not by itself validate an image-specific extraction request.

## LaunchAgent persistence repair — runtime ready (2026-09-18)

- The private `com.agentjoey.alljobs` file had become an invalid 45-byte JSON
  argument array while launchd retained a cached, running definition. Under
  explicit authorization it was atomically rebuilt as a valid mode-`0600` XML
  LaunchAgent, preserving the active service's verified program, working
  directory, logs, lifecycle flags, and non-empty Registry/Object Storage/
  MiniMax environment values. The service was not reloaded during repair.
- The Human Owner supplied a replacement `DEEPSEEK_API_KEY`; all eight required
  private environment values are now non-empty. The documented `launchctl load`
  path reloaded the repaired service after the lower-level bootstrap path
  returned an I/O error. Loopback `/caphub` is 200, the running service has the
  DeepSeek key, and the no-Capture runtime composition check passed with one
  read-only Registry query and zero provider/Capture operations.
- A preflight bug incorrectly required Registry to exactly equal the older
  filesystem rollback source. It now verifies that every rollback-source
  Capture matches Registry while allowing later Registry-only Captures. The
  live preflight reports PostgreSQL ready, source Capture consistency, remote
  object-transfer and recovery evidence, both provider keys present, and no
  export target enabled. A new real Capture analysis remains a separately
  authorized, operator-started action.
