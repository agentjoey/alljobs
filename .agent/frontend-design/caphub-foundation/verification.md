# Caphub Foundation / Web Capture — Independent Verification

**Current result:** PASS — focused verdict pass recorded below  
**Initial result:** PASS WITH FIXES — superseded for the revised artifact  
**Date:** 2026-09-15  
**Role:** Independent Verification Agent / fresh-context run  
**Tier:** T3  
**Brief:** revision 1  
**Branch / worktree:** `codex/caphub-foundation` · `.worktrees/caphub-foundation`  
**Base commit:** `59fd0e3cf750af39444476ae1a896aaf3e6bb869`

## Independence statement

This verification was performed in a fresh agent context from the canonical Brief, the standalone HTML artifact, and the rendered page. I did not inherit the Primary Agent's conclusions and did not treat prior screenshots or prose as proof. I did not modify `brief.md` or `mockup.html`, and this record does not approve Human Gate P1-A on behalf of the Human Owner.

## Artifact binding

| Artifact | SHA-256 |
|---|---|
| `brief.md` revision 1 | `e694eae5615074afeb8802f7b55be556fd9d89dded847ac5eb77e147526cc5a8` |
| `mockup.html` | `d02c3f5a00bef46bc82b72e282806f611188f1e281e03db82ea004b947a397e0` |
| `mockup-screens/caphub-ready-1440.png` | `427e4d301046904e6b254c2a6a2de7d4b7f7c68d68aced9e5b283668909ba645` |
| `mockup-screens/caphub-success-1440.png` | `a9bcb4ede3e04a0b753c45aaf0807e275ab4c545dc084c4dc34aab257fc2ed66` |
| `mockup-screens/caphub-ready-390.png` | `ff8183993e827f012053d43fbb1ce997c7b571054949977d5cf7df68c0fdb94c` |
| `mockup-screens/caphub-disabled-390.png` | `4948e44de0e68c1952077578844a0a3e29eb1180ddf27c6ebcd8b9694f6447b2` |

The 390px evidence PNGs are 780 physical pixels wide because they were captured at device scale 2; the verified CSS viewport was exactly 390px. Existing PNGs were inspected only as evidence candidates. The pass/fail conclusions below come from a live browser run against the bound HTML digest.

## Verification method and evidence

- Served artifact: `http://127.0.0.1:4173/.agent/frontend-design/caphub-foundation/mockup.html`.
- Browser path: Codex in-app Chromium with scripted Playwright DOM inspection.
- Exercised selector values: `ready`, `selected`, `submitting`, `success`, `duplicate`, `disabled`, `oversize`, `invalid-type`, and `read-error`.
- At each state, recorded `body[data-state]`, URL query state, visible alerts/live regions/receipts, submit label and disabled state, form-control disabled state, and `documentElement`/`body` scroll widths.
- Repeated the state sweep at true CSS viewports `1440 × 1000` and `390 × 844`.
- Performed a keyboard Tab traversal from page load and inspected the visible `:focus-visible` treatment.
- Inspected the reduced-motion media rule and the complete inline state controller.
- Ran the Impeccable detector once:

  ```text
  node /Users/xtation/.agents/skills/impeccable/scripts/detect.mjs --json .agent/frontend-design/caphub-foundation/mockup.html
  ```

  It reported two advisory font-size matches at lines 257 and 996. Both are false positives in this context: `clamp(30px, 3vw, 44px)` is the display size explicitly documented in `DESIGN.md`, and the mobile `30px` value is that documented minimum.
- Ran static searches for network/data/file APIs and sensitive implementation details. The artifact contains no `fetch`, XHR, WebSocket, EventSource, beacon, `FormData`, `FileReader`, file input, API route, storage API, cookie, local/session storage, absolute filesystem path, `ALLJOBS_HOME`, environment variable, or secret/config lookup. The only script effects are preview-state DOM updates, `history.replaceState`, and `preventDefault()` on form submission.
- Repository-required `git pull` was attempted. It did not run because the isolated branch has no upstream tracking branch; no merge or worktree mutation occurred.

## State matrix

