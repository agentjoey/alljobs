# AllJobs Product Roadmap

**Status:** Approved by the Human Owner on 2026-08-29
**Date:** 2026-08-29
**Scope:** Product roadmap after Planning Core V1
**Implementation authorization:** None. Each phase requires its own approved design, plan, and release gate.

## 1. Purpose

AllJobs is Joey's personal multi-project workbench. It aggregates Roadmaps, Backlogs, Tasks, project health, and agent work state so that one owner can decide what needs attention and manage the next work without creating duplicate planning sources.

Planning Core V1 established the federated read model. This roadmap evolves it into a daily Backlog management and project-control tool while keeping the system small enough to operate as a self-use application.

The roadmap is organized into eight outcome-based phases:

1. R1 — Backlog Control;
2. R2 — Multi-device Project Identity;
3. R3 — Planning / Management Assistant;
4. R4 — Agent Queue, Work State, and Backlog Companion;
5. R5 — UI Consolidation;
6. R6 — Console Dashboard;
7. R7 — Operations and KPI;
8. R8 — Reliability and Long-term Maintenance.

The roadmap defines boundaries and dependencies. It does not pre-design all eight implementations. Each phase receives a separate design and implementation plan only when it becomes current.

## 2. Product boundaries

AllJobs is responsible for:

- aggregating planning across code and business projects;
- managing the priority and order of existing code-project Backlog Items;
- producing proposals for new or substantive Backlog changes;
- showing project, source, device, agent, and execution status;
- helping the owner decide what to focus on today;
- answering management questions using current, attributable project data.

AllJobs is not:

- a multi-user or multi-tenant project management service;
- a general agent orchestration platform;
- an active-active filesystem synchronization system;
- an enterprise approval, resource-planning, or workflow engine;
- a second canonical Backlog for code projects;
- a plugin marketplace or general extension platform.

The current Paper Workbench design system remains the UI baseline. The retired Star Atlas / “星图坐标册” direction is not part of this roadmap. UI work refines the current information architecture, density, components, and interaction quality rather than restarting the visual direction.

## 3. Governing decisions

### 3.1 Canonical planning source

For a code project, the repository's `docs/ROADMAP.md` and `docs/BACKLOG.md` remain the only canonical Roadmap and Backlog documents. AllJobs must not maintain a second editable planning copy.

When a project has a healthy Control Host workspace, read precedence is:

1. the Control Host local working tree, including uncommitted planning changes;
2. the configured Git remote or managed bare mirror when the local workspace is unavailable;
3. the last valid cached projection when neither live source is available.

Every surface must show whether it is displaying local working-tree data, a remote commit, or a cached snapshot.

### 3.2 Restricted Backlog write-back

AllJobs may directly modify only the following fields on an existing Backlog Item:

- `priority`;
- `rank`.

`rank` is scoped to a Phase. Execution preference within a Phase is derived from priority, rank, dependencies, readiness, and current claims. Markdown section order remains editorial and does not silently become execution order.

Direct write-back targets the Control Host local `docs/BACKLOG.md`. It must:

- preview the exact field-level change;
- require explicit owner confirmation;
- re-read the file and target item immediately before writing;
- reject stale file or item digests without modifying the file;
- preserve all unrelated content and uncommitted work;
- record the action in AllJobs activity history;
- avoid automatic commit, push, or merge.

If a writable, validated Control Host workspace is unavailable, the operation degrades to a proposal.

AllJobs does not directly create a new Backlog Item. New items and substantive changes to title, problem statement, acceptance criteria, dependencies, Phase, status, or technical content become proposals for a repository agent to review and apply with project context.

### 3.3 Agent boundary

AllJobs does not start, stop, or remotely control coding agents.

An already-running agent may:

- ask AllJobs for the next eligible Backlog Item;
- claim an item returned by the queue;
- report heartbeats and structured work-stage events;
- release, block, or finish a claim.

AllJobs may schedule the queue and prevent duplicate claims, but work begins only when an external agent requests it. Completing an execution run does not automatically mark the canonical Backlog Item as done.

### 3.4 Self-use complexity budget

The application continues to use one Control Host and file-based native storage. The roadmap does not introduce a database, message broker, microservices, role system, plugin SDK, vector database, or general workflow engine without evidence that the current design cannot meet a real requirement.

Each phase must deliver the smallest complete daily-use improvement and then gather real usage before the next phase is fully designed.

## 4. R1 — Backlog Control

### Outcome

The owner can safely adjust the priority and Phase-local order of existing Backlog Items from AllJobs while the repository document remains canonical.

### Scope

- add a stable Phase-local `rank` contract;
- display Backlog Items ordered by Phase, priority, rank, dependencies, and readiness;
- support priority changes and drag-based ordering for existing items;
- show the exact proposed diff before write-back;
- apply narrow field-only mutations to the local Backlog document;
- detect stale files, stale items, missing IDs, duplicate IDs, invalid Phase bindings, and dependency errors;
- generate structured, copyable proposals for new items;
- record successful and rejected operations in activity history;
- correct planning-health and idempotency problems revealed by current production use.

