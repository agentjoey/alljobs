# AllJobs R1 Backlog Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner safely read the Control Host working-tree Backlog and directly initialize, reprioritize, and reorder existing Backlog Items without changing any other repository content or performing Git mutations.

**Architecture:** Resolve code-project planning from a validated local working tree before falling back to the existing mirror/cache path. Keep ordering logic, exact YAML scalar patching, and digest-protected Proposal/Apply mutations in separate modules; the UI sends structured intent only and re-reads local state after an atomic field-only write.

**Tech Stack:** Next.js 16.3 App Router and Server Actions, React 19.2, TypeScript 5, Zod 4, YAML 2.9 source ranges, Vitest 4, Testing Library, Playwright, local filesystem and Git CLI, existing Paper Workbench CSS.

**Spec:** [`docs/superpowers/specs/2026-08-29-alljobs-r1-backlog-control-design.md`](../specs/2026-08-29-alljobs-r1-backlog-control-design.md)

## Global Constraints

- This is T3. Stop after the rendered mockup until the Human Owner approves it; final release also requires independent Review, independent Verification, owner walkthrough, and explicit release approval.
- Use an isolated worktree with a real local `node_modules`; bind the Pact worker seat before editing and do not self-accept tasks.
- The repository's `docs/ROADMAP.md` and `docs/BACKLOG.md` remain the only canonical code-project planning documents.
- Prefer the registered Control Host working tree, including uncommitted planning changes. Fall back to mirror/cache only when the entire local workspace is unavailable; never hide a present invalid local source with remote data.
- Direct repository writes are limited to `priority` and `rank` on existing Backlog Items. New items and all substantive content changes remain proposals for the repository agent.
- Rank is a positive integer scoped to `phase + priority`; physical Markdown section order remains editorial.
- Allow writes to an already-dirty `docs/BACKLOG.md` only through complete-file digest protection, a visible field-level diff, explicit confirmation, revalidation, and atomic replacement.
- Never accept a client-supplied path, raw Markdown, arbitrary field name, shell command, or authoritative patch.
- Reject symlinks, realpath escape, non-regular planning files, conflict markers, ambiguous YAML, and planning files larger than 2 MiB.
- Apply does not commit, push, merge, fetch, execute repository code, create repository backups, or start an agent.
- Keep `npm run start:prod` bound to `127.0.0.1:3456`; do not change Tunnel, domain, Access, or refresh-worker configuration.
- Before editing Next.js code, re-read `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` and `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` in the implementation worktree.
- Use focused RED → GREEN tests for every boundary. Run the full small Vitest suite only at integration checkpoints and the final candidate gate.
- Preserve unrelated tracked and untracked user work. Stage exact task files only; every implementation task ends with a focused commit.

---

## File and responsibility map

**Domain and ordering**

- `lib/planning/domain/schemas.ts` — additive optional `rank` field only.
- `lib/planning/backlog/ordering.ts` — pure ordering analysis, initialization, repair, and move planning.
- `lib/planning/backlog/ordering.test.ts` — pure ordering contract tests.

**Local planning source**

- `lib/planning/providers/local-paths.ts` — trusted fixed-path and file-safety resolution shared by reads and writes.
- `lib/planning/providers/local-working-tree.ts` — direct working-tree Roadmap/Backlog read and provenance.
- `lib/planning/providers/source-resolver.ts` — local-first selection and mirror/cache fallback.
- Corresponding `*.test.ts` files — real temporary repository and filesystem tests.
- `lib/planning/providers/contracts.ts` — local source-state and resolved-projection interfaces.
- `lib/planning/queries/project.ts` — consume the resolver and expose Backlog control state.

**Restricted mutation**

- `lib/planning/backlog/patcher.ts` — exact source-range location, scalar replacement, rank insertion, and preservation verification.
- `lib/planning/backlog/patcher.test.ts` — byte-preservation and rejection tests.
- `lib/planning/backlog/mutations.ts` — Proposal/Apply orchestration, digests, locks, validation, atomic write, and activity.
- `lib/planning/backlog/mutations.test.ts` — real filesystem boundary and zero-write failure tests.
- `app/actions/backlog.ts` — untrusted Server Action boundary and route revalidation.

**UI**

- `components/planning/backlog-view.tsx` — grouped read view and editor entry state.
- `components/planning/backlog-ordering-editor.tsx` — page-local ordering draft and accessible move controls.
- `components/planning/backlog-change-review.tsx` — exact proposal review and confirmation surface.
- `components/planning/backlog-proposal-form.tsx` — non-persistent new-item handoff form.
- `components/planning/source-status.tsx` — local/remote/cached and clean/modified/writable source labels.
- `components/planning/project-detail.tsx` — compose Backlog control without changing other project tabs.
- `app/globals.css` — approved Paper Workbench states and responsive behavior.

**Handoff, tests, and evidence**

- `lib/planning/backlog/handoff.ts` — deterministic copyable repository-agent proposal text.
- `skills/alljobs-planning/references/code-project.md`, `contracts.md`, and examples — rank/local-source/write-boundary documentation.
- `playwright.r1.config.ts`, `tests/e2e/r1-fixtures.ts`, `tests/e2e/r1-backlog-control.spec.ts` — isolated UI-to-filesystem behavior tests.
- `.agent/frontend-design/r1-backlog-control/` — T3 Brief, mockup, screenshots, review packet, verification, and handoff.

---

### Task 0: Isolated worktree, T3 Brief, and rendered Mockup Gate

**Files:**

