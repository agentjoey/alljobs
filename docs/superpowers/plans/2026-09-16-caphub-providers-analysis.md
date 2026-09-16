# Caphub Providers and Analysis Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a received Caphub Capture into a durable, review-only `ReviewPacket` through deterministic preprocessing, bounded MiniMax/Kimi structured analysis, evidence resolution, capability assessment, and conditional critique.

**Architecture:** Keep orchestration deterministic and provider-neutral. All model workers receive versioned JSON, return one schema-validated JSON object, and have no model-visible file, Shell, Git, deploy, publish, or delegation tools; host-side source resolution is separately bounded by exact HTTPS origins and SSRF controls. Persist stage records, artifacts, and redacted model-call audit events under the existing traversal-safe Caphub state root so completed stages resume without repeating artifacts or audit effects.

**Tech Stack:** TypeScript 5, Node.js, Zod 4, AI SDK 7, OpenAI-compatible MiniMax M3, Kimi Code CLI 0.42 dual authentication, Vitest 4, `sharp`, `tesseract.js`, packaged English/Simplified-Chinese Tesseract data, `@zxing/library`, macOS `sandbox-exec`.

**Spec:** `docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`

## Global Constraints

- Caphub remains disabled by default; this plan does not enable production configuration, restart services, deploy, publish, push, merge, tag, or release.
- MiniMax and Kimi analysis workers receive no Shell, file-write, Git, install, code-execution, deploy, publish, or delegation tool.
- Model workers never receive Control Host configuration, arbitrary repository paths, secret values, or unapproved source content.
- Raw captures, deterministic preprocessing, claims, evidence, assessments, critique, and review packets remain separate versioned artifacts.
- Provider output is untrusted until strict Zod validation succeeds; the first schema failure permits exactly one correction request and the second failure routes the job to human review.
- Provider SDK/CLI transport retries remain zero. Application-level schema correction is the only permitted second provider attempt.
- Every model call records provider, model, prompt version, input version, input digest, result digest, latency, token/usage metadata when present, and terminal status; it never records reasoning, secret values, raw credentials, or raw prompts.
- API-key and local-login Kimi modes implement one `KimiProvider` contract and cannot alter workflow business state directly.
- Completed workflow stages are content-addressed and idempotent. A stage observed as in-flight without a terminal audit event routes to human review instead of silently repeating an external call.
- Identity ambiguity returns `IDENTITY_AMBIGUOUS`; no fuzzy best match may be promoted to a confirmed Entity.
- Prompt injection text remains evidence data. It cannot change tools, permissions, budgets, schema, orchestration, or approval state.
- P2 excludes approval UI, Registry releases, Kimi Code building, Obsidian projection, automatic deployment, and any write to formal Agent/Skill directories.
- Any real provider request beyond the completed P2-A probes requires fresh Human authorization.

## Remaining P2-A proof

The completed Kimi API-key probe used Kimi Code CLI's in-memory provider. It proved the credential and Kimi Coding endpoint but did not prove spec §9.3's canonical server-side direct-HTTP JSON Schema transport. Tasks 1–6 may implement and fixture-test that adapter, but P2-A remains partial and Task 10 cannot claim live API-mode compatibility until the Human Owner separately authorizes one direct-HTTP `Output.object` probe and it passes without retry.

## Proposed P2-B bounded policy

The implementation and fixture tests use these fixed upper bounds:

```ts
export const CAPHUB_ANALYSIS_LIMITS = {
  concurrency: 1,
  maxImages: 8,
  maxAggregateImageBytes: 40 * 1024 * 1024,
  maxAggregatePixels: 80_000_000,
  maxPixelsPerImage: 40_000_000,
  preprocessingTimeoutMs: 60_000,
  ocrTimeoutMsPerImage: 15_000,
  providerTimeoutMs: { minimax: 60_000, kimi: 120_000 },
  maxSchemaCorrections: 1,
  maxProviderCallsPerJob: 8,
  maxInputBytes: { extraction: 2_097_152, research: 1_048_576, assessment: 1_048_576, critic: 1_048_576 },
  maxTotalTokensPerJob: 256_000,
  maxSearchQueries: 4,
  maxFetchedSources: 8,
  sourceFetchTimeoutMs: 10_000,
  maxCompressedSourceBytes: 2 * 1024 * 1024,
  maxDecompressedSourceBytes: 4 * 1024 * 1024,
  maxRedirects: 2,
  maxOutputTokens: { extraction: 4_096, research: 8_192, assessment: 6_144, critic: 4_096 }
} as const;
```

Model-visible tools are empty. Host-side source access is disabled unless an exact HTTPS origin appears in `caphub.analysis.sourceAllowedOrigins`; redirect targets are revalidated, and loopback, private, link-local, multicast, credential-bearing, non-HTTPS, and trailing-dot hosts are rejected. The authorized public IP is pinned into the actual TLS connection, SNI and certificate validation retain the original hostname, and the connected peer address must equal the vetted address. Search remains an injected host port and is disabled in production configuration until a separately approved adapter is configured. Extracted explicit URLs may be fetched only through the same policy.

## File structure

