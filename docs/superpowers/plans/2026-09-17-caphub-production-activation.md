# Caphub P1–P4 Production Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the accepted Caphub P1–P4 flow on the single Control Host with a dedicated local PostgreSQL 17 Registry, bounded provider analysis, exact human reviews, and read-only package/adapter previews while every real export target remains disabled.

**Architecture:** Preserve immutable Capture objects below `ALLJOBS_HOME`, move active metadata to a Unix-socket-only local PostgreSQL cluster, and add fixed operator compositions for migration, analysis import, Release creation/finalization, backup, and readiness. Roll out through safe states S0–S4; provider calls, secrets, Production configuration, service reload, push/merge/release, and real targets remain explicit gates.

**Tech Stack:** Next.js 16.3.3 App Router, React 19, TypeScript 5, Zod 4, PostgreSQL 17, `pg` 8, Node.js filesystem/crypto/child-process APIs, launchd, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-caphub-production-activation-design.md`

## Global Constraints

- Base implementation on Production commit `50abeae8719f297a44955b076f9a9d7299f5abbe` in an isolated worktree; never touch the dirty main checkout.
- Upgrade `next` and `eslint-config-next` to exactly `16.3.3`; do not broaden the dependency update.
- Keep the application bound only to `127.0.0.1:3456`; do not change Tunnel, domain, Cloudflare Access, or the planning refresh worker.
- Keep PostgreSQL 17 local, Unix-socket-only, below resolved `ALLJOBS_HOME`, with database `caphub`, port `54329`, application role `caphub_app`, and migration role `caphub_migrator`.
- Preserve migrations `001_registry`, `002_read_models`, and `003_exports` byte-for-byte; production evolution is forward-only.
- Keep Capture objects local and immutable. Filesystem-to-PostgreSQL migration never rewrites or deletes source records, indexes, events, or objects.
- Use MiniMax M3 for extraction/critic and Kimi Coding API `https://api.kimi.com/coding/v1` model `k3-256k` for research/assessment. Register no tools and make no automatic retries.
- Analysis is explicit and operator-started. Browser Capture, page load, launchd, and refresh workers never start it.
- Enable only P4 neutral package and adapter previews. Obsidian, package repository, Codex, Claude, and Hermes target switches remain false without roots or aliases.
- Do not implement P5/P6, self-built capabilities, source search, automatic approval, Deployment planning, publish, install, rollback writes, Git operations, or code execution.
- Use TDD for features/defects and BDD for PostgreSQL, filesystem, CLI, provider, route, and browser boundaries.
- Run focused checks per task. Run one full phase gate, one scoped independent Review, and one independent Verification after the final implementation commit; do not repeat global review/test batches at every task.
- Stop at PA-B for real database/LaunchAgent/config/secret changes, PA-C for each real provider request, and PA-D for push/merge/release/rebuild/reload/cutover.

---

## File structure

| Path | Responsibility |
|---|---|
| `lib/caphub/registry/connection.ts` | Validate local-socket or TLS Registry URLs and build bounded pool options |
| `lib/caphub/registry/operations.ts` | Migration pool, checksum/readiness report, fixed role/privilege checks |
| `lib/caphub/registry/filesystem-import.ts` | Read-only filesystem inventory and idempotent Capture/audit import |
| `lib/caphub/operations/backup.ts` | Non-destructive database + state backup generation and restore verification |
| `lib/caphub/service/production-workflow.ts` | Analysis → ReviewPacket import composition |
| `lib/caphub/releases/runtime.ts` | Production-safe Release compose/finalize composition |
| `scripts/caphub-postgres.ts` | Fixed check/bootstrap/migrate operator CLI |
| `scripts/caphub-registry-import.ts` | Dry-run/apply filesystem Capture import CLI |
| `scripts/caphub-backup.ts` | Create/verify backup generations without pruning |
| `scripts/caphub-release.ts` | Compose/finalize exact approved Releases |
| `scripts/caphub-production-preflight.ts` | Read-only S0–S4 readiness report with no secret values |
| `deploy/com.agentjoey.alljobs-caphub-postgres.plist` | Repository template for the local PostgreSQL LaunchAgent |
| `deploy/caphub-postgres/*.example` | Fixed Unix-socket-only PostgreSQL configuration templates |
| `tests/e2e/caphub-production-pilot-*` | One Production-like P1–P4 lifecycle fixture and browser suite |
| `.agent/caphub/production-activation-*.md` | Implementation, threat, review, verification, and cutover evidence |

---

