# Caphub P4 Obsidian Projection and Capability Package Export Design

- Status: implementation-ready design
- Date: 2026-09-16
- Phase: P4
- Parent design: `docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`
- Roadmap: `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`
- Implementation plan: `docs/superpowers/plans/2026-09-16-caphub-obsidian-package-export.md`
- Intended implementer: KimiCode (`k3-256k`)
- Acceptance owner: Codex, followed by the applicable Human gates

## 1. Decision summary

P4 turns approved Registry knowledge into two deterministic, reviewable outputs:

1. a one-way Obsidian projection whose system-managed region can be rebuilt without changing the human-authored region; and
2. a platform-neutral, versioned Capability Package from which Codex, Claude Code, and Hermes previews can be rendered.

P4 does not publish automatically. Rendering, planning, and applying are separate stages:

```text
immutable Registry snapshot
  -> deterministic renderer
  -> immutable manifest and diff
  -> exact Human approval
  -> separately gated apply/publish
  -> append-only Deployment record and pointer
```

The Registry remains the source of truth. Obsidian and target-specific files are rebuildable projections. Git is a representation and review boundary, not a second mutable Registry.

The implementation is disabled by default and may write only to sentinel-owned temporary roots in automated tests. No real Vault, package repository, Codex home, Claude project, or Hermes home is configured or written during implementation or Codex acceptance.

## 2. Scope

### 2.1 In scope

- A strict `CapabilityPackageV1` schema and canonical digest.
- Release-candidate composition from an exact approved Candidate version.
- A separate exact-version Release review.
- A deterministic neutral package file tree and manifest.
- A one-way Obsidian projection with byte-preserved human regions.
- Pure Codex, Claude Code, and Hermes preview adapters.
- A `DeploymentPlanV1` that binds an exact target, adapter, diff, preimage, and current pointer.
- A separate Deployment review and single-consumption publication decision.
- Fixture-safe publish and rollback engines using immutable version directories plus an atomic pointer.
- Read-only Review Center and Capability detail states for P4.
- Forward-only PostgreSQL schema evolution, audit, lineage, recovery, and controlled verification evidence.

### 2.2 Out of scope

- Real Vault or Agent-directory configuration or writes.
- Bidirectional Obsidian synchronization or Obsidian-originated Registry changes.
- Automatic install, dependency resolution, tool enablement, command execution, Git operations, merge, deploy, or release.
- Dynamic scripts, executables, binaries, or downloaded resources inside P4 packages.
- BuildProposal implementation, Kimi Builder execution, or ImplementationAsset registration; those belong to P5.
- Runtime capability selection, automatic assembly, usage feedback, or update watching; those belong to P6.
- Plugin or MCP publication.
- A Next.js/framework upgrade or unrelated AllJobs cleanup.

## 3. Design choices

### 3.1 Selected architecture: deterministic four-stage export

P4 uses four explicit stages:

1. **Snapshot**: load immutable Registry versions and exact digests.
2. **Render**: produce a canonical neutral package or Obsidian document without filesystem side effects.
3. **Plan**: compare rendered files with a bounded target snapshot and produce a manifest, conflicts, and unified diff.
4. **Apply**: after an exact approval, revalidate all digests and atomically materialize the approved plan.

Each stage accepts and returns versioned, schema-validated values. The pure renderers are reusable in tests, UI previews, and CLI dry runs. Side effects exist only in narrowly scoped apply adapters.

### 3.2 Rejected alternatives

- **Direct adapter writes after Candidate approval** are rejected because Candidate approval does not approve a package version, target diff, or current target state.
- **Obsidian as the primary database** is rejected because edits, rename behavior, and filesystem races would weaken exact-version approval and lineage.
- **A mutable generated directory** is rejected because partial writes and in-place rollback cannot prove which release is active.
- **A single global publish approval** is rejected because a Codex preview, Claude preview, Hermes preview, Obsidian projection, publish, and rollback have different target state and risk.

## 4. Trust and authority boundaries

### 4.1 Trusted authorities

