# Caphub Neon Production Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Caphub Registry metadata and immutable Capture objects from the stopped Control Host's local storage boundary to the approved Neon `production` branch and private `caphub-objects` bucket, without enabling any unapproved capability.

**Architecture:** The application keeps the existing PostgreSQL ports and Capture object key contract. `tls_verify_full` is narrowed to the configured Neon hostnames and the S3 adapter is an explicitly configured, path-style AWS SDK client that verifies every immutable object after writes and reads. A manifest-bound transfer copies and verifies local objects before any Registry import; a verified Neon recovery branch is a production cutover prerequisite rather than an application runtime feature.

**Tech Stack:** Next.js 16.3.3, TypeScript 5, PostgreSQL/`pg`, `@aws-sdk/client-s3`, Neon Postgres, Neon Object Storage (private S3-compatible bucket), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-caphub-neon-production-activation-design.md`

## Global Constraints

- The real target is Neon project `lingering-term-10256714`, primary branch `br-shiny-mode-b3z6ezub` (`production`) in `aws-ap-southeast-1`; do not replace this verified fact with obsolete region assumptions.
- `caphub-objects` is private and immutable after creation. Browser clients never receive S3 credentials or public object URLs.
- The only Capture object key is `sha256/<first-two-digest-characters>/<full-sha256-digest>`; objects are never overwritten, deleted, repointed, or pruned.
- Application connections use only `caphub_app`; migration/provisioning connections use only `caphub_migrator`; both use TLS verification and exact configured Neon hosts.
- `CAPHUB_DATABASE_URL`, `CAPHUB_MIGRATION_DATABASE_URL`, and Object Storage credential values stay in private LaunchAgent environment entries. Source, tests, logs, screenshots, and docs contain names, aliases, digests, counts, and IDs only.
- Keep the Production app stopped through N0–N4. No provider call, target export, P5/P6 capability, app reload, push, merge, release, deletion, or change to the local Capture tree belongs to this plan.
- N1 requires a fresh explicit Human authorization immediately before any Production Neon write or secret/network configuration change. N4 still requires PA-D before an application cutover.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/planning/config.ts` | Strict, non-secret Neon Registry/Object Storage configuration and exact environment-variable references. |
| `lib/caphub/registry/connection.ts` | Parse only approved app/migrator Neon connection URLs with verified TLS. |
| `lib/caphub/storage/neon-s3.ts` | S3 command port, strict environment parser, path-style client factory, immutable read/write/list adapter. |
| `lib/caphub/storage/neon-s3.test.ts` | Adapter and credential-policy unit tests with a fake command port; no remote calls. |
| `lib/caphub/storage/contracts.ts` | Separate readable immutable-object port without weakening Capture writes. |
| `lib/caphub/storage/transfer.ts` | Manifest-bound local-to-private-bucket transfer and remote completeness verification. |
| `lib/caphub/storage/transfer.test.ts` | Transfer success, resumability, source-drift, conflict, and no-delete tests. |
| `lib/caphub/registry/runtime.ts` | Compose the correct local or Neon readable object adapter from approved config. |
| `lib/caphub/service/analyze-runtime.ts` | Consume the readable runtime object port; no local fallback after Neon mode is selected. |
| `scripts/caphub-object-transfer.ts` | Exact dry-run/apply CLI boundary for the object-first migration. |
| `lib/caphub/registry/operations.ts` | Managed-Postgres readiness rules for Neon 18 and least-privilege Registry checks. |
| `scripts/caphub-production-preflight.ts` | Redacted evidence report for remote-object and recovery-branch prerequisites. |
| `scripts/caphub-production-preflight.test.ts` | Managed readiness and safe redaction regression tests. |
| `config/alljobs.example.json` | Disabled-by-default, value-free Neon configuration example. |
| `.agent/caphub/production-activation-runbook.md` | N1–N4 operator sequence, stop conditions, evidence fields, and recovery proof. |
| `.agent/caphub/production-activation-cutover.md` | Append-only current state/evidence record; preserve the existing S1 stop proof. |

## Task 1: Strict Neon configuration and Registry URL policy

**Files:**
- Modify: `lib/planning/config.ts:112-119`
- Modify: `lib/planning/config.test.ts`
- Modify: `lib/caphub/registry/connection.ts:85-122`
- Modify: `lib/caphub/registry/connection.test.ts`
- Modify: `config/alljobs.example.json:31-38`

