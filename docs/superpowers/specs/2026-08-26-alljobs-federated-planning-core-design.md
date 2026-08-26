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
9. Project registration is two-phase and Human-gated. Archive replaces a separate unbind operation and preserves inactive binding metadata for audit and restoration.
10. The current AllJobs development machine is the single Control Host. Other computers participate through the browser and Git; V1 has no active-active AllJobs deployment.
11. A Project may record multiple execution-location aliases, but machine location never becomes a planning source, credential, or write authorization.

## 3. Project model

Each project has one required type, one or more controlled work modes, an operational status, and free-form tags.

```yaml
title: TradeLinks
type: code
work_modes: [implementation, operations]
registration_status: registered
status: active
priority: P0
agents: [codex, claude, joey]
execution_locations: [alljobs-host, daily-work]
tags: [commerce, intelligence]
```

### 3.1 Fields

| Field | Contract |
|---|---|
| `type` | Required: `code \| business` |
| `work_modes` | Required non-empty array: `implementation \| operations`; both may coexist |
| `registration_status` | Required: `registered \| archived`; controls discovery, provider reads, writes, and default visibility |
| `status` | Required operational status: `active \| blocked \| paused \| done` |
| `priority` | Portfolio-wide `P0 \| P1 \| P2`; only the planning owner changes it unless explicitly delegated |
| `agents` | Agents or humans commonly responsible for work; not an authorization mechanism by itself |
| `execution_locations` | Optional machine aliases where work or runtime may occur; informational only and may contain multiple values |
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

A code project records a Git source binding in its AllJobs project file:

```yaml
planning:
  provider: git-markdown
  remote: git@github.com:agentjoey/tradelinks.git
  ref: refs/heads/main
```

For `git-markdown`, V1 paths are fixed:

```text
docs/ROADMAP.md
docs/BACKLOG.md
```

Every code project configures `docs/BACKLOG.md`, including code projects doing only operational work. `docs/ROADMAP.md` is required when `implementation` is present in `work_modes`; otherwise it may be absent.

AllJobs resolves the registered remote and ref into a managed read-only bare mirror at `~/.alljobs/mirrors/<project>.git`. It reads planning documents from one exact resolved commit. Paths must remain inside that Git tree; AllJobs rejects absolute paths, `..`, symlink escapes, and request-provided path overrides.

If a code project lacks its required binding or document, AllJobs reports `Planning source not configured` or the specific missing document. It does not create a native substitute.

### 5.3 Project registration

The registered project set is represented by `data/projects/<slug>.md`; V1 does not add a separate database registry.

Code-project discovery is read-only and restricted to direct children of configured trusted code-workspace roots on the Control Host. Discovery inspects the local candidate and its configured Git remote without fetching. It rejects arbitrary absolute paths, cwd-based candidates, globs, recursive depth, symlink escapes, and caller-supplied force flags.

A project that exists only on another computer must first be committed and pushed to a Git remote, then cloned or staged on the Control Host through a separate human-authorized operation before discovery. V1 does not reach directly into another computer's filesystem.

Business projects are not discovered from the filesystem. Their registration starts from an explicit owner request containing the proposed project identity and native planning configuration.

Registration is two-phase:

```text
inspect candidate
  → produce registration proposal + proposalDigest
  → Human Gate
  → re-inspect candidate and current registry
  → apply only when digest and preconditions still match
```

The proposal includes:

- proposed project slug, title, type, work modes, and status;
- trusted candidate path, Git remote, ref, and provider for code projects;
- presence and validation summary for required planning documents;
- source file fingerprints and repository commit when available;
- project-slug, source-path, and provider-identity collisions;
- AllJobs Project and Activity/Log records that registration will create;
- blocking issues and warnings.

Inspect and proposal perform zero writes, installs, network calls, candidate-code execution, external-document initialization, or task creation.

Apply rules:

- the proposal digest covers the complete proposed binding and inspected source state;
- changed source or registry state returns `STALE_STATE` with zero writes;
- registering an already registered identical project is idempotent;
- the same trusted source cannot be actively registered under two project slugs;
- a project slug cannot be rebound to another source through registration; archive and a new reviewed proposal are required;
- after Human approval, apply may clone or fetch into a temporary bare-mirror staging path; it verifies the resolved ref and inspected source state before atomically promoting the mirror;
- a mismatch removes the temporary staging state, returns `STALE_STATE`, and creates no Project record;
- successful registration writes only the AllJobs Project record, Activity/Log entry, and managed bare mirror;
- initializing or repairing external `docs/ROADMAP.md` and `docs/BACKLOG.md` is a separate Human-gated agent workflow.

### 5.4 Archive and restore

Archive is the only V1 unbind operation. It changes `registration_status` from `registered` to `archived`; it does not delete the Project or mutate external sources.

An archive proposal reports active native Tasks, unresolved external references, current provider binding, and affected Planning surfaces. Human confirmation authorizes the whole-project archive even when active work remains; the action never silently completes or cancels those objects.

After archive:

- the Project is excluded from Today, Attention, Roadmap, Backlog, Board, Stats, and the default Project list;
- provider reads stop;
- native Roadmap, Task, KPI, and Project-content writes are rejected;
- Project data, native objects, Log, Outcome, and provenance remain available in an explicit Archived view;
- external references remain historical references and are not deleted;
- provider path and binding metadata remain stored but inactive;
- the managed Git mirror may remain as an inactive transport replica, but it is not fetched or exposed through active Planning views;
- external Roadmap, Backlog, and Task content is not copied into AllJobs-native Markdown or a normalized snapshot;
- an archive Activity/Log event records actor, time, reason, and the approved proposal digest.

Restore is also two-phase and Human-gated. It revalidates the inactive binding, trusted-root containment, source availability, required documents, schema, relations, current registry collisions, and content digest. A valid approved restore changes only `registration_status` back to `registered` and records a restore event.

If the source moved, changed identity, escaped the trusted workspace, or now collides with another registration, restore is rejected. For an archived slug, a new reviewed registration proposal may replace its inactive binding only after the proposal explicitly identifies the binding change and passes the Human Gate.

V1 provides no destructive project-delete operation.

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

V1 does not persist a second AllJobs-native Markdown copy or normalized JSON projection of external Roadmaps, Backlogs, or Tasks. The managed bare mirror is the transport replica and remains source-owned Git data.

The managed bare mirror is a standard Git transport replica, not an AllJobs-owned planning copy. AllJobs may additionally use an in-memory parsed cache keyed by resolved commit, document path, and blob hash. That parsed cache:

- is not canonical;
- is not committed to Git;
- is not editable;
- is invalidated when source content changes;
- never becomes a fallback write target.

The UI exposes provenance for external data: provider, remote, ref, resolved commit, document path, blob hash, last successful fetch, freshness state, and last fetch error when present.

A persistent normalized last-known snapshot separate from the Git mirror is outside V1. It may be reconsidered only if real use shows that mirror-based stale reads are insufficient.

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
9. preserve Git history through the repository's normal workflow;
10. commit and push the planning change to the registered ref before expecting AllJobs to display it.

### 9.2 Business-project mode

The agent must:

1. resolve the configured AllJobs workspace and project slug;
2. read the Project, Roadmap, Task, and relevant Log files;
3. edit only the native files for that project;
4. use stable IDs and digest-protected targeted sections;
5. validate schema and relations before atomic replacement;
6. append a concise Activity/Log entry for a meaningful change;
7. return a structured change proposal instead of claiming success when it lacks Control Host workspace access;
8. from another computer, use a reviewed Git branch or patch handoff rather than writing the Control Host through a shared filesystem.

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

- registration candidate found;
- registration proposal ready;
- registration collision;
- registration or restore proposal stale;
- registered project;
- archive proposal with active-work warning;
- archived project;
- restore blocked by source or schema drift;
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

## 13. Deployment topology

### 13.1 Machine roles

The physical machine currently hosting the AllJobs repository is the V1 **Control Host**. It is the only machine allowed to run the production AllJobs writer and Cloudflare Tunnel.