### Task 0: Establish the activation branch and security floor

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.agent/caphub/production-activation-log.md`

**Interfaces:**
- Consumes: Production baseline `50abeae8719f297a44955b076f9a9d7299f5abbe`.
- Produces: an isolated clean branch resolving `next@16.3.3` and `eslint-config-next@16.3.3`.

- [ ] **Step 1: Record the exact isolated baseline**

Write the branch, worktree, base SHA, Node/npm/PostgreSQL versions, clean status,
and scope boundary into `production-activation-log.md`. Record that no Production
config, database, secret, provider, service, push, merge, deploy, or target was
changed.

- [ ] **Step 2: Upgrade only the security-pinned packages**

Run:

```bash
npm install --save-exact next@16.3.3 eslint-config-next@16.3.3
```

Verify `package.json` contains:

```json
{
  "dependencies": { "next": "16.3.3" },
  "devDependencies": { "eslint-config-next": "16.3.3" }
}
```

- [ ] **Step 3: Run focused framework regression checks**

Run:

```bash
npm test -- app/api/caphub/captures/route.test.ts 'app/api/caphub/captures/[id]/route.test.ts' 'app/api/caphub/reviews/[id]/decisions/route.test.ts' scripts/verify-deployment-config.test.ts
npm run typecheck
npm run build
npm run verify:deploy
```

Expected: focused tests pass, typecheck exits `0`, Production build passes, and
the loopback deployment invariant remains valid. Do not run the full suite yet.

- [ ] **Step 4: Commit the security floor**

```bash
git add package.json package-lock.json .agent/caphub/production-activation-log.md
git commit -m "chore(caphub): establish production activation security floor"
```

---

### Task 1: Add strict local-socket Registry connections

**Files:**
- Create: `lib/caphub/registry/connection.ts`
- Create: `lib/caphub/registry/connection.test.ts`
- Modify: `lib/caphub/registry/runtime.ts`
- Modify: `lib/caphub/registry/runtime.test.ts`
- Modify: `lib/planning/config.ts`
- Modify: `lib/planning/config.test.ts`
- Modify: `config/alljobs.example.json`

**Interfaces:**
- Consumes: `ControlHostResolvedPaths`, `CAPHUB_DATABASE_URL`, existing Registry runtime.
- Produces: `RegistryConnectionMode`, `parseRegistryConnection`, and bounded pool options for app or migration roles.

- [ ] **Step 1: Write failing configuration and URL-policy tests**

Add tests for these exact defaults and rejections:

```ts
expect(controlHostCaphubRegistryConfigSchema.parse({})).toMatchObject({
  enabled: false,
  connectionMode: "tls_verify_full",
  databaseUrlEnv: "CAPHUB_DATABASE_URL",
  migrationDatabaseUrlEnv: "CAPHUB_MIGRATION_DATABASE_URL",
  maxConnections: 4,
  statementTimeoutMs: 5000
});
```

For `local_socket`, accept only URLs equivalent to:

```text
postgresql://caphub_app@localhost/caphub?host=%2Fresolved%2Falljobs%2Fhome%2Frun%2Fcaphub-postgres&port=54329
```

Reject passwords, TCP hosts, alternate socket paths, roles, databases, ports,
unknown query keys, `sslmode`, symlinks, missing/private-directory violations,
and migration URLs used as application URLs. For `tls_verify_full`, reject
localhost, IP literals, URL TLS overrides, and passwords embedded in browser-
visible/config values.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- lib/planning/config.test.ts lib/caphub/registry/connection.test.ts lib/caphub/registry/runtime.test.ts
```

Expected: FAIL because `connectionMode`, the migration env reference, and the
connection policy do not exist.

- [ ] **Step 3: Implement the strict connection contract**

Define:

```ts
export type RegistryConnectionMode = "local_socket" | "tls_verify_full";

export interface ParsedRegistryConnection {
  host: string;
  port: number;
  database: "caphub";
  user: "caphub_app" | "caphub_migrator";
  ssl: false | { rejectUnauthorized: true };
}

export function parseRegistryConnection(input: {
  databaseUrl: string;
  mode: RegistryConnectionMode;
  role: "application" | "migration";
  resolvedHome: string;
}): ParsedRegistryConnection;
```

`local_socket` derives the only allowed host with
`join(resolvedHome, "run", "caphub-postgres")`, validates its owned canonical
directory, and uses `ssl: false`. `tls_verify_full` requires TLS certificate
verification and remains the future Neon/managed-provider path. The runtime
passes parsed fields to `pg.Pool`; it does not pass an unvalidated connection
string through.

Keep the existing sentinel-owned E2E socket exception isolated to the existing
fixture contract; it must not broaden Production URL acceptance.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- lib/planning/config.test.ts lib/caphub/registry/connection.test.ts lib/caphub/registry/runtime.test.ts
npm run typecheck
```

Expected: focused tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/registry/connection.ts lib/caphub/registry/connection.test.ts lib/caphub/registry/runtime.ts lib/caphub/registry/runtime.test.ts lib/planning/config.ts lib/planning/config.test.ts config/alljobs.example.json
git commit -m "feat(caphub): support bounded local registry sockets"
```