**Interfaces:**
- Produces `registry.managedHosts: readonly [string, ...string[]]` and `storage` configuration with exact secret environment-variable names.
- Produces `parseRegistryConnection({ databaseUrl, mode, role, resolvedHome, managedHosts })`.
- Consumed by registry runtime, migration CLI, backup/preflight command paths.

- [x] **Step 1: Add failing policy tests.**

  Add a `tls_verify_full` test matrix for an approved pooled host and direct host. It must accept only the expected role/database and optional `sslmode=require|verify-full` plus `channel_binding=require`; it must reject an unlisted Neon-looking host, IP/loopback host, credential-less URL, `sslmode=disable`, an unknown query key, a wrong role, or `/postgres`.

  ```ts
  expect(() => parseRegistryConnection({
    databaseUrl: "postgresql://caphub_app:fixture@evil.neon.tech/caphub?sslmode=require",
    mode: "tls_verify_full", role: "application", resolvedHome: home,
    managedHosts: ["ep-approved-pooler.neon.tech", "ep-approved.neon.tech"]
  })).toThrow("approved managed host");
  ```

- [x] **Step 2: Run the focused RED test.**

  Run: `pnpm exec vitest run lib/caphub/registry/connection.test.ts lib/planning/config.test.ts`

  Expected: FAIL because `managedHosts` and Object Storage config do not exist and arbitrary DNS is still accepted.

- [x] **Step 3: Implement the narrow config and parser.**

  Add this configuration shape, retaining local mode for fixtures and rollback:

  ```ts
  registry: z.object({
    enabled: z.boolean().default(false),
    databaseUrlEnv: secretEnvNameSchema.default("CAPHUB_DATABASE_URL"),
    migrationDatabaseUrlEnv: secretEnvNameSchema.default("CAPHUB_MIGRATION_DATABASE_URL"),
    connectionMode: z.enum(["local_socket", "tls_verify_full"]).default("tls_verify_full"),
    managedHosts: z.array(z.string().min(1).max(253)).min(1).max(2).default(["registry.example.test"]),
    maxConnections: z.number().int().min(1).max(16).default(4),
    statementTimeoutMs: z.number().int().min(100).max(30_000).default(5_000)
  }).strict()
  ```

  Add `storage` beside `registry` with `mode: z.enum(["local", "neon_s3"]).default("local")`, literal bucket `caphub-objects`, and the four explicit environment references `CAPHUB_S3_ACCESS_KEY_ID`, `CAPHUB_S3_SECRET_ACCESS_KEY`, `CAPHUB_S3_ENDPOINT`, and `CAPHUB_S3_REGION`. Require `mode === "neon_s3"` only when both Caphub and Registry are enabled. The example keeps `enabled: false` and `mode: "local"`; it must not include the real endpoint or values.

  In TLS mode require a normalized host to be one of `managedHosts`; preserve `{ rejectUnauthorized: true }` and construct `Pool` options rather than passing a raw connection string. Pass `managedHosts` through every current `parseRegistryConnection` call. Do not relax local-socket assertions.

- [x] **Step 4: Run the focused GREEN tests and static checks.**

  Run: `pnpm exec vitest run lib/caphub/registry/connection.test.ts lib/planning/config.test.ts && pnpm typecheck && pnpm lint -- lib/planning/config.ts lib/caphub/registry/connection.ts`

  Expected: PASS; no test reads a secret value from an emitted report.

- [x] **Step 5: Commit the bounded contract.**

  ```bash
  git add lib/planning/config.ts lib/planning/config.test.ts lib/caphub/registry/connection.ts lib/caphub/registry/connection.test.ts config/alljobs.example.json
  git commit -m "feat(caphub): bound Neon registry configuration"
  ```

## Task 2: Private Neon S3 immutable object adapter

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `lib/caphub/storage/contracts.ts`
- Create: `lib/caphub/storage/neon-s3.ts`
- Create: `lib/caphub/storage/neon-s3.test.ts`
- Modify: `lib/caphub/storage/local-objects.ts`
- Modify: `lib/caphub/storage/local-objects.test.ts`

**Interfaces:**
- Produces `ReadableCaptureObjectStore extends CaptureObjectStore { readImmutable(ref: ObjectRef): Promise<Uint8Array> }`.
- Produces `NeonS3CaptureObjectStore` and `createNeonS3CommandPort({ bucket, endpoint, region, credentials })`.
- Consumed by runtime composition and transfer task.

