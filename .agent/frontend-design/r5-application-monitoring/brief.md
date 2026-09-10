# R5 Application Monitoring — Draft Brief

## Start Card

```yaml
Workflow: 3.3
Task: R5 Application Monitoring daily overview
Role: Primary Agent
Tier / reason: T3 proposed — new route, provider credentials, external service health, and usage or billing data
Canonical record: .agent/frontend-design/r5-application-monitoring/brief.md
Branch / worktree: main / /Users/xtation/AgentWorks/GPT_Workspace/alljobs
Mockup Gate: Approved 2026-09-11 — B+A landing page and Project → Provider Binding → Signal detail flow
Review path: Independent design review before implementation; independent review and verification against the final candidate build
Human checkpoints: Tier and Brief approval; rendered mockup approval; implementation-plan approval; final walkthrough; release approval
```

## Status

- State: Design and mockups approved; implementation authorized on 2026-09-11
- Implementation authorization: Pactify implementation with worker `kimi` (K3), independent reviewer `claude`, and primary-agent acceptance; no credential creation, live-provider mutation, production deployment, push, or release
- Human-selected primary outcome: daily overview within one minute
- Human-selected binding policy: explicit Project-to-provider-resource binding
- Human-selected architecture: Control Host cached projections
- Human-selected extension requirement: retain bounded normalized history so later analysis can operate on cached observations
- Human-approved normalized model: separate collector, deployment, runtime, usage, platform-incident, and freshness signals; derive explainable attention levels without a synthetic health score
- Human-approved retention direction: current atomic snapshots plus bounded transition events, hourly rollups, and daily rollups; never persist raw provider responses
- Human-selected homepage composition: Project-first workbench (option B) as the primary structure, with the attention-first exception queue from option A above the full project ledger
- Research scope: Railway, Fly.io, Neon, Supabase; assess Vercel, Cloudflare, and GitHub extensions

## Selected UI direction

- The monitoring landing page keeps Project as the primary unit: every project appears once in the complete ledger with its aggregate attention state, bound providers, leading reason, freshness, and drill-down action.
- A compact `Needs attention` queue appears before the ledger. It contains only actionable `critical`, `warning`, `watch`, or `unknown` items and links each item back to its owning project and provider resource.
- The queue is a triage projection, not a second source of state. Its rows are derived from the same normalized snapshots and reasons used by the project ledger.
- Healthy projects remain visible in the ledger but do not occupy the attention queue.
- Summary values emphasize scope and trust: total projects, total bindings, items needing attention, and collection freshness. They do not synthesize a health score.
- Desktop uses a compact workbench table. Narrow layouts preserve the same order—summary, attention queue, all projects—and reflow each row into labeled blocks without hiding status, reason, freshness, or the project action.
- Landing-page mockup state: approved by Human Owner on 2026-09-11.
- Project-detail mockup state: approved by Human Owner on 2026-09-11.

### Mockup evidence

- Approved landing page: `.agent/frontend-design/r5-application-monitoring/mockup/landing.html`
  - SHA-256: `e52697355f496d025db53ab9474295c62ed8668930219f4834b88814166e1e7a`
- Approved Project detail: `.agent/frontend-design/r5-application-monitoring/mockup/project-detail.html`
  - SHA-256: `dfb5fc9b81ac50fd171910e396665cd4dd3a6b0ec2e7c897fd0a667d4af8f549`
- Approval evidence: Human Owner explicitly approved the B+A landing revision and then the Project detail revision in this design session on 2026-09-11.

## Approved project-detail direction

- A Project detail page starts with the aggregate attention level and its leading reason, then lists every explicit provider binding for that project.
- Each binding keeps collector, deployment, runtime, usage, related platform incident, and freshness signals separate. A successful deployment can therefore coexist with a failing runtime probe without being misrepresented as healthy.
- Expanding a binding shows signal values, observation timestamps, billing alignment, reason evidence, and a provider-console link. It never reveals credentials, raw provider responses, logs, or environment values.
- Recent evidence is sourced from normalized transition events and bounded rollups. The initial release may state deterministic timing relationships such as “failure began nine minutes after deployment,” but cannot claim root cause or trigger remediation.
- Desktop uses a comparison table with an inline expanded binding. Narrow layouts reflow bindings into labeled blocks and preserve all required status, usage, freshness, and action fields.

## Approved architecture direction

- Provider adapters run server-side on the existing Control Host refresh path.
- Each adapter has fixed read-only operations, bounded concurrency, provider-specific timeout and rate-limit handling, and isolated failure.
- The UI reads normalized local snapshots; it never fans out to providers during page rendering.
- A manual refresh requests a new bounded collection cycle and cannot bypass minimum intervals or single-flight protection.
- Cache output has two layers: atomic current snapshots for rendering and bounded normalized historical observations for later deterministic analysis.
- Historical storage keeps normalized measures, status transitions, revision references, timestamps, and confidence metadata. It does not retain credentials, logs, provider response bodies, request payloads, or source content.
- The initial release may compute deterministic attention rules and trends only. AI analysis, notifications, automatic remediation, and a general time-series platform remain out of scope.

## Approved normalized state and history direction

