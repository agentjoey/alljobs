# Caphub P3 Review Center and Registry Design

- **Status:** Approved under the Caphub P1–P6 standing authorization; pre-implementation review pending
- **Date:** 2026-09-16
- **Parent design:** `docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`
- **Roadmap phase:** P3 — Review Center and PostgreSQL Registry
- **Linear:** AGE-252

## 1. Decision and scope

P3 makes PostgreSQL the authoritative metadata, workflow, decision, audit, and lineage store for Caphub while preserving content-addressed screenshot bytes behind the existing object-store port. It adds a unified Human Review Center for Candidate, Build, Implementation, Release, and Update review requests. Only Candidate review requests are produced by the P2-to-P3 bridge in this phase; the other request kinds are schema and UI states for later producers.

P3 does not enable a production database, migrate production state, call a provider, create an implementation handoff, publish or install a capability, deploy, or alter traffic. Production provider selection, credentials, backup/PITR, fees, migration execution, and release remain Gate P3-D hard stops.

## 2. Considered approaches

### Selected: typed domain core plus PostgreSQL 17 transaction adapter

Canonical Zod contracts stay independent of storage. A `pg`-based adapter implements explicit transactions, row locking, unique constraints, append-only decisions, and lineage queries. Integration tests start a disposable local PostgreSQL 17 cluster under a temporary directory and destroy it after the suite. No external account, network service, or persistent database is required.

This is the smallest approach that proves the acceptance-critical PostgreSQL behaviors rather than emulating them.

### Rejected: PGlite or in-memory first

This would be fast and hermetic, but it would not prove the wire client, server transaction isolation, row locks, roles, or migration behavior required by P3. It may remain useful for component fixtures but cannot be the Registry contract authority.

### Rejected: production-provider first

Binding implementation to Neon, Supabase, Railway, or another managed provider would require credentials, backup/PITR and cost decisions before the vendor-neutral contract is stable. Those are explicit hard stops and add no value to local correctness.

## 3. Authority and configuration

The optional Control Host `caphub.registry` block is strict and disabled by default:

```json
{
  "enabled": false,
  "databaseUrlEnv": "CAPHUB_DATABASE_URL",
  "sslMode": "require",
  "maxConnections": 4,
  "statementTimeoutMs": 5000
}
```

`databaseUrlEnv` names an uppercase environment variable; configuration never contains a secret value. The runtime reads that variable only after both `caphub.enabled` and `caphub.registry.enabled` pass. Browser rendering never receives the URL or environment-variable name.

Local integration tests inject a connection factory directly and never load the real Control Host configuration. Production enablement must use TLS, a least-privilege application role, separately owned migration credentials, backups/PITR, and a reviewed connection budget.

## 4. Registry model

### 4.1 Versioned records

Every authoritative domain object uses a stable ID and immutable versions:

```ts
type RegistryRecordKind =
  | "capture"
  | "review_packet"
  | "entity"
  | "claim"
  | "evidence"
  | "candidate"
  | "experience_card"
  | "build_proposal"
  | "release"
  | "deployment"
  | "usage_observation";

interface RegistryVersion<T> {
  record_id: string;
  kind: RegistryRecordKind;
  version: number;
  schema_version: 1;
  payload: T;
  payload_digest: string;
  previous_version: number | null;
  created_at: string;
}
```

The database stores current-record identity separately from immutable version rows. A current-version pointer may advance only inside the same transaction that inserts the next version. Payloads are strict-schema JSONB and are validated both before write and after read. SQL constraints validate IDs, positive versions, digest format, timestamps, allowed kinds, and pointer ownership.

The first P3 bridge persists the existing P1 Capture, P2 ReviewPacket, Entities, Claims, Evidence, and Candidate projection. Tables and contracts for ExperienceCard, BuildProposal, Release, Deployment, and UsageObservation exist so later phases do not redefine identity, version, lineage, or approval semantics; P3 creates none of those records except fixture data used by lineage contract tests.

### 4.2 Lineage

`registry_lineage` stores immutable directed edges between exact record versions. Allowed relationships are fixed:

```text
capture -> review_packet       derived_as
review_packet -> evidence      contains
review_packet -> entity        identifies
review_packet -> claim         contains
review_packet -> candidate     proposes
candidate -> experience_card   approved_as
candidate -> build_proposal    approved_as
candidate -> release           realized_as
build_proposal -> release      realized_as
release -> deployment          deployed_as
deployment -> usage_observation observed_as
review_request -> decision     decided_by
```

Foreign keys prevent dangling endpoints. Recursive lineage queries have a fixed depth bound and return exact versions, digests, and decision IDs. A Release fixture must be traceable to at least one Capture, Evidence record, and terminal ReviewDecision.

### 4.3 Review requests and decisions

Review requests are immutable subjects plus mutable workflow state. The mutable row is protected by a monotonically increasing `lock_version`:

```ts
type ReviewKind = "candidate" | "build" | "implementation" | "release" | "update";
type ReviewState = "WAITING_FOR_REVIEW" | "APPROVED" | "REJECTED" | "REVOKED" | "SUPERSEDED";
type ReviewAction = "approve" | "reject" | "revoke";
```

Each request binds `subject_id`, `subject_version`, `subject_digest`, `review_kind`, `lock_version`, and a fixed confirmation phrase. A request never silently follows a newer subject version. Any newer version creates a new request and marks the old pending request `SUPERSEDED` in one transaction.

Every decision is append-only and includes a deterministic ID, caller-supplied idempotency key, server-bound `human:owner` actor, expected lock version, action, structured disposition where applicable, mandatory rationale for reject/revoke, confirmation digest, and timestamp. Client input cannot choose the actor or subject snapshot.

The transaction performs `SELECT ... FOR UPDATE`, rejects a stale `lock_version` or subject digest, ensures one terminal decision, inserts the decision/audit event, and advances the request state. A repeated idempotency key with the same canonical decision returns the existing result; a different payload returns `IDEMPOTENCY_CONFLICT`.

### 4.4 Decision semantics

| Review kind | Approve meaning in P3 | Reject meaning | Confirmation phrase |
|---|---|---|---|
| Candidate | Accept exactly one disposition: adopt, adapt, build, learn, watch, or reject | Reject this subject version without selecting a disposition | `APPROVE CANDIDATE <short-id>` / `REJECT CANDIDATE <short-id>` |
| Build | Approve the shown scope and permissions for a later P5 handoff | Preserve the proposal but prohibit handoff | `APPROVE BUILD <short-id>` / `REJECT BUILD <short-id>` |
| Implementation | Accept the shown verified asset for later release review | Preserve the asset and findings; prohibit release | `ACCEPT IMPLEMENTATION <short-id>` / `REJECT IMPLEMENTATION <short-id>` |
| Release | Authorize a later P4 publication transaction, not publication itself | Preserve the release candidate; prohibit publication | `APPROVE RELEASE <short-id>` / `REJECT RELEASE <short-id>` |
| Update | Authorize the shown update proposal for a later execution phase | Preserve the proposal and current active version | `APPROVE UPDATE <short-id>` / `REJECT UPDATE <short-id>` |

A reject decision is permanent and cannot be deleted or changed. A corrected subject must use a new immutable version and a new review request. An approval can be revoked only before a downstream consumer records its decision ID; revocation is another append-only decision. Once consumed, revocation returns `DECISION_ALREADY_CONSUMED`; later reversal must be a new lifecycle decision such as suspend, deprecate, or rollback in P4/P6.

P3 approval never creates a Release, publishes, installs, starts Kimi Code, writes Git, or deploys. It only records an authority token that a separately gated later phase may consume exactly once.

## 5. P2 import and workflow boundary

The P2-to-P3 bridge imports one completed ReviewPacket and its referenced immutable artifacts in one serializable transaction:

1. Validate every P1/P2 object and digest using current schemas.
2. Insert or verify exact matching Registry versions.
3. Insert immutable lineage edges.
4. Create one Candidate review request keyed by ReviewPacket ID and digest.
5. Record an import manifest with source IDs, digests, target versions, and completion time.
6. Move the analysis job to `WAITING_FOR_REVIEW` only after the Registry transaction commits.

Re-running the import is idempotent. Any same-ID/different-digest condition fails closed. The filesystem remains readable for rollback during P3 verification, but once a reviewed production migration later switches authority, application reads must use PostgreSQL exclusively. Linear is never imported.

Approval resumes only the deterministic workflow node associated with that request. Candidate approval records the disposition and a next-step marker. Candidate reject ends the candidate path. Neither branch creates a Release or implementation handoff in P3.

## 6. Review Center information architecture

### 6.1 `/reviews`

The queue is the primary P3 surface. It shows waiting age, review kind, value, risk, evidence confidence, recommended disposition, identity state, unresolved-question count, and exact subject version. Filters cover kind, state, value, risk, and waiting age. The default sort is longest-waiting first, then higher risk.

Selecting a row opens an evidence-first review workbench without hiding the queue context:

- immutable subject/version banner;
- recommendation and independent-critic agreement/disagreement;
- value/risk dimensions with evidence citations;
- Claim checks and conflicts;
- alternatives and capability overlap;
- exact change summary against the prior subject version;
- unresolved questions;
- approve/reject controls with typed confirmation.

### 6.2 `/captures/[id]`

The Capture page renders ordered source evidence, OCR, extracted entities/Claims, source checks, model-call metadata, ReviewPacket versions, and the linked decision timeline. It never renders raw object keys, filesystem paths, prompts, reasoning, secrets, or unrestricted remote content. Evidence links are ordinary HTTPS links with safe text; no fetched HTML executes in the app.

### 6.3 `/capabilities/[id]`

