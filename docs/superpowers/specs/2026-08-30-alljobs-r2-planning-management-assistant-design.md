# AllJobs R2 — Planning / Management Assistant Design

**Status:** Approved by the Human Owner on 2026-08-31
**Date:** 2026-08-30
**Parent roadmap:** `docs/superpowers/specs/2026-08-29-alljobs-product-roadmap-design.md`
**Approved design input:** `.agent/frontend-design/r2-management-assistant/brief.md` revision 17
**Tier:** T3 — sends selected local project context to an external model and introduces a new core assistant interaction
**Implementation authorization:** None. Runtime implementation begins only after written-spec approval and the rendered Mockup Gate.

## 1. Purpose

R2 adds an explicitly invoked planning and management assistant to a Project Detail page. It helps the owner understand current planning state, identify gaps, formulate Task drafts, and prepare Backlog change proposals without becoming a coding agent or a second planning authority.

The assistant must:

- answer from attributable, current Project context;
- distinguish confirmed facts from inference, recommendation, question, and unknown;
- disclose which selected project documents will be sent to MiniMax;
- request a separate one-time gate before inspecting source code;
- produce only non-persistent Task drafts and copyable repository-agent Backlog proposals;
- preserve the repository Backlog as the sole fact source;
- store no server-side conversation or assistant-owned project memory.

R2 is intentionally narrow for a single-owner deployment. It does not introduce agent execution, a durable conversation service, multi-provider routing, or cross-project intelligence.

## 2. Baseline and invariants

AllJobs already has a registered Project model, local/remote planning-source projection, Roadmap and Backlog parsers, source provenance, native Task creation, and metadata activity records. R2 extends those boundaries rather than creating parallel sources.

The following remain invariant:

- a code project's repository-owned `docs/ROADMAP.md` and `docs/BACKLOG.md` are canonical;
- the Control Host working tree is preferred when its registered local workspace is available;
- a present invalid local planning source is shown as invalid and is not hidden by remote/cache data;
- new or substantively changed Backlog Items are implemented by a repository-aware agent, not directly by AllJobs;
- existing Project, Task, source-validation, stale-state, trusted-root, and deployment controls remain authoritative;
- AllJobs continues to bind to `127.0.0.1`, with remote access through the existing Cloudflare Tunnel and Access boundary.

## 3. Scope

### 3.1 Included

- an embedded Project Detail assistant panel;
- Standard and Deep analysis modes;
- bounded current-context assembly and a visible context receipt;
- MiniMax-M3 streaming through the MiniMax AI SDK provider;
- structured management answers with citations;
- one-time, read-only, bounded source inspection after Human approval;
- Task draft prefill into the existing Task form;
- digest-bound copyable Backlog proposals for a repository agent;
- current-tab conversation continuity through `sessionStorage`;
- metadata-only usage and operational records;
- explicit stale, incomplete, refusal, budget, credential, rate, and provider states.

### 3.2 Excluded

- direct creation or substantive editing of a repository Backlog Item;
- automatic Task submission;
- Git writes, commits, pushes, merges, branch operations, or repository-agent execution;
- agent queue creation or dispatch;
- shell, test, build, script, or arbitrary command execution;
- background, scheduled, or autonomous assistant runs;
- server-side conversation persistence, vector search, embeddings, or assistant memory;
- cross-project answers or the Console Dashboard assistant planned for R5;
- multi-device workspace access planned for R6;
- multi-provider abstraction or fallback to another model;
- general-purpose source browsing or a code-review experience.

## 4. User experience

### 4.1 Placement

The initial assistant exists only on Project Detail. `Management assistant` opens a 420–520 px subordinate side panel on desktop and a full-height accessible Sheet at smaller widths. Backlog and Task remain the primary reading surface.

The panel uses the existing AllJobs design system and Paper Workbench language. It presents evidence, status, and recommendations as a document/ledger rather than generic chat bubbles. Switching Project closes the panel and clears one-time source permissions.

### 4.2 Primary flow

