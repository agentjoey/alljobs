# Caphub Review Center + Registry — Independent Rendered Verification

**Current verdict:** PASS — targeted revision 2 rerun recorded below
**Initial verdict:** FAIL — superseded by the targeted revision 2 rerun
**Date:** 2026-09-16
**Role:** Independent Verification Agent / focused fresh-context pass
**Tier:** T3
**Brief:** revision 2 (initial report below evaluated revision 1)
**Scope:** standalone `brief.md`, `mockup.html`, and the six files in `mockup-screens/`; no P1/P2 implementation or repository-wide test review

## Independence and boundary

This pass derived its checks from the approved Brief, inspected all six supplied screenshots, and then rendered the bound standalone HTML directly in local headless Chromium. It did not treat the screenshots or another agent's prose as sufficient proof. No application code, live Registry, provider, network, database, production service, or P1/P2 surface was exercised. Only this verification record was added.

## Artifact binding

| Artifact | SHA-256 | Dimensions |
|---|---|---:|
| `brief.md` | `45019c80165a2f52fa787cfbaf54b96114aa687d3aeac5928f52ea7718b361a6` | — |
| `mockup.html` | `bbd477664add50cad8175e70bb395ff93af1a951bbff18193518d6faff0f0d58` | — |
| `mockup-screens/reviews-waiting-1440.png` | `8cfdf9681882950929ef8ab73b83cad3763f79f43cf39bbb3d4f1c630f1b6169` | 1440 × 1277 |
| `mockup-screens/reviews-waiting-390.png` | `b09e0c4c8885699d5cdc5f700c32c3ea159f7da5c253b2e3cb637942e5599ade` | 780 × 6318 (390 CSS px at 2×) |
| `mockup-screens/reviews-approved-1440.png` | `2d257b5aba64fdb505bcc2d913de7153d2a37a5cebd58fb1777476dc584cd1ee` | 1440 × 1277 |
| `mockup-screens/reviews-stale-390.png` | `cf8ad9b9ae0869f5e4884a8be21f38252baacb08f8fb9774746fd4e39a520d70` | 780 × 5266 (390 CSS px at 2×) |
| `mockup-screens/capture-lineage-1440.png` | `03eec48d11751c82c276371030c2c63da73ac158c69a24e33dd7bfa09e2e611c` | 1440 × 997 |
| `mockup-screens/capability-candidate-390.png` | `2d5aef42f52d48af1dea5274be9846d1e6bb9d5a92778fa582fd552caeb45fec` | 780 × 2574 (390 CSS px at 2×) |

The 780px physical widths are correct 2× captures of a true 390px CSS viewport.

## Reproducible verification

- Rendered selector states `waiting`, `approved`, `stale`, `empty`, `disabled`, `capture`, and `capability` at CSS widths 1440 and 390: 14 state/viewport combinations.
- In every combination, `documentElement.clientWidth === documentElement.scrollWidth` and `body.clientWidth === body.scrollWidth`: 1440/1440 on desktop and 390/390 on mobile. No root horizontal overflow was observed.
- At 390px, waiting-state geometry was: Docket `y=579`, Evidence `y=956`, Diff `y=2119`, Decision `y=2345`. This verifies docket → evidence → diff → decision reading order. At 1440px, the principal columns began at `x=25`, `x=373`, and `x=952`, preserving the intended left-to-right folio.
- The current `Reviews` navigation item was visible and `aria-current="page"` at both widths. At 390px it occupied `x=231..306` within the viewport after the intentional internal navigation scroll.
- In waiting state, the version lock and consequence preceded every disposition control at both widths. At 390px their top positions were `2416` and `2490`; controls began at `2562`.
- Inspected all six supplied PNGs plus temporary local renders for the disabled and global-empty states. Approval, stale, safe-off, Capture, and Candidate-only outcomes are text-first and do not rely on color alone.
- Static sensitive-value scan found no absolute user path, connection string, credential/token, API key, prompt, chain-of-thought, raw provider response, or exposed object key. The apparent `sk-c` match is the harmless substring in `task-context`, not a token.
- Ran the Impeccable detector once. Its decorative-grid advisory is a false positive against the established Paper Workbench radial dot field; the font-size advisories are presentation-system notes and do not explain or supersede the findings below.

