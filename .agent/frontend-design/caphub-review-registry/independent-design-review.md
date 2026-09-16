# Caphub P3 Review Center + Registry — Targeted Independent Design Re-Review

**Date:** 2026-09-16
**Inputs:** revision 2 design spec, revision 2 Brief, revised mockup, P3 implementation plan, and nine current mockup screenshots
**Scope:** only original findings B1, H1–H4, M1–M3, and L1
**Verdict:** **PASS — targeted pre-implementation gate is closed**
**Residual severity:** 0 blocker · 0 high · 0 medium · 0 low

**Artifact binding (SHA-256):**

- Design spec: `c2908de66799ea448b9e590f3351a883f8ae167a61d1882ab9ae961f0d3562b7`
- Brief: `7f0dba3337ff47a9b3be94db0a86e62884040c1f02c21f09bfe131fe7cb32c55`
- Implementation plan: `6ef53f9b694b1d4b880ce825ef385ced6f8c81a6b0ac82c3375a9c026e79f710`
- Mockup: `08369b5873dd28a63fbef2e16414d120b7d2ad3d48398e2f86141eb7669947c2`

The spec and Brief hashes were refreshed after their Status metadata was changed from pending to PASS. This binding-only update changes no reviewed contract or interface content and does not reopen the review; the plan and mockup bindings are unchanged.

All original findings B1, H1–H4, M1–M3, and L1 are resolved. The final four-item evidence check closed the remaining Superseded recovery, queue evidence-confidence, stale-code naming, and live-announcement gaps without reopening any other P3 design question.

## Re-review method and boundary

- Re-read only the revision 2 clauses and implementation-plan tasks that respond to the original findings.
- Inspected all nine current screenshots, including approved-unconsumed, approved-consumed, revoked, stale, and superseded evidence.
- Ran one read-only local Chromium geometry check against the standalone mockup. At 720 CSS px—the reflow-equivalent width of a 1440px viewport at 200% zoom—and at 390 CSS px, root/body `clientWidth === scrollWidth`; Docket → Evidence → Diff → Decision order remained intact; no visible button, link, input, or select measured below 44×44 CSS px. This is sufficient for the design-gate reflow check, not a substitute for the final P3-C browser/assistive-technology verification.
- Did not reopen unrelated design questions, review P1/P2, run repository tests, or modify any input artifact.

## Finding disposition

### B1 — Revoke contract was incomplete

**Status: RESOLVED**

Revision 2 now defines:

- exact `REVOKE <KIND> <short-id>` phrases for all five review kinds;
- original approval decision ID, request ID, lock version, digest, fresh idempotency key, phrase, rationale, and server-bound actor;
- server-derived consumed/revocable state;
- row locking and no-write `DECISION_ALREADY_CONSUMED` recovery;
- linkage through `revokes_decision_id`;
- same-version new-request versus changed-version/new-request recovery (`2026-09-16-caphub-review-registry-design.md:138-144`).

The mockup now shows approved-unconsumed revoke controls, approved-consumed recovery, and a revocation receipt linked to the original approval (`mockup.html:308-311`). The plan freezes negative schemas and PostgreSQL transaction tests for the same contract (`2026-09-16-caphub-review-registry.md:94,355-379`). No original B1 ambiguity remains.

### H1 — Candidate Reject had two competing meanings

**Status: RESOLVED**

Candidate approval now accepts only `adopt|adapt|build|learn|watch`; Reject is a separate permanent terminal action (`2026-09-16-caphub-review-registry-design.md:130-140`; `brief.md:24,97`). The `Reject` disposition button has been removed, the approval choice group contains only the five allowed dispositions, and the separate Reject copy names its distinct phrase/rationale contract (`mockup.html:304-305`). The plan adds explicit negative coverage for Candidate approve with `reject` (`2026-09-16-caphub-review-registry.md:94,355`).

### H2 — Stale and SUPERSEDED were conflated

**Status: RESOLVED**

The core state semantics are now correctly separated:

- same-request lock/digest drift is `STALE_REVIEW`, preserves rationale, and requires refresh;
- a newer subject version produces `SUPERSEDED`, removes controls, preserves the old Diff, and identifies the latest request;
- a concurrent terminal decision returns the existing receipt;
- idempotency conflict writes nothing and requires a new intent key (`2026-09-16-caphub-review-registry-design.md:144,188-197`).

The mockup renders distinct stale, superseded, concurrent, and idempotency states (`mockup.html:313-316`), and the refreshed mobile screenshots no longer confuse v2 supersession with same-request staleness. The remaining recovery gap is closed by a real `?state=waiting#decision` latest-request anchor with a 44 CSS-pixel minimum height (`mockup.html:155,313`); the plan now requires accessible latest-request navigation coverage (`2026-09-16-caphub-review-registry.md:605`). A focused Chromium assertion at 390px measured the link at 239.77×44 CSS px and confirmed that it accepts focus.

The stale error name is also aligned: the implementation plan maps serialization conflicts to `STALE_REVIEW` (`2026-09-16-caphub-review-registry.md:379`), matching the architecture, and the reviewed spec/Brief/mockup/plan contain no `STALE_DECISION` occurrence. No H2 residual remains.

