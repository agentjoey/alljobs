# Caphub P2-C Verification Record

**Date:** 2026-09-16
**Branch / worktree:** `codex/caphub-foundation` · `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/caphub-foundation`
**Implementation chain:** `e6fe123` → `de76318` → `79d6dbf` → `776c126` → `2980a7f` → `f285d3e` → `0a1f22c` → `112b066` → `373bb9a` → `8e85cff` → `4cea8aa` → `87e4360` → `c733c8e` → `b705d52`
**Verdict:** **P2-C PASS** — focused independent Review and Verification passed with zero remaining blocker/high/medium findings.
**Linear:** `AGE-251` marked **Done** on 2026-09-16 with the implementation chain and controller-gate evidence attached.

## Verified scope

- Deterministic preprocessing, local OCR/barcode extraction, byte/image/pixel/deadline limits, dedupe, and review-only privacy suggestions.
- Fixed MiniMax extraction/critic and Kimi research/assessment contracts with zero tools, zero transport retries, and at most one schema correction.
- Direct Kimi API adapter fixed to `https://api.kimi.com/coding/v1` and `k3-256k` plus sandboxed local-login adapter sharing the same upper contract.
- Exact-origin, public-address-pinned, peer-validated source retrieval with redirect reauthorization and bounded content.
- Versioned extraction, evidence, assessment, critic, ReviewPacket, job, artifact, and model-call audit contracts.
- Resumable fixed-stage workflow, immutable content-addressed artifacts, deterministic audit identifiers, and fail-safe handling of interrupted calls.
- Strict local command accepting one Capture ID and loading only the fixed server-only Control Host composition; disabled configuration is rejected before secret reads.
- ReviewPacket remains non-executable and always sets `human_review_required: true`.

## RED → GREEN fix evidence

The focused fix round reproduced four review failures before implementation:

1. OCR and whole-stage deadlines rejected without cancelling the underlying recognizer.
2. `ResearchDossier.claim_checks` accepted foreign Claim IDs.
3. The exported runner helper was tested, but the actual package entrypoint did not parse or execute it.
4. Task 10's original zero-call `securityProbe` was disconnected from every adapter and therefore provided no evidence.

Commit `87e4360` propagates abort signals and terminates the packaged Tesseract worker, requires exact Claim-set closure, adds the fixed server-only runtime composition, and replaces the disconnected probe with the actual Kimi API adapter, exact source policy, real Seatbelt, proxy denial, and peer-mismatch boundaries. Commit `c733c8e` fixes the actual package runner to use Node's `react-server` export condition and adds a CLI-level temporary disabled-config regression. Commit `b705d52` removes concurrent-suite timing nondeterminism from the whole-stage cancellation test without weakening the assertion.

## Security BDD evidence

- Hostile OCR and source strings remain inert data and appear only in review evidence, not executable platform previews.
- The integrated Kimi API fixture uses the production `KimiApiAdapter` request path and asserts fixed base URL/model, structured output, `maxRetries: 0`, and no tools.
- The integrated source fixture uses production `ExactHttpsSourcePolicy` and `LiveResearchSourceGateway`; a connected peer outside the vetted set is rejected.
- Real macOS `/usr/bin/sandbox-exec` denies repository, Git, default Kimi home, SSH, keychain, unrelated-user reads, outside writes, nested execution, and direct non-loopback egress while retaining loopback proxy reachability.
- The production Kimi proxy authorizer rejects a target outside the fixed Kimi/Auth set.
- Invalid runner secret/path/provider arguments are rejected before Control Host configuration is loaded. The valid-ID CLI regression uses a sentinel-owned temporary config with Caphub disabled; it does not load the real Control Host or invoke a provider.

## Final controller gates

| Gate | Result |
|---|---|
| Focused P2-C fixes | 8 files / 26 tests PASS outside the managed sandbox, including real Seatbelt |
| CLI package regression | 1 file / 4 tests PASS with temporary disabled config |
| Full unit/component/BDD suite | 105 files / 1033 tests PASS |
| TypeScript | `npm run typecheck` PASS |
| Focused ESLint | 0 errors |
| Full ESLint | 0 errors; 66 pre-existing warnings, no P2 warning increase |
| Production build | `next build --webpack` PASS; routes include `/caphub` and both Capture APIs |
| Turbopack note | `npm run build` could not bind the execution sandbox's CSS-worker port; this is the previously characterized environment limitation, not a source/build error |
| Diff / staging | `git diff --check` PASS; Human-owned `AGENTS.md` remains unstaged and untouched |

## Independent review and verification

- Initial focused security review: **FAIL**, with four medium findings (cancellation, Claim closure, executable runner, connected BDD evidence) and one low single-writer residual.
- Initial independent Verification: **FAIL**, limited to the executable runner gap; the disconnected probe was recorded as low-quality evidence.
- Focused independent Verification at `87e4360`: **PASS**, 6 files / 19 tests; no remaining medium/blocking gap. It notes only that Tesseract cannot cancel `createWorker()` mid-initialization, but the returned worker observes the already-aborted signal and is immediately terminated.
- Focused independent re-review confirmed cancellation, Claim closure, connected API/source/sandbox BDD, and the documented single-Control-Host residual. Its only follow-up medium finding was plain-`tsx` incompatibility with the `server-only` marker; `c733c8e` applied the requested minimal React Server condition and CLI regression. The CLI-only re-review passed 1 file / 4 tests with no remaining finding. Final focused Review and Verification verdict: **PASS**.

## Residual boundaries

- P2-A live direct-HTTP structured-output compatibility remains unproven: the one authorized `k3-256k` request established endpoint/auth/model acceptance but produced no schema-valid final object. No retry or later live request occurred.
- Source origins remain empty/disabled by default. There is no default live search adapter.
- Same-job serialization is process-local. The supported deployment has exactly one active Control Host writer; multi-process enablement requires a separately reviewed cross-process lock.
- Existing dependency advisories remain a production-enablement gate and are not expanded into an unplanned framework upgrade here.
- P2 does not authorize approval, Registry release, installation, build execution, publication, deployment, production configuration, service restart, push, merge, tag, or release.

No real provider/source request, real secret read, production enablement, restart, deployment, publication, or Git remote mutation occurred during Task 10 implementation or verification.