- PostgreSQL Registry immutable versions, lineage, ReviewRequests, ReviewDecisions, and decision-consumption records.
- Server-side Caphub configuration after strict validation.
- Code-shipped schemas, canonical serializers, renderers, and adapter versions.

### 4.2 Untrusted inputs

- Candidate text, instructions, references, filenames, URLs, and licenses.
- Existing Vault and target-directory contents.
- Markdown frontmatter and marker-like text in source material.
- Browser parameters, record IDs, review confirmations, and displayed diffs.
- Files returned by an earlier dry run after their preimage digest becomes stale.

Untrusted content is always data. It cannot choose paths, enable tools, inject frontmatter keys, create executable files, or alter approval text.

### 4.3 Authority rules

- Candidate approval authorizes only the recorded disposition for one exact Candidate version and digest.
- Release approval authorizes only one exact immutable Release version and package digest.
- Deployment approval authorizes only one exact `DeploymentPlanV1` version and digest.
- An approval can be consumed once by its named consumer record.
- Browser routes remain read-only except the existing exact-confirmation review decision route.
- Absolute target roots never appear in browser DTOs, ReviewPackets, logs, or Registry payloads. Registry records carry target aliases only.

## 5. Domain contracts

All objects are strict schemas with `schema_version: 1`. Unknown keys are rejected. Timestamps are RFC 3339 strings with offsets. SHA-256 digests are lowercase 64-character hexadecimal strings.

### 5.1 Identifiers

| Object | Format |
|---|---|
| Capability Package | `pkg_[a-f0-9]{32}` |
| Release | existing `rel_[a-f0-9]{32}` |
| Deployment Plan | `dpl_[a-f0-9]{32}` |
| Deployment | existing `dep_[a-f0-9]{32}` |
| Review Request | existing `rev_[a-f0-9]{32}` |
| Review Decision | existing `dec_[a-f0-9]{32}` |

IDs are deterministically derived from the canonical identity inputs plus schema version. They are not derived from display titles or filesystem paths.

### 5.2 `CapabilityPackageV1`

```ts
interface CapabilityPackageV1 {
  schema_version: 1;
  package_id: `pkg_${string}`;
  release_id: `rel_${string}`;
  release_version: number;
  version: string;                 // strict SemVer without a leading v
  slug: string;                    // lowercase kebab-case, 1..80 characters
  kind: "skill" | "experience_card" | "reference";
  title: string;
  description: string;
  triggers: string[];
  non_triggers: string[];
  instructions: string;
  permissions: string[];
  dependencies: PackageDependencyV1[];
  compatibility: PackageCompatibilityV1;
  resources: PackageResourceV1[];
  evidence: PackageEvidenceRefV1[];
  lineage: PackageLineageRefV1[];
  license: PackageLicenseV1;
  known_limits: string[];
  evaluations: PackageEvaluationV1[];
  created_at: string;
  digest: string;
}
```

The package digest is computed from canonical JSON excluding the `digest` field. The enclosing Registry version supplies the Release payload digest; it is deliberately not embedded in the package because that would create a circular hash. Object keys are sorted recursively, arrays retain semantic order unless their field contract explicitly says set-order, Unicode is preserved as UTF-8, and line endings are normalized to LF only in generated text fields.

Package content must not contain secrets, absolute local paths, approval tokens, shell command grants, or executable payloads. `license` records the declared license, source URL when available, and provenance confidence; missing or incompatible licenses block a target preview rather than being silently omitted.

### 5.3 `PackageFileV1`

```ts
interface PackageFileV1 {
  path: string;                    // normalized relative POSIX path
  media_type: "text/markdown" | "application/yaml" | "application/json";
  content: string;                 // UTF-8, LF line endings
  sha256: string;
  bytes: number;
}
```

Paths cannot be empty, absolute, contain `..`, backslashes, NUL, control characters, dot-only segments, or platform-reserved path components. Symlinks, hard links, devices, binaries, executable modes, and caller-chosen absolute paths are not representable.

### 5.4 Neutral package tree

The canonical Git representation is:

```text
packages/<slug>/<semver>/
├── package.yaml
├── instructions.md
├── policies.md
├── references/
│   └── <stable-resource-id>.md
├── experience/
│   └── <stable-card-id>.md
├── evaluation/
│   └── acceptance.yaml
└── provenance/
    └── lineage.json
```

The renderer returns a sorted `PackageFileV1[]`, a manifest digest, and an optional unified diff against a supplied bounded snapshot. It never invokes Git.

### 5.5 Release lifecycle

Candidate dispositions behave as follows:

| Approved disposition | P4 result |
|---|---|
| `adopt` | may compose a Release candidate |
| `adapt` | may compose a Release candidate from already registered, non-executable material |
| `learn` | may compose an `experience_card` or `reference` Release candidate |
| `build` | stops at BuildProposal; P5 owns implementation |
| `watch` | no package or Release is created |

A Release candidate is an immutable Registry `release` version with its neutral package payload and digest. Creating it atomically consumes the exact Candidate approval and creates lineage from Candidate to Release. It does not make the Release formal.

The existing `review_kind: "release"` is used for Release approval. A server-side finalization transaction revalidates the exact Release version/digest and consumes that approval with the Release record ID as consumer. The decision itself carries the version and digest; consumption makes it non-revocable. Only then is the exact version a formal `CapabilityRelease`. Deployment plans require this finalized authority but do not consume it again; every target action has its own Deployment approval. Reject and pre-finalization revoke remain append-only history. A later change creates another immutable version and another review; it never mutates an approved version.

### 5.6 `DeploymentPlanV1`

```ts
interface DeploymentPlanV1 {
  schema_version: 1;
  action: "publish" | "rollback";
  target: "codex" | "claude" | "hermes" | "obsidian";
  target_alias: string;
  release: {
    record_id: `rel_${string}`;
    version: number;
    digest: string;
  };
  adapter: {
    name: string;
    version: string;
    digest: string;
  };
  preview_manifest_digest: string;
  preview_diff_digest: string;
  expected_current_pointer: null | {
    deployment_id: `dep_${string}`;
    release_id: `rel_${string}`;
    release_version: number;
    release_digest: string;
    pointer_digest: string;
  };
  target_preimage_digest: string;
  created_at: string;
}
```

P4 adds Registry record kind `deployment_plan`, ID prefix `dpl_`, Review kind `deployment`, and Review subject kind `deployment_plan`. The confirmation forms are:

```text
APPROVE DEPLOYMENT <short-id>
REJECT DEPLOYMENT <short-id>
REVOKE DEPLOYMENT <short-id>
```

Each publish and rollback creates a new plan and decision. An approved decision is consumed atomically by one new immutable `deployment` record. Rollback creates a new Deployment pointing to a previously approved Release; it never deletes a version or Deployment.

## 6. Registry and PostgreSQL evolution

P4 adds forward-only migration `003_exports.sql`. The checksums of `001_registry.sql` and `002_read_models.sql` remain unchanged.

Migration 003 must:

- extend record-kind constraints and ID-prefix checks with `deployment_plan`;
- extend review-kind and subject-kind constraints with `deployment` and `deployment_plan`;
- add `release:proposes:deployment_plan` and `deployment_plan:realized_as:deployment` lineage while preserving existing relationships; a successful P4 deployment also retains the existing direct `release:deployed_as:deployment` edge for efficient lineage queries;
- retain immutable-version, append-only audit, single-decision, and single-consumption rules;
- add only the indexes/read models needed for P4 queries;
- grant the application role only the least privileges required by existing store functions;
- remain checksum-verified and idempotently recognized by the migration runner.

Migration 003 must not rewrite historical records or infer Release/Deployment state from files.

## 7. Obsidian projection

### 7.1 Logical structure

P4 renders the approved parent-design structure under a configured target alias:

```text
Caphub/
├── 00 Inbox/
├── 10 Tools/
├── 20 Capabilities/
├── 30 Methods/
├── 40 Evidence/
├── 50 Build Proposals/
├── 60 Projects/
├── 70 Deployments/
├── 80 Reviews/
├── 90 Maps/
└── Attachments/
```