| State | Rendered result | Controls / semantics | Result |
|---|---|---|---|
| Ready / empty | Evidence bay, accepted formats, 10 MiB boundary, context fields, custody statement, and empty receipt render. | Submit is disabled and labeled `Choose an image to continue`; no alert is exposed. | PASS |
| Selected | Synthetic PNG filename, MIME, 4.8 MiB size, replacement action, and custody consequence render. | Submit becomes enabled and labeled `Receive capture`; context controls remain enabled; selected file is in a polite live region. | PASS |
| Submitting | Selected file and stable layout remain; status becomes `State Receiving`; button says `Receiving capture…`. | All form controls are disabled, preventing a second request. The required live announcement is missing; see F-1. | FAIL — F-1 |
| Created / success | Created receipt shows Capture ID, `received`, digest prefix, and `Human required`; no path or raw object key is exposed. | Form controls remain disabled. Receipt is neither announced nor focused; see F-1 and F-2. | FAIL — F-1/F-2 |
| Duplicate | Text explicitly says an existing receipt was returned and no second record/object/audit event was created. | Form controls remain disabled. Receipt is neither announced nor focused; see F-1 and F-2. | FAIL — F-1/F-2 |
| Disabled | Control Host notice explains authorization/configuration recovery without an in-page enable switch. | Every intake input/button is disabled; the explanation is a visible `role="alert"`. | PASS |
| Oversize | 14.2 MiB synthetic metadata and explicit 10 MiB error render; copy says no bytes were staged. | Submit is disabled; alert names the supported formats and smaller-file recovery. | PASS |
| Invalid type | HEIC filename/MIME and supported PNG/JPEG/WebP list render. | Submit is disabled; visible `role="alert"` supplies the recovery action. | PASS |
| Receipt read error | Known truncated Capture ID remains visible; copy distinguishes metadata-read failure from data loss. | Intake controls remain disabled; `role="alert"` and `Retry receipt read` are present; copy says bytes are not automatically resubmitted. | PASS |

The Brief also lists a service/storage POST error, but the user-requested P1-A preview set and selector expose nine states only. This run therefore does not claim rendered coverage for a separate service/storage-error preview.

## Semantics, labels, keyboard, and motion

- The page has a skip link, header, labeled primary navigation, one `main`, one `h1`, ordered `h2`/`h3` section headings, a labeled form, associated labels for source URL and note, and semantic receipt definition lists.
- Decorative SVGs are hidden from the accessibility tree. Disabled, validation, and read-error states use text plus `role="alert"`; created and duplicate states are textually distinct and do not rely on color.
- Ready-state Tab order was: skip link → mockup preview selector → brand → Portfolio → Projects → Tasks → Monitoring → Caphub → Register → Archived → search → Choose image → Source URL → Note. The disabled submit is correctly skipped. Selected-state DOM order then exposes replacement, context fields, and submit in task order. No keyboard trap was found.
- Focus styling is explicit and visibly strong: 3px ink outline, 3px offset, and a 5px amber outer ring. The skip link becomes visible on focus.
- `#receipt-title` is intentionally programmatically focusable with `tabindex="-1"`, but the state controller never focuses it. This is F-2.
- The `prefers-reduced-motion: reduce` rule removes scroll motion and reduces animation/transition duration to `0.001ms` while leaving all state content immediately present. The submitting state retains a textual `Receiving capture…` label even when the spinner does not animate. This matches the Brief's no-movement fallback.

## Viewport results

| CSS viewport | States checked | Root width result | Composition result |
|---|---:|---|---|
| 1440px | 9 / 9 | `innerWidth = clientWidth = scrollWidth = bodyScrollWidth = 1440` in every state | 7/5 evidence/context workbench, full-width custody strip, and receipt ledger remain stable. No root horizontal overflow. |
| 390px | 9 / 9 | `innerWidth = clientWidth = scrollWidth = bodyScrollWidth = 390` in every state | Main order remains introduction → evidence/context workbench → custody → receipt → safeguards. No root horizontal overflow. Primary navigation uses intentional internal horizontal scrolling (`clientWidth 390`, `scrollWidth 500`, `overflow-x: auto`). |

All visible Caphub intake controls meet the Brief's 44px mobile target. The mockup-only preview selector is 28px high, while the inherited shell brand and search field measure 34px and 36px respectively. Because the Brief explicitly excludes the preview selector from production design and requires the established shell behavior to remain unchanged, these are recorded as a non-blocking production follow-up rather than a P1-A Caphub intake failure.

## Safety and scope-boundary inspection