## Focused state results

| Promised mockup state | Rendered evidence | Result |
|---|---|---|
| Reviews — waiting | Docket, dossier, exact version number, Diff, unresolved question, decision consequence, confirmation copy, permanent-reject and unconsumed-only-revocation copy | FAIL — F-1 |
| Reviews — approved | Immutable-looking receipt, actor, Candidate v1, decision ID, and explicit no-release/no-implementation/no-Git/no-deployment consequence | FAIL — F-1 |
| Reviews — stale conflict | Entered-rationale preservation stated; Candidate v1 / lock 3 and version 2 named; zero-write consequence stated; controls removed | PASS |
| Reviews — globally empty | P2-import origin and no-create/no-publish consequence present | FAIL — F-3 |
| Registry — disabled | Safe-off notice, Control Host recovery, no browser enablement, no secret/URL/role/migration detail | PASS |
| Capture — complete lineage | Capture → ReviewPacket → Registry import → waiting Human review path is visible; raw key/path are explicitly withheld | FAIL — F-2 |
| Capability — Candidate only | Candidate status plus explicit `No BuildProposal`, `No Release`, and `No Deployment or Usage` empty states | PASS |

## Findings by severity

### F-1 — BLOCKER: the decision boundary does not expose the exact digest

**Location:** `mockup.html` lines 291 and 293; Brief lines 120 and 142
**Evidence:** waiting shows `sha256:39f2a12b6df4…082c`; the approved receipt shows `39f2a12b…082c`. The full digest does not exist elsewhere in the HTML, and neither value has a full-value accessible name, title, disclosure, or copy control.
**Impact:** the Human Owner cannot verify or recover the immutable digest actually bound to the decision. This directly fails the Brief requirement that the exact version/digest be visible before decision controls and that visually abbreviated digests retain their full value for assistive technology and copying. The approval receipt inherits the same ambiguity.
**Required correction:** bind one complete synthetic digest and make it available before the controls and in the receipt. It may remain visually abbreviated on narrow screens, but the full value must be programmatically available and copyable; the waiting lock and terminal receipt must agree exactly. Then rebind the mockup hash and rerun both widths.

### F-2 — HIGH: “Capture — complete lineage” omits promised model metadata and decision status

**Location:** `mockup.html` lines 299–302; Brief line 86
**Evidence:** the complete-lineage view shows source summary, OCR/entity output, and four lineage nodes, but no safe model-call metadata and no explicit decision collection/status section. The final node says only `Waiting for Human review`.
**Impact:** the state is labeled complete while omitting two fields explicitly promised by the Capture-complete matrix (`model metadata`, `decisions`). That prevents a reviewer from distinguishing “not present yet” from “not rendered” without guessing, and weakens lineage completeness while the UI simultaneously claims provider internals are withheld.
**Required correction:** show bounded non-reasoning model-call metadata (for example model/provider label, status, timestamp, and safe request/run ID) and an explicit decision status/empty state. Do not add prompts, chain-of-thought, raw responses, secrets, or storage/connection details.

### F-3 — MEDIUM: the “globally empty” preview reads as a filtered Waiting result

**Location:** `mockup.html` lines 297 and 341–345; Brief lines 73–74
**Evidence:** the selector names the state `Reviews — globally empty`, but the active `Waiting` filter remains visible and the headings say `Nothing is waiting for a decision` / `No reviews are waiting`.
**Impact:** this can mean terminal requests exist but none are waiting, which is the filtered-empty interpretation, not the Brief's global-empty condition (`No requests exist`). The two conditions have different recovery: clear filters versus return later.
**Required correction:** make the global-empty copy explicitly say that no review requests exist and visually neutralize or contextualize filters. If filtered empty is also demonstrated later, keep its `No reviews match` and clear-filter recovery distinct.

Severity count: **Blocker 1 · High 1 · Medium 1 · Low 0**.

## Positive findings to preserve