---

### Task 2: Add local PostgreSQL bootstrap, migration, and readiness operations

**Files:**
- Create: `lib/caphub/registry/operations.ts`
- Create: `lib/caphub/registry/operations.test.ts`
- Create: `scripts/caphub-postgres.ts`
- Create: `scripts/caphub-postgres.test.ts`
- Create: `deploy/com.agentjoey.alljobs-caphub-postgres.plist`
- Create: `deploy/caphub-postgres/postgresql.conf.example`
- Create: `deploy/caphub-postgres/pg_hba.conf.example`
- Create: `deploy/caphub-postgres/pg_ident.conf.example`
- Modify: `package.json`
- Modify: `scripts/verify-deployment-config.mjs`
- Modify: `scripts/verify-deployment-config.test.ts`

**Interfaces:**
- Consumes: `parseRegistryConnection`, `applyRegistryMigrations`, migration manifest.
- Produces: `checkRegistryReadiness`, fixed `caphub:postgres` CLI, secure launchd/config templates.

- [ ] **Step 1: Write failing pure and CLI tests**

Define the report shape:

```ts
export interface RegistryReadinessReport {
  postgresVersion: string;
  connectionMode: "local_socket" | "tls_verify_full";
  tcpListenAddresses: string;
  database: "caphub";
  appRole: "caphub_app";
  migratorRole: "caphub_migrator";
  appliedMigrations: Array<{ id: string; checksum: string }>;
  pendingMigrations: string[];
  appCanMigrate: false;
  appCanUpdateAppendOnly: false;
  ready: boolean;
}
```

Test `--check` as read-only; `--bootstrap` requires the exact confirmation
`BOOTSTRAP-CAPHUB-POSTGRES`; `--migrate` requires
`APPLY-CAPHUB-MIGRATIONS`; raw URL/path/SQL flags are rejected. Test that
bootstrap refuses an existing non-empty, symlinked, foreign-owned, or broadly
writable data/socket directory and never removes partial state.

- [ ] **Step 2: Verify RED**

```bash
npm test -- lib/caphub/registry/operations.test.ts scripts/caphub-postgres.test.ts scripts/verify-deployment-config.test.ts
```

Expected: FAIL with missing modules/scripts/templates.

- [ ] **Step 3: Implement fixed operations**

Use `execFile`, never a shell string, for the fixed trusted PostgreSQL 17
binaries. Bootstrap derives:

```ts
const dataDir = join(resolved.homeDir, "postgres", "caphub");
const socketDir = join(resolved.homeDir, "run", "caphub-postgres");
const port = 54329;
```

It initializes only a previously absent/empty owned target, configures
`listen_addresses = ''`, `unix_socket_permissions = 0700`, the exact socket
directory/port, peer mappings for the fixed roles, and a default reject rule.
It creates `caphub_migrator`, `caphub_app`, and database `caphub`; migrations
run only through the migrator pool. Application grants are the minimum required
by migrations 001–003.

`--check` verifies PostgreSQL 17, empty TCP `listen_addresses`, exact socket,
role membership, privilege separation, migration IDs/checksums, append-only
protection, and bounded connection settings without printing URLs or secrets.

- [ ] **Step 4: Add deployment-template invariants**

The committed LaunchAgent must invoke PostgreSQL with the dedicated data
directory and log below `~/Library/Logs/alljobs/`. The example configuration
must contain:

```conf
listen_addresses = ''
port = 54329
unix_socket_permissions = 0700
```

Extend `verify:deploy` so missing loopback binding, a database TCP listener,
world-readable socket intent, or a non-fixed Production command fails.

- [ ] **Step 5: Verify GREEN with a temporary cluster only**

```bash
npm test -- lib/caphub/registry/operations.test.ts scripts/caphub-postgres.test.ts scripts/verify-deployment-config.test.ts lib/caphub/registry/migrate.test.ts
npm run typecheck
npm run verify:deploy
```

Expected: all focused checks pass against a sentinel-owned temporary PostgreSQL
17 cluster. Do not run bootstrap/migrate against Production.

- [ ] **Step 6: Commit**

```bash
git add lib/caphub/registry/operations.ts lib/caphub/registry/operations.test.ts scripts/caphub-postgres.ts scripts/caphub-postgres.test.ts deploy/com.agentjoey.alljobs-caphub-postgres.plist deploy/caphub-postgres package.json scripts/verify-deployment-config.mjs scripts/verify-deployment-config.test.ts
git commit -m "feat(caphub): add local registry operations"
```

---

