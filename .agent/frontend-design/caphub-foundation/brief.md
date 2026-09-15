# Caphub Foundation / Web Capture — T3 Brief

**Revision:** 1  
**Status:** Draft — awaiting independent design review, rendered verification, and Human Gate P1-A approval  
**Date:** 2026-09-14  
**Linear:** AGE-241  
**Architecture:** [`docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`](../../../docs/superpowers/specs/2026-09-13-caphub-kebab-design.md)  
**Implementation plan:** [`docs/superpowers/plans/2026-09-14-caphub-foundation.md`](../../../docs/superpowers/plans/2026-09-14-caphub-foundation.md)

## Start Card

```text
Workflow: 3.3
Task: Caphub P1 Foundation and Web Capture vertical slice — Human Gate P1-A
Role: Primary Agent
Tier / 理由: T3 — new /caphub page and API routes accept untrusted image bytes and create immutable local records
Canonical record: .agent/frontend-design/caphub-foundation/brief.md (revision 1)
Branch / worktree: codex/caphub-foundation · .worktrees/caphub-foundation
Mockup Gate: Required — new route, upload journey, responsive composition, permission/disabled states, and local write boundary
Review path: fresh-context independent Design Review plus independent rendered Verification before Human approval
Human checkpoints: P1-A approves this Brief and rendered mockup; P1-B approves independent security review; P1-C decides final release/P2 entry
```

## Decision boundary

This revision authorizes only a standalone, synthetic-data mockup and its review evidence. It does not authorize application-code implementation, real filesystem writes, production configuration, service restart, deployment, provider calls, analysis, approval, or publication.

Human Gate P1-A binds the approved result to this Brief revision and the rendered files recorded below. Any material change to scope, route behavior, data handling, responsive composition, or the local-write boundary reopens the Brief.

## Job, audience, and mode

- **Audience:** Joey, the single Human Owner, arriving from the AllJobs shell on a desktop or phone with one screenshot worth preserving.
- **Mode:** Operate. The page is a fast intake surface, not a dashboard, gallery, research console, or capability marketplace.
- **Job:** choose one PNG/JPEG/WebP image, optionally attach a source URL and note, submit it once, and receive a traceable Capture receipt.
- **Success:** within one viewport the owner understands what will be stored, what will not happen yet, whether the submission is new or a duplicate, and that Human review remains required.

## Product-specific truth

P1 accepts evidence but does not interpret it. A successful submit stores immutable bytes, strict metadata, and one audit event below the resolved Caphub state root. Every returned record stops at `received` with `human_review_required: true`. There is no OCR, model analysis, candidate scoring, approval, publishing, installation, code execution, Shell/Git access, or deployment surface.

## Selected direction

### Visual authority

Extend the approved **AllJobs Paper Workbench** without changing `DESIGN.md`: warm paper field, ink typography, hairline structure, one amber provenance/status strip, General Sans for human content, and IBM Plex Mono only for custody identifiers and machine state.

### Structural thesis

Use a single **accession lane** instead of a card dashboard. The desktop workbench places the evidence bay and context fields side by side, then turns the selected file into a full-width custody strip and finally a receipt ledger row. On mobile, the same reading order becomes one vertical lane: evidence → context → submit → receipt.

The focal moment is the custody handoff: the selected filename moves from the dashed evidence bay into a solid ink/amber accession strip whose copy explains that bytes become immutable and review remains Human-gated. Motion is a short opacity/position transition only; reduced-motion removes it.

The assigned surface-structure seed is `a0a79201`, grounded candidate 6. External challengers were rejected because their nixie, HyperCard, stage-light, alphabet-weather, Metro-tile, and telop grammars would reduce familiar upload clarity or violate the established Paper Workbench identity.

### Physical scene

The owner uses this in ordinary room light on a daily-work computer or phone while triaging evidence. The existing light paper surface remains the legible and context-consistent choice.

## Scope

### Included in P1-A mockup

- `/caphub` shell position and `Caphub` primary-nav item.
- One-image file selection/drop affordance with PNG/JPEG/WebP guidance and 10 MiB limit.
- Optional HTTPS source URL and note up to 4,000 characters.
- Ready, selected, submitting, created, duplicate, disabled, oversize, invalid-type, and receipt read-error states.
- Explicit immutable-storage and Human-review copy.
- 1440px desktop and 390px mobile compositions.
- Keyboard focus, visible labels, text-equivalent state, `aria-live` regions, 44px mobile targets, and reduced-motion behavior.

