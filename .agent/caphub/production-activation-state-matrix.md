# Caphub Production Activation state matrix

Date: 2026-09-17

This matrix binds the local-first P1–P4 activation surface. The Production
pilot suite uses only a sentinel-owned temporary home, PostgreSQL 17 cluster,
fixture providers, loopback server, and disabled export targets.

| State | Expected operator-visible result | Evidence |
|---|---|---|
| S0 inventory | Production remains unchanged; preflight inputs are metadata-only | Task 0 activation log; Task 7 preflight |
| S1 source frozen | Filesystem Capture inventory has an exact digest and is unchanged by dry-run/apply | production pilot `captureImport.sourceUnchanged` |
| S2 Registry-only | Exact Capture rows, objects, audits, migrations, backup, and isolated restore agree | production pilot and backup manifest |
| S3 Capture + Review + preview | New Capture reaches one Candidate review, one distinct Release review, finalized Release, neutral manifest, and three adapter previews | production pilot screenshots and DB assertions |
| S4 one real capability | Pending PA-C real-provider call and Human-selected source; not exercised by fixture evidence | Task 8 / PA-C |
| Caphub disabled | Safe-off response; no storage/provider work | existing capture/runtime focused tests |
| Registry unavailable | Safe `REGISTRY_UNAVAILABLE`; no fallback write | Registry route/runtime tests |
| Provider failure | Job stops terminally with safe code; no import | analysis workflow behavior tests |
| Source blocked | Research stops at Human review; no unrestricted fetch | source-policy/research behavior tests |
| Migration conflict | Digest or identity mismatch aborts without partial import | filesystem import behavior tests |
| Stale review | Exact-version decision fails and requires refresh | P3 Review Registry E2E |
| Candidate approved, unconsumed | Approval is revocable and cannot create a Release itself | P3 Review Registry E2E |
| Release approved, unfinalized | Capability detail says approved/unfinalized; no deployment | P4 package export E2E |
| Release finalized | Registry marks the exact Release decision consumed; deployment is still absent | production pilot |
| Unsupported adapter | Preview reports a publish block; no target write | P4 package export E2E |
| Targets disabled | Adapter previews remain read-only; no target root, plan, pointer, or Deployment exists | production pilot |

## Pilot invariants

- The fixture performs no real provider request, DNS fetch, target write, Git
  action, installation, publication, deployment, Production restart, or secret
  read.
- The app role retains no update/delete authority on append-only tables. Capture
  idempotency is serialized with a transaction-scoped advisory lock instead of
  `SELECT FOR UPDATE` on the append-only index.
- Registry-native completed analysis jobs bind their exact current Registry
  version during ReviewPacket import; filesystem-origin jobs remain version 1.
- Final screenshots contain no absolute path, database URL, credential, raw
  object key, Capture bytes, prompt, or provider response.
