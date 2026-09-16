# Caphub P3 Review Center and PostgreSQL Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PostgreSQL the disabled-by-default Caphub metadata, workflow, audit, decision, and lineage authority, then provide a version-bound Human Review Center without creating release, build, publish, install, Git, or deploy side effects.

**Architecture:** Keep strict Zod domain contracts and service ports independent of storage. A server-only `pg` adapter uses immutable record versions, append-only audit/decision tables, serializable imports, and row-locked decision transactions; a sentinel-owned local PostgreSQL 17 harness proves actual server semantics. Next.js Server Components read minimal DTOs, while one bounded Route Handler accepts review decisions and delegates all authority checks to the Registry service.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Zod 4, `pg`, PostgreSQL 17, Vitest, Testing Library, Playwright, existing AllJobs Paper Workbench CSS.

**Spec:** `docs/superpowers/specs/2026-09-16-caphub-review-registry-design.md`

## Global Constraints

- Preserve Human-owned `AGENTS.md`; stage only exact P3 files.
- The retired `FRONTEND-DESIGN-WORKFLOW.md` is not an authority for this phase; the approved P3 Brief/mockup and this plan are the UI authority.
- `caphub.registry.enabled` defaults to `false`; no production database, credential, migration, restart, deployment, traffic switch, push, merge, tag, or release is authorized.
- Read the relevant Next.js 16.3 files under `node_modules/next/dist/docs/` before editing App Router code; dynamic `params` and `searchParams` are Promises.
- Database secrets are environment-variable references read only in a `server-only` Registry runtime after both Caphub and Registry are enabled.
- Local PostgreSQL tests use only a sentinel-owned temporary cluster and Unix socket. They never use `CAPHUB_DATABASE_URL`, the real Control Host home, or an external database.
- All SQL is parameterized. Immutable versions, lineage, audit events, and ReviewDecisions reject UPDATE/DELETE in PostgreSQL.
- Reject is permanent and never an approval disposition. Approval revocation is append-only, phrase- and rationale-bound, linked to the original approval, and allowed only before consumption. A stale subject digest or lock version writes nothing; superseded and same-request stale states remain distinct.
- P3 may record a Candidate disposition and deterministic reviewed state; it cannot create a Release, Capability Package, implementation handoff, Builder process, publication, installation, Git mutation, or deployment.
- Use TDD for every feature and BDD for filesystem/PostgreSQL, HTTP, workflow, and browser boundaries. Preserve explicit RED output in task evidence.
- One focused review per independently testable batch; fixes receive scoped re-review only. Full test/typecheck/lint/build/browser gates run at P3-C rather than after every task.

---

## File and responsibility map

| Path | Responsibility |
|---|---|
| `lib/caphub/registry/schemas.ts` | Strict IDs, record versions, lineage, review requests/decisions, imports, DTO input schemas |
| `lib/caphub/registry/types.ts` | Inferred public domain types only |
| `lib/caphub/registry/contracts.ts` | Storage-neutral Registry, review, lineage, audit, and transaction ports |
| `lib/caphub/registry/migrations/*.sql` | Immutable PostgreSQL schema and read indexes/views |
| `lib/caphub/registry/migrate.ts` | Checksum-bound migration runner |
| `lib/caphub/registry/postgres/database.ts` | Server-only pool/transaction primitives and safe error mapping |
| `lib/caphub/registry/postgres/records.ts` | Immutable versions, current pointers, lineage, import manifests |
| `lib/caphub/registry/postgres/caphub-stores.ts` | PostgreSQL implementations of Capture/job/artifact/audit ports |
| `lib/caphub/registry/postgres/reviews.ts` | Row-locked review request and decision transactions |
| `lib/caphub/registry/import-review-packet.ts` | Filesystem P1/P2 → PostgreSQL serializable bridge |
| `lib/caphub/registry/review-service.ts` | Confirmation, stale, idempotency, revoke/consume, and resume orchestration |
| `lib/caphub/registry/queries.ts` | Minimal server DTOs for queue, Capture, and Capability pages |
| `lib/caphub/registry/runtime.ts` | Fixed server-only Control Host composition and disabled-before-secret boundary |
| `tests/helpers/caphub-postgres.ts` | Sentinel-owned disposable PostgreSQL 17 cluster |
| `app/api/caphub/reviews/[id]/decisions/*` | Bounded HTTP decision protocol and fixed runtime route |
| `components/caphub/reviews/*` | Decision folio, evidence dossier, decision form/receipt, detail views |
| `app/reviews/page.tsx` | Review queue Server Component |
| `app/captures/[id]/page.tsx` | Capture lineage Server Component |
| `app/capabilities/[id]/page.tsx` | Candidate/capability lineage Server Component |
| `tests/e2e/caphub-review-registry.spec.ts` | Final-build real-browser P3 flow and state evidence |

---

### Task 1: Freeze Registry, review, and configuration contracts

**Files:**
- Create: `lib/caphub/registry/schemas.ts`
- Create: `lib/caphub/registry/types.ts`
- Create: `lib/caphub/registry/contracts.ts`
- Create: `lib/caphub/registry/schemas.test.ts`
- Modify: `lib/caphub/analysis/schemas.ts`
- Modify: `lib/caphub/analysis/types.ts`
- Modify: `lib/caphub/workflow/contracts.ts`
- Modify: `lib/planning/config.ts`
- Modify: `lib/planning/config.test.ts`
- Modify: `config/alljobs.example.json`