- [x] **Step 1: Add focused failing adapter tests.**

  Build an injected fake `S3ImmutableCommandPort` that records only key, byte count, SHA-256 metadata, and operation names. Test all of: first write sends `IfNoneMatch: "*"`, response is reread and hashed, an existing matching key deduplicates, an existing mismatched byte stream rejects with `ImmutableObjectMismatchError`, a missing/incorrect metadata digest rejects, read verifies byte count and digest, endpoint must be HTTPS, and the adapter contains no `DeleteObject` method/call.

  ```ts
  await expect(store.putImmutable({ bytes: png, mimeType: "image/png" })).resolves.toMatchObject({
    key: `sha256/${digest.slice(0, 2)}/${digest}`, digest, bytes: png.byteLength
  });
  expect(fake.operations).toEqual(["head", "put-if-absent", "get"]);
  ```

- [x] **Step 2: Run the focused RED test.**

  Run: `pnpm exec vitest run lib/caphub/storage/neon-s3.test.ts lib/caphub/storage/local-objects.test.ts`

  Expected: FAIL because neither readable port nor Neon adapter exists.

- [x] **Step 3: Add the SDK and implement the adapter.**

  Install only `@aws-sdk/client-s3`. Construct `S3Client` with explicit credentials, explicit HTTPS endpoint, explicit region, and `forcePathStyle: true`; do not use public URLs, presigning, default credential discovery, `CopyObject`, or delete APIs. Put metadata `{ "caphub-sha256": digest }` and the exact content type. Map S3 not-found/precondition errors into `null`/retry-read behavior; propagate all other errors as storage-unavailable errors at the service boundary.

  `putImmutable` must implement this exact sequence:

  ```ts
  const ref = objectRefFor(bytes);
  const existing = await port.head(ref.key);
  if (existing) return verifyRemote(ref, bytes, existing);
  try { await port.putIfAbsent({ key: ref.key, bytes, mimeType, digest: ref.digest }); }
  catch (error) { if (!isPreconditionFailed(error)) throw error; }
  return verifyRemote(ref, bytes, await requireHead(ref.key));
  ```

  `verifyRemote` checks key, metadata digest, content length, `get`, and SHA-256 byte equality before returning `ref`. Make `LocalCaptureObjectStore` implement the new readable interface without changing its filesystem security semantics.

- [x] **Step 4: Run GREEN checks.**

  Run: `pnpm exec vitest run lib/caphub/storage/neon-s3.test.ts lib/caphub/storage/local-objects.test.ts lib/caphub/service/capture.test.ts && pnpm typecheck && pnpm lint -- lib/caphub/storage`

  Expected: PASS; no remote S3 endpoint is contacted.

- [x] **Step 5: Commit the adapter.**

  ```bash
  git add package.json package-lock.json lib/caphub/storage/contracts.ts lib/caphub/storage/local-objects.ts lib/caphub/storage/local-objects.test.ts lib/caphub/storage/neon-s3.ts lib/caphub/storage/neon-s3.test.ts
  git commit -m "feat(caphub): add verified Neon object adapter"
  ```

## Task 3: Manifest-bound local-object transfer command

**Files:**
- Create: `lib/caphub/storage/transfer.ts`
- Create: `lib/caphub/storage/transfer.test.ts`
- Create: `scripts/caphub-object-transfer.ts`
- Create: `scripts/caphub-object-transfer.test.ts`
- Modify: `package.json`
- Modify: `lib/caphub/registry/filesystem-import.ts`
- Modify: `lib/caphub/registry/filesystem-import.test.ts`

**Interfaces:**
- Produces `planFilesystemObjectTransfer({ root })` and `applyFilesystemObjectTransfer({ root, expectedSourceDigest, source, destination })`.
- Produces CLI: `caphub:object-transfer --dry-run` or `--apply --digest SHA256 --confirm COPY-CAPHUB-OBJECTS`.
- Consumes `ReadableCaptureObjectStore` and the existing exact filesystem Capture manifest.
- Produces `{ sourceDigest, objectCount, verifiedObjectCount }` only; it never prints a path, key, byte content, endpoint, or credential.

