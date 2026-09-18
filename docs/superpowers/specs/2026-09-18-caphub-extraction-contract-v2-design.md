# Caphub Extraction Contract V2 Design

**Status:** draft — Scheme B approved by the Human Owner; this written
contract remains subject to final review before implementation planning.

**Date:** 2026-09-18

## Decision

Replace the current MiniMax prompt-only `ExtractionResult` generation with a
two-provider extraction contract:

1. MiniMax M3 performs image-grounded visual understanding and returns a
   bounded, non-empty visual observation as untrusted text.
2. DeepSeek `deepseek-flash` converts that observation plus deterministic
   preprocessing data into a native structured-output `ExtractionDraftV2`.
3. the Caphub host validates source locators, creates all IDs and artifact
   links deterministically, and composes the existing `ExtractionResult`.

The two provider calls are one atomic extraction stage. MiniMax output is passed
to DeepSeek in memory and is not persisted. A failure in either call closes the
stage into Human Review; the stage performs no automatic correction or retry.

This design fixes the failed contract boundary without adding tools, model-side
execution, external side effects, or new Caphub capabilities.

## Why This Design

The current adapter asks MiniMax to return the complete strict
`ExtractionResult` through unconstrained text generation. The JSON Schema is
included only as prompt text. The host then parses the text and requires the
model to have correctly invented host-owned IDs and exact artifact linkage.
The correction request omits the original image and preprocessing context, so a
second call cannot reliably reconstruct the invalid result.

The production failure demonstrated that text/image transport and strict
application structure are separate concerns. DeepSeek's already verified
Responses API contract provides native `json_schema` output. Scheme B assigns
each provider the responsibility that is proven locally:

- MiniMax: image understanding;
- DeepSeek: schema-constrained normalization;
- Caphub host: identity, provenance, linkage, persistence, and policy.

### Rejected alternatives

- **MiniMax schema-sink function tool:** stronger than prompt-only JSON, but it
  changes the approved no-tools security contract and reliable forced tool use
  with the exact multimodal request has not been proven.
- **Prompt-only repair:** simplifying the prompt, increasing tokens, or adding a
  fuller correction request does not create a native schema boundary and would
  leave production correctness dependent on model formatting.

## Scope

### Included

- A MiniMax visual-observation contract for extraction only.
- A DeepSeek native structured-output contract for `ExtractionDraftV2`.
- Host-side composition of the existing `ExtractionResult`.
- Exact source-locator validation and deterministic claim/evidence IDs.
- One MiniMax call followed by one DeepSeek call inside a single extraction
  stage and shared job budget.
- More precise redacted audit metadata for extraction failures.
- Analysis contract versioning so the terminal v1 job remains immutable and a
  v2 job can supersede it.
- Focused TDD, real-boundary BDD, a separately authorized synthetic provider
  probe, and a separately authorized Capture canary.

### Excluded

- Tools, browser access, Shell, files, Git, code execution, deployment, export,
  installation, publication, or target operations.
- Sending the original image to DeepSeek. DeepSeek receives MiniMax text and
  deterministic preprocessing data only.
- Persisting MiniMax's raw visual observation, provider responses, prompts,
  reasoning, headers, or credentials.
- Changing MiniMax critic behavior, DeepSeek research/assessment behavior,
  source-fetch policy, assessment policy, Registry approval semantics, or P4
  export gates.
- Mutating, deleting, or retrying a terminal v1 job in place.
- Production reload, provider calls, reanalysis, push, merge, tag, or release
  as part of implementation.

## Extraction V2 Data Flow

```text
private Capture object
        |
        v
deterministic preprocess + normalized image
        |
        v
MiniMax M3 visual observation
        |  untrusted text, memory only
        v
DeepSeek native json_schema -> ExtractionDraftV2
        |
        v
host source validation + deterministic IDs/linkage
        |
        v
existing ExtractionResult artifact -> research -> assessment -> review
```