- Create: `.agent/frontend-design/r1-backlog-control/brief.md`
- Create: `.agent/frontend-design/r1-backlog-control/handoff.md`
- Create: `.agent/frontend-design/r1-backlog-control/mockup/index.html`
- Create: `.agent/frontend-design/r1-backlog-control/mockup/styles.css`
- Create: `.agent/frontend-design/r1-backlog-control/mockup/app.js`
- Create: `.agent/frontend-design/r1-backlog-control/mockup-review.md`
- Create: `.agent/frontend-design/r1-backlog-control/mockup-screens/*.png`

**Interfaces:**

- Consumes: approved R1 spec and current `app/globals.css` / Paper Workbench design language.
- Produces: approved Brief revision and rendered interaction reference for every later UI task.

- [ ] **Step 1: Create and bind the isolated execution worktree**

From the main checkout:

```bash
git status --short --branch
git worktree add .worktrees/r1-backlog-control -b codex/r1-backlog-control main
cd .worktrees/r1-backlog-control
pactify seat use codex
pactify join --roles worker
npm ci
git status --short --branch
```

Expected: branch `codex/r1-backlog-control`, real local dependencies, and no copied user-only changes from the main working tree. If the branch already exists, stop and inspect rather than deleting or replacing it.

- [ ] **Step 2: Write the T3 Brief and state matrix**

The Brief must record the approved spec, exact write fields, local-source precedence, desktop and narrow journeys, all states from Loading through Unavailable, rollback, pilot gate, and these baseline/target measures:

```md
Status: Draft
Tier: T3
Mockup Gate: Required
Baseline: code-project Backlog is mirror/cache read-only and has no canonical rank
Target: one real pilot can initialize and reorder with exact diff, stale protection, and zero Git mutation
Release blocker: any unrelated byte change, path escape, missing Human Gate, or failed boundary test
```

Run `$impeccable shape` against the Brief and record accepted findings in the same directory.

- [ ] **Step 3: Build the standalone rendered mockup**

Use realistic 30+ item Backlog content and implement these mockup states without production imports:

```text
local modified + unranked
local ranked + editing
review with one-item move
review with group renumbering
stale write
invalid local source
remote/cached read-only
new-item copyable handoff
```

Use existing Paper Workbench tokens, an inline review panel, desktop drag affordance, and explicit Move Up/Move Down/Change Priority controls for keyboard and narrow layouts. Include a reduced-motion switch in the mockup.

Use one explicit state controller rather than separate mockup pages:

```html
<nav aria-label="Mockup states">
  <button data-state="unranked">Unranked</button>
  <button data-state="editing">Editing</button>
  <button data-state="review">Review</button>
  <button data-state="stale">Stale</button>
  <button data-state="readonly">Read only</button>
</nav>
<main id="backlog-mockup" data-state="unranked"></main>
```

`app.js` changes `data-state` and renders the same realistic Backlog dataset for every state, so screenshots compare behavior rather than unrelated content.

- [ ] **Step 4: Render desktop, intermediate, and narrow evidence**

```bash
node scripts/shot.mjs file:///Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r1-backlog-control/.agent/frontend-design/r1-backlog-control/mockup/index.html .agent/frontend-design/r1-backlog-control/mockup-screens/backlog-1440.png 1440 2 0 light
node scripts/shot.mjs file:///Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r1-backlog-control/.agent/frontend-design/r1-backlog-control/mockup/index.html .agent/frontend-design/r1-backlog-control/mockup-screens/backlog-900.png 900 2 0 light
node scripts/shot.mjs file:///Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r1-backlog-control/.agent/frontend-design/r1-backlog-control/mockup/index.html .agent/frontend-design/r1-backlog-control/mockup-screens/backlog-390.png 390 2 1 light
```

Expected: no clipped controls or horizontal page scroll; 390px evidence must come from CDP device metrics, not raw headless Chrome window sizing.

- [ ] **Step 5: Obtain independent design review and stop for Human Mockup Gate**

Use a fresh independent review run with `$impeccable critique` against the Brief, mockup, all three screenshots, the Design Quality Model, keyboard controls, and failure-state clarity. If independent dispatch has not been explicitly authorized, prepare the review packet and stop for the Human Owner to launch that run. Fix findings, rerender evidence, then ask the Human Owner to approve the rendered revision. Do not start Task 1 before explicit approval.

- [ ] **Step 6: Commit the approved design evidence**

```bash
git add .agent/frontend-design/r1-backlog-control
git commit -m "design: approve r1 backlog control mockup"
```

---

### Task 1: Add the rank contract and pure ordering engine

**Files:**

- Modify: `lib/planning/domain/schemas.ts`
- Modify: `lib/planning/domain/schemas.test.ts`
- Create: `lib/planning/backlog/ordering.ts`
- Create: `lib/planning/backlog/ordering.test.ts`

**Interfaces:**

- Consumes: existing `BacklogItem`, `Priority`, and Backlog status contracts.
- Produces: `BacklogOrderingState`, `BacklogFieldChange`, `BacklogOrderingIntent`, `analyzeBacklogOrdering()`, `initializeBacklogOrdering()`, and `planBacklogOrderingChange()`.

- [ ] **Step 1: Write failing schema and compatibility tests**

Add tests proving that rank is additive and old Backlogs remain valid:

```ts
expect(parseBacklogItem({
  id: "AJ-B-001", title: "Ranked", work_mode: "implementation",
  phase: "phase-1", status: "ready", priority: "P0", rank: 100
}).rank).toBe(100);

expect(parseBacklogItem({
  id: "AJ-B-002", title: "Legacy", work_mode: "implementation",
  phase: "phase-1", status: "ready", priority: "P0"
}).rank).toBeUndefined();

expect(() => parseBacklogItem({
  id: "AJ-B-003", title: "Invalid", work_mode: "implementation",
  phase: "phase-1", status: "ready", priority: "P0", rank: 0
})).toThrow();
```