- No live upload or data operation exists. `Choose image` is a demonstration button, there is no file input, and form submission is cancelled locally.
- No filesystem path, secret, config value, raw object key, raw response, or full object-storage locator is rendered.
- Receipt IDs and digest prefixes are synthetic and non-actionable; the page labels all identifiers/states as synthetic design evidence.
- No image preview, remote URL fetch, OCR result, model/analysis progress, candidate scoring, approval, publication, installation, code execution, Shell/Git, deployment, delete, retention, or production-enablement control exists.
- The source URL helper explicitly says P1 stores metadata only and does not open or fetch the URL.

## Findings

### F-1 — P1: asynchronous state changes are not exposed through a live status region

**Location:** `mockup.html` lines 1302–1305, 1323–1368, and 1399–1438  
**Category:** Accessibility / state semantics  
**Impact:** A screen-reader user can activate the intake but may receive no announcement that receipt is in progress or that a created/duplicate result arrived. The button text changes to `Receiving capture…`, but the button is not in a live region; the created and duplicate receipts are also outside a live region. This fails the Brief's explicit live-message requirement.  
**Standard:** WCAG 2.2 SC 4.1.3 Status Messages; Brief revision 1 Feedback and motion / Human Gate acceptance criteria.  
**Required fix:** Add a dedicated polite status region (or equivalent correct status semantics) that receives submitting, created, and duplicate messages without duplicating alert announcements. Keep validation and permission failures assertive only where already appropriate.  
**Suggested command:** `$impeccable harden`

### F-2 — P1: success and duplicate transitions do not move focus to the receipt heading

**Location:** `mockup.html` line 1319 and `setState()` at lines 1411–1435  
**Category:** Accessibility / keyboard focus  
**Impact:** After the asynchronous task completes, keyboard and assistive-technology users remain at the state selector or submit control and are not taken to the new receipt content. The heading is prepared with `tabindex="-1"`, but no code focuses it. This directly contradicts the Brief's specified completion behavior.  
**Standard:** WCAG 2.2 SC 2.4.3 Focus Order and the Brief revision 1 Feedback and motion contract.  
**Required fix:** On created and duplicate completion, focus `#receipt-title` after the receipt is visible. Do not move focus for direct initial deep links unless the final production behavior deliberately models a completed submission. Re-run keyboard verification in both states.  
**Suggested command:** `$impeccable harden`

## Audit health

| Dimension | Score | Evidence summary |
|---|---:|---|
| Accessibility | 2 / 4 | Strong structure, labels, alerts, keyboard order, focus styling, and reduced motion; two material async-announcement/focus gaps remain. |
| Performance | 4 / 4 | One static HTML document, no remote assets/data operations, bounded CSS motion, no layout loop. |
| Responsive design | 4 / 4 | All nine states have zero root overflow at 1440px and 390px; mobile recomposition and capture targets are stable. |
| Theming | 4 / 4 | Coherent Paper Workbench tokens and documented light-only direction. |
| Implementation integrity | 4 / 4 | Product-specific accession lane and custody boundary; detector findings were verified as false positives. |
| **Total** | **18 / 20** | **Excellent, with two required accessibility fixes.** |

Severity count: **P0 0 · P1 2 · P2 0 · P3 0**.

## Verdict and next safe action

**PASS WITH FIXES.** All nine requested visual states render, the two exact viewports have no root horizontal overflow, disabled/validation/error recovery is safe, and the mockup has no live upload/data or prohibited capability surface. However, Human Gate P1-A should remain pending until F-1 and F-2 are fixed in `mockup.html`, the HTML SHA-256 is rebound, and an independent focused rerun confirms live announcements plus receipt focus for submitting, created, and duplicate states.

The Human Owner remains the only approver for Brief revision 1 and the revised rendered artifact.

---

## Focused independent verdict pass — 2026-09-15

### Scope and independence

This was a new rendered verification run against the revised standalone artifact, not a source-only review and not an acceptance of the implementer's claims. The run re-exercised all ten preview states at both required viewport widths, directly inspected the live status node and active element after each transition, rechecked the service/storage recovery state and safety exclusions, and independently inspected the final screenshot set. Only this verification record was edited.

### Revised artifact binding

| Artifact | SHA-256 |
|---|---|
| `brief.md` revision 1 | `e694eae5615074afeb8802f7b55be556fd9d89dded847ac5eb77e147526cc5a8` |
| Revised `mockup.html` | `e60e8ab1672b4bcc76eb33a69cdc83c41e61f4344feadc72d3e546ad5f19dc55` |
| Initial verification record before this verdict-pass update | `fae34173ab4d1a9982508899a0d5b4f44ea2befc6eead9ae0abcb248bc172ba0` |