Both provider inputs remain within the existing extraction byte and total-job
token budgets. Both calls count toward the existing per-job provider-call
ceiling. No call is made if an earlier local check fails.

## MiniMax Visual Observation Contract

MiniMax continues to use the fixed `MiniMax-M3` model, fixed HTTPS origin,
ordered image input, abort signal, deadline, `maxRetries: 0`, and no tools. It
no longer receives the `ExtractionResult` JSON Schema and no longer parses
terminal text as JSON.

Its prompt must:

- label all screenshot and OCR material as untrusted data;
- separate visible facts, OCR-supported facts, inferences, and unknowns;
- preserve image indexes and OCR block indexes when referring to evidence;
- avoid IDs, artifact links, decisions, external actions, and instructions;
- request concise observations rather than a complete capability assessment;
- carry an explicit `caphub-minimax-visual-v2` contract version.

The adapter accepts only one non-empty terminal text with valid usage metadata.
It rejects blank output, output above the local byte ceiling, terminal
truncation, malformed usage, timeout, or transport failure. The extraction
output budget is reduced from 4096 to a bounded value selected in the
implementation plan within the 1500–2000 token range. This limit is specific
to the visual-observation call; MiniMax critic limits are unchanged.

The adapter returns an in-memory value equivalent to:

```ts
interface VisualObservationResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: string;
  outputBytes: number;
}
```

`text` is untrusted provider data, not executable instructions.

## DeepSeek ExtractionDraftV2 Contract

DeepSeek uses the already approved fixed contract:

```text
POST https://api.deepseek.com/responses
model: deepseek-flash
stream: false
reasoning: { effort: "none" }
tools: omitted
text.format: { type: "json_schema", name, schema }
```

The client transport uses `maxRetries: 0`; this is a local policy and is not
sent as a DeepSeek request-body field.

Its input contains only:

- the untrusted MiniMax visual observation;
- the deterministic preprocess payload needed to validate OCR/image locators;
- fixed extraction instructions and schema version;
- the digest of the original extraction input.

The observation and preprocess payload are independently delimited and escaped
as data. DeepSeek must normalize them, not add unsupported facts. It must not
receive the raw image, secrets, provider headers, Registry contents, target
configuration, or executable instructions.

`ExtractionDraftV2` contains only model-owned semantic fields:

```ts
interface ExtractionSourceRefV2 {
  kind: "image" | "ocr_block" | "indicator";
  image_index: number;
  ocr_block_index?: number;
  indicator_kind?: "url" | "repository" | "package" | "command";
  indicator_index?: number;
}

interface ExtractionDraftV2 {
  schema_version: 2;
  claims: Array<{
    statement: string;
    basis: "visible" | "ocr" | "inferred" | "unknown";
    confidence: number;
    source_refs: ExtractionSourceRefV2[];
  }>;
  entities: Array<{
    name: string;
    aliases: string[];
    logo_hint?: string;
    author?: string;
    domain?: string;
    repository?: string;
    package?: string;
  }>;
  experience_fragments: Array<{
    title: string;
    summary: string;
    source_refs: ExtractionSourceRefV2[];
  }>;
  explicit_urls: string[];
  unresolved_questions: string[];
}
```

The exact Zod constraints and JSON Schema are implementation details, but they
must remain strict, bounded, and compatible with this field ownership. A draft
with an empty or invalid locator for a claim or experience fragment is invalid.
Native structured output is followed by local Zod validation. There is no
schema-correction call for extraction v2.

## Host Composition and Provenance

The host is the sole authority for:

- `capture_id`;
- `preprocess_artifact_id`;
- claim IDs and evidence IDs;
- stage artifact IDs and digests;
- provider, model, prompt, input, and schema versions;
- job lineage and ReviewPacket linkage.

Before composition, every `source_ref` is checked against the exact preprocess
artifact used by the job:

- `image` must identify an existing image index;
- `ocr_block` must identify an existing block within that image;
- `indicator` must identify an existing item of the declared indicator kind;
- optional fields forbidden for a locator kind cause rejection;
- duplicate locators are canonicalized before ID generation.

Evidence IDs are deterministic digests of the capture ID, preprocess artifact
ID, and canonical source locator. Claim IDs are deterministic digests of the
same host linkage plus the canonical statement, basis, confidence, and evidence
IDs. This makes IDs reproducible without trusting model-generated identifiers.

The host then emits the existing schema-version-1 `ExtractionResult`. Downstream
research, assessment, ReviewPacket, Registry, and Review Center contracts do
not require a domain migration. ReviewPacket model contracts identify the
extraction contract as v2 even though the persisted result remains compatible
with `ExtractionResult` v1.

## Atomicity, Persistence, and Recovery

The visual-observation and structuring calls form one logical extraction stage:

- MiniMax output exists only in process memory until the DeepSeek call ends;
- no intermediate stage artifact is committed;
- only a fully validated, host-composed `ExtractionResult` is persisted;
- if the process ends between calls, the started audit remains evidence of an
  interrupted provider operation and the job enters Human Review on recovery;
- the system does not automatically replay either provider call.

This deliberately trades mid-stage resume for data minimization and avoids
creating an unreviewed raw-model-content asset.

## Errors, Audit, and Human Review

Extraction v2 distinguishes where the failure occurred without retaining model
content:

| Failure phase | Human-review reason |
|---|---|
| MiniMax authentication or billing | existing `AUTHENTICATION` / `BILLING` |
| MiniMax transport, timeout, or interruption | existing closed provider reason |
| MiniMax blank, oversized, or truncated text | `MINIMAX_INVALID_OBSERVATION` |
| DeepSeek transport, timeout, authentication, or billing | existing closed provider reason |
| DeepSeek incomplete/malformed/schema-invalid draft | `DEEPSEEK_STRUCTURE_FAILED` |
| Host source locator or linkage validation | `HOST_EXTRACTION_LINKAGE_FAILED` |
| Shared bytes, calls, or token budget | existing policy-limit reason |

The audit schema may add bounded optional metadata while preserving historical
records:

- `operation`: `visual_observation` or `schema_structuring`;
- `contract_version`;
- normalized `finish_reason` when available;
- `output_bytes`;
- token usage on failed calls when the provider returned valid usage;
- invalid-output digest and capped, sorted validation paths.

It must not store raw input, raw output, prompts, reasoning, headers, or secret
values. Audit event identities must include provider plus operation so the two
first attempts within the extraction stage cannot collide.

## Job Versioning and Existing Terminal Job

The v1 terminal analysis job remains immutable. Extraction v2 introduces an
analysis contract version into deterministic job identity. For a Capture first
seen under v2, the job ID is derived from the Capture identity, immutable object
digest, and fixed analysis contract version. If a v1 job already exists, the v2
job records `supersedes_job_id` while leaving every v1 record and artifact
unchanged.

Starting the same Capture again under the same contract version returns the
existing v2 job and does not create another provider call. A future same-version
reanalysis policy is outside this design and remains an explicit operator
decision.

For the known failed Capture, rollout may create one new v2 job only after the
implementation is accepted and the Human Owner separately authorizes the real
provider transfer. The existing terminal job is neither reopened nor retried.

## Security and Data-Transfer Boundary

- MiniMax receives the normalized image and bounded preprocess context.
- DeepSeek receives only MiniMax's untrusted observation and deterministic
  preprocess data; it does not receive the original image.
- Neither provider receives tools or can perform actions through Caphub.
- External content never becomes system instruction.
- Provider outputs never authorize approval, Release, export, installation,
  publication, Git, Shell, or deployment operations.
- Registry, Object Storage, credentials, and LaunchAgent boundaries remain
  unchanged.
- Real provider calls and real Capture reanalysis remain explicit production
  operations; local implementation permission does not authorize them.

## Implementation Shape

