# Caphub DeepSeek Provider Replacement Design

**Status:** proposed — Human-approved architecture direction; implementation and
production activation remain separately gated.

**Date:** 2026-09-18

## Decision

Replace the Kimi Code API provider used by Caphub's `research` and
`assessment` stages with DeepSeek-V4.1-Flash. The only production API model ID
is `deepseek-flash`; DeepSeek documents that it routes to the V4.1-Flash model.
The provider uses the fixed HTTPS origin `https://api.deepseek.com` and its
OpenAI-compatible Responses API endpoint `POST /responses`.

MiniMax remains the sole provider for image-aware `extraction` and optional
`critic`. This change does not alter Capture preprocessing, Registry behavior,
ReviewPacket semantics, source-fetch policy, target/export gates, or the
separate `INTERRUPTED_PROVIDER_CALL` diagnosis for MiniMax extraction.

## Scope

### Included

- A first-party `DeepSeekProvider` and `DeepSeekResponsesAdapter` for the
  existing `StructuredProvider` boundary.
- `research` and `assessment` only, preserving their current schemas, prompts,
  correction behavior, bounded output budgets, and `maxRetries: 0` transport
  policy.
- Fixed model-contract and audit identity `provider: "deepseek"`,
  `model: "deepseek-flash"`.
- Control Host analysis configuration and preflight evidence that identify the
  fixed DeepSeek contract and the secret-variable name without exposing its
  value.
- Focused unit/behavior tests and a separately authorized, synthetic live
  contract diagnostic before any later Capture analysis.

### Excluded

- Replacing MiniMax extraction or critic.
- Automatic retries, scheduling, source search, tools, browser access, OCR
  changes, target operations, exports, publication, installation, deployment,
  push, PR, or release.
- Re-running the terminal first-Capture job
  `job_d21922e7bb363b4734573206709e70ab`.
- Removing historical Kimi evidence or deleting existing Kimi credentials during
  this implementation. Post-cutover retirement is a separate, explicitly
  authorized cleanup operation.

## Provider Contract

The adapter sends only documented, required values:

```text
POST https://api.deepseek.com/responses
Authorization: Bearer ${DEEPSEEK_API_KEY}
model: deepseek-flash
stream: false
reasoning: { effort: "none" }
tools: omitted
text.format: { type: "json_schema", name, schema }
max_output_tokens: stage-specific existing budget
```

`deepseek-flash` has native multimodal capability, a one-million-token context
window, and a 384K maximum output. Caphub deliberately does not expand its
existing byte, image, token, source, or per-job provider-call limits because of
those upstream maximums. Research and assessment are textual in the current
pipeline; image content remains confined to MiniMax extraction.

Responses API is selected over Chat Completions because its documented
`text.format` supports `json_schema`, whereas Chat Completions supplies JSON
object mode. Caphub still validates the terminal message against the local Zod
schema and may issue only its existing bounded correction request. No response
body or reasoning content is retained.

The adapter must accept only a `completed` response containing exactly one
terminal assistant message with non-empty JSON text. It must reject failed or
incomplete Responses API states, missing/multiple terminal texts, malformed
JSON, or schema-invalid output as safe provider failures. It must use the
returned `usage.input_tokens` and `usage.output_tokens` for the existing model
audit and budget accounting.

## Configuration and Secret Boundary

`controlHostCaphubAnalysisConfigSchema` will replace the Kimi-specific fields
with fixed literals:

```text
deepSeekApiBaseUrl: "https://api.deepseek.com"
deepSeekApiModel: "deepseek-flash"
deepSeekApiSecretEnv: "DEEPSEEK_API_KEY"
```

The runtime adapter defines the same origin/model constants and receives only
the secret value resolved from the approved environment variable. Application
configuration cannot redirect Caphub to another provider host or model.

The private LaunchAgent remains the only production secret carrier. Tests use
fixture secrets. Logs, CLI output, Registry records, ReviewPackets, and Linear
updates may state whether the variable exists, but never print its value,
request headers, input, output, or reasoning.

The Kimi local-login runner, credential projection, and egress proxy are not a
dependency of DeepSeek. They remain uninvoked during the replacement until an
approved retirement task removes them after successful cutover evidence.

## Error, Audit, and Stop Rules

| Condition | Caphub result |
|---|---|
| HTTP 401 | `AUTHENTICATION` |
| HTTP 402 | `BILLING` |
| HTTP 429, 500, 503, network/TLS timeout | `UNAVAILABLE` / existing safe audit mapping |
| 400/422, failed/incomplete API state, empty or malformed terminal JSON, schema mismatch | `INVALID_OUTPUT` |
| Abort or deadline expiry | existing `ABORTED` / `TIMEOUT` mapping |

The transport does not retry. `runStructuredStage` remains the only correction
loop and may create at most the already configured second schema-correction
call. A started audit without its terminal counterpart remains terminally
reviewable as `INTERRUPTED_PROVIDER_CALL`; the replacement must not weaken that
closed failure behavior.

Provider/model names flow into model-call audits and ReviewPacket
`model_contracts`; registry schemas and query projections must allow
`deepseek` and no longer treat `kimi` as an active analysis provider.

## Implementation Sequence

1. Add RED tests for the fixed DeepSeek request shape, Responses API terminal
   parsing, all safe error classifications, no secret leakage, and current
   correction/budget behavior.
2. Implement the narrow DeepSeek adapter/provider and replace Kimi runtime
   construction in `analyze-runtime`.
3. Replace active Kimi names in provider contracts, config validation, audit and
   ReviewPacket model contracts, Registry schema/query fixtures, preflight, and
   focused behavior tests.
4. Run the affected test matrix, typecheck, lint, and production build. Review
   the coherent provider replacement changeset once.
5. With separate Human authorization, add `DEEPSEEK_API_KEY` to the existing
   private LaunchAgent, perform one no-Capture synthetic Responses API
   `json_schema` diagnostic, and record only redacted contract metadata.
6. Only after a passing diagnostic and explicit authorization, rebuild/reload
   the Control Host. A fresh Capture analysis remains a separate operator
   action. Do not enable exports or targets.

## Acceptance Criteria

- The only active research/assessment model contract is
  `deepseek` / `deepseek-flash` at the exact DeepSeek origin.
- The adapter uses Responses API structured output, no tools, no transport
  retry, no retained raw model material, and local schema validation.
- Existing maximums and Human-review stop behavior are unchanged or stricter.
- Focused provider/config/workflow/registry behavior tests pass, followed by
  typecheck, lint, and build for the final implementation.
- A distinct controlled live diagnostic proves the exact endpoint/model/schema
  contract before any new Capture analysis. It records status, finish state,
  schema validity, and token counts only.
- Kimi credentials and code are neither read nor deleted as part of this
  replacement; a later retirement task must inventory and obtain explicit
  deletion authority.

## References

- DeepSeek: [快速开始](https://api-docs.deepseek.com/zh-cn/)
- DeepSeek: [Responses API](https://api-docs.deepseek.com/zh-cn/api/create-response/)
- DeepSeek: [Responses API 指南](https://api-docs.deepseek.com/zh-cn/guides/responses_api/)
- DeepSeek: [模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)
- DeepSeek: [思考模式](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)
- DeepSeek: [错误码](https://api-docs.deepseek.com/zh-cn/quick_start/error_codes/)
