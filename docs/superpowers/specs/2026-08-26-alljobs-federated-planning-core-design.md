# AllJobs Federated Planning Core Design

**Status:** Confirmed design direction; pending Human Owner review of this written specification
**Date:** 2026-08-26
**Scope:** Planning Core domain and source-of-truth architecture
**Tier:** T3 — new core navigation, data contracts, write paths, and migration
**Implementation authorization:** None. This document does not authorize product code, data migration, deployment, or external writes.

## 1. Purpose

AllJobs must let one owner understand and manage planning across two project types:

- `code`: software and technical development;
- `business`: commercial, operational, supplier, compliance, GTM, and offline work.

The system must aggregate planning without creating a second source of truth for code repositories. Code planning stays close to the repository and its coding agents. Business planning and non-development work can be owned directly by AllJobs.

The design must support projects that simultaneously contain implementation and ongoing operations. It must not force a project through an exclusive implementation-to-operations lifecycle.

## 2. Core decisions

1. Project type and work mode are separate concepts.
2. `work_modes` is a controlled multi-value field, not a free-form tag.
3. Code Roadmaps and Backlogs are canonical in fixed documents inside the code repository; AllJobs reads them without writing back.
4. Business Roadmaps and Tasks are canonical in AllJobs Markdown.
5. Business projects do not use Backlog.
6. Tasks are source-owned objects. A project may contain both read-only external Tasks and writable AllJobs-native Tasks.
7. AllJobs does not persist a second Markdown copy of external Roadmaps, Backlogs, or Tasks.
8. KPI and Measure are a second-priority extension. Their domain contract is designed here, but V1 does not require live data-source integrations.

## 3. Project model

Each project has one required type, one or more controlled work modes, an operational status, and free-form tags.

```yaml
title: TradeLinks
type: code
work_modes: [implementation, operations]
status: active
priority: P0
agents: [codex, claude, joey]
tags: [commerce, intelligence]
```

### 3.1 Fields

| Field | Contract |
|---|---|
| `type` | Required: `code \| business` |
| `work_modes` | Required non-empty array: `implementation \| operations`; both may coexist |
| `status` | Required operational status: `active \| blocked \| paused \| done` |
| `priority` | Portfolio-wide `P0 \| P1 \| P2`; only the planning owner changes it unless explicitly delegated |
| `agents` | Agents or humans commonly responsible for work; not an authorization mechanism by itself |
| `tags` | Free-form classification only; tags never trigger schema or UI requirements |

### 3.2 Work-mode rules

- `implementation` requires at least one configured Roadmap source.
- `operations` allows Tasks immediately, allows operational Backlog for code projects, and enables KPI/Measure surfaces when that extension is introduced.
- `[implementation, operations]` means both bodies of work are active. It is not a transitional state.
- Removing a work mode never deletes its historical objects. The objects remain visible as inactive or completed history.

## 4. Canonical domain

```text
Project
├── Roadmap
│   └── RoadmapItem
│       ├── Phase       when project.type = code
│       │   ├── BacklogItem
│       │   │   └── Task reference(s)
│       │   └── Task reference(s)
│       └── Milestone   when project.type = business
│           └── Task reference(s)
├── Operational BacklogItem(s) when project.type = code
├── Project-level Task(s)
└── KPI / Measure(s)    second priority, when operations is enabled
```

### 4.1 Roadmap

A Roadmap is one project-scoped aggregate containing ordered Roadmap Items. It answers what major outcomes the project is moving toward and what is current or next.

AllJobs uses one normalized `RoadmapItem` model. Project type determines its valid kind and label:

- code project: `kind: phase`, shown as **Phase**;
- business project: `kind: milestone`, shown as **Milestone**.

Common Roadmap Item fields:

```yaml
id: phase-8
kind: phase
status: active
focus: primary
order: 30
start: 2026-08-01
target: 2026-09-15
```

Rules:

- `status`: `planned \| active \| paused \| done \| cancelled`;
- multiple items may be `active` because real projects contain parallel work;
- at most one active item per project may have `focus: primary`;
- `order` must be unique within one Roadmap;
- Roadmap Item IDs are stable and unique within the project;
- rename does not change ID;
- cancelled items remain historical and do not enter progress denominators;
- missing, duplicate, or cross-project references produce `ProofIssue` records.

### 4.2 Backlog

Backlog exists only for code projects. It represents unresolved outcomes, problems, capabilities, or requirements within a Phase.

Each code project has one canonical Backlog document. Each item is a stable section inside that document rather than a separate file.

Required fields:

```yaml
work_mode: implementation
phase: phase-8
status: ready
priority: P0
owner: joey
dependencies: []
```