The Capability page renders the current Candidate or later capability record, versions, relationships, lineage, decisions, releases, deployments, and observations. During P3, missing future artifacts appear as explicit empty states rather than synthetic data or disabled fake controls.

### 6.4 State matrix

| Surface | Required states |
|---|---|
| Queue | loading, waiting rows, filtered empty, globally empty, Registry disabled, Registry unavailable, safe read error |
| Review detail | waiting, decision submitting, approved, rejected, revoked, superseded, stale conflict, idempotency conflict, validation error, server error |
| Capture | complete lineage, partial analysis, missing/not found, artifact unavailable, Registry disabled |
| Capability | Candidate-only, approved disposition, future-artifact empty states, not found, stale version warning |

Stale conflicts preserve all entered rationale and force a refresh before another decision. Success moves focus to the immutable decision receipt. Status is always text-first and never color-only. The 390px composition keeps evidence before controls and has no horizontal overflow.

## 7. HTTP and mutation boundary

Server Components read through narrow query services. Mutations use Node.js route handlers under `/api/caphub/reviews/[id]/decisions` rather than client-accessible database code.

The decision route requires:

- Registry and Caphub enabled;
- exact approved HTTPS `Origin`;
- `Sec-Fetch-Site: same-origin` when present;
- JSON content type and bounded content length;
- strict body schema with no actor, SQL, URL, path, provider, or secret fields;
- request ID, idempotency key, expected lock version, expected subject digest, action, confirmation text, rationale, and optional Candidate disposition;
- safe typed errors without SQL text, stack, connection details, or subject payload leakage.

All writes occur in the Registry service. UI components never construct SQL or infer workflow authority.

## 8. PostgreSQL migration and security plan

Migrations are ordered SQL files with immutable SHA-256 digests and a migration ledger. The application role can read/write only the Caphub schema and cannot create extensions, roles, schemas, or databases. The migration role is separate and is never used by the web runtime.

Migration 001 creates schema, migration ledger, records/versions, lineage, import manifests, review requests/decisions, consumed-decision links, and audit events. Migration 002 adds read indexes and restricted views. Down migrations are not used in production; rollback restores the previous application build and database backup/PITR point after an explicit production decision.

Append-only tables receive database triggers that reject UPDATE and DELETE. Foreign keys use `RESTRICT`, not cascade deletion. Every mutation uses parameterized SQL. Statement timeout, pool maximum, application name, TLS requirement, and idle timeout are fixed or bounded by strict config.

The disposable local PostgreSQL harness uses a Unix socket, trust authentication confined to its temporary directory, a random port or socket path, and no external listener. Tests prove migrations from empty, checksum mismatch rejection, contract parity, concurrent decisions, stale writes, idempotency, append-only enforcement, rollback, and lineage.

## 9. Test and evidence strategy

- Unit tests: strict schemas, decision phrases, state transitions, diff generation, safe errors, query view-model shaping.
- PostgreSQL contract tests: migrations, repositories, locking, idempotency, append-only triggers, transaction rollback, lineage, import parity.
- BDD: P2 ReviewPacket import → `WAITING_FOR_REVIEW` → real HTTP decision route → deterministic workflow resume, including hostile evidence strings and concurrent approvals.
- Component tests: every queue/detail/Capture/Capability state, keyboard behavior, focus, reduced motion, and stale conflict recovery.
- Final-build browser verification: 1440px and 390px, queue plus each detail page, no overflow, WCAG AA, no console errors, final screenshots.
- Focused independent pre-implementation review, one scoped implementation review, and one P3-C data-integrity/security/UI verification. Fixes receive only targeted re-review.

No test may read a real database URL, provider key, production state directory, or external source.

## 10. Gates and rollback

- **P3-A — implementation plan:** this vendor-neutral schema, migration, local-test, and rollback design may be approved under standing authorization. Production provider/Secret/backup/PITR/cost selection remains unresolved and blocks P3-D only.
- **P3-B — decision contract:** the table above fixes permissions, exact confirmation copy, diff binding, rejection permanence, and revocation semantics for implementation.
- **P3-C — verification:** requires PostgreSQL integrity tests, security BDD, final-build UI evidence, independent Review/Verification, and Human walkthrough evidence before release consideration.
- **P3-D — production migration/release:** always requires fresh explicit Human authorization, real credentials, backup/PITR confirmation, maintenance/rollback plan, service restart, deployment, and traffic decision.

Before P3-D, rollback is a Git revert plus disposal of the local temporary database. No production state is changed.

## 11. Explicit non-goals

- No production database or managed-provider selection.
- No Linear migration.
- No Obsidian synchronization.
- No Capability Package generation or platform adapter.
- No Kimi Code or other implementation handoff.
- No publication, installation, deployment, merge, push, tag, or release.
- No deletion API, cascade deletion, or mutable audit history.
- No multi-tenant roles; the MVP actor is the single server-authenticated Human Owner.