- The 3/5/4 desktop folio and mobile vertical recomposition are stable, readable, and free of root overflow.
- `Reviews` is visibly current immediately after `Caphub` in DOM/navigation order at both widths.
- Waiting, approved, stale, disabled, Capture, and Candidate-only states use explicit text for status and consequence; approval and stale cannot reasonably be mistaken for release, publication, Builder execution, Git write, or deployment.
- Candidate-only later-phase absence is honest and specific rather than expressed as disabled fake controls.
- Disabled and Capture views withhold secret/connection/storage internals; no raw path, raw object key, prompt, provider reasoning, or credential value is rendered.

## Final verdict

**FAIL.** Responsive order, navigation visibility, text-first semantics, consequence copy, Candidate-only empty states, sensitive-value boundaries, and zero root horizontal overflow pass. The exact-digest failure is a blocker for the immutable Human-decision boundary, and the Capture-complete and global-empty previews do not yet match their promised state semantics. Brief revision 1 requires no blocker/high/medium issue before implementation begins, so this artifact cannot receive a PASS until F-1 through F-3 are corrected, rebound, and independently reverified.

This record verifies the standalone mockup only. It does not authorize implementation, PostgreSQL configuration, credentials, service changes, deployment, push, merge, tag, release, or any P3-D Human Gate.

---

## Targeted revision 2 rerun — F1 through F3 only

**Date:** 2026-09-16
**Scope:** only the three findings from the initial report; no global redesign audit, P1/P2 review, full-repository test run, or new issue search
**Result:** PASS — F1, F2, and F3 are resolved; unresolved count is zero

### Revised artifact binding

| Artifact | SHA-256 | Dimensions |
|---|---|---:|
| `brief.md` revision 2 | `7f0dba3337ff47a9b3be94db0a86e62884040c1f02c21f09bfe131fe7cb32c55` | — |
| `mockup.html` | `08369b5873dd28a63fbef2e16414d120b7d2ad3d48398e2f86141eb7669947c2` | — |
| `mockup-screens/reviews-waiting-1440.png` | `b35a22f74a3faf38e8fe89ce433537d6bd0741f06f0fd136636075acdcfb5758` | 1440 × 1708 |
| `mockup-screens/reviews-waiting-390.png` | `10bd27c2e99dd9680317e3a65955da5c63626a0b471c25cf798f9a78743da5d1` | 780 × 7738 (390 CSS px at 2×) |
| `mockup-screens/reviews-approved-1440.png` | `2958fd86b8ec8e7fb51f838d2b8ff4099aba2c2365656713ac5bce6a1384e788` | 1440 × 1708 |
| `mockup-screens/reviews-consumed-390.png` | `9929b3b5628b0d8ee4f69bad4cfde1eb19b30b758815e8ed2bc36b3454240ee0` | 780 × 6724 (390 CSS px at 2×) |
| `mockup-screens/reviews-revoked-1440.png` | `215755c1a24e9505673e817c60c57f5fcf188e8be39241ab969a5940a7e3b8da` | 1440 × 1708 |
| `mockup-screens/reviews-stale-390.png` | `b0059088f21de03ce633cb31545b378618665eace9547ee31ca9baeb8e87fb80` | 780 × 6568 (390 CSS px at 2×) |
| `mockup-screens/reviews-superseded-390.png` | `e5ae80c1281bef228b235311c2186e91e81306b4486d17de5fd0ce83d8e341b6` | 780 × 6556 (390 CSS px at 2×) |
| `mockup-screens/capture-lineage-1440.png` | `8181675aa9973f454e1125171eb4b1bb4de867707903e3ab1e58211281722bce` | 1440 × 1011 |
| `mockup-screens/capability-candidate-390.png` | `45615b8aa79a534e9ceb94ee35add2bcae8040e79dc65af8759599f31f534e03` | 780 × 2980 (390 CSS px at 2×) |

The final Brief hash change is binding management only: its Status line now records focused independent Review and Verification PASS. No content contract, mockup, screenshot, or verification conclusion changed, so no rerun was performed.

### Targeted method