### Task 3: Migrate existing filesystem Captures without source mutation

**Files:**
- Create: `lib/caphub/registry/filesystem-import.ts`
- Create: `lib/caphub/registry/filesystem-import.test.ts`
- Create: `lib/caphub/registry/filesystem-import.behavior.test.ts`
- Create: `scripts/caphub-registry-import.ts`
- Create: `scripts/caphub-registry-import.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: resolved Caphub root, `FilesystemCaptureStore`, P1 schemas/path rules, PostgreSQL Capture/audit stores.
- Produces: `planFilesystemCaptureImport`, `applyFilesystemCaptureImport`, `CaptureImportManifestV1`.

- [ ] **Step 1: Write failing inventory/import tests**

Define:

```ts
export interface CaptureImportManifestV1 {
  schema_version: 1;
  source_digest: string;
  captures: Array<{
    capture_id: string;
    capture_digest: string;
    event_id: string;
    object_digest: string;
    object_bytes: number;
  }>;
  counts: { captures: number; events: number; objects: number };
}
```

Cover exact idempotent re-run, Capture/index mismatch, duplicate/conflicting
idempotency key, missing/conflicting audit event, partial/malformed event tail,
missing/tampered object, unindexed Capture, unreferenced object, symlink,
foreign owner, unsafe mode, source change between plan/apply, PostgreSQL exact
row already present, and PostgreSQL digest conflict.

- [ ] **Step 2: Verify RED**

```bash
npm test -- lib/caphub/registry/filesystem-import.test.ts lib/caphub/registry/filesystem-import.behavior.test.ts scripts/caphub-registry-import.test.ts
```

Expected: FAIL because the importer and CLI do not exist.

- [ ] **Step 3: Implement read-only planning and exact apply**

Export:

```ts
export async function planFilesystemCaptureImport(input: {
  root: string;
}): Promise<CaptureImportManifestV1>;

export async function applyFilesystemCaptureImport(input: {
  root: string;
  expectedSourceDigest: string;
  captures: CaptureStore;
  audit: CaptureAuditLog;
}): Promise<{ created: number; existing: number; sourceDigest: string }>;
```

The planner uses bounded secure directory enumeration and rereads every
referenced byte. Apply replans under the same stopped-writer boundary, compares
`expectedSourceDigest`, then writes through existing PostgreSQL stores. Exact
existing data counts as `existing`; any mismatch aborts. Source files remain
read-only and unchanged.

The CLI default is `--dry-run`. Apply requires `--apply`, the exact manifest
digest, and confirmation `IMPORT-CAPHUB-CAPTURES`. It rejects root/database URL
arguments and resolves both from Control Host composition.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- lib/caphub/registry/filesystem-import.test.ts lib/caphub/registry/filesystem-import.behavior.test.ts scripts/caphub-registry-import.test.ts lib/caphub/registry/postgres/caphub-stores.test.ts
npm run typecheck
```

Expected: unit/real-PostgreSQL behavior tests and typecheck pass. Production
state is not read or changed.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/registry/filesystem-import.ts lib/caphub/registry/filesystem-import.test.ts lib/caphub/registry/filesystem-import.behavior.test.ts scripts/caphub-registry-import.ts scripts/caphub-registry-import.test.ts package.json
git commit -m "feat(caphub): add immutable capture registry import"
```

---

### Task 4: Add non-destructive local backup and restore verification

**Files:**
- Create: `lib/caphub/operations/backup.ts`
- Create: `lib/caphub/operations/backup.test.ts`
- Create: `lib/caphub/operations/backup.behavior.test.ts`
- Create: `scripts/caphub-backup.ts`
- Create: `scripts/caphub-backup.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: migration connection, complete Caphub state root, trusted PostgreSQL 17 tools.
- Produces: immutable `CaphubBackupManifestV1`, `createCaphubBackup`, and `verifyCaphubBackup`.

- [ ] **Step 1: Write failing backup safety tests**

Define:

```ts
export interface CaphubBackupManifestV1 {
  schema_version: 1;
  generation_id: string;
  database_dump_sha256: string;
  database_dump_bytes: number;
  state_manifest_sha256: string;
  registry_counts: Record<string, number>;
  migration_checksums: Array<{ id: string; checksum: string }>;
  created_at: string;
}

export interface BackupDependencies {
  resolvedHome: string;
  stateRoot: string;
  migrationConnection: ParsedRegistryConnection;
  clock(): Date;
  runPgDump(args: readonly string[]): Promise<void>;
}

export interface RestoreVerificationDependencies {
  resolvedHome: string;
  generationId: string;
  startTemporaryPostgres(): Promise<{
    restoreDatabase(dumpPath: string): Promise<void>;
    queryCounts(): Promise<Record<string, number>>;
    stop(): Promise<void>;
  }>;
}
```