### Fresh checks

- Loaded the revised HTML from `http://127.0.0.1:4173/.agent/frontend-design/caphub-foundation/mockup.html` in Chromium.
- Selected and asserted `ready`, `selected`, `submitting`, `success`, `duplicate`, `disabled`, `oversize`, `invalid-type`, `service-error`, and `read-error` at `1440 × 1000` and true CSS `390 × 844`.
- For every state, asserted `body[data-state]`, URL query, visible state/receipt/alert text, submit label and disabled state, live-announcement text, active element, root widths, and mobile capture-control geometry.
- Directly verified `#state-announcement` is `aria-live="polite"` and `aria-atomic="true"` and receives a state-specific text mutation.
- Re-ran the Impeccable detector on the revised HTML. It returned only the same two font-ramp advisories at revised lines 269 and 1091; both remain verified false positives because `DESIGN.md` explicitly defines the display scale as `clamp(30px, 3vw, 44px)` with a 30px mobile minimum.
- Re-ran the prohibited-effects/value scan over the full HTML. `rg` returned exit 1 with zero matches for `fetch`, XHR, WebSocket, EventSource, beacon, `FormData`, `FileReader`, file-picker/file-input APIs, API paths, browser storage/cookies, environment/config access, absolute user paths, private-key markers, or token-shaped secrets.

### Ten-state verdict matrix

| State | 1440px | 390px | Key direct assertion | Result |
|---|---|---|---|---|
| Ready | No root overflow | No root overflow | Polite status: `Caphub is ready. Choose one supported image to begin.`; submit disabled | PASS |
| Selected | No root overflow | No root overflow | Polite status confirms selection; submit enabled; replacement/context controls enabled | PASS |
| Submitting | No root overflow | No root overflow | Polite status: `Receiving capture. Keep this page open.`; all intake controls disabled | PASS |
| Created / success | No root overflow | No root overflow | Polite status announces receipt and Human review; `document.activeElement === #receipt-title` | PASS |
| Duplicate | No root overflow | No root overflow | Polite status explicitly says existing receipt returned; focus is `#receipt-title` | PASS |
| Disabled | No root overflow | No root overflow | Visible `role="alert"`; every intake control disabled; no enable toggle | PASS |
| Oversize | No root overflow | No root overflow | Visible alert names 10 MiB and says no bytes staged; submit disabled | PASS |
| Invalid type | No root overflow | No root overflow | Visible alert lists PNG/JPEG/WebP and says no bytes staged; submit disabled | PASS |
| Service/storage error | No root overflow | No root overflow | Polite status plus `role="alert"`; focus is `#receipt-title`; no receipt; enabled `Retry same capture` action | PASS |
| Receipt read error | No root overflow | No root overflow | Polite status plus `role="alert"`; focus is `#receipt-title`; known Capture remains; retry-read action does not resubmit bytes | PASS |

### Focus and live-region assertions

| State | `#state-announcement` text observed | Active element after transition | Verdict |
|---|---|---|---|
| Submitting | `Receiving capture. Keep this page open.` | No receipt focus transfer required; controls are disabled and state remains textually available | PASS |
| Created / success | `Capture received. Human review is required.` | `H2#receipt-title` | PASS |
| Duplicate | `Duplicate detected. The existing Capture receipt was returned.` | `H2#receipt-title` | PASS |
| Service/storage error | `Capture was not received because storage is unavailable. Retry with the retained idempotency key.` | `H2#receipt-title` | PASS |
| Receipt read error | `Capture receipt metadata is temporarily unavailable. Retry the metadata read.` | `H2#receipt-title` | PASS |

The two original findings are therefore closed:

- **F-1 — RESOLVED.** The dedicated visually hidden, polite, atomic live region at revised line 1318 announces submitting, created, duplicate, service/storage-error, and read-error transitions with distinct text from the visible alert regions.
- **F-2 — RESOLVED.** `setState()` now schedules focus to `#receipt-title` for success and duplicate, and also for service/storage and receipt-read errors. Direct browser assertions observed the heading as `document.activeElement` after every required transition.

### Service/storage-error recovery

- The state reports `State Storage Error` and `STORAGE_UNAVAILABLE` without a raw response, path, object key, or secret.
- Copy says no receipt was returned and selected evidence has not crossed into immutable custody; it does not imply analysis or Human review started.
- Both visible recovery affordances are enabled and labeled `Retry same capture`; the error copy binds retry to the retained idempotency key and also permits stopping for operational inspection.
- At 390px the form retry control is `336 × 46` CSS pixels and the receipt-area retry control is `340 × 44`; neither is below the 44px capture-target floor.