**Interfaces:**
- Consumes: existing `CaptureRecord`, `ReviewPacket`, `AnalysisJob`, `StageArtifact`, and audit schemas.
- Produces: `RegistryVersion`, `RegistryLineageEdge`, `ReviewRequest`, `ReviewDecision`, `RegistryImportManifest`, `RegistryRecordStore`, `ReviewStore`, `AnalysisJobStore`, `StageArtifactStore`, and `controlHostCaphubRegistryConfigSchema`.

- [ ] **Step 1: Write strict RED schema/config tests**

```ts
expect(reviewRequestSchema.parse(waitingRequest)).toMatchObject({
  state: "WAITING_FOR_REVIEW",
  review_kind: "candidate",
  lock_version: 1
});
expect(() => reviewDecisionSchema.parse({ ...decision, actor: "client:user" })).toThrow();
expect(() => reviewDecisionSchema.parse({ ...decision, expected_lock_version: 0 })).toThrow();
expect(controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"] }).caphub).toBeUndefined();
expect(controlHostCaphubRegistryConfigSchema.parse({})).toEqual({
  enabled: false,
  databaseUrlEnv: "CAPHUB_DATABASE_URL",
  sslMode: "require",
  maxConnections: 4,
  statementTimeoutMs: 5000
});
```

Add negative cases for unknown keys, literal secret values, arbitrary URLs, invalid IDs/digests/timestamps, mutable actor, unsupported review kinds/states/actions, missing reject/revoke rationale, Candidate approve without one of `adopt|adapt|build|learn|watch`, Candidate approve with `reject`, non-Candidate disposition, revoke without the original approval decision ID, malformed confirmation, and duplicate lineage endpoints. The safe decision DTO must derive `authority.state`, `authority.consumedBy`, and `authority.revocable` on the server.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- lib/caphub/registry/schemas.test.ts lib/planning/config.test.ts`

Expected: FAIL because Registry schemas/config and workflow ports do not exist.

- [ ] **Step 3: Implement the minimal contracts**

```ts
export const reviewKindSchema = z.enum([
  "candidate", "build", "implementation", "release", "update"
]);
export const reviewStateSchema = z.enum([
  "WAITING_FOR_REVIEW", "APPROVED", "REJECTED", "REVOKED", "SUPERSEDED"
]);
export const registryRecordKindSchema = z.enum([
  "capture", "analysis_job", "analysis_artifact", "review_packet",
  "entity", "claim", "evidence", "candidate", "experience_card",
  "build_proposal", "release", "deployment", "usage_observation"
]);
export interface AnalysisJobStore {
  get(id: string): Promise<AnalysisJob | null>;
  put(job: AnalysisJob): Promise<void>;
}
export interface StageArtifactStore {
  get(id: string): Promise<StageArtifact | null>;
  findByJobStage(jobId: string, stage: AnalysisStage): Promise<StageArtifact | null>;
  create(input: CreateStageArtifactInput): Promise<StageArtifact>;
  readPayload(id: string): Promise<unknown | null>;
}
```

Extend `AnalysisJob` with `WAITING_FOR_REVIEW` and `reviewed` variants. `WAITING_FOR_REVIEW` binds `review_request_id` and packet artifact; `reviewed` binds the terminal decision ID/outcome and optional Candidate disposition. Change P2 services/runners from concrete filesystem store types to these ports without changing behavior.

- [ ] **Step 4: Run GREEN and adjacent regressions**

Run: `npm test -- lib/caphub/registry/schemas.test.ts lib/planning/config.test.ts lib/caphub/workflow/runner.test.ts lib/caphub/service/analyze.test.ts`

Expected: PASS; P2 still completes through ReviewPacket until the separate import coordinator runs.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/registry/schemas.ts lib/caphub/registry/types.ts lib/caphub/registry/contracts.ts lib/caphub/registry/schemas.test.ts lib/caphub/analysis/schemas.ts lib/caphub/analysis/types.ts lib/caphub/workflow/contracts.ts lib/planning/config.ts lib/planning/config.test.ts config/alljobs.example.json
git commit -m "feat(caphub): define P3 registry contracts"
```

---