The Registry supplies system content and stable logical paths. Source titles never become paths without slug validation and collision handling.

### 7.2 Managed and human regions

Every owned Markdown page has exactly these markers:

```markdown
---
caphub_schema: 1
caphub_record_id: rel_...
caphub_record_version: 1
caphub_record_digest: ...
caphub_managed_digest: ...
---
<!-- caphub:managed:start -->
...deterministic system content...
<!-- caphub:managed:end -->
<!-- caphub:human:start -->
## 我的判断

## 使用经验

## 可以组合的能力

## 后续想法
<!-- caphub:human:end -->
```

YAML property keys are unique and system-owned. The entire human region, including whitespace and line endings as read, is preserved byte-for-byte on an update. The managed region is rebuilt from Registry data only.

An existing file is a hard projection conflict if it has no exact Caphub ownership marker, duplicated/unbalanced/reordered markers, malformed frontmatter, a different stable record identity, or a changed preimage. P4 never guesses how to merge such a file.

### 7.3 Projection manifests and digests

Each projection plan records:

- stable Registry record identity, version, and digest;
- relative target path;
- managed-content digest;
- complete materialized preimage digest or `null` for a new file;
- complete proposed postimage digest;
- action `create | update | unchanged | conflict | orphan`;
- conflict reason when applicable.

The managed-content digest proves deterministic rebuild. The materialized preimage digest prevents stale writes while allowing human content preservation. Ordinary apply never deletes files; records no longer projected are reported as `orphan` for a later separately approved cleanup policy.

### 7.4 Safe filesystem boundary

- The configured Vault root must be an explicit absolute path approved at Gate P4-A.
- It must be a real directory, not `/`, a home directory, the AllJobs workspace root, or a symlink.
- Every descendant is resolved under the root; traversal and symlink escape are rejected.
- A sentinel file binds the root to Caphub and the configured target alias.
- Temporary writes use same-directory exclusive files, `fsync`, and atomic rename.
- Only one apply process may hold the target lock.
- A failed apply leaves a recovery record and refuses another apply until reconciliation.

The implementation and automated tests use only freshly created sentinel-owned temporary roots.

## 8. Platform adapters

Adapters are pure functions from `CapabilityPackageV1` to a sorted target file set plus diagnostics. They do not receive filesystem handles and do not publish.

### 8.1 Common representation

P4 targets the common Agent Skills shape: a lean `SKILL.md` with supporting `references/`, `templates/`, or `assets/` only when the neutral package contains safe text resources. Platform-specific metadata must not change neutral-package semantics.

P4 emits no script or executable directory, no dynamic installer, no dependency download, and no automatic tool permission. Unsupported package kinds or permissions fail closed with `ADAPTER_UNSUPPORTED`.

### 8.2 Logical destinations

| Adapter | Preview destination |
|---|---|
| Codex | `$CODEX_HOME/skills/<slug>/SKILL.md` |
| Claude Code | `.claude/skills/<slug>/SKILL.md` |
| Hermes | `~/.hermes/skills/<category>/<slug>/SKILL.md` |

These are display labels, not paths trusted from Registry or browser input. The real root is a server configuration value approved at Gate P4-B/P4-C and is never included in client DTOs.

Each adapter records its name, semantic version, source-code digest, compatibility assumptions, license result, input package digest, output manifest digest, and diagnostics. The same input and adapter version must produce the same bytes and manifest digest.

## 9. Publish and rollback

### 9.1 Versioned materialization

A fixture target uses this logical layout:

```text
<target-root>/
├── .caphub-target.json
├── versions/
│   └── <release-id>/<release-version>/<manifest-digest>/...
├── current.json
└── operations/
    └── <deployment-id>.json
```

Publish writes a complete immutable version directory, verifies every file digest, persists an operation record, and atomically replaces the small `current.json` pointer. It never mutates an existing version directory. A retry with the same approved plan and deployment ID is idempotent.

Rollback validates that the prior Release is still present and approved, writes a new operation record, and atomically changes the pointer. The resulting Deployment links the prior and new active pointers.

