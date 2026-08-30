# R1 Backlog Control — Task 0 Handoff Record

**Task / Brief / revision:** R1 Task 0 · `brief.md` revision 3  
**Agent role / harness:** Primary Agent / Codex  
**Branch / worktree · base commit / current commit:** `codex/r1-backlog-control` · `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r1-backlog-control` · `5466c338e5b74c7f672d7b6a710d4b7f8f74b665` / `d3da9da2e8872ae0222319b68b694168093a5c26`.

## Scope completed in this handoff

- T3 Brief, state matrix, standalone interactive Paper Workbench mockup, screenshot evidence, mockup self-review, and independent-review packet only.
- No production component, Server Action, parser, mutation boundary, source provider, deployment configuration, service, port, Tunnel, Access setting, or pilot repository is changed.

## Decisions and constraints

- `docs/BACKLOG.md` remains the sole code-project truth; direct R1 write scope is future-only and limited to existing `priority` and `rank` values.
- Local working tree is preferred; a present invalid local source never falls back invisibly to remote/cache.
- The mockup uses synthetic content (36 Backlog items) and never writes or calls an API.
- Paper Workbench is the current authority. No Star Atlas / celestial direction is allowed.
- Revision 3 follows the current Planning Core header/layout and expresses Backlog as a single-column card stream; it also completes the state matrix, priority-only controls, mobile review cards, stale intent, and handoff Notes evidence.
- Drag is optional desktop assistance; keyboard and mobile retain Move Up, Move Down, and Change Priority controls.

## Evidence and checks

- Brief: `brief.md`
- Mockup source: `mockup/index.html`, `mockup/styles.css`, `mockup/app.js`
- Render evidence: `mockup-screens/` (1440, 900, and true 390px CDP captures)
- Review record: `mockup-review.md`
- Independent-review launch packet: `review-packet.md`

## Known gate / open questions

- Two independent reviews ran and returned the findings recorded in `mockup-review.md`; each finding is fixed in revision 3.
- Human Owner explicitly authorized the repaired revision and entry to Task 1 on 2026-08-29, and expressly requested no repeated review.
- Per Human Owner direction, this R1 task does not use Pact or modify Pact state.
- The current commit is an unintended one-file `pact: ledger sync` (`.pact/log.jsonl`) created by the earlier Pact command before that direction. It is the only commit after the requested base; the mockup files remain uncommitted. No reset, branch rewrite, or recovery action has been taken pending Human Owner direction.

## Next safe action

Execute only approved Task 1 using tests first. Do not push, merge, deploy, or enter Task 2 without further Human Owner direction.

## Task 5 server-action boundary

- Next.js Server Actions are directly reachable POST endpoints. The R1 ordering actions therefore accept only the validated Task 1 intent union and a digest-bound proposal; they do not accept a client file path, Markdown source, or arbitrary field patch.

## Task 6 UI continuation note

- The approved Paper Workbench Backlog surface is now a Phase → Priority → Rank single-column card stream. History is folded; local, invalid local, remote, and cached source states stay textual and explicit.
- Ordering remains a page-local intent until the owner selects Review changes. Keyboard and narrow layouts retain Move Up, Move Down, and Change Priority; native drag is desktop-only progressive enhancement.
- The review panel exposes only affected priority/rank values, local modified/clean state, HEAD, and shortened complete-file/proposal digests. Applying disables duplicate submission; success refreshes the route; stale and unexpected action failures retain a recoverable error state without exposing internals.
- Task 6 evidence: focused component tests, typecheck, lint (existing warnings only), webpack production build, and final loopback screenshots at 1440 and true CDP-emulated 390px. The current local sample has no Backlog rows, so rich-card and review journeys are covered by rendered component interaction tests; no project data was changed to fabricate a visual state.

## Next safe action

Execute only approved Task 7 after Human Owner authorization. Do not push, merge, deploy, or select a real write-back pilot.

## Task 7 repository-agent handoff continuation

**Workflow / task / role:** 3.3 · R1 Task 7 — non-persistent repository-agent Backlog proposal · Primary Agent
**Tier / reason:** T3 continuation — an approved core Backlog journey gains a new-item, copy-only interaction; it has no persistence or write authority.
**Branch / worktree / base:** `codex/r1-backlog-control` · `.worktrees/r1-backlog-control` · `015919a50cd938a28c16c018ea46fe5cc390ad8a`.

- `BacklogProposalForm` collects required request facts, keeps optional planning hints explicit, and produces only Markdown text. It shows `detail.backlogControl.source` HEAD/digest facts when they are available and provides keyboard-accessible validation, a readonly output field, and copy feedback.
- `buildRepoAgentBacklogProposal()` instructs the repository agent to inspect the current repository, choose a stable ID, verify Phase/dependencies/priority/Done When, edit `docs/BACKLOG.md`, validate it, and report the diff and commit. It explicitly says that AllJobs did not edit the repository, start an agent, or run Git.
- Task 6 ordering controls remain unchanged. The new handoff section is composed beneath the existing Backlog view; no save action, repository mutation, AllJobs-native write, AI call, Git operation, or agent start was added.
- Focused handoff/form tests, skill validation, typecheck, lint, `git diff --check`, Webpack production build, and the Impeccable detector were run. The normal Turbopack build was blocked by the managed environment's port-binding restriction; Webpack completed successfully. Existing lint warnings remain outside Task 7.
- The isolated worktree has no registered `alljobs` project, so `/projects/alljobs` returns 404 under the temporary loopback build and cannot provide a truthful final rendered form screenshot. Do not fabricate project data; Task 9 final verification should use an owner-approved real, non-production source state.

## Next safe action

Run Task 8's isolated browser-to-filesystem tests, then include this copy-only form in Task 9's independent final review and verification. Do not push, merge, deploy, select a write-back pilot, or permit the UI to write a new Backlog item.

## Task 9 candidate continuation

- Candidate after Task 8: 47da8457780aa53e7ffa71d057086c40da2834db; baseline: 5466c338e5b74c7f672d7b6a710d4b7f8f74b665.
- R1 remains an isolated, unmerged, non-deployed candidate. No Pact operation is part of this delivery.
- Task 9 may collect final loopback evidence and independent conclusions only. It may not choose a pilot, write an external Backlog, push, merge, deploy, restart a service, or alter Tunnel, Access, domain, refresh-worker, or port 3456.
- An owner-selected registered project and explicit pilot-write authorization remain required before any real Backlog edit.
