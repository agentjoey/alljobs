# Caphub P1-A Independent Design Review

**Date:** 2026-09-15  
**Workflow:** Frontend Design Workflow 3.3  
**Tier / role:** T3 pre-implementation Mockup Gate / independent fresh-context Design Review Agent  
**Target:** `codex/caphub-foundation` worktree at base commit `59fd0e3cf750af39444476ae1a896aaf3e6bb869`; the reviewed design artifacts are uncommitted and are bound by the hashes below.  
**Current final disposition:** **PASS** — supersedes the initial `PASS WITH FIXES` only for the revised mockup and screenshot hashes recorded in the verdict pass dated 2026-09-15 below.

## Independence statement

I reviewed the authoritative Brief, rendered screenshots, standalone mockup, product/design system, and implementation plan from a fresh review context. I did not inherit or accept the builder's conclusions as evidence, and I did not modify `brief.md`, `mockup.html`, application code, or production state. I inspected all states exposed by the mockup in a loopback browser before running the mechanical detector.

This is a review finding, not Human Owner approval. Human Gate P1-A remains pending, and application-code implementation must remain blocked until the P1 findings below are fixed, recaptured, independently verified, and explicitly approved by the Human Owner.

## Exact reviewed artifacts

| Artifact | SHA-256 |
|---|---|
| `.agent/frontend-design/caphub-foundation/brief.md` revision 1 | `e694eae5615074afeb8802f7b55be556fd9d89dded847ac5eb77e147526cc5a8` |
| `.agent/frontend-design/caphub-foundation/mockup.html` | `d02c3f5a00bef46bc82b72e282806f611188f1e281e03db82ea004b947a397e0` |
| `mockup-screens/caphub-ready-1440.png` | `427e4d301046904e6b254c2a6a2de7d4b7f7c68d68aced9e5b283668909ba645` |
| `mockup-screens/caphub-ready-390.png` | `ff8183993e827f012053d43fbb1ce997c7b571054949977d5cf7df68c0fdb94c` |
| `mockup-screens/caphub-success-1440.png` | `a9bcb4ede3e04a0b753c45aaf0807e275ab4c545dc084c4dc34aab257fc2ed66` |
| `mockup-screens/caphub-disabled-390.png` | `4948e44de0e68c1952077578844a0a3e29eb1180ddf27c6ebcd8b9694f6447b2` |
| `PRODUCT.md` | `349f30f1589d2e1cadd372e979260cd77b68d53abf907539a542b702f4fd8fbb` |
| `DESIGN.md` | `698f5d39a87a270ad209e8a155caaabb356a190dc73a81857be541aac0e5e7ab` |
| `docs/superpowers/plans/2026-09-14-caphub-foundation.md` | `888744761f1b85e985d869559b6debe74efbf2eb1150fc4537bb2bb82ba3676d` |

Rendered evidence dimensions were 1440×1269, 780×4016 (390 CSS px at 2×), 1440×1391, and 780×4364 (390 CSS px at 2×), respectively.

## Review method

- Visually inspected all four supplied final screenshots before relying on the embedded direction summary.
- Read the complete Brief, mockup HTML/CSS/JS, PRODUCT, DESIGN, and P1 implementation plan.
- Inspected the nine states exposed by the mockup picker in a loopback browser: ready, selected, submitting, created, duplicate, disabled, oversize, invalid type, and receipt read error.
- Ran the Impeccable detector once after the unanchored design pass. It returned two advisory `design-system-font-size` findings at mockup lines 257 and 996. Both are false positives: `DESIGN.md` explicitly defines the display scale as `clamp(30px, 3vw, 44px)` and the mobile endpoint as 30px.
- Checked the principal foreground/background pairs; ink, muted ink, faint ink, amber, green, and rust combinations all measured above 4.5:1. This does not replace rendered accessibility verification.

## Design Quality Model