1. The owner opens the assistant.
2. AllJobs re-reads the registered Project and builds the current context manifest.
3. The panel displays a context receipt. The owner may deselect optional documents.
4. The owner writes a question, chooses Standard or Deep mode, and explicitly submits.
5. The server rebuilds and compares the manifest, applies authoritative limits, and streams validated events.
6. The assistant returns either a structured answer or a source-access proposal.
7. Source approval starts a fresh bounded request; denial produces a document-only answer with explicit unknowns.
8. An eligible recommendation may start a fresh Backlog-proposal request or prefill the existing Task form.
9. Every follow-up and consequential draft revalidates current context.

### 4.3 Accessibility and responsive behavior

- Opening the panel moves focus to its heading.
- The source-access decision is modal and traps focus; Escape closes only when no gate is active.
- Streaming and status changes use an accessible live region.
- All controls are keyboard operable.
- Reduced-motion preferences remove nonessential transitions.
- Mobile preserves readable context, answer structure, and bottom actions without relying on hover.

## 5. Model integration

### 5.1 Provider

R2 uses MiniMax Token Plan with `MiniMax-M3`. The server integrates `ai` and `vercel-minimax-ai-provider`, using the provider's default Anthropic-compatible protocol. The MiniMax credential remains in the Control Host server environment.

R2 does not add OpenAI Responses API support or a provider abstraction. The integration is a thin `MiniMaxAssistantClient` boundary so provider-specific behavior does not leak through the application.

Official references:

