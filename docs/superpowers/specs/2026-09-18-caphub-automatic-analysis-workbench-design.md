# Caphub Automatic Analysis Workbench Design

**Date:** 2026-09-18  
**Status:** Written specification approved by Human Owner on 2026-09-18
**Scope:** Capture-to-analysis automation, Caphub-owned review workbench,
filename conflict handling, Review deduplication, and 30-day raw-image
retention  
**Production baseline:** `e34a245d49fedd0456344d63ac63cef4b96248fd`

## 1. Problem

Caphub can already store a Capture, execute Analysis Contract V4, import a
ReviewPacket, and render a Review Request. The production UI does not connect
those capabilities into one product flow:

- browser upload stops after Capture persistence;
- only the operator CLI starts analysis;
- Caphub review content lives under the top-level `/reviews` route instead of
  the Caphub product area;
- historical jobs for the same file occupy the Analysis stops list repeatedly;
- a repeated upload can create another Capture even when the filename and
  bytes are identical;
- the current Review page performs multiple remote Registry reads before the
  useful content appears and renders too much explanatory and technical text.

On 2026-09-18, five local-loopback production reads of `/reviews` completed in
1.98–10.65 seconds. The streaming loading shell appeared quickly, but useful
SSR content remained blocked on the Registry query chain.

## 2. Goals

1. A successful browser Capture automatically enters a durable analysis queue.
2. A Control Host worker executes the existing V4 workflow and imports the
   resulting ReviewPacket without depending on an open browser request.
3. Capture, analysis progress, Review Request, evidence, and decision controls
   live under the Caphub route hierarchy.
4. Identical uploads do not create duplicate Captures or analysis work.
5. A same-name/different-content upload pauses for an explicit Human choice.
6. Review and stop lists show one current work item per normalized filename by
   default; history remains available without competing for attention.
7. The Review queue becomes fast and task-focused.
8. Raw images are deleted 30 days after parsed information is successfully
   imported, while derived records and audit history remain.

## 3. Non-goals

- Changing Analysis Contract V4, provider/model selection, prompts, token
  limits, or provider retry policy.
- Automatic approval, export, publishing, installation, code execution, Git,
  deployment, or capability activation.
- Deleting Capture, Analysis, ReviewPacket, Candidate, Review Request, decision,
  lineage, or audit metadata.
- Treating different filenames with identical bytes as the same user-facing
  file. The object store may share their content-addressed bytes, but filename
  work items remain distinct.
- Reworking unrelated AllJobs navigation or Planning features.

## 4. Route and information architecture

Caphub becomes the only top-level navigation entry for this domain:

| Route | Purpose |
|---|---|
| `/caphub` | Capture intake plus compact current-work summary |
| `/caphub/captures/[id]` | Capture, queue, analysis, retention, and lineage detail |
| `/caphub/reviews` | Deduplicated current Review/attention queue |
| `/caphub/reviews/[id]` | One Review Request, evidence summary, and decision controls |

The top-level `Reviews` navigation item is removed. Existing URLs remain safe:

- `/reviews` redirects to `/caphub/reviews`, preserving supported filters;
- `/reviews?request=<id>` redirects to `/caphub/reviews/<id>`;
- `/captures/<id>` redirects to `/caphub/captures/<id>`.

Redirects are compatibility paths only. New links and form actions use the
Caphub hierarchy.

## 5. Filename identity and Capture deduplication

### 5.1 Normalization

The filename key is the uploaded basename after:

1. rejecting path separators and empty/reserved names;
2. Unicode NFC normalization;
3. trimming surrounding whitespace;
4. locale-independent lowercasing.

The original filename remains immutable display metadata. The normalized key
is operational metadata and never replaces the original value.

### 5.2 Upload outcomes

The server hashes the bytes before writing an object and resolves the current
filename head under a serializable transaction/advisory lock.

| Condition | Outcome |
|---|---|
| No filename head | Create Capture v1, make it current, enqueue analysis |
| Same normalized filename and SHA-256 | Return the canonical existing Capture as `duplicate`; do not store again; idempotently ensure its single analysis request exists |
| Same normalized filename, different SHA-256, no confirmation | Return `409 FILENAME_CONFLICT`; do not store bytes or create a Capture |
| Same name/different SHA-256 with current-head confirmation | Revalidate the expected head, create the next filename version, make it current, enqueue analysis |
| Head changed before confirmation | Return `409 FILENAME_CONFLICT_STALE`; show the updated comparison and ask again |

The browser retains the selected `File` across the conflict prompt and
resubmits it only after the Human chooses **Create new version**. **Cancel**
performs no mutation. The prompt shows the filename, the existing Capture date,
and short digest prefixes; it does not expose object keys or credentials.

Idempotency remains authoritative for retries. Filename locking adds a second,
business-level identity and must not weaken the existing idempotency contract.

### 5.3 Existing-data reconciliation

The migration builds filename heads from existing Captures. Exact same-name,
same-digest Captures are represented as aliases of one canonical Capture. The
canonical choice prefers, in order:

1. a Capture with an imported active Review Request;
2. a Capture with a ReviewPacket;
3. a Capture with an analysis job;
4. the earliest successfully stored Capture.

Existing same-name/different-digest groups are reported by a read-only migration
preflight and require a Human choice before that filename receives a current
head. Other filenames may migrate independently.

## 6. Durable automatic analysis

### 6.1 Queue

Migration `004_capture_automation.sql` adds mutable operational tables separate
from the immutable Registry record/version ledger:

- `caphub.capture_filename_heads`
- `caphub.capture_filename_versions`
- `caphub.analysis_requests`
- `caphub.capture_object_retention`

`analysis_requests` has one row per `(capture_id, analysis_contract_version)`
and records `queued`, `running`, `waiting_for_review`, `needs_attention`, or
`completed`, along with lease, job, Review Request, safe error code, and
timestamps. The unique key makes upload and worker retries idempotent.

Capture creation and queue insertion are recoverably atomic: the route first
persists the Capture, then performs an idempotent `ensureAnalysisRequest`. If the
second operation fails, the upload returns a safe unavailable response; retrying
the same idempotency key returns the Capture and repairs the missing queue row.

### 6.2 Worker

A separate private `com.agentjoey.alljobs-caphub` LaunchAgent runs one Caphub
worker process. It introduces no public listener.

The worker:

1. claims one queued/expired request with `FOR UPDATE SKIP LOCKED`;
2. maintains a lease while the existing V4 production workflow runs;
3. reuses the deterministic V4 job identity and committed stage artifacts;
4. imports the ReviewPacket when analysis completes;
5. stores only safe status identifiers in the queue row;
6. leaves provider-terminal failures as `needs_attention` without automatic
   provider retries;
7. resumes interrupted host execution from immutable job/artifact state after
   lease expiry.

Only one worker is configured in production. A browser route never performs a
provider call inline. New Control Host configuration
`caphub.analysis.autoStart` defaults to `false`; the production change to
`true` is an explicit release step.

### 6.3 UI status

The Capture receipt changes from “No analysis has started” to the actual state:

- `Queued`
- `Analyzing · <stage>`
- `Waiting for review`
- `Needs attention`
- `Complete`

The client polls a bounded metadata-only status endpoint while the page is
open. Closing the page does not cancel the worker. A completed import links to
the Caphub Review Request.

## 7. Caphub review read model and deduplication

### 7.1 One current item per filename

The default work-items projection returns only the current filename head.

- An active Review Request wins over an analysis stop for the same file.
- Only the latest non-superseded job for the current Capture can appear as an
  analysis stop.
- Historical Capture versions, superseded jobs, and older Review Requests are
  counted but excluded from the primary list.
- The detail page provides a collapsed **History** section containing those
  records.

This removes the current repeated V1/V2/V3 stop cards for one image while
preserving their immutable audit value.

### 7.2 Fast initial query

`/caphub/reviews` performs one bounded Registry round trip returning at most 25
compact current work items plus counts. It does not load the first dossier,
decision timeline, evidence list, diff, or full analysis-stop history.

Selecting an item navigates to `/caphub/reviews/[id]`, which loads only that
detail. The detail query acquires one pooled connection and returns its dossier,
latest decision authority, and bounded history without N+1 reads.

Performance acceptance on the production Control Host loopback:

- queue route: exactly one SQL query and no S3/provider operation;
- useful queue SSR completes within 2 seconds for at least 9 of 10 warm runs;
- no warm run exceeds 3 seconds;
- a cold connection completes within 5 seconds or returns the safe unavailable
  state within the configured timeout;
- detail useful SSR completes within 3 seconds for at least 9 of 10 warm runs;
- the loading shell appears within 250 ms and matches the compact final layout.

A benchmark script records total, first-byte, and Registry-query durations so
the gate measures useful content rather than the early streaming shell.

## 8. Review UX simplification

The review experience is task-first rather than documentation-first.

### Queue

Each row shows only:

- filename and current version;
- current state and waiting time;
- recommendation, value, and risk;
- one primary **Review** or **Inspect issue** action.

The large slogan, repeated authority explanations, raw IDs, contract version,
predecessor IDs, and multi-line evidence statistics are removed from the
default queue. Filters collapse behind a single **Filters** control when not in
use. Analysis stops appear as compact attention items, not a full technical
ledger above the queue.

### Detail

The default detail order is:

1. filename, status, recommendation, and one-sentence summary;
2. key claims and source links;
3. unresolved questions/conflicts;
4. Human decision controls.

Technical IDs, full digests, exact-version diff, dimensions, critic text,
lineage, model-call metadata, and historical jobs remain available under
collapsed **Technical details** and **History** sections. Required decision
confirmation and stale-write protection remain unchanged, but explanatory copy
is not repeated around every section.

The 390 CSS-pixel layout keeps the filename, state, and primary action visible
without horizontal scrolling. Reduced motion and keyboard/focus behavior remain
required.

## 9. Thirty-day raw-image retention

### 9.1 Eligibility

Successful ReviewPacket import sets:

`eligible_at = registry_import.imported_at + interval '30 days'`

