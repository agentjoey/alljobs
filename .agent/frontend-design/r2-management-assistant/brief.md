# R2 Planning / Management Assistant — T3 Brief

**Revision:** Approved 17
**Status:** Approved design input — formal spec approved; rendered Mockup Gate pending
**Date:** 2026-08-30

## Start Card

```md
Workflow: 3.3
Task: R2 — Planning / Management Assistant
Role: Primary Agent
Tier / reason: T3 — introduces model access to local project context, an attributable proposal workflow, and a new core assistant interaction
Canonical record: .agent/frontend-design/r2-management-assistant/
Branch / worktree: main / repository root for design only; implementation worktree not created
Mockup Gate: Required — the Project Detail assistant journey needs rendered desktop/mobile approval before production implementation; Console assistant is later R5 scope
Review path: independent design and privacy review before implementation; independent code review and verification against the final candidate
Human checkpoints: model reasoning and usage policy; context and consent boundary; proposal contract; rendered mockup; written spec; final build; release
```

## Confirmed product boundaries

- The assistant is invoked explicitly by the Human Owner and never runs autonomously in the background.
- It is a planning and management assistant, not a coding agent and not an execution dispatcher.
- It reads attributable current project context and labels confirmed facts, inferences, recommendations, questions, and unknowns.
- It does not directly create or substantively edit repository Backlog Items.
- New or substantive Backlog changes become copyable, digest-bound handoffs for a repository agent.
- The repository remains the canonical planning source; AllJobs does not create assistant-owned project memory or a second Backlog.
- Source code analysis requires a separate, explicit one-time read-only Human Gate when planning and architecture documents are insufficient.

## Baseline

The current application has no model SDK, assistant route, chat persistence, model credentials, or assistant UI. Planning projections and source provenance already exist and should be reused rather than bypassed.

## Human decisions

### Execution topology — approved 2026-08-30

- AllJobs calls a model API directly from the Control Host server.
- AllJobs does not start or supervise a local Codex CLI or management-agent process.
- API credentials remain server-side and are never returned to the browser or written to activity payloads.
- The provider is MiniMax Token Plan, using `MiniMax-M3` as the initial model.
- The initial integration uses the MiniMax AI SDK provider (`ai` plus `vercel-minimax-ai-provider`) and its default Anthropic-compatible protocol.
- The Token Plan key remains server-side and is loaded from Control Host configuration or environment; it is never returned to the browser or written to project/activity files.
- R2 does not implement an OpenAI Responses API path or a multi-provider abstraction.

### Provider capability boundary

- Text streaming and typed tool calls are available for the assistant interaction.
- Multi-turn requests must preserve the complete assistant and tool messages required by MiniMax to maintain reasoning continuity.
- Model reasoning content is never rendered as user-facing chain-of-thought or stored in AllJobs activity history.
- MiniMax-M3's long context does not authorize broad repository ingestion; AllJobs still sends only explicitly selected, bounded project context.
- Image, video, web search, shell, MCP, code execution, and arbitrary file tools remain outside the initial R2 surface.

### Default context policy — approved 2026-08-30

Every assistant request starts from a bounded, attributable context manifest assembled by AllJobs on the Control Host.

Automatically included when present:

- the registered Project record and current Project type/work mode;
- the canonical Roadmap and Backlog projections;
- source mode, file paths, complete-file digests, HEAD revision, working-tree modification state, validation issues, and read time;
- a bounded recent task/proposal summary when it is directly relevant to the question.

Architecture and product documents are included only when their exact repository-relative paths appear in a per-Project assistant allowlist. R2 does not infer broad globs, recursively include `docs/`, or follow links outside the validated Project workspace.

Before sending, the UI shows a context receipt containing every path, source mode, digest, modification state, and bounded size. The owner may remove optional allowlisted documents for that request. Canonical planning facts required to answer the selected Project question remain visible and cannot be silently substituted with stale remote content.