### Explicitly excluded

- Multi-image capture, ordering, split/merge, clipboard ingestion, camera integration, Telegram, upload history, search, bulk actions, or deletion.
- Image preview, arbitrary remote URL preview, OCR output, extracted claims, model progress, candidate scoring, Review Center, approval controls, publishing, installation, or runtime routing.
- Raw object keys, filesystem paths, secret/config values, mutable retention controls, or a production enablement toggle.
- Changes to the established AllJobs visual system, other routes, shared navigation items, or existing production services.

## State matrix

| State | Trigger / condition | Visible response | Recovery / next action |
|---|---|---|---|
| Ready / empty | Module enabled; no image selected | Evidence bay, accepted formats, 10 MiB limit, optional context fields; submit disabled | Choose or drop one supported image |
| Selected | Valid image chosen | Filename, MIME, size, immutable-storage explanation; submit enabled | Submit or choose a different file |
| Submitting | POST in flight | Controls disabled, stable layout, `Receiving capture…` live message | Wait; no second request is available |
| Created / success | API returns `201` | Capture ID, `received`, created time, filename, digest prefix, `Human review required` | Keep receipt visible; selecting a new file starts a new intake |
| Duplicate | API returns `200` for same key/payload | Existing Capture ID and explicit `Duplicate — existing receipt returned`; no false new-success claim | Keep receipt; selecting a different file generates a new key |
| Disabled / permission | `caphub.enabled !== true` or caller is not allowed | Amber/rust notice explaining capture is unavailable; all inputs and submit disabled | Configure/authorize on Control Host; no in-page enable switch |
| Oversize validation | Selected file exceeds configured maximum | Inline error names actual limit; file is not staged; submit disabled | Choose a smaller PNG/JPEG/WebP |
| Invalid type validation | Selected file MIME is unsupported | Inline error lists supported types; submit disabled | Choose PNG, JPEG, or WebP |
| Receipt read error | GET status cannot be read after a known receipt | Capture ID remains visible; error does not imply data loss | Retry metadata read with the same ID; never resubmit bytes automatically |
| Service/storage error | POST returns a safe typed error | Error code plus plain-language recovery; no path/secret/raw response | Retry with the retained idempotency key or stop and inspect operations |

Loading is represented by **Submitting**. Empty is **Ready**. Validation, disabled/permission, error, success, and duplicate are all first-class. There is no separate unauthenticated login state because Cloudflare Access remains outside the application; a foreign or missing Origin receives a bounded API rejection and the UI renders the generic permission state without revealing policy details.

## Interaction and layout

### Desktop — 1440px

1. Existing AllJobs header and primary navigation remain intact; `Caphub` sits between Monitoring and Register.
2. The amber status strip identifies `PATH /CAPHUB`, `CUSTODY NATIVE: LOCAL CAPTURE`, module state, and `SYNC N/A`.
3. A compact page introduction names the job and states the P1 boundary without a hero metric or marketing claim.
4. The main accession lane is a 7/5 split: evidence bay on the left, context fields and primary action on the right.
5. A full-width custody strip below the form explains immutable object storage, strict metadata, and mandatory Human review.
6. Created/duplicate/error receipts replace the explanatory lower region without moving the page title or controls.

### Mobile — 390px

- Header and nav follow the established horizontal navigation behavior; `Caphub` remains reachable without changing the shell.
- Status-strip facts wrap as short rows; no text or control causes horizontal overflow.
- Evidence bay, context fields, submit, custody strip, and receipt stack in that order.
- File metadata wraps rather than truncates; every interactive target is at least 44px high.
- The state-preview control is mockup-only and is not part of the production design.

### Feedback and motion

- File selection updates a polite live region. Validation errors and disabled explanations use `role="alert"` only when they appear.
- Submit focus remains stable while submitting. On completion, programmatic focus moves to the receipt heading.
- One short custody-strip reveal may use opacity plus a 4px position shift. `prefers-reduced-motion: reduce` removes all movement and preserves instant visibility.
- Status never relies on color alone: every state has a text label and geometric icon.