- `lib/caphub/analysis/schemas.ts`: versioned stage, evidence, assessment, critique, packet, job, and audit schemas.
- `lib/caphub/analysis/types.ts`: inferred public P2 types.
- `lib/caphub/analysis/limits.ts`: immutable P2 budgets.
- `lib/caphub/analysis/digest.ts`: canonical JSON and SHA-256 helpers.
- `lib/caphub/preprocess/preprocessor.ts`: ordered-image validation and deterministic preprocessing orchestration.
- `lib/caphub/preprocess/image.ts`: orientation, dimensions, sharpness, border, OCR, barcode, and region extraction.
- `lib/caphub/preprocess/text.ts`: deterministic URL, repository, package, command, and privacy-candidate extraction.
- `lib/caphub/providers/contracts.ts`: provider-neutral request/result contracts and closed error taxonomy.
- `lib/caphub/providers/structured-stage.ts`: zero-transport-retry execution and one schema-correction policy.
- `lib/caphub/providers/minimax.ts`: no-tool MiniMax extraction and critic adapter.
- `lib/caphub/providers/kimi.ts`: stable `KimiProvider` facade and mode selection.
- `lib/caphub/providers/kimi-api.ts`: server-only direct HTTP structured-output adapter for Kimi API-key mode.
- `lib/caphub/providers/kimi-local.ts`: isolated local-login Kimi CLI environment.
- `lib/caphub/providers/kimi-runner.ts`: bounded `sandbox-exec` subprocess and stream-json parser.
- `lib/caphub/providers/kimi-egress-proxy.ts`: loopback-only proxy that pins fixed Kimi/Auth upstream addresses for the sandboxed CLI.
- `lib/caphub/providers/profiles/kimi-research.md`: zero-tool Kimi analysis profile.
- `lib/caphub/research/source-policy.ts`: exact-origin and SSRF-safe URL policy.
- `lib/caphub/research/source-gateway.ts`: host-side search and pinned-HTTPS fetch ports plus disabled/default implementation.
- `lib/caphub/research/research.ts`: evidence resolution and dossier construction.
- `lib/caphub/analysis/assessment.ts`: identity ambiguity, overlap/gap, disposition, and critic-trigger rules.
- `lib/caphub/analysis/review-packet.ts`: deterministic packet composition.
- `lib/caphub/workflow/contracts.ts`: job store, artifact store, and audit store ports.
- `lib/caphub/workflow/filesystem.ts`: secure atomic filesystem implementations.
- `lib/caphub/workflow/runner.ts`: resumable stage state machine.
- `lib/caphub/service/analyze.ts`: Capture-to-ReviewPacket application service.
- `scripts/caphub-analyze.ts`: disabled-by-default one-job Control Host entry point.
- `.agent/caphub/p2-threat-model.md`: threat model and P2-C proof checklist.
- `.agent/caphub/p2-verification.md`: final test, review, and verification record.

---

### Task 1: Freeze analysis configuration and dependency boundary

**Files:**
- Modify: `lib/planning/config.ts`
- Modify: `lib/planning/config.test.ts`
- Modify: `config/alljobs.example.json`
- Create: `lib/caphub/analysis/limits.ts`
- Test: `lib/caphub/analysis/limits.test.ts`

**Interfaces:**
- Consumes: existing `controlHostCaphubConfigSchema` and disabled-by-default Caphub configuration.
- Produces: `CAPHUB_ANALYSIS_LIMITS`, `controlHostCaphubAnalysisConfigSchema`, and resolved secret *names* only.

- [ ] **Step 1: Write failing configuration and limits tests**

Add tests that assert: analysis defaults to disabled; concurrency is exactly `1`; MiniMax/Kimi secret references are uppercase environment-variable names; provider URLs are fixed HTTPS URLs without credentials; source origins are exact HTTPS origins; bounds cannot exceed the constants above; and unknown fields are rejected.

```ts
expect(controlHostCaphubConfigSchema.parse({}).analysis.enabled).toBe(false);
expect(() => controlHostCaphubConfigSchema.parse({
  analysis: { enabled: true, concurrency: 2 }
})).toThrow();
expect(() => controlHostCaphubConfigSchema.parse({
  analysis: { sourceAllowedOrigins: ["https://example.com/path"] }
})).toThrow();
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- lib/planning/config.test.ts lib/caphub/analysis/limits.test.ts`

Expected: FAIL because `analysis` and `CAPHUB_ANALYSIS_LIMITS` do not exist.

- [ ] **Step 3: Implement the strict disabled configuration**

Use literal provider/model defaults and secret environment-variable names, never values:

```ts
export const controlHostCaphubAnalysisConfigSchema = z.object({
  enabled: z.boolean().default(false),
  concurrency: z.literal(1).default(1),
  miniMaxSecretEnv: secretEnvNameSchema.default("MINIMAX_API_KEY"),
  kimiMode: z.enum(["api_key", "local_login"]).default("api_key"),
  kimiApiSecretEnv: secretEnvNameSchema.default("KIMI_CODE_API_KEY"),
  sourceAllowedOrigins: z.array(exactHttpsOriginSchema).max(32).default([])
}).strict();
```

- [ ] **Step 4: Verify GREEN and static checks**

Run: `npm test -- lib/planning/config.test.ts lib/caphub/analysis/limits.test.ts`

Run: `npm run typecheck`

Expected: all focused tests pass and TypeScript exits `0`.

- [ ] **Step 5: Commit**

```bash
git add lib/planning/config.ts lib/planning/config.test.ts config/alljobs.example.json lib/caphub/analysis/limits.ts lib/caphub/analysis/limits.test.ts
git commit -m "feat(caphub): bound P2 analysis configuration"
```

### Task 2: Define versioned analysis and workflow schemas

**Files:**
- Create: `lib/caphub/analysis/schemas.ts`
- Create: `lib/caphub/analysis/types.ts`
- Create: `lib/caphub/analysis/schemas.test.ts`
- Create: `lib/caphub/analysis/digest.ts`
- Create: `lib/caphub/analysis/digest.test.ts`