### 9.2 Apply-time revalidation

Immediately before a side effect, the engine revalidates:

- exports and target config remain enabled;
- the Release approval is exact and finalized through its Release consumer record;
- the Deployment decision is exact, approved, and unconsumed;
- Registry versions and digests match the plan;
- adapter name/version/digest match the plan;
- preview manifest and diff digests reproduce exactly;
- target sentinel, preimage digest, and expected current pointer match;
- no symlink or unsafe path appeared since planning.

Any mismatch fails before writing or consuming approval. After immutable files are durable, decision consumption, Deployment record creation, and pointer change follow a recovery-aware sequence whose state can be reconciled without inventing a second Deployment.

## 10. Configuration

P4 extends the strict Caphub configuration with defaults equivalent to:

```json
{
  "exports": {
    "enabled": false,
    "obsidian": {
      "enabled": false
    },
    "packageRepository": {
      "enabled": false
    },
    "targets": {
      "codex": { "enabled": false },
      "claude": { "enabled": false },
      "hermes": { "enabled": false }
    }
  }
}
```

Root-path fields are optional and absent from the example configuration until a gate approves them. When supplied, they must be explicit absolute paths, validated server-side, and paired with a fixed alias. No environment variable value, credential, token, or browser-provided path is accepted.

The master `caphub.enabled`, `registry.enabled`, `exports.enabled`, and target-specific `enabled` switches must all permit an operation. Defaults are false at every layer.

## 11. User interface

P4 reuses the existing Paper Workbench components and routes. It does not introduce a redesign or reinstate the retired frontend-design workflow.

`/capabilities/[id]` adds read-only sections for:

- Release candidate status and exact digest;
- package file manifest and neutral-package diff;
- Obsidian projection plan/conflicts;
- Codex, Claude Code, and Hermes adapter previews;
- Deployment plan, current pointer, and rollback history.

`/reviews` adds `release` and `deployment` review detail where applicable, exact confirmation text, the bound diff/manifest digests, target alias, stale state, and decision-consumption state. It never exposes absolute roots or file contents outside the approved bounded preview.

The focused P4 state matrix is:

| State | Required presentation |
|---|---|
| no Release candidate | explain eligible dispositions and next review |
| Release waiting | exact version/digest and neutral package diff |
| Release approved | immutable approval and adapter previews |
| Release rejected/revoked/superseded | history retained; publish unavailable |
| adapter unsupported/license blocked | explicit diagnostic, no publish action |
| projection conflict/stale preimage | conflicting relative file and safe remediation |
| Deployment planned/waiting | target alias, action, exact diff digest |
| Deployment approved/unconsumed | readiness only; no browser auto-apply |
| deployed | active and prior pointer with append-only record |
| rollback planned/applied | new plan/decision/deployment chain |
| Registry/exports disabled | fail-closed disabled state |
| Registry unavailable | generic unavailable state without secret/path leakage |

## 12. Error taxonomy

Stable P4 error codes are:

| Code | Meaning |
|---|---|
| `P4_EXPORT_DISABLED` | an enablement layer is false |
| `INVALID_PACKAGE` | package schema or canonical digest is invalid |
| `PACKAGE_DIGEST_CONFLICT` | same identity resolves to different bytes |
| `PROJECTION_CONFLICT` | ownership/marker/frontmatter rules do not permit a safe update |
| `UNSAFE_TARGET_ROOT` | root, sentinel, descendant, or symlink boundary is unsafe |
| `STALE_PREIMAGE` | a planned target file changed |
| `ADAPTER_UNSUPPORTED` | target cannot represent the package safely |
| `DEPLOYMENT_NOT_APPROVED` | no exact valid Deployment decision exists |
| `DEPLOYMENT_ALREADY_CONSUMED` | the approval already authorized another consumer |
| `STALE_DEPLOYMENT` | current pointer or Registry digest changed |
| `PUBLISH_RECOVERY_REQUIRED` | an interrupted operation must be reconciled |

Errors returned to browser clients omit paths, SQL details, secrets, and raw target content.

## 13. Test and evidence strategy

