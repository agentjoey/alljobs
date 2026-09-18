# Caphub DeepSeek Provider Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Caphub's active Kimi research/assessment provider with the
fixed DeepSeek-V4.1-Flash API contract (`deepseek-flash`) while preserving
bounded workflow, human-review, Registry, and target/export safety behavior.

**Architecture:** Add a narrow first-party DeepSeek Responses API adapter at
the existing `StructuredProvider` boundary. It sends a fixed, non-streaming,
tool-free `POST /responses` request and returns only parsed terminal JSON plus
usage to the current workflow; Zod validation and the existing one-correction
loop remain outside the transport. Runtime construction, preflight reporting,
audit identity, and ReviewPacket model contracts switch active stages from Kimi
to DeepSeek. Historical Kimi records remain decodable, but no active config or
runtime route references Kimi.

**Tech Stack:** Next.js 16 / TypeScript 5 / Zod 4 / Vitest 4 / native `fetch`
over DeepSeek Responses API / existing PostgreSQL Registry and Caphub workflow.

**Spec:** `docs/superpowers/specs/2026-09-18-caphub-deepseek-provider-replacement-design.md`

## Global Constraints

- Use the fixed API origin `https://api.deepseek.com`, endpoint `/responses`,
  and exact model ID `deepseek-flash`; never use the marketing string
  `deepseek-v4.1-flash` as an API ID.
- DeepSeek handles `research` and `assessment` only. MiniMax remains fixed for
  `extraction` and `critic`; do not fold the current MiniMax interrupted-call
  diagnosis into this work.
- Request non-streaming structured output with `text.format.json_schema`,
  `reasoning.effort: "none"`, no tools, no provider transport retry, and the
  existing per-stage output limits.
- Keep the existing `runStructuredStage` budget and one schema-correction loop;
  never persist prompts, outputs, reasoning, headers, or secret values.
- `DEEPSEEK_API_KEY` is a future private LaunchAgent environment variable. Do
  not write it, test it against the network, reload the service, or modify
  production configuration during implementation.
- Kimi local-login code, existing private Kimi credential, and past Registry
  records are not deletion targets in this plan. They become unreferenced by
  the active runtime and are retired only by a separately authorized cleanup.
- Use exact-file staging in the isolated `codex/caphub-release` worktree;
  never touch the Human-owned main checkout.