**Interfaces:**
- Consumes: `CaptureId`, `ObjectRef`, and strict Zod conventions from P1.
- Produces: `PreprocessResult`, `ExtractionResult`, `ResearchDossier`, `CapabilityAssessment`, `CriticReview`, `ReviewPacket`, `AnalysisJob`, `StageArtifact`, and `ModelCallAuditEvent`.

- [ ] **Step 1: Write failing schema tests for every stage**

Create one valid fixture per schema and explicit rejection tests for unknown keys, missing evidence citations, unsupported schema versions, out-of-range 0–5 dimensions, confirmed identities without A/B evidence, preprocessing images without sharpness/black-border/OCR-usability results, region labels outside `platform_ui | subtitle | comment | body | unknown`, and packets that omit claims, alternatives, platform previews, or unresolved questions.

```ts
expect(extractionResultSchema.parse(validExtraction).schema_version).toBe(1);
expect(() => researchDossierSchema.parse({
  ...validDossier,
  identity: { status: "confirmed", entity_id: "ent_demo", evidence_ids: [] }
})).toThrow();
expect(() => capabilityAssessmentSchema.parse({
  ...validAssessment,
  dimensions: { ...validAssessment.dimensions, security_risk: 6 }
})).toThrow();
```

- [ ] **Step 2: Run schema tests and verify RED**

Run: `npm test -- lib/caphub/analysis/schemas.test.ts lib/caphub/analysis/digest.test.ts`

Expected: FAIL with missing schema/digest modules.

- [ ] **Step 3: Implement strict schemas and canonical digests**

Use discriminated unions for identity and terminal job states:

```ts
export const identityResolutionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("confirmed"), entity_id: entityIdSchema, evidence_ids: z.array(evidenceIdSchema).min(1) }).strict(),
  z.object({ status: z.literal("IDENTITY_AMBIGUOUS"), candidates: z.array(identityCandidateSchema).min(2), reason: z.string().min(1) }).strict()
]);

export const dispositionSchema = z.enum(["adopt", "adapt", "build", "learn", "watch", "reject"]);

export const contentRegionKindSchema = z.enum([
  "platform_ui", "subtitle", "comment", "body", "unknown"
]);
```

Canonical JSON must sort object keys recursively before hashing so identical stage inputs produce identical SHA-256 digests.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- lib/caphub/analysis/schemas.test.ts lib/caphub/analysis/digest.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/analysis/schemas.ts lib/caphub/analysis/types.ts lib/caphub/analysis/schemas.test.ts lib/caphub/analysis/digest.ts lib/caphub/analysis/digest.test.ts
git commit -m "feat(caphub): define P2 analysis contracts"
```

### Task 3: Implement deterministic media preprocessing

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/caphub/preprocess/image.ts`
- Create: `lib/caphub/preprocess/image.test.ts`
- Create: `lib/caphub/preprocess/text.ts`
- Create: `lib/caphub/preprocess/text.test.ts`
- Create: `lib/caphub/preprocess/preprocessor.ts`
- Create: `lib/caphub/preprocess/preprocessor.test.ts`
- Create: `lib/caphub/preprocess/fixtures.ts`

**Interfaces:**
- Consumes: ordered immutable object bytes and `CAPHUB_ANALYSIS_LIMITS`.
- Produces: `preprocessCapture(input): Promise<PreprocessResult>` with original/normalized digests, dimensions, sharpness, black-border ratio, OCR usability, geometric/semantic region candidates, OCR blocks, barcode payloads, extracted indicators, perceptual hashes, duplicate groups, and privacy suggestions.

- [ ] **Step 1: Write failing image and text characterization tests**

Tests must prove EXIF orientation normalization, per-image and aggregate pixel-limit rejection before OCR, preprocessing/OCR deadlines, deterministic sharpness and black-border measurements, OCR-usability classification, deterministic OCR block ordering, geometric region grouping plus conservative `platform_ui`/`subtitle`/`comment`/`body`/`unknown` labels, QR extraction, exact SHA-256 duplicate detection, perceptual near-duplicate grouping, URL/repository/package/command extraction, and privacy suggestions that never alter source bytes.

```ts
expect(result.images[0].orientation_applied).toBe(6);
expect(result.images[0].quality).toEqual(expect.objectContaining({
  sharpness: expect.any(Number),
  black_border_ratio: expect.any(Number),
  ocr_usable: expect.any(Boolean)
}));
expect(result.images[0].regions.map((region) => region.kind)).toEqual(
  expect.arrayContaining(["platform_ui", "body"])
);
expect(result.duplicate_groups).toEqual([[0, 1]]);
expect(result.indicators.urls).toContain("https://example.com/tool");
expect(result.privacy_suggestions[0].action).toBe("human_redaction_review");
```

- [ ] **Step 2: Run focused preprocessing tests and verify RED**

Run: `npm test -- lib/caphub/preprocess/image.test.ts lib/caphub/preprocess/text.test.ts lib/caphub/preprocess/preprocessor.test.ts`

Expected: FAIL because preprocessing modules do not exist.

- [ ] **Step 3: Install deterministic media dependencies**

Run:

```bash
npm install sharp tesseract.js @tesseract.js-data/eng @tesseract.js-data/chi_sim @zxing/library
```

Expected: `package.json` and `package-lock.json` add exactly these direct runtime dependencies. OCR language data resolves from installed package paths; runtime downloads are forbidden.

- [ ] **Step 4: Implement bounded image normalization and extraction**

Use `sharp` for metadata/orientation/grayscale statistics and normalized PNG output, `tesseract.js` with packaged English/Simplified-Chinese language data and one worker at a time, and `@zxing/library` for QR/barcodes. OCR blocks sort by `(page, y, x, text)`; commands are evidence strings only and are never executed. `fixtures.ts` generates small deterministic images in memory so no opaque binary fixtures enter Git.