### Task 2: Add the disposable PostgreSQL harness and checksum-bound migrations

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/helpers/caphub-postgres.ts`
- Create: `lib/caphub/registry/migrations/001_registry.sql`
- Create: `lib/caphub/registry/migrations/002_read_models.sql`
- Create: `lib/caphub/registry/migration-manifest.ts`
- Create: `lib/caphub/registry/migrate.ts`
- Create: `lib/caphub/registry/migrate.test.ts`

**Interfaces:**
- Consumes: PostgreSQL 17 `initdb`/`pg_ctl` on the local development host.
- Produces: `startCaphubTestPostgres()`, `applyRegistryMigrations(client)`, and an immutable migration ledger.

- [ ] **Step 1: Install only the PostgreSQL client dependencies**

Run: `npm install pg && npm install --save-dev @types/pg`

Expected: `package.json` and lockfile add `pg` plus types; no ORM, migration framework, or managed-provider SDK appears.

- [ ] **Step 2: Write RED migration/harness tests**

```ts
const fixture = await startCaphubTestPostgres();
await applyRegistryMigrations(fixture.pool);
await expect(applyRegistryMigrations(fixture.pool)).resolves.toEqual({ applied: [] });
await fixture.pool.query("UPDATE caphub.registry_versions SET payload_digest = $1", ["f".repeat(64)]);
await expect(fixture.pool.query("DELETE FROM caphub.review_decisions")).rejects.toThrow(/append-only/);
```

Also prove: the cluster listens on its private Unix socket only; sentinel/PID ownership gates cleanup; empty migration succeeds; rerun is idempotent; edited checksum is rejected; transaction failure rolls back all objects; app role cannot create schemas/extensions/roles; foreign keys use `RESTRICT`; no table uses cascade deletion.

- [ ] **Step 3: Run the migration test and verify RED**

Run: `npm test -- lib/caphub/registry/migrate.test.ts`

Expected: FAIL because the harness and migrations do not exist.

- [ ] **Step 4: Implement the harness and migrations**

The helper must spawn binaries with argument arrays, never a shell:

```ts
await execFile("initdb", ["-D", dataDir, "-A", "trust", "-U", "caphub_test", "--no-locale"]);
await execFile("pg_ctl", ["-D", dataDir, "-o", `-F -h '' -k ${socketDir}`, "-w", "start"]);
const pool = new Pool({ host: socketDir, port: 5432, user: "caphub_test", database: "postgres", max: 2 });
```

Migration 001 creates `caphub.schema_migrations`, `registry_records`, `registry_versions`, `registry_lineage`, `capture_idempotency`, `registry_imports`, `review_requests`, `review_decisions`, `decision_consumers`, and `audit_events`. Migration 002 creates bounded indexes and read-only queue/lineage views. Add triggers that raise SQLSTATE `55000` on UPDATE/DELETE of immutable tables.

- [ ] **Step 5: Run GREEN**

Run: `npm test -- lib/caphub/registry/migrate.test.ts`

Expected: PASS against a real temporary PostgreSQL 17 server; cleanup leaves no cluster process or directory.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/helpers/caphub-postgres.ts lib/caphub/registry/migrations/001_registry.sql lib/caphub/registry/migrations/002_read_models.sql lib/caphub/registry/migration-manifest.ts lib/caphub/registry/migrate.ts lib/caphub/registry/migrate.test.ts
git commit -m "feat(caphub): add PostgreSQL registry migrations"
```

---

### Task 3: Implement immutable Registry versions and lineage

**Files:**
- Create: `lib/caphub/registry/postgres/database.ts`
- Create: `lib/caphub/registry/postgres/records.ts`
- Create: `lib/caphub/registry/postgres/records.test.ts`
- Create: `lib/caphub/registry/lineage.ts`
- Create: `lib/caphub/registry/lineage.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas/contracts and Task 2 migrated `pg.Pool`.
- Produces: `PostgresRegistryRecordStore.putVersion/getVersion/getCurrent`, `putLineage`, and `traceReleaseLineage`.

- [ ] **Step 1: Write RED transaction and lineage tests**

```ts
await expect(store.putVersion(first)).resolves.toEqual({ kind: "created", version: 1 });
await expect(store.putVersion(first)).resolves.toEqual({ kind: "existing", version: 1 });
await expect(store.putVersion({ ...first, payload_digest: "f".repeat(64) }))
  .rejects.toMatchObject({ code: "REGISTRY_DIGEST_CONFLICT" });
await expect(store.putVersion({ ...second, previous_version: 9 }))
  .rejects.toMatchObject({ code: "STALE_WRITE" });
expect(await traceReleaseLineage(releaseId)).toMatchObject({ captureIds: [captureId], decisionIds: [decisionId] });
```

Test concurrent version-2 inserts, transaction rollback, dangling/cyclic/disallowed lineage edges, fixed depth bound, deterministic ordering, exact versions/digests, parameterized hostile text, and safe error mapping without SQL/connection leakage.

- [ ] **Step 2: Run RED**

Run: `npm test -- lib/caphub/registry/postgres/records.test.ts lib/caphub/registry/lineage.test.ts`

Expected: FAIL because PostgreSQL repositories do not exist.

- [ ] **Step 3: Implement minimal row-locked version writes**

```ts
await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
const current = await client.query(
  "SELECT current_version FROM caphub.registry_records WHERE record_id = $1 FOR UPDATE",
  [record.record_id]
);
const expectedPrevious = current.rowCount === 0 ? null : current.rows[0].current_version;
if (record.previous_version !== expectedPrevious) throw new RegistryError("STALE_WRITE");
await insertRegistryVersion(client, record);
await advanceCurrentVersion(client, record.record_id, record.version);
await client.query("COMMIT");
```

Validate every payload with the kind-specific Zod schema on write and read. Never return raw `pg` rows outside this adapter.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npm test -- lib/caphub/registry/postgres/records.test.ts lib/caphub/registry/lineage.test.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/registry/postgres/database.ts lib/caphub/registry/postgres/records.ts lib/caphub/registry/postgres/records.test.ts lib/caphub/registry/lineage.ts lib/caphub/registry/lineage.test.ts
git commit -m "feat(caphub): persist immutable registry lineage"
```

---

### Task 4: Implement PostgreSQL Caphub storage ports and parity contracts

**Files:**
- Create: `lib/caphub/registry/contract-suite.ts`
- Create: `lib/caphub/registry/postgres/caphub-stores.ts`
- Create: `lib/caphub/registry/postgres/caphub-stores.test.ts`
- Modify: `lib/caphub/storage/filesystem.test.ts`
- Modify: `lib/caphub/workflow/filesystem.test.ts`
- Modify: `lib/caphub/storage/contracts.ts`
- Modify: `lib/caphub/workflow/contracts.ts`
- Modify: `lib/caphub/workflow/runner.ts`
- Modify: `lib/caphub/service/analyze.ts`