The model receives document contents plus the manifest. The final answer cites the same paths and digests; context that changed while the response was running is marked stale rather than presented as current.

### One-time source inspection — approved 2026-08-30

Source code is not part of the default assistant context. When the planning and allowlisted architecture documents are insufficient, the assistant must stop and return a structured source-access request containing:

- the unanswered question;
- why source inspection is necessary;
- the requested capability (`list_project_files`, `read_project_files`, or both);
- an inspection budget and the categories of files it expects to inspect;
- the facts it expects the inspection to confirm or disprove.

The UI presents this as a Human Gate. Approval is bound to the Project, user question, current source manifest digest, capability set, read budget, and a short expiry. It authorizes only the continuation of that response and expires on completion, cancellation, timeout, manifest change, or error.

The source tools:

- start from the registered and revalidated Control Host workspace; the browser and model cannot supply an absolute root;
- list or read only regular files whose real paths remain inside that workspace;
- reject symlinks, path traversal, `.git`, environment/credential files, dependency directories, generated outputs, caches, archives, binaries, and oversized files;
- cap result count, per-file bytes, total bytes, and tool-call count;
- never run shell commands, Git commands, project code, tests, package scripts, or file mutations;
- return exact repository-relative paths and content digests for citation;
- keep source contents and tool results out of activity logs and durable assistant memory.

Denial returns the assistant to a document-only answer with explicit unknowns. Approval never becomes standing access for later questions.

### Conversation retention — approved 2026-08-30

- Assistant conversation state exists only in the current browser tab's `sessionStorage`.
- A page refresh in the same tab may restore the current conversation; closing the tab ends it.
- The Control Host does not persist full assistant prompts, responses, reasoning blocks, source excerpts, or conversation threads.
- Every turn sends only a bounded recent message window plus a newly generated current context manifest. Old source excerpts are not replayed as current evidence.
- Starting a new conversation clears the local transcript and all one-time source authorizations.
- Activity history may record bounded operational metadata such as Project, start/end time, model, success/failure, token usage, context-manifest digest, and whether a source Human Gate was approved. It never records question text, answer text, reasoning, or file contents.
- Copying a response or proposal is an explicit browser action and does not create an AllJobs conversation record.

### Reasoning and usage policy — approved 2026-08-30

R2 exposes two explicit request modes and does not silently route between them:

- **Standard** is the default. MiniMax-M3 thinking is disabled and the request uses the smaller configured output/tool budget. It is intended for status questions, summaries, source checks, and straightforward Backlog questions.
- **Deep analysis** is enabled by the owner for one request. MiniMax-M3 adaptive thinking is enabled and the request receives a larger bounded output/tool budget. It is intended for Roadmap evaluation, dependency analysis, prioritization, and complex proposal work.

The selected mode is visible before send and on the completed response. Reasoning content is consumed only by the provider protocol, never rendered, copied into citations, persisted in `sessionStorage`, or written to logs/activity. The UI reports available input/output token usage, duration, model, mode, and whether a source-inspection gate occurred. Missing provider usage is shown as unavailable rather than estimated.

Timeout, output, source-read, and tool-call budgets are server configuration, not browser authority. A truncated or timed-out response is labeled incomplete and cannot be promoted directly into a formal proposal.

### Answer and Backlog proposal contract — approved 2026-08-30

The first assistant response is a management answer, not a repository handoff. It may contain:

- a direct answer;
- confirmed facts with source citations;
- inferences labeled as inferences;
- unknowns and questions;
- recommendations;
- zero or more selectable proposal candidates.

A proposal candidate is a short recommendation only. It cannot be copied as an authoritative repository change and does not contain a chosen Backlog ID.

The owner may select one candidate and explicitly request `Draft Backlog proposal`. This starts a second bounded model request using the selected recommendation and a freshly re-read context manifest. The result must validate against a structured proposal schema containing:

- problem and desired outcome;
- suggested title;
- suggested Phase, priority, dependencies, and work mode;
- proposed Done When;
- evidence citations and complete context-manifest digest;
- explicit assumptions, unknowns, and questions for the repository agent;
- model, mode, generation time, and proposal digest;
- an instruction for the repository agent to inspect current project context, choose a stable ID, validate relations, edit the canonical Backlog, and report the diff.

If the source manifest changed, the proposal request fails stale and asks the owner to refresh the answer. A valid proposal is still copy-only: AllJobs does not save it as a Backlog Item, modify the repository, start an agent, or run Git. The repository agent remains responsible for technical validation and application.

### Initial surface placement — approved 2026-08-30

R2 adds one project-scoped assistant entry to the existing Project Detail surface. It does not add a global floating assistant or a standalone assistant route.

- `Ask management assistant` opens an explicit side work panel on desktop, approximately 420–520 pixels wide, while preserving the Backlog/Task reading plane.
- At intermediate and mobile widths, the panel becomes a full-height accessible Sheet with a clear close/back action and 44-pixel minimum controls.
- The selected Project is fixed for the life of the panel. Switching Project closes the current panel and clears all one-time source permissions.
- The header identifies Project, source mode, HEAD, modified state, and context-manifest freshness before the first question.
- A compact context receipt is always visible; paths, digests, sizes, and optional-document controls expand on demand.
- Responses use the Paper Workbench's document/ledger language rather than a generic chat-bubble transcript. Citations, unknowns, recommendations, mode, usage, and proposal candidates remain structurally distinct.
- The current browser-tab conversation is restored from `sessionStorage` when the same Project panel reopens in that tab.
- R2 answers only single-Project questions. Cross-project questions are explicitly unavailable until the later Console phase embeds the same assistant contract with a portfolio context assembler.

Because this introduces a core model-backed journey and changes the Project Detail composition, the T3 rendered Mockup Gate remains required even though no new route is added.

### Write and action boundary — approved 2026-08-30

R2 has no persistent mutation tool. Model output can never invoke a Project, planning-document, Task, activity, Git, agent, or filesystem write.

- Backlog recommendations follow the approved two-step copy-only repository-agent handoff.
- The assistant may emit a validated `TaskDraft` containing proposed user-editable fields and source citations.
- `Use as task draft` is a browser action that pre-fills the existing native Task form; it does not call a mutation Server Action.
- The owner reviews and explicitly submits that ordinary form. The existing task schema, stale checks, project lifecycle checks, and activity behavior remain authoritative.
- Assistant provenance is shown on the draft but is not silently written into the resulting Task unless an existing Task field explicitly supports it and the owner keeps that value.
- Incomplete, stale, refused, or source-uncertain responses cannot be promoted into a Task draft or formal Backlog proposal.
- R2 exposes no tool or endpoint for direct Task creation, Backlog application, priority/rank application, agent start, queue dispatch, or Git operations.

### Error and recovery behavior — approved 2026-08-30

- A missing or invalid MiniMax credential leaves the assistant entry visible but disabled with Control Host configuration guidance. The credential value is never disclosed.
- Authentication, Token Plan exhaustion, rate limiting, and provider unavailability are shown as distinct operational failures when the provider exposes that distinction.
- A timeout or interrupted stream preserves visible partial text but marks the response `INCOMPLETE`. It cannot produce or promote a Task draft or formal Backlog proposal.
- Owner cancellation propagates an abort signal to the provider when supported. Whether provider cancellation succeeds or not, the run is `INCOMPLETE` and cannot be promoted.
- AllJobs does not automatically retry after the provider has accepted a request. The owner initiates Retry to avoid duplicate Token Plan consumption.
- Retry creates a new current context manifest. It does not reuse one-time source permissions.
- If the context manifest changes during a response, the answer remains visible but becomes `STALE`; Task draft and formal proposal actions are disabled until the owner refreshes and asks again.
- A present invalid local planning source is never masked by remote/cache data. The assistant may explain confirmed validation issues but cannot claim facts from the affected Roadmap or Backlog.
- Denied source inspection returns a document-only answer with explicit unknowns.
- Provider content refusal is shown as a refusal, not silently rewritten into an apparent management answer.
- When the bounded message/input budget is reached, the UI requires a new conversation. R2 does not create a hidden summary or silently discard required history.
- Error activity contains bounded run metadata only, never question text, answer text, reasoning, source excerpts, or credentials.

