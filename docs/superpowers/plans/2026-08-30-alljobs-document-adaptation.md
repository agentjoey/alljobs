# AllJobs Document Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show useful, attributable planning-source health and copy-only standardization guidance for missing or non-canonical Roadmap and Backlog documents without allowing inferred content to become canonical planning data.

**Architecture:** Keep `parseRoadmapDocument` and `parseBacklogDocument` strict. Add a read-only document-triage layer that receives the selected local, mirror, or cache source bytes plus parser evidence, classifies each fixed document, and exposes a separate health model to project queries and UI. Only existing parsed `RoadmapItem` and `BacklogItem` values remain eligible for relations, counts, ordering, tasks, or any future write path.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Vitest + Testing Library, Playwright, existing Paper Workbench CSS, `scripts/shot.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-30-alljobs-document-adaptation-design.md`

## Global Constraints

- Use an isolated `codex/document-adaptation` worktree under `.worktrees/document-adaptation`; install real dependencies with `npm install` and never link `node_modules`.
- Do not use Pact/Pactify for this work.
- The strict Markdown parsers remain canonical and must not infer IDs, phases, priority, rank, status, dependencies, or mutability.
- `docs/ROADMAP.md` and `docs/BACKLOG.md` remain the only planning sources for code projects.
- Local Control Host bytes remain authoritative over mirror or cache; invalid, missing, or unstructured local sources must not fall back to an older remote/cache projection.
- All degraded output is read-only and copy-only: no repository writes, commits, pushes, merges, fetches, project-code execution, or coding-agent starts.
- Do not change production service configuration, the Cloudflare Tunnel, Cloudflare Access, DNS, port `3456`, or the refresh worker.
- This is a T2 UI change: use the existing Paper Workbench direction, create a Task Capsule, state matrix, rendered Mockup Gate, and final 1440/900/390 evidence. Use `scripts/shot.mjs` for 390px; do not use bare headless Chrome window sizing.
- Run independent review and verification only through an explicitly authorized fresh agent/session. Without that authorization, create a Review Packet and pause at the review gate.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/planning/document-triage.ts` | Pure classification of one selected planning document and deterministic candidate extraction. |
| `lib/planning/document-triage.test.ts` | Canonical, recoverable, unstructured, missing, and unavailable triage cases. |
| `lib/planning/providers/contracts.ts` | Shared `DocumentTriage` contract persisted with external projections. |
| `lib/planning/providers/local-paths.ts` | Trusted workspace resolution plus safe per-document inspection without erasing a present sibling. |
| `lib/planning/providers/local-working-tree.ts` | Local byte reads, parser evidence, triage, provenance, and HEAD-comparison context. |
| `lib/planning/providers/source-resolver.ts` | Local-first resolution that returns degraded local projections instead of remote/cache substitution. |
| `lib/planning/providers/git-markdown.ts` | Mirror parsing and triage for present/missing document paths. |
| `lib/planning/providers/refresh.ts` | Cache persistence and backward-compatible cache reading for document triage. |
| `lib/planning/document-handoff.ts` | Copy-only repository-agent standardization handoff builder. |
| `lib/planning/document-handoff.test.ts` | Handoff source facts, diagnostics, and no-write boundary tests. |
| `lib/planning/queries/project.ts` | Exposes document health with detail views while keeping canonical arrays isolated. |
| `components/planning/document-health.tsx` | Accessible Paper Workbench health panel, candidate evidence, and copy handoff interaction. |
| `components/planning/document-health.test.tsx` | UI state, keyboard/copy, and non-canonical labeling tests. |
| `components/planning/project-detail.tsx` | Displays source health beside the existing Roadmap and Backlog tabs. |
| `components/planning/project-list.tsx` | Shows a compact health marker on code-project cards without changing canonical counts. |
| `tests/e2e/document-adaptation-fixtures.ts` | Creates owned temporary canonical, missing, recoverable, unstructured, remote, and cache source repositories. |
| `tests/e2e/document-adaptation.spec.ts` | Browser journeys for canonical, missing, recoverable, unstructured, and read-only source states. |
| `playwright.document-adaptation.config.ts` | Starts the isolated test app at `127.0.0.1:3466` with only the owned fixture data root. |
| `.agent/frontend-design/document-adaptation/*` | T2 Task Capsule, rendered mockup, screenshots, review packet, verification record, and handoff. |

## Task 0: Isolate the task and pass the T2 rendered Mockup Gate

**Files:**
- Create: `.agent/frontend-design/document-adaptation/brief.md`
- Create: `.agent/frontend-design/document-adaptation/mockup/index.html`
- Create: `.agent/frontend-design/document-adaptation/mockup/app.js`
- Create: `.agent/frontend-design/document-adaptation/mockup/styles.css`
- Create: `.agent/frontend-design/document-adaptation/review-packet.md`
- Create: `.agent/frontend-design/document-adaptation/handoff.md`
- Create: `.agent/frontend-design/document-adaptation/screenshots/*.png`

**Interfaces:**
- Consumes: approved design at `docs/superpowers/specs/2026-08-30-alljobs-document-adaptation-design.md`.
- Produces: an owner-approved T2 visual/state contract for `DocumentTriage` before production components are written.

- [ ] **Step 1: Create the isolated branch and real dependency install**

Run:

```bash
git worktree add -b codex/document-adaptation .worktrees/document-adaptation 09d7692
cd .worktrees/document-adaptation
npm install
git status --short --branch
```

Expected: the worktree is on `codex/document-adaptation`, has its own physical `node_modules`, and starts clean.

- [ ] **Step 2: Create the T2 Start Card and state matrix**

Write `.agent/frontend-design/document-adaptation/brief.md` with this exact Start Card and all relevant states:

```md
Workflow: 3.3
Task: Document adaptation and degradation
Role: Primary Agent
Tier / 理由: T2 — existing Project and Project List surfaces gain reusable, user-visible source-health states and copy interaction.
Canonical record: .agent/frontend-design/document-adaptation/brief.md
Branch / worktree: codex/document-adaptation · .worktrees/document-adaptation
Mockup Gate: Conditional-created — source health, candidate evidence, and handoff hierarchy change the Project information flow.
Review path: independent Review and Verification agent/session, or Review Packet and Human Owner pause.
Human checkpoints: rendered mockup direction; final build and release decision.
```

Record a matrix for: canonical local clean; canonical local modified; recoverable with one malformed section; unstructured Markdown; missing Backlog; missing Roadmap; unsafe/non-regular local file; remote commit read-only; cached stale read-only; unavailable source; clipboard unavailable; and 390px layout.

- [ ] **Step 3: Use `impeccable shape` and render the Paper Workbench mockup**

The mockup must use the current header, tokens, page rhythm, and single-column Paper Workbench detail layout. It must show that candidate headings are not Backlog cards and must not give any priority/rank/drag/apply control to a degraded document.

Render these concrete states:

```text
Canonical: small “Canonical” health marker, normal Roadmap/Backlog counts.
Recoverable: exact parser issue plus one “Candidate section” with line/evidence/missing fields.
Unstructured: outline-only candidates marked “Not canonical planning data”.
Missing: expected fixed path, no zero-count disguise, copy-only repository-agent handoff.
Remote/cache: source mode and READ ONLY label remain visible.
```

- [ ] **Step 4: Capture all required responsive evidence**

Run this local static preview in one terminal from the worktree:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory .agent/frontend-design/document-adaptation/mockup
```

Then run the screenshot commands from a second worktree terminal:

```bash
node scripts/shot.mjs http://127.0.0.1:4173 .agent/frontend-design/document-adaptation/screenshots/desktop-1440.png 1440 1 0 light
node scripts/shot.mjs http://127.0.0.1:4173 .agent/frontend-design/document-adaptation/screenshots/mid-900.png 900 1 0 light
node scripts/shot.mjs http://127.0.0.1:4173 .agent/frontend-design/document-adaptation/screenshots/mobile-390.png 390 2 1 light
```

Expected: no horizontal clipping; the copy handoff remains reachable by keyboard; source evidence stays visually distinct from canonical cards.

- [ ] **Step 5: Prepare independent review evidence and stop for Human Owner mockup approval**

Write `review-packet.md` with the brief revision, state matrix, source-of-truth rule, screenshot paths, design-quality checks, exact review questions, and independent-review requirement. If no separate reviewer has explicit authorization, record that status in `handoff.md` and pause; do not mark the mockup approved.

- [ ] **Step 6: Commit only Task 0 artifacts**

```bash
git add .agent/frontend-design/document-adaptation
git commit -m "design: document adaptation mockup"
```

## Task 1: Add a pure, non-canonical document-triage model

**Files:**
- Create: `lib/planning/document-triage.ts`
- Create: `lib/planning/document-triage.test.ts`
- Modify: `lib/planning/providers/contracts.ts`

**Interfaces:**
- Consumes: selected source text, document kind, path/revision/digest, and strict parser `ProofIssue[]`.
- Produces: `DocumentTriage` values stored beside `ExternalProjection`, never inside `RoadmapItem[]` or `BacklogItem[]`.

- [ ] **Step 1: Write failing classification and candidate tests**

Add fixtures inline in `document-triage.test.ts` and assert the public contract:

```ts
expect(triagePlanningDocument({
  document: "backlog",
  sourcePath: "docs/BACKLOG.md",
  content: "# Backlog\n\n- [ ] Prepare release\n",
  parserIssues: [],
  canonicalItemCount: 0
})).toMatchObject({
  state: "unstructured",
  candidates: [{ heading: "Prepare release", confidence: "recognized", missingCanonicalFields: expect.arrayContaining(["id", "priority", "status"]) }]
});

const missingIssue: ProofIssue = {
  scope: "document",
  code: "PLANNING_FILE_MISSING",
  sourcePath: "docs/ROADMAP.md",
  message: "Roadmap file is missing."
};

expect(triagePlanningDocument({
  document: "roadmap",
  sourcePath: "docs/ROADMAP.md",
  missing: true,
  parserIssues: [missingIssue],
  canonicalItemCount: 0
})).toMatchObject({ state: "missing" });
```

Also cover: valid canonical source; a partial parser failure plus retained valid sibling (`recoverable`); a heading with no recognized phase/task shape (`ambiguous`); and `unavailable` source.

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
npm test -- lib/planning/document-triage.test.ts
```

Expected: failure because `triagePlanningDocument` and the contract do not exist.

- [ ] **Step 3: Define the contract and minimal pure implementation**

Add these exported types to `lib/planning/providers/contracts.ts`:

```ts
export type PlanningDocumentKind = "roadmap" | "backlog";
export type DocumentTriageState = "canonical" | "recoverable" | "unstructured" | "missing" | "unavailable";

export interface DocumentCandidate {
  heading: string;
  line: number;
  evidence: string;
  confidence: "recognized" | "ambiguous";
  missingCanonicalFields: string[];
}

export interface DocumentTriage {
  document: PlanningDocumentKind;
  state: DocumentTriageState;
  sourcePath: string;
  digest?: string;
  revision?: string;
  diagnostics: ProofIssue[];
  candidates: DocumentCandidate[];
}

export interface ExternalProjection {
  // Existing fields remain unchanged.
  documents: DocumentTriage[];
}
```

Implement `triagePlanningDocument` as a pure function. Use only line-based Markdown heading and checklist recognition. A non-empty document with a strict parser issue is `recoverable`; a non-empty document with no canonical items or parser issue is `unstructured`; `missing` and `unavailable` are explicit input states. Return `canonical` only when canonical item count is positive and diagnostics contain no document-level blocking issue. Never construct a domain object from a candidate.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
npm test -- lib/planning/document-triage.test.ts
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the isolated model**

```bash
git add lib/planning/document-triage.ts lib/planning/document-triage.test.ts lib/planning/providers/contracts.ts
git commit -m "feat(planning): classify non-canonical documents"
```

## Task 2: Preserve local-first source evidence through providers and cache

**Files:**
- Modify: `lib/planning/providers/local-paths.ts`
- Modify: `lib/planning/providers/local-working-tree.ts`
- Modify: `lib/planning/providers/source-resolver.ts`
- Modify: `lib/planning/providers/git-markdown.ts`
- Modify: `lib/planning/providers/refresh.ts`
- Modify: `lib/planning/providers/local-paths.test.ts`
- Modify: `lib/planning/providers/local-working-tree.test.ts`
- Modify: `lib/planning/providers/source-resolver.test.ts`
- Modify: `lib/planning/providers/git-markdown.test.ts`
- Modify: `lib/planning/providers/refresh.test.ts`

**Interfaces:**
- Consumes: `DocumentTriage` and the existing trusted-root / regular-file checks.
- Produces: `ExternalProjection.documents: DocumentTriage[]` and local planning source facts without remote/cache substitution.

- [ ] **Step 1: Write failing provider tests for the source boundary**

Add these cases before changing providers:

```ts
expect(result.projection.documents).toContainEqual(expect.objectContaining({
  document: "backlog", state: "missing", sourcePath: expect.stringMatching(/docs\/BACKLOG\.md$/)
}));
expect(result.projection.backlog).toEqual([]);
expect(result.source.mode).toBe("local-working-tree");

expect(localResult.projection.roadmap).toHaveLength(1);
expect(localResult.projection.documents).toContainEqual(expect.objectContaining({
  document: "roadmap", state: "canonical"
}));
expect(localResult.projection.issues).not.toContainEqual(expect.objectContaining({ code: "GIT_HEAD_CONTENT_UNAVAILABLE" }));
```

The first fixture must contain a readable local `ROADMAP.md`, omit local `BACKLOG.md`, and provide a cache with an old Backlog. It proves no fallback occurs. The second commits only one planning document, leaves a valid sibling locally uncommitted, and proves the local document remains projected while the missing HEAD comparison is presented as provenance context rather than a parser failure.

- [ ] **Step 2: Run provider tests to verify the new behavior is absent**

Run:

```bash
npm test -- lib/planning/providers/local-paths.test.ts lib/planning/providers/local-working-tree.test.ts lib/planning/providers/source-resolver.test.ts lib/planning/providers/git-markdown.test.ts lib/planning/providers/refresh.test.ts
```

Expected: new assertions fail because present local document failures stop path resolution and projections contain no `documents` field.

- [ ] **Step 3: Split trusted workspace resolution from per-document inspection**

Refactor `local-paths.ts` so it still rejects untrusted workspaces, symlinked documents, non-regular files, and over-limit files, but returns trusted workspace/document paths plus a per-document inspection result. Do not call `readFile` for a missing, symlinked, non-regular, or oversized path.

Use a result shape with one outcome per fixed document:

```ts
type LocalDocumentInspection =
  | { readable: true; path: string }
  | { readable: false; path: string; issue: ProofIssue };
```

Only `workspace-unavailable` may permit mirror/cache fallback. A present local missing/unsafe/invalid document must produce its own local triage and read-only projection.

- [ ] **Step 4: Build projection triage for every provider path**

In `local-working-tree.ts`, parse only readable bytes, compute digest only for present bytes, and append exactly one triage result for `roadmap` (implementation projects) and `backlog`. Retain valid sibling items when the other fixed document is missing or invalid. Add a local provenance record for each readable document.

In `git-markdown.ts`, build the same triage results from `git show` success/failure. In `refresh.ts`, serialize `documents` in fresh cache snapshots and read old snapshots with `documents: []` rather than throwing. In `source-resolver.ts`, return the local degraded projection whenever the trusted workspace exists.

- [ ] **Step 5: Re-run focused provider tests and typecheck**

Run:

```bash
npm test -- lib/planning/providers/local-paths.test.ts lib/planning/providers/local-working-tree.test.ts lib/planning/providers/source-resolver.test.ts lib/planning/providers/git-markdown.test.ts lib/planning/providers/refresh.test.ts
npm run typecheck
```

Expected: all focused tests and TypeScript checks exit 0.

- [ ] **Step 6: Commit provider changes**

```bash
git add lib/planning/providers/local-paths.ts lib/planning/providers/local-working-tree.ts lib/planning/providers/source-resolver.ts lib/planning/providers/git-markdown.ts lib/planning/providers/refresh.ts lib/planning/providers/*.test.ts
git commit -m "feat(planning): retain degraded source evidence"
```

## Task 3: Expose health separately from canonical query data and build copy-only handoffs

**Files:**
- Create: `lib/planning/document-handoff.ts`
- Create: `lib/planning/document-handoff.test.ts`
- Modify: `lib/planning/queries/project.ts`
- Modify: `lib/planning/queries/project.test.ts`

**Interfaces:**
- Consumes: `DocumentTriage[]`, `PlanningSourceState`, and existing `ProofIssue` values.
- Produces: `ProjectDetailView.documents: DocumentTriage[]` and `buildDocumentStandardizationHandoff(input)`.

- [ ] **Step 1: Write failing query and handoff tests**

Add a `getProjectDetail` fixture with a local missing Backlog and assert:

```ts
const missingBacklog: DocumentTriage = {
  document: "backlog",
  state: "missing",
  sourcePath: "docs/BACKLOG.md",
  diagnostics: [{ scope: "document", code: "PLANNING_FILE_MISSING", message: "Backlog file is missing." }],
  candidates: []
};

expect(detail?.documents).toContainEqual(expect.objectContaining({ document: "backlog", state: "missing" }));
expect(detail?.metrics.totalBacklog).toBe(0);
expect(detail?.backlogControl?.writable).toBe(false);
```

Add handoff assertions:

```ts
const text = buildDocumentStandardizationHandoff({
  projectSlug: "code-project",
  triage: missingBacklog,
  source: { mode: "local-working-tree", writable: false, headRevision: "abc123", readAt: "2026-08-30T00:00:00.000Z" }
});
expect(text).toContain("docs/BACKLOG.md");
expect(text).toContain("Choose stable IDs");
expect(text).toContain("AllJobs did not write, commit, push, merge, fetch, or start an agent");
```

- [ ] **Step 2: Run the new query and handoff tests to verify they fail**

Run:

```bash
npm test -- lib/planning/queries/project.test.ts lib/planning/document-handoff.test.ts
```

Expected: the view has no `documents` field and the handoff module is absent.

- [ ] **Step 3: Implement the query boundary and deterministic handoff**

Add `documents: DocumentTriage[]` to `ProjectDetailView`. Copy provider triage to it unchanged; do not synthesize canonical items from candidates. In `deriveBacklogControlState`, add a blocker for any Backlog triage state other than `canonical`, preserving existing parser/relation blockers.

Implement:

```ts
export function buildDocumentStandardizationHandoff(input: {
  projectSlug: string;
  triage: DocumentTriage;
  source: PlanningSourceState;
}): string
```

The generated text must include source mode, path, known revision/digest, every diagnostic, candidate heading/line/missing field, the correct fixed-document template, repository-agent validation instructions, and the no-write boundary. It must not include an Apply command or a claim that any candidate is an approved item.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
npm test -- lib/planning/queries/project.test.ts lib/planning/document-handoff.test.ts
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit query and handoff changes**

```bash
git add lib/planning/document-handoff.ts lib/planning/document-handoff.test.ts lib/planning/queries/project.ts lib/planning/queries/project.test.ts
git commit -m "feat(planning): expose document health handoffs"
```

## Task 4: Render document health on existing Paper Workbench surfaces

**Files:**
- Create: `components/planning/document-health.tsx`
- Create: `components/planning/document-health.test.tsx`
- Modify: `components/planning/project-detail.tsx`
- Modify: `components/planning/project-list.tsx`
- Modify: `components/planning/roadmap-view.tsx`
- Modify: `components/planning/backlog-view.tsx`
- Modify: `components/planning/components.test.tsx`

**Interfaces:**
- Consumes: `DocumentTriage[]`, `PlanningSourceState`, and `buildDocumentStandardizationHandoff`.
- Produces: an accessible health marker and detail panel; candidates never render through `RoadmapView` or `BacklogView` as canonical items.

- [ ] **Step 1: Write failing component tests for source health and copy behavior**

Cover these exact user-visible assertions:

```tsx
const missingBacklog: DocumentTriage = {
  document: "backlog", state: "missing", sourcePath: "docs/BACKLOG.md", diagnostics: [], candidates: []
};
const unstructuredRoadmap: DocumentTriage = {
  document: "roadmap", state: "unstructured", sourcePath: "docs/ROADMAP.md", diagnostics: [],
  candidates: [{ heading: "Release outline", line: 3, evidence: "## Release outline", confidence: "ambiguous", missingCanonicalFields: ["id", "kind", "status", "order"] }]
};
const localReadOnly: PlanningSourceState = { mode: "local-working-tree", writable: false, readAt: "2026-08-30T00:00:00.000Z" };
const remoteReadOnly: PlanningSourceState = { mode: "remote-commit", writable: false, readAt: "2026-08-30T00:00:00.000Z" };

render(<DocumentHealth documents={[missingBacklog]} source={localReadOnly} projectSlug="code-project" />);
expect(screen.getByRole("status")).toHaveTextContent("Missing document");
expect(screen.getByText("docs/BACKLOG.md")).toBeVisible();
expect(screen.getByRole("button", { name: "Copy repository-agent handoff" })).toBeEnabled();

render(<DocumentHealth documents={[unstructuredRoadmap]} source={remoteReadOnly} projectSlug="code-project" />);
expect(screen.getByText("Not canonical planning data")).toBeVisible();
expect(screen.getByText("Candidate section")).toBeVisible();
expect(screen.queryByRole("button", { name: /Manage ordering/i })).not.toBeInTheDocument();
```

Mock `navigator.clipboard.writeText`, test the fallback status when it rejects, and use keyboard activation of the copy button.

- [ ] **Step 2: Run component tests to verify they fail**

Run:

```bash
npm test -- components/planning/document-health.test.tsx components/planning/components.test.tsx
```

Expected: failure because `DocumentHealth` does not exist and Project surfaces do not receive document triage.

- [ ] **Step 3: Implement the Paper Workbench health panel**

Implement `DocumentHealth` as a semantic `<section aria-labelledby>` that:

```tsx
<span className="badge badge--active">CANONICAL</span>
<span className="badge badge--blocked">MISSING DOCUMENT</span>
<code>docs/BACKLOG.md</code>
<button type="button" className="btn">Copy repository-agent handoff</button>
```

Use existing `StatePanel`, badge, button, paper, and mono-token styles. Show a single concise health row when both documents are canonical. For degraded documents, show explicit source path, mode, digest/revision when known, diagnostics, candidates as evidence-only, missing canonical fields, and a copy-only handoff. Do not add a route, modal, card grid, draggable control, or new color system.

Render it above the tab panel in `ProjectDetail`. Add a compact non-color-only health label to `ProjectList` cards. Pass canonical arrays unchanged to `RoadmapView` and `BacklogView`; their empty states must say that no canonical items are currently available, not imply an absent document when `DocumentHealth` reports another state.

- [ ] **Step 4: Run focused UI tests, lint, and typecheck**

Run:

```bash
npm test -- components/planning/document-health.test.tsx components/planning/components.test.tsx components/planning/backlog-ordering.test.tsx
npm run lint
npm run typecheck
```

Expected: no test failures, no lint errors, and no TypeScript errors.

- [ ] **Step 5: Commit UI work**

```bash
git add components/planning/document-health.tsx components/planning/document-health.test.tsx components/planning/project-detail.tsx components/planning/project-list.tsx components/planning/roadmap-view.tsx components/planning/backlog-view.tsx components/planning/components.test.tsx
git commit -m "feat(ui): show planning document health"
```

## Task 5: Prove browser behavior, independent review, and final evidence

**Files:**
- Create: `tests/e2e/document-adaptation-fixtures.ts`
- Create: `tests/e2e/document-adaptation.spec.ts`
- Create: `playwright.document-adaptation.config.ts`
- Create: `.agent/frontend-design/document-adaptation/verification.md`
- Modify: `.agent/frontend-design/document-adaptation/brief.md`
- Modify: `.agent/frontend-design/document-adaptation/handoff.md`
- Modify: `.agent/frontend-design/document-adaptation/review-packet.md`

**Interfaces:**
- Consumes: final app build, test fixtures from Tasks 1–4, and Task 0 approved mockup.
- Produces: build-bound verification evidence and a review-ready handoff; no deployment.

- [ ] **Step 1: Write failing E2E coverage for every degraded state**

Extend the E2E fixture setup to register isolated trusted code workspaces and assert:

```ts
await expect(page.getByText("Missing document")).toBeVisible();
await expect(page.getByText("docs/BACKLOG.md")).toBeVisible();
await expect(page.getByRole("button", { name: "Copy repository-agent handoff" })).toBeVisible();
await expect(page.getByText("Not canonical planning data")).toBeVisible();
await expect(page.getByText("REMOTE COMMIT · READ ONLY")).toBeVisible();
await expect(page.getByRole("button", { name: "Manage ordering" })).toBeDisabled();
```

At 390px, tab to the copy control and assert it is visible and keyboard-operable. Assert a local missing Backlog does not display a cached Backlog card.

The fixture must follow `tests/e2e/r1-fixtures.ts`: create a private temporary root, bind the test server with `ALLJOBS_HOME` and `ALLJOBS_DATA_ROOT`, validate its sentinel before cleanup, and never use the production checkout or `~/.alljobs`. `playwright.document-adaptation.config.ts` must use `testMatch: "document-adaptation.spec.ts"`, `workers: 1`, `reuseExistingServer: false`, `baseURL: "http://127.0.0.1:3466"`, and this exact web server command:

```ts
command: "./node_modules/.bin/next start -p 3466 -H 127.0.0.1"
```

- [ ] **Step 2: Run the new E2E test and verify the pre-implementation failure**

Run:

```bash
npm exec playwright test --config playwright.document-adaptation.config.ts
```

Expected: the test fails until Tasks 1–4 supply health states and controls.

- [ ] **Step 3: Run the full required validation sequence on the final build**

Run:

```bash
npm test -- lib/planning/document-triage.test.ts lib/planning/providers/local-paths.test.ts lib/planning/providers/local-working-tree.test.ts lib/planning/providers/source-resolver.test.ts lib/planning/providers/git-markdown.test.ts lib/planning/providers/refresh.test.ts lib/planning/document-handoff.test.ts lib/planning/queries/project.test.ts components/planning/document-health.test.tsx components/planning/components.test.tsx
npm run lint
npm run typecheck
npm run build
npm exec playwright test --config playwright.document-adaptation.config.ts
```

Expected: all commands exit 0. Record exact counts and any permitted warnings in `verification.md`; do not call a skipped check passing.

- [ ] **Step 4: Capture final responsive screenshots from the isolated final build**

With the Task 5 fixture server running at `127.0.0.1:3466`, capture the canonical fixture at `/projects/canonical-code` and the missing fixture at `/projects/missing-backlog`:

```bash
node scripts/shot.mjs http://127.0.0.1:3466/projects/canonical-code .agent/frontend-design/document-adaptation/screenshots/final-canonical-1440.png 1440 1 0 light
node scripts/shot.mjs http://127.0.0.1:3466/projects/missing-backlog .agent/frontend-design/document-adaptation/screenshots/final-missing-900.png 900 1 0 light
node scripts/shot.mjs http://127.0.0.1:3466/projects/missing-backlog .agent/frontend-design/document-adaptation/screenshots/final-missing-390.png 390 2 1 light
```

Save paths and build commit in `verification.md`. Inspect every image for truncation, contrast, state-label clarity, keyboard focus, and canonical-versus-candidate distinction.

- [ ] **Step 5: Complete the independent gates or pause at the Review Packet**

If an independent agent/session is explicitly authorized, provide the target commit, build, tests, screenshots, state matrix, spec, and review packet. Require an `impeccable critique` review and independent browser/a11y verification. Fix each finding and rerun affected tests/screenshots.

If authorization is absent, record the exact target commit and evidence paths in `review-packet.md`, state that independent review is pending, and stop. Do not self-approve, merge, push, deploy, or claim release readiness.

- [ ] **Step 6: Commit final verification artifacts only after all required checks pass**

```bash
git add tests/e2e/document-adaptation-fixtures.ts tests/e2e/document-adaptation.spec.ts playwright.document-adaptation.config.ts .agent/frontend-design/document-adaptation
git commit -m "test: verify document adaptation journeys"
```

## Scope-to-task coverage check

| Approved design requirement | Plan task |
| --- | --- |
| Strict canonical parsers and no inferred planning facts | Task 1 |
| Five triage states and deterministic candidates | Tasks 1–2 |
| Local-first, no degraded fallback to mirror/cache | Task 2 |
| Source path/digest/revision evidence | Tasks 2–4 |
| Copy-only repository-agent standardization handoff | Task 3 |
| No ordering, relations, metrics, or mutation authority for candidates | Tasks 3–5 |
| Paper Workbench health UI and responsive states | Tasks 0, 4, 5 |
| Independent review / verification, no production change | Task 5 |
