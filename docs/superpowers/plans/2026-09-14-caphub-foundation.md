# Caphub Foundation and Web Capture Vertical Slice Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Spec:** `docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`

**Goal:** Add the smallest production-shaped Caphub foundation that accepts one screenshot through the AllJobs web UI, stores immutable bytes plus a validated Capture record and audit event, and returns a traceable `received` status.

**Architecture:** Introduce a platform-neutral Caphub domain and ports under `lib/caphub`. The first adapter stores metadata and immutable objects under the resolved `<ALLJOBS_HOME>/state/caphub` tree with traversal-safe paths and atomic writes. Route factories enforce origin, content type, size, and configuration before invoking an idempotent capture service. This phase has no analysis or release transition, so every record stops at `received`; PostgreSQL can later replace the metadata port without changing service or route contracts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Node.js crypto/fs, Vitest/Testing Library, Playwright.

## Scope check

This plan covers only a Web Capture vertical slice. It does not add Telegram, MiniMax, Kimi, Claude/Codex handoff, external research, candidate scoring, review UI, PostgreSQL, Obsidian, capability publication, runtime routing, update watching, or production deployment. Those remain P2-P6 in `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`.

## Human Gate P1-A: frontend Brief and rendered mockup

Before editing application code, follow `/Users/xtation/AgentWorks/Tools/FRONTEND-DESIGN-WORKFLOW.md` v3.3:

1. Create `.agent/frontend-design/caphub-foundation/brief.md` defining the `/caphub` upload, success, duplicate, disabled, oversize, invalid-type, and read-error states at 1440px and 390px.
2. Create `.agent/frontend-design/caphub-foundation/mockup.html` with no framework code or live data.
3. Obtain independent Review and Verification evidence under `.agent/frontend-design/caphub-foundation/`.
4. Stop for explicit Human Owner approval of the mockup. Application-code tasks below remain blocked until approval.

## Fixed contracts for P1

Create `lib/caphub/domain/schemas.ts` with these schemas and export inferred types through `lib/caphub/domain/types.ts`:

```ts
export const captureIdSchema = z.string().regex(/^cap_[0-9a-f]{32}$/);
export const idempotencyKeySchema = z.string().min(16).max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const captureMimeTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp"
]);
export const objectRefSchema = z.object({
  algorithm: z.literal("sha256"),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  key: z.string().regex(/^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/),
  bytes: z.number().int().positive()
}).strict();
export const captureRecordSchema = z.object({
  schema_version: z.literal(1),
  id: captureIdSchema,
  source: z.object({
    kind: z.literal("web"),
    original_filename: z.string().min(1).max(255),
    source_url: z.string().url().max(2048).optional()
  }).strict(),
  note: z.string().max(4000),
  mime_type: captureMimeTypeSchema,
  object: objectRefSchema,
  idempotency_key: idempotencyKeySchema,
  status: z.literal("received"),
  human_review_required: z.literal(true),
  created_at: z.string().datetime({ offset: true })
}).strict();
export const captureAuditEventSchema = z.object({
  schema_version: z.literal(1),
  event_id: z.string().regex(/^evt_[0-9a-f]{32}$/),
  capture_id: captureIdSchema,
  type: z.literal("capture.received"),
  actor: z.literal("web:user"),
  occurred_at: z.string().datetime({ offset: true }),
  object_digest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
```

The service contract in `lib/caphub/service/capture.ts` is fixed as:

```ts
export interface ReceiveCaptureInput {
  idempotencyKey: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  note?: string;
  sourceUrl?: string;
}
export type ReceiveCaptureResult =
  | { kind: "created"; capture: CaptureRecord }
  | { kind: "duplicate"; capture: CaptureRecord };
export interface CaptureStore {
  findByIdempotencyKey(key: string): Promise<CaptureRecord | null>;
  get(id: string): Promise<CaptureRecord | null>;
  create(record: CaptureRecord): Promise<"created" | "conflict">;
}
export interface CaptureObjectStore {
  putImmutable(input: { bytes: Uint8Array; mimeType: CaptureMimeType }): Promise<ObjectRef>;
}
export interface CaptureAuditLog {
  ensure(event: CaptureAuditEvent): Promise<"appended" | "existing">;
}
```

## Task 1: Extend Control Host configuration with disabled-by-default Caphub settings

**Files:**

- Modify: `lib/planning/config.ts`
- Modify: `lib/planning/config.test.ts`
- Modify: `config/alljobs.example.json`