Rules:

- `status`: `idea \| ready \| doing \| blocked \| done \| cancelled`;
- `priority`: portfolio-comparable `P0 \| P1 \| P2`;
- `work_mode` is required and is `implementation \| operations`;
- an implementation Backlog Item must belong to a Phase in the same project;
- an operational Backlog Item may belong directly to the Project or optionally to a relevant Phase;
- dependencies may reference Backlog Items in the same project only in V1;
- self-dependency and dependency cycles are invalid;
- `done` requires the item's Done When contract to be satisfied by owner judgment; Task counts alone do not mark it done;
- cancelled items do not enter progress denominators;
- document order is editorial only and never defines priority or execution order.

### 4.3 Task

A Task is a concrete execution unit. Task ownership is decided per object rather than per project.

Task relations are mutually exclusive:

```yaml
backlog: TL-BL-012
```

or:

```yaml
roadmap_item: phase-8
```

or neither, which makes it a project-level Task.

Rules:

- every Task must belong to a Project;
- `backlog` and `roadmap_item` may not both be set;
- binding a Task to a Backlog derives its Phase when that Backlog Item is Phase-bound;
- binding a Task to a Backlog also derives its `work_mode` from that Backlog Item;
- binding a Task directly to a Roadmap Item derives `work_mode: implementation`;
- a project-level Task must declare `work_mode: implementation \| operations` explicitly;
- code Tasks may bind to a Backlog, Phase, or Project;
- business Tasks may bind to a Milestone or Project;
- independent Tasks do not contribute to Roadmap progress;
- `status`: `todo \| doing \| waiting \| blocked \| done \| cancelled`;
- `waiting` describes normal dependence on an external party or event and should include `waiting_on` and `follow_up_on` when known;
- `blocked` means progress cannot continue and requires a blocking reason;
- external and native Tasks use namespaced identity and never silently represent the same canonical object.

Example native Task:

```yaml
id: AJ-T-021
project: alljobs
status: doing
source:
  provider: native
backlog: AJ-BL-004
owner: joey
executor: codex
```

Example external Task projection:

```yaml
id: grande:task-alljobs-ui-001
project: alljobs
status: doing
source:
  provider: grande
  ref: task-alljobs-ui-001
roadmap_item: phase-8
```

`owner` is the accountable planning owner. `executor` is the human, agent, supplier, or system performing the work.

## 5. Federated source-of-truth model

| Object | Code project | Business project | AllJobs behavior |
|---|---|---|---|
| Project | AllJobs native | AllJobs native | Read/write |
| Roadmap | Code repo Markdown | AllJobs native Markdown | External read-only; native read/write |
| Phase/Milestone | External Phase | Native Milestone | Source-owned |
| Backlog | Code repo single document | Not supported | External read-only |
| Task | External read-only and/or AllJobs native | Primarily AllJobs native; external allowed | Per-object source ownership |
| KPI/Measure | AllJobs native, priority 2 | AllJobs native, priority 2 | Read/write when introduced |
| Activity/Log | AllJobs native | AllJobs native | Read/write |

### 5.1 Source ownership invariant

Every object has exactly one canonical owner. AllJobs may normalize and display objects from different sources, but it never creates an editable mirror of an externally owned object.

An explicit manual conversion may create a new native Task from an external Task. The new Task receives a new native ID and retains `origin_ref`; it is not synchronized with the original.

### 5.2 Source binding

A code project records a trusted repository binding in its AllJobs project file:

```yaml
planning:
  provider: repo-markdown
  repo: ~/AgentWorks/CodeSpace/tradelinks
```

For `repo-markdown`, V1 paths are fixed:

```text
docs/ROADMAP.md
docs/BACKLOG.md
```

Every code project configures `docs/BACKLOG.md`, including code projects doing only operational work. `docs/ROADMAP.md` is required when `implementation` is present in `work_modes`; otherwise it may be absent.

AllJobs must resolve the repository from the registered project binding, enforce containment within the trusted repository, reject symlinks that escape it, and never accept arbitrary request-provided paths.

If a code project lacks its required binding or document, AllJobs reports `Planning source not configured` or the specific missing document. It does not create a native substitute.

## 6. Projection and caching

AllJobs performs:

```text
canonical source
  → read
  → parse and validate
  → normalize
  → derive
  → render
```

V1 does not persist a second Markdown or JSON copy of external Roadmaps, Backlogs, or Tasks.

It may use an in-memory cache keyed by source path, modification time, and content hash. That cache:

- is not canonical;
- is not committed to Git;
- is not editable;
- is invalidated when source content changes;
- never becomes a fallback write target.