- Review the final coherent provider replacement once; do not repeat global
  reviews or full suites after every internal task.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/caphub/providers/deepseek.ts` | Stage-scoped DeepSeek provider; deterministic prompts and schema handoff. |
| `lib/caphub/providers/deepseek-responses.ts` | Fixed DeepSeek `/responses` HTTP contract, terminal parsing, safe error mapping. |
| `lib/caphub/providers/deepseek*.test.ts` | Request-shape, parsing, error, no-secret, and provider-stage behavior. |
| `lib/caphub/providers/contracts.ts` | Add `deepseek` as a known provider identity while retaining `kimi` for historical code/records. |
| `lib/caphub/research/research.ts` | Replace the Kimi-named worker option type with provider-neutral research invocation options. |
| `lib/caphub/service/analyze-runtime.ts` | Construct DeepSeek from the fixed secret environment variable for research/assessment. |
| `lib/caphub/service/analyze.ts` | Write DeepSeek model contracts into generated ReviewPackets. |
| `lib/caphub/analysis/limits.ts` | Add the DeepSeek timeout entry without loosening existing limits. |
| `lib/caphub/analysis/schemas.ts` | Accept `deepseek` in current model/audit contracts and retain `kimi` only for historic record decoding. |
| `lib/planning/config.ts` | Replace active Kimi analysis config literals with fixed DeepSeek literals. |
| `scripts/caphub-production-preflight.ts` | Report DeepSeek configuration and compatibility status, not Kimi status. |
| Focused existing tests | Update only fixtures that express active provider/config/model-contract facts. |
| `.agent/CURRENT.md`, `.agent/caphub/production-activation-log.md` | Record implementation evidence and state that live diagnostic/configuration remains gated. |

## Task 1: DeepSeek Responses adapter and stage provider

**Files:**
- Create: `lib/caphub/providers/deepseek-responses.ts`
- Create: `lib/caphub/providers/deepseek-responses.test.ts`
- Create: `lib/caphub/providers/deepseek.ts`
- Create: `lib/caphub/providers/deepseek.test.ts`
- Modify: `lib/caphub/providers/contracts.ts`
- Modify: `lib/caphub/research/research.ts`

**Interfaces:**
- Consumes: `StructuredProvider`, `StructuredProviderInput`,
  `StructuredProviderOutput`, `ProviderInvocationError` from
  `lib/caphub/providers/contracts.ts`; `researchDossierSchema` and
  `capabilityAssessmentSchema` from `lib/caphub/analysis/schemas.ts`.
- Produces: `DeepSeekProvider implements StructuredProvider`, with
  `provider === "deepseek"`, `model === "deepseek-flash"`, and support only
  for `research` / `assessment`; `DeepSeekResponsesAdapter.generate()` returns
  parsed JSON plus usage or throws a safe `ProviderInvocationError`.

- [ ] **Step 1: Add failing DeepSeek Responses adapter tests**

  Create fixture responses and tests that inject a fetch stub. The success
  response must contain a `completed` status, exactly one assistant `message`,
  exactly one non-empty `output_text`, and usage. Assert the outgoing body and
  headers by value, never by printing the key:

  ```ts
  expect(fetch).toHaveBeenCalledWith("https://api.deepseek.com/responses", expect.objectContaining({
    method: "POST",
    headers: expect.objectContaining({
      authorization: "Bearer fixture-deepseek-key",
      "content-type": "application/json"
    }),
    signal
  }));
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
    model: "deepseek-flash",
    stream: false,
    reasoning: { effort: "none" },
    max_output_tokens: 8192,
    text: { format: { type: "json_schema", name: "caphub_research" } }
  });
  expect(body).not.toHaveProperty("tools");
  expect(body.text.format).not.toHaveProperty("strict");
  ```

  Add explicit failing cases for status `failed`, status `incomplete`, zero or
  multiple terminal assistant texts, malformed JSON, HTTP 401/402/400/422/
  429/500/503, network failure, and an aborted signal. Assert their exact
  `ProviderInvocationError.code` values and that neither request body nor
  response text appears in error messages.

- [ ] **Step 2: Run the new adapter tests to verify RED**

  Run:

  ```bash
  npm test -- lib/caphub/providers/deepseek-responses.test.ts lib/caphub/providers/deepseek.test.ts
  ```

  Expected: FAIL because the DeepSeek modules and provider identity do not yet
  exist.

- [ ] **Step 3: Implement the minimum fixed HTTP adapter**

  Define fixed exported constants and an injectable transport boundary:

  ```ts
  export const DEEPSEEK_API_BASE_URL = "https://api.deepseek.com";
  export const DEEPSEEK_RESPONSES_URL = `${DEEPSEEK_API_BASE_URL}/responses`;
  export const DEEPSEEK_API_MODEL = "deepseek-flash";

  export type DeepSeekResponsesRequest = {
    apiKey: string;
    stage: "research" | "assessment";
    prompt: string;
    schema: ZodType<unknown>;
    maxOutputTokens: number;
    signal: AbortSignal;
  };
  ```

  Convert `z.toJSONSchema(request.schema)` to the documented
  `text.format = { type: "json_schema", name, schema }` shape. The schema name
  is `caphub_research` or `caphub_assessment`. Send no `tools`, `store`,
  `strict`, untrusted base URL, or model override. Parse JSON only after
  checking `response.ok`; map HTTP status exactly as specified in the design.
  Parse only the terminal message text and numeric `usage.input_tokens` /
  `usage.output_tokens`; reject all malformed or ambiguous states as
  `INVALID_OUTPUT`.

- [ ] **Step 4: Implement the stage-limited DeepSeek provider**

  Add `DeepSeekProvider` with the same public methods as the active Kimi
  provider but DeepSeek-specific prompts:

  ```ts
  export class DeepSeekProvider implements StructuredProvider {
    readonly provider = "deepseek" as const;
    readonly model = DEEPSEEK_API_MODEL;

    async invoke(input: StructuredProviderInput): Promise<StructuredProviderOutput> {
      // Reject extraction/critic with ProviderInvocationError("PERMISSION").
      // Build a canonical, source-inert JSON prompt; delegate to the adapter.
    }
  }
  ```

  Use prompt marker `prompt_version=caphub-deepseek-v1`. Keep canonical JSON
  escaping and correction-message semantics from `kimi.ts`, but do not import
  Kimi types. Add provider-neutral
  `ResearchInvocationOptions { inputDigest: string; signal: AbortSignal }` in
  `research.ts`; update `ResearchWorker` to use it so it no longer depends on a
  Kimi-named type.

  Extend `StructuredProviderName` to include `"deepseek"` while retaining
  `"kimi"` so historical code and persisted records remain type-decodable.

- [ ] **Step 5: Run focused provider tests to verify GREEN**

  Run:

  ```bash
  npm test -- lib/caphub/providers/deepseek-responses.test.ts lib/caphub/providers/deepseek.test.ts lib/caphub/providers/structured-stage.test.ts lib/caphub/research/research.test.ts
  ```

  Expected: PASS. Confirm the test output contains no real endpoint call and no
  secret value.

- [ ] **Step 6: Commit the provider boundary**

  ```bash
  git add lib/caphub/providers/contracts.ts lib/caphub/providers/deepseek.ts \
    lib/caphub/providers/deepseek.test.ts lib/caphub/providers/deepseek-responses.ts \
    lib/caphub/providers/deepseek-responses.test.ts lib/caphub/research/research.ts \
    lib/caphub/research/research.test.ts
  git commit -m "feat(caphub): add DeepSeek structured provider"
  ```

## Task 2: Activate DeepSeek in Caphub configuration, runtime, and artifacts

**Files:**
- Modify: `lib/caphub/analysis/limits.ts`
- Modify: `lib/planning/config.ts`
- Modify: `lib/planning/config.test.ts`
- Modify: `lib/caphub/service/analyze-runtime.ts`
- Modify: `lib/caphub/service/analyze-runtime.test.ts`
- Modify: `lib/caphub/service/analyze.ts`
- Modify: `lib/caphub/service/analyze.test.ts`
- Modify: `lib/caphub/service/analyze.behavior.test.ts`
- Modify: `lib/caphub/analysis/schemas.ts`
- Modify: `lib/caphub/analysis/schemas.test.ts`
- Modify: `lib/caphub/analysis/review-packet.test.ts`
- Modify: `lib/caphub/registry/import-review-packet.test.ts`
- Modify: `lib/caphub/registry/queries.test.ts`
- Modify: `lib/caphub/registry/schemas.test.ts`

**Interfaces:**
- Consumes: `DeepSeekProvider`, `DeepSeekResponsesAdapter`, existing
  `CAPHUB_ANALYSIS_LIMITS`, and production workflow contracts from Task 1.
- Produces: an active Caphub runtime that builds DeepSeek only for research and
  assessment, configures only fixed DeepSeek fields, and emits DeepSeek model
  contracts without invalidating historical Kimi payload parsing.

- [ ] **Step 1: Write failing configuration/runtime/model-contract tests**

  Add tests that require exactly these active analysis defaults:

  ```ts
  expect(parsed.deepSeekApiBaseUrl).toBe("https://api.deepseek.com");
  expect(parsed.deepSeekApiModel).toBe("deepseek-flash");
  expect(parsed.deepSeekApiSecretEnv).toBe("DEEPSEEK_API_KEY");
  expect(() => schema.parse({ deepSeekApiBaseUrl: "https://example.test" })).toThrow();
  expect(reviewPacket.model_contracts).toContainEqual(
    expect.objectContaining({ stage: "research", provider: "deepseek", model: "deepseek-flash" })
  );
  ```

  Add a runtime fixture where `DEEPSEEK_API_KEY` is absent and assert the safe
  missing-secret failure. Add a fixture where it exists and assert research and
  assessment use a `DeepSeekProvider`, while extraction/critic remain MiniMax.
  Update Registry/schema fixture tests to accept a historical `kimi` packet and
  a current `deepseek` packet, proving backwards decoding without treating Kimi
  as active configuration.

- [ ] **Step 2: Run this configuration/runtime slice to verify RED**

  Run:

  ```bash
  npm test -- lib/planning/config.test.ts lib/caphub/service/analyze-runtime.test.ts lib/caphub/service/analyze.test.ts lib/caphub/service/analyze.behavior.test.ts lib/caphub/analysis/schemas.test.ts lib/caphub/analysis/review-packet.test.ts lib/caphub/registry/import-review-packet.test.ts lib/caphub/registry/queries.test.ts lib/caphub/registry/schemas.test.ts
  ```

  Expected: FAIL because runtime/config/model-contract fields still identify
  Kimi as the active provider.

- [ ] **Step 3: Replace only active Kimi wiring**

  Make these bounded changes:

  ```ts
  // analysis/limits.ts: retain legacy kimi timeout for existing historical code,
  // and add deepseek: 120_000 without increasing any total/job limit.
  providerTimeoutMs: Object.freeze({ minimax: 60_000, kimi: 120_000, deepseek: 120_000 })

  // config.ts: active config exposes only fixed DeepSeek literals.
  deepSeekApiBaseUrl: z.literal("https://api.deepseek.com"),
  deepSeekApiModel: z.literal("deepseek-flash"),
  deepSeekApiSecretEnv: secretEnvNameSchema.default("DEEPSEEK_API_KEY")
  ```

  In `analyze-runtime.ts`, remove Kimi runtime construction/imports and create
  `DeepSeekProvider({ adapter: new DeepSeekResponsesAdapter({ apiKey:
  requiredSecret(env, caphub.analysis.deepSeekApiSecretEnv) }) })`. Pass that
  instance into both `researchProvider` and `assessmentProvider`.

  Update `analyze.ts` ReviewPacket contracts to emit `deepseek` for research
  and assessment. Extend current `analysis/schemas.ts` enums to include
  `deepseek`; do not delete `kimi` from those parsing enums. Update only tests
  asserting active defaults/contracts; leave explicit legacy Kimi parsing
  fixtures intact.

- [ ] **Step 4: Run the runtime and Registry behavior slice to verify GREEN**

  Re-run the Step 2 command, then run:

  ```bash
  npm test -- lib/caphub/providers/deepseek-responses.test.ts lib/caphub/providers/deepseek.test.ts lib/caphub/providers/structured-stage.test.ts lib/caphub/research/research.test.ts
  ```

  Expected: PASS. Confirm no test loads a real LaunchAgent, needs a real key, or
  sends a network request.

- [ ] **Step 5: Commit active provider replacement**

  ```bash
  git add lib/caphub/analysis/limits.ts lib/caphub/analysis/schemas.ts \
    lib/caphub/analysis/schemas.test.ts lib/caphub/analysis/review-packet.test.ts \
    lib/caphub/service/analyze-runtime.ts lib/caphub/service/analyze-runtime.test.ts \
    lib/caphub/service/analyze.ts lib/caphub/service/analyze.test.ts \
    lib/caphub/service/analyze.behavior.test.ts lib/caphub/registry/import-review-packet.test.ts \
    lib/caphub/registry/queries.test.ts lib/caphub/registry/schemas.test.ts \
    lib/planning/config.ts lib/planning/config.test.ts
  git commit -m "feat(caphub): use DeepSeek for research stages"
  ```

## Task 3: Preflight evidence, focused final verification, and handoff

**Files:**
- Modify: `scripts/caphub-production-preflight.ts`
- Modify: `scripts/caphub-production-preflight.test.ts`
- Modify: `.agent/CURRENT.md`
- Modify: `.agent/caphub/production-activation-log.md`

**Interfaces:**
- Consumes: fixed DeepSeek config fields and active `deepseek` model identity
  from Task 2.
- Produces: redacted, read-only preflight output with
  `deepseekConfigured` / `deepseekLiveCompatibility`; a complete local evidence
  record that leaves the live provider diagnostic and production configuration
  explicitly pending.

- [ ] **Step 1: Write failing preflight tests**

  Replace active provider expectations in the existing preflight test fixtures:

  ```ts
  providers: {
    minimaxConfigured: true,
    deepseekConfigured: true,
    deepseekLiveCompatibility: "pending"
  }
  ```

  Add assertions that reports reject omitted/wrongly typed DeepSeek fields and
  that the serialized redacted report contains neither `DEEPSEEK_API_KEY` nor
  any secret value. Keep the existing read-only and exports-disabled assertions.

- [ ] **Step 2: Run preflight tests to verify RED**

  Run:

  ```bash
  npm test -- scripts/caphub-production-preflight.test.ts
  ```

  Expected: FAIL because production preflight still names Kimi.

- [ ] **Step 3: Implement the redacted preflight rename**

  Rename the report/snapshot fields and readiness decision checks from Kimi to
  DeepSeek. In the local collector, read only the configured secret variable's
  presence:

  ```ts
  const deepSeekEnv = caphub?.analysis.deepSeekApiSecretEnv ?? "DEEPSEEK_API_KEY";
  deepseekConfigured: Boolean(process.env[deepSeekEnv]),
  deepseekLiveCompatibility: "pending"
  ```

  Preserve the existing preflight rule that analysis must be disabled before a
  pending live compatibility gate can advance. Never have the collector issue a
  model request.

- [ ] **Step 4: Run focused final verification**

  Run the complete affected test set once after all edits:

  ```bash
  npm test -- \
    lib/caphub/providers/deepseek-responses.test.ts \
    lib/caphub/providers/deepseek.test.ts \
    lib/caphub/providers/structured-stage.test.ts \
    lib/caphub/research/research.test.ts \
    lib/caphub/service/analyze-runtime.test.ts \
    lib/caphub/service/analyze.test.ts \
    lib/caphub/service/analyze.behavior.test.ts \
    lib/caphub/analysis/schemas.test.ts \
    lib/caphub/analysis/review-packet.test.ts \
    lib/caphub/registry/import-review-packet.test.ts \
    lib/caphub/registry/queries.test.ts \
    lib/caphub/registry/schemas.test.ts \
    lib/planning/config.test.ts \
    scripts/caphub-production-preflight.test.ts
  npm run typecheck
  npm run lint
  npm run build
  ```

  Expected: all selected tests, typecheck, lint, and webpack production build
  pass. Do not run an unrelated full e2e suite unless a changed contract makes
  its relevant Caphub scenario necessary.

- [ ] **Step 5: Perform one scoped code review and update evidence**

  Review only the final provider replacement diff for fixed-origin/model
  enforcement, no secret/raw-model leakage, error classification, no hidden
  retries/tools, stage assignment, Registry backwards decoding, and the fact
  that no live request was made. Record test/build evidence and the following
  pending gate in both agent records:

  ```text
  Live DeepSeek credential installation, synthetic Responses API json_schema
  contract diagnostic, service rebuild/reload, and any new Capture analysis are
  not performed by local implementation and each requires separate authority.
  ```

  Create one factual Caphub Linear project update after the local commit exists,
  naming the commit, scoped verification outcome, and the still-pending live
  diagnostic. Do not create per-test updates or claim production compatibility.

- [ ] **Step 6: Commit verification and handoff evidence**

  ```bash
  git add scripts/caphub-production-preflight.ts scripts/caphub-production-preflight.test.ts \
    .agent/CURRENT.md .agent/caphub/production-activation-log.md
  git commit -m "docs(caphub): record DeepSeek replacement verification"
  git status --short --branch
  git rev-parse HEAD
  ```

## Post-implementation Human Gates

1. Authorize a private `DEEPSEEK_API_KEY` insertion into the existing mode-600
   LaunchAgent; verify presence only.
2. Authorize one synthetic, no-Capture, no-tools DeepSeek `/responses`
   `json_schema` contract diagnostic. Record only status, terminal state,
   schema validity, token counts, provider/model, and safe error class.
3. If and only if that diagnostic passes, authorize the production rebuild and
   LaunchAgent reload with analysis disabled until a new specific Capture action
   is separately approved.
4. Diagnose and resolve the unrelated MiniMax extraction interruption before
   authorizing another real Capture analysis.
5. Consider Kimi credential/code retirement only after a separate inventory and
   explicit deletion authorization.
