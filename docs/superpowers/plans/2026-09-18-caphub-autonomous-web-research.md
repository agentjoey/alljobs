# Caphub Autonomous Web Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Caphub Capture with no source URL complete research through one cited MiniMax-M3 server-side web search, then continue through DeepSeek assessment and Review Center under Analysis Contract V3.

**Architecture:** A dedicated MiniMax Responses adapter exposes one fixed `web_search` operation and returns normalized HTTPS citation candidates. The existing research gateway accepts those candidates as inline evidence, while a separate audited stage runner enforces provider-call/token budgets and no retry. The service wires that runner into research and creates immutable V3 jobs that supersede V2 jobs.

**Tech Stack:** TypeScript, Next.js 16 server runtime, Vitest 4, Vercel AI SDK for existing MiniMax calls, direct `fetch` for MiniMax Responses, Zod 4, PostgreSQL/Neon Registry, launchd.

**Spec:** `docs/superpowers/specs/2026-09-18-caphub-autonomous-web-research-design.md`

## Global Constraints

- Use `MiniMax-M3` at `https://api.minimax.io/v1/responses` with exactly `tools: [{ "type": "web_search" }]`.
- Send one search request per analysis job, permit at most eight normalized HTTPS citations, and make no automatic retry.
- Search input contains normalized extraction text only; never send image bytes, object bytes, credentials, Registry contents, or local paths.
- Persist normalized citations and digests only; never persist raw provider output, reasoning, search queries, or secret values.
- DeepSeek Flash remains the research/assessment schema provider; MiniMax remains extraction observer/critic plus the new search provider.
- Search uses the existing `MINIMAX_API_KEY`; add no credential and no local MCP/CLI subprocess.
- Keep the explicit-URL pinned-fetch path, but an empty `sourceAllowedOrigins` list must not disable MiniMax search.
- Active jobs use `caphub-analysis-v3`; historical V1/V2 jobs and artifacts remain immutable and readable.
- Keep exports and deployment targets disabled, keep `next start` on `127.0.0.1:3456`, and reload only `com.agentjoey.alljobs` after the final build.
- Do not push, merge, tag, publish a release, or change traffic in this plan.

---

### Task 1: MiniMax Server-Side Web Search Adapter

**Files:**
- Create: `lib/caphub/providers/minimax-web-search.ts`
- Create: `lib/caphub/providers/minimax-web-search.test.ts`
- Modify: `lib/caphub/research/source-gateway.ts`

**Interfaces:**
- Consumes: `SourceCandidate` from `lib/caphub/research/source-gateway.ts` and `CAPHUB_ANALYSIS_LIMITS.maxFetchedSources`.
- Produces:
  ```ts
  export interface MiniMaxWebSearchInput {
    query: string;
    entityDomains: readonly string[];
  }

  export interface MiniMaxWebSearchResult {
    candidates: readonly SourceCandidate[];
    usage: { inputTokens: number; outputTokens: number };
    finishReason: "stop";
    outputBytes: number;
  }

  export class MiniMaxWebSearchProvider {
    readonly provider: "minimax";
    readonly model: "MiniMax-M3";
    search(input: MiniMaxWebSearchInput, options: { signal: AbortSignal }): Promise<MiniMaxWebSearchResult>;
  }
  ```
- Extends `SourceCandidate` with optional `content?: string`; callers treat it as untrusted source text.

- [ ] **Step 1: Write failing request-contract and citation-parser tests**

  Add tests that inject a fake `fetch`, call `MiniMaxWebSearchProvider.search`, and assert the exact outbound contract:

  ```ts
  expect(body).toMatchObject({
    model: "MiniMax-M3",
    stream: false,
    tools: [{ type: "web_search" }]
  });
  expect(body).not.toHaveProperty("text");
  expect(requests).toHaveLength(1);
  expect(result.candidates).toEqual([{
    url: "https://docs.example.com/tool",
    title: "Example Tool documentation",
    sourceKind: "official",
    claims: ["Example Tool supports agents."],
    content: "Example Tool supports agents."
  }]);
  expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40 });
  ```

  The fixture response must include one `web_search_call`, one assistant message, and one `url_citation` annotation with `title`, `url`, and `content`.