The UI exposes provenance for external data: provider, repository, source path, source commit when available, content hash, and last successful read time.

A persistent last-known snapshot is outside V1. It may be reconsidered only if real use shows that temporary source unavailability materially harms daily planning.

## 7. Fixed repository document contracts

### 7.1 `docs/ROADMAP.md`

The document contains one section per stable Roadmap Item:

````md
# Roadmap

## phase-8 — Flow Simplification

```yaml alljobs
kind: phase
status: active
focus: primary
order: 30
start: 2026-08-01
target: 2026-09-15
```

Reduce execution ceremony while preserving safety boundaries.
````

The heading owns `id` and title. The first `yaml alljobs` block owns structured metadata. The remaining section body is human-readable context.

### 7.2 `docs/BACKLOG.md`

The document contains one section per stable Backlog ID:

````md
# Backlog

## TL-BL-012 — Native toolchain support

```yaml alljobs
work_mode: implementation
phase: phase-8
status: ready
priority: P0
owner: joey
dependencies: []
```

### Problem

Bootstrap currently depends on an external toolchain.

### Done When

- [ ] Native initialization succeeds
- [ ] Regression verification passes

### Notes

Implementation detail belongs in the executor, not here.
````

The parser splits items by level-two headings, validates the stable ID, reads the first `yaml alljobs` block, and treats the remainder as human-readable content. A malformed item creates an item-scoped `ProofIssue` without hiding healthy items.

## 8. AllJobs-native file contracts

Business projects and native Tasks use:

```text
data/projects/<slug>.md
data/roadmaps/<slug>.md
data/tasks/<slug>.md
data/log/<YYYY-MM-DD>.md
data/kpis/<slug>.md       priority 2
```

`data/roadmaps/<slug>.md` uses the same Roadmap section grammar as repository Roadmaps, with `kind: milestone` for business projects.

`data/tasks/<slug>.md` contains one stable section per native Task. It replaces the current line-number identity while retaining one file per project for efficient agent maintenance.

Native writes must use content-digest preconditions, targeted section edits, validation before replacement, and atomic file replacement. A stale digest returns a conflict and never overwrites newer content.

## 9. Agent skill contract

One `alljobs-planning` skill teaches coding and business agents how to inspect and modify the correct canonical source. The skill does not become a database or authority service.

### 9.1 Code-project mode

The agent must:

1. resolve the current trusted repository;
2. read `docs/ROADMAP.md` and `docs/BACKLOG.md` before proposing a change;
3. locate objects by stable ID rather than line number;
4. record the baseline content digest;
5. edit only the authorized section and avoid whole-file reformatting or reordering;
6. reject stale content and reread before retrying;
7. validate IDs, schema, Phase relations, dependencies, and cycles;
8. report the exact diff and validation result;
9. preserve Git history through the repository's normal workflow.

### 9.2 Business-project mode

The agent must:

1. resolve the configured AllJobs workspace and project slug;
2. read the Project, Roadmap, Task, and relevant Log files;
3. edit only the native files for that project;
4. use stable IDs and digest-protected targeted sections;
5. validate schema and relations before atomic replacement;
6. append a concise Activity/Log entry for a meaningful change;
7. return a structured change proposal instead of claiming success when it lacks workspace access.

### 9.3 Human Gate

Without explicit owner authorization, an agent may:

- update the status and Outcome of a Task it is executing;
- record an execution reference;
- report evidence and suggest a planning change.

Without explicit owner authorization, an agent may not:

- change Project priority;
- reorder Roadmap Items or change the primary focus;
- alter a Phase/Milestone target date;
- change the core meaning of a Backlog Problem or Done When;
- redefine a KPI, Measure formula, target, or source;
- convert an external object into a native object.

Creating a Task is allowed only when the current human request or repository instructions clearly authorize that scope.

## 10. Derived state

Derived state is never written back as a second fact.

### Code Phase

Display Backlog status counts. V1 does not display a percentage because Backlog Items are not equal-size units.

### Code Backlog

Display related Task counts by status when Tasks are available. Task completion does not automatically satisfy Done When.

### Business Milestone

Display related Task counts and milestone status. Absence of Tasks is shown as `Not decomposed`, not `0%`.

### Attention signals

Attention may derive:

- blocked Roadmap Items, Backlog Items, or Tasks;
- waiting Tasks whose `follow_up_on` is due;
- overdue and due-soon Tasks;
- stale external sources;
- invalid or missing source relations;
- active Roadmap Items with no current Tasks or Backlog movement.

## 11. KPI and Measure extension — priority 2

