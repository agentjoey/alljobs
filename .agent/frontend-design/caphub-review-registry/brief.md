# Caphub Review Center + Registry — T3 Brief

**Revision:** 2
**Status:** Approved for bounded mockup and implementation under the Caphub P1–P6 standing authorization; focused independent Review and Verification PASS
**Date:** 2026-09-16
**Linear:** AGE-252
**Architecture:** `docs/superpowers/specs/2026-09-16-caphub-review-registry-design.md`

## Decision boundary

This Brief binds the P3 Review Center information architecture and review semantics. It authorizes synthetic mockup evidence and disabled-by-default local implementation only. It does not authorize a production PostgreSQL provider, credentials, migration, configuration enablement, service restart, deployment, publication, push, merge, tag, or release.

The Human Owner has retired the old frontend-design-workflow for Caphub Task 7+ and separately authorized autonomous progress through ordinary gates. P3 still records its state matrix, rendered mockup, focused independent pre-implementation review, final-build browser evidence, and P3-C verification.

## Job, audience, and mode

- **Audience:** Joey, the single Human Owner, reviewing one evidence-backed capability decision from a desktop or phone.
- **Mode:** Operate. This is a decision workbench, not a marketplace, analytics dashboard, or content gallery.
- **Job:** find the oldest/highest-risk pending review, understand exactly what evidence and immutable version it binds, then approve or reject it without creating a release or implementation side effect.
- **Success:** the owner can explain the recommendation, risk, evidence gaps, change since the prior version, and exact consequence before entering the confirmation phrase.

## Product truth

The Review Center does not confer authority through visual state alone. Every action binds an exact subject version, full digest, lock version, actor, typed confirmation, rationale, idempotency key, and append-only ReviewDecision. A stale page cannot decide a newer subject. Reject is a terminal action, never an approval disposition, and is permanent. Approval may be revoked only until consumed. P3 decisions never publish, install, deploy, write Git, or start a Builder.

## Selected direction

### Visual authority

Extend the established AllJobs Paper Workbench unchanged: warm paper, deep ink, hairline structure, amber provenance/action, General Sans for human reasoning, and IBM Plex Mono for IDs, versions, digests, and machine states. This is a route-level extension, not a new visual world.

### Structural thesis — the decision folio

The desktop surface is a continuous three-part folio rather than a card dashboard:

1. **Docket rail:** a dense, stable queue ordered by waiting time and risk.
2. **Evidence dossier:** the selected subject's recommendation, Claim checks, conflicts, alternatives, exact-version Diff, and unresolved questions.
3. **Decision ledger:** a dark, fixed-reading-order decision boundary with consequence copy, rationale, typed confirmation, and an immutable receipt after completion.

Hairline rules connect the three parts into one artifact. The owner moves left-to-right from attention → proof → authority. On mobile the folio closes into the same vertical order; decision controls never precede evidence.

The assigned surface seed is `b5613e4f`. The grounded seventh structure was selected as required. Catalog challengers were not adopted: tensegrity and depth metaphors obscure familiar review semantics; gate-board reranking threatens stable evidence reading; starship/drum-machine/ASCII grammars conflict with the pinned Paper Workbench identity. The gate-board's useful behavior survives only as a restrained, persistent “changed since viewed” row marker with no automatic displacement while focus is inside the queue.

### Memorable moment

Selecting a queue row aligns the same short subject ID across the docket, dossier spine, and decision ledger. After a successful decision, the amber action area becomes an ink-on-paper receipt with decision ID, actor, exact version, and “No release or build was created.” This is the only authored transition; reduced-motion swaps instantly.

## Scope

### Included

- `/reviews` unified queue and selected review workbench.
- `/captures/[id]` evidence, analysis, model-call metadata, and decision lineage.
- `/capabilities/[id]` current Candidate/capability version, relationships, lineage, decisions, and explicit future-artifact empty states.
- Candidate, Build, Implementation, Release, and Update review kinds in schema/UI; only Candidate requests are produced in P3.
- Waiting/terminal states, stale and idempotency conflicts, disabled/unavailable/read errors, loading, empty, long content, keyboard/focus, reduced motion, and 390px recomposition.
- Exact confirmation phrases and mandatory reject/revoke rationale.

### Excluded

- Database configuration or provider picker in the browser.
- Arbitrary SQL, query builder, retention/delete control, actor selector, permission editor, or audit mutation.
- Raw object keys, filesystem paths, prompts, chain-of-thought/reasoning, provider responses, secrets, or database details.
- Obsidian, capability package generation, platform publication, installation, Kimi Code, Git, deployment, production enablement, or release.
- Fake controls for later phases; unavailable Release/Deployment/Usage sections are honest empty states.

## State matrix