## Architecture — approved 2026-08-30

### Request path

```text
Project Detail Assistant Panel
        │
        ├─ prepareContext(projectSlug)
        │      └─ ContextAssembler
        │            ├─ Project Registry
        │            ├─ Local Roadmap / Backlog projection
        │            ├─ Source facts
        │            └─ Project assistant allowlist
        │
        └─ POST /api/assistant/respond
               ├─ validate browser intent
               ├─ rebuild + compare manifest digest
               ├─ enforce mode/budgets
               ├─ MiniMaxAssistantClient
               │      └─ MiniMax-M3 through AI SDK
               └─ stream validated UI events
```

- The browser sends only Project slug, question, Standard/Deep mode, selected optional-document IDs, expected manifest digest, and bounded visible conversation messages.
- The browser cannot submit a workspace root, document content, system prompt, model ID, credential, tool definition, or authoritative budget.
- `ContextAssembler` resolves the registered Project and revalidates its Control Host workspace before every request. It produces the context manifest from current bytes and source facts.
- The response endpoint rebuilds the manifest and rejects a stale expected digest before invoking MiniMax.
- After generation and structured validation, the endpoint rebuilds the manifest again before emitting the final actionable state. A mismatch emits `STALE` and disables consequential actions.
- A dedicated Route Handler owns streaming. Existing Server Actions remain responsible for ordinary forms and non-streaming application mutations.
- `MiniMaxAssistantClient` is a thin MiniMax-M3-only boundary over `ai` and `vercel-minimax-ai-provider`; R2 adds no multi-provider framework.
- A normal model request may only produce side-effect-free `present_management_answer` or `request_source_access` output.
- An approved source-inspection request starts a new model request with temporary bounded read tools. It does not continue or retain the prior reasoning chain.
- Task drafts and formal Backlog proposals are separate structured requests and remain non-persistent.
- Reasoning never enters the browser. Only validated user-visible answer/proposal data and operational stream events cross the response boundary.
- Project configuration may persist assistant allowlist paths. Conversation content is never persisted by the server.
- Activity records only bounded run metadata and provider usage.

## Data contracts — approved 2026-08-30

### Persistent configuration

`ProjectAssistantConfig` adds an optional `context_paths` array of exact repository-relative paths to the Project registry. It contains no prompt, conversation, model credential, source excerpt, or broad glob.

Control Host configuration contains the fixed provider/model and server-authoritative Standard/Deep budgets. The MiniMax Token Plan key is loaded only from the server environment.

### Context and request

- `AssistantContextManifest`: Project, source mode, HEAD, document metadata, digests, byte sizes, modification state, validation issues, read time, context-policy version, and manifest digest.
- `SourceFragment`: deterministic source ID, path, complete-file digest, heading, line range, and content. The browser receives receipt metadata, not fragment contents.
- `AssistantRequestIntent`: Project slug, question, mode, selected optional-document IDs, expected manifest digest, and bounded visible conversation messages.

The manifest digest covers Project, source mode, HEAD, selected documents, each complete-file digest, modification state, validation issues, and context-policy version. Browser history is conversation material, never a project-fact authority.

### Model output

`ManagementAnswer` separates direct answer, confirmed facts, inferences, unknowns, questions, recommendations, citations, and candidate drafts. Every confirmed fact requires at least one source ID from the current manifest.

The server rejects invented or missing source IDs, invalid citation relations, unknown fields, oversized values, and schema mismatches as `INVALID_OUTPUT`. An invalid result cannot create a Task draft or formal Backlog proposal.