| Dimension | Verdict | Evidence |
|---|---|---|
| Usefulness | Partial | The single-image intake is obvious, but the service/storage error and post-receipt new-intake path are missing. |
| Clarity | Partial | The evidence-first thesis and negative capability boundary are clear; internal phrases such as “resolved Caphub state root” and the disabled-state enablement instruction are too implementation-facing. |
| Efficiency | Partial | Desktop provides a compact 7/5 intake lane. Mobile places the explicit Human-review consequence and submit path far below the shell and introductory material. |
| Consistency | Pass | Paper, ink, hairlines, amber provenance, typography roles, controls, and receipt ledger fit the established Paper Workbench. |
| Brand fit | Pass | The accession lane is specific to Caphub and avoids a generic dashboard/card wall. |
| Accessibility | Partial | Focus styling, labels, text-equivalent states, alerts, skip link, and reduced motion are present. The submitting message is not in a live region and the state simulation never transfers focus to the receipt heading. |
| Responsive robustness | Partial | No horizontal overflow is visible at 390px and content reflows coherently, but the mobile first-viewport acceptance criterion is not met. |
| Performance | Pass for mockup | Static HTML, restrained CSS motion, inline SVG geometry, and no heavy media or runtime dependency are appropriate. |
| Appropriate delight | Partial | The dark custody strip is a useful signature, but it does not perform the promised selected-filename custody handoff. |

## Findings

### P1 — The complete Brief state matrix is not inspectable

The Brief defines a first-class `Service/storage error` with a safe typed code and plain-language retry/operations recovery (`brief.md:91`), and requires every matrix state to be selectable (`brief.md:141`). The mockup picker and `states` object expose only nine states (`mockup.html:1155-1165`, `1399-1409`); no service/storage error surface exists.

**Required fix:** add a selectable service/storage error state showing a safe typed code, plain-language recovery, retained-idempotency retry semantics, and no raw response, secret, object key, or filesystem path.

### P1 — Created/duplicate receipts do not satisfy the receipt and restart contract

The created state requires Capture ID, `received`, created time, filename, digest prefix, and `Human review required`, followed by a path to select a new file (`brief.md:85`). The rendered receipt omits created time and filename (`mockup.html:1340-1345`), and `setState` disables `Choose different image` after success and duplicate (`mockup.html:1420-1422`). The duplicate state has the same dead end, contradicting `brief.md:86` and the idempotency lifecycle.

**Required fix:** include filename and created time in the created receipt, keep created and duplicate visually/textually distinct, and expose a clear `Receive another image` action that starts a new intake/key without weakening receipt persistence.

### P1 — The mobile first viewport does not meet the declared success criterion

The 390px render preserves order and avoids visible horizontal overflow, but the shell, search, navigation, status strip, introduction, and boundary card consume the first screen. The evidence action, submit path, and explicit `Human review required` custody strip appear substantially later. This contradicts the requirement that a first-time owner identify the primary action, accepted evidence/size, storage consequence, and Human-review requirement within one viewport (`brief.md:35`, `143`).

**Required fix:** recompose the mobile first task screen so the immediate image action plus concise immutable/Human-review consequence are visible in the first viewport, while preserving the established shell and evidence → context → submit → receipt order.

### P1 — Required live announcement and completion focus behavior are not represented

The Brief requires `Receiving capture…` as a live message and programmatic focus transfer to the receipt heading (`brief.md:84`, `116-118`). Independently inspecting the source and browser accessibility tree showed that only the selected-file and empty-receipt regions have `aria-live`; `#submit-label` and `#module-state` do not (`mockup.html:1201`, `1252`, `1302-1305`, `1323`). Although the receipt heading has `tabindex="-1"`, `setState` never focuses it (`mockup.html:1319`, `1411-1435`). Focus remains on the preview state picker when switching to success/duplicate.

**Required fix:** add a dedicated polite status live region for submitting/completion and make the mockup's completion simulation focus the receipt heading so the P1-A interaction contract can be inspected.

### P1 — The promised custody handoff is absent from the focal element

The selected direction says the selected filename moves from the dashed evidence bay into a full-width solid ink/amber accession strip (`brief.md:49-51`). In every state the filename remains in `.selected-file`, while `.custody-strip` is static, always visible, and contains no filename (`mockup.html:1252-1259`, `1309-1315`). The embedded THESIS/OWN-WORLD are present, but the intended signature transition is not.

**Required fix:** make the selected/submitting custody strip visibly carry the selected evidence identity and state, with an instant reduced-motion equivalent; do not add decorative choreography.

### P2 — Boundary copy implies internal path and production-enablement concepts