| Surface/state | Trigger | Visible response | Recovery/next action |
|---|---|---|---|
| Queue loading | Initial Registry query | Stable skeleton rows, selected dossier absent, polite loading status | Wait |
| Queue waiting | One or more requests | Stable rows with kind, waiting age, risk/value, evidence confidence, identity, unresolved count, disposition, version | Select a row |
| Filtered empty | Filters match none | Applied filters plus “No reviews match” | Clear one/all filters |
| Global empty | No requests exist | Explain that completed P2 imports create Candidate reviews | Return later; no create button |
| Registry disabled | Config safe-off | Exact safe-off notice; no DB details or enable switch | Configure on Control Host outside UI |
| Registry unavailable | Bounded read failure | Safe error code and retry; no connection text | Retry read or inspect Operations later |
| Review waiting | Current exact version | Evidence dossier, Diff, unresolved questions, decision controls | Approve/reject after confirmation |
| Decision submitting | Transaction in flight | Controls locked; stable copy says no downstream effect yet | Wait; no second request |
| Approved, unconsumed | Terminal approve; no consumer | Immutable receipt, accepted disposition, exact version/full digest, Revocable status | Review receipt, revoke with exact phrase plus rationale, or select next item |
| Approved, consumed | Terminal approve; consumer exists | Immutable receipt, safe consumer ID, Not revocable status | Continue through later lifecycle reversal only |
| Rejected | Terminal reject | Permanent receipt and rationale; no delete/undo | A corrected subject requires a new version |
| Revoked | Unconsumed approval revoked | Revocation receipt linked to approval decision | Create a new review request for the unchanged version, or a new version/request if evidence changed |
| Superseded | New subject version exists | Old Diff preserved; controls removed; link to new request | Open latest request |
| Stale conflict | Same request lock/digest changed | Entered rationale preserved; expected/current lock and digest named | Refresh this request before retry |
| Concurrent terminal | Another decision won | Existing immutable receipt; no duplicate write | Read receipt or continue queue |
| Idempotency conflict | Reused key has different intent | No-write notice and preserved input | Refresh and submit with a new intent key |
| Validation error | Missing reason/phrase/disposition | Inline field errors; evidence remains visible | Correct input |
| Capture complete | Full imported lineage | Evidence order, OCR, Claims, sources, model metadata, decisions | Open linked review/capability |
| Capture partial | ReviewPacket not available | Stored Capture and completed stages plus explicit gap | Inspect workflow; no fabricated result |
| Capability Candidate-only | No later phase artifacts | Candidate version/lineage plus honest empty sections | Await later gated phases |
| Not found | Invalid/missing safe ID | Generic not found; no existence leakage beyond authenticated UI | Return to queue |

## Content ranges

- Queue: 0–200 visible results per bounded query; 25 per page; labels wrap to two lines before truncation.
- Subject names: 1–160 characters; IDs use fixed validated formats.
- Rationale: approve 0–2,000 characters; reject/revoke 1–2,000 characters. Candidate approval dispositions are adopt, adapt, build, learn, or watch; Reject is a separate terminal action.
- Claims: 0–100 per ReviewPacket; evidence citations 1–20 per Claim check.
- Unresolved questions: 0–50; long text wraps and remains selectable.
- Diff: first version uses “New record”; later versions show bounded field-level additions/removals/changes with exact old/new digests.
- Decision timeline: 0–100 items per subject, newest terminal receipt first with chronological expansion.

All mockup values are labeled synthetic. No benchmark, provider capability, price, security result, or adoption claim is presented as real.

## Interaction and layout

### Desktop — 1440px

- Existing shell and amber status strip remain intact; `Reviews` appears immediately after `Caphub` in primary navigation.
- Page heading and compact filters sit above the folio, not in a hero or metric strip.
- The folio uses approximately 3/5/4 proportions. The queue remains readable at a narrow measure; dossier owns the largest text plane; decision ledger is visually distinct but not floating.
- Queue row selection changes the dossier and ledger together. Focus stays on the selected row and the dossier heading is announced.
- Evidence sections use disclosure only for secondary detail; recommendation, risk, conflicts, Diff, and unresolved questions remain visible by default.
- The primary action is unavailable until the exact confirmation phrase matches. Reject/revoke also require rationale.

### Mobile — 390px

- Queue becomes a compact “current docket” list followed by the selected dossier and then the decision ledger.
- A sticky jump bar links Docket, Evidence, Diff, and Decision without hiding content or becoming the source of truth.
- Tables recompose into labeled rows; no horizontal-scrolling data table is required.
- Confirmation input and primary action are at least 44px high. The action is never sticky over evidence.
- IDs may abbreviate visually while full values remain available to assistive technology and copy controls. The exact full 64-hex subject digest appears before controls and in every receipt and can be copied.

### Feedback and motion

- Status is text-first with shape/icon support; color is secondary.
- Only the selected-ID alignment and receipt replacement animate, using a short opacity/position transition. Reduced-motion removes both.
- Stale and validation errors move focus to the notice/first invalid field while retaining all user-entered rationale.
- Successful decisions move focus to the receipt heading and announce the decision ID plus the explicit no-release/no-build consequence.

## Accessibility and security presentation

- One `h1`, nested `h2`/`h3`, landmarks for Docket, Evidence, Diff, and Decision, and descriptive accessible names for queue rows.
- Queue selection uses links or buttons with native semantics, not click-only containers.
- Confirmation copy is visible text and programmatically associated with the input.
- Evidence strings render as text only; no HTML from screenshots, OCR, providers, or sources is injected.
- External evidence links use HTTPS, visible host text, and safe new-tab behavior.
- The UI never reveals whether disabled/unavailable failures came from a missing secret, URL, role, host, or migration detail.

## Pre-implementation acceptance

- The mockup can display waiting, approved-unconsumed, approved-consumed, rejected, revoked, superseded, stale, concurrent-terminal, idempotency, validation, server-error, disabled, Capture lineage, and Candidate-only Capability states using synthetic data.
- At 1440px the folio reads left-to-right; at 390px it reads docket → evidence → diff → decision with zero horizontal overflow.
- The exact subject version/digest and action consequence are visible before any decision control.
- Approval, reject, and stale states cannot be mistaken for release, publication, or Builder execution.
- Confirmation phrases, rationale requirements, permanent reject semantics, and unconsumed-only revocation match the P3 design spec.
- A focused independent reviewer finds no blocker/high/medium design or security-boundary issue before application implementation begins.

## Open decisions

No implementation-blocking UI choice remains. Production PostgreSQL provider, credentials, backup/PITR, cost, migration window, service restart, and release remain Gate P3-D hard stops outside this Brief.