```text
Phone / development machine / daily-work computer
                │
                │ Browser through Cloudflare Access
                ▼
Current development machine — AllJobs Control Host
├── production AllJobs checkout
├── Next.js server on 127.0.0.1:3456
├── AllJobs-native data and local write authority
├── provider-refresh worker
├── managed read-only Git mirrors
└── cloudflared tunnel
                ▲
                │ read-only git fetch
                │
          registered Git remotes
                ▲
                │ commit + push
                │
development and work computers running project agents
```

Other computers are:

- browser clients of the Control Host;
- execution locations for projects and agents;
- Git writers for their own code repositories;
- proposal producers for AllJobs-native changes when they cannot access the Control Host workspace.

They are not additional AllJobs servers and never share the production `data/` directory over LAN, NAS, iCloud, or another live filesystem-sync mechanism.

Project `execution_locations` may name these machines for filtering or handoff context, such as `alljobs-host` and `daily-work`. These aliases do not contain credentials, do not imply online status, and are never used to construct filesystem paths or authorize a provider read.

### 13.2 Control Host services

The Control Host runs:

1. the production Next.js build through launchd;
2. `next start` bound to `127.0.0.1:3456`;
3. one Cloudflare Tunnel mapping `alljobs.agentjoey.ai` to that loopback listener;
4. a provider-refresh worker responsible for registered Git mirrors;
5. the canonical AllJobs-native Markdown under the production checkout's `data/` directory;
6. mutable provider state outside the repository under `~/.alljobs/`.

Recommended state layout:

```text
~/.alljobs/
  mirrors/<project>.git
  state/<project>.json
  locks/<project>.lock
  logs/
```

Git credentials, Cloudflare credentials, and provider errors containing sensitive remote details stay outside the repository. Read-only deploy keys or equivalently scoped credentials are preferred for mirrors.

The production checkout is a runtime and native-data checkout. Product-development agents on the same physical machine use separate Git worktrees and never point development servers or destructive tests at the production `data/` directory.

### 13.3 Source refresh

Page rendering reads only local mirrors and never performs a network fetch inline.

The refresh worker:

1. acquires a per-project lock;
2. fetches only the configured registered remote and ref;
3. resolves the ref to an exact commit;
4. reads Roadmap and Backlog blobs from that commit without checkout;
5. validates schema and relations;
6. atomically records the successful commit, blob hashes, fetch time, and validation result;
7. releases the lock.

The worker never merges, rebases, checks out code, installs dependencies, executes hooks, or runs candidate project code. Manual refresh requests enqueue the same bounded operation; they do not add a second fetch path.

The V1 default refresh interval is five minutes, plus explicit manual refresh. A deployment setting may change the interval only with owner approval; every interval uses the same single worker path and freshness metadata.

If fetch or validation fails:

- the last successfully fetched mirror commit remains readable;
- the Project is marked `stale` or `source unavailable` with the failure time;
- native AllJobs data remains writable for registered projects;
- the failed source is never replaced with empty data;
- no provider error may invalidate healthy projects.

Uncommitted or unpushed changes on another computer are intentionally invisible to AllJobs.

### 13.4 Cross-machine agent behavior

Coding agents on any computer update their repository's fixed planning documents, validate them, commit, and push. AllJobs displays the change after the Control Host refreshes the registered ref.

Business and non-development agents use one of two V1 paths:

- run on the Control Host and use the `alljobs-planning` skill against native files with digest protection; or
- produce a reviewed AllJobs Git branch or patch handoff from another computer, then let an authorized Control Host workflow merge and validate it.

V1 does not expose a cross-machine write API, accept direct SSH/file-share writes into `data/`, or let remote agents forge Human approval. A controlled remote write service may be designed later only if branch/patch handoff creates repeated real-world friction.

### 13.5 Availability and recovery