Test database-dump-first ordering, fixed `pg_dump -Fc` arguments, no shell,
atomic generation publication, complete state copy, owner/mode/symlink checks,
hash manifest, failed/partial generation invisibility, immutable existing
generation conflict, no pruning, no source writes, and restore verification in
an owned temporary cluster/root.

- [ ] **Step 2: Verify RED**

```bash
npm test -- lib/caphub/operations/backup.test.ts lib/caphub/operations/backup.behavior.test.ts scripts/caphub-backup.test.ts
```

Expected: FAIL with missing backup module and CLI.

- [ ] **Step 3: Implement create/verify only**

Export:

```ts
export async function createCaphubBackup(input: BackupDependencies): Promise<CaphubBackupManifestV1>;
export async function verifyCaphubBackup(input: RestoreVerificationDependencies): Promise<CaphubBackupManifestV1>;
```

The fixed backup root is `join(resolved.homeDir, "backups", "caphub")`. `--create` writes a
new generation; `--verify GENERATION_ID` restores into new sentinel-owned
temporary resources and compares schema ledger, Registry kind counts, Capture
digests, lineage/review/audit counts, and every referenced object hash. Neither
mode deletes or prunes a generation.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- lib/caphub/operations/backup.test.ts lib/caphub/operations/backup.behavior.test.ts scripts/caphub-backup.test.ts
npm run typecheck
```

Expected: focused tests and isolated restore drill pass.

- [ ] **Step 5: Commit**

```bash
git add lib/caphub/operations/backup.ts lib/caphub/operations/backup.test.ts lib/caphub/operations/backup.behavior.test.ts scripts/caphub-backup.ts scripts/caphub-backup.test.ts package.json
git commit -m "feat(caphub): add verified local backups"
```

---

### Task 5: Wire analysis import and Release operations

**Files:**
- Create: `lib/caphub/service/production-workflow.ts`
- Create: `lib/caphub/service/production-workflow.test.ts`
- Create: `lib/caphub/service/production-workflow.behavior.test.ts`
- Modify: `lib/caphub/service/analyze-runtime.ts`
- Modify: `scripts/caphub-analyze.ts`
- Modify: `scripts/caphub-analyze.test.ts`
- Create: `lib/caphub/releases/runtime.ts`
- Create: `lib/caphub/releases/runtime.test.ts`
- Create: `scripts/caphub-release.ts`
- Create: `scripts/caphub-release.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `AnalysisService`, `createReviewPacketImporter`, `ReleaseService`, Registry runtime.
- Produces: `ProductionAnalysisWorkflow.startAndImport`, `loadControlHostReleaseService`, compose/finalize CLI.

- [ ] **Step 1: Write failing analysis/import BDD**

Define:

```ts
export interface ProductionAnalysisResult {
  captureId: string;
  jobId: string;
  analysisStatus: string;
  reviewPacketArtifactId: string | null;
  reviewRequestId: string | null;
}

export interface ProductionAnalysisWorkflow {
  startAndImport(captureId: string, signal?: AbortSignal): Promise<ProductionAnalysisResult>;
}
```

Test successful analysis/import, completed-analysis retry after import failure
without another provider call, exact idempotent import retry, human-review
terminal status without import, Registry-disabled failure before provider call,
and metadata-only output.

- [ ] **Step 2: Write failing Release runtime/CLI tests**

Test:

```ts
await service.createCandidate({ candidateId, approvalDecisionId, learnKind });
await service.finalizeApproval({ releaseId, approvalDecisionId });
```

Cover `adopt`, `adapt`, and `learn`; reject `build`, `watch`, rejected/revoked/
stale/wrong-subject decisions; exact retry; approval consumption; separate
Release review; finalization; targets still disabled; and no Deployment row,
filesystem write, provider call, Git action, or publish.

The CLI accepts only:

```text
--compose --candidate CANDIDATE_ID --decision DECISION_ID [--learn-kind experience_card|reference]
--finalize --release RELEASE_ID --decision DECISION_ID
```

It rejects raw paths, roots, URLs, SQL, target names, publish, install, and
rollback flags.

- [ ] **Step 3: Verify RED**

```bash
npm test -- lib/caphub/service/production-workflow.test.ts lib/caphub/service/production-workflow.behavior.test.ts scripts/caphub-analyze.test.ts lib/caphub/releases/runtime.test.ts scripts/caphub-release.test.ts
```

Expected: FAIL because Production composition and Release CLI are absent.

- [ ] **Step 4: Implement minimal fixed composition**

`loadControlHostAnalysisService` continues to construct the accepted providers
and stores. A new loader constructs the importer from the same Registry pool,
Capture store, job store, artifact store, and clock. `startAndImport` calls the
importer only after a completed ReviewPacket exists.