The UI does not expose an absolute filesystem path, secret, raw object key, OCR, model output, approval control, publication control, deletion control, or execution surface. Analysis, approval, publication, and deletion are consistently negated. However, “below the resolved Caphub state root” / “no delete path” (`mockup.html:1311-1313`) implies internal path structure, and the disabled notice tells an operator to enable the module and Origin in Control Host configuration (`mockup.html:1227-1229`). That copy is too close to implying a production enablement next step for a gate that authorizes no production configuration.

**Required fix:** use product-language such as “stored once in Caphub-managed local storage” and “P1 cannot delete captures”; state that capture remains unavailable until a separate Human-approved configuration/release gate, without presenting enablement as an in-page or P1-A recovery action.

## State and boundary verdict

| Contract area | Verdict |
|---|---|
| Ready / selected / oversize / invalid type / disabled | Represented; selected is partial because the custody handoff is absent. |
| Submitting | Visually represented; semantic live announcement missing. |
| Created / duplicate | Visually distinct; receipt facts and new-intake recovery incomplete. |
| Receipt read error | Represented with a retained, abbreviated Capture ID and safe metadata-only retry. |
| Service/storage error | Missing. |
| Analysis / OCR / model action | Absent; only explicit negative/future-boundary copy appears. |
| Approval / publication / installation / execution | No action or result is implied for P1; Human review remains a requirement, not an approval control. |
| Deletion | No control exists; copy explicitly says P1 cannot delete, though “delete path” should be rewritten. |
| Production enablement | No toggle exists, but the disabled recovery copy improperly suggests configuration enablement without naming the separate gate. |
| Filesystem paths / secrets / raw object keys | No values are exposed. The route `/Caphub` is intentional; generic “state root” wording should be removed from user-facing copy. |

## Embedded direction contract verdict

| Promise | Verdict |
|---|---|
| THESIS | Match: one accession lane, not a dashboard or marketplace. |
| OWN-WORLD | Match: Paper Workbench color, type roles, hairlines, amber status, and flat material language. |
| STORY | Partial: choose/context/received states exist, but the complete error/restart journey does not. |
| FIRST VIEWPORT | Desktop match; mobile contradiction against the Brief's within-one-viewport success criterion. |
| FORM | Match: the embedded seed is `a0a79201`, candidate 6, consistent with Brief revision 1. |
| TYPE | Acceptable for the reviewed host render; production must continue using the established AllJobs font loading rather than relying on local fallback availability. |
| MATERIAL | Match: the flat paper/hairline/hatch treatment is native to the established visual world; no unapproved photographic or imitation material was added. |

**Contract verdict:** **FIX**. The visual world and structural direction should be retained, but the missing state, incomplete receipt/restart journey, mobile first-viewport failure, absent semantic feedback/focus transfer, and missing focal custody handoff are material P1-A gaps.

## Final disposition

**PASS WITH FIXES** — the direction is useful, coherent, efficient on desktop, responsive without visible horizontal overflow, visually consistent with AllJobs, performant, and appropriately restrained. It is not ready for Human Gate P1-A approval at the reviewed hashes. Fix every P1 finding, update the mockup hash, recapture the affected desktop/mobile states from the corrected artifact, and run fresh independent Design Review and rendered Verification. Do not begin application implementation or production enablement on the basis of this disposition.

---

## Focused verdict pass — 2026-09-15

### Revised target

This verdict pass is limited to scoring the six prior finding groups against the revised artifact and recaptures. It does not reopen the design review or approve on behalf of the Human Owner.

| Artifact | SHA-256 |
|---|---|
| `.agent/frontend-design/caphub-foundation/mockup.html` | `e60e8ab1672b4bcc76eb33a69cdc83c41e61f4344feadc72d3e546ad5f19dc55` |
| `.agent/frontend-design/caphub-foundation/brief.md` revision 1 (unchanged) | `e694eae5615074afeb8802f7b55be556fd9d89dded847ac5eb77e147526cc5a8` |
| `mockup-screens/caphub-ready-1440.png` | `9c3fbdf5201240e90a14dbed699924fdacfadf511f921b49d3684d80bc534ad8` |
| `mockup-screens/caphub-ready-390.png` | `d9f046b91d097ddf5c10ee80974fc43f50f20f33e37c7823a0adbe83d2a0d58b` |
| `mockup-screens/caphub-selected-390.png` | `b8e1eff53a37c13a76d3e0a77e7a566b8768c8f9702ece9aff3c1d0ec4ea9ad9` |
| `mockup-screens/caphub-success-1440.png` | `e10d021ff4cb75619f9da99a1b7e18dd2ebe1b2e03eae5bc657243a9d4508d05` |
| `mockup-screens/caphub-success-390.png` | `15102dbe5794999ce301c3964802339a48858a7e7bbca7fba86c16b4d093920b` |
| `mockup-screens/caphub-disabled-390.png` | `fa2e78ff41c4a2fbec726fc00b46e88a49b315497edbb767e91342b3624c53fa` |
| `mockup-screens/caphub-service-error-1440.png` | `14dcd1a481537a63174f6bf203706c592f5d04e70f9d11b5bf4b5301f6d5f6da` |