Queued, running, interrupted, failed, or `HUMAN_REVIEW_REQUIRED` analyses do not
start the retention clock. A pending Human Review decision does not extend the
clock because parsed information is already stored.

The deployment migration backfills eligibility for existing successful imports
from their original import timestamps. No object becomes eligible earlier than
30 days after that timestamp.

### 9.2 Deletion

The Caphub worker performs a bounded retention sweep separately from analysis:

1. select eligible, unpurged digests;
2. lock the digest retention rows;
3. confirm every non-purged reference to that content-addressed digest is
   eligible;
4. issue one exact-key Neon S3 `DeleteObject`;
5. record `purged_at` for every eligible reference and append a
   `capture.object.retention_deleted` audit event.

If any reference is not eligible, the shared object remains. Deletion failure
records only a safe error code and is retried in a later retention cycle. It
does not fail or block analysis work.

After purge, Capture metadata, original filename, digest, byte count, OCR,
claims, evidence, assessment, ReviewPacket, Review Request, decisions, lineage,
and audit history remain. Capture detail displays **Raw image expired** and
never attempts an S3 read.

## 10. API and error contract

New or changed browser boundaries:

| Boundary | Result |
|---|---|
| `POST /api/caphub/captures` | Created/duplicate receipt plus analysis request state, or filename conflict |
| `GET /api/caphub/captures/[id]/status` | Bounded Capture/analysis/import/retention status |

The existing Capture POST carries optional `expected_current_capture_id` and
`expected_current_object_digest` multipart fields on the confirmed replay. The
client retains the selected file until the Human chooses, and the service
revalidates both values before creating a new version.

Safe public error codes include:

- `FILENAME_CONFLICT`
- `FILENAME_CONFLICT_STALE`
- `ANALYSIS_QUEUE_UNAVAILABLE`
- `ANALYSIS_NEEDS_ATTENTION`
- existing Capture/Registry availability codes.

No response includes database URLs, credentials, prompts, raw provider output,
object keys, filesystem paths, or internal exception text.

## 11. Authorization and data boundaries

- Automatic analysis is enabled only by explicit Control Host configuration.
- MiniMax and DeepSeek credentials remain private LaunchAgent environment
  values.
- Provider calls occur only inside the private worker.
- Filename conflict confirmation is exact-head-bound and cannot silently
  overwrite a later version.
- Retention deletion is limited to an exact validated content-addressed object
  key with an eligible Registry record and reference check.
- Existing Human Review decision controls remain available in the browser.
  Upload and automatic analysis cannot approve a review; no browser operation
  added here can export, publish, install, execute code, write Git, or deploy.
- Existing Cloudflare Access, Tunnel, domain, and loopback-only listener remain
  unchanged.

## 12. Verification

### TDD

- filename normalization and invalid-name rejection;
- same-name/same-digest duplicate result;
- same-name/different-digest conflict and exact-head confirmation;
- stale confirmation and concurrent upload serialization;
- idempotent queue repair after partial Capture success;
- one analysis request per Capture/contract;
- lease claim, heartbeat, crash resume, and no automatic provider retry;
- one current work item per filename and latest non-superseded stop;
- retention eligibility, shared-digest reference protection, deletion receipt,
  and safe retry after delete failure.

### BDD and real boundaries

- multipart browser upload → real PostgreSQL Capture/filename/queue rows → fake
  provider worker → ReviewPacket import → Caphub Review work item;
- same-name/same-content second upload creates no additional Capture, job, or
  Review Request;
- same-name/different-content upload renders a Human choice and performs no
  write before confirmation;
- real PostgreSQL query-count and timing benchmark for queue/detail;
- Neon S3-compatible fake command port verifies the exact delete key; production
  objects are never deleted during development verification;
- final production build browser checks at 1440 and true CSS 390 widths cover
  upload, conflict choice, queued/running/waiting states, deduplicated queue,
  compact detail, loading, empty, unavailable, and raw-expired states.

### Static and release gates

- affected tests, typecheck, focused ESLint, deployment invariants, full test
  suite, and webpack production build;
- migration dry-run and privilege verification;
- independent scoped review of concurrency, migration, provider dispatch, and
  destructive retention boundaries;
- exact-build production approval before migration, config change, new
  LaunchAgent, reload, provider canary, or retention activation.

## 13. Rollout and rollback

Rollout is ordered:

1. deploy additive schema and backfill filename identities;
2. resolve any reported same-name/different-digest existing conflicts;
3. deploy app/read-model changes with `autoStart: false`;
4. deploy the worker disabled and verify queue/retention dry-runs;
5. enable worker and `autoStart` for one authorized Capture canary;
6. verify Review placement, deduplication, timings, and audit evidence;
7. activate retention sweep only after its dry-run shows exact future targets.

Rollback disables `autoStart` and the Caphub worker first, restores the prior
app build, and leaves additive operational rows plus immutable Registry evidence
in place. It does not recreate already expired raw images. No production object
is eligible for deletion during initial rollout unless its successful import is
already at least 30 days old and the retention activation gate explicitly
accepts that dry-run target.
