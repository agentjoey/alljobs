# AllJobs R1 — Backlog Control Design

**Status:** Draft for written review; design approved section-by-section by the Human Owner
**Date:** 2026-08-29
**Parent roadmap:** `docs/superpowers/specs/2026-08-29-alljobs-product-roadmap-design.md`
**Tier:** T3 — introduces a consequential repository write path and a new core Backlog management journey
**Implementation authorization:** None. Implementation planning begins only after written-spec approval.

## 1. Purpose

R1 evolves AllJobs from a read-only projection of code-project Backlogs into a narrowly controlled Backlog ordering tool.

The owner must be able to:

- see the current Control Host working-tree Roadmap and Backlog, including uncommitted planning changes;
- initialize a stable Phase-local Backlog order;
- change the priority and order of existing Backlog Items;
- preview the exact field changes before writing;
- preserve all unrelated repository content and uncommitted work;
- generate a copyable proposal for a new Backlog Item without writing it to the repository.

The repository's `docs/BACKLOG.md` remains the only canonical code-project Backlog. R1 does not create an editable AllJobs copy, automatically commit or push, or expand AllJobs into a general Markdown editor.

## 2. Baseline and problem

Planning Core V1 reads code-project Roadmaps and Backlogs from a managed Git mirror and serves the cached projection to the web application. Even when the provider receives a local repository path, it currently uses `git show <ref>:docs/...`, so uncommitted working-tree planning changes are not visible.

The existing Markdown mutation helper replaces and re-renders a complete section. That behavior is appropriate for AllJobs-native documents but does not satisfy R1's repository boundary because it can change field order, quoting, comments, whitespace, and other human-authored content.

R1 therefore requires two new isolated capabilities:

1. direct, read-only working-tree planning projection;
2. exact scalar-level patching for two permitted Backlog fields.

## 3. Decisions and non-goals

### 3.1 Decisions

- The Control Host local working tree is the preferred planning source when its registered workspace is available.
- A present but invalid local planning source is shown as invalid; remote content must not hide it.
- Remote mirror or cache is a fallback only when the local workspace is unavailable.
- Only a local working-tree projection can be writable.
- AllJobs may directly modify only `priority` and `rank` on existing Backlog Items.
- `rank` is scoped to `phase + priority`.
- R1 allows controlled writes when `docs/BACKLOG.md` already contains uncommitted changes.
- All writes use a two-phase Proposal → Human Gate → Apply protocol.
- Apply modifies the working-tree file but does not commit, push, merge, or refresh the remote mirror.
- New Backlog Items and substantive content changes remain repository-agent work.

### 3.2 Non-goals

- creating a new Backlog Item directly;
- editing title, body, status, Phase, dependencies, owner, Done When, or work mode;
- moving an item across Phases;
- editing Roadmap content;
- building a general Markdown or YAML editor;
- synchronizing workspaces across devices;
- supporting active-active write locations;
- adding a database, message broker, file watcher, or Git automation workflow;
- redesigning the full AllJobs information architecture;
- automatically committing, pushing, merging, or backing up repository files.

## 4. Source architecture

### 4.1 Planning Source Resolver

The project query uses a source resolver with the following precedence:

```text
registered code Project
  ├─ validated Control Host workspace available
  │    └─ LocalPlanningProvider
  └─ workspace unavailable
       └─ existing mirror/cache projection
```

The resolver never accepts a source path from a browser request. It starts from the registered Project and Control Host configuration.

When the workspace exists but a planning document is missing, malformed, unsafe, or unreadable, the resolver returns the local state and its issues. It does not silently fall back to an older remote document.

### 4.2 LocalPlanningProvider

The local provider reads only:

- `<registered workspace>/docs/ROADMAP.md`;
- `<registered workspace>/docs/BACKLOG.md`.

For every read it:

1. resolves the registered workspace through the existing trusted-root direct-child guard;
2. derives the two fixed planning paths server-side;
3. rejects path escape, symlinked planning files, and non-regular files;
4. rejects a planning file larger than 2 MiB;
5. reads file bytes directly from the working tree;
6. computes the complete file digest;
7. resolves the current HEAD commit when available;
8. determines whether each planning file differs from HEAD;
9. parses with the existing Roadmap and Backlog parsers;
10. validates project relations with the existing relation validator.

The provider performs no repository writes and does not execute project code.

### 4.3 Projection and provenance

The project view needs structured source state rather than encoding it in a revision string. The projection exposes:

- source mode: `local-working-tree | remote-commit | cached`;
- writable: boolean;
- non-writable reason when applicable;
- HEAD revision when available;
- Roadmap and Backlog file digests;
- per-document working-tree modification state;
- fetched/read timestamp;
- validation issues.

The visible source labels are:

- `LOCAL WORKING TREE · CLEAN`;
- `LOCAL WORKING TREE · MODIFIED`;
- `REMOTE COMMIT · READ ONLY`;
- `CACHED · READ ONLY`;
- `LOCAL SOURCE INVALID`.

Archived Projects are always non-writable.

## 5. Backlog ordering contract

### 5.1 Rank model

`rank` is an optional positive integer during adoption. It becomes operationally required for active Backlog Items after ordering is initialized.

The uniqueness scope is:

```text
project + phase + priority + rank
```

Backlog display order is:

```text
Phase
→ Priority (P0, P1, P2)
→ Rank ascending
```

`done` and `cancelled` items appear in a separate history area and do not require rank. Other statuses remain visible in their ranked group, but later queue eligibility is outside R1.

Markdown section order remains editorial. It is used only to initialize rank when a project has no canonical rank values.

### 5.2 Initialization

R1 must not invalidate existing Backlogs that do not contain rank.

Before ordering is initialized:

- the Backlog remains readable;
- an individual priority change remains available;
- drag and move controls are disabled;
- the UI offers a separate `Initialize ordering` proposal.

Initialization groups active items by `phase + priority`, preserves their current Markdown section order within each group, and proposes ranks `100, 200, 300, ...`.

Initialization never runs automatically and never changes physical section order.

### 5.3 Reordering

- Moving within a priority group changes only rank.
- Moving across priority groups changes the moved item's priority and target-group rank.
- Cross-Phase movement is rejected because Phase is not an allowed R1 mutation.
- When adjacent ranks have integer space, the moved item receives an integer between them.
- Moving to the end normally uses the current maximum plus 100.
- When no safe integer gap is available, only the target `phase + priority` group is renumbered to `100, 200, 300, ...`.
- The source group is not compacted after an item leaves it.
- Every changed item appears in the proposal preview.

### 5.4 Ordering repair

A dedicated repair proposal may correct:

- missing rank;
- duplicate rank;
- a rank sequence with no insertion space.

Ordinary drag operations are disabled until these ordering-specific issues are repaired. Repair remains subject to the same preview, digest, confirmation, and exact-patch controls.

## 6. Exact field patching

### 6.1 Supported metadata shape

The patcher supports only uniquely identifiable top-level block-style YAML scalar fields, for example:

```yaml
priority: P0
rank: 200
```

It must reject ambiguous or non-canonical forms that cannot be edited without reserialization, including:

- duplicate keys;
- flow-style maps;
- anchors, aliases, and merge keys affecting a permitted field;
- multiline or complex values for a permitted field;
- a metadata block or section that cannot be uniquely located.

### 6.2 Preservation rules

For an existing field, the patcher replaces only the scalar source range. For a missing rank, it inserts one line after priority using the file's current newline convention and local indentation.

It preserves:

- file newline convention;
- comments and inline comments;
- field order except for the insertion of missing rank;
- existing quoting outside the replaced scalar token;
- heading, title, body, and section order;
- all bytes outside the recorded patch ranges.

The patcher does not call the existing full-section renderer.

### 6.3 Semantic verification

Before writing, the server parses the original and proposed complete documents and verifies:

- section count, section IDs, titles, and bodies are unchanged;
- all metadata is unchanged except permitted priority/rank changes on declared affected items;
- every changed value satisfies the Backlog schema and ordering contract;
- the complete Roadmap/Backlog relation validation passes;
- bytes outside calculated patch ranges are unchanged.

Any mismatch fails closed.

## 7. Mutation protocol

### 7.1 Proposal input

The browser sends structured ordering intent only, such as:

- project slug;
- target item ID;
- target priority;
- placement before or after an item in the same Phase and target priority;
- expected source mode and file digest from the displayed view.

The client cannot submit a repository path, arbitrary field name, raw Markdown, shell command, or authoritative patch.

### 7.2 Proposal result

The server re-reads the local planning source and returns:

- project and fixed file location;
- HEAD and working-tree state;
- expected complete file digest;
- affected item IDs;
- exact before/after priority and rank values;
- whether group renumbering is required;
- a bounded field-level diff;
- validation warnings and blockers;
- a proposal digest covering all consequential inputs.

Proposal performs zero repository writes.

