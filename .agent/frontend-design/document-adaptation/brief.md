# Document adaptation and degradation — T2 Brief

**Revision:** 1  
**Status:** Draft mockup — pending independent review and Human Owner approval  
**Date:** 2026-08-30  
**Authoritative design:** `docs/superpowers/specs/2026-08-30-alljobs-document-adaptation-design.md`

## Start Card

```text
Workflow: 3.3
Task: Document adaptation and degradation
Role: Primary Agent
Tier / 理由: T2 — existing Project and Project List surfaces gain reusable, user-visible source-health states and copy interaction.
Canonical record: .agent/frontend-design/document-adaptation/brief.md
Branch / worktree: codex/document-adaptation · .worktrees/document-adaptation
Mockup Gate: Conditional-created — source health, candidate evidence, and handoff hierarchy change the Project information flow.
Review path: independent Review and Verification agent/session, or Review Packet and Human Owner pause.
Human checkpoints: rendered mockup direction; final build and release decision.
```

## Job, outcome, and selected direction

The owner reaches a code-project detail view when a fixed planning document is healthy, incomplete, ordinary Markdown, missing, or unavailable. The surface must explain what AllJobs actually read and what remains authoritative without turning inferred headings into planning records.

- **Mode:** Operate. The owner must identify source health, verify evidence, and copy a bounded repository-agent handoff.
- **Outcome:** canonical documents retain the normal Roadmap/Backlog counts; every other state names the exact file, source mode, diagnostic, and safe next action.
- **Direction:** extend the approved Paper Workbench with a single-column ruled document ledger. Canonical content keeps normal planning affordances; candidate evidence uses a hatched evidence sheet with no item ID, priority, rank, drag, create, or apply control.
- **Signature choice:** the amber provenance strip remains the first source-of-truth signal, while document health is expressed through text plus small geometric markers rather than a new dashboard layer.
- **Boundary:** this is a standalone rendered mockup only. It does not change strict parsers, production components, repository files, services, or deployment.

## Source-of-truth rule

Only strict-parser `canonical` output may enter counts, active-phase selection, relations, ordering, mutation controls, or agent queues. Recoverable and unstructured candidates are source evidence only. A readable invalid local file is never replaced by an older remote or cached projection to make the UI look healthy.

## State matrix

| State | Provenance shown | Planning presentation | Available action | Explicitly withheld |
| --- | --- | --- | --- | --- |
| Canonical local clean | Local working tree · clean; fixed path; revision and digest | Small `Canonical` marker and normal Roadmap/Backlog counts | Existing read behavior | No new adaptation control |
| Canonical local modified | Local working tree · modified; local digest | Canonical data remains visible with modified-source context | Existing read behavior only | No fallback to Git HEAD |
| Recoverable, one malformed section | Exact parser issue, line, evidence, missing fields | Healthy canonical sections remain authoritative; one ruled `Candidate section` | Copy repository-agent handoff | Candidate has no ID, priority, rank, drag, create, or apply |
| Unstructured Markdown | Readable file, outline lines, digest | Outline-only candidates marked `Not canonical planning data` | Copy standardization handoff | No guessed Backlog or Roadmap objects |
| Missing Backlog | `docs/BACKLOG.md` expected path and selected source mode | `Missing document`, never `Backlog 0` | Copy creation handoff | No empty-count disguise or file creation |
| Missing Roadmap | `docs/ROADMAP.md` expected path and selected source mode | `Missing document`, never `Roadmap 0` | Copy creation handoff | No inferred phase model |
| Unsafe/non-regular local file | Rejected path type and fixed path | Source blocked as unavailable evidence | Copy safety guidance | No read-through, remote fallback, or mutation |
| Remote commit read-only | Remote commit, revision, digest, `READ ONLY` | Canonical or degraded evidence from that exact revision | Copy handoff when degraded | No write, drag, rank, priority, or apply |
| Cached stale read-only | Cache snapshot, last-read time, digest, `READ ONLY` and `STALE` | Last known evidence with stale label | Refresh guidance or copy handoff | No claim that cache is current |
| Unavailable source | Local/remote/cache failures and last-known projection when present | Explicit unavailable state | Read-only refresh guidance | No inferred document content |
| Clipboard unavailable | Same selected evidence plus copy failure | Handoff text opens in a selectable text well | Manual select-and-copy | No success claim |
| 390px layout | Same facts reflowed; no fact is dropped | One-column header, provenance, state control, evidence, and handoff | 44px controls and visible keyboard focus | No clipped table or horizontal page scroll |

## Interaction and responsive contract

- A clearly labeled mockup-state selector switches among all matrix states without implying production capability.
- Source mode, fixed path, revision/digest, freshness, and read-only status remain visible in the amber strip and document header.
- Copy feedback uses a polite live region. Clipboard failure reveals the complete handoff text for keyboard selection.
- Desktop, 900px, and true 390px layouts keep one reading column. Metadata wraps into stacked definition rows before it clips.
- Motion is limited to a short evidence-sheet entrance and is disabled under `prefers-reduced-motion`; content is visible before motion runs.

## Acceptance boundary

The rendered revision must visibly distinguish canonical planning data from candidate evidence, cover every matrix state, preserve keyboard access to the copy action, and show no degraded mutation controls. Passing these checks prepares the Human Mockup Gate; it does not approve it.

## Mockup Gate record

- **Decision:** Conditional-created.
- **Mockup revision:** 2 (I-1 evidence-preserving handoff correction).
- **Preview:** local static server at `http://127.0.0.1:4173`.
- **Evidence:** `screenshots/desktop-1440.png`, `screenshots/mid-900.png`, `screenshots/mobile-390.png`.
- **Human Owner decision:** **PENDING — revision 2 is not approved.**