`loadControlHostReleaseService` composes the existing PostgreSQL record,
lineage, review, export, and artifact stores. It exposes only create/finalize;
it does not expose deployment planning or publication.

- [ ] **Step 5: Verify GREEN**

```bash
npm test -- lib/caphub/service/production-workflow.test.ts lib/caphub/service/production-workflow.behavior.test.ts scripts/caphub-analyze.test.ts lib/caphub/releases/runtime.test.ts scripts/caphub-release.test.ts lib/caphub/registry/import-review-packet.behavior.test.ts lib/caphub/releases/release-candidate.behavior.test.ts
npm run typecheck
```

Expected: focused unit/BDD tests and typecheck pass with fixture providers and
temporary PostgreSQL only.

- [ ] **Step 6: Commit**

```bash
git add lib/caphub/service/production-workflow.ts lib/caphub/service/production-workflow.test.ts lib/caphub/service/production-workflow.behavior.test.ts lib/caphub/service/analyze-runtime.ts scripts/caphub-analyze.ts scripts/caphub-analyze.test.ts lib/caphub/releases/runtime.ts lib/caphub/releases/runtime.test.ts scripts/caphub-release.ts scripts/caphub-release.test.ts package.json
git commit -m "feat(caphub): wire production review and release flow"
```

---

### Task 6: Prove the complete P1–P4 pilot flow once

**Files:**
- Create: `tests/e2e/caphub-production-pilot-fixtures.ts`
- Create: `tests/e2e/caphub-production-pilot.spec.ts`
- Create: `playwright.caphub-production-pilot.config.ts`
- Modify: `package.json`
- Create: `.agent/caphub/production-activation-state-matrix.md`
- Create: `.agent/caphub/production-activation-screenshots/README.md`

**Interfaces:**
- Consumes: Tasks 1–5, existing Capture/review routes and P4 read-only UI.
- Produces: `test:e2e:caphub-production-pilot`, final-build desktop/mobile screenshot procedure, state matrix.

- [ ] **Step 1: Write the failing cross-boundary scenario**

The fixture creates one owned temporary `ALLJOBS_HOME`, one real temporary
PostgreSQL 17 cluster, one existing filesystem Capture to migrate, fixture-only
MiniMax/Kimi adapters, and no real target roots or credentials.

The scenario must prove in order:

1. dry-run and apply import preserve the filesystem source;
2. `/caphub` creates a new immutable Capture in PostgreSQL with a local object;
3. explicit analysis creates artifacts once and imports one Candidate review;
4. `/reviews` displays the exact Candidate and accepts one typed decision;
5. Release composition creates a distinct Release review;
6. Release approval and finalization are exact and idempotent;
7. `/capabilities/CANDIDATE_ID` shows the neutral manifest and three adapter
   previews;
8. all target states remain disabled and no target root/pointer/deployment
   exists; and
9. backup creation and isolated restore verification preserve counts/digests.

- [ ] **Step 2: Verify RED**

```bash
npm run test:e2e:caphub-production-pilot
```

Expected: FAIL before the fixture/harness is complete.

- [ ] **Step 3: Implement the isolated harness and state matrix**

Use an unguessable sentinel, owner PID, exact temp-root containment, loopback
port separate from Production, fixed provider fixtures, and `reuseExistingServer:
false`. Cleanup revalidates sentinel/owner before stopping the temporary cluster
and removing only its exact temporary root.

The state matrix covers S0–S4 plus disabled, unavailable, provider failure,
source blocked, migration conflict, stale review, approved/unfinalized,
approved/finalized, unsupported adapter, and targets-disabled states.

- [ ] **Step 4: Verify GREEN and capture final-build evidence**

```bash
npm run build
npm run test:e2e:caphub-production-pilot
```