### Consequential proposals

- `SourceAccessProposal`: purpose, unanswered question, requested capabilities, server-bounded budget, expected facts, manifest digest, and expiry.
- `TaskDraft`: editable native Task fields, evidence, assumptions, and manifest digest; it can only prefill the existing form.
- `BacklogProposal`: problem/outcome, suggested planning fields, Done When, evidence, unknowns, repository-agent instructions, model/mode/time, manifest digest, and proposal digest.

Source approval cannot use a browser-supplied absolute path, tool, or expanded budget. Proposal digests cover the complete structured draft, citations, manifest digest, model, mode, and prompt-policy version.

### Operational record

`AssistantRunRecord` contains only run ID, Project, model, mode, status, input/output usage when reported, duration, manifest digest, source-gate state, and bounded error code. It excludes question, answer, source fragments, reasoning, drafts, proposal bodies, and credentials.

All request and response boundaries use strict Zod schemas, bounded strings/arrays, enumerations, and unknown-field rejection.

## Interaction flow and state matrix — approved 2026-08-30

### Primary interaction

1. The owner opens `Management assistant` from Project Detail. Desktop uses a 420–520 px side panel; mobile and constrained widths use a full-height accessible Sheet.
2. AllJobs re-reads the current Project, Roadmap, Backlog, source facts, and permitted Project documents, then displays a context receipt with path, modification state, digest, size, validation issues, and read time.
3. The owner may deselect optional documents, writes a question, chooses Standard or Deep analysis, and explicitly submits it.
4. The server locks the submitted intent, rebuilds and compares the context manifest, applies server-authoritative budgets, and streams validated user-visible events.
5. The request ends in either a structured management answer or a bounded one-time source-access proposal.
6. Approving source access starts a fresh request under the approved temporary read capability. Denying it produces a document-only answer with explicit unknowns.
7. A completed answer separates confirmed facts and citations from inferences, unknowns, questions, recommendations, and candidate drafts.
8. Selecting a recommendation may start a separate fresh request to draft a copy-only Backlog proposal. Selecting an eligible Task candidate may prefill the existing Task form for owner review.
9. Each follow-up revalidates the current manifest. A changed manifest leaves previous output readable but disables consequential actions until the owner refreshes and asks again.

### State matrix

| State | User-visible behavior | Allowed actions |
|---|---|---|
| Closed | Assistant does not occupy the main planning reading plane | Open assistant |
| Preparing context | Show sources being inspected and bounded progress | Cancel; close |
| Ready | Show context receipt, mode control, optional-document controls, and composer | Ask; change mode; adjust optional documents |
| Context invalid | List missing or invalid local sources without masking them with remote/cache data | Inspect issues; refresh |
| Provider not configured | Keep entry visible but disabled with Control Host guidance; never reveal the credential | View guidance |
| Submitting | Lock the submitted intent while the server performs manifest and policy checks | Cancel |
| Streaming | Show progressive validated content and the selected Standard/Deep mode | Cancel |
| Source access requested | Show purpose, scope, capabilities, budget, manifest binding, and expiry | Approve once; deny |
| Inspecting source | Show bounded file-count progress without source excerpts or reasoning | Cancel |
| Complete | Show structured answer, citations, usage when available, and eligible candidate actions | Follow up; draft proposal; use Task draft |
| Invalid output | Mark the result unusable and do not render it as an actionable draft | Retry manually |
| Stale | Preserve the answer with a `STALE` marker and disable consequential actions | Refresh context; ask again |
| Incomplete or cancelled | Preserve visible partial content with an `INCOMPLETE` marker | Retry manually |
| Authentication, plan, rate, or provider failure | Show the distinct bounded operational error when available | Check configuration; retry manually |
| Drafting proposal | Lock the selected candidate while current project context is re-read | Cancel |
| Proposal ready | Show the full digest-bound proposal and repository-agent handoff | Copy handoff; discard |
| Task draft ready | Prefill the existing native Task form without submitting it | Edit; submit through the normal form; discard |
| Session budget reached | Stop adding messages rather than hiding required context or silently summarizing it | Start a new conversation |