### 7.3 Apply

Apply receives the proposal payload and proposal digest, then:

1. acquires the AllJobs project lock;
2. reloads the Project and Control Host configuration;
3. repeats trusted-path and fixed-file validation;
4. reads the complete current Backlog;
5. compares its digest with the proposal's expected digest;
6. reconstructs the intended patch and proposal digest server-side;
7. rejects any mismatch;
8. applies the scalar-level changes in memory;
9. runs preservation and semantic verification;
10. writes a temporary file in the same directory with the original file mode;
11. atomically renames it over `docs/BACKLOG.md`;
12. records a bounded activity event;
13. returns the new digest and changed values.

The page then re-reads the local source. Apply does not perform Git operations.

### 7.4 Concurrency

The project lock serializes AllJobs operations. It cannot lock an IDE or repository agent, so the complete file digest is the authoritative optimistic-concurrency check.

A change anywhere in `docs/BACKLOG.md` after proposal returns `STALE_WRITE` and performs zero writes, even when that external change is unrelated to the target item. R1 does not automatically rebase or replay the user's ordering intent.

## 8. Error model

The mutation surface uses stable result codes:

| Code | Meaning | User action |
|---|---|---|
| `SOURCE_NOT_WRITABLE` | Current source is remote, cached, archived, missing, or not writable | Restore a valid local binding or use a proposal |
| `ORDERING_NOT_INITIALIZED` | Drag requested before active items have canonical rank | Initialize ordering |
| `INVALID_BACKLOG` | Structural or relation validation failed | Hand off issues to the repo agent |
| `FIELD_NOT_PATCHABLE` | Target YAML form cannot be changed exactly | Normalize through the repo agent |
| `STALE_WRITE` | File changed after the proposal | Refresh and repeat the operation |
| `RANK_CONFLICT` | Ordering is missing, duplicate, crowded, or ambiguous | Run ordering repair |
| `LOCKED` | Another AllJobs operation holds the project lock | Retry after it completes |
| `WRITE_FAILED` | Atomic replacement failed | Inspect the error; original file must remain intact |

Structural parsing failures, duplicate Backlog IDs, invalid Phase references, dependency cycles, Git conflict markers, unsafe paths, and ambiguous target sections disable all direct Backlog writes.

Ordering-only errors may be repaired through the dedicated rank initialization/repair flow.

## 9. Activity and recovery

Successful apply records:

- event type;
- project slug;
- affected item IDs;
- allowed field before/after values;
- previous and resulting file digests;
- timestamp.

The event excludes Backlog body content and secrets. Rejected proposals and applies may record a bounded failure code for operational diagnosis without storing the document.

R1 does not create hidden backup files inside a repository. Undo is a new proposal that restores recorded priority/rank values, and it succeeds only when the current file passes the normal stale-state checks.

## 10. User experience

### 10.1 Backlog layout

The existing project Backlog surface is grouped by Phase, then priority, then rank. History is folded separately. R1 retains the Paper Workbench visual language and does not perform R5's wider information-architecture consolidation.

### 10.2 Edit flow

1. Owner selects `Manage ordering`.
2. Desktop supports drag; keyboard and narrow/mobile views provide Move Up, Move Down, and Change Priority controls.
3. Changes remain a page-local draft and do not write immediately.
4. A draft bar shows the number of affected items and offers Review or Discard.
5. Review displays source, working-tree status, affected values, renumbering, file digest, and proposal digest.
6. Explicit confirmation triggers Apply.
7. Success re-reads the local file and shows the resulting digest and changed items.

Cross-Phase drop targets are unavailable and explain that Phase changes require a repository-agent proposal.

### 10.3 New-item proposal

R1 provides a small form for:

- title/problem;
- expected outcome;
- suggested Phase;
- suggested priority;
- draft Done When;
- notes.

It produces copyable repository-agent handoff text. R1 does not invoke AI, persist a second Backlog, or write the item. R3 later upgrades this entry point with context-aware assistance.

### 10.4 State matrix

| State | Required behavior |
|---|---|
| Loading | Show source read or proposal generation in progress |
| Empty | Valid empty Backlog with proposal guidance |
| Unranked | Reading and priority edit available; ordering disabled; initialize action visible |
| Editing | Page-local ordering draft visible |
| Reviewing | Exact field changes and provenance visible |
| Applying | Duplicate submission disabled |
| Success | New digest and affected items shown |
| Stale | Zero write; refresh required; previous intent summarized for reference |
| Locked | Explain temporary AllJobs contention and allow retry |
| Invalid | Show proof issues and repo-agent repair guidance |
| Read-only | Explain remote/cache/archive/non-writable source |
| Unavailable | Explain that no planning source can be read |