1. Add failing config tests for `caphub.enabled` defaulting to `false`, exact HTTPS `allowedOrigins`, and `maxUploadBytes` constrained to `1_048_576..20_971_520` with default `10_485_760`.
2. Run `npm test -- lib/planning/config.test.ts`. Expected: FAIL because `caphub` is stripped or rejected.
3. Add a strict `controlHostCaphubConfigSchema` and `caphub: controlHostCaphubConfigSchema.optional()` to `controlHostConfigSchema`. Reuse the assistant exact-origin refinement; do not permit paths, credentials, HTTP public origins, or configurable filesystem roots.
4. Add this non-secret block to `config/alljobs.example.json`:

   ```json
   "caphub": {
     "enabled": false,
     "allowedOrigins": ["https://alljobs.agentjoey.ai"],
     "maxUploadBytes": 10485760
   }
   ```

5. Extend `ControlHostResolvedPaths` with `caphubStateDir`; derive it only as `resolve(stateDir, "caphub")` and create it beneath the resolved Control Host home.
6. Run `npm test -- lib/planning/config.test.ts`. Expected: PASS.
7. Commit: `feat(caphub): add disabled control-host config`

## Task 2: Define and validate the Caphub domain

**Files:**

- Create: `lib/caphub/domain/schemas.ts`
- Create: `lib/caphub/domain/types.ts`
- Create: `lib/caphub/domain/schemas.test.ts`

1. Write tests for the fixed contracts above, including unknown-key rejection, invalid IDs, MIME rejection, invalid timestamps, negative byte sizes, non-HTTPS `source_url`, and `human_review_required: false` rejection.
2. Run `npm test -- lib/caphub/domain/schemas.test.ts`. Expected: FAIL because the module does not exist.
3. Implement the exact schemas. Add an HTTPS-only refinement for `source_url`; inferred type aliases are `CaptureId`, `CaptureMimeType`, `ObjectRef`, `CaptureRecord`, and `CaptureAuditEvent`.
4. Run `npm test -- lib/caphub/domain/schemas.test.ts`. Expected: PASS.
5. Commit: `feat(caphub): define capture domain contracts`

## Task 3: Add traversal-safe Caphub paths

**Files:**

- Create: `lib/caphub/storage/paths.ts`
- Create: `lib/caphub/storage/paths.test.ts`

1. Add tests that accept only an absolute resolved root ending in `/state/caphub`; reject `/`, home, relative paths, `~`, variables, glob characters, symlinks that escape, malformed Capture IDs, malformed digests, and path separators in idempotency keys.
2. Define these fixed descendants:

   ```text
   <root>/records/captures/<capture-id>.json
   <root>/records/idempotency/<sha256-of-key>.json
   <root>/objects/sha256/<first-two-digest-chars>/<digest>
   <root>/events/YYYY-MM.jsonl
   <root>/locks/<sha256-of-idempotency-key>.lock
   ```

3. Run `npm test -- lib/caphub/storage/paths.test.ts`. Expected: FAIL before implementation.
4. Implement `resolveCaphubRoot`, `captureRecordPath`, `idempotencyRecordPath`, `objectPath`, `eventsPath`, and `idempotencyLockPath` using validated components and an anchored `joinUnder` check modeled on `lib/monitoring/store/paths.ts`.
5. Run `npm test -- lib/caphub/storage/paths.test.ts`. Expected: PASS.
6. Commit: `feat(caphub): add safe state paths`

## Task 4: Implement immutable object and metadata adapters

**Files:**

- Create: `lib/caphub/storage/contracts.ts`
- Create: `lib/caphub/storage/local-objects.ts`
- Create: `lib/caphub/storage/local-objects.test.ts`
- Create: `lib/caphub/storage/filesystem.ts`
- Create: `lib/caphub/storage/filesystem.test.ts`
- Create: `lib/caphub/storage/audit-log.ts`
- Create: `lib/caphub/storage/audit-log.test.ts`

1. Put the three port interfaces from the fixed contract in `contracts.ts`; re-export domain types rather than duplicating shapes.
2. Add object-store tests proving SHA-256 addressing, identical-byte deduplication, byte preservation, mismatch rejection, temp-sibling plus atomic rename, and refusal to overwrite an existing different payload.
3. Implement `LocalCaptureObjectStore(root)` with `putImmutable`. Write only under `objects/sha256`; use `open(..., "wx")` or an atomic temp file plus exclusive finalization. Never accept a caller-supplied path.
4. Add metadata-store tests proving strict schema validation on read, `null` for missing records, exclusive create, idempotency lookup, conflict under concurrent `create`, and no partial JSON after an injected write failure.
5. Implement `FilesystemCaptureStore(root)` using immutable capture JSON plus an idempotency index containing only `{ schema_version: 1, idempotency_key, capture_id }`. Hash the key for its filename; preserve the original validated key inside the index.
6. Add audit tests proving one strict NDJSON event per successful creation, month partitioning by `occurred_at`, idempotent `ensure` under concurrent calls, recovery after an interrupted first append, and rejection of invalid events.
7. Implement `FilesystemCaptureAuditLog(root)`. Serialize `ensure` through an in-process per-file promise chain, scan the bounded current-month file for the exact `event_id`, append only when absent, and flush before returning. Event IDs are deterministic for `capture.received`: derive them from the Capture ID so a retry can repair a missing audit event without creating a second event.
8. Run `npm test -- lib/caphub/storage`. Expected: PASS.
9. Commit: `feat(caphub): add local immutable storage adapters`