### Interaction constraints

- Backlog and Task remain the primary and most frequently viewed content; the assistant is a subordinate document/ledger panel, not a generic chat surface.
- Opening the panel moves focus to its heading. The source-access gate traps focus as a modal decision; Escape closes only when no gate is active.
- Streaming and state changes use an accessible live region. All actions are keyboard operable, and reduced-motion preferences remove nonessential transitions.
- Changing Project closes the panel and clears all one-time source permissions. Same-Project visible conversation may restore only from that browser tab's `sessionStorage`.
- AllJobs never automatically retries a request after MiniMax has accepted it. Retry is explicit so Token Plan usage and duplicate answers remain visible to the owner.

## Security boundary — approved 2026-08-30

### Trust zones

| Zone | Trust | Rule |
|---|---|---|
| Browser intent | Untrusted | It may express a question, mode, and selection; it cannot choose paths, model, tools, budgets, system policy, or credentials |
| Project documents and source | Untrusted content | They are evidence to analyze, never instructions or authorization |
| Control Host | Sole execution boundary | It resolves Projects, reads permitted files, computes digests, enforces limits, and calls MiniMax |
| MiniMax API | External data processor | It receives only the bounded context explicitly selected for the current request |
| Activity log | Metadata-only record | It never stores question, answer, source content, reasoning, proposal body, or credential |

### Project and file access

- Every request resolves the registered Project realpath again and verifies that it remains inside an authorized workspace.
- Roadmap, Backlog, and allowlisted context files are read only through the server-built context manifest.
- The browser cannot submit an absolute path, arbitrary relative path, file content, or expanded capability.
- One-time source inspection rejects traversal, symlink escape, secrets/environment files, dependency directories, generated output, caches, archives, binaries, oversized files, and excluded paths.
- Source permission is bound to Project, question, manifest digest, capabilities, server-bounded budget, and expiry. A change to any binding invalidates it.

### Prompt-injection containment

- Instructions found in Project documents or source code are treated as quoted project data. They cannot alter system policy, request tools, expand scope, or authorize access.
- System policy, tool definitions, model, and budgets are fixed by the server and cannot be overridden by browser or document content.
- A normal request has only two side-effect-free outcomes: a management answer or a source-access request.
- Model output must pass strict structure, size, source-ID, and citation validation. Unknown fields, invented sources, or action-shaped output fail as `INVALID_OUTPUT`.
- Commands, tool calls, or mutation instructions emitted as model text remain inert text and are never executed.

### Disclosure, privacy, and retention

- The context receipt states which selected documents will be sent to MiniMax. Ordinary allowlisted documents do not require a repetitive confirmation; source code requires a separate one-time approval for every inspection request.
- The MiniMax credential exists only in the Control Host server environment and never enters a client bundle, response, Project file, or activity record.
- Conversation content is held only in the current browser tab's `sessionStorage`. The server creates no conversation store.
- Server and activity records contain only bounded operational metadata: status, duration, provider usage when reported, manifest digest, source-gate state, and error code.

### Stale state, concurrency, and cost containment

- The server rebuilds and compares the manifest before invoking MiniMax. A mismatch fails before provider consumption.
- If a source changes during generation, the visible result becomes `STALE`; it cannot produce a Task draft or formal Backlog proposal.
- Consequential drafts bind to the latest manifest. Stale, incomplete, cancelled, refused, or invalid output cannot be promoted.
- R2 permits one active assistant request per browser tab. It does not add background runs, scheduled execution, autonomous retries, or an assistant queue.
- Server limits cover request body, question, visible history, selected documents, input bytes, output, tool calls, file count, and source bytes.

### Deployment and fail-closed behavior

