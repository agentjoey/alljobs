# Document adaptation mockup — Independent Review Packet

## Dispatch record

- **Task / Brief:** Document adaptation and degradation · `.agent/frontend-design/document-adaptation/brief.md`
- **Brief revision:** 1
- **Tier:** T2 — reusable user-visible source-health states and copy interaction on existing Project surfaces
- **Reviewer role:** independent Review and Verification agent/session; reviewer must not inherit the Primary Agent's conclusions
- **Mockup revision:** 1 · **Human status: pending, not approved**
- **Target branch/worktree:** `codex/document-adaptation` · `.worktrees/document-adaptation`
- **Target commit/build:** Task 0 mockup commit; standalone static preview, not production code
- **Result write-back:** append the independent result to this packet and update `handoff.md`; do not mark Human approval

## Authoritative inputs

1. `docs/superpowers/specs/2026-08-30-alljobs-document-adaptation-design.md`
2. `.agent/frontend-design/document-adaptation/brief.md` revision 1
3. `DESIGN.md` — approved Paper Workbench visual system
4. `/Users/xtation/AgentWorks/Tools/FRONTEND-DESIGN-WORKFLOW.md` version 3.3
5. Mockup files under `.agent/frontend-design/document-adaptation/mockup/`

## Source-of-truth rule

Only strict-parser `canonical` output may participate in Roadmap/Backlog counts, active-phase selection, relations, ordering, mutation controls, or agent queues. Recoverable/unstructured candidates remain evidence, and a readable invalid local document must not fall back to an older remote/cache copy.

## State matrix to verify

- canonical local clean;
- canonical local modified;
- recoverable with one malformed section;
- unstructured Markdown;
- missing Backlog;
- missing Roadmap;
- unsafe/non-regular local file;
- remote commit read-only;
- cached stale read-only;
- unavailable source;
- clipboard unavailable; and
- true 390px layout.

The mockup state selector must render every state. The selected default (`Recoverable · malformed section`) is the densest evidence view used for responsive screenshots.

## Acceptance and risk checks

- Candidate headings are visibly source evidence, not Backlog cards or Roadmap phases.
- No degraded state exposes item ID assignment, priority, rank, drag, create, apply, write, agent-start, commit, push, or merge controls.
- Missing files name the expected fixed path and never masquerade as a zero-item canonical document.
- Remote/cache source mode and `READ ONLY` remain visible; cache also shows `STALE`.
- Exact parser issue, line, evidence, and missing fields are available in the recoverable state.
- Clipboard failure reveals a complete selectable handoff without claiming success.
- Amber provenance, current header, typography, tokens, and single-column Paper Workbench rhythm remain consistent.
- Keyboard focus is visible; state selector and copy handoff are reachable; copy feedback is announced.
- Desktop, 900px, and 390px layouts have no horizontal page clipping and retain all provenance facts.
- Synthetic demonstration content is labeled and no secret or real credential appears.

## Evidence and preview

- Preview: `python3 -m http.server 4173 --bind 127.0.0.1 --directory .agent/frontend-design/document-adaptation/mockup`
- Desktop: `.agent/frontend-design/document-adaptation/screenshots/desktop-1440.png`
- Intermediate: `.agent/frontend-design/document-adaptation/screenshots/mid-900.png`
- Mobile: `.agent/frontend-design/document-adaptation/screenshots/mobile-390.png`

## Exact review questions

1. Can a reviewer identify within seconds which information is canonical and which is evidence only?
2. Does any degraded candidate resemble or behave like an official Backlog item or Roadmap phase?
3. Are fixed path, selected source mode, revision/digest, freshness, and read-only status explicit in every applicable state?
4. Does the missing state avoid the harmful `0 items` interpretation?
5. Is copy-only handoff the sole adaptation action, with clipboard failure recoverable by keyboard?
6. Does the 390px composition preserve source facts and the handoff action without horizontal clipping?
7. Does the mockup match Paper Workbench closely enough to authorize production component design?

## Required reviewer output

Return `PASS`, `PASS_WITH_FIXES`, or `BLOCK`, followed by findings prioritized as release-blocking / important / polish. Cite the exact state, viewport, element, and evidence path for each finding. State whether the mockup is ready to present to the Human Owner; do not approve it on the owner's behalf.

## Independence status

No separate reviewer has explicit authorization in this Task 0 session. Independent review is **not run**. This packet is ready for a fresh independent session, and work pauses at that gate.