- [ ] **Step 2: Run the schema test and verify RED**

```bash
npm test -- lib/planning/domain/schemas.test.ts
```

Expected: the ranked item loses or rejects `rank`, so the new assertion fails.

- [ ] **Step 3: Add the optional positive integer field**

In `backlogItemSchema`, add exactly:

```ts
rank: z.number().int().positive().optional(),
```

Do not add defaults; missing rank is required for backward-compatible initialization detection.

- [ ] **Step 4: Write failing ordering tests**

Define and test these public types:

```ts
export type BacklogOrderingState = "initialized" | "uninitialized" | "repair-required";
export interface BacklogFieldChange { itemId: string; priority: Priority; rank?: number }
export type BacklogOrderingIntent =
  | { kind: "initialize" }
  | { kind: "repair"; phase: string; priority: Priority }
  | { kind: "change-priority"; itemId: string; targetPriority: Priority }
  | { kind: "move"; itemId: string; targetPriority: Priority; beforeId?: string; afterId?: string };
```

Tests must cover: legacy unranked state; duplicate-rank repair state; history exclusion; `100/200/300` initialization; midpoint insertion; cross-priority move; crowded target-group renumbering; cross-Phase neighbor rejection; and unchanged source-group ranks.

- [ ] **Step 5: Run ordering tests and verify RED**

```bash
npm test -- lib/planning/backlog/ordering.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 6: Implement the smallest pure ordering engine**

The public result is explicit and contains no filesystem behavior:

```ts
export type OrderingPlanResult =
  | { ok: true; changes: BacklogFieldChange[]; renumbered: boolean }
  | { ok: false; code: "ORDERING_NOT_INITIALIZED" | "RANK_CONFLICT" | "NOT_FOUND" | "VALIDATION_ERROR"; message: string };

export function analyzeBacklogOrdering(items: BacklogItem[]): {
  state: BacklogOrderingState;
  missingIds: string[];
  conflictingIds: string[];
};

export function initializeBacklogOrdering(items: BacklogItem[]): BacklogFieldChange[];

export function planBacklogOrderingChange(
  items: BacklogItem[],
  intent: BacklogOrderingIntent
): OrderingPlanResult;
```

Use a step of `100`, exclude `done` and `cancelled`, sort lanes by existing rank, and renumber only the target lane when no positive integer gap exists.

- [ ] **Step 7: Run focused tests and commit**

```bash
npm test -- lib/planning/domain/schemas.test.ts lib/planning/backlog/ordering.test.ts
git add lib/planning/domain/schemas.ts lib/planning/domain/schemas.test.ts lib/planning/backlog/ordering.ts lib/planning/backlog/ordering.test.ts
git commit -m "feat(planning): add backlog rank ordering contract"
```

---

### Task 2: Read the validated local working tree before mirror/cache

**Files:**

- Create: `lib/planning/providers/local-paths.ts`
- Create: `lib/planning/providers/local-paths.test.ts`
- Create: `lib/planning/providers/local-working-tree.ts`
- Create: `lib/planning/providers/local-working-tree.test.ts`
- Create: `lib/planning/providers/source-resolver.ts`
- Create: `lib/planning/providers/source-resolver.test.ts`
- Modify: `lib/planning/providers/contracts.ts`
- Modify: `lib/planning/queries/project.ts`
- Modify: `lib/planning/queries/project.test.ts`

**Interfaces:**

- Consumes: `ControlHostConfig`, `ProjectRegistryEntry`, existing parsers, relation validator, Git runner, and cached projection reader.
- Produces: `PlanningSourceState`, `ResolvedCodePlanning`, `resolveLocalPlanningPaths()`, `readLocalWorkingTreePlanning()`, and `resolveCodePlanning()`.

- [ ] **Step 1: Write failing fixed-path safety tests**

Create real temporary roots and assert this result shape:

```ts
export type LocalPlanningPathsResult =
  | { ok: true; workspacePath: string; roadmapPath: string; backlogPath: string }
  | { ok: false; state: "workspace-unavailable" | "unsafe" | "invalid-file"; code: string; message: string };
```

Tests must prove: trusted direct child succeeds; absent workspace returns `workspace-unavailable`; workspace symlink escape fails; `docs/BACKLOG.md` symlink fails; directory in place of file fails; and a file over `2 * 1024 * 1024` bytes fails.

- [ ] **Step 2: Run the path tests and verify RED**

```bash
npm test -- lib/planning/providers/local-paths.test.ts
```

Expected: FAIL because `resolveLocalPlanningPaths` does not exist.

- [ ] **Step 3: Implement fixed server-derived paths**

```ts
export async function resolveLocalPlanningPaths(
  project: ProjectRegistryEntry,
  config: ControlHostConfig
): Promise<LocalPlanningPathsResult>;
```

Start only from `project.trusted_path`; reuse `isDirectChildOfTrustedRoots`, resolve `join(workspacePath, "docs/ROADMAP.md")` and `join(workspacePath, "docs/BACKLOG.md")`, use `lstat` plus `realpath`, and never accept path input from callers.

`docs/ROADMAP.md` is required only when `project.work_modes` contains `implementation`; an operations-only code project may omit it, matching the existing domain contract. `docs/BACKLOG.md` remains required for every code project.

- [ ] **Step 4: Write failing local projection and resolver tests**

Use a temporary Git repository where committed Backlog priority is `P1` and uncommitted working-tree priority is `P0`. Assert:

```ts
expect(result.source.mode).toBe("local-working-tree");
expect(result.source.backlogModified).toBe(true);
expect(result.projection.backlog[0].priority).toBe("P0");
```

Also assert: current HEAD is returned; file digests match working-tree bytes; local malformed YAML returns `local-working-tree` with `writable: false`; a missing workspace uses cached projection; and a present local repo with missing Backlog does not fall back.

- [ ] **Step 5: Run provider tests and verify RED**

```bash
npm test -- lib/planning/providers/local-working-tree.test.ts lib/planning/providers/source-resolver.test.ts
```

Expected: FAIL because the local provider and resolver do not exist.

- [ ] **Step 6: Implement source contracts and local-first resolution**

Add these contracts without changing the existing mirror cache format:

```ts
export interface PlanningSourceState {
  mode: "local-working-tree" | "remote-commit" | "cached";
  writable: boolean;
  reason?: string;
  headRevision?: string;
  roadmapDigest?: string;
  backlogDigest?: string;
  roadmapModified?: boolean;
  backlogModified?: boolean;
  readAt: string;
}