- Assistant SDK and provider calls exist only in the server Route Handler. Server-only modules and credentials must not enter the client graph.
- AllJobs continues to bind to `127.0.0.1`; remote access remains behind the existing Cloudflare Tunnel and Access boundary.
- The assistant endpoint accepts only bounded same-origin JSON requests and rejects browser-supplied authority.
- Validation, authorization, source, or provider failures do not fall back to arbitrary reads, remote/cache truth, another model, or any write operation.
- R2 adds no additional permission service, credential database, or provider abstraction for the current single-owner deployment.

## Acceptance and Mockup Gate — approved 2026-08-30

### Core capability

- Project Detail opens the assistant without displacing Backlog and Task as the primary reading plane.
- Every question uses the current Project, Roadmap, Backlog, source state, and owner-selected permitted documents.
- The context receipt accurately shows path, modification state, digest, size, validation issues, and read time.
- Standard and Deep modes both use MiniMax-M3 and show mode, duration, and provider-reported usage when available.
- Completed answers distinguish confirmed facts and citations from inferences, unknowns, questions, and recommendations.
- Every confirmed fact resolves to a real source in the current manifest.

### Authorization and follow-on actions

- Insufficient documents may produce only a source-access proposal; source code is unreadable before approval.
- Source authorization is bound to the current Project, question, manifest, scope, budget, and expiry.
- A denial still permits a document-only answer with explicit unknowns.
- Task candidates can only prefill the existing native form and cannot submit it.
- Backlog candidates can only become a digest-bound copyable repository-agent handoff.
- R2 exposes no direct Backlog write, Task create, Git, agent-start, or queue-dispatch capability.

### Required security evidence

Automated evidence must show that:

- browser-crafted paths, models, tools, budgets, and file contents are rejected;
- traversal, symlink escape, credential files, and excluded paths cannot be read;
- prompt injection in project content cannot change tools, scope, or system policy;
- a changed manifest makes previous output stale and disables consequential actions;
- incomplete, cancelled, refused, and invalid output cannot become actionable drafts;
- client bundles, responses, logs, and activity contain no MiniMax credential, source content, or hidden reasoning;
- invalid local planning truth is not silently replaced by remote/cache content;
- production remains bound to `127.0.0.1`.

### Recovery evidence

- Missing credential, authentication failure, Token Plan exhaustion, rate limiting, timeout, and provider unavailability are distinguishable when provider data permits.
- Interrupted output remains visible only as `INCOMPLETE`.
- Retry is explicit and rebuilds the manifest.
- A reached session limit requires a new conversation rather than hidden summarization.
- Closing the browser tab leaves no conversation content on the server.

### Minimal rendered Mockup Gate

Only four scenario groups are required before runtime implementation:

1. desktop initial state: Project Detail, assistant entry, panel, context receipt, mode, and composer;
2. desktop answer state: completed structured answer, citations, unknowns, recommendations, and Task/Backlog candidate actions;
3. safety and exception state: source-access gate plus compact `STALE`, `INCOMPLETE`, invalid-source, and provider-error treatments;
4. mobile critical flow: full-height Sheet, collapsed context, readable answer, and bottom actions.

The mockups retain the current AllJobs design system and Paper Workbench language. They do not introduce a new visual direction. Human approval of rendered desktop and mobile evidence is required before installing model dependencies or implementing the assistant route.

### Final delivery gate

- Focused component, route-contract, security-boundary, and critical Playwright evidence passes.
- Typecheck, lint, and production build pass.
- Independent Review and independent Verification run in fresh sessions.
- Final desktop and true 390 px mobile screenshots come from the repaired final production build.
- The Human Owner performs the final walkthrough and separately approves release.
- R3 queueing, R5 Console assistant, R6 multi-device support, persistent conversation, and provider abstraction remain out of scope.

## Discovery status

All Brief sections and the formal written spec are approved by the Human Owner. The rendered Mockup Gate remains pending. No model package, credential, route, or production component may be added before that gate is approved.