The Playwright scenario records `reviews-1440.png` at a 1440 CSS-pixel viewport,
then navigates to the Candidate ID returned by the import flow and records
`capability-390.png` with true 390 CSS-pixel device metrics. Expected: the
focused E2E suite passes; screenshots come from the same final build, have no
absolute paths/secrets, and show no publish action.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/caphub-production-pilot-fixtures.ts tests/e2e/caphub-production-pilot.spec.ts playwright.caphub-production-pilot.config.ts package.json .agent/caphub/production-activation-state-matrix.md .agent/caphub/production-activation-screenshots
git commit -m "test(caphub): prove production pilot lifecycle"
```

---

### Task 7: Add preflight, runbook, and exact rollback evidence

**Files:**
- Create: `scripts/caphub-production-preflight.ts`
- Create: `scripts/caphub-production-preflight.test.ts`
- Modify: `package.json`
- Modify: `docs/operations.md`
- Modify: `docs/deployment.md`
- Modify: `docs/architecture.md`
- Modify: `docs/caphub-foundation.md`
- Modify: `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`
- Modify: `.agent/CURRENT.md`
- Create: `.agent/caphub/production-activation-threat-model.md`
- Create: `.agent/caphub/production-activation-runbook.md`

**Interfaces:**
- Consumes: all activation contracts and gates.
- Produces: one metadata-only preflight report and one operator runbook for S0–S4/rollback.

- [ ] **Step 1: Write failing preflight tests**

The report contains only booleans, versions, IDs, counts, digests, aliases, and
safe codes:

```ts
export interface ProductionPreflightReport {
  buildSha: string;
  nextVersion: "16.3.3";
  appLoopbackOnly: boolean;
  postgres: RegistryReadinessReport;
  captureImport: { sourceDigest: string; captureCount: number; matchesRegistry: boolean };
  backup: { generationId: string | null; verified: boolean };
  providers: { minimaxConfigured: boolean; kimiConfigured: boolean; kimiLiveCompatibility: "pending" | "passed" | "failed" };
  exports: { masterEnabled: boolean; enabledTargets: string[] };
  readyFor: "PA_B" | "PA_C" | "PA_D" | "S3" | "S4";
}
```

Tests prove preflight never prints environment values, URLs with credentials,
socket/data/object/backup absolute paths, Capture bytes, prompts, raw provider
responses, or target roots. `enabledTargets` must be empty for this pilot.

- [ ] **Step 2: Verify RED**

```bash
npm test -- scripts/caphub-production-preflight.test.ts
```

Expected: FAIL because the preflight script is absent.

- [ ] **Step 3: Implement preflight and runbook**

The CLI is read-only and has no mutation flag. The runbook records exact
commands and expected safe results for:

- S0 inventory;
- S1 stop-writer confirmation and source backup;
- PA-B local cluster bootstrap, migration, Capture dry-run/apply, and restore
  drill;
- S2 Registry-only verification;
- S3 Capture + Review + P4 preview with all targets disabled;
- PA-C single Kimi compatibility canary and first real analysis;
- S4 one complete third-party capability pilot;
- provider/Registry failure containment; and
- code/config/database rollback without deletion.

Document that an official source URL and exact origin are runtime Human inputs;
they are not defaults. Update roadmap/CURRENT only with implemented facts and
still-open gates.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- scripts/caphub-production-preflight.test.ts scripts/verify-deployment-config.test.ts
npm run typecheck
npm run verify:deploy
git diff --check
```

Expected: focused checks and documentation whitespace validation pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/caphub-production-preflight.ts scripts/caphub-production-preflight.test.ts package.json docs/operations.md docs/deployment.md docs/architecture.md docs/caphub-foundation.md docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md .agent/CURRENT.md .agent/caphub/production-activation-threat-model.md .agent/caphub/production-activation-runbook.md
git commit -m "docs(caphub): define production activation operations"
```

---

### Task 8: Run one final implementation gate and scoped acceptance

**Files:**
- Modify: `.agent/caphub/production-activation-log.md`
- Create: `.agent/caphub/production-activation-review.md`
- Create: `.agent/caphub/production-activation-verification.md`
- Modify: `.agent/caphub/production-activation-threat-model.md`

**Interfaces:**
- Consumes: final candidate commit from Tasks 0–7.
- Produces: one exact-SHA implementation acceptance packet; no Production mutation.

- [ ] **Step 1: Run the single full phase gate from a clean tree**

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run verify:deploy
npm run test:e2e:caphub-production-pilot
git status --short --branch
git diff --check
```

Record exact test counts, lint errors/warnings, build result, PostgreSQL/Node/npm
versions, migration IDs/checksums, duration, SHA, and screenshot hashes. Any
failure is blocking; do not describe a failed/unrun check as passed.

- [ ] **Step 2: Run one scoped independent Review**

Review only the activation diff and touched trust boundaries:

- local socket/TCP exclusion and DB role separation;
- migration/app privilege separation and checksum enforcement;
- source-preserving Capture import;
- provider no-tool/no-retry/secret boundary;
- analysis import and Release authority consumption;
- backup/restore consistency;
- target-disabled P4 preview boundary; and
- rollback/non-deletion behavior.

Do not re-review unrelated Planning Core or accepted P1–P4 internals. Fix all
blocker/high/medium findings, then run one fix-only re-review if needed.

- [ ] **Step 3: Run one independent Verification**

Bind Verification to the exact final commit/build and acceptance criteria in the
spec. Reuse Task 8 full-gate evidence; rerun only a command whose result is
missing, stale, contradicted, or directly affected by a review fix.