export interface ResolvedCodePlanning {
  projection: ExternalProjection;
  source: PlanningSourceState;
}
```

Implement:

```ts
export async function readLocalWorkingTreePlanning(input: {
  project: ProjectRegistryEntry;
  config: ControlHostConfig;
  gitRunner: GitRunner;
}): Promise<ResolvedCodePlanning>;

export async function resolveCodePlanning(input: {
  project: ProjectRegistryEntry;
  paths: ControlHostResolvedPaths;
  gitRunner: GitRunner;
}): Promise<ResolvedCodePlanning>;
```

The local provider reads with filesystem APIs and uses Git only for HEAD and path-scoped modification facts. The resolver falls back only on `workspace-unavailable`.

- [ ] **Step 7: Wire the project query and run regression tests**

Add `planningSource?: PlanningSourceState` and `backlogDigest?: string` to `ProjectDetailView`. Replace the code-project cache-only branch with `resolveCodePlanning`; keep business-project behavior unchanged.

```bash
npm test -- lib/planning/providers/local-paths.test.ts lib/planning/providers/local-working-tree.test.ts lib/planning/providers/source-resolver.test.ts lib/planning/queries/project.test.ts lib/planning/queries/portfolio.test.ts
```

Expected: PASS, including business and remote-cache regressions.

- [ ] **Step 8: Commit local-first projection**

```bash
git add lib/planning/providers lib/planning/queries/project.ts lib/planning/queries/project.test.ts
git commit -m "feat(planning): prefer local working tree projections"
```

---

### Task 3: Implement exact priority/rank scalar patching

**Files:**

- Create: `lib/planning/backlog/patcher.ts`
- Create: `lib/planning/backlog/patcher.test.ts`

**Interfaces:**

- Consumes: raw `docs/BACKLOG.md` bytes and `BacklogFieldChange[]` from Task 1.
- Produces: `patchBacklogFields()` with explicit changed ranges and semantic before/after values.

- [ ] **Step 1: Write failing preservation tests**

Use an exact fixture containing CRLF, Unicode body text, a quoted priority, inline comments, and two sections. The central assertion must be byte-specific:

```ts
const result = patchBacklogFields(source, [
  { itemId: "AJ-B-001", priority: "P1", rank: 150 }
]);

expect(result.ok).toBe(true);
if (result.ok) {
  expect(result.content).toContain('priority: "P1" # owner-set');
  expect(result.content).toContain("rank: 150\r\n");
  expect(result.content.replace('priority: "P1"', 'priority: "P0"').replace("rank: 150\r\n", ""))
    .toBe(source);
}
```

Add rejection tests for duplicate keys, flow maps, aliases/anchors, merge keys, multiline permitted values, duplicate section IDs, missing target, conflict markers, and a patch that attempts any field other than priority/rank.

- [ ] **Step 2: Run the patcher test and verify RED**

```bash
npm test -- lib/planning/backlog/patcher.test.ts
```

Expected: FAIL because `patchBacklogFields` does not exist.

- [ ] **Step 3: Implement original-source section and YAML range location**

Define:

```ts
export type BacklogFieldPatch = BacklogFieldChange;

export type BacklogPatchResult =
  | { ok: true; content: string; changes: BacklogFieldChange[]; ranges: Array<{ start: number; end: number }> }
  | { ok: false; code: "FIELD_NOT_PATCHABLE" | "INVALID_BACKLOG" | "NOT_FOUND"; message: string };