### Responsive and side-effect results

- Across all ten states at 1440px: `innerWidth = documentElement.clientWidth = documentElement.scrollWidth = body.scrollWidth = 1440`.
- Across all ten states at 390px: `innerWidth = documentElement.clientWidth = documentElement.scrollWidth = body.scrollWidth = 390`.
- Mobile primary navigation remains an intentional internal scroll region (`clientWidth 390`, `scrollWidth 500`, `overflow-x: auto`) without creating root overflow.
- Every enabled Caphub capture/recovery control measured at least 44px in both dimensions where applicable; no small enabled capture target was found.
- The inline script still performs preview-only DOM/text/disabled-state updates, receipt-heading focus, URL `history.replaceState`, and form `preventDefault()`. No network, upload, filesystem, persistence, provider, analysis, approval, publication, or deployment effect exists.
- No filesystem path, config/secret value, raw object key, OCR/model output, score, Review Center, approval/publish/install control, delete/retention control, or production enablement switch is exposed.

### Final screenshot binding and visual inspection

| Screenshot | Pixel dimensions | SHA-256 |
|---|---:|---|
| `mockup-screens/caphub-ready-1440.png` | 1440 × 1269 | `9c3fbdf5201240e90a14dbed699924fdacfadf511f921b49d3684d80bc534ad8` |
| `mockup-screens/caphub-success-1440.png` | 1440 × 1547 | `e10d021ff4cb75619f9da99a1b7e18dd2ebe1b2e03eae5bc657243a9d4508d05` |
| `mockup-screens/caphub-service-error-1440.png` | 1440 × 1316 | `14dcd1a481537a63174f6bf203706c592f5d04e70f9d11b5bf4b5301f6d5f6da` |
| `mockup-screens/caphub-ready-390.png` | 780 × 3956, scale 2 | `d9f046b91d097ddf5c10ee80974fc43f50f20f33e37c7823a0adbe83d2a0d58b` |
| `mockup-screens/caphub-selected-390.png` | 780 × 3914, scale 2 | `b8e1eff53a37c13a76d3e0a77e7a566b8768c8f9702ece9aff3c1d0ec4ea9ad9` |
| `mockup-screens/caphub-success-390.png` | 780 × 4924, scale 2 | `15102dbe5794999ce301c3964802339a48858a7e7bbca7fba86c16b4d093920b` |
| `mockup-screens/caphub-disabled-390.png` | 780 × 4266, scale 2 | `fa2e78ff41c4a2fbec726fc00b46e88a49b315497edbb767e91342b3624c53fa` |

Independent visual inspection confirmed the final screenshots preserve the accession order, wrap metadata instead of clipping it, keep created and storage-error outcomes textually distinct, and show the immutable/Human-review boundary without prohibited capability controls. The 780px PNG widths are correct 2× captures of a 390px CSS viewport.

### Updated audit health

| Dimension | Score | Evidence summary |
|---|---:|---|
| Accessibility | 4 / 4 | Required async status messages and receipt/error focus are now directly verified; prior structure, labels, alerts, keyboard order, focus styling, and reduced-motion behavior remain intact. |
| Performance | 4 / 4 | Static bounded mockup with no data/network work or expensive rendering. |
| Responsive design | 4 / 4 | Ten states have zero root overflow at both widths and all Caphub mobile controls meet the target floor. |
| Theming | 4 / 4 | Paper Workbench tokens and approved light-only direction remain coherent. |
| Implementation integrity | 4 / 4 | Product-specific custody states, explicit service-error recovery, and no prohibited side effects or sensitive values. |
| **Total** | **20 / 20** | **Excellent for the P1-A standalone mockup scope.** |

Current severity count: **P0 0 · P1 0 · P2 0 · P3 0**.

### Final verdict

**PASS** for the revised mockup SHA-256 `e60e8ab1672b4bcc76eb33a69cdc83c41e61f4344feadc72d3e546ad5f19dc55` against Brief revision 1. F-1 and F-2 are resolved, all ten states pass at 1440px and true 390px, service/storage recovery is explicit and safe, final screenshots are hash-bound, and no live side effect or sensitive implementation value is present.

This independent verdict satisfies the Verification Agent evidence boundary only. Human Gate P1-A remains a decision for the Human Owner; it is not approved by this record.