- [x] **Step 1: Add RED transfer and CLI tests.**

  Seed two local Capture objects and a fake remote readable store. Require a deterministic source digest, sorted unique object refs, remote reread/hash for every object, a second no-op run, failure before any Registry write when a source file changes, failure on remote mismatch, and rejection of extra CLI arguments/incorrect confirmation. Assert that the fake delete operation count remains zero.

  ```ts
  await expect(applyFilesystemObjectTransfer({
    root, expectedSourceDigest: plan.sourceDigest, source: local, destination: remote
  })).resolves.toEqual({ sourceDigest: plan.sourceDigest, objectCount: 2, verifiedObjectCount: 2 });
  ```

- [x] **Step 2: Run RED.**

  Run: `pnpm exec vitest run lib/caphub/storage/transfer.test.ts scripts/caphub-object-transfer.test.ts`

  Expected: FAIL because the transfer port and bounded CLI do not exist.

- [x] **Step 3: Implement object-first transfer.**

  Derive refs solely from `planFilesystemCaptureImport`; reject duplicate digest/byte inconsistencies. Replan before the first transfer and after the final remote verification; both manifests must equal `expectedSourceDigest`. For each sorted ref, read from the local readable store, call remote `putImmutable`, read it back, and validate bytes/digest. Finally list exactly under `sha256/`, reject an unknown/missing object key, and require the remote key set to equal the planned refs. Never invoke filesystem `unlink`, S3 delete, database operations, or import operations.

  The CLI loads only disabled/approved config, refuses `storage.mode !== "neon_s3"`, and emits one redacted JSON result. `--dry-run` performs planning only; `--apply` is still an N1-gated production operation and must not be run without the written Human authorization.

- [x] **Step 4: Run GREEN checks.**

  Run: `pnpm exec vitest run lib/caphub/storage/transfer.test.ts scripts/caphub-object-transfer.test.ts lib/caphub/registry/filesystem-import.test.ts && pnpm typecheck && pnpm lint -- lib/caphub/storage/transfer.ts scripts/caphub-object-transfer.ts`

  Expected: PASS; transfer tests use fakes and temporary owned fixtures only.

- [x] **Step 5: Commit the transfer boundary.**

  ```bash
  git add lib/caphub/storage/transfer.ts lib/caphub/storage/transfer.test.ts scripts/caphub-object-transfer.ts scripts/caphub-object-transfer.test.ts package.json lib/caphub/registry/filesystem-import.ts lib/caphub/registry/filesystem-import.test.ts
  git commit -m "feat(caphub): add manifest-bound object transfer"
  ```

## Task 4: Compose Neon objects into Registry and Capture runtimes

**Files:**
- Modify: `lib/caphub/registry/runtime.ts`
- Modify: `lib/caphub/registry/runtime.test.ts`
- Modify: `lib/caphub/service/analyze-runtime.ts`
- Modify: `lib/caphub/service/analyze-runtime.test.ts`
- Modify: `app/api/caphub/captures/route.ts`
- Modify: `app/api/caphub/captures/[id]/route.ts`
- Modify: their focused route tests

**Interfaces:**
- `ControlHostRegistryRuntime.objects` becomes `ReadableCaptureObjectStore`.
- Local mode keeps `LocalCaptureObjectStore`; Neon mode creates `NeonS3CaptureObjectStore` only after exact config and all four secret environment references validate.
- Produces no fallback from selected Neon mode to a local tree.

- [x] **Step 1: Add RED composition tests.**

  Add a runtime test that supplies valid fake Neon storage credentials through the named environment references and an injected S3 command-port factory; assert the runtime uses the Neon adapter and captures/analysis can reread the same immutable ref. Add failure cases for missing secret reference, HTTP endpoint, wrong bucket, or unapproved Registry host; assert no `Pool`/S3 factory runs on those failures. Preserve an explicit local-mode regression.

- [x] **Step 2: Run RED.**

  Run: `pnpm exec vitest run lib/caphub/registry/runtime.test.ts lib/caphub/service/analyze-runtime.test.ts app/api/caphub/captures/route.test.ts app/api/caphub/captures/[id]/route.test.ts`

  Expected: FAIL because runtime always instantiates local objects.

- [x] **Step 3: Implement composition.**

  Parse the Object Storage environment before constructing an S3 client. Keep all secrets out of thrown public errors. Make routes rely on the composed Registry runtime whenever Registry is enabled; in disabled/local Capture-only mode retain the local adapter. In Neon mode, storage construction failure maps to the existing bounded storage-unavailable response and must not cause a local fallback. Update analysis runtime to consume `ReadableCaptureObjectStore` rather than importing the local implementation as the selected adapter.