- [MiniMax Token Plan support for other tools](https://platform.minimax.io/docs/token-plan/other-tools)
- [MiniMax AI SDK integration](https://platform.minimax.io/docs/api-reference/text-ai-sdk)
- [MiniMax Anthropic-compatible API](https://platform.minimax.io/docs/api-reference/text-anthropic-api)

### 5.2 Modes

- **Standard** is the default. MiniMax-M3 thinking is disabled and server-authoritative input/output budgets are smaller.
- **Deep analysis** is an explicit per-request choice. Adaptive thinking is enabled and the server applies larger bounded budgets.

The selected mode is visible. Duration, model, and actual provider-reported usage are displayed when available. Hidden reasoning is never shown, persisted, logged, or sent back to the browser.

### 5.3 Request path

```text
Project Detail Assistant Panel
        │
        ├─ prepareContext(projectSlug)
        │      └─ ContextAssembler
        │            ├─ Project registry
        │            ├─ local Roadmap / Backlog projection
        │            ├─ source facts
        │            └─ exact Project context allowlist
        │
        └─ POST /api/assistant/respond
               ├─ validate browser intent
               ├─ rebuild and compare manifest
               ├─ enforce mode and budgets
               ├─ MiniMaxAssistantClient
               │      └─ MiniMax-M3 through AI SDK
               └─ stream validated UI events
```

The browser may send only Project slug, question, mode, selected optional-document IDs, expected manifest digest, bounded visible history, and request intent. It cannot send authoritative paths, file content, model, credential, prompt policy, tools, or budgets.

## 6. Context policy

### 6.1 Default context

Every request freshly assembles:

- the registered Project record;
- canonical current Roadmap and Backlog projections;
- source mode, workspace availability, HEAD, complete-file digests, modification state, validation issues, and read time;
- a bounded recent Task/proposal summary only when directly relevant;
- optional architecture or product documents from the Project's exact allowlist.

`ProjectAssistantConfig.context_paths` is an optional array of exact repository-relative paths. It accepts no broad glob, prompt, credential, source excerpt, or conversation content. Optional documents appear in the context receipt and may be deselected before submission.

The model receives only selected, bounded fragments. The context receipt shown to the browser contains path and metadata, not hidden source fragment contents.

### 6.2 Context manifest

`AssistantContextManifest` contains:

- Project identity and source mode;
- HEAD when available;
- selected document IDs and paths;
- complete-file digest, byte size, modification state, validation issues, and read time for every document;
- context-policy version;
- manifest digest.

The digest covers all of the above facts. Browser conversation is useful dialogue context but is never treated as project-fact authority.

The endpoint rebuilds the manifest immediately before provider invocation. A mismatch with the expected digest fails without calling MiniMax.

After generation and structured validation, the endpoint rebuilds the manifest again before emitting a final actionable state. If it changed during generation, the answer remains readable but the final event is `STALE` and consequential actions are disabled.

The server-internal `SourceFragment` contains a deterministic source ID, repository-relative path, complete-file digest, heading, line range, and bounded content. The browser receives receipt and citation metadata, not the hidden fragment collection.

## 7. One-time source inspection

Source code is excluded from ordinary assistant context. When the model cannot responsibly answer from permitted documents, it may return a validated `SourceAccessProposal` describing:

- the unanswered question and purpose;
- requested read capabilities;
- expected facts;
- server-bounded file, byte, and tool-call budget;
- bound Project and manifest digest;
- expiry.

The owner may approve once or deny. Approval starts a new request with only temporary `list_project_files` and `read_project_files` capabilities. It does not resume or retain the prior reasoning chain.

The server:

- starts from the registered Project realpath;
- rejects traversal and symlink escape;
- permits only regular text files;
- excludes `.git`, environment/credential files, dependencies, generated output, caches, archives, binaries, and oversized files;
- caps tool calls, file count, per-file bytes, and total bytes;
- exposes no shell, Git, code execution, test, build, script, or write tool.

Permission expires after the approved response, cancel, timeout, stale state, error, or explicit expiry. Denial returns a document-only answer with explicit unknowns.

## 8. Answer and proposal contract

### 8.1 Management answer

`ManagementAnswer` is a strict structured result with:

- direct answer;
- confirmed facts;
- citations;
- inferences;
- unknowns;
- questions;
- recommendations;
- candidate Task or Backlog proposals.

Every confirmed fact must cite a source ID from the current manifest. Invented or missing sources, invalid citation relationships, unknown fields, oversized values, or schema mismatch fail as `INVALID_OUTPUT`. Invalid output cannot produce a consequential draft.

### 8.2 Task draft

An eligible `TaskDraft` contains editable native Task fields, evidence, assumptions, citations, and manifest digest. `Use as task draft` is a browser-only action that prefills the existing Task form. The owner edits and submits that normal form under its existing validation and lifecycle rules.

No assistant endpoint creates a Task.

### 8.3 Backlog proposal

A formal `BacklogProposal` is generated only after the owner selects a recommendation and explicitly requests a draft. This separate request re-reads current context and produces:

- problem and intended outcome;
- suggested title, Phase, priority, dependencies, and work mode;
- Done When and required evidence;
- unknowns and assumptions;
- citations;
- model, mode, time, manifest digest, and proposal digest;
- instructions for a repository-aware agent to inspect current architecture and apply the change.

The proposal is copy-only. It is not written to the repository and does not start an agent. Its digest covers the complete structured proposal, citations, manifest digest, model, mode, and prompt-policy version.

Incomplete, stale, cancelled, refused, source-uncertain, or invalid output cannot become a Task draft or formal Backlog proposal.

## 9. Conversation and retention

The current browser tab stores bounded visible conversation messages in `sessionStorage`. Refreshing the same tab may restore them; closing the tab ends the conversation. Switching Project closes the panel and clears one-time source permissions.

Each request sends only a bounded recent visible history plus freshly assembled context. When the limit is reached, the owner must start a new conversation. R2 does not silently summarize or discard required history.

The Control Host stores no full prompt, answer, source excerpt, reasoning, draft, proposal body, or thread. `AssistantRunRecord` is metadata only:

- run ID and Project;
- provider model and selected mode;
- status and duration;
- input/output usage when reported;
- manifest digest;
- source-gate state;
- bounded error code.

## 10. State and recovery

The UI must represent at least:

- closed;
- preparing context;
- ready;
- invalid context;
- provider not configured;
- submitting;
- streaming;
- source access requested;
- source inspection active;
- complete;
- invalid output;
- stale;
- incomplete or cancelled;
- authentication, plan, rate, timeout, or provider failure;
- proposal drafting and proposal ready;
- Task draft ready;
- session budget reached.

Partial output remains visible after cancel or interruption but is marked `INCOMPLETE`. A response whose source changes is marked `STALE`. Neither state permits consequential actions.

Owner cancellation propagates an abort signal to the provider when supported. Regardless of whether upstream cancellation succeeds, the local run is `INCOMPLETE` and is never automatically retried.

Authentication, Token Plan exhaustion, rate limiting, timeout, and provider unavailability are distinguished when provider data permits. AllJobs never automatically retries after the provider accepts a request. Owner-triggered Retry rebuilds the manifest and does not reuse source permission.

R2 permits one active request per browser tab. It adds no background queue.

## 11. Security and privacy

### 11.1 Trust model

- Browser intent is untrusted.
- Project documents and source code are untrusted evidence, not instructions.
- The Control Host is the only file-access and policy-enforcement boundary.
- MiniMax is an external data processor and receives only bounded selected context.
- Activity is metadata-only.

### 11.2 Prompt-injection containment

Instructions found in project content cannot modify system policy, tools, model, budgets, scope, or authorization. Ordinary model output has only two side-effect-free shapes: management answer or source-access request. Action-shaped model text remains inert.

All boundaries use strict Zod schemas, bounded arrays and strings, enumerations, and unknown-field rejection.

### 11.3 Secrets and disclosure

The MiniMax credential is server-only and absent from client bundles, responses, project files, and activity. The context receipt states which ordinary selected documents will be sent to MiniMax. Source code always requires the separate one-time gate.

### 11.4 Fail-closed behavior

Validation, authorization, source, or provider failures do not fall back to arbitrary file access, remote/cache truth, another model, or a mutation. A missing or invalid credential keeps the assistant entry visible but disabled with safe Control Host guidance.

## 12. Deployment and configuration

Assistant provider code runs only in a server Route Handler and server-only modules. Production continues to use the existing local Next.js process, refresh worker, Cloudflare Tunnel, and Access arrangement. No additional service or database is introduced.

The endpoint accepts bounded same-origin JSON requests. Server limits cover request body, question, visible history, selected documents, context bytes, output, source tools, file count, and source bytes.

Removing or invalidating the server credential disables the assistant without affecting Project, Roadmap, Backlog, or Task reading. Release rollback uses the normal whole-release rollback path; no data migration is required because R2 adds no durable conversation or assistant-owned planning data.

## 13. Rendered Mockup Gate

Runtime implementation is blocked until the Human Owner approves four rendered scenario groups:

1. desktop initial state: Project Detail, assistant entry, panel, context receipt, mode, and composer;
2. desktop answer state: structured answer, citations, unknowns, recommendations, and Task/Backlog candidate actions;
3. safety and exception state: source-access gate plus compact `STALE`, `INCOMPLETE`, invalid-source, and provider-error treatments;
4. mobile critical flow: full-height Sheet, collapsed context, readable answer, and bottom actions.

The mockup retains the current AllJobs design system and Paper Workbench direction. It must not create a new visual identity or expand into a Console assistant.

## 14. Verification and acceptance

### 14.1 Functional evidence

- current context and receipt are correct for clean, modified, invalid, remote-read-only, and cached sources;
- Standard and Deep modes use the fixed model and server budgets;
- structured streaming and citations render correctly;
- source approval, denial, expiry, cancel, and stale transitions behave as designed;
- Task draft prefill does not submit;
- Backlog proposal remains copy-only and digest-bound;
- same-tab restoration works without server conversation persistence.

### 14.2 Security evidence

Focused tests must prove that:

- crafted browser paths, contents, models, tools, and budgets are rejected;
- traversal, symlink escape, credential paths, exclusions, and byte limits fail closed;
- project-content prompt injection cannot alter policy or authorization;
- manifest changes disable consequential actions;
- incomplete, refused, cancelled, stale, and invalid output cannot be promoted;
- client output, logs, and activity contain no credential, hidden reasoning, or source body;
- invalid local truth is not masked by remote/cache data;
- production remains bound to `127.0.0.1`.

### 14.3 Quality gate

- focused component, route-contract, boundary integration, and critical Playwright tests pass;
- typecheck, lint, and production build pass;
- independent Review and independent Verification run in fresh sessions;
- final desktop and true 390 px mobile screenshots come from the repaired final production build;
- the Human Owner performs a hands-on walkthrough and separately approves release.

## 15. Release boundary

R2 is complete only when the assistant can safely answer and produce non-persistent drafts within one Project. It is not a partial implementation of later phases.

The following remain later roadmap work:

- R3: agent queue, observed work state, and Backlog Companion;
- R4: broader UI consolidation;
- R5: Console Dashboard and cross-project management assistant;
- R6: multi-device Project identity and remote observation;
- R7: operational KPI support;
- R8: reliability hardening beyond the focused R2 boundary.