### Exclusions

- direct creation of new Backlog Items;
- editing technical content or completion criteria;
- automatic commit, push, or merge;
- global cross-Phase rank;
- agent execution state.

### Completion evidence

On at least one real code project, the owner can reorder and reprioritize existing items, inspect the resulting field-only diff, write safely to the current local Backlog, and observe stale-write rejection without losing unrelated work.

## 5. R2 — Multi-device Project Identity

### Outcome

One repository appears as one logical AllJobs Project even when it has workspaces on two or three computers.

### Scope

- identify a code project by normalized Git remote plus stable project identity rather than local path alone;
- register multiple device workspace bindings under one Project;
- record device alias, workspace path, branch, commit, reachability, and last observation;
- distinguish the Control Host read/write binding from informational remote-device bindings;
- separate adding or removing a device binding from archiving the Project;
- detect duplicate registration attempts and make registration idempotent;
- allow an explicit, revalidated change of the Control Host workspace binding;
- fall back to remote or cached read-only data when the Control Host workspace is unavailable.

### Exclusions

- active-active writes;
- device-to-device file synchronization;
- remote filesystem browsing;
- automatic cloning or moving repositories;
- treating a device path as project identity.

### Completion evidence

A pilot repository registered from the Control Host and observed on another device appears once, shows both bindings and their current revisions, and preserves a single controlled write location.

## 6. R3 — Planning / Management Assistant

### Outcome

An on-demand assistant can answer planning questions and generate useful Backlog proposals using attributable project context without becoming a coding agent or canonical planning source.

### Scope

- invoke the assistant explicitly from project and Console surfaces;
- read the Control Host local planning and architecture documents by default;
- bind each analysis to source paths, file digests, commit, and working-tree state;
- request owner approval before a one-time read-only source-code analysis when documents are insufficient;
- distinguish confirmed facts, inferences, recommendations, and questions;
- propose new Backlog Items, substantive edits, dependency changes, and clarifications;
- produce a handoff package that a repository agent can review and apply;
- answer management questions with sources and freshness timestamps.

### Exclusions

- direct creation of new Backlog Items;
- autonomous background analysis;
- persistent vector search or a separate long-term project memory;
- code modification or coding-agent behavior;
- silent application of recommendations.

### Completion evidence

Given a real natural-language request, the assistant produces a contextual proposal with evidence and explicit unknowns that can be handed to a repository agent without modifying the repository.

## 7. R4 — Agent Queue, Work State, and Backlog Companion

### Outcome

Running coding agents can pull eligible work from AllJobs, and the owner can continuously see what is being worked on, especially during long-running tasks.

### Derived queue

The queue is a projection, not a second canonical plan. Eligibility is derived from:

```text
selected Phase scope (primary active Phase by default)
+ ready status
+ priority
+ rank
+ satisfied dependencies
+ current claims
= items available to claim
```

AllJobs may let the owner pin, skip, or release a claim, but it does not execute the queue itself.
Projects with multiple active Phases retain separate Phase-local queues; the owner or requesting agent must select the non-primary Phase explicitly.

### Execution presence

- an already-running agent requests and claims the next eligible item;
- claims use a short-lived lease to prevent duplicate work;
- agents report heartbeats and structured stages such as analyzing, implementing, testing, blocked, and awaiting review;
- a stale heartbeat marks the run disconnected and eventually releases its lease;
- status includes agent, device, branch, current revision, elapsed time, and last activity;
- completion enters awaiting review and does not directly mark the Backlog Item done;
- event payloads exclude full terminal logs, source code, and secrets.

### Backlog Companion

R4 includes an independently addressable narrow AllJobs surface that can remain open beside a coding-agent window. It is a companion view, not a general plugin platform.

The companion shows:

- current Backlog Item, Phase, priority, and rank;
- outcome, Done When, dependencies, and blockers;
- agent, device, branch, and current execution stage;
- elapsed time, last heartbeat, and recent structured progress events;
- a small view of the next eligible queue items;
- clear disconnected, stale, blocked, and awaiting-review states.

The first version is a responsive AllJobs route with a stable URL and a target width of approximately 320–520 pixels. It does not require a Codex-specific extension or plugin SDK.

### Completion evidence

During a real long-running coding task, the owner can keep the companion beside the coding agent, observe the work target and recent progress, distinguish active work from a lost connection, and recover the view after refresh or a short disconnect.

## 8. R5 — UI Consolidation

### Outcome

Backlog and Task become the primary reading and action surfaces, with less duplication and navigation between Portfolio, Projects, and Tasks.

### Scope

- refine the current Paper Workbench design system;
- consolidate repeated planning content and actions;
- create a continuous Project workflow from Roadmap context to current Phase, Backlog, Tasks, and detail;
- unify search, filtering, detail presentation, proposal review, and mutation feedback;
- optimize desktop information density and provide task-focused narrow/mobile behavior;
- reuse R1–R4 capabilities rather than creating UI-only state;
- pass a new T3 information-architecture and rendered-mockup gate before implementation.