- If the Control Host sleeps, shuts down, loses network, or stops its tunnel, AllJobs is unavailable; V1 has no automatic failover.
- If a project computer is offline but its changes were pushed, AllJobs continues reading the Git mirror.
- If a Git remote is unavailable, AllJobs shows the last successful mirror commit as stale.
- If another computer has newer unpushed planning, AllJobs correctly continues showing the last pushed commit.
- AllJobs-native `data/` is canonical on the Control Host. Git history covers committed changes, and the Control Host's system backup covers the interval before commit; neither mechanism creates another active writer.
- Moving to another Control Host is a controlled recovery: stop the old web server, refresh worker, and tunnel; restore the repository, native data, provider configuration, mirrors or refetchable mirror bindings, and credentials; validate; then start the new single host.
- At no time may two Control Hosts write native data or serve the same production tunnel concurrently.

The current loopback binding and Cloudflare Access boundary remain mandatory. No other computer receives a LAN listener that can bypass Access.

## 14. Migration and compatibility

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

## 15. V1 scope

V1 includes:

- `type` and `work_modes` project contract;
- optional multi-machine `execution_locations` metadata with no authority semantics;
- trusted-workspace discovery, two-phase registration, archive, and restore;
- git-markdown Roadmap and single-file Backlog parsers;
- one Control Host on the current development machine;
- managed read-only bare mirrors and one bounded provider-refresh worker;
- freshness, stale-source, and last-successful-commit provenance;
- AllJobs-native business Roadmaps and native Tasks;
- normalized source-owned identities and read-only provenance;
- relation validation and item-scoped ProofIssue reporting;
- derived counts and Attention inputs;
- digest-protected, atomic native Task and business Roadmap writes;
- the `alljobs-planning` skill contract;
- a code-project and business-project pilot fixture;
- dry-run migration and rollback gates.

V1 excludes:

- destructive project deletion;
- recursive or arbitrary-path project discovery;
- active-active or automatic failover deployment;
- cross-machine shared-filesystem writes;
- direct reads of uncommitted or unpushed files on another computer;
- per-machine connector daemons and a remote native-data write API;
- a persistent normalized external-data snapshot separate from the managed Git mirror;
- bidirectional synchronization;
- automatic editing of repo-owned planning from AllJobs;
- a database or realtime collaboration;
- KPI live connectors and automated Measure ingestion;
- automatic prioritization or autonomous Roadmap changes;
- execution-system state-machine duplication;
- final UI navigation, mockup, and implementation details, which require a separate T3 UI brief.

## 16. Acceptance criteria

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
10. migration dry-run counts every retained, ignored, duplicate, and invalid Task and supports rollback before cutover;
11. registration inspect/proposal produces zero writes and stale apply returns `STALE_STATE` with zero writes;
12. duplicate registration is idempotent while slug, source, and provider collisions fail closed;
13. archive stops provider reads and native writes without deleting native or external objects;
14. archived projects disappear from active surfaces but remain available in an explicit Archived view;
15. restore revalidates trusted containment, source identity, schema, relations, collisions, and digest before reactivation;
16. exactly one Control Host owns production native writes and the Cloudflare Tunnel;
17. page rendering performs no network fetch and reads every external projection from one exact mirror commit;
18. a failed fetch preserves the last successful commit, marks the source stale, and does not affect healthy projects;
19. planning committed and pushed from another computer becomes visible after refresh, while unpushed changes remain invisible;
20. the refresh worker never checks out or executes candidate project code and never runs repository hooks;
21. Control Host recovery demonstrates stop-old-before-start-new and preserves native data, bindings, provenance, and Access boundaries;
22. one Project can name multiple execution locations without changing its Git source identity, canonical owner, or write permissions.

## 17. Confirmed design summary

```text
Project type       = code | business
Project work mode  = implementation and/or operations
Execution location = zero or more informational machine aliases
Registration       = trusted inspect/propose/apply with Human Gate
Archive            = stop reads and writes, retain inactive binding and history
Restore            = revalidate and Human-gate before reactivation
Deployment         = current development machine is the single Control Host
Other computers    = browser clients + project agents + Git writers
Code transport     = registered Git remote → Control Host bare mirror
Native writes      = Control Host only; remote agents use reviewed branch/patch handoff

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
