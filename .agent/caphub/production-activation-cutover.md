# Caphub P1–P4 Production activation — PA-B execution record

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

## Stop condition

S1 source backup has **not** been created. `tmutil destinationinfo` reports no
configured destination; no mounted backup volume or configured restic, borg,
or rclone backup facility was found. A same-disk ad-hoc copy is not accepted as
the required off-host/Time Machine RPO evidence.

No PostgreSQL cluster, database role, migration, LaunchAgent, application
configuration, secret reference, Capture import, Registry backup, provider
call, target, push, merge, build, reload, or deployment action has occurred.
The application listener remains stopped and Caphub is safe-off.

## Next safe action

Provide or authorize configuration of one approved off-host or Time Machine
backup destination. With the listener still stopped, create and verify one
whole-tree source backup before resuming the remaining PA-B steps.
