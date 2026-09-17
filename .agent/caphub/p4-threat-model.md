# Caphub P4 Threat Model

**Status:** P4 implementation accepted locally; real-target Human gates remain closed
**Date:** 2026-09-17
**Scope:** Capability Package contracts, deterministic renderers, Obsidian projection, platform preview adapters, exact Deployment plans, fixture publish/rollback, export runtime and read-only browser surfaces
**Out of scope:** real Vault/Agent configuration or writes, production PostgreSQL, provider/model calls, Gate P4-A/P4-B/P4-C execution, P5 BuildProposal implementation, P6 runtime routing

## Protected assets

- Immutable Registry versions, lineage, ReviewRequests, ReviewDecisions, and decision-consumption records.
- Exact approval authority: one Candidate approval → one Release; one Release approval → one finalized authority; one Deployment approval → one Deployment.
- Fixture target roots and their sentinel binding; the atomic `current.json` pointer; immutable version directories and operation records.
- Obsidian human regions (byte-for-byte) and managed-region determinism.
- Capability package integrity (canonical digests) and adapter-output integrity.
- Server configuration roots, aliases, and database connection metadata.
- Human confirmation phrases and typed rationale at every mutation boundary.

## Trust boundaries

1. Candidate text, packet payloads, instructions, triggers, license declarations, and dossier content are untrusted data; schemas and renderers treat them as content only.
2. PostgreSQL constraints/triggers, serializable transactions, row locks, and the migration ledger are trusted enforcement.
3. The export runtime (server-only) is the only path that resolves configured roots; browser code receives aliases, digests, and bounded diffs only.
4. Filesystem targets are untrusted until validated: sentinel file bound to the exact alias, owned real directory, no symlink at or below the root, no nested managed roots.
5. Review decisions arrive only through the existing exact-confirmation API; deployment/release decisions carry no disposition.

## Threat and control matrix

| Threat | Control | Evidence |
|---|---|---|
| Stale or replayed approval | exact subject digest/version binding, lock-version checks, serializable row locks, single-consumption primary key, idempotent replay returns stable receipt | exports store tests; review-decision behavior tests; publisher concurrency tests |
| Two deployments from one approval | `decision_consumers` PK + request-row serialization; second consumer gets `DECISION_ALREADY_CONSUMED` or stable existing receipt | Task 2/8 store and publisher tests |
| Unapproved/revoked Release planned or applied | `DeploymentService.createPlan` requires finalized authority (approval consumed by the Release record); `finalizeRelease` revalidates exact version/digest | plan.test.ts, release-candidate.behavior.test.ts |
| Tampered package, operation, marker, or preview after planning | operation, marker manifest, exact bytes, apply evidence, adapter output, and reproduced diff must all match the approved plan digests; joint operation+marker forgery fails `STALE_DEPLOYMENT` | publisher.ts revalidate + acceptance tests; caphub-publish tests |
| Path traversal / symlink escape | `resolveSafeDescendant` rejects `..`, absolute paths, backslashes, control chars, dot-only segments; lstat per segment rejects symlinks; root must be canonical real owned dir | paths.test.ts; filesystem.test.ts; publisher symlink test |
| Claiming `/`, home, workspace, or a nested vault | runtime + validator reject broad roots, home, `process.cwd()`, symlink roots, and any ancestor carrying a Caphub sentinel | paths.test.ts; runtime.test.ts |
| Foreign file overwrite | planner marks foreign files `conflict`; apply refuses with `PROJECTION_CONFLICT`; preimage revalidation raises `STALE_PREIMAGE` | planner/filesystem tests |
| Human region loss during updates | renderer parses exact human byte range and re-renders it byte-for-byte; human content containing Caphub markers is rejected | render/markers tests |
| Frontmatter/marker injection | renderer and adapters reject caphub markers and leading `---`; package schema rejects absolute paths and approval phrases in protected text | render.test.ts, adapters tests, schemas.test.ts |
| Non-deterministic output | canonical JSON (sorted keys, set-order permissions, LF text), deterministic YAML emitter, sorted file lists, digest-bound manifests | digest/render/adapter determinism tests |
| Browser leakage of roots/secrets | safe DTO mapping (aliases only), explicit leakage tests in query and component suites, E2E page-content audit | queries.test.ts, capability-export tests, E2E |
| Export side effects while disabled or after target mutation | read-only authority and fresh root/sentinel validation complete before lease creation, then repeat under lock on normal and realized crash-convergence paths before pointer reads or domain writes; layered gates throw before DB/managed-target mutation | runtime/publisher acceptance tests; caphub-export tests |
| Interrupted or partially materialized apply/publish | same-directory exclusive temp files, fsync, atomic rename; marker-less enumeration propagates symlink/non-regular failures; exact post-write verification precedes Registry mutation; operation records block new applies until reconcile | filesystem/publisher injected-failure and acceptance tests |
| Rollback destroys history | rollback writes a new Deployment and switches only the pointer; version directories and prior deployments retained | publisher rollback test, deployment behavior chain |
| Dependency advisory expansion | no new runtime dependencies in P4; `npm install` added zero new direct deps beyond existing lockfile | package.json diff |

## Decision invariants

- Candidate approval authorizes only the recorded disposition for one exact Candidate version; `build` stops at BuildProposal (P5), `watch` creates nothing.
- Release approval authorizes one exact Release version; finalization consumes it once with the Release record as consumer; deployment planning requires that finalized authority but never consumes it again.
- Every publish and rollback is a new exact plan, a new exact approval, and one new immutable Deployment.
- Reject is permanent; revoke is append-only and only while unconsumed.
- Browser routes remain read-only except the existing exact-confirmation review decision route; there is no publish/apply affordance in the UI.

## Residual boundaries

- Gates P4-A (Obsidian target), P4-B (adapter targets), and P4-C (publish/rollback) remain open Human gates; no real root is configured or written.
- Production PostgreSQL selection, migration rehearsal, backup/PITR, and P3-D remain pending as before.
- P2-A live structured-output compatibility is unrelated to this fixture-safe P4 implementation.
- Existing dependency advisories recorded before P4 remain a production-enablement gate; none were expanded by P4.
- Linear evidence: the existing P4 issue is updated in the same closeout batch as this record (repo-side); no duplicate issue is created.
