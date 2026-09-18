# Caphub Neon Privilege-Boundary Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Caphub readiness accurately represent the Human-accepted Neon project-admin credential boundary while retaining strict local PostgreSQL privilege checks.

**Architecture:** `checkRegistryReadiness` continues collecting its redacted, deterministic evidence and exposes a boundary label selected solely by the configured connection mode. Managed TLS accepts Neon’s unavoidable inherited administration only after all identity, TLS, ledger, trigger, and direct-role-membership checks pass; local Unix-socket mode retains its existing role-attribute and effective-privilege checks. The production preflight validates and emits the label without exposing connection details.

**Tech Stack:** TypeScript 5, Node.js, PostgreSQL/`pg`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-caphub-neon-privilege-boundary-revision.md`

## Global Constraints

- This plan supersedes only the PostgreSQL-role least-privilege assumption in `docs/superpowers/specs/2026-09-17-caphub-neon-production-activation-design.md`; all P1–P4 scope and existing safe-off gates remain unchanged.
- Managed TLS requires the exact configured database hosts, verified TLS, exact `caphub_app`/`caphub_migrator` identities, database `caphub`, `caphub_migrator` ownership, no direct application/migrator membership, checksum-exact migrations, and all append-only triggers.
- Managed TLS reports `databasePrivilegeBoundary: "neon_project_admin_accepted"`; it must not claim that PostgreSQL prevents migrations or append-only updates.
- Local Unix-socket mode retains the existing `NOINHERIT`, role-attribute, no-migration, and no-append-only-update readiness checks, and reports `databasePrivilegeBoundary: "database_role_least_privilege"`.
- Readiness and preflight output must remain redacted: no URL, hostname, username, credential, object key, Capture content, browser-selectable boundary, export policy, or provider/target behavior is added or changed.
- Do not reload the production service, invoke a provider, write a target, push, merge, deploy, release, or remove a Neon resource as part of implementation.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/caphub/registry/operations.ts` | Computes the mode-bound readiness label and applies the correct strict or accepted privilege predicate. |
| `lib/caphub/registry/operations.test.ts` | Exercises strict local readiness and a managed-TLS accepted-admin condition through a real test PostgreSQL boundary. |
| `scripts/caphub-production-preflight.ts` | Allowlist-validates and redacts the new readiness field, including unavailable evidence. |
| `scripts/caphub-production-preflight.test.ts` | Proves preflight emits the managed label and rejects a label that does not match the connection mode. |
| `.agent/caphub/production-activation-log.md` | Records only the resulting redacted verification facts and current activation state. |
| `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md` | Records the completed narrow contract revision and remaining N3/N4 work. |

### Task 1: Mode-bound readiness and preflight contract

**Files:**
- Modify: `lib/caphub/registry/operations.ts:39-50, 209-249`
- Modify: `lib/caphub/registry/operations.test.ts:145-191`
- Modify: `scripts/caphub-production-preflight.ts:64-96, 158-171`
- Modify: `scripts/caphub-production-preflight.test.ts:27-44, 104-123`

**Interfaces:**
- Produces `RegistryReadinessReport.databasePrivilegeBoundary` with the literal values `"database_role_least_privilege"`, `"neon_project_admin_accepted"`, or `"unavailable"`.
- `checkRegistryReadiness({ appPool, migrationPool, connectionMode, expectedSocketDir })` returns `ready: true` for managed TLS only when the non-privilege invariant set is intact; local mode additionally requires strict role/effective-privilege checks.
- `createProductionPreflightReport(snapshot)` copies only a syntactically valid, mode-consistent boundary label into its redacted report.

- [x] **Step 1: Write failing managed-TLS and preflight tests.**

  Add an elevated-role fixture after the successful local readiness test. Create a non-login `neon_superuser` role through the existing test-cluster superuser, grant it to `caphub_app`, change `caphub_app` to `INHERIT`, and grant it `CREATE` on schema `caphub`, migration-ledger writes, and update/delete on the append-only tables through `migrationPool`. This safely models the managed inherited-admin fact inside the disposable test cluster without granting the application role direct membership of `caphub_migrator`.

  First prove that the same elevated state is still rejected in local mode:

  ```ts
  const local = await checkRegistryReadiness({
    appPool, migrationPool, connectionMode: "local_socket", expectedSocketDir: postgres.socketDir
  });
  expect(local).toMatchObject({
    databasePrivilegeBoundary: "database_role_least_privilege",
    appCanMigrate: true,
    appCanUpdateAppendOnly: true,
    ready: false
  });
  ```

  Then evaluate the exact same pools with `connectionMode: "tls_verify_full"`. The current implementation still requires the strict predicate and has no field, so this assertion is deliberately RED.

  ```ts
  it("reports the accepted Neon project-admin boundary for managed TLS", async () => {
    const report = await checkRegistryReadiness({
      appPool, migrationPool, connectionMode: "tls_verify_full", expectedSocketDir: postgres.socketDir
    });

    expect(report).toMatchObject({
      connectionMode: "tls_verify_full",
      tcpListenAddresses: "managed_tls",
      databasePrivilegeBoundary: "neon_project_admin_accepted",
      appCanMigrate: true,
      appCanUpdateAppendOnly: true,
      ready: true
    });
  });
  ```

  Extend the local complete-report assertion with:

  ```ts
  databasePrivilegeBoundary: "database_role_least_privilege",
  ```

  In the preflight fixture, add `databasePrivilegeBoundary: "database_role_least_privilege"`. Extend its managed TLS test to require the accepted label and add a malformed combination rejection:

  ```ts
  expect(() => createProductionPreflightReport({
    ...managed,
    postgres: { ...managed.postgres, databasePrivilegeBoundary: "database_role_least_privilege" }
  })).toThrow("PREFLIGHT_UNSAFE_REPORT");
  ```