- Inspected the revised waiting-mobile, approved-desktop, and Capture-desktop screenshots against the corresponding DOM.
- Rendered only `waiting`, `approved`, `capture`, and `empty` at CSS widths 1440 and true 390: eight targeted state/viewport probes.
- At each probe, rechecked root width only as a guard for the repaired content. Every result remained exact: `clientWidth === scrollWidth` at 1440 and 390.
- For F1, extracted every visible `.digest-value`, asserted `/^[0-9a-f]{64}$/`, exact string equality, computed `user-select: all`, complete DOM Range selection, and waiting-state geometry before `.choice-grid`.
- For F2, asserted the ordered source/OCR/Claim section, bounded provider/model/status/call metadata, explicit `prompts and reasoning withheld`, and `Decision status: waiting` plus `no decision yet` at both widths.
- For F3, asserted `No review requests exist`, `No filter is active`, hidden `.filters`, and zero visible active filters at both widths. The final controller also rendered the distinct `filtered-empty` selector state with `No reviews match these filters` and clear-filter recovery.
- Per the directed rerun boundary, the existing controller evidence was retained rather than repeated: 17 selector states × 2 widths = 34 state/viewport checks with `bad=[]`, five states at 200% zoom, and all enabled mobile controls at least 44 CSS pixels. This targeted verdict does not independently expand those claims beyond their existing controller record.
- After the residual design repair changed the bound artifacts, a five-case render guard rechecked waiting at 390, approved at 1440, Capture at 390, filtered empty at 390, and global empty at 390. The exact digest, bounded Capture metadata/decision status, and distinct empty-state semantics all remained present; every guard also had `documentElement.clientWidth === documentElement.scrollWidth`. The 34-case controller result remains `bad=[]`; the full matrix was not rerun in this focused update.

### Finding closure

#### F-1 — RESOLVED: exact digest is present before controls and in receipts

- Waiting at both widths exposes exactly `39f2a12b6df4f53b40c977a64f74ab120631d112c833ab637b51d08822ea082c`: 64 lowercase hexadecimal characters, labeled `Full subject SHA-256 digest`.
- The same complete value appears in the approved receipt at both widths. The waiting and receipt values match byte-for-byte.
- `.digest-value` computes to `user-select: all`; a DOM Range selected the complete 64-character value in all four F1 probes, demonstrating copyable text rather than a visual-only prefix.
- In waiting state, the complete digest's version-lock block precedes the disposition controls at both widths. The revised screenshots also show the full value wrapping rather than clipping.

#### F-2 — RESOLVED: Capture complete includes bounded metadata and explicit decision status

- The Capture view presents ordered `Source 1 → OCR → Entity → Claim` evidence before the safe model-call section.
- Safe metadata is bounded to provider label, model label, succeeded status, safe call ID, and timestamp. The UI explicitly withholds prompts and reasoning; no raw provider response, secret, or storage locator is shown.
- The lineage timeline now names `Analysis job completed`, `ReviewPacket v1 composed`, Registry import, and `Decision status: waiting`, followed by `no decision yet`. This distinguishes an empty decision collection from missing UI.
- These assertions passed at both 1440 and 390; the updated 1440 Capture screenshot visually confirms the same hierarchy.

#### F-3 — RESOLVED: global empty is unfiltered and semantically distinct

- The global-empty heading is now `No review requests exist`, and its copy states `No filter is active` plus the P2-import/no-manual-create consequence.
- All review filters are hidden in the rendered global-empty state; the number of visible active filter controls was zero at both widths.
- The final mockup renders both conditions as distinct selector states: `filtered-empty` means active filters match no request, shows `No reviews match these filters`, and offers clear-filter recovery; global empty means no requests exist, has no active filter, and offers return-later recovery. The 17-state × 2-width controller matrix rendered both with `bad=[]`.

### Targeted final verdict

**PASS** for revision 2 Brief SHA-256 `7f0dba3337ff47a9b3be94db0a86e62884040c1f02c21f09bfe131fe7cb32c55` and mockup SHA-256 `08369b5873dd28a63fbef2e16414d120b7d2ad3d48398e2f86141eb7669947c2` within this F1–F3 rerun boundary. All three original findings are resolved; **Blocker 0 · High 0 · Medium 0 · Low 0** remain from the initial report.

This PASS is the focused independent mockup-verification result only. It does not re-audit unrelated revision 2 changes and does not authorize implementation, PostgreSQL configuration, credentials, production enablement, deployment, push, merge, tag, release, or the P3-D Human Gate.