```ts
export interface ImagePreprocessorDependencies {
  recognizeText(bytes: Uint8Array): Promise<readonly OcrBlock[]>;
  decodeBarcodes(bytes: Uint8Array): Promise<readonly BarcodeFinding[]>;
}
```

- [ ] **Step 5: Implement capture-level aggregation**

Reject more than 8 images, more than 40 MiB aggregate input, more than 80 million aggregate pixels, or work exceeding the fixed preprocessing/OCR deadlines; preserve user order, derive exact/perceptual duplicate groups, and return only schema-valid deterministic output.

- [ ] **Step 6: Verify GREEN and regression scope**

Run: `npm test -- lib/caphub/preprocess/image.test.ts lib/caphub/preprocess/text.test.ts lib/caphub/preprocess/preprocessor.test.ts lib/caphub/domain/schemas.test.ts lib/caphub/storage/local-objects.test.ts`

Expected: focused P2 and adjacent P1 tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/caphub/preprocess
git commit -m "feat(caphub): add deterministic capture preprocessing"
```

### Task 4: Add provider-neutral structured execution and redacted audit

**Files:**
- Create: `lib/caphub/providers/contracts.ts`
- Create: `lib/caphub/providers/structured-stage.ts`
- Create: `lib/caphub/providers/structured-stage.test.ts`
- Create: `lib/caphub/workflow/contracts.ts`
- Create: `lib/caphub/workflow/audit.ts`
- Create: `lib/caphub/workflow/audit.test.ts`

**Interfaces:**
- Consumes: a Zod schema, one primary provider call, one correction provider call, deterministic clock/id factories, and `ModelCallAuditStore`.
- Produces: `runStructuredStage<T>(request): Promise<T>` and deterministic redacted audit events.

- [ ] **Step 1: Write failing one-correction and audit tests**

Cover valid first response, invalid then valid correction, two invalid responses routing to `HUMAN_REVIEW_REQUIRED`, abort/timeout, provider-unavailable mapping, zero transport retry, deterministic call IDs, per-stage input-byte rejection before transport, eight-call total job ceiling including corrections/critic, terminal 256,000-token ceiling, and audit payload secret/reasoning exclusion.

```ts
expect(provider.calls).toHaveLength(2);
expect(result).toEqual({ kind: "human_review", reason: "SCHEMA_INVALID_TWICE" });
expect(JSON.stringify(auditEvents)).not.toMatch(/api[_-]?key|reasoning|secret/i);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/caphub/providers/structured-stage.test.ts lib/caphub/workflow/audit.test.ts`

Expected: FAIL because runner and audit modules do not exist.

- [ ] **Step 3: Implement the closed provider contract**

```ts
export interface StructuredProvider {
  readonly provider: "minimax" | "kimi";
  readonly model: string;
  invoke(input: StructuredProviderInput): Promise<StructuredProviderOutput>;
}

export type ProviderFailureCode =
  | "ABORTED"
  | "TIMEOUT"
  | "AUTHENTICATION"
  | "BILLING"
  | "PERMISSION"
  | "UNAVAILABLE"
  | "INVALID_OUTPUT";
```

The correction prompt contains only validation issue paths and the original input digest, never the raw rejected response or credentials.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- lib/caphub/providers/structured-stage.test.ts lib/caphub/workflow/audit.test.ts`

Expected: all tests pass with exactly two calls only in the invalid-first-response case.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/providers/contracts.ts lib/caphub/providers/structured-stage.ts lib/caphub/providers/structured-stage.test.ts lib/caphub/workflow/contracts.ts lib/caphub/workflow/audit.ts lib/caphub/workflow/audit.test.ts
git commit -m "feat(caphub): bound structured provider execution"
```

### Task 5: Implement no-tool MiniMax extraction and critic adapters

**Files:**
- Create: `lib/caphub/providers/minimax.ts`
- Create: `lib/caphub/providers/minimax.test.ts`
- Create: `lib/caphub/providers/prompts.ts`
- Create: `lib/caphub/providers/prompts.test.ts`
- Modify: `lib/assistant/minimax-token-plan-core.ts`
- Modify: `lib/assistant/minimax-token-plan-core.test.ts`

**Interfaces:**
- Consumes: `PreprocessResult`, ordered normalized images, approved evidence, strict output schemas, and existing MiniMax Token Plan transport.
- Produces: `MiniMaxProvider.extract(...)` and `MiniMaxProvider.critique(...)`; no tools field is ever present.

- [ ] **Step 1: Write failing adapter and prompt-isolation tests**

Inject a fake fetch/model transport and assert: ordered image `file` parts are used; prompt/input/schema versions are included; visible/OCR/inferred/unknown facts are separate; `maxRetries` is `0`; no `tools`, Shell, file, Git, or implementation instruction appears; hostile screenshot text remains inside `<untrusted_source>` data delimiters.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/caphub/providers/minimax.test.ts lib/caphub/providers/prompts.test.ts lib/assistant/minimax-token-plan-core.test.ts`

Expected: FAIL because the P2 MiniMax adapter and prompt builders do not exist.

- [ ] **Step 3: Implement the adapter**

Reuse the fixed official Token Plan endpoint/model and expose a testable fetch injection in `createMiniMaxTokenPlanModel`. Call AI SDK generation with bounded output, abort signal, and no tools. Parse terminal text with the shared structured runner.