**Interfaces:**
- Consumes: existing `CaptureStore`, newly extracted workflow ports, Registry record/audit stores.
- Produces: `PostgresCaptureStore`, `PostgresAnalysisJobStore`, `PostgresStageArtifactStore`, `PostgresCaptureAuditLog`, and `PostgresModelCallAuditStore`.

- [ ] **Step 1: Extract storage-neutral contract suites and verify existing filesystem GREEN**

Extract one shared contract suite that creates a canonical Capture, asserts exact read-back and idempotent replay, then reuses the same ID and key with a different digest and asserts `CAPTURE_DIGEST_CONFLICT`. Run that unchanged suite against both filesystem and PostgreSQL factories.

Run: `npm test -- lib/caphub/storage/filesystem.test.ts lib/caphub/workflow/filesystem.test.ts`

Expected: PASS with the extracted suite, proving the test refactor did not alter behavior.

- [ ] **Step 2: Add PostgreSQL implementations to the same suite and verify RED**

Cover immutable Capture create/get/idempotency, mutable AnalysisJob pointer with validated transitions, immutable content-addressed artifact payloads, deterministic append-only capture/model audit events, concurrent creates/appends, and safe read-after-restart.

Run: `npm test -- lib/caphub/registry/postgres/caphub-stores.test.ts`

Expected: FAIL because the PostgreSQL adapters do not exist.

- [ ] **Step 3: Implement minimal adapters**

Use `registry_records/registry_versions` for Capture, job, artifact metadata, and artifact JSON payloads. Use specialized idempotency/audit tables for lookup and append behavior. Make all multi-row operations one transaction; reject same-ID/different-digest rather than overwrite.

- [ ] **Step 4: Run parity and P2 regressions**

Run: `npm test -- lib/caphub/registry/postgres/caphub-stores.test.ts lib/caphub/storage/filesystem.test.ts lib/caphub/workflow/filesystem.test.ts lib/caphub/workflow/runner.test.ts lib/caphub/service/analyze.test.ts`

Expected: PASS with the same contract expectations on filesystem and PostgreSQL stores.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/registry/contract-suite.ts lib/caphub/registry/postgres/caphub-stores.ts lib/caphub/registry/postgres/caphub-stores.test.ts lib/caphub/storage/filesystem.test.ts lib/caphub/workflow/filesystem.test.ts lib/caphub/storage/contracts.ts lib/caphub/workflow/contracts.ts lib/caphub/workflow/runner.ts lib/caphub/service/analyze.ts
git commit -m "feat(caphub): add PostgreSQL storage adapters"
```

---

### Task 5: Implement append-only review transactions

**Files:**
- Create: `lib/caphub/registry/confirmations.ts`
- Create: `lib/caphub/registry/confirmations.test.ts`
- Create: `lib/caphub/registry/postgres/reviews.ts`
- Create: `lib/caphub/registry/postgres/reviews.test.ts`

**Interfaces:**
- Consumes: `ReviewRequest`, `ReviewDecisionInput`, migrated tables, server-bound actor.
- Produces: `createReviewRequest`, `decide`, `revoke`, `consumeDecision`, and safe typed result/error codes.

- [ ] **Step 1: Write RED confirmation and concurrency tests**

```ts
expect(confirmationFor(request, "approve")).toBe("APPROVE CANDIDATE 4d95f11c");
const [left, right] = await Promise.allSettled([
  reviews.decide({ ...input, idempotency_key: "intent-a" }),
  reviews.decide({ ...input, idempotency_key: "intent-b" })
]);
expect([left, right].filter((result) => result.status === "fulfilled")).toHaveLength(1);
expect(await reviews.listDecisions(request.id)).toHaveLength(1);
```

Prove stale lock/digest writes nothing, same idempotency+payload returns existing, same key+different payload conflicts, reject/revoke require rationale, reject cannot be changed/deleted, unconsumed approval can be revoked with `REVOKE <KIND> <short-id>`, consumed approval returns `DECISION_ALREADY_CONSUMED` plus only the safe consumer ID, revoke locks the request and original approval and links `revokes_decision_id`, `reject` cannot appear as a Candidate approval disposition, and hostile strings remain inert parameters. Prove a successful revoke permits a new request for the same unchanged subject version while changed evidence requires a new version/request.

- [ ] **Step 2: Run RED**

Run: `npm test -- lib/caphub/registry/confirmations.test.ts lib/caphub/registry/postgres/reviews.test.ts`

Expected: FAIL because confirmation and review repositories do not exist.

- [ ] **Step 3: Implement one row-locked decision transaction**

```ts
const row = await client.query(
  "SELECT * FROM caphub.review_requests WHERE request_id = $1 FOR UPDATE",
  [input.request_id]
);
assertCurrent(row, input.expected_lock_version, input.expected_subject_digest);
assertConfirmation(row, input.action, input.confirmation);
await assertDecisionIsUnconsumedWhenRevoking(client, input.original_approval_decision_id);
const decision = await insertReviewDecision(client, row, input, "human:owner");
await advanceReviewRequest(client, row, decision);
await insertReviewAuditEvent(client, decision);
await client.query("COMMIT");
```

Bind `actor: "human:owner"` inside the service, never from input. Map serialization conflicts to `STALE_REVIEW`; never retry a Human decision automatically.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- lib/caphub/registry/confirmations.test.ts lib/caphub/registry/postgres/reviews.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/registry/confirmations.ts lib/caphub/registry/confirmations.test.ts lib/caphub/registry/postgres/reviews.ts lib/caphub/registry/postgres/reviews.test.ts
git commit -m "feat(caphub): record version-bound review decisions"
```