### Verdict

- **Resolved — service/storage state.** `Service / storage error` is selectable, rendered at 1440px, names `STORAGE_UNAVAILABLE`, states that no receipt was returned, offers `Retry same capture`, and explains that the retained idempotency key is reused without exposing a path, secret, raw response, or object key (`mockup.html:1273`, `1490-1496`, `1541`, `1554`).
- **Resolved — receipt filename, created time, and new-intake path.** Created and duplicate receipts now include filename and a semantic timestamp, retain their distinct `Created` / `Existing` meanings, and expose `Receive another image`; the desktop and 390px success recaptures visibly show the repaired receipt and action (`mockup.html:1454-1462`, `1479-1487`).
- **Resolved — mobile first viewport.** The 390px ready recapture now brings the accepted types/size, `Immutable · Human review required` promise, and `Choose image` action into the first task screen. The selected 390px recapture preserves the task order and makes the submit action and custody consequence explicit without horizontal overflow (`mockup.html:1344-1363`).
- **Resolved — live announcements and focus transfer.** A dedicated atomic polite live region receives explicit announcements for every state, including submitting and completion; success, duplicate, read-error, and service-error transitions move focus to the focusable receipt heading (`mockup.html:1318`, `1433`, `1526-1527`, `1545-1555`, `1579`, `1600-1602`). This resolution is independently established from the revised source, not inherited from the verification agent's conclusion.
- **Resolved — custody filename handoff.** Selected, submitting, received, duplicate, read-error, and service-error states expose the selected filename in the full-width ink/amber custody strip; the selected and success recaptures visibly show the identity and state-specific custody copy (`mockup.html:1422-1428`, `1581-1598`). Reduced-motion handling remains intact.
- **Resolved — safer disabled/storage copy.** The disabled recapture and source explicitly keep capture unavailable until a separate Human-approved configuration and release gate. User-facing custody copy now says Caphub stores the evidence once and `P1 cannot delete captures`, with no resolved-root/path language (`mockup.html:1339-1340`, `1424-1426`, `1593-1595`). No analysis, approval, publication, deletion, production-enable control, filesystem path, secret, or raw object key is implied as a P1 capability.

### Remaining

Clear. No prior P1 or P2 finding remains partial or unresolved, and the focused fix batch introduces no material regression in the supplied recaptures. The initial detector advisories remain documented false positives and were not rerun during this verdict pass, as required by the finish-review protocol.

### Final contract verdict

- **THESIS:** held — one evidence accession lane, no dashboard or marketplace drift.
- **OWN-WORLD:** held — Paper Workbench material, typography roles, hairlines, amber provenance, and restrained motion remain intact.
- **STORY:** held — choose, context, custody, receipt, duplicate/retry, error, and new-intake outcomes are now represented.
- **FIRST VIEWPORT:** held in the supplied desktop and 390px evidence; the mobile promise/action repair is visible without changing the established shell.
- **FORM:** held — candidate 6 and seed `a0a79201` remain present.
- **TYPE / MATERIAL:** held — no fidelity regression is visible in the revised recaptures.

**Impeccable contract disposition:** `ship`.

## Final disposition after verdict pass

**PASS** — the revised mockup at SHA-256 `e60e8ab1672b4bcc76eb33a69cdc83c41e61f4344feadc72d3e546ad5f19dc55` resolves every prior material design finding. This independent design result permits the artifact to proceed to the remaining P1-A rendered-verification and explicit Human Owner decision; it is not itself Human approval and does not authorize application implementation, production configuration, deployment, or enablement.
