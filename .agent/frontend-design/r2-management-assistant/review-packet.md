# R2 Management Assistant — Independent Review Packet

- **Task / Brief:** R2, Brief revision 17; Mockup revision 2 approved
- **Tier:** T3 — model-backed Project Detail journey with local context/privacy boundaries
- **Candidate:** `c73901dfed41ccbb4ed7f529532dd5f1fc1caed5` (`fix: preserve r2 stream and mobile output`)
- **Branch / worktree:** `codex/r2-management-assistant` · `.worktrees/r2-pact-orchestrator`
- **Scope:** Tasks 1–8 implementation candidate. Task 9 documentation and release evidence are separate and do not authorize release.

## Authoritative inputs

1. `docs/superpowers/specs/2026-08-30-alljobs-r2-planning-management-assistant-design.md`
2. `docs/superpowers/plans/2026-08-31-alljobs-r2-planning-management-assistant.md`
3. `.agent/frontend-design/r2-management-assistant/brief.md` revision 17
4. approved Mockup revision 2 and its rendered evidence in this directory
5. candidate diff from `e33999db418e532e96811c4d48300c0cf115fc88..c73901d`

The Human Owner superseded the plan's older Vercel-provider example: R2 uses
the official MiniMax Token Plan OpenAI-compatible contract (`https://api.minimax.io/v1`,
`MiniMax-M3`). Review must not propose switching back to Vercel or an Anthropic
protocol without new Human Owner authorization.

MiniMax's official OpenAI-compatible API documents streaming for M3 but limits
`response_format/json_schema` to a different model family. The candidate uses
the documented M3 `thinking: { type: "disabled" }` and `reasoning_split: true`
fields, buffers raw streaming text server-side, then strictly parses and
validates one terminal JSON object. Review this adapter for both protocol scope
and preservation of the existing no-unvalidated-output boundary.

The prior independent review findings are incorporated in this candidate:
Standard disables M3 thinking while Deep uses documented adaptive thinking;
the source-gate stop condition retains one final non-tool answer step; and an
incomplete UI preview may contain only a fully closed `direct_answer` JSON
string. On 390px, the Context receipt is a keyboard-focusable scrollable
summary so the distinct Companion header and terminal answer are both visible.

## State matrix and must-review boundaries

| State | Required behavior |
|---|---|
| disabled / invalid | UI and Route Handler safe-off; no provider creation |
| ready | project-scoped receipt; Standard/Deep explicit; no conversation persistence beyond current tab state |
| source gate | one-time bounded approve/deny; no shell/Git/write/path expansion |
| stale / incomplete | visible result may remain, consequential actions unavailable |
| Task draft | normal form prefill only; owner submit remains the sole mutation |
| Backlog proposal | copy-only repository-agent handoff; no AllJobs write |
| provider failure | metadata-only error; no automatic retry or secret disclosure |

Review privacy and authority more heavily than cosmetic preference: Control Host
key placement, client/server separation, forced dynamic/no-store response,
browser input strictness, server-derived context, symlink/secret rejection,
manifest stale protection, activity logging, source-gate expiry/budgets, and
the absence of direct filesystem/Git/agent actions.

## Candidate evidence supplied

- Candidate focused suite: 5 files / 67 tests after the stale/source-gate/cancellation fixes.
- Candidate browser suite: 6 Playwright journeys on isolated fixture, including 390px,
  reduced motion, keyboard source denial, stale/incomplete, Task prefill, and
  copy-only Backlog handoff, plus repaired-final-build evidence capture.
- Webpack production build, planning-skill validation, and deployment invariant verifier.
- This packet is not itself an approval or verification result.

## Requested output

Start in a fresh context. Do not trust contributor conclusions. Report findings
by P0–P3 with file/line evidence, identify tests that prove or fail to prove each
boundary, and state residual release risks. Do not edit the candidate; write
results into the Task 9 verification record or return them to the Human Owner.
