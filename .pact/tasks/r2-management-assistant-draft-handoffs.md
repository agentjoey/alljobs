# R2 Management Assistant — Task 7: safe draft handoffs

Implement only Task 7 of the approved R2 plan: a validated Task draft may prefill the existing
native-task form, and a validated Backlog proposal becomes copy-only repository-agent text. No
assistant path may create a Task, modify Backlog Markdown, invoke Git/shell/agents, or retain a
conversation.

The current strict fresh-run contract has no server conversation store. Therefore the browser may
send only a bounded recommendation `{id,title,rationale,candidate_kind}` as **untrusted owner
intent** for `draft_task` or `draft_backlog`; the server re-reads the manifest, validates the
candidate kind, calls the model once, validates a dedicated TaskDraft/BacklogProposal outcome, and
emits a dedicated draft event. It must reject unknown fields, stale/incomplete/error results, and
digest mismatch. This reconciles the plan's stated draft-intent behavior with its no-history
decision; it grants no client authority over paths, model, tools, budgets, source content, or writes.

The Human Owner explicitly authorized Task 7 continuation while Task 5 is awaiting review and Task
6 uses the recorded owner/seat audit exception. Do not merge, release, deploy, or start Task 8.
Run RED→GREEN focused tests and record the state matrix, candidate SHA, and review packet in the R2
handoff. Checkpoint `r2-draft-handoffs` for independent review and stop.