```ts
const result = generateText({
  model,
  messages,
  maxOutputTokens: limits.maxOutputTokens,
  maxRetries: 0,
  abortSignal
});
```

- [ ] **Step 4: Verify GREEN and server-only boundary**

Run: `npm test -- lib/caphub/providers/minimax.test.ts lib/caphub/providers/prompts.test.ts lib/assistant/minimax-token-plan-core.test.ts scripts/verify-deployment-config.test.ts`

Run: `npm run typecheck`

Expected: tests and typecheck pass; secret access remains server-only.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/providers/minimax.ts lib/caphub/providers/minimax.test.ts lib/caphub/providers/prompts.ts lib/caphub/providers/prompts.test.ts lib/assistant/minimax-token-plan-core.ts lib/assistant/minimax-token-plan-core.test.ts
git commit -m "feat(caphub): add bounded MiniMax analysis workers"
```

### Task 6: Implement dual-mode Kimi with an outer sandbox

**Files:**
- Create: `lib/caphub/providers/kimi.ts`
- Create: `lib/caphub/providers/kimi.test.ts`
- Create: `lib/caphub/providers/kimi-api.ts`
- Create: `lib/caphub/providers/kimi-api.test.ts`
- Create: `lib/caphub/providers/kimi-local.ts`
- Create: `lib/caphub/providers/kimi-local.test.ts`
- Create: `lib/caphub/providers/kimi-runner.ts`
- Create: `lib/caphub/providers/kimi-runner.test.ts`
- Create: `lib/caphub/providers/kimi-egress-proxy.ts`
- Create: `lib/caphub/providers/kimi-egress-proxy.test.ts`
- Create: `lib/caphub/providers/kimi-local-credentials.ts`
- Create: `lib/caphub/providers/kimi-local-credentials.test.ts`
- Create: `lib/caphub/providers/profiles/kimi-research.md`
- Create: `lib/caphub/providers/fixtures/fake-kimi.mjs`

**Interfaces:**
- Consumes: schema-versioned research/assessment input, selected authentication mode, explicit secret value supplied by the server-only factory, validated local OAuth projection, 0700 temporary root, abort signal, and clock.
- Produces: one `KimiProvider` contract with `research` and `assess`; both modes return identical provider-neutral metadata.

- [ ] **Step 1: Write failing direct-HTTP and fake-process BDD tests**

For API-key mode, inject a fake HTTPS transport and assert one direct OpenAI-compatible structured-output request uses `Output.object({ schema })`, `maxRetries: 0`, the fixed Kimi Coding `/v1` base, and no CLI process. For local-login mode, drive the real spawn/stream-json boundary by running a copied `fake-kimi.mjs` inside the temporary root through the host's real `/usr/bin/sandbox-exec`. Assert both modes produce the same provider-neutral result shape.

The local-login tests must also prove: child cwd and `KIMI_CODE_HOME` are inside one canonical temporary root; the child environment contains only an explicit allowlist; stdout/stderr caps and timeout kill the process group; malformed events fail closed; tool-call events fail with `PERMISSION`; reads of the repository, `.git`, default Kimi Home, `~/.ssh`, `~/Library/Keychains`, and an unrelated user-owned canary are denied; writes outside the temporary root and nested process execution are denied; direct non-loopback sockets are denied; only the loopback egress proxy is reachable; and cleanup removes the temporary root.

```ts
expect(apiResult.output).toEqual(localResult.output);
expect(apiTransport.requests).toHaveLength(1);
expect(apiTransport.requests[0].structuredOutput).toBe(true);
expect(recordedSpawn.argv[0]).toBe("/usr/bin/sandbox-exec");
expect(recordedSpawn.env).not.toHaveProperty("SSH_AUTH_SOCK");
expect(recordedSpawn.env).not.toHaveProperty("GITHUB_TOKEN");
expect(sandboxProbe.deniedReads).toEqual([
  "repository", "git", "default_kimi_home", "ssh", "keychain", "unrelated_user_file"
]);
expect(sandboxProbe.directNetworkDenied).toBe(true);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/caphub/providers/kimi.test.ts lib/caphub/providers/kimi-api.test.ts lib/caphub/providers/kimi-local.test.ts lib/caphub/providers/kimi-runner.test.ts lib/caphub/providers/kimi-egress-proxy.test.ts lib/caphub/providers/kimi-local-credentials.test.ts`

Expected: FAIL because Kimi provider modules do not exist.

- [ ] **Step 3: Implement direct API-key structured output**

Use `createOpenAI` with the fixed `https://api.kimi.com/coding/v1` base and `generateText({ output: Output.object({ schema }), maxRetries: 0 })`. The adapter is server-only, accepts an injected transport for tests, registers no tools, enforces input/output/timeout/job budgets, and maps only closed safe error codes.

```ts
const result = await generateText({
  model: provider("kimi-for-coding"),
  output: Output.object({ schema }),
  prompt,
  maxOutputTokens,
  maxRetries: 0,
  abortSignal
});
```

- [ ] **Step 4: Implement the zero-tool profile and Seatbelt profile**

The agent file must contain `tools: []`, explicit deny entries for Bash/Shell/Write/Edit/Git/Agent/AgentSwarm, and instructions to return only the requested JSON. Generate a macOS Seatbelt profile that denies by default, permits only the exact Kimi runtime/system library reads plus the ephemeral root, permits writes only inside the exact temporary root, explicitly denies repository/Git/default-Kimi/SSH/keychain/unrelated-user reads, denies nested process execution, denies non-loopback network, and permits only the loopback proxy socket.

- [ ] **Step 5: Implement the local-login egress proxy**

