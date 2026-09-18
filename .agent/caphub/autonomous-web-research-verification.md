# Caphub Autonomous Web Research — Verification Record

Date: 2026-09-18  
Branch: `codex/caphub-release`  
Code commit: `3d91d26d4123a0ef209d6f37fb0059a7e0f5c284`  
Contract: `caphub-analysis-v3`

## Accepted scope

- One MiniMax-M3 Responses request with the server-side `web_search` tool per
  analysis job, with no automatic retry.
- Up to eight normalized HTTPS citations, consumed as untrusted inline
  research evidence without directly fetching search-result pages.
- DeepSeek remains the structured research and assessment provider.
- Empty configured source origins do not disable model search; explicit URL
  fetching retains the existing exact-origin policy.
- V3 jobs have deterministic identities and immutable lineage over the latest
  V2 or V1 predecessor.
- Exports and deployment targets remain disabled.

## TDD and BDD evidence

- Adapter RED: the MiniMax web-search module did not exist.
- Inline-evidence RED: cited content was still routed through direct fetch and
  a search-only gateway was rejected.
- Audited-stage RED: no bounded `web_search` operation existed.
- V3/BDD RED: contract identity, lineage, production search wiring, and the
  no-explicit-URL Capture-to-Review path were absent.
- Focused GREEN: 16 files / 120 tests passed, including real-boundary behavior
  for Capture, Registry, provider sequencing, V3 artifacts, and ReviewPacket.

## Static and build evidence

- `npm run typecheck`: PASS.
- Focused ESLint over changed provider, research, service, workflow, and schema
  files: PASS with zero errors.
- `npm run verify:deploy`: PASS; production start remains bound to
  `127.0.0.1:3456`.
- `npm run build`: PASS with Next.js 16.3.3 webpack production build.
- Final build ID: `YT_ESR3cuPy2-3RQIxAWQ`.
- Final build-ID SHA-256:
  `aecc1922239c88f606ebca7adb8a69e55d55786080a44e14ce2c668e9fccb8ae`.

## Live MiniMax contract diagnosis

Three explicitly authorized search requests were made; none was retried:

1. The initial request completed at the provider but the local parser rejected
   its multi-message response as `INVALID_OUTPUT`.
2. A metadata-only diagnostic established the response sequence: progress
   message, completed search call, cited message, completed open-page call, and
   another cited message. No query, citation URL/content, prompt, raw response,
   or credential was printed or retained.
3. After adding the real-shape regression and parser fix, one confirmation
   request succeeded with eight HTTPS candidates. Redacted usage was 11,404
   input tokens and 1,135 output tokens; normalized output was 36,355 bytes.

The parser now requires a completed response and a completed search action,
collects citations across assistant messages, ignores uncited progress output,
and retains the existing HTTPS/deduplication/count/content bounds.

## V3 rollout status

The authorized V3 reload and canary are complete. The service health boundary
passed, but the product acceptance outcome did not: the canary stopped before
ReviewPacket/Review Center. The immutable evidence and V4 correction follow.

## V3 production canary — terminal evidence

- The service reload succeeded: launchd reached `running`; the only listener
  was `127.0.0.1:3456`; `/caphub` and `/reviews` both returned HTTP 200.
- Exactly one analysis ran for
  `cap_379e2508ead34c349fcb303bcd39eff2`. It created V3 job
  `job_4782630f05b514c1d795849da23cd508`, superseding V2 job
  `job_b9122bf48e570ec69ec4ea2274a72e12`.
- Preprocess and extraction artifacts were committed. MiniMax visual
  observation succeeded with 7,029 input / 861 output tokens; DeepSeek
  extraction structuring succeeded with 6,972 input / 1,345 output tokens.
- MiniMax `web_search` succeeded once with 210,776 input / 2,101 output tokens.
  No search retry occurred.
- DeepSeek research returned schema-invalid JSON on the initial and single
  correction calls. The job stopped closed at research as
  `HUMAN_REVIEW_REQUIRED`, reason `SCHEMA_INVALID_TWICE`. No research,
  assessment, critic, ReviewPacket, Registry import, or Review Request exists.

## V4 corrective verification

- Code commit: `866e6d4`.
- Model providers now return research, assessment, and critic draft schemas;
  the host composes immutable IDs, normalized evidence, artifact references,
  and timestamps into final schemas.
- A correction receives the original stage input and validation paths, not the
  rejected output. V4 has a distinct deterministic job identity and chooses V3
  as its newest immutable predecessor.
- Focused gate: 20 files / 135 tests PASS; typecheck PASS; focused ESLint PASS
  with zero errors; deployment invariants PASS; webpack production build PASS.
- V4 build ID: `fx9z2aq8zWKkWF5IIXKfM`; build-ID SHA-256:
  `37a66478c3ef171e34196158c28f96905d828876db40bb294a1cf92ef8e35689`.
- No V4 production reload or provider request has occurred. Those actions need
  a new explicit authorization because the one approved V3 canary is complete.