- [x] **Step 4: Run focused GREEN checks.**

  Run: `pnpm exec vitest run lib/caphub/registry/runtime.test.ts lib/caphub/service/analyze-runtime.test.ts app/api/caphub/captures/route.test.ts app/api/caphub/captures/[id]/route.test.ts lib/caphub/service/capture.test.ts && pnpm typecheck && pnpm lint -- lib/caphub/registry/runtime.ts lib/caphub/service/analyze-runtime.ts app/api/caphub/captures`

  Expected: PASS; no UI behavior or public DTO leaks object keys/credentials.

- [x] **Step 5: Commit runtime composition.**

  ```bash
  git add lib/caphub/registry/runtime.ts lib/caphub/registry/runtime.test.ts lib/caphub/service/analyze-runtime.ts lib/caphub/service/analyze-runtime.test.ts app/api/caphub/captures/route.ts app/api/caphub/captures/[id]/route.ts app/api/caphub/captures/route.test.ts app/api/caphub/captures/[id]/route.test.ts
  git commit -m "feat(caphub): compose Neon object storage runtime"
  ```

## Task 5: Managed-Neon readiness and redacted cutover evidence

**Files:**
- Modify: `lib/caphub/registry/operations.ts`
- Modify: `lib/caphub/registry/operations.test.ts`
- Modify: `scripts/caphub-production-preflight.ts`
- Modify: `scripts/caphub-production-preflight.test.ts`
- Modify: `.agent/caphub/production-activation-runbook.md`
- Modify: `.agent/caphub/production-activation-cutover.md`

**Interfaces:**
- `checkRegistryReadiness` accepts PostgreSQL 17 or 18 for `tls_verify_full`, reports `managed_tls` instead of an internal listener address, and retains exact role/privilege/migration checks.
- Preflight adds `{ objectTransfer: { sourceDigest, objectCount, matchesRemote }, recovery: { verified: boolean } }` and requires both fields before `PA_D`.

- [ ] **Step 1: Write failing readiness/preflight tests.**

  Make a `tls_verify_full` fixture with PostgreSQL `18.x`, exact roles, migrations, and privileges pass without exposing an endpoint. Make `18.x` in local socket mode fail. Make `readyFor` remain `PA_B` if remote objects are incomplete and remain `PA_D` until recovery proof is recorded. Assert serialized reports do not include bucket names, keys, hostnames, paths, URLs, access keys, or secret values.

- [ ] **Step 2: Run RED.**

  Run: `pnpm exec vitest run lib/caphub/registry/operations.test.ts scripts/caphub-production-preflight.test.ts`

  Expected: FAIL because readiness is pinned to PostgreSQL 17/local listener details and preflight knows only local backups.

- [ ] **Step 3: Implement managed evidence semantics.**

  Branch readiness on `connectionMode`: local mode stays PostgreSQL 17 plus private Unix-socket proof; managed TLS accepts `17.` or `18.`, never publishes `SHOW listen_addresses`, and still requires both identities, no role membership, migration checksums, append-only protections, and least application privileges. Replace the obsolete local-backup gate in this Neon plan with an immutable remote-object transfer attestation and recovery-branch restore attestation. Store those attestations as private, canonical, owner-only JSON under `ALLJOBS_HOME/state/caphub/activation/`; preflight emits only boolean/count/digest fields.

  The runbook must name N1 as a hard authorization boundary, N2 as object-first migration, N3 as database import, and N4 as a Console-created recovery branch restored and checked in an owned validation branch. It must specify stop-on-mismatch and no-delete behavior. Keep the S1 launchd-stop evidence append-only in the cutover record.

- [ ] **Step 4: Run GREEN checks.**

  Run: `pnpm exec vitest run lib/caphub/registry/operations.test.ts scripts/caphub-production-preflight.test.ts && pnpm typecheck && pnpm lint -- lib/caphub/registry/operations.ts scripts/caphub-production-preflight.ts`

  Expected: PASS; preflight remains read-only and reports no sensitive values.

- [ ] **Step 5: Commit the managed readiness gate.**

  ```bash
  git add lib/caphub/registry/operations.ts lib/caphub/registry/operations.test.ts scripts/caphub-production-preflight.ts scripts/caphub-production-preflight.test.ts .agent/caphub/production-activation-runbook.md .agent/caphub/production-activation-cutover.md
  git commit -m "feat(caphub): gate Neon cutover on remote recovery evidence"
  ```