---

### Task 6: Import ReviewPackets and suspend at `WAITING_FOR_REVIEW`

**Files:**
- Create: `lib/caphub/registry/import-review-packet.ts`
- Create: `lib/caphub/registry/import-review-packet.test.ts`
- Create: `lib/caphub/registry/import-review-packet.behavior.test.ts`
- Modify: `lib/caphub/analysis/schemas.ts`
- Modify: `lib/caphub/workflow/runner.ts`
- Modify: `lib/caphub/workflow/runner.test.ts`

**Interfaces:**
- Consumes: validated P1 Capture, completed P2 job/artifacts/ReviewPacket, PostgreSQL record/lineage/review stores.
- Produces: `importReviewPacket(input): Promise<{ requestId; job: AnalysisJob }>` and an idempotent import manifest.

- [ ] **Step 1: Write RED import BDD**

Drive real temporary filesystem P1/P2 stores plus real temporary PostgreSQL:

```ts
const first = await importer.importReviewPacket({ jobId });
const second = await importer.importReviewPacket({ jobId });
expect(second).toEqual(first);
expect(await jobs.get(jobId)).toMatchObject({
  status: "WAITING_FOR_REVIEW",
  review_request_id: first.requestId
});
expect(await registry.traceFromCapture(capture.id)).toContainEqual(
  expect.objectContaining({ kind: "candidate" })
);
```

Prove ordered screenshots, Entities, Claims, Evidence, Candidate, ReviewPacket, exact digests and lineage import; crash after database commit/before job update resumes without duplicates; same ID/different digest fails; missing/mismatched artifact fails; Linear is never read; no provider call occurs.

- [ ] **Step 2: Run RED**

Run: `npm test -- lib/caphub/registry/import-review-packet.test.ts lib/caphub/registry/import-review-packet.behavior.test.ts`

Expected: FAIL because the import coordinator does not exist.

- [ ] **Step 3: Implement serializable import and post-commit job transition**

The database transaction writes/validates all versions, edges, manifest, audit event, and one Candidate request. Only after COMMIT does the coordinator write the filesystem job pointer. A rerun first reads the manifest and repairs the pointer if needed.

- [ ] **Step 4: Run GREEN plus P2 workflow regressions**

Run: `npm test -- lib/caphub/registry/import-review-packet.test.ts lib/caphub/registry/import-review-packet.behavior.test.ts lib/caphub/workflow/runner.test.ts lib/caphub/service/analyze.test.ts`

Expected: PASS; ReviewPacket composition remains provider-fixture-only.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/registry/import-review-packet.ts lib/caphub/registry/import-review-packet.test.ts lib/caphub/registry/import-review-packet.behavior.test.ts lib/caphub/analysis/schemas.ts lib/caphub/workflow/runner.ts lib/caphub/workflow/runner.test.ts
git commit -m "feat(caphub): import review packets into registry"
```

---

### Task 7: Add the fixed Registry runtime and decision HTTP boundary

**Files:**
- Create: `lib/caphub/registry/runtime.ts`
- Create: `lib/caphub/registry/runtime.test.ts`
- Create: `lib/caphub/registry/review-service.ts`
- Create: `lib/caphub/registry/review-service.test.ts`
- Create: `app/api/caphub/reviews/[id]/decisions/route-factory.ts`
- Create: `app/api/caphub/reviews/[id]/decisions/route.test.ts`
- Create: `app/api/caphub/reviews/[id]/decisions/route.ts`
- Create: `lib/caphub/registry/review-decision.behavior.test.ts`
- Modify: `app/api/caphub/captures/route.ts`
- Modify: `app/api/caphub/captures/[id]/route.ts`
- Modify: `lib/caphub/service/analyze-runtime.ts`

**Interfaces:**
- Consumes: strict Registry config, environment secret reference, PostgreSQL adapters, filesystem object store, decision service.
- Produces: `loadControlHostRegistryRuntime`, `POST /api/caphub/reviews/[id]/decisions`, and deterministic job `reviewed` transition.

- [ ] **Step 1: Write RED disabled/secret/runtime tests**

```ts
await expect(loadControlHostRegistryRuntime({ config: disabledConfig, env: secretTrap }))
  .rejects.toMatchObject({ code: "REGISTRY_DISABLED" });
