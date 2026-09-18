# Caphub Extraction V2 — scoped independent review

Date: 2026-09-18

Final verdict: **PASS after the focused R1/R2 re-review and final-code Codex acceptance.** Both original
Important findings are addressed; no new Blocker, Important, or Optional
finding was reported in the fix diff.

## Scope and binding

- Initial review: approved-plan base
  `9dc596be1c6f43563367bdf273b09d3730af0549` through
  `039a7266ccddec37f9be06f1c4908878c6c2d9e6`.
- Initial result: **CHANGES REQUIRED — 0 Blocker, 2 Important, 0 Optional**.
- Fix: `fd341fe3bea50967d8329c9e520b54eddeeffde6`.
- Focused re-review: `039a726..fd341fe`, limited to the five-file fix,
  original findings, regression assertions, and affected contracts. It was not
  a second global review.
- Final-code acceptance: `9f3f1121b53060d63cef80b1bb5125079a0c4161`.
  The only post-review production change adds the two already-fixed bounded
  observation limits to strict host-config parsing with direct regression
  coverage. Codex inspected that diff and the complete extraction boundary,
  then ran the 20-file / 221-test affected matrix, final production build,
  deployment invariants, and the single final-build browser path. No code
  finding remained; only stale evidence binding required documentation repair.

The coherent review covered MiniMax/DeepSeek data separation, no-tools and
no-retry boundaries, raw-data persistence/logging, deterministic host
provenance, V1 compatibility and immutable V2 lineage, audit identity/redaction,
terminal-state handling, and the read-only Analysis stops surface.

The reviewer inspected the production diff and direct consumers, reused the
recorded source-bound verification, and independently ran diff checks and
in-memory probes with real provider adapters, the actual MiniMax SDK, and fake
HTTPS responses. No network, production database/service, or real Capture
operation was performed by those probes.

## R1 — Important, addressed

The original V2 repository field accepted non-HTTPS URLs while V1 required
HTTPS. Host composition returned a typed object without checking the final
`ExtractionResult`. Invalid V1 data could therefore be persisted after a false
extraction success, then fail at research outside the intended stop surface.

The fix applies HTTPS-only V2 URL validation and validates the entire composed
object against `extractionResultSchema` before success. A host result rejection
throws a bounded `ExtractionCompositionError` inside the extraction boundary.

Regressions prove HTTP/FTP draft rejection, direct invalid entity/final-host
linkage rejection, no extraction artifact or research execution, no terminal
replay, closed audit metadata, and retained valid HTTPS success. Independent
re-review probes at `fd341fe` observed:

| Probe | Result |
| --- | --- |
| HTTP repository | `DEEPSEEK_STRUCTURE_FAILED`; failed terminal audit; MiniMax 1 / DeepSeek 1 |
| HTTPS repository | Success; V1 result accepted; succeeded audit; MiniMax 1 / DeepSeek 1 |
| Invalid final host artifact linkage | `HOST_EXTRACTION_LINKAGE_FAILED` |

The non-HTTPS repository fails DeepSeek's local draft parse before host
composition; the final V1 guard separately covers host-owned output validity.
Downstream contracts did not change.

## R2 — Important, addressed

The original MiniMax observer allowed raw SDK HTTP errors to escape. The stage
recognized only application errors, so actual 401/402 failures became
`PROVIDER_UNAVAILABLE`; existing tests had injected already-translated errors.

The fix normalizes recognized SDK `APICallError` only in visual observation.
It creates a fresh bounded application error and retains no SDK cause, body,
headers, credentials, or message. Critic generation/correction is unchanged.

New tests use the real SDK with fake HTTPS errors and verify both direct error
redaction and persisted workflow job/audit classification, no DeepSeek or
research invocation, no extraction artifact, one MiniMax call, and no replay.
Independent re-review probes observed:

| Actual SDK response | Human Review reason | Audit code | MiniMax / DeepSeek calls |
| --- | --- | --- | --- |
| HTTP 401 | `AUTHENTICATION` | `AUTHENTICATION` | 1 / 0 |
| HTTP 402 | `BILLING` | `QUOTA` | 1 / 0 |

`QUOTA` remains the established audit representation of the `BILLING` job
reason. Both probe outputs were redacted.

## Regression evidence and review outcome

The fix followed targeted TDD: 9 intended failures before production edits,
then 9 passes. The affected regression gate passed 8 files / 96 tests;
typecheck, focused ESLint, and diff checks passed. The focused reviewer reused
those results, inspected every changed assertion, and independently repeated
the relevant fake-transport probes. Both findings are closed, with no further
code correction requested.

The historical full gate remains bound to `039a726`, the R1/R2 correction to
`fd341fe`, and the final focused acceptance/build/browser evidence to
`9f3f112`. Exact commands, screenshot bindings, and warnings are in
[verification](extraction-v2-verification.md).

## Preserved gates

This review approves the scoped local correction, not a live provider request,
production reload, real Capture canary, export/target operation, or release.
The synthetic V2 probe, final-code Control Host rebuild/reload, and one
distinct V2 Capture canary remain separate explicit authorizations; push,
merge, tag, and release remain separate decisions. No external coordination
was performed during evidence closeout.

This durable record summarizes the ignored coordination reports
`final-review-report.md`, `final-review-fixes-report.md`, and
`final-review-rereview-report.md` under
`.superpowers/sdd/2026-09-18-caphub-extraction-contract-v2/`. Their historical
verdicts are preserved here rather than relabeled as an initially clean review.
