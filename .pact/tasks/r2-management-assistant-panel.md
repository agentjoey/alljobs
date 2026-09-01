# R2 Management Assistant — Task 6: approved Project Detail panel

Implement only Task 6 of the approved R2 plan and Mockup Gate revision 2. The owner explicitly
authorized continuation while Task 5 is awaiting independent review; do not merge, release, or
start Task 7.

Use the installed shadcn Radix Sheet plus Paper Workbench tokens. Build a Project-scoped 420–520px
desktop companion panel and a true full-height mobile Sheet. The composer stays persistent at the
bottom; every submit is a fresh bounded run with no history, persistent server conversation, or
browser-supplied authority. Companion output is a visibly labelled structured document record,
not chat bubbles. Keep Project Detail Backlog/Task reading dominant.

Implement the client session and strict NDJSON parsing. Store only bounded visible display state
and selected mode in `sessionStorage`; never store source fragments, reasoning, prompts,
credentials, source gates, or action authority. Cover disabled/loading/error/success/stale/
incomplete/source-gate/validation states, keyboard focus and close behavior, one active request,
optional document selection, project switching, and 390px layout. No Task creation, Backlog write,
Git/shell/agent action, or direct mutation is permitted.

Use RED → GREEN tests, then targeted browser evidence from the final build at 1440px and true
390px. Record the final state matrix, visual comparison, evidence, and review packet in the R2
handoff. Checkpoint `r2-panel` for independent review and stop.