## Task 5: Implement idempotent capture receipt

**Files:**

- Create: `lib/caphub/service/capture.ts`
- Create: `lib/caphub/service/capture.test.ts`

1. Add tests for: valid creation; duplicate key returning the original record without a second audit event; retry after an audit failure repairing the missing deterministic event; same key with different bytes returning typed `IDEMPOTENCY_CONFLICT`; invalid MIME; empty/oversize bytes; invalid URL/note; object-store failure leaving no metadata; metadata conflict re-reading the winner; audit failure returning `AUDIT_WRITE_FAILED` while the durable record remains queryable.
2. Run `npm test -- lib/caphub/service/capture.test.ts`. Expected: FAIL because the service does not exist.
3. Implement `createCaptureService({ store, objects, audit, clock, idFactory, eventIdFactory, maxUploadBytes })` with `receive(input)` and `get(id)`.
4. Validate input before storage. Compute content SHA-256, check an existing idempotency record before object write, and compare digest/mime/note/source metadata before returning `duplicate`.
5. Store object first, metadata second, audit last. Both created and duplicate paths call idempotent `audit.ensure` with the same deterministic event ID; an existing event is not appended twice, while a retry heals a previously failed audit append. Map failures to stable codes: `INVALID_INPUT`, `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`, `IDEMPOTENCY_CONFLICT`, `STORAGE_UNAVAILABLE`, `AUDIT_WRITE_FAILED`.
6. Every created record must be `status: "received"` and `human_review_required: true`; this service exposes no transition, approval, release, install, code, shell, Git, or deploy method.
7. Run `npm test -- lib/caphub/service/capture.test.ts`. Expected: PASS.
8. Commit: `feat(caphub): receive captures idempotently`

## Task 6: Add bounded POST and read-only GET route factories

**Files:**

- Create: `app/api/caphub/captures/route-factory.ts`
- Create: `app/api/caphub/captures/route.ts`
- Create: `app/api/caphub/captures/route.test.ts`
- Create: `app/api/caphub/captures/[id]/route-factory.ts`
- Create: `app/api/caphub/captures/[id]/route.ts`
- Create: `app/api/caphub/captures/[id]/route.test.ts`