Bind an ephemeral proxy to `127.0.0.1`. Accept only `CONNECT` targets in the fixed set `api.kimi.com:443` and `auth.kimi.com:443`; resolve each target through the pinned public-address policy, connect only to the vetted address while preserving TLS SNI/certificate hostname checks, validate the connected peer address, enforce byte/time limits, strip proxy headers, and never log authorization headers or bodies. Point the sandboxed CLI at this proxy through an allowlisted proxy environment. The child cannot make a direct external connection.

- [ ] **Step 6: Implement exact local-login credential projection**

Reject symlinked, non-owner, group/other-writable, oversized, or unknown source files. Parse the default Kimi configuration with a strict projection schema; accept only the fixed managed provider/model base URL plus its OAuth `storage`/`key` reference; copy only the referenced credential material into `0600` files; and generate a fresh temporary config containing no hooks, plugins, MCP servers, skills, tools, search/fetch services, custom headers, or alternate endpoints. Never copy arbitrary configuration text.

- [ ] **Step 7: Implement bounded stream-json parsing**

Accept only JSONL events, reject any tool-call event, find exactly one terminal string matching the requested schema, record byte/event counts, and never return thinking, raw stderr, raw prompts, credentials, or session logs.

- [ ] **Step 8: Verify GREEN and sandbox/egress denial behavior**

Run: `npm test -- lib/caphub/providers/kimi.test.ts lib/caphub/providers/kimi-api.test.ts lib/caphub/providers/kimi-local.test.ts lib/caphub/providers/kimi-runner.test.ts lib/caphub/providers/kimi-egress-proxy.test.ts lib/caphub/providers/kimi-local-credentials.test.ts`

Expected: direct API structured-output tests pass; local fixture-process tests prove protected reads, outside writes, nested execution, and direct egress are denied by the real macOS sandbox boundary; the loopback proxy proves fixed-target address pinning and peer validation.

- [ ] **Step 9: Commit**

```bash
git add lib/caphub/providers/kimi.ts lib/caphub/providers/kimi.test.ts lib/caphub/providers/kimi-api.ts lib/caphub/providers/kimi-api.test.ts lib/caphub/providers/kimi-local.ts lib/caphub/providers/kimi-local.test.ts lib/caphub/providers/kimi-runner.ts lib/caphub/providers/kimi-runner.test.ts lib/caphub/providers/kimi-egress-proxy.ts lib/caphub/providers/kimi-egress-proxy.test.ts lib/caphub/providers/kimi-local-credentials.ts lib/caphub/providers/kimi-local-credentials.test.ts lib/caphub/providers/profiles/kimi-research.md lib/caphub/providers/fixtures
git commit -m "feat(caphub): add sandboxed dual-mode Kimi provider"
```

### Task 7: Resolve approved evidence and construct a ResearchDossier

**Files:**
- Create: `lib/caphub/research/source-policy.ts`
- Create: `lib/caphub/research/source-policy.test.ts`
- Create: `lib/caphub/research/source-gateway.ts`
- Create: `lib/caphub/research/source-gateway.test.ts`
- Create: `lib/caphub/research/research.ts`
- Create: `lib/caphub/research/research.test.ts`

**Interfaces:**
- Consumes: `ExtractionResult`, exact allowed origins, injected DNS resolver/pinned-HTTPS/search ports, clock, and `KimiProvider`.
- Produces: bounded `EvidenceRecord[]` and `ResearchDossier`; unresolvable identities become `IDENTITY_AMBIGUOUS`.

- [ ] **Step 1: Write failing URL-policy and hostile-source tests**

Reject HTTP, credentials, fragments used as authority, redirects to unapproved origins, DNS answers in private/loopback/link-local/multicast ranges, mixed public/private DNS answers, DNS rebinding between authorization and connection, a connected peer not in the vetted address set, oversized compressed or decompressed bodies, unsupported MIME types, fetches exceeding 10 seconds, more than two redirects, and more than the configured query/fetch counts.

```ts
await expect(policy.authorize("https://127.0.0.1/admin")).rejects.toMatchObject({ code: "SOURCE_BLOCKED" });
await expect(policy.authorize("https://allowed.example/path")).resolves.toMatchObject({ origin: "https://allowed.example" });
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/caphub/research/source-policy.test.ts lib/caphub/research/source-gateway.test.ts lib/caphub/research/research.test.ts`

Expected: FAIL because research modules do not exist.

- [ ] **Step 3: Implement the disabled-by-default host gateway**

`DisabledResearchSourceGateway.search()` and `.fetch()` return `SOURCE_ACCESS_DISABLED`. The live HTTP fetch implementation is injectable and cannot run with an empty allowlist. Search is a port only; no unapproved search provider or credential is added by this task.

```ts
export interface AuthorizedHttpsTarget {
  readonly url: URL;
  readonly hostname: string;
  readonly addresses: readonly string[];
}

export interface PinnedHttpsTransport {
  request(target: AuthorizedHttpsTarget, signal: AbortSignal): Promise<FetchedSource>;
}

export interface ResearchSourceGateway {
  search(query: string, signal: AbortSignal): Promise<readonly SourceCandidate[]>;
  fetch(url: string, signal: AbortSignal): Promise<FetchedSource>;
}
```

Implement fetch with `node:https.request` and a custom `lookup` that returns only the previously vetted public address set. Preserve the original hostname for SNI and certificate verification, compare the socket's normalized `remoteAddress` to the vetted set before consuming response bytes, stream-enforce compressed/decompressed byte caps, and repeat authorization/address pinning for every redirect.

- [ ] **Step 4: Implement evidence normalization and identity rules**