The core journey is T3. A rendered mockup covering realistic Backlog density, desktop, narrow/mobile, keyboard alternatives, reduced motion, and principal failure states requires Human Owner approval before production UI implementation.

## 11. Verification strategy

### 11.1 Unit tests

- Phase/Priority/Rank ordering and group renumbering;
- missing, duplicate, invalid, and crowded rank;
- scalar replacement and rank insertion;
- LF and CRLF preservation;
- comments, inline comments, quotes, Unicode, headings, and bodies unchanged;
- rejection of duplicate fields, complex YAML, conflict markers, and ambiguous sections;
- semantic-diff whitelist enforcement.

### 11.2 Boundary integration tests

Tests use temporary real Git repositories and filesystem boundaries to verify:

- uncommitted local Roadmap and Backlog content is read;
- local unavailability falls back to mirror/cache;
- invalid local content does not fall back and hide the issue;
- Proposal performs zero writes;
- Apply changes only allowed scalar ranges;
- any post-proposal file change produces `STALE_WRITE`;
- lock contention, symlink, path escape, archived Project, oversize file, and invalid relation produce zero writes;
- atomic-write failure preserves the original file;
- no commit, push, merge, or other Git mutation occurs.

### 11.3 UI-to-filesystem behavior tests

Critical tests cross the real boundary from rendered UI through the Server Action to a temporary repository file:

- initialize ordering;
- reorder within priority;
- move across priorities;
- keyboard and narrow/mobile ordering;
- stale proposal rejection;
- read-only and invalid source behavior;
- success re-read from the resulting local file.

The release also requires focused type, lint, component/integration, Playwright, accessibility, responsive, and final-build screenshot evidence under the repository's T3 workflow.

## 12. Delivery checkpoints

R1 is implemented and verified through three internal checkpoints:

1. local working-tree reading, provenance, and health;
2. rank initialization and field-level Proposal/Apply;
3. desktop drag, keyboard/narrow controls, and new-item handoff form.

These checkpoints do not become separate product Roadmap phases and do not independently authorize production release.

Before production write-back is enabled, the Human Owner selects one real code project with a currently valid Backlog as the pilot. The pilot must pass local read, initialization, write preview, Apply, stale rejection, and manual repository-diff inspection.

Independent Review focuses on trusted paths, exact patch boundaries, concurrency, and zero-Git-mutation guarantees. Independent Verification must cross browser → Server Action → real temporary or authorized pilot working-tree file. The Human Owner approves the final build and rollback evidence.

## 13. Rollback and observation

Application rollback restores the prior read-only behavior. Existing parsers ignore the additive rank field, so initialized repositories remain readable by the previous release.

AllJobs does not silently undo already confirmed repository edits during application rollback. A requested ordering undo uses the normal proposal protocol.

After release, observe:

- counts of `STALE_WRITE`, `INVALID_BACKLOG`, `FIELD_NOT_PATCHABLE`, and `WRITE_FAILED`;
- any unexpected repository diff;
- frequency of ordering initialization and priority/rank changes;
- whether the workflow reduces direct manual Backlog editing;
- how often formatting limitations require repository-agent repair.

Field-patcher support expands only when real usage demonstrates that a safe common format is being rejected frequently.

## 14. Acceptance criteria

R1 is acceptable when all of the following are demonstrated:

1. A Control Host code Project displays uncommitted local Roadmap and Backlog content as the preferred source.
2. Existing unranked Backlog Items remain readable and can be initialized only after a reviewed proposal.
3. The owner can reorder and reprioritize existing items within the allowed Phase/Priority rules.
4. Apply changes only permitted scalar fields and preserves all unrelated bytes and uncommitted work.
5. Any file change after proposal returns `STALE_WRITE` with zero writes.
6. Unsafe, invalid, archived, remote-only, or cached sources remain read-only with actionable explanations.
7. No R1 flow automatically commits, pushes, merges, executes repository code, or starts an agent.
8. A new Backlog Item request produces a copyable repository-agent proposal and never writes the item directly.
9. Required T3 mockup, independent review, independent verification, Human Gate, rollback, and final-build evidence are complete.

## 15. Next step

After the Human Owner approves this written specification, invoke the writing-plans workflow to produce an implementation plan for R1 only. No R2–R8 implementation work is included.