1. Add POST tests for: disabled config (`503`); missing/foreign Origin (`403`); wrong media type (`415`); absent Content-Length (`411`); oversized Content-Length (`413` before `formData()`); missing file/key (`400`); unsupported image MIME (`415`); success (`201`); duplicate (`200`); idempotency conflict (`409`); safe no-store/nosniff headers; no absolute paths or secret values in errors.
2. The POST route accepts only `multipart/form-data` fields `image`, `idempotency_key`, `note`, and `source_url`. After the mandatory bounded Content-Length check, call `request.formData()`, require exactly one `File`, and verify `file.size <= maxUploadBytes` before `arrayBuffer()`.
3. Implement `createCapturePostRoute(deps)` following the dependency-injected shape of `app/api/assistant/respond/route-factory.ts`. `route.ts` loads `loadControlHostConfig()`, rejects unless `config.caphub?.enabled === true`, constructs local adapters with `caphubStateDir`, and exports `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
4. Run `npm test -- app/api/caphub/captures/route.test.ts`. Expected: PASS.
5. Add GET tests for invalid ID (`400`), missing record (`404`), stored record (`200`), disabled config (`503`), and no-store/nosniff headers.
6. Implement the dynamic route with Next.js 16 async params:

   ```ts
   export async function GET(
     request: Request,
     context: { params: Promise<{ id: string }> }
   ): Promise<Response>
   ```

7. GET returns metadata only; it never returns raw object bytes or filesystem paths in P1.
8. Run `npm test -- app/api/caphub/captures/[id]/route.test.ts`. Expected: PASS.
9. Commit: `feat(caphub): expose bounded capture routes`

## Task 7: Implement the approved Web Capture UI

**Files:**

- Create: `app/caphub/page.tsx`
- Create: `components/caphub/capture-form.tsx`
- Create: `components/caphub/capture-form.test.tsx`
- Create: `components/caphub/capture-status.tsx`
- Create: `components/caphub/capture-status.test.tsx`
- Modify: `components/planning/primary-nav.tsx`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

1. Add component tests matching the Human-approved mockup: keyboard-accessible file selection, PNG/JPEG/WebP accept filter, optional note/source URL, submit progress, disabled state, oversize/type errors before request, success/duplicate receipt, retry with the same idempotency key, server error recovery, visible `Human review required`, and reduced-motion behavior.
2. Run `npm test -- components/caphub`. Expected: FAIL because components do not exist.
3. Implement `CaptureForm` as a client component. Generate one `crypto.randomUUID()` idempotency key when a file is selected and retain it across retries until a created/duplicate receipt is returned or a different file is selected.
4. Submit `FormData` to `/api/caphub/captures`; render `CaptureStatus` from the returned strict record. Do not preview arbitrary remote URLs, render OCR text, or expose object keys.
5. Implement `/caphub` as a server page that reads only whether the module is configured; the upload component owns browser interaction. Add `Caphub` to `PrimaryNav` without removing Monitoring, Tasks, or other surviving modules.
6. Add only approved Caphub selectors to `app/globals.css`; preserve `prefers-reduced-motion` handling and 390px no-overflow behavior. Update layout metadata to describe AllJobs as a personal operations control plane without claiming Caphub analysis exists.
7. Run `npm test -- components/caphub components/planning`. Expected: PASS.
8. Commit: `feat(caphub): add web capture inbox`

## Task 8: Prove browser-to-filesystem boundaries

**Files:**

- Create: `tests/e2e/caphub-fixtures.ts`
- Create: `tests/e2e/caphub-foundation.spec.ts`
- Create: `playwright.caphub-foundation.config.ts`
- Modify: `package.json`

1. Build an isolated fixture under `mkdtempSync(join(realpathSync(tmpdir()), "alljobs-caphub-e2e-"))` with an unguessable sentinel, dedicated `ALLJOBS_HOME`, `caphub.enabled: true`, exact loopback origin, and no access to the real Control Host state.
2. Add `test:e2e:caphub` as `playwright test --config playwright.caphub-foundation.config.ts`; the config uses built `next start -p 3468 -H 127.0.0.1` and one worker.
3. Add E2E tests that upload a fixed tiny PNG, observe `received` and `Human review required`, reload status by ID, retry the same request without creating a second record/event/object, reject foreign origin and oversize input, verify no writes outside the fixture root, pass WCAG AA checks, and have no horizontal overflow at 1440px or 390px.
4. The fixture cleanup must validate sentinel token, owner PID, real paths, non-symlink directories, and the fixed temp prefix before recursive removal, following `tests/e2e/r1-fixtures.ts` safety style.
5. Run:

   ```bash
   npm run build
   npm run test:e2e:caphub
   ```

   Expected: PASS with the real browser → route → service → filesystem → GET-status path.
6. Commit: `test(caphub): verify capture vertical slice`

## Task 9: Document the adapter boundary and operations

**Files:**

- Create: `docs/caphub-foundation.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`

1. Document the P1 state tree, size/MIME limits, origin checks, disabled-by-default config, immutable objects, idempotency behavior, audit semantics, backup unit, and recovery steps.
2. Define the later PostgreSQL change as a new `PostgresCaptureStore` implementing the existing `CaptureStore`; metadata migration must be separately planned and approved. Objects remain behind `CaptureObjectStore`. Obsidian consumes approved Registry exports only and is absent from P1.
3. State explicitly that P1 cannot analyze, approve, publish, install, execute code, call Shell/Git, or deploy a capability.
4. Run `rg -n 'Telegram|MiniMax|Kimi|Obsidian|Postgres|publish|deploy' docs/caphub-foundation.md`; each match must occur only in scope/boundary or future-adapter text, never as a completed feature claim.
5. Commit: `docs(caphub): document foundation operations`

## Task 10: Full verification and Human Gates P1-B/P1-C

1. Run:

   ```bash
   npm test
   npm run typecheck
   npm run lint
   npm run build
   npm run test:e2e
   npm run test:e2e:caphub
   npm run verify:deploy
   git diff --check
   git remote -v
   git status --short
   ```

2. Confirm `start:prod` still binds `127.0.0.1:3456`, no credential appears in config/docs/test output, and all Caphub writes in tests are below the sentinel-owned temp root.
3. Gate P1-B: independent Review verifies schema/port consistency, path safety, idempotency race handling, immutable bytes, audit behavior, route bounds, accessibility, and that no approval/release execution surface exists.
4. Gate P1-C: Human Owner walks through the final build and explicitly approves or rejects release. Do not update LaunchAgents, restart AllJobs, publish the site, or enable `caphub.enabled` on the real Control Host before approval.
5. Rollback is a reverse-order Git revert of P1 commits plus removal of the explicitly resolved `<ALLJOBS_HOME>/state/caphub` directory only after a read-only path/sentinel audit and separate Human authorization. Never target `~`, `$HOME`, `/`, a glob, or an unresolved environment variable.