Assign source tiers A–D, retain checked timestamps and content digests, keep source claims separate from system conclusions, and require at least one unambiguous A/B identity citation before `confirmed` is legal. Otherwise return at least two candidates or an explicit insufficient-evidence ambiguity.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- lib/caphub/research/source-policy.test.ts lib/caphub/research/source-gateway.test.ts lib/caphub/research/research.test.ts`

Expected: all tests pass; hostile instructions remain inert evidence strings.

- [ ] **Step 6: Commit**

```bash
git add lib/caphub/research
git commit -m "feat(caphub): add bounded evidence research"
```

### Task 8: Assess capabilities, trigger critique, and compose ReviewPacket

**Files:**
- Create: `lib/caphub/analysis/assessment.ts`
- Create: `lib/caphub/analysis/assessment.test.ts`
- Create: `lib/caphub/analysis/review-packet.ts`
- Create: `lib/caphub/analysis/review-packet.test.ts`

**Interfaces:**
- Consumes: `ExtractionResult`, `ResearchDossier`, optional Registry-read snapshot, `KimiProvider`, and `MiniMaxProvider`.
- Produces: `CapabilityAssessment`, optional `CriticReview`, and deterministic `ReviewPacket`.

- [ ] **Step 1: Write failing decision-table tests**

Test all six dispositions, independent 0–5 dimension reasons/citations, extracted Claim preservation, novel/overlap/replaces/complements/conflicts/gaps fields, ranked alternatives with evidence, deterministic platform previews, and critic triggers for `build`, high security risk, high-value resident capability, low confidence, conflicting evidence, and manual request.

```ts
expect(shouldRunCritic({ ...assessment, disposition: "build" })).toBe(true);
expect(shouldRunCritic({ ...assessment, disposition: "learn", security_risk: 1 })).toBe(false);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/caphub/analysis/assessment.test.ts lib/caphub/analysis/review-packet.test.ts`

Expected: FAIL because assessment and packet composers do not exist.

- [ ] **Step 3: Implement deterministic rules around model output**

The model may propose dimensions and disposition, but host validation enforces evidence citations, preserves independent dimensions, forces ambiguity into unresolved questions, and evaluates critic triggers locally.

- [ ] **Step 4: Implement packet composition**

The packet references immutable source object digests and stage artifact IDs; includes original screenshots, OCR, Entities, Claims, Evidence, conflict conclusions, capability candidate, alternatives, independent dimensions, recommended disposition, deterministic non-executable platform previews, model/contract versions, and unresolved questions; and always sets `human_review_required: true`. It must not contain a release, deployment, install command, or executable implementation instruction.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- lib/caphub/analysis/assessment.test.ts lib/caphub/analysis/review-packet.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/caphub/analysis/assessment.ts lib/caphub/analysis/assessment.test.ts lib/caphub/analysis/review-packet.ts lib/caphub/analysis/review-packet.test.ts
git commit -m "feat(caphub): compose review-only capability packets"
```

### Task 9: Persist resumable jobs without duplicate side effects

**Files:**
- Create: `lib/caphub/workflow/filesystem.ts`
- Create: `lib/caphub/workflow/filesystem.test.ts`
- Create: `lib/caphub/workflow/runner.ts`
- Create: `lib/caphub/workflow/runner.test.ts`
- Modify: `lib/caphub/storage/paths.ts`
- Modify: `lib/caphub/storage/paths.test.ts`

**Interfaces:**
- Consumes: secure Caphub root, analysis schemas, stage functions, deterministic IDs/digests, and audit/artifact/job ports.
- Produces: `runAnalysisJob(jobId, signal)` that resumes the first incomplete stage and never repeats a completed artifact/audit event.

- [ ] **Step 1: Write failing storage and crash-boundary tests**

Cover traversal/symlink rejection, `0600` files and `0700` directories, atomic job replacement, immutable artifact conflict detection, deterministic audit IDs, restart after each completed stage, concurrent same-job serialization, and an in-flight call without a terminal audit routing to `HUMAN_REVIEW_REQUIRED` without another provider call.

```ts
expect(provider.calls).toBe(0);
expect(resumed.status).toBe("human_review_required");
expect(resumed.reason).toBe("INTERRUPTED_PROVIDER_CALL");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/caphub/workflow/filesystem.test.ts lib/caphub/workflow/runner.test.ts lib/caphub/storage/paths.test.ts`

Expected: FAIL because workflow storage and new paths do not exist.

- [ ] **Step 3: Implement secure job/artifact/audit paths and stores**

Add strict `job_<32 hex>` and `art_<64 hex>` identifiers. Store jobs under `records/analysis-jobs`, immutable stage artifacts under `records/analysis-artifacts`, and append-only audit events under `events/model-calls`. Reuse P1 secure directory/file-handle checks; never accept configurable absolute subpaths.

- [ ] **Step 4: Implement the deterministic state machine**

Use the fixed stage order `preprocess → extraction → research → assessment → critic? → review_packet`. Before invoking a provider, persist a deterministic `started` audit event; after a validated result, persist the immutable artifact and terminal audit, then advance the job pointer atomically.

- [ ] **Step 5: Verify GREEN and adjacent storage regression**

Run: `npm test -- lib/caphub/workflow/filesystem.test.ts lib/caphub/workflow/runner.test.ts lib/caphub/storage/paths.test.ts lib/caphub/storage/filesystem.test.ts lib/caphub/storage/audit-log.test.ts`

