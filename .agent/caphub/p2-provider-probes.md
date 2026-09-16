# Caphub P2 Provider Probe Record

**Date:** 2026-09-16
**Gate:** P2-A — real provider requests require separate Human authorization
**Authorization:** Human Owner explicitly replied `授权` to the bounded probe set: one MiniMax image/JSON request, one Kimi local-login no-tool request, and a Kimi API request only if the existing credential was clearly applicable.

## Safety envelope

- Concurrency was one; provider requests used no automatic retry.
- No credential value, raw provider response, reasoning, prompt body, repository path, or project screenshot was logged.
- The first external-execution request proposed a repository mockup screenshot and was rejected before execution. The actual MiniMax request used only a fixed synthetic 68-byte 1×1 PNG containing no project or user data.
- Kimi ran with an explicit no-tools agent. Its OAuth/config material was copied into a canonical `0700` temporary Kimi Home; all generated session/log/update data stayed there.
- The exact temporary Kimi Home was inspected and removed after the probe. The default Kimi Home was not the session write target.

## MiniMax M3

**Endpoint/model contract:** existing server-only Token Plan adapter, `https://api.minimax.io/v1`, `MiniMax-M3`, Standard mode.
**Request:** one synthetic PNG plus an instruction to return one strict JSON object.
**Result:** PASS.

```json
{
  "status": "passed",
  "model": "MiniMax-M3",
  "image_bytes": 68,
  "schema_valid": true,
  "dominant_color_enum_valid": true,
  "summary_characters": 16,
  "input_tokens": 235,
  "output_tokens": 22,
  "finish_reason": "stop"
}
```

This proves the current credential/endpoint accepts image input and produces output that can pass the strict probe schema. It does not authorize production use, a second call, or arbitrary image egress.

## Kimi local-login

**CLI/provider:** Kimi Code CLI `0.42.0`, OAuth-managed `kimi-code/k3-256k`.
**Request:** one non-interactive `stream-json` prompt through an agent with an empty tool list and explicit deny entries for Shell, file mutation, Git, and delegation.
**Result:** PASS.

```json
{
  "status": "passed",
  "model": "kimi-code/k3-256k",
  "schema_valid": true,
  "tool_calls": 0,
  "protocol_events": 3,
  "stderr_bytes": 0
}
```

This proves the local-login path can return a schema-valid no-tool result from an isolated temporary profile. It does not yet prove the complete future Research Profile sandbox or web source allowlist; those remain plan tasks and P2-C evidence.

## Kimi API-key mode

**Result:** NOT RUN / NOT PROVEN.

The environment exposes the key name `KIMI_CODE_API_KEY`, but no `KIMI_API_KEY` or separately approved Kimi Platform base URL/credential binding was available. Official Kimi Code configuration requires an explicit provider credential/base URL mapping and does not justify sending an ambiguously named credential to `api.moonshot.ai`. No trial request was sent.

## Gate disposition

- MiniMax image + strict JSON compatibility: PASS.
- Kimi local-login no-tool compatibility: PASS.
- Kimi API-key compatibility: OPEN hard stop — requires an applicable credential/binding and separate authorization.
- P2 detailed implementation plan must not claim dual-mode live compatibility until the API-key path is proven. Fixture-only API adapter contract planning may resume only after the approved spec/roadmap precondition is reconciled by the Human Owner.

No production configuration, Caphub enablement, service restart, deployment, publication, push, merge, tag, release, or data deletion occurred. Only the temporary credential/session copy created for this probe was removed after verification.