## Task 6: Non-Production BDD, final checks, and scoped independent gates

**Files:**
- Create: `tests/e2e/caphub-neon-validation.spec.ts`
- Create: `tests/e2e/caphub-neon-validation-fixtures.ts`
- Modify: `playwright.caphub-production-pilot.config.ts`
- Modify: `.agent/caphub/production-activation-log.md`
- Modify: `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`

**Interfaces:**
- The E2E fixture receives only a non-Production validation branch alias and temporary credential environment references supplied by the authorized operator; it never reads Production values.
- Scenario evidence records only aliases, source digests, object counts, migration checksums, and pass/fail results.

- [ ] **Step 1: Write fixture-only BDD scenarios.**

  Cover: a synthetic image Capture is written to the private validation bucket and Registry, read back through the runtime, and shows no public URL; a second equal write is idempotent; a deliberately mismatched object fails closed; a fresh Neon child branch can read the matching database row/object snapshot; and an attempted delete is absent from client operations. Mark the suite skipped unless all explicit validation environment references are supplied.

- [ ] **Step 2: Run local RED/skip validation.**

  Run: `pnpm exec playwright test --config playwright.caphub-production-pilot.config.ts tests/e2e/caphub-neon-validation.spec.ts`

  Expected: skipped with no validation-branch references; the test must make no network call in this state.

- [ ] **Step 3: Implement the fixture and authorized validation procedure.**

  Create only the narrowly scoped test fixture. Before executing against Neon, stop and obtain the explicit N1 validation authorization naming the non-Production branch, temporary credentials, and permitted synthetic objects. On authorization, run exactly one checksum-bound synthetic scenario, capture redacted evidence, and stop on the first mismatch. Do not use Production data, create Production resources, or run the app service.

- [ ] **Step 4: Run the final implementation gates.**

  Run focused tests from Tasks 1–5, then `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm run verify:deploy`. Run the Caphub production-pilot browser suite only if this code changes its visible routes; otherwise record that no UI surface changed and reuse the existing final-build screenshots.

  Expected: every selected check passes. Resolve failures before review; do not substitute broad unrelated suites for a failed focused test.

- [ ] **Step 5: Update evidence and commit.**

  Record exact commit, focused test totals, build/lint/typecheck/deploy invariant results, BDD result or its explicit authorization block, and remaining N1/N4 hard gates. Then commit:

  ```bash
  git add tests/e2e/caphub-neon-validation.spec.ts tests/e2e/caphub-neon-validation-fixtures.ts playwright.caphub-production-pilot.config.ts .agent/caphub/production-activation-log.md docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md
  git commit -m "test(caphub): cover Neon validation boundary"
  ```

- [ ] **Step 6: Run one scoped independent Review and Verification.**

  Review only the Task 1–6 diff and the Neon design/plan contracts: credential redaction, TLS host allowlist, private/path-style bucket enforcement, immutable semantics, object-first transfer, no-delete behavior, managed readiness, and the unchanged P4/P5/P6 limits. Verification reruns the selected focused tests plus typecheck/lint/build/deploy invariant and validates that the working tree contains no unintended files. Record findings once; repair blockers and perform one targeted re-review only when a finding changes the reviewed contract.

## Production execution gates after implementation

1. **N1 / PA-B-N — fresh Human authorization required.** Create the private `caphub-objects` bucket, database/roles, exact network allowlist, pooled/direct endpoint configuration, and private environment references. Record aliases/IDs only.
2. **N2 — object-first preservation.** With the app still stopped, run the transfer command with the planned digest; independently list/read/hash every remote object and record the private attestation. A mismatch blocks N3.
3. **N3 — Registry import.** Apply checksum-bound migrations via the direct migrator connection, run the existing exact-digest import, and verify Registry lineage/counts/object refs against the remote object manifest.
4. **N4 — recovery proof.** Create a Neon recovery branch through the authorized control plane, restore/check it in a validation branch, and persist the redacted attestation. A mismatch keeps S1.
5. **PA-D — fresh Human authorization required.** Only then install the application environment references, rebuild/reload the stopped app into S3, and perform the approved final-build browser checks. PA-C remains required before the one real Kimi compatibility canary; P4 targets remain disabled.
