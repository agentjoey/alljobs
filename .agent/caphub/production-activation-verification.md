# Caphub P1–P4 Production Activation — Independent Verification

Date: 2026-09-17

Production base: `50abeae8719f297a44955b076f9a9d7299f5abbe`

Final code candidate: `5b434f4049eba40dab71c3d96f1cacf364115e7a`

Full-test source: `a82aa07`

Build/E2E source: `7a3f7e928dc91f823d1c4de73c3e8cf6e0f8c9bf`

Evidence snapshot: `5820732cc8048a1952b91759684e42dbd4267eeb`

Build ID: `FK3UGN3cYhfExekMHoAp3`

Verdict: **PASS for PA-A implementation acceptance**

## Full phase evidence

The one planned full phase gate passed before independent review. Exact
provenance is split because the test concurrency limit (`a82aa07`) was followed
only by the supported webpack build-script selection (`7a3f7e9`) and then the
final screenshot refresh (`5820732`):

| Check | Result |
|---|---|
| `npm test` | PASS — 167 files / 1430 tests, 26.65 s |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — 0 errors / 79 existing warnings |
| `npm run build` | PASS — Next.js 16.3.3 webpack Production build |
| `npm run verify:deploy` | PASS — loopback and deployment invariants |
| production-pilot E2E | PASS — 1/1, 3.6 s |

Environment: Node.js `v24.14.0`, npm `11.9.0`, PostgreSQL `17.11`.

Build `FK3UGN3cYhfExekMHoAp3` was produced from `7a3f7e9`; `5820732` changes
only the committed capability screenshot. The review fix changed
only bounded operator/import/backup/bootstrap code,
tests, and operating documents. No Next route, React component, browser
runtime, package version, or rendered asset changed. Therefore the independent
verifier reused the full gate and the directly affected fix-only checks listed
below, then independently checked the commit/diff, checksums, screenshot
dimensions, and gate consistency. Fix evidence is 2 CLI files / 6 tests and 3
temporary-PostgreSQL files / 9 tests PASS, plus typecheck, scoped lint,
deployment invariants, and diff check PASS. This is the plan's prescribed
fix-only verification; no second global suite was run.

## Bound checksums and visual evidence

| Artifact | SHA-256 / dimensions |
|---|---|
| `001_registry.sql` | `d48b33929743342b2fcfe11726a45653e06c0cc39a84949dcbf1ae9ec80e5fa8` |
| `002_read_models.sql` | `fa8fefdef331966fdcb67db911ace73eca2d2f54702028acaa6735de1e8716c7` |
| `003_exports.sql` | `e9df0d799318069fa4d1e09438043a16666df695e6ccdf28ad0474a2121922e4` |
| `reviews-1440.png` | `80188420640ddd123ad7aad1277c71b680e6a21c1d6d7e496ccc25166423202c` / 1440×1515 |
| `capability-390.png` | `b1bd2e6349e9b5ad74945d6a3c633a916c8d96eb5d04bce3bf99851168c2a86d` / 390×2189 |

The fixture pilot proved immutable import, fixture-only analysis, exact
Candidate and Release decisions, target-disabled previews, backup creation,
and isolated restore. It created no Production backup generation and touched
no real Production database, source, provider, target, or service.

## Acceptance and remaining evidence

The independent verifier confirmed the safe-off importer, successful
bootstrap-to-launchd lifecycle contract, local-only backup fail-close, and the
S1/S2/PA-D wording after the fix. PA-A passes. Production smoke is intentionally
unrun because it belongs after an authorized cutover.

PA-B, the separately explicit S1 listener-stop action, PA-C, PA-D, and all P4
target gates remain closed. Linear could not be updated because the workspace
free-plan issue limit was reached; no duplicate issue was created and no Linear
completion is claimed.