expect(secretTrap.reads).toEqual([]);
```

When Registry is enabled in an injected fixture, prove Capture, analysis job/artifact, and audit composition use PostgreSQL adapters while raw screenshot bytes remain in `LocalCaptureObjectStore`. No route may silently fall back to filesystem metadata after enablement.

- [ ] **Step 2: Write RED route and cross-boundary BDD**

Assert origin-before-body, same-origin Fetch Metadata, JSON/content-length bounds, strict ID/body schemas, actor/path/SQL/URL/provider/secret field rejection, typed safe errors, cache/security headers, concurrent approval returning the winner receipt, same-request stale conflict with preserved client rationale, superseded request controls removed, duplicate intent, approve/reject/revoke/consumed-revoke, and `reviewed` job state. Inspect PostgreSQL afterward to prove one decision/audit and zero Release/BuildProposal/Deployment records.

Run: `npm test -- lib/caphub/registry/runtime.test.ts app/api/caphub/reviews/[id]/decisions/route.test.ts lib/caphub/registry/review-decision.behavior.test.ts`

Expected: FAIL because runtime, service, and route do not exist.

- [ ] **Step 3: Implement the route factory and service**

```ts
export function createReviewDecisionPostRoute(deps: ReviewDecisionRouteDependencies) {
  return async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const originFailure = validateDecisionOrigin(request, deps.allowedOrigins);
    if (originFailure) return originFailure;
    const { id } = await context.params;
    return decisionResponse(await deps.decide(id, await readBoundedJson(request)));
  };
}
```

The fixed `route.ts` loads config, rejects disabled before the database URL environment read, composes the runtime, and returns only a minimal decision receipt. No automatic serialization retry is allowed.

- [ ] **Step 4: Run GREEN and adjacent route regressions**

Run: `npm test -- lib/caphub/registry/runtime.test.ts app/api/caphub/reviews/[id]/decisions/route.test.ts lib/caphub/registry/review-decision.behavior.test.ts app/api/caphub/captures/route.test.ts app/api/caphub/captures/[id]/route.test.ts lib/caphub/service/analyze-runtime.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/registry/runtime.ts lib/caphub/registry/runtime.test.ts lib/caphub/registry/review-service.ts lib/caphub/registry/review-service.test.ts app/api/caphub/reviews/[id]/decisions/route-factory.ts app/api/caphub/reviews/[id]/decisions/route.test.ts app/api/caphub/reviews/[id]/decisions/route.ts lib/caphub/registry/review-decision.behavior.test.ts app/api/caphub/captures/route.ts app/api/caphub/captures/[id]/route.ts lib/caphub/service/analyze-runtime.ts
git commit -m "feat(caphub): add review decision boundary"
```

---

### Task 8: Build minimal Registry read DTOs

**Files:**
- Create: `lib/caphub/registry/queries.ts`
- Create: `lib/caphub/registry/queries.test.ts`
- Create: `lib/caphub/registry/diff.ts`
- Create: `lib/caphub/registry/diff.test.ts`

**Interfaces:**
- Consumes: PostgreSQL views/repositories and exact domain payloads.
- Produces: `getReviewQueue`, `getReviewDetail`, `getCaptureDetail`, and `getCapabilityDetail` returning JSON-serializable, client-safe DTOs.

- [ ] **Step 1: Write RED DTO and minimization tests**

```ts
const detail = await getReviewDetail(requestId);
expect(detail).toMatchObject({ request: { subjectVersion: 1 }, decision: null });
expect(JSON.stringify(detail)).not.toMatch(/databaseUrl|object\.key|prompt|reasoning|api.?key|filesystem/i);
expect(diffRegistryVersions(null, current)).toEqual([
  { kind: "added", path: "$", summary: "New record" }
]);
```

Test bounded pagination (25, maximum 200), fixed filters/sort, queue identity, evidence-confidence, and unresolved counts, first-version Diff, later field Diff, Capture partial/complete states with bounded safe model-call metadata and decision status, Candidate-only future empty states with versions/lineage/decisions, server-derived revocable/consumed authority, deterministic citation ordering, hostile strings as text, exact not-found/disabled/unavailable states, and no `Date`, `Map`, class instance, database row, or secret-bearing object crossing RSC → client.

- [ ] **Step 2: Run RED**

Run: `npm test -- lib/caphub/registry/queries.test.ts lib/caphub/registry/diff.test.ts`

Expected: FAIL because query services do not exist.

- [ ] **Step 3: Implement server-only queries and explicit DTO projection**

```ts
import "server-only";
export async function getReviewQueue(input: ReviewQueueInput): Promise<ReviewQueueDto> {
  const parsed = reviewQueueInputSchema.parse(input);
  const rows = await repository.listReviewQueue(parsed);
  return { items: rows.map(toReviewQueueItemDto), nextCursor: rows.at(-1)?.cursor ?? null };
}
```

- [ ] **Step 4: Run GREEN**

Run: `npm test -- lib/caphub/registry/queries.test.ts lib/caphub/registry/diff.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/registry/queries.ts lib/caphub/registry/queries.test.ts lib/caphub/registry/diff.ts lib/caphub/registry/diff.test.ts
git commit -m "feat(caphub): expose safe registry review views"
```

---

### Task 9: Implement the approved Review Center, Capture, and Capability UI

**Files:**
- Create: `components/caphub/reviews/review-center.tsx`
- Create: `components/caphub/reviews/review-center.test.tsx`
- Create: `components/caphub/reviews/review-dossier.tsx`
- Create: `components/caphub/reviews/decision-form.tsx`
- Create: `components/caphub/reviews/decision-form.test.tsx`
- Create: `components/caphub/reviews/registry-detail.tsx`
- Create: `components/caphub/reviews/registry-detail.test.tsx`
- Create: `app/reviews/page.tsx`
- Create: `app/captures/[id]/page.tsx`
- Create: `app/capabilities/[id]/page.tsx`
- Create: `app/reviews/loading.tsx`
- Create: `app/reviews/error.tsx`
- Create: `app/captures/[id]/not-found.tsx`
- Create: `app/capabilities/[id]/not-found.tsx`
- Modify: `components/planning/primary-nav.tsx`
- Modify: `components/planning/app-shell.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: Task 8 DTOs and Task 7 decision endpoint.
- Produces: the approved decision-folio UI at `/reviews`, `/captures/[id]`, and `/capabilities/[id]`.