- [ ] **Step 2: Run the focused test and verify RED**

  Run:
  ```bash
  npm test -- lib/caphub/providers/minimax-web-search.test.ts
  ```
  Expected: FAIL because `minimax-web-search.ts` and `MiniMaxWebSearchProvider` do not exist.

- [ ] **Step 3: Implement the fixed request and strict response parser**

  Implement a direct `fetch` adapter with these behaviors:

  ```ts
  const body = {
    model: "MiniMax-M3",
    input: buildSearchPrompt(input),
    stream: false,
    tools: [{ type: "web_search" }]
  };
  ```

  Require `status === "completed"`, one final assistant message, integer non-negative usage, and at least one valid citation. Normalize URLs through `new URL`, retain HTTPS only, strip fragments, deduplicate by normalized URL, and slice to `maxFetchedSources`.

  Classify each citation without trusting model labels:

  ```ts
  function sourceKind(url: URL, domains: readonly string[]): SourceKind {
    if (domains.includes(url.hostname.toLowerCase())) return "official";
    if (["github.com", "gitlab.com"].includes(url.hostname)) return "repository";
    if (["npmjs.com", "www.npmjs.com", "pypi.org"].includes(url.hostname)) return "package";
    return "unknown";
  }
  ```

  Map HTTP `401` to `AUTHENTICATION`, `402` to `BILLING`, abort to `ABORTED`, other transport/non-2xx failures to `UNAVAILABLE`, and malformed/no-citation responses to `INVALID_OUTPUT`. Do not attach response bodies or request headers as error causes.