- `MonitoringBinding` is an explicit, stable Project-to-provider-resource mapping and records environment, expected runtime behavior, required signals, credential reference, and provider console link.
- `MonitoringSnapshot` keeps collector health, latest deployment, runtime health, usage measures, applicable platform incidents, freshness, reasons, and evidence timestamps separate.
- Usage measures retain their unit, period, optional allowance and cost, provider observation time, and billing alignment (`exact`, `provider_estimate`, or `operational_only`). Unsupported facts remain unavailable.
- Attention is derived as `critical`, `warning`, `watch`, `healthy`, or `unknown`. Every level has machine-readable reasons; missing or stale required data can never produce `healthy`.
- Expected idle, sleeping, stopped, or scale-to-zero states are evaluated against the binding's declared runtime policy instead of being treated as universal failures.
- Current snapshots are overwritten atomically. Material status/deployment/permission/quota-band transitions are appended as events. Hourly usage rollups are retained for 90 days and daily rollups for 13 months; exact retention remains part of final Brief approval.

## Approved attention state matrix

Aggregate precedence is `critical` → `warning` → `unknown` → `watch` → `healthy`. A higher-precedence reason wins the visible project state, while all reasons remain available in detail.

| Level | Deterministic trigger | Landing-page behavior |
|---|---|---|
| `critical` | A required runtime or independent probe is confirmed unhealthy; a required provider service is explicitly unavailable; or quota exhaustion is causing observed service impact | First in attention queue; show affected Project, binding, and concrete failing signal |
| `warning` | Latest production deployment failed; required runtime is repeatedly degraded but not confirmed down; known allowance is at least 90%; or a related active platform incident threatens the binding | Attention queue before unknown/watch; show the exact trigger rather than a generic warning |
| `unknown` | A required signal has no trustworthy current value because authorization, permission, unsupported configuration, first collection, or maximum-age expiry prevents evaluation | Attention queue; visibly state why health cannot be judged; never render as healthy |
| `watch` | Known allowance is at least 75% but below 90%; a deterministic sustained trend crosses its configured band; or collection is delayed while the last trustworthy value is still within maximum age | Attention queue after unknown; retain last value with its observation time and delayed/stale reason |
| `healthy` | Every required signal is supported, current, and good; expected idle, sleeping, stopped, scheduled, or scale-to-zero behavior matches the binding policy | Omitted from attention queue but remains in the complete Project ledger |

Usage without a provider-reported allowance is shown as an absolute value or trend and does not enter percentage thresholds. A value at or above 100% is `warning` unless the provider or independent runtime evidence shows real service impact, which promotes the affected binding to `critical`.

## Approved freshness and failure behavior

- Freshness is signal-specific. Each adapter declares its planned collection cadence and maximum trustworthy age to accommodate provider data that updates more slowly than runtime health.
- A failed collection attempt records collector status and `attempted_at` without erasing the last trustworthy value or its `observed_at`.
- While a last value remains inside its maximum age, the UI shows that value with collection-delay context. Crossing maximum age makes a required signal `unknown`.
- Authentication or permission failure becomes `unknown` immediately for affected required signals because retrying the same credential cannot restore trust. The UI identifies the missing scope or expired credential without exposing the credential itself.
- Rate limiting honors provider `Retry-After` or the adapter backoff policy. Manual refresh cannot bypass backoff, minimum intervals, or single-flight collection.
- One adapter timeout or malformed response cannot abort other adapters or prevent an atomic snapshot from being published for successfully collected bindings.
- Provider-declared unsupported optional metrics are `not available`, not `unknown`. Configuring an unsupported metric as required is a binding validation error and makes the binding `unknown` until corrected.
- Platform-status failure is isolated from resource health. When platform status is optional, its absence is visible in detail but cannot alone downgrade otherwise current resource signals.
- Repeated identical collector failures update attempt metadata but do not append duplicate transition events. A new event is written only when material status, deployment, permission, or quota band changes.
- Refresh UI states are `idle`, `queued`, `collecting`, `partially complete`, `complete`, and `backing off`. The page continues serving the previous atomic snapshot throughout collection.

## Protected boundaries

- All provider access is read-only.
- Browser input never supplies credentials or expands provider/resource authority.
- Provider names, domains, and Git remotes may suggest bindings but never create them automatically.
- Missing or stale data remains visible as unavailable or stale; it is never estimated or silently treated as healthy.
- No notification delivery, automatic remediation, deployment mutation, or billing reconciliation is authorized in this phase.

## Design review status

- Primary-agent self-review completed on 2026-09-11.
- Self-review correction: current cache uses immutable cycle generations and an atomically replaced index pointer so a complete UI cycle cannot observe partially replaced binding files.
- Self-review correction: provider-console links require adapter-specific hostname allowlists in addition to HTTPS validation.
- `git diff --check` passes for the canonical Brief and formal specification.
- Provider APIs, plan eligibility, token scopes, and rate limits must be revalidated immediately before implementing each adapter.
- Independent T3 design review is pending. The review packet and new-session prompt are in `.agent/frontend-design/r5-application-monitoring/handoff.md`.
- Formal design specification is pending final Human Owner review; no implementation or implementation plan is authorized yet.