- [ ] **Step 1: Write the full component state matrix as RED tests**

Cover queue loading/waiting/filtered-empty/global-empty/disabled/unavailable/read-error; review waiting/submitting/approved-unconsumed/approved-consumed/rejected/revoked/superseded/same-request-stale/concurrent-terminal/idempotency/validation/server-error; Capture complete/partial/missing/artifact-unavailable/disabled; Capability Candidate-only/approved/future-empty/not-found/stale. Assert queue identity/evidence-confidence/unresolved data, explicit critic agreement/disagreement and unresolved questions, accessible latest-request navigation from Superseded, keyboard row selection plus dossier-heading announcement, native landmarks/headings, text-first states, at least 44 CSS-pixel mobile controls, exact full digest before controls and in receipts, exact confirmation association, rationale preservation on stale/idempotency/server error, success focus plus a live announcement containing the decision ID and explicit no-release/no-build consequence, 200% zoom usability, and no unsafe HTML rendering.

Run: `npm test -- components/caphub/reviews/review-center.test.tsx components/caphub/reviews/decision-form.test.tsx components/caphub/reviews/registry-detail.test.tsx`

Expected: FAIL because components/pages do not exist.

- [ ] **Step 2: Implement Server Component reads and the minimal Client decision island**

```tsx
export default async function ReviewsPage({
  searchParams
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = reviewQueueSearchParamsSchema.parse(await searchParams);
  const view = await getReviewQueue(filters);
  return <ReviewCenter initialView={view} />;
}
```

Only `decision-form.tsx` and queue filter interaction need `"use client"`. Pass plain minimal DTOs. Dynamic page params are awaited and validated before queries. Pages export `runtime = "nodejs"` and `dynamic = "force-dynamic"`.

- [ ] **Step 3: Implement the Brief-bound Paper Workbench CSS**

Reproduce the approved mockup's continuous 3/5/4 folio, stable docket, evidence-first dossier, dark decision ledger, mobile docket → evidence → Diff → decision order, current-nav visibility, visible focus, reduced-motion fallback, text wrapping, and honest future-artifact empty states. Do not add card dashboards, charts, gradients, glass, raw provider output, or fake later-phase controls.

- [ ] **Step 4: Run GREEN, typecheck, and focused lint**

Run: `npm test -- components/caphub/reviews/review-center.test.tsx components/caphub/reviews/decision-form.test.tsx components/caphub/reviews/registry-detail.test.tsx`

Run: `npm run typecheck`

Run: `npx eslint components/caphub/reviews app/reviews app/captures app/capabilities components/planning/primary-nav.tsx components/planning/app-shell.tsx`

Expected: PASS with zero new warnings.

- [ ] **Step 5: Commit**

```bash
git add components/caphub/reviews app/reviews app/captures app/capabilities components/planning/primary-nav.tsx components/planning/app-shell.tsx app/globals.css
git commit -m "feat(caphub): add human review center"
```

---

### Task 10: Verify the final-build P3 vertical slice

**Files:**
- Create: `tests/e2e/caphub-review-registry.spec.ts`
- Create: `tests/e2e/caphub-review-registry-fixtures.ts`
- Create: `playwright.caphub-review-registry.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: production build, sentinel-owned Caphub filesystem fixture, disposable PostgreSQL fixture, loopback-only TLS proxy.
- Produces: final-build browser evidence for queue, decision, Capture, Capability, concurrency, safe-off, and responsive behavior.

- [ ] **Step 1: Write the BDD scenarios and verify RED**

Scenarios:

```text
Given a completed fixture ReviewPacket imported into temporary PostgreSQL
When the owner opens /reviews and approves Candidate v1 with the exact phrase
Then one ReviewDecision and one audit event exist
And the job becomes reviewed with the same decision ID
And no release, build proposal, deployment, filesystem escape, or provider call exists
```

Add reject permanence, stale concurrent tab, same-intent retry, idempotency conflict, Registry disabled, Capture lineage, Candidate-only capability, hostile evidence text, 1440px and 390px order/overflow, keyboard/focus, reduced motion, WCAG AA, and console/network error checks.

Run: `npm run test:e2e:caphub-review-registry`

Expected: FAIL before the fixture/config is complete or before the production build contains P3 routes.

- [ ] **Step 2: Implement the sentinel-owned fixture harness**

The web server child receives only fixture `ALLJOBS_HOME`, fixture PostgreSQL socket config injected through a test-only runtime seam, and no provider credentials. Cleanup validates sentinel token and owner PID before stopping the local cluster and removing its own temporary root.

- [ ] **Step 3: Run focused E2E GREEN from a production build**

Run: `./node_modules/.bin/next build --webpack`

Run: `npm run test:e2e:caphub-review-registry`

Expected: PASS. Capture screenshots from this exact build at 1440px and 390px for waiting, approved-unconsumed, approved-consumed, revoked, superseded, same-request stale, Capture lineage, and Candidate-only Capability.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/caphub-review-registry.spec.ts tests/e2e/caphub-review-registry-fixtures.ts playwright.caphub-review-registry.config.ts package.json
git commit -m "test(caphub): verify P3 review registry flow"
```