export function patchBacklogFields(source: string, patches: BacklogFieldPatch[]): BacklogPatchResult;
```

Locate headings and fenced YAML against the original source without LF normalization. Parse each target metadata block with:

```ts
YAML.parseDocument(rawYaml, { keepSourceTokens: true, uniqueKeys: true, merge: false });
```

Use scalar `.range` offsets to replace existing values; preserve quote style for priority. Insert missing rank directly after the priority line using the original EOL and indentation.

- [ ] **Step 4: Add semantic and outside-range verification**

After patching, parse original and proposed documents and compare normalized section structures after deleting only `priority` and `rank` from declared target items. Verify every non-patch byte segment is identical before returning success.

- [ ] **Step 5: Run the patcher and parser suites**

```bash
npm test -- lib/planning/backlog/patcher.test.ts lib/planning/markdown/backlog.test.ts lib/planning/markdown/section-document.test.ts
```

Expected: PASS with no full-section rendering snapshots changed.

- [ ] **Step 6: Commit the isolated patcher**

```bash
git add lib/planning/backlog/patcher.ts lib/planning/backlog/patcher.test.ts
git commit -m "feat(planning): patch backlog ordering fields exactly"
```

---

### Task 4: Build digest-protected Proposal and Apply services

**Files:**

- Create: `lib/planning/backlog/mutations.ts`
- Create: `lib/planning/backlog/mutations.test.ts`
- Modify: `lib/planning/native/activity.ts`

**Interfaces:**

- Consumes: Task 1 ordering plan, Task 2 validated local paths/provider, Task 3 patcher, existing project lock/digest/activity primitives.
- Produces: `proposeBacklogOrderingChange()` and `applyBacklogOrderingChange()`.

- [ ] **Step 1: Write failing Proposal zero-write tests**

Create a temporary registered code project with a dirty Backlog and assert:

```ts
const before = await readFile(backlogPath, "utf8");
const proposal = await proposeBacklogOrderingChange(
  { projectSlug: "sample", intent: { kind: "move", itemId: "AJ-B-002", targetPriority: "P0", afterId: "AJ-B-001" } },
  deps
);
expect(proposal.ok).toBe(true);
expect(await readFile(backlogPath, "utf8")).toBe(before);
```

Assert the proposal contains expected file digest, affected values, bounded diff, HEAD/dirty state, renumbering flag, and proposal digest.

- [ ] **Step 2: Write failing Apply and zero-write failure tests**

Cover success plus: entire-file stale change outside the target section; archived project; remote/cached source; lock contention; invalid relations; conflict markers; symlink; atomic writer failure; and tampered proposal payload/digest. Every failure compares the complete file before and after.

- [ ] **Step 3: Run mutation tests and verify RED**

```bash
npm test -- lib/planning/backlog/mutations.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 4: Implement explicit mutation contracts**

```ts
export type BacklogMutationCode =
  | "SOURCE_NOT_WRITABLE" | "ORDERING_NOT_INITIALIZED" | "INVALID_BACKLOG"
  | "FIELD_NOT_PATCHABLE" | "STALE_WRITE" | "RANK_CONFLICT"
  | "LOCKED" | "NOT_FOUND" | "WRITE_FAILED";

export interface BacklogChangeProposal {
  projectSlug: string;
  intent: BacklogOrderingIntent;
  expectedFileDigest: string;
  headRevision?: string;
  backlogModified: boolean;
  changes: BacklogFieldChange[];
  renumbered: boolean;
  diff: string;
  proposalDigest: string;
}

export interface BacklogMutationDependencies {
  paths: ControlHostResolvedPaths;
  store: NativePlanningStore;
  gitRunner: GitRunner;
  atomicReplace?: (filePath: string, content: string) => Promise<void>;
  recordEvent?: typeof recordActivity;
}

export async function proposeBacklogOrderingChange(
  input: { projectSlug: string; intent: BacklogOrderingIntent },
  deps?: BacklogMutationDependencies
): Promise<{ ok: true; proposal: BacklogChangeProposal } | { ok: false; code: BacklogMutationCode; message: string }>;

export async function applyBacklogOrderingChange(
  proposal: BacklogChangeProposal,
  proposalDigest: string,
  deps?: BacklogMutationDependencies
): Promise<{ ok: true; digest: string; changes: BacklogFieldChange[]; warnings: string[] } | { ok: false; code: BacklogMutationCode; message: string }>;
```

The digest canonicalizes project, structured intent, expected file digest, source facts, changes, and renumbering. Apply reconstructs these values from the current registered project rather than trusting the client payload.

- [ ] **Step 5: Implement repository-safe atomic replacement and activity**

Write a sibling temporary file, preserve the original mode, rename atomically, and remove the temporary file on failure. Record only:

```ts
{
  type: "BACKLOG_ORDERING_APPLIED",
  project: proposal.projectSlug,
  details: { changes, previousDigest, resultingDigest }
}
```

Do not include Backlog body text. Activity-write failure after a successful repository rename returns success with an `ACTIVITY_LOG_FAILED` warning; it must not turn the completed write into a retryable Apply failure.

- [ ] **Step 6: Run focused mutation and lock tests**

```bash
npm test -- lib/planning/backlog/mutations.test.ts lib/planning/native/lock.test.ts
```

Expected: PASS; every rejected case proves byte-for-byte zero write.

- [ ] **Step 7: Commit the mutation boundary**

```bash
git add lib/planning/backlog/mutations.ts lib/planning/backlog/mutations.test.ts lib/planning/native/activity.ts
git commit -m "feat(planning): add guarded backlog ordering mutations"
```

---

### Task 5: Expose safe Server Actions and query control state

**Files:**

- Create: `app/actions/backlog.ts`
- Create: `app/actions/backlog.test.ts`
- Modify: `app/actions/action-result.ts`
- Modify: `lib/planning/queries/project.ts`
- Modify: `lib/planning/queries/project.test.ts`

**Interfaces:**

- Consumes: Task 2 source state and Task 4 Proposal/Apply service.
- Produces: serializable `BacklogControlState`, `proposeBacklogOrderingAction()`, and `applyBacklogOrderingAction()`.

- [ ] **Step 1: Re-read the installed Next.js mutation guidance**

```bash
sed -n '1,260p' node_modules/next/dist/docs/01-app/02-guides/server-actions.md
sed -n '1,220p' node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
```

Record in the task handoff that Server Actions are treated as directly reachable POST endpoints and therefore accept only the structured intent defined in Task 1.

- [ ] **Step 2: Write failing action-boundary tests**

Assert that malformed slugs, unknown intent kinds, both `beforeId` and `afterId`, path-like item IDs, raw Markdown properties, and tampered proposal digests are rejected before mutation. Assert success performs exactly:

```ts
revalidatePath("/");
revalidatePath("/projects");
revalidatePath(`/projects/${slug}`);
```