- [ ] **Step 4: Add malformed/abort/redaction tests and verify GREEN**

  Cover non-HTTPS citations, duplicate URLs, missing annotation content, more than eight citations, `401`, `402`, `500`, malformed JSON, zero citations, and an already-aborted signal. Assert only one request and no error message contains the fixture key or response body.

  Run:
  ```bash
  npm test -- lib/caphub/providers/minimax-web-search.test.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Commit Task 1**

  ```bash
  git add lib/caphub/providers/minimax-web-search.ts lib/caphub/providers/minimax-web-search.test.ts lib/caphub/research/source-gateway.ts
  git commit -m "feat(caphub): add MiniMax web search adapter"
  ```

---

### Task 2: Inline Search Evidence in the Research Dossier

**Files:**
- Modify: `lib/caphub/research/source-gateway.ts`
- Modify: `lib/caphub/research/source-gateway.test.ts`
- Modify: `lib/caphub/research/research.ts`
- Modify: `lib/caphub/research/research.test.ts`

**Interfaces:**
- Consumes: `SourceCandidate.content?: string` from Task 1.
- Produces:
  ```ts
  export interface ResearchSearchRequest {
    query: string;
    entityDomains: readonly string[];
  }

  export interface ResearchSourceGateway {
    search(request: ResearchSearchRequest, signal: AbortSignal): Promise<readonly SourceCandidate[]>;
    fetch(url: string, signal: AbortSignal): Promise<FetchedSource>;
  }
  ```
- `LiveResearchSourceGateway` accepts `{ search?: ResearchSearchPort; policy?: ExactHttpsSourcePolicy }` and requires at least one capability. `fetch` returns `SOURCE_ACCESS_DISABLED` when no policy exists.

- [ ] **Step 1: Write failing no-URL inline-evidence tests**

  Change the research fixture to `explicit_urls: []`. Return a search candidate with citation `content`, make `fetch` throw if called, and assert:

  ```ts
  expect(search).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.stringify(modelInput)).toContain("cited result content");
  expect(dossier.evidence[0]).toMatchObject({
    source_url: "https://docs.example.com/tool",
    tier: "A"
  });
  ```

  Add a test where search returns no citations and explicit URL fetch is disabled; expect `RESEARCH_EVIDENCE_REQUIRED` before the DeepSeek worker is called.

- [ ] **Step 2: Run research tests and verify RED**

  Run:
  ```bash
  npm test -- lib/caphub/research/research.test.ts lib/caphub/research/source-gateway.test.ts
  ```
  Expected: FAIL because candidates always go through `fetch` and the gateway cannot be search-only.

- [ ] **Step 3: Implement one search brief and inline evidence normalization**

  Replace the per-entity search loop with one bounded request:

  ```ts
  function searchRequestFor(extraction: ExtractionResult): ResearchSearchRequest {
    const labels = [...new Set(extraction.entities.flatMap((entity) => [entity.name, ...entity.aliases]))].slice(0, 12);
    const entityDomains = [...new Set(extraction.entities.flatMap((entity) => entity.domain ? [entity.domain.toLowerCase()] : []))].slice(0, 8);
    return {
      query: canonicalJson({
        entities: labels,
        claims: extraction.claims.slice(0, 24).map((claim) => claim.statement),
        unresolved_questions: extraction.unresolved_questions.slice(0, 16)
      }),
      entityDomains
    };
  }
  ```

  For candidates with non-empty `content`, construct evidence from that string without calling `fetch`. For explicit URLs without inline content, call `fetch`; if it returns `SOURCE_ACCESS_DISABLED` or `SOURCE_BLOCKED`, skip that explicit URL and retain search evidence. Throw `RESEARCH_EVIDENCE_REQUIRED` only when no normalized evidence remains.

- [ ] **Step 4: Make the live gateway independently support search and fetch**

  Update constructor validation:

  ```ts
  if (!options.search && !options.policy) {
    throw new ResearchSourceError("SOURCE_ACCESS_DISABLED");
  }
  ```

  `search` still enforces `maxSearchQueries`; `fetch` still enforces `maxFetchedSources`, DNS pinning, redirect bounds, media types, and byte limits when a policy exists.

- [ ] **Step 5: Run focused research/gateway tests and verify GREEN**

  Run:
  ```bash
  npm test -- lib/caphub/research/research.test.ts lib/caphub/research/source-gateway.test.ts
  ```
  Expected: PASS.

- [ ] **Step 6: Commit Task 2**

  ```bash
  git add lib/caphub/research/source-gateway.ts lib/caphub/research/source-gateway.test.ts lib/caphub/research/research.ts lib/caphub/research/research.test.ts
  git commit -m "feat(caphub): accept cited inline research evidence"
  ```

---

### Task 3: Audited Search Operation and Shared Job Budget

**Files:**
- Create: `lib/caphub/providers/web-search-stage.ts`
- Create: `lib/caphub/providers/web-search-stage.test.ts`
- Modify: `lib/caphub/workflow/contracts.ts`
- Modify: `lib/caphub/workflow/audit.test.ts`
- Modify: `lib/caphub/analysis/schemas.ts`
- Modify: `lib/caphub/analysis/schemas.test.ts`

**Interfaces:**
- Consumes: `MiniMaxWebSearchProvider.search` from Task 1, `ModelCallAuditStore`, and `JobModelBudget`.
- Produces:
  ```ts
  export function runWebSearchStage(request: {
    jobId: string;
    captureId: string;
    input: MiniMaxWebSearchInput;
    provider: Pick<MiniMaxWebSearchProvider, "provider" | "model" | "search">;
    auditStore: ModelCallAuditStore;
    budget: JobModelBudget;
    clock: () => string;
    signal?: AbortSignal;
  }): Promise<StructuredStageResult<readonly SourceCandidate[]>>;
  ```
- Adds `"web_search"` to `ModelCallOperation` and the audit-event schema.

- [ ] **Step 1: Write failing audit/budget/deadline tests**

  Cover success, authentication failure, timeout, zero/malformed candidates, already-exhausted call budget, and total-token overflow. Success must produce exactly:

  ```ts
  [
    { stage: "research", provider: "minimax", operation: "web_search", type: "started" },
    { stage: "research", provider: "minimax", operation: "web_search", type: "succeeded" }
  ]
  ```

  Assert `attempt === 1`, `contract_version === "caphub-minimax-web-search-v1"`, `providerCalls` increments once, tokens join the shared total, and no retry occurs.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run:
  ```bash
  npm test -- lib/caphub/providers/web-search-stage.test.ts lib/caphub/workflow/audit.test.ts lib/caphub/analysis/schemas.test.ts
  ```
  Expected: FAIL because the stage runner and `web_search` audit operation do not exist.

- [ ] **Step 3: Implement the single-attempt audited runner**

  Serialize the search input canonically, reject research inputs larger than `maxInputBytes.research`, enforce `maxProviderCallsPerJob`, call the provider with a 120-second combined abort/deadline signal, validate integer usage, and update `budget.totalTokens`.

  Map provider errors with the existing meanings:

  ```ts
  AUTHENTICATION -> AUTHENTICATION
  BILLING        -> BILLING / audit QUOTA
  TIMEOUT        -> TIMEOUT
  ABORTED        -> ABORTED / audit POLICY_DENIED
  INVALID_OUTPUT -> INVALID_OUTPUT
  UNAVAILABLE    -> PROVIDER_UNAVAILABLE
  ```

  Audit only digests, byte counts, usage, finish reason, and error code. Use `digestCanonicalJson(result.candidates)` for the terminal output digest.

- [ ] **Step 4: Run the focused tests and verify GREEN**

  Run:
  ```bash
  npm test -- lib/caphub/providers/web-search-stage.test.ts lib/caphub/workflow/audit.test.ts lib/caphub/analysis/schemas.test.ts
  ```
  Expected: PASS.

- [ ] **Step 5: Commit Task 3**

  ```bash
  git add lib/caphub/providers/web-search-stage.ts lib/caphub/providers/web-search-stage.test.ts lib/caphub/workflow/contracts.ts lib/caphub/workflow/audit.test.ts lib/caphub/analysis/schemas.ts lib/caphub/analysis/schemas.test.ts
  git commit -m "feat(caphub): audit bounded web search"
  ```

---

### Task 4: Analysis Contract V3 and Capture-to-Review Behavior

**Files:**
- Modify: `lib/caphub/service/analyze.ts`
- Modify: `lib/caphub/service/analyze.test.ts`
- Modify: `lib/caphub/service/analyze.behavior.test.ts`
- Modify: `lib/caphub/service/analyze-runtime.ts`
- Modify: `lib/caphub/service/analyze-runtime.test.ts`
- Modify: `lib/caphub/analysis/schemas.ts`
- Modify: `lib/caphub/analysis/schemas.test.ts`
- Modify as required by typed V3 fixtures: `lib/caphub/registry/**/*.test.ts`, `lib/caphub/workflow/*.test.ts`

**Interfaces:**
- Consumes: `MiniMaxWebSearchProvider`, `runWebSearchStage`, search-only `LiveResearchSourceGateway`, and inline evidence support.
- Produces:
  ```ts
  export const CAPHUB_ANALYSIS_CONTRACT_VERSION = "caphub-analysis-v3";
  ```
- `AnalysisServiceDependencies` gains `researchSearchProvider` and changes `sourceGateway` to accept an audited `ResearchSearchPort`.

- [ ] **Step 1: Write failing V3 lineage tests**

  Reproduce V2 and V3 identifiers independently:

  ```ts
  const v2Id = jobId(capture, "caphub-analysis-v2");
  const v3Id = jobId(capture, "caphub-analysis-v3");
  ```

  Persist a terminal V2 predecessor, start analysis, and assert a distinct V3 job is created with `supersedes_job_id: v2Id`. Assert the V2 bytes remain unchanged and a terminal V3 job is deduplicated on the second start.

- [ ] **Step 2: Write failing real-boundary BDD for a no-URL Capture**

  In `analyze.behavior.test.ts`, set `explicit_urls: []`, intercept the real MiniMax Responses URL, and return:

  ```ts
  {
    status: "completed",
    output: [
      { type: "web_search_call", status: "completed", action: { type: "search", query: "Example Tool" } },
      { type: "message", role: "assistant", content: [{
        type: "output_text",
        text: "Example Tool is documented.",
        annotations: [{
          type: "url_citation",
          title: "Example Tool documentation",
          url: "https://docs.example.com/tool",
          content: "Example Tool supports agents."
        }]
      }] }
    ],
    usage: { input_tokens: 20, output_tokens: 10 }
  }
  ```

  Assert the real adapter sequence is MiniMax observation → DeepSeek extraction → MiniMax web search → DeepSeek research → DeepSeek assessment → MiniMax critic. Assert one `web_search` started/succeeded pair, a completed V3 job, research/assessment/ReviewPacket artifacts, no direct source fetch, no secret/raw observation persistence, and idempotent second start.

- [ ] **Step 3: Run service/runtime tests and verify RED**

  Run:
  ```bash
  npm test -- lib/caphub/service/analyze.test.ts lib/caphub/service/analyze.behavior.test.ts lib/caphub/service/analyze-runtime.test.ts
  ```
  Expected: FAIL because the service has no search provider and still creates V2 jobs.

- [ ] **Step 4: Implement V3 identity and lineage**

  Replace separate legacy/V2 helpers with:

  ```ts
  function versionedJobIdFor(capture: CaptureRecord, version: "caphub-analysis-v2" | "caphub-analysis-v3"): string {
    return `job_${createHash("sha256")
      .update(`${capture.id}\0${capture.object.digest}\0${version}`, "utf8")
      .digest("hex").slice(0, 32)}`;
  }
  ```

  Create V3 jobs, look up V2 first as predecessor, then legacy only if V2 is absent. Extend `analysisJobSchema` to accept V3 and allow V2/V3 jobs to supersede a distinct predecessor. Preserve historical fixtures.

- [ ] **Step 5: Wire audited search into the research handler**

  Construct the gateway after job/budget reconstruction:

  ```ts
  const sourceGateway = dependencies.sourceGateway(async (request, searchSignal) => {
    const outcome = await runWebSearchStage({
      jobId, captureId: capture.id, input: request,
      provider: dependencies.researchSearchProvider,
      auditStore: dependencies.audits, budget, clock: clockString,
      signal: searchSignal
    });
    if (outcome.kind === "human_review") throw new StageHumanReviewError(outcome.reason);
    return outcome.value;
  });
  ```

  Ensure provider ownership requires MiniMax for `researchSearchProvider`. Preserve the current stage order and DeepSeek structured research/assessment calls.

- [ ] **Step 6: Wire the production runtime**

  Create `MiniMaxWebSearchProvider` with the same private MiniMax key used by `MiniMaxProvider`. `createSourceGateway` must always supply the audited search port and supply an `ExactHttpsSourcePolicy` only when `sourceAllowedOrigins` is non-empty.

- [ ] **Step 7: Update affected typed fixtures and verify GREEN**

  Run:
  ```bash
  npm test -- \
    lib/caphub/providers/minimax-web-search.test.ts \
    lib/caphub/providers/web-search-stage.test.ts \
    lib/caphub/research/research.test.ts \
    lib/caphub/research/source-gateway.test.ts \
    lib/caphub/service/analyze.test.ts \
    lib/caphub/service/analyze.behavior.test.ts \
    lib/caphub/service/analyze-runtime.test.ts \
    lib/caphub/analysis/schemas.test.ts \
    lib/caphub/workflow/audit.test.ts \
    lib/caphub/workflow/runner.test.ts \
    lib/caphub/registry/postgres/caphub-stores.behavior.test.ts
  ```
  Expected: PASS with the no-URL BDD completing a V3 ReviewPacket.

- [ ] **Step 8: Commit Task 4**

  Stage only files changed for V3/search wiring, then:
  ```bash
  git commit -m "feat(caphub): complete V3 analysis with web research"
  ```

---

### Task 5: Focused Acceptance, Production Canary, and Evidence

**Files:**
- Modify: `.agent/CURRENT.md`
- Modify: `.agent/caphub/production-activation-log.md`
- Create: `.agent/caphub/autonomous-web-research-verification.md`
- Modify if needed for accurate operator behavior: `docs/caphub-foundation.md`
- Modify if needed for accurate production operations: `docs/operations.md`

**Interfaces:**
- Consumes: final V3 implementation and existing private LaunchAgent environment.
- Produces: reproducible test/build/runtime evidence and one real V3 Capture-to-Review canary.

- [ ] **Step 1: Run the coherent focused suite**

  Run the Task 4 focused command plus adjacent production-pilot tests:
  ```bash
  npm test -- \
    lib/caphub/providers/minimax-web-search.test.ts \
    lib/caphub/providers/web-search-stage.test.ts \
    lib/caphub/providers/minimax.test.ts \
    lib/caphub/providers/deepseek.test.ts \
    lib/caphub/providers/deepseek-responses.test.ts \
    lib/caphub/research/research.test.ts \
    lib/caphub/research/source-gateway.test.ts \
    lib/caphub/service/analyze.test.ts \
    lib/caphub/service/analyze.behavior.test.ts \
    lib/caphub/service/analyze-runtime.test.ts \
    lib/caphub/analysis/schemas.test.ts \
    lib/caphub/workflow/audit.test.ts \
    lib/caphub/workflow/runner.test.ts \
    lib/caphub/registry/postgres/caphub-stores.behavior.test.ts \
    scripts/caphub-analyze.test.ts \
    scripts/caphub-production-preflight.test.ts
  ```
  Expected: all selected files and tests PASS.

- [ ] **Step 2: Run static and production-build gates**

  Run:
  ```bash
  npm run typecheck
  npx eslint lib/caphub/providers/minimax-web-search.ts lib/caphub/providers/minimax-web-search.test.ts lib/caphub/providers/web-search-stage.ts lib/caphub/providers/web-search-stage.test.ts lib/caphub/research lib/caphub/service/analyze.ts lib/caphub/service/analyze-runtime.ts
  npm run build
  npm run verify:deploy
  ```
  Expected: typecheck PASS, focused lint has zero errors, build PASS, deployment verifier PASS.

- [ ] **Step 3: Run one synthetic live MiniMax search probe**

  Use the private LaunchAgent key without printing it. Send no Capture bytes and ask MiniMax to search for its own official Server Tools documentation. Verify one completed response, at least one HTTPS citation, valid token usage, and no raw response retained. Do not retry a failed provider request.

- [ ] **Step 4: Commit implementation and pre-production evidence**

  Record exact commit, commands, counts, build ID, hashes, and the synthetic probe's metadata-only result in `.agent/caphub/autonomous-web-research-verification.md`. Update `.agent/CURRENT.md` and the activation log, then:

  ```bash
  git add .agent/CURRENT.md .agent/caphub/production-activation-log.md .agent/caphub/autonomous-web-research-verification.md docs/caphub-foundation.md docs/operations.md
  git commit -m "docs(caphub): bind autonomous research acceptance evidence"
  ```

- [ ] **Step 5: Reload the local production service**

  Verify the installed LaunchAgent working directory still targets this release worktree and that its plist remains mode `0600`. Reload only `com.agentjoey.alljobs`. Confirm launchd reports running, the listener is only `127.0.0.1:3456`, and `/caphub` plus `/reviews` return HTTP 200 from the final build.

- [ ] **Step 6: Run one real V3 Capture canary**

  Run exactly once:
  ```bash
  npm run caphub:analyze -- cap_379e2508ead34c349fcb303bcd39eff2
  ```

  Read back metadata only. Acceptance requires:

  - `analysis_contract_version = caphub-analysis-v3`;
  - `supersedes_job_id` points to the terminal V2 job;
  - MiniMax `web_search` and DeepSeek research/assessment audits succeeded;
  - research, assessment, and ReviewPacket artifacts exist;
  - the job is completed or waiting for human review with a Review Center item;
  - no provider retry occurred.

- [ ] **Step 7: Record final runtime evidence and commit**

  Append the job ID, artifact IDs/digests, audit metadata, HTTP checks, listener binding, and final build ID without source content or secret values. Run `git diff --check`, verify the exact staged files, and commit:

  ```bash
  git add .agent/CURRENT.md .agent/caphub/production-activation-log.md .agent/caphub/autonomous-web-research-verification.md
  git commit -m "docs(caphub): record V3 production canary"
  ```

- [ ] **Step 8: Verify the branch boundary**

  Run:
  ```bash
  git status --short --branch
  git log --oneline --decorate -8
  ```
  Expected: clean `codex/caphub-release`; no push, merge, tag, release, or main-checkout mutation.

---

### Task 6: V3 Canary Correction and V4 Closeout

**Finding:** The single V3 production canary completed extraction and MiniMax
web search, then stopped at DeepSeek research with
`SCHEMA_INVALID_TWICE`. No ReviewPacket or Review Request was created.

- [x] Characterize the terminal V3 job using metadata-only Registry evidence;
  do not retry it.
- [x] Add model-owned research, assessment, and critic draft schemas; host-owned
  identifiers, evidence, lineage, and timestamps remain host-composed.
- [x] Let one schema-correction call regenerate from the original stage input
  and issue paths without retaining the rejected response.
- [x] Bump the active deterministic job contract to V4 and prefer V3 as its
  immutable predecessor.
- [x] Verify with 20 focused files / 135 tests, typecheck, focused ESLint,
  deployment invariants, and a webpack production build.
- [ ] Reload `com.agentjoey.alljobs` from the V4 final build under explicit
  authorization.
- [ ] Run exactly one separately authorized V4 canary for
  `cap_379e2508ead34c349fcb303bcd39eff2` and verify the Review Center item.
- [ ] Record the final V4 runtime evidence and branch boundary.