Expected: all focused and adjacent P1 storage tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/caphub/workflow/filesystem.ts lib/caphub/workflow/filesystem.test.ts lib/caphub/workflow/runner.ts lib/caphub/workflow/runner.test.ts lib/caphub/storage/paths.ts lib/caphub/storage/paths.test.ts
git commit -m "feat(caphub): persist resumable analysis jobs"
```

### Task 10: Integrate Capture-to-ReviewPacket service and prove P2-C

**Files:**
- Create: `lib/caphub/service/analyze.ts`
- Create: `lib/caphub/service/analyze.test.ts`
- Create: `lib/caphub/service/analyze.behavior.test.ts`
- Create: `scripts/caphub-analyze.ts`
- Create: `scripts/caphub-analyze.test.ts`
- Modify: `package.json`
- Modify: `docs/caphub-foundation.md`
- Modify: `.agent/caphub/p2-threat-model.md`
- Create: `.agent/caphub/p2-verification.md`
- Modify: `.agent/frontend-design/caphub-foundation/handoff.md`
- Modify: `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`

**Interfaces:**
- Consumes: Capture store/object store, disabled analysis config, provider factories, workflow stores, and abort signal.
- Produces: `createAnalysisService(dependencies).start(captureId)` and one disabled-by-default local runner command.

- [ ] **Step 1: Write failing application and BDD tests**

Drive the real Capture record/object → preprocessor → fixture providers → persisted stages → ReviewPacket path. Include hostile OCR text asking for Shell/Git/file writes, invalid-first/valid-correction output, identity ambiguity, conditional critic execution, crash/resume, duplicate start, disabled configuration, direct API structured-output transport, provider process attempts to read protected locations or write outside the temporary root, nested execution, direct egress denial, proxy target rejection, and source-fetch DNS rebinding/peer mismatch.

```ts
expect(packet.human_review_required).toBe(true);
expect(securityProbe.shellCalls).toBe(0);
expect(securityProbe.gitCalls).toBe(0);
expect(securityProbe.outsideWrites).toBe(0);
expect(securityProbe.protectedReads).toBe(0);
expect(securityProbe.directEgress).toBe(0);
expect(await service.start(capture.id)).toEqual(await service.start(capture.id));
```

- [ ] **Step 2: Run the integrated behavior tests and verify RED**

Run: `npm test -- lib/caphub/service/analyze.test.ts lib/caphub/service/analyze.behavior.test.ts scripts/caphub-analyze.test.ts`

Expected: FAIL because the application service and runner do not exist.

- [ ] **Step 3: Implement the disabled-by-default service and runner**

The service rejects when `caphub.enabled` or `caphub.analysis.enabled` is false, constructs only server-side dependencies, and returns job/packet identifiers rather than raw provider output. The script accepts one validated Capture ID and never accepts arbitrary paths, prompts, provider URLs, or secret values.

- [ ] **Step 4: Verify GREEN with focused and full gates**

Run: `npm test -- lib/caphub/service/analyze.test.ts lib/caphub/service/analyze.behavior.test.ts scripts/caphub-analyze.test.ts`

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run build`

Expected: no failing tests, no type errors, no lint errors, and a successful production build. Existing lint warnings must be recorded separately and may not increase due to P2 files.

- [ ] **Step 5: Run the focused independent P2-C review and verification**

The independent reviewer inspects only P2 files plus directly modified P1/config files and verifies the checklist in `.agent/caphub/p2-threat-model.md`. One review pass is required; any fix receives one focused re-review of the changed finding scope, not another global review.

Expected findings threshold: zero blocker/high findings; all medium findings resolved or explicitly accepted by the Human Owner.

- [ ] **Step 6: Record evidence and update planning state**

`.agent/caphub/p2-verification.md` must record exact commit, test counts, typecheck/lint/build results, security BDD cases, sandbox evidence, review verdict, verification verdict, and the fact that no extra real provider request or production enablement occurred. Update the roadmap, handoff, and Linear `AGE-251` with the same commit-bound evidence.

- [ ] **Step 7: Commit**

```bash
git add lib/caphub/service/analyze.ts lib/caphub/service/analyze.test.ts lib/caphub/service/analyze.behavior.test.ts scripts/caphub-analyze.ts scripts/caphub-analyze.test.ts package.json docs/caphub-foundation.md .agent/caphub/p2-threat-model.md .agent/caphub/p2-verification.md .agent/frontend-design/caphub-foundation/handoff.md docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md
git commit -m "feat(caphub): complete P2 analysis pipeline"
```

## Plan self-review checklist

- [ ] Every P2 roadmap deliverable maps to Tasks 2–10.
- [ ] MiniMax, direct-HTTP Kimi API-key mode, and sandboxed Kimi local-login mode have fixture-driven provider boundary tests; no test silently calls a real provider.
- [ ] OCR, sharpness, black-border, OCR usability, content regions, barcode, dedupe, privacy suggestions, claims, evidence, identity ambiguity, overlap/gaps, alternatives, dimensions, platform previews, critic triggers, and ReviewPacket are each asserted by a named test.
- [ ] No task grants a model Shell, Git, filesystem mutation, install, deploy, publish, code-build, or delegation capability.
- [ ] Provider attempts are bounded to one initial request plus one schema correction, with transport retries disabled.
- [ ] Source fetches pin vetted public addresses into the actual TLS connection and reject rebinding/peer mismatch on every redirect.
- [ ] The local-login sandbox denies protected reads, outside writes, nested execution, and direct egress; only a fixed-target loopback proxy is reachable.
- [ ] Interrupted provider calls cannot be invisibly repeated.
- [ ] P2 has no approval UI, Registry release, Obsidian projection, Builder, deployment, or production enablement.
- [ ] Exact-file staging preserves Human-owned `AGENTS.md` and unrelated work.