- [ ] **Step 3: Run action tests and verify RED**

```bash
npm test -- app/actions/backlog.test.ts
```

Expected: FAIL because the actions do not exist.

- [ ] **Step 4: Implement the Server Action input schema and safe results**

In `app/actions/backlog.ts` define a Zod discriminated union matching `BacklogOrderingIntent`, export only asynchronous Server Functions, and return existing `ActionResult<T>` shapes:

```ts
export async function proposeBacklogOrderingAction(input: unknown): Promise<ActionResult<BacklogChangeProposal>>;

export async function applyBacklogOrderingAction(input: {
  proposal: BacklogChangeProposal;
  proposalDigest: string;
}): Promise<ActionResult<{ digest: string; changes: BacklogFieldChange[]; warnings: string[] }>>;
```

Never accept or return full file content. Add generic internal messages for `WRITE_FAILED` and unexpected proposal failures; safe domain codes retain actionable messages.

- [ ] **Step 5: Add query-level Backlog control state**

```ts
export interface BacklogControlState {
  source: PlanningSourceState;
  ordering: BacklogOrderingState;
  writable: boolean;
  blockers: Array<{ code: string; message: string }>;
}
```

Compute it from the resolved source, structural/relation issues, ordering analysis, archived state, and Backlog digest. Keep native Task `digest` separate from Backlog digest.

- [ ] **Step 6: Run focused query/action tests and commit**

```bash
npm test -- app/actions/backlog.test.ts lib/planning/queries/project.test.ts lib/planning/queries/portfolio.test.ts
git add app/actions/backlog.ts app/actions/backlog.test.ts app/actions/action-result.ts lib/planning/queries/project.ts lib/planning/queries/project.test.ts
git commit -m "feat(app): expose backlog ordering proposal actions"
```

---

### Task 6: Implement the approved Backlog ordering UI

**Files:**

- Modify: `components/planning/backlog-view.tsx`
- Create: `components/planning/backlog-ordering-editor.tsx`
- Create: `components/planning/backlog-change-review.tsx`
- Create: `components/planning/backlog-ordering.test.tsx`
- Modify: `components/planning/source-status.tsx`
- Modify: `components/planning/project-detail.tsx`
- Modify: `components/planning/components.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**

- Consumes: `BacklogItem[]`, `BacklogControlState`, and the two Task 5 Server Actions.
- Produces: grouped read view, page-local ordering draft, exact review panel, and success/stale/read-only UI states.

- [ ] **Step 1: Write failing grouped-view and source-state component tests**

Render mixed Phase/Priority/Rank items and assert P0 precedes P1, rank 100 precedes 200, history is folded, and source labels render exactly. Assert `Manage ordering` is absent or disabled for remote/cached/invalid/archived sources.

- [ ] **Step 2: Write failing accessible edit-flow tests**

Using Testing Library user events:

```ts
await user.click(screen.getByRole("button", { name: "Manage ordering" }));
await user.click(screen.getByRole("button", { name: "Move AJ-B-002 up" }));
expect(screen.getByText("1 item changed")).toBeVisible();
await user.click(screen.getByRole("button", { name: "Review changes" }));
expect(screen.getByText(/AJ-B-002.*rank 200 → 100/)).toBeVisible();
```

Also test Change Priority, Discard, initialization-required, Applying disables duplicate submission, Stale retains a textual intent summary, and reduced-motion mode does not hide content.

- [ ] **Step 3: Run component tests and verify RED**

```bash
npm test -- components/planning/backlog-ordering.test.tsx components/planning/components.test.tsx
```

Expected: FAIL because the editor and control states do not exist.

- [ ] **Step 4: Implement grouped reading and page-local draft state**

Keep the state machine explicit:

```ts
type EditorState =
  | { mode: "reading" }
  | { mode: "editing"; intent: BacklogOrderingIntent | null }
  | { mode: "reviewing"; proposal: BacklogChangeProposal }
  | { mode: "applying"; proposal: BacklogChangeProposal }
  | { mode: "error"; code: string; message: string; intent?: BacklogOrderingIntent }
  | { mode: "success"; digest: string; changedIds: string[] };
```

Use native desktop drag events only as progressive enhancement. All operations must remain available through labeled buttons; narrow/mobile layouts use buttons and priority select, not drag.

- [ ] **Step 5: Implement the review and apply flow**

The review surface must show source mode, modified/clean state, HEAD, bounded field diff, affected item count, renumbering warning, expected digest prefix, and proposal digest prefix. Confirmation calls Apply once; success triggers `router.refresh()` after the Server Action returns.

- [ ] **Step 6: Match the approved mockup and responsive states**

Use only the approved Paper Workbench tokens and mockup behavior. Add visible focus, disabled, stale, invalid, read-only, and success styles; honor `prefers-reduced-motion`. Do not alter Portfolio, Tasks, registration, or unrelated project layouts.

- [ ] **Step 7: Run component, type, and lint checks**

```bash
npm test -- components/planning/backlog-ordering.test.tsx components/planning/components.test.tsx
npm run typecheck
npm run lint
```

Expected: focused tests pass, TypeScript reports zero errors, and no new lint error is introduced.

- [ ] **Step 8: Commit the Backlog ordering UI**

```bash
git add components/planning/backlog-view.tsx components/planning/backlog-ordering-editor.tsx components/planning/backlog-change-review.tsx components/planning/backlog-ordering.test.tsx components/planning/source-status.tsx components/planning/project-detail.tsx components/planning/components.test.tsx app/globals.css
git commit -m "feat(ui): manage backlog priority and rank"
```

---

### Task 7: Add the non-persistent repository-agent handoff

**Files:**

- Create: `lib/planning/backlog/handoff.ts`
- Create: `lib/planning/backlog/handoff.test.ts`
- Create: `components/planning/backlog-proposal-form.tsx`
- Create: `components/planning/backlog-proposal-form.test.tsx`
- Modify: `components/planning/project-detail.tsx`
- Modify: `skills/alljobs-planning/references/code-project.md`
- Modify: `skills/alljobs-planning/references/contracts.md`
- Modify: `skills/alljobs-planning/examples/BACKLOG.md`

**Interfaces:**

- Consumes: project slug, user-entered request fields, current source facts, and existing skill contract.
- Produces: `buildRepoAgentBacklogProposal()` and a copy-only UI; no repository or AllJobs-native persistence.

- [ ] **Step 1: Write failing deterministic handoff tests**

Define:

```ts
export interface NewBacklogProposalInput {
  projectSlug: string;
  title: string;
  problem: string;
  expectedOutcome: string;
  suggestedPhase?: string;
  suggestedPriority?: Priority;
  doneWhen?: string;
  notes?: string;
  headRevision?: string;
  backlogDigest?: string;
}