### Exclusions

- a new visual direction;
- Star Atlas / “星图坐标册” concepts;
- decorative dashboards or metrics without an action;
- duplicate object detail pages with separate behavior.

### Completion evidence

From one primary work entry, the owner can understand current work, switch project context, inspect and filter Backlog and Tasks, adjust permitted fields, and review proposals without navigating among redundant views.

## 9. R6 — Console Dashboard

### Outcome

The Console becomes the daily entry point for understanding today's work, planning health, agent state, system health, and approximate usage.

### Scope

The Console contains four concise groups:

- **Today:** active, blocked, waiting, awaiting review, pending proposals, and immediate next work;
- **Planning:** current Phase, ready Backlog, progress, and blockers by project;
- **Agents:** online, disconnected, claimed work, and recent completions;
- **System:** workspace, remote, mirror, refresh, and document-health status.

The R3 management assistant is embedded in the Console and can directly answer questions about these views. It uses the same assistant contract and data sources rather than becoming a second agent.

Initial usage reporting accepts structured agent reports for model, token count, duration, and optional cost. Existing local usage sources may be added through small adapters when they are available. Missing data is shown as not reported rather than estimated.

### Exclusions

- credential scraping;
- exact accounting or billing reconciliation;
- a separate analytics service;
- vanity metrics without a management decision;
- background autonomous assistant activity.

### Completion evidence

Within one minute of opening the Console, the owner can determine today's focus, current blockers, active or disconnected agents, planning-source problems, and the approximate reported resource usage.

## 10. R7 — Operations and KPI

### Outcome

Real business and operational projects can track outcomes with simple manual measures after the core planning workflow has proven stable.

### Scope

- complete the business Milestone and Task experience;
- support manually entered KPI and Measure observations;
- record target, current value, trend, observation time, and note;
- relate a KPI to a Milestone or operational Task;
- add a data-source connector only after a second real source requirement establishes a reusable pattern.

### Exclusions

- a general formula builder;
- automated ETL;
- complex business-intelligence reporting;
- speculative connectors without a pilot project.

## 11. R8 — Reliability and Long-term Maintenance

### Outcome

AllJobs remains recoverable and inexpensive to maintain as real data and activity accumulate.

### Evidence-driven scope

- backup and restore verification for native data and configuration;
- write-back history, failure records, and recovery guidance;
- device-binding revocation and disconnected-device cleanup;
- scoped credential rotation when remote agent reporting exists;
- activity-log retention and capacity control;
- measured performance and cache improvements;
- Project export and Control Host disaster recovery.

R8 does not pre-build a plugin platform. A common adapter is extracted only after at least two real integrations need the same boundary.

## 12. Dependencies and sequencing

```text
R1 Backlog Control
 └─ R2 Multi-device Project Identity
     ├─ R3 Planning / Management Assistant
     └─ R4 Agent Queue, Work State, and Backlog Companion
          └─ R5 UI Consolidation
              └─ R6 Console Dashboard

real business-project usage ──→ R7 Operations and KPI
observed operating evidence ──→ R8 Reliability
```

R3 and R4 may be designed independently after R2, but only one major phase should normally be under implementation at a time. This is a complexity-control choice for a self-use product, not a platform limitation.

## 13. Phase entry and completion gates

### Entry gate

A phase starts only when:

- it addresses an observed or explicitly approved problem;
- the daily-use outcome is clear;
- it does not duplicate a repository-owned source;
- its predecessor has been used in production long enough to reveal obvious issues;
- its own design, scope, and rollback boundary have been approved.

### Completion gate

A phase is complete only when:

- its main journey works on at least one real project;
- source, freshness, write authority, and failure state are visible;
- failures do not overwrite human repository work;
- relevant skills, operating instructions, and recovery guidance are current;
- required automated, browser, responsive, and accessibility checks pass;
- high-risk changes retain a Human Gate, independent review, verification, and rollback evidence;
- the released build receives a short real-use observation window.

## 14. Prioritization and change control

Candidate work is ranked by:

1. preventing planning-data loss, overwrite, or source confusion;
2. improving high-frequency Backlog, Task, and current-work activities;
3. reducing repeated work across projects and devices;
4. improving agent transparency and management efficiency;
5. adding statistics and longer-term optimization;
6. visual-only improvements that do not improve work efficiency.

New ideas enter a candidate area by default and do not silently expand the active phase. Production incidents may interrupt the sequence. Other scope changes require an explicit Roadmap revision or are deferred to a later phase.

The roadmap carries no fixed dates until the current phase has an approved design and implementation estimate. R7 and R8 stay intentionally broad until real usage provides their detailed requirements.

## 15. Next step

After written Roadmap review, begin a separate architectural design for R1 only. R1 must resolve the local-source contract, Phase-local rank schema, exact field-only mutation semantics, stale-write behavior, proposal handoff, UI states, tests, and release gates before implementation planning begins.
