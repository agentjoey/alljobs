# Caphub P2 Plan and Threat-Model Review

**Date:** 2026-09-16
**Scope:** `docs/superpowers/plans/2026-09-16-caphub-providers-analysis.md` and `.agent/caphub/p2-threat-model.md`, checked only against the governing P2 spec/roadmap and directly referenced P1 contracts
**Reviewer mode:** independent, read-only, no repository edits, no global test run

## Initial verdict

FAIL — two High and three Medium findings:

1. SSRF authorization was not bound to the actual TLS connection, leaving DNS rebinding and redirect gaps.
2. The Kimi outer-sandbox proof omitted protected-read and endpoint-constrained egress tests and did not strictly project OAuth/config input.
3. API-key mode incorrectly used Kimi CLI instead of the spec's direct server-side JSON Schema transport.
4. The proposed P2-B limits omitted complete input, total-call/token, aggregate-pixel, OCR, preprocessing, and source-fetch resource ceilings.
5. Preprocessing and ReviewPacket acceptance omitted required quality/region and Claim/alternative/platform-preview coverage.

The initial review also found that the API-key CLI probe proved credential/endpoint compatibility but not the canonical direct-HTTP structured-output path. P2-A evidence was corrected from PASS to PARTIAL.

## Corrections

- Added vetted-address pinning to the actual TLS connection, original-hostname SNI/certificate checks, connected-peer validation, and redirect-by-redirect rebinding tests.
- Added real Seatbelt negative read/write/nested-exec/direct-egress probes, an exact OAuth/config projection, and a fixed-target loopback egress proxy.
- Changed Kimi API-key mode to a direct server-only `Output.object` transport; only local-login uses CLI.
- Added aggregate/per-image pixels, preprocessing/OCR deadlines, per-stage input bytes, total provider calls/tokens, and compressed/decompressed source-fetch limits.
- Added sharpness, black-border, OCR-usability, content-region, Claim, alternative, and deterministic platform-preview schema/test requirements.
- Narrowed provider probe, roadmap, and handoff evidence so the unrun direct-HTTP probe is explicit.

## Focused re-review

PASS — all five original finding scopes are resolved. No new scope was reviewed.

This verdict approves the P2 implementation plan and threat-model design for fixture-driven development. It does not mark P2-A fully passed, does not constitute P2-C implementation verification, and does not authorize another real provider request or production enablement.