KPI and Measure belong to operational work, not to the implementation hierarchy.

```text
Project
└── KPI
    └── Measure observation(s)
```

Provisional contract:

```yaml
id: revenue-jp
title: Japan revenue
direction: increase
target: 1000000
unit: JPY
period: monthly
source:
  provider: manual
```

The first release of this extension may support manual observations only. Live connectors, formulas, refresh schedules, credential handling, and source reconciliation require a separate design and Human Gate. KPI definitions remain owner-controlled; agents may submit evidence but cannot silently change the measurement contract.

## 12. Read and write states

Every Planning surface must distinguish:

- source not configured;
- source file missing;
- healthy external read;
- partially valid source with item-scoped issues;
- source unavailable;
- stale external data;
- native empty state;
- native validation failure;
- pending native write;
- successful native write;
- stale-write conflict;
- filesystem failure;
- read-only external object;
- unsupported provider.

The later T3 UI brief must define visible feedback, recovery action, focus behavior, screen-reader announcements, desktop/mobile layout, and keyboard alternatives for each applicable state. This domain specification does not select the final Planning navigation or visual composition.

## 13. Migration and compatibility

1. Reconcile the current repository baseline and authoritative design documents before implementation.
2. Map project types: current `code` remains `code`; current `biz` and `ops` become `business`; each current `product` project requires owner classification because the label is ambiguous.
3. Add `work_modes` without inferring lifecycle from historical status.
4. Pilot the external document contract in one real code project and the native contract in one real business project.
5. Introduce read-only parsers and validation before any new write UI.
6. Migrate only active current Tasks to stable-section identity through a dry-run report reviewed by the owner.
7. During compatibility, legacy and structured Tasks must have an explicit read precedence and cannot both own the same logical Task.
8. Enable digest-protected native writes only after conflict, filesystem-failure, and rollback tests pass.
9. Remove the legacy line parser only when the migration report shows zero unresolved active Tasks, zero duplicate identities, and zero broken relations.

Rollback keeps the old parser and files intact until cutover acceptance. New structured files remain additive until that gate.

## 14. V1 scope

V1 includes:

- `type` and `work_modes` project contract;
- repo-markdown Roadmap and single-file Backlog parsers;
- AllJobs-native business Roadmaps and native Tasks;
- normalized source-owned identities and read-only provenance;
- relation validation and item-scoped ProofIssue reporting;
- derived counts and Attention inputs;
- digest-protected, atomic native Task and business Roadmap writes;
- the `alljobs-planning` skill contract;
- a code-project and business-project pilot fixture;
- dry-run migration and rollback gates.

V1 excludes:

- a persistent external-data snapshot;
- bidirectional synchronization;
- automatic editing of repo-owned planning from AllJobs;
- a database or realtime collaboration;
- KPI live connectors and automated Measure ingestion;
- automatic prioritization or autonomous Roadmap changes;
- execution-system state-machine duplication;
- final UI navigation, mockup, and implementation details, which require a separate T3 UI brief.

## 15. Acceptance criteria

The design is implementation-ready only when the implementation specification can prove:

1. one real code repository is parsed from fixed Roadmap and Backlog files without any duplicated canonical copy;
2. one real business project can maintain Milestones and Tasks entirely in AllJobs;
3. one code project can display external Tasks and native non-development Tasks together without identity collision or synchronization;
4. native Tasks can reference external Phase or Backlog IDs without copying those objects;
5. malformed sections isolate their own failure and identify source file, object ID, and field;
6. stale native writes are rejected and never overwrite newer content;
7. external objects are visibly read-only and expose their provenance;
8. business projects cannot create Backlog, implementation Backlog cannot omit its Phase, and no Backlog can reference a missing or foreign Phase;
9. waiting, blocked, cancelled, and independent Tasks produce the specified derived behavior;
10. migration dry-run counts every retained, ignored, duplicate, and invalid Task and supports rollback before cutover.

## 16. Confirmed design summary

```text
Project type       = code | business
Project work mode  = implementation and/or operations

Code Roadmap       = repo-owned Phase document, AllJobs read-only
Code Backlog       = one repo-owned Backlog document, AllJobs read-only
Code ops Backlog   = project-level or optionally Phase-bound in the same document
Business Roadmap   = AllJobs-owned Milestone document
Business Backlog   = not used

Task               = external read-only or AllJobs-native writable
Task relation      = Backlog, Roadmap Item, or Project

External data      = normalized projection, never an editable duplicate
Agent behavior     = fixed file contract + skill + digest validation + Human Gate
KPI / Measure      = operational extension, priority 2
```