export function buildRepoAgentBacklogProposal(input: NewBacklogProposalInput): string;
```

Assert output instructs the repository agent to inspect current code/architecture, choose a stable ID, verify Phase/dependencies, edit `docs/BACKLOG.md`, validate the project, and report the resulting diff/commit. Assert it does not claim that AllJobs wrote the item.

- [ ] **Step 2: Run handoff tests and verify RED**

```bash
npm test -- lib/planning/backlog/handoff.test.ts components/planning/backlog-proposal-form.test.tsx
```

Expected: FAIL because the builder and form do not exist.

- [ ] **Step 3: Implement the pure builder and copy-only form**

Validate required title/problem/outcome, generate plain Markdown text, show source revision/digest when available, and provide `Copy proposal`. Do not add a save action, proposal database/file, AI call, or repository mutation.

The builder returns a complete instruction block with fixed safeguards:

```ts
return `# Backlog change proposal — ${input.projectSlug}\n\n` +
  `## Request\n${input.title}\n\n${input.problem}\n\n` +
  `## Expected outcome\n${input.expectedOutcome}\n\n` +
  `## Repository-agent instructions\n` +
  `1. Inspect the current code, architecture, ROADMAP, and BACKLOG.\n` +
  `2. Confirm Phase, dependencies, priority, and Done When.\n` +
  `3. Choose a stable item ID and edit docs/BACKLOG.md.\n` +
  `4. Run the repository planning validation and report the diff and commit.\n`;
```

- [ ] **Step 4: Update the planning skill contract**

Document:

```yaml
priority: P0
rank: 100
```

Explain Phase+Priority uniqueness, local working-tree precedence, direct-write whitelist, no automatic Git operations, and the repo agent's responsibility for new/substantive items. Run:

```bash
npm run planning:skill:validate
```

Expected: skill package validation passes.

- [ ] **Step 5: Run focused UI tests and commit**

```bash
npm test -- lib/planning/backlog/handoff.test.ts components/planning/backlog-proposal-form.test.tsx
git add lib/planning/backlog/handoff.ts lib/planning/backlog/handoff.test.ts components/planning/backlog-proposal-form.tsx components/planning/backlog-proposal-form.test.tsx components/planning/project-detail.tsx skills/alljobs-planning
git commit -m "feat(planning): generate repo-agent backlog proposals"
```

---

### Task 8: Prove browser-to-filesystem behavior in an isolated real repo

**Files:**

- Create: `playwright.r1.config.ts`
- Create: `tests/e2e/r1-fixtures.ts`
- Create: `tests/e2e/r1-backlog-control.spec.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: production build, R1 UI/Server Actions, temporary Control Host config/data, and a temporary real Git repository.
- Produces: isolated `npm run test:e2e:r1` evidence that never reuses port 3456 or production data.

- [ ] **Step 1: Write the isolated R1 E2E fixture**

At Playwright config evaluation, create temporary home/data/workspace roots, initialize a real `sample-code` Git repo, commit Roadmap/Backlog, then leave a known uncommitted Backlog change. Set only the child server environment:

```ts
webServer: {
  command: "./node_modules/.bin/next start -p 3465 -H 127.0.0.1",
  url: "http://127.0.0.1:3465",
  reuseExistingServer: false,
  env: {
    ...process.env,
    ALLJOBS_HOME: fixture.homeDir,
    ALLJOBS_DATA_ROOT: fixture.dataDir
  }
}
```

Expose the temporary Backlog path to test workers through `ALLJOBS_R1_E2E_BACKLOG` and register process-exit cleanup. Never point tests at the production checkout or `~/.alljobs`.

- [ ] **Step 2: Write failing end-to-end journeys**

Tests must verify:

1. the page displays the uncommitted local value and `LOCAL WORKING TREE · MODIFIED`;
2. initialization review lists added ranks and Apply changes only rank lines;
3. Move Up and Change Priority write the expected scalar values;
4. changing an unrelated body line after Review causes `STALE_WRITE` and preserves that external edit;
5. remote/cache mode disables management;
6. keyboard-only ordering works;
7. the narrow 390px view has no horizontal page scroll;
8. Axe reports no WCAG AA violation on reading, editing, review, stale, and invalid states.

Add one test titled `captures final R1 evidence` that navigates the isolated fixture through the approved reading and review states and writes screenshots to `.agent/frontend-design/r1-backlog-control/final-screens/` only when `R1_CAPTURE_EVIDENCE=1`.

- [ ] **Step 3: Add the focused script and verify RED**

Add:

```json
"test:e2e:r1": "playwright test --config playwright.r1.config.ts"
```

Then run:

```bash
npm run build
npm run test:e2e:r1
```

Expected before fixture/UI completion: at least one R1 journey fails without touching port 3456 or production data.

- [ ] **Step 4: Fix only boundary integration gaps revealed by E2E**

For each failure, add or tighten the closest unit/integration test first, make the minimal product correction, rebuild, and rerun the affected Playwright test by title. Do not broaden R1 fields or source behavior to make a test pass.

- [ ] **Step 5: Run the complete focused R1 story**

```bash
npm test -- lib/planning/backlog lib/planning/providers app/actions/backlog.test.ts components/planning/backlog-ordering.test.tsx components/planning/backlog-proposal-form.test.tsx
npm run typecheck
npm run lint
npm run build
npm run test:e2e:r1
```

Expected: all focused tests and R1 E2E journeys pass; port 3456 and production data remain untouched.

- [ ] **Step 6: Commit isolated boundary tests**

```bash
git add playwright.r1.config.ts tests/e2e/r1-fixtures.ts tests/e2e/r1-backlog-control.spec.ts package.json
git commit -m "test: verify r1 backlog control boundaries"
```

---

### Task 9: Final evidence, independent gates, pilot, and release decision

**Files:**

- Create: `.agent/frontend-design/r1-backlog-control/review-packet.md`
- Create: `.agent/frontend-design/r1-backlog-control/verification.md`
- Create: `.agent/frontend-design/r1-backlog-control/final-screens/*.png`
- Modify: `.agent/frontend-design/r1-backlog-control/brief.md`
- Modify: `.agent/frontend-design/r1-backlog-control/handoff.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`
- Modify: `.agent/CURRENT.md`

**Interfaces:**

- Consumes: final candidate commit, approved mockup, full R1 evidence, and an owner-selected pilot Project.
- Produces: reviewable candidate, pilot evidence, explicit release/rollback decision, and current durable project status.

- [ ] **Step 1: Update architecture and operations documentation**

Document local-source precedence, read-only fallback, fixed write fields, Proposal/Apply, rank initialization, no-Git-mutation guarantee, error recovery, and how to disable R1 by rolling back the application. Do not include real credentials or private source content.

- [ ] **Step 2: Run final candidate checks once**

```bash
npm test
npm run planning:skill:validate
npm run typecheck
npm run lint
npm run build
npm run test:e2e:r1
git diff --check
```

Expected: all tests pass; lint has no new error; build succeeds; R1 E2E uses only port 3465 and temporary roots.

- [ ] **Step 3: Capture final-build visual evidence**

Use the isolated Playwright server on loopback port 3465 and capture the approved states from the exact final build:

```bash
R1_CAPTURE_EVIDENCE=1 npm run test:e2e:r1 -- --grep "captures final R1 evidence"
```

The test owns its temporary fixture and server lifecycle. Confirm both 1440px and 390px screenshots have modification times after the final build and after the last product fix.

- [ ] **Step 4: Prepare and run independent Review**

The review packet must name the Brief revision, approved mockup, target commit/build, exact files, source/write invariants, commands, evidence, and output location. The reviewer must inspect:

```text
trusted path + symlink rejection
invalid-local-no-fallback behavior
client payload cannot choose path/content/field
complete-file stale detection
outside-range byte preservation
zero Git mutation
atomic failure preserves original
activity excludes body/secrets
```

If independent dispatch is not explicitly authorized, stop and ask the Human Owner to launch the review from the packet. Do not self-approve.

- [ ] **Step 5: Prepare and run independent Verification**

Verification uses a fresh run and `$impeccable audit`, repeats the browser-to-filesystem journeys, compares final build with the approved mockup, checks keyboard/focus/reduced-motion/390px behavior, and writes pass/fail evidence to `verification.md`. Fix findings and repeat affected checks before continuing.

- [ ] **Step 6: Stop for owner-selected real pilot authorization**

Ask the Human Owner to name one valid registered code Project and explicitly approve R1 pilot writes to its local `docs/BACKLOG.md`. Before any pilot write, show:

```text
project + absolute registered workspace
HEAD + working-tree modified state
Backlog digest
exact initialization or move diff
confirmation that no commit/push will occur
```

No plan step authorizes choosing a pilot or modifying a real external project without this approval.

- [ ] **Step 7: Record pilot and rollback evidence**

After authorization, walk through local read, ordering initialization or one small reorder, manual `git diff -- docs/BACKLOG.md`, and a deliberate stale-proposal rejection. Record results without storing Backlog body content. Restore or retain the approved rank/priority change exactly as the Human Owner decides.

- [ ] **Step 8: Commit final records and stop for release approval**

```bash
git add .agent/frontend-design/r1-backlog-control docs/architecture.md docs/operations.md .agent/CURRENT.md
git commit -m "chore: record r1 backlog control verification"
```

Present final commit, checks, independent conclusions, pilot evidence, screenshots, known limitations, and rollback command. Do not push, merge, restart production, or enable public release until the Human Owner explicitly approves each requested boundary.

---

## Execution stop conditions

Stop immediately and request direction if:

- the approved mockup requires editing fields beyond priority/rank or moving across Phases;
- local source precedence would mask or overwrite a present invalid working tree;
- exact scalar patching cannot preserve all unrelated bytes for a supported canonical document;
- a test would need the production checkout, `~/.alljobs`, port 3456, or a real project without explicit pilot approval;
- implementation requires a new database, service, plugin framework, file watcher, Git mutation, or authentication model;
- another agent or user owns overlapping uncommitted changes;
- any T3 review, verification, or Human Gate is missing.