- [ ] **Step 4: Commit final evidence**

```bash
git add .agent/caphub/production-activation-log.md .agent/caphub/production-activation-review.md .agent/caphub/production-activation-verification.md .agent/caphub/production-activation-threat-model.md
git commit -m "docs(caphub): close activation implementation gate"
```

- [ ] **Step 5: Verify commit boundary**

```bash
git status --short --branch
git log -1 --stat
git diff --stat 50abeae8719f297a44955b076f9a9d7299f5abbe...HEAD
```

Expected: clean tree and only activation-scope files. Stop before any push,
merge, release, real database/config/secret/provider/service action.

---

### Task 9: Execute the Human-gated Production rollout

**Files:**
- Modify after execution: `.agent/caphub/production-activation-cutover.md`
- Modify after execution: `.agent/CURRENT.md`
- Modify after execution: `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`

**Interfaces:**
- Consumes: exact accepted commit/build, PA-B/PA-C/PA-D authorizations, one Human-selected official source URL/origin.
- Produces: S3 or S4 Production evidence. S3 is a valid safe terminal state if Kimi compatibility fails.

- [ ] **Step 1: Stop at PA-B and obtain explicit authorization**

Report the accepted SHA, database paths as redacted aliases, PostgreSQL version,
migration checksums, current Capture inventory count/digest, intended LaunchAgent
changes, backup destination status, and rollback build. Do not expose secret
values or proceed without authorization.

- [ ] **Step 2: Bootstrap and migrate the real local Registry**

After PA-B approval, run the fixed `caphub:postgres` bootstrap/check/migrate
commands from the accepted build. Install/start only
`com.agentjoey.alljobs-caphub-postgres`. Verify no TCP listener, exact Unix
socket, roles, grants, and checksums.

- [ ] **Step 3: Create and verify the pre-cutover backup**

Create one backup generation, ensure its off-host/Time Machine coverage, and run
the isolated restore verifier. A failed backup or restore blocks cutover.

- [ ] **Step 4: Dry-run and apply the existing Capture import**

Keep application writes stopped. Record the dry-run source digest, apply using
that exact digest and typed confirmation, rerun dry-run/readiness, and compare
filesystem/PostgreSQL IDs and digests. Preserve every source byte.

- [ ] **Step 5: Stop at PA-D and obtain exact cutover authorization**

Name the accepted commit/build, verified backup generation, migration checksums,
import digest/counts, S2/S3 configuration diff, installed LaunchAgent changes,
and rollback build. Push/merge/release, if needed, must be authorized explicitly
in the same or a separate decision.

- [ ] **Step 6: Enter S2, then S3**

Rebuild/reload only the AllJobs listener using the authorized exact commit.
First enable Registry with Capture/analysis/exports safe-off and verify migrated
reads. Then enable Capture and the exports master while every target remains
false. Verify:

```text
/caphub                         200 and Capture ready
/reviews                       200 and Registry ready
/captures/MIGRATED_CAPTURE_ID       200 and exact migrated metadata
/capabilities/CANDIDATE_ID          disabled or no-release safe state
```

Keep analysis disabled. Confirm Tunnel/Access/domain/refresh worker unchanged.

- [ ] **Step 7: Stop at PA-C for the live Kimi canary**

After authorization, run exactly one synthetic/non-sensitive `k3-256k`
compatibility request with no tools and no retry. Record metadata only. If it
fails or is uncertain, leave Production at S3, keep analysis disabled, and stop.

- [ ] **Step 8: Enter S4 and run one real third-party capability pilot**

Only after the Kimi canary passes, add the one approved exact official source
origin, enable analysis, and reload only the AllJobs listener. The Human Owner
creates one new Capture with a source URL under that origin. Run analysis once,
review the exact Candidate in `/reviews`, compose a Release only for
`adopt|adapt|learn`, review/finalize that Release, and verify neutral package plus
Codex/Claude/Hermes previews. Do not create a Deployment plan or enable a target.

- [ ] **Step 9: Record Production evidence and Linear status**

Record exact SHA/build, safe configuration state, database version/checksums,
backup/restore generation, import counts/digests, provider/model metadata,
Capture/job/request/Candidate/Release IDs, review decisions/consumptions,
screenshots, route smoke, logs checked, rollback result, and remaining gates.
Update the Caphub roadmap/backlog Linear issue once with the same bounded facts;
do not post per-test heartbeats.

- [ ] **Step 10: Apply the rollback rule if any gate fails**

Disable analysis/Registry/exports, restore the prior config/build, reload only
the AllJobs listener, and preserve PostgreSQL, backups, and the Caphub state root
unchanged. Do not delete, down-migrate, prune, publish, alter Tunnel/Access, or
retry an uncertain provider request.