### H3 — Approved/stale queue truth was inconsistent

**Status: RESOLVED**

Queue count, count label, active state filter, and selected-row state now derive from the preview state (`mockup.html:334-408`):

- stale/idempotency/validation/server-error remain `State: Waiting`, `3 waiting`, and the selected row stays waiting;
- approved/consumed/rejected/revoked/superseded/concurrent change to `State: All`, `3 results`, and an explicit terminal/superseded row label;
- Capture and Capability replace the queue counter with route-relevant labels.

The updated approved, consumed, revoked, stale, and superseded screenshots match those rules. No original H3 count/write-status contradiction remains.

### H4 — Required identity/critic/unresolved decision inputs were absent

**Status: RESOLVED**

Revision 2 adds:

- identity state and unresolved count to every docket row;
- explicit critic agreement and disagreement;
- a dedicated unresolved-questions section;
- named filter values including Value (`mockup.html:277,284-298`).

This resolves the original safety problem where an identity-ambiguous, high-risk Candidate could reach the decision ledger without the ambiguity or critic disagreement visible. The final queue-field gap is also closed: all three docket rows display evidence confidence alongside identity and unresolved count (`mockup.html:286-288`), the Brief freezes it in Queue waiting (`brief.md:72`), Task 8 freezes the DTO contract (`2026-09-16-caphub-review-registry.md:544`), and Task 9 requires the corresponding component assertion (`2026-09-16-caphub-review-registry.md:605`). A targeted Chromium assertion confirmed a `Confidence n/5` value in every row. No H4 residual remains.

### M1 — Required state matrix lacked usable presentation contracts

**Status: RESOLVED**

The mockup now provides concrete mutation-critical states for submitting, approved-unconsumed, approved-consumed, rejected, revoked, superseded, same-request stale, concurrent terminal, idempotency, validation, and safe server error, plus distinct filtered/global empty states (`mockup.html:240-257,306-322`). The Brief defines trigger, response, and recovery (`brief.md:67-91`), while Task 9 requires component coverage for the complete queue/review/Capture/Capability matrix (`2026-09-16-caphub-review-registry.md:603-605`). This meets the original M1 request for bounded state sketches or normative view-model/copy behavior.

### M2 — Capture/Capability sketches were thinner than their IA contracts

**Status: RESOLVED**

The Capture state now includes ordered source evidence, OCR, Entity, Claim/source evidence, bounded model-call metadata, ReviewPacket version, Registry import, and explicit decision status. The Capability state now includes current version, exact-version lineage, evidence relationship, decision state, and honest later-phase empty states (`mockup.html:323-329`). Task 8 freezes Capture partial/complete and Candidate-only version/lineage/decision DTO tests (`2026-09-16-caphub-review-registry.md:544`). The current screenshots substantiate the expanded structures without exposing prompt, reasoning, raw provider response, object key, path, or secret.

### M3 — Mobile targets/type scale/200% zoom missed the accessibility floor

**Status: RESOLVED for the pre-implementation design gate**

The revised mockup raises the toolbar, brand, filter, jump links, disposition controls, confirmation fields, and decision actions to at least 44 CSS px on mobile; decision-critical annotation styles were raised to the 10.5px Paper Workbench annotation step (`mockup.html:48-49,78-170,185-218`). The read-only geometry check found:

- 720 CSS px: root/body width 720/720, correct vertical section order, zero visible interactive targets below 44×44;
- 390 CSS px: root/body width 390/390, zero visible interactive targets below 44×44.

Task 9 explicitly requires 44 CSS-pixel controls and 200% zoom usability tests; Task 10 retains real final-build responsive/WCAG checks (`2026-09-16-caphub-review-registry.md:603-605,648-688`). Final P3-C must still verify real browser zoom, text-only zoom, keyboard, and assistive technology against the application build.

### L1 — Focus/live-announcement behavior was not demonstrated

**Status: RESOLVED**

Revision 2 adds a polite atomic live region, makes outcome headings programmatically focusable, and moves focus to the visible outcome heading when the preview state changes (`mockup.html:229,416-422`). The final announcement gap is closed by explicit Approved, Concurrent, Rejected, and Revoked messages that include the applicable decision ID and state that no release/build was created (`mockup.html:348-352`). Queue-row activation now announces `Evidence dossier selected: <subject>` (`mockup.html:429-433`), and Task 9 requires exact coverage for keyboard row selection, dossier announcement, success focus, decision ID, and the no-release/no-build consequence (`2026-09-16-caphub-review-registry.md:605`).

A targeted Chromium assertion confirmed all four messages, focus on each visible outcome heading, and the exact dossier-selection announcement. No L1 residual remains.

## Final targeted verdict

**PASS.** B1, H1–H4, M1–M3, and L1 are all resolved, with 0 blocker, 0 high, 0 medium, and 0 low residual findings. The four final closure checks passed: Superseded has an operable accessible latest-request link; evidence confidence is aligned across all queue rows, Brief, and Task 8/9; `STALE_REVIEW` is the single stale-conflict name; and complete decision/dossier announcements plus outcome focus are demonstrated and test-bound.

No other part of P3 was reopened by this targeted re-review. The independent P3 pre-implementation design-review gate passes on the reviewed revision-2 artifacts.