---

### Task 11: Run P3-C review, verification, and evidence closeout

**Files:**
- Create: `.agent/caphub/p3-threat-model.md`
- Create: `.agent/caphub/p3-verification.md`
- Create: `.agent/frontend-design/caphub-review-registry/final-screens/*.png`
- Create: `.agent/frontend-design/caphub-review-registry/final-verification.md`
- Modify: `.agent/frontend-design/caphub-foundation/handoff.md`
- Modify: `docs/caphub-foundation.md`
- Modify: `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`
- Modify: `docs/superpowers/plans/2026-09-16-caphub-review-registry.md`

**Interfaces:**
- Consumes: final P3 implementation commit and exact final-build screenshots.
- Produces: focused independent Review/Verification, controller gates, Linear evidence, and a local evidence-only closeout commit.

- [x] **Step 1: Run the focused independent implementation review**

Review only P3 files plus directly modified P1/P2 config/storage/runtime files. Verify SQL injection resistance, role/migration separation, disabled-before-secret behavior, append-only enforcement, transaction/isolation semantics, stale/idempotency/revoke/consume rules, DTO minimization, UI confirmation copy, and zero Release/Build/deploy capability.

Threshold: zero blocker/high findings; resolve every medium or obtain explicit Human acceptance. Each fix gets one scoped re-review.

- [x] **Step 2: Run the independent P3-C verification**

Verify actual PostgreSQL constraints/triggers, real concurrent decisions, migration checksums, import parity, workflow suspend/resume, real decision route, final-build browser states, accessibility, screenshots, and exact commit boundary. Do not repeat the global review.

- [x] **Step 3: Run fresh controller gates**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `./node_modules/.bin/next build --webpack`

Run: `npm run test:e2e:caphub-review-registry`

Expected: all tests/typecheck/build/E2E PASS; lint has zero errors and no new P3 warnings. If the default Turbopack build cannot bind its sandbox worker port, record the environment failure separately and retain the successful webpack production build.

- [x] **Step 4: Record exact evidence and update Linear**

Record implementation commits, test counts, PostgreSQL version, migration digests, browser state matrix, screenshot hashes, independent verdicts, residual boundaries, and explicit confirmation that no real database/provider/source, production config, restart, deploy, push, merge, tag, or release occurred. Update `AGE-252` only after the local evidence commit exists.

- [x] **Step 5: Commit the evidence-only closeout**

```bash
git add .agent/caphub/p3-threat-model.md .agent/caphub/p3-verification.md .agent/frontend-design/caphub-review-registry/final-screens .agent/frontend-design/caphub-review-registry/final-verification.md .agent/frontend-design/caphub-foundation/handoff.md docs/caphub-foundation.md docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md docs/superpowers/plans/2026-09-16-caphub-review-registry.md
git diff --cached --check
git commit -m "docs(caphub): close P3 verification"
```

After this commit, stop before Gate P3-D. A production provider, credentials, backup/PITR choice, migration execution, service restart, deployment, traffic switch, push, merge, tag, or release requires fresh explicit Human authorization.

### P3-C completion record — 2026-09-16

Application implementation ends at `750efe3`; `bf734a5` strengthens the keyset proof. The controller phase gate passed 123 files / 1125 tests, typecheck, lint with zero errors and 66 pre-existing warnings, webpack production build, and P3 E2E 5/5. Per the Human-requested bounded-evidence rule, later review fixes reran only their affected tests: 3 files / 20 tests and 2/2 browser scenarios for server filtering, non-Candidate approval, and screenshot proof; then 2 query files / 7 tests against real PostgreSQL plus one exact-HEAD screenshot scenario for the complete keyset cursor. Independent final Review and Verification report zero blocker/high/medium findings. Evidence is frozen in `.agent/caphub/p3-verification.md`, `.agent/caphub/p3-threat-model.md`, and `.agent/frontend-design/caphub-review-registry/final-verification.md`.

Linear `AGE-252` is updated only after the local evidence closeout commit exists. No production database, provider/source, credential, configuration enablement, migration, restart, deployment, traffic switch, push, PR, merge, tag, or release is part of P3-C.

---

## Plan self-review checklist

- [x] Every P3 roadmap deliverable maps to Tasks 1–11.
- [x] PostgreSQL is proven with a real temporary server, not PGlite or an in-memory emulator.
- [x] Capture/job/artifact/audit contracts run against both filesystem and PostgreSQL adapters before authority can switch.
- [x] ReviewPacket import is serializable, digest-bound, idempotent, and repairable after post-commit pointer failure.
- [x] Review decisions are row-locked, append-only, actor-bound, confirmation-bound, stale-safe, and idempotent without automatic retry.
- [x] Reject remains permanent; revocation is append-only and unconsumed-only with exact phrases, original-decision linkage, and safe consumed recovery.
- [x] Approval cannot create Release, BuildProposal, handoff, publication, installation, Git mutation, or deployment.
- [x] Server Components return only explicit DTOs; Client Components never receive database rows, secrets, paths, object keys, prompts, or reasoning.
- [x] The complete Brief state matrix is covered by component tests and plan-specified final-build browser evidence.
- [x] Exact-file staging preserves Human-owned `AGENTS.md` and unrelated work.
- [x] P3-D remains a hard stop even if fixture implementation and P3-C pass.
