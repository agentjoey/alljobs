# R2 Management Assistant — Task 3: one-time source gates and safe read tools

Implement only Task 3 of the canonical R2 plan. Read the Brief, spec, plan Task 3, Task 2
handoff, and existing trusted-root/source resolver code first. Use RED -> GREEN real-filesystem
tests for digest-only, expiring, single-use source gates and fail-closed bounded file list/read.

Required: `createSourceGate`, `consumeSourceGate`, `rejectSourceGate`, `listProjectFiles`, and
`readProjectFiles`; reject traversal, absolute paths, every symlink, excluded directories/files,
non-regular/binary/NUL/oversize files, and post-gate escapes. Gates bind Project/question/manifest
digests, are atomic/single-use/expiring/rejectable, and store no question/history/source/answer or
reasoning. No shell, Git, provider, dependency, credential, route, UI, activity, write, or Task 4+
work. Do not revive history.

Run only Task 3 focused tests, typecheck and diff check; record RED/GREEN, scope and exact commit
in the R2 handoff; checkpoint `r2-source-gates` and stop for reviewer.