- [x] **Step 2: Run focused tests and verify RED.**

  Run:

  ```bash
  pnpm exec vitest run lib/caphub/registry/operations.test.ts scripts/caphub-production-preflight.test.ts
  ```

  Expected: TypeScript test compilation or assertions fail because `databasePrivilegeBoundary` is absent from `RegistryReadinessReport`; do not change production implementation before observing this failure.

- [x] **Step 3: Implement the smallest mode-specific predicate.**

  In `operations.ts`, declare the boundary union and add it to `RegistryReadinessReport`:

  ```ts
  export type DatabasePrivilegeBoundary =
    | "database_role_least_privilege"
    | "neon_project_admin_accepted"
    | "unavailable";
  ```

  Select the label from the connection mode inside `checkRegistryReadiness`:

  ```ts
  const databasePrivilegeBoundary = input.connectionMode === "tls_verify_full"
    ? "neon_project_admin_accepted"
    : "database_role_least_privilege";
  const privilegeBoundaryReady = input.connectionMode === "tls_verify_full"
    ? true
    : exactRoles && !appCanMigrate && !appCanUpdateAppendOnly;
  ```

  Replace only the former unconditional `exactRoles`, `!appCanMigrate`, and `!appCanUpdateAppendOnly` readiness conjuncts with `privilegeBoundaryReady`. Keep collection of those booleans for honest redacted diagnostics; keep exact identities, direct-role membership, database ownership, version/transport, checksum ledger, required application privileges, and trigger-count checks unconditional. Return the selected label.

  In `caphub-production-preflight.ts`, reject every label outside the three literals. Require `"database_role_least_privilege"` for available `local_socket` evidence and `"neon_project_admin_accepted"` for available `tls_verify_full` evidence. Require `"unavailable"` when PostgreSQL is unavailable. Copy the validated label into the allowlisted output, and set it to `"unavailable"` in `unavailableRegistry`.

- [x] **Step 4: Run focused GREEN verification.**

  Run:

  ```bash
  pnpm exec vitest run lib/caphub/registry/operations.test.ts scripts/caphub-production-preflight.test.ts
  pnpm typecheck
  pnpm exec eslint lib/caphub/registry/operations.ts lib/caphub/registry/operations.test.ts scripts/caphub-production-preflight.ts scripts/caphub-production-preflight.test.ts
  ```

  Expected: all focused tests pass, TypeScript has no errors, and lint is clean. The local test still proves the strict boundary; the managed-TLS test proves the accepted label without changing any local privileges.

- [x] **Step 5: Record the code change in a focused commit.**

  ```bash
  git add lib/caphub/registry/operations.ts lib/caphub/registry/operations.test.ts scripts/caphub-production-preflight.ts scripts/caphub-production-preflight.test.ts
  git commit -m "fix(caphub): model Neon privilege boundary"
  ```

### Task 2: Redacted N3 evidence and state record

**Files:**
- Modify: `.agent/caphub/production-activation-log.md`
- Modify: `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`

**Interfaces:**
- Consumes the committed code contract and its focused test/type/lint results.
- Produces an append-only, redacted record stating the managed-TLS boundary label, test scope, and that N3 registry import is conditional on a fresh ready report whose source digest equals the N2 attestation.

- [x] **Step 1: Add no production code; write the factual evidence entries.**

  Record only: this plan/spec path, the mode-bound field names and label values, focused test/type/lint outcomes, the current code commit, and the next safety condition. Do not include any database URL, host, username, credential, private file path, object key, capture data, or command arguments containing secrets.

- [x] **Step 2: Verify evidence is redacted and consistent.**

  Run:

  ```bash
  rg -n 'postgresql://|https?://|CAPHUB_.*=|caphub_app:|caphub_migrator:|sha256/' .agent/caphub/production-activation-log.md docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md
  ```

  Expected: no new secret, URL, credential, or object-key disclosure caused by this record. Manually compare the state wording with the output fields in Task 1.

- [x] **Step 3: Commit the evidence record.**

  ```bash
  git add .agent/caphub/production-activation-log.md docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md docs/superpowers/plans/2026-09-18-caphub-neon-privilege-boundary-revision.md
  git commit -m "docs(caphub): record Neon privilege revision"
  ```

## Plan self-review

- **Spec coverage:** Task 1 implements every required managed-TLS/local distinction, status label, and redaction rule. Task 2 preserves the required activation evidence and does not expand into reload, provider, target, release, or resource removal.
- **Placeholder scan:** The plan contains exact fields, files, test commands, expected outcomes, and implementation predicate; it has no deferred implementation markers.
- **Type consistency:** `DatabasePrivilegeBoundary`, `RegistryReadinessReport.databasePrivilegeBoundary`, and the three literal values are used consistently by readiness, preflight, tests, and unavailable snapshots.
