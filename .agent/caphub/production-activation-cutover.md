# Caphub P1–P4 Production activation — S1 / Neon transition record

Date: 2026-09-17

Accepted evidence commit: `220683dd29a103be19ffe6d848dbf2dfc9a0cdf5`

## Authorization received

The Human authorized PA-B and explicitly authorized stopping
`com.agentjoey.alljobs` to enter S1.

## S0 and S1 evidence

- Deployment invariants: PASS.
- Metadata-only preflight: PASS and `readyFor: "PA_B"` before mutation.
- Runtime versions: Node.js `v24.14.0`, npm `11.9.0`, PostgreSQL `17.11`.
- Before S1, the AllJobs listener was running. After the authorized stop, its
  LaunchAgent was absent and `127.0.0.1:3456` had no listener.
- The last 200 lines of the normal application logs had zero Capture-write
  signatures. No live POST was issued.
- The filesystem Capture inventory remains 2 records at source digest
  `e00ec5b4aeef4b8a1e876b5145c42e062ac983627ac9fdb56379c830ee0f0725`.

## Transition decision

The local-first source-backup prerequisite could not be met because no approved
off-host or Time Machine destination was configured. The approved Neon revision
replaces that unavailable prerequisite with N2 immutable private remote-object
transfer and N4 recovery-branch proof. This record preserves the S1 evidence;
it is not proof of either Neon operation.

No local PostgreSQL cluster, database role, migration, LaunchAgent, application
configuration, secret reference, Capture import, provider call, target, push,
merge, build, reload, deployment, or Neon resource change has occurred in this
record. The application listener remains stopped and Caphub is safe-off.

## Next safe action

Obtain the fresh N1 Production Neon provisioning authorization. With the
listener still stopped, first create the private Object Storage/database
resources, then complete N2 object transfer before any Registry import.

## PA-D completion — 2026-09-18

The authorized Neon activation sequence N1 through N4 is complete, and the
accepted application candidate is now rebuilt and running from the dedicated
Control Host deployment worktree. The listener is bound only to
`127.0.0.1:3456`; the local Caphub route returned HTTP 200 after startup.

The final deployment evidence is recorded in
`.agent/caphub/production-activation-log.md` and its screenshot is retained in
`.agent/caphub/production-activation-screenshots/caphub-production-1440.png`.
This completion does not authorize a provider canary (PA-C), Capture input,
analysis, a target, export, publication, Git push, PR, `main` merge, tag, or
release.

## PA-C outcome — 2026-09-18

The separately authorized one-request Kimi `k3-256k` compatibility canary did
not return a schema-valid structured result. It was not retried. In accordance
with the approved failure handling, Caphub returned to S3: Capture/Registry and
read-only previews remain available, while analysis and every export/target
operation are disabled. The exact evidence is in
`.agent/caphub/production-activation-log.md`.