## API, caller, storage, and retention boundaries

- **POST:** exact `multipart/form-data` fields `image`, `idempotency_key`, `note`, and `source_url`; mandatory bounded `Content-Length`; exactly one image; PNG/JPEG/WebP only.
- **GET:** `/api/caphub/captures/[id]` returns validated metadata only. It never returns raw bytes, filesystem paths, object keys, or secret/config values.
- **Caller boundary:** the route is disabled unless `caphub.enabled === true`; POST requires an exact approved HTTPS Origin. Cloudflare Access, Tunnel, and the loopback-only `127.0.0.1` origin remain unchanged.
- **Storage boundary:** all P1 writes derive from the resolved `<ALLJOBS_HOME>/state/caphub` root. Callers cannot supply paths. Objects are SHA-256 addressed and never overwritten.
- **Retention:** original object bytes, Capture metadata, idempotency index, and audit event are retained indefinitely in P1. P1 exposes no delete or retention-setting control. Any future deletion/retention policy requires a separate plan and Human Gate.
- **Idempotency:** retries retain one key until a created/duplicate receipt or a different file selection. Same key plus different canonical payload returns `409 IDEMPOTENCY_CONFLICT`.

## Content ranges

- Filename: 1–255 characters; typical synthetic example `douyin-agent-workflow.png`.
- File size: greater than zero and no more than configured limit; mockup displays 4.8 MiB typical and 14.2 MiB oversize examples.
- Note: empty to 4,000 characters; typical two sentences; wraps without resizing the page horizontally.
- Source URL: empty or one HTTPS URL up to 2,048 characters.
- Capture ID: fixed `cap_` plus 32 lowercase hexadecimal characters.
- Digest presentation: show only a non-actionable prefix such as `8f2a91d3…`; never expose the object key.

## Acceptance criteria for Human Gate P1-A

- Every state in the matrix can be selected and inspected in the standalone mockup without live data or application code.
- Desktop 1440px and mobile 390px renders show no horizontal overflow and retain the same task order.
- A first-time owner can identify the primary action, accepted evidence, size boundary, storage consequence, and Human-review requirement within one viewport.
- Created and duplicate receipts are visibly and textually distinct; neither exposes absolute paths, secrets, raw object keys, OCR, or analysis claims.
- Disabled, oversize, invalid-type, and read-error states name a safe recovery action.
- Keyboard focus is visible, controls have labels, live feedback is semantic, contrast meets WCAG AA, and reduced-motion leaves all content available.
- Independent Design Review and rendered Verification records identify the reviewed Brief revision and exact mockup digest.

## Verification and rollback plan

- Render the standalone mockup through a loopback-only local server at 1440px and 390px.
- Exercise every selectable state, keyboard order, focus visibility, reduced-motion media behavior, and horizontal-overflow checks.
- Run an independent fresh-context design review against this Brief and the rendered screenshots.
- Store review and verification evidence under `.agent/frontend-design/caphub-foundation/`.
- P1-A rollback is deletion or Git revert of these non-production design artifacts only. No application or production state exists at this gate.

## Mockup Gate record

```text
Mockup Gate: Required
理由 / mockup revision / 预览方式: T3 new route and upload journey · revision 1 · standalone HTML via loopback-only server
桌面与移动端证据: pending render to mockup-screens/caphub-ready-1440.png and mockup-screens/caphub-ready-390.png
批准方向 / 需修改项 / 延后细节: pending independent review and Human Owner decision
Human Owner decision: PENDING
```

## Known planning clarification

The high-level roadmap still describes an earlier Web JSON/no-visible-UI variant and permits a `WAITING_FOR_REVIEW` ceiling. This P1 detailed plan and Brief use the later fixed contract: one multipart screenshot Capture through `/caphub`, ending only at `received`. The detailed P1 plan is authoritative for implementation; the roadmap wording should be reconciled as a documentation-only follow-up without expanding P1.

## Open decisions

No builder choice remains open for P1-A. Human Owner approval or requested revisions to the rendered Brief/mockup are the next decision. Production enablement, retention changes, analysis, and entry to P2 remain explicitly separate gates.