The implementation plan should use the smallest separation that makes the
contracts explicit:

1. introduce strict `ExtractionDraftV2` and source-locator schemas plus the
   deterministic host composer;
2. separate MiniMax visual text generation from the existing structured
   provider adapter while leaving critic behavior unchanged;
3. add a DeepSeek extraction structurer using its existing Responses adapter;
4. replace only the extraction stage orchestration with the atomic two-call
   path and disable extraction correction;
5. add compatible audit metadata and v2 job lineage;
6. expose precise failure phase in the existing Review Center without adding a
   retry action;
7. verify the coherent changeset once, then use separate production gates for
   live probe, deployment, and Capture canary.

## Verification and Acceptance

### Focused TDD

- MiniMax request contains ordered images, no schema/tools, one call, bounded
  output, and no correction.
- DeepSeek receives no raw image and uses the fixed native `json_schema`
  contract with no tools or retry.
- malformed/empty/truncated MiniMax output fails before DeepSeek.
- malformed DeepSeek output and invalid source locators fail before artifact
  persistence.
- host IDs and linkage are deterministic and cannot be model-controlled.
- no raw MiniMax observation appears in artifacts, audit, logs, or ReviewPacket.
- v1 jobs remain readable and v2 job IDs are stable and linked to their
  predecessor.

### Real-boundary BDD

Using fake HTTPS transports but real adapters, schemas, workflow stores, and
Registry boundaries, prove:

- image -> MiniMax text -> DeepSeek draft -> host composition -> persisted
  extraction artifact;
- each failure phase enters Human Review with no automatic second call;
- interruption between calls creates no extraction artifact and is not replayed;
- shared provider-call and token budgets count both calls;
- downstream research/assessment/ReviewPacket remains compatible.

### Final gates

1. Run only affected provider, extraction, workflow, Registry, and Review Center
   tests while developing.
2. Run typecheck, lint, production build, and deployment invariants once on the
   final coherent changeset.
3. Perform one scoped independent review focused on provider boundary,
   provenance, lineage, audit redaction, and terminal-state semantics.
4. With separate authorization, run one no-Capture synthetic live contract
   probe through the exact MiniMax-to-DeepSeek v2 path and retain only redacted
   metadata.
5. With separate production authorization, rebuild/reload the Control Host
   without enabling exports or targets.
6. With separate Capture authorization, create one v2 analysis job and verify
   the extraction artifact, ReviewPacket, Review Center, audit, and Neon
   persistence end to end.

## Acceptance Criteria

- MiniMax is no longer treated as a strict structured-output provider for
  extraction.
- DeepSeek is the only model responsible for `ExtractionDraftV2` structure and
  uses native JSON Schema output.
- All system identifiers and links are host-owned and reproducible.
- One extraction execution makes at most one MiniMax and one DeepSeek call;
  neither transport retries and extraction has no correction call.
- DeepSeek never receives the original image.
- No raw provider material or secret is persisted or logged.
- Invalid or interrupted output fails closed into a precise Human Review state
  without writing an extraction artifact.
- Existing downstream artifacts and historical jobs remain readable.
- The terminal v1 job remains immutable; any accepted rerun is a distinct v2
  job with explicit lineage.
- Focused tests, real-boundary BDD, typecheck, lint, production build, scoped
  review, controlled live probe, and authorized canary pass at their respective
  gates.

## References

- MiniMax: [OpenAI-compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api)
- MiniMax: [Chat Completion](https://platform.minimax.io/docs/api-reference/text-chat-openai)
- DeepSeek: [Responses API](https://api-docs.deepseek.com/zh-cn/api/create-response/)
- Existing Caphub architecture:
  `docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`
- Existing provider plan:
  `docs/superpowers/plans/2026-09-16-caphub-providers-analysis.md`
- DeepSeek replacement design:
  `docs/superpowers/specs/2026-09-18-caphub-deepseek-provider-replacement-design.md`