### 13.1 TDD and BDD

Every implementation task begins with a focused failing test. The cross-boundary behavior suite proves:

```text
exact Candidate approval
  -> immutable Release candidate
  -> exact Release approval
  -> reproducible package and adapter previews
  -> exact Deployment plan
  -> exact Deployment approval
  -> fixture publish and pointer
  -> separately approved fixture rollback
```

The behavior suite uses a temporary PostgreSQL 17 cluster and sentinel-owned temporary filesystem roots. It never receives a real Vault or Agent root.

### 13.2 Determinism and safety properties

Tests must prove:

- repeated canonical serialization produces identical digests;
- shuffled input map order does not change generated bytes;
- deleting and rebuilding a managed fixture tree produces the same managed digest;
- the human region survives updates byte-for-byte;
- foreign, malformed, stale, symlinked, or out-of-root files are never overwritten;
- an unapproved/revoked/stale Release or Deployment cannot apply;
- an approval cannot be consumed twice under retry or concurrency;
- interrupted publish is reconciled idempotently;
- rollback creates history and never deletes versions;
- all browser DTOs exclude absolute roots and internal errors.

### 13.3 Controlled final verification

The phase has one final full gate: unit/component/behavior tests, typecheck, lint, build, deployment invariant verification, focused P4 browser E2E, and final-build screenshots at 1440px and true 390px device metrics. It then receives one scoped independent Review and one scoped independent Verification.

During implementation, each task runs only its direct tests. A fix reruns the affected tests and affected review finding, not the whole suite. The full suite is not repeated per task or per reviewer.

## 14. Gates and authorization

### Gate P4-A: Obsidian target

Human approval is required for the exact Vault absolute path, backup strategy, Caphub sentinel ownership, marker contract, and first dry-run manifest/diff. The implementation may stop before any real write even after the dry run.

### Gate P4-B: adapter target

Each of Codex, Claude Code, and Hermes requires separate approval of its contract, license result, real root, and first target preview. Approval of one target does not authorize another.

### Gate P4-C: publish or rollback

Every real publish and rollback requires an exact Release approval plus a separate exact Deployment approval. Standing authorization, a passed test, or a previous deployment does not substitute for this gate.

### Additional hard stops

Stop for credentials/secrets, production database or migration, real provider/model calls, real target configuration or writes, deletion, destructive Git, push/PR/merge/tag/release/deploy, unresolved security/review/test blockers, architecture-changing conflicts, or expansion into install/code execution/build/deployment capabilities.

## 15. Acceptance criteria

P4 implementation is ready for Codex acceptance when all of the following hold:

1. The approved Candidate-to-Release and Release-to-Deployment chains are exact-version, append-only, and independently approved.
2. Neutral packages, adapter previews, and managed Obsidian content are deterministic and digest-bound.
3. Human Obsidian regions are preserved byte-for-byte and unsafe conflicts fail closed.
4. No unapproved, revoked, stale, or already-consumed decision can write a fixture target.
5. Publish and rollback are idempotent, pointer-based, recoverable, and retain all history.
6. Browser surfaces are read-only except existing explicit review decisions and reveal no absolute roots or secrets.
7. All P4 configuration is disabled by default and the delivered configuration contains no real roots.
8. Only sentinel-owned temporary roots were written during implementation and verification.
9. Focused tests, the one final full gate, scoped independent Review, scoped independent Verification, final-build screenshots, commit evidence, roadmap status, and Linear evidence are recorded.
10. KimiCode hands off a clean, bounded local branch without push, merge, deploy, or production mutation for Codex acceptance.

## 16. External format references

- Claude Code skills: <https://code.claude.com/docs/en/skills>
- OpenAI Skills: <https://openai.com/academy/skills/>
- OpenAI skill authoring reference: <https://github.com/openai/skills/blob/main/skills/.system/skill-creator/SKILL.md>
- Hermes Agent skills: <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md>
- Obsidian Properties: <https://obsidian.md/help/properties>

These references inform adapter shape and frontmatter conventions only. The Registry contracts and this specification remain authoritative for Caphub.
