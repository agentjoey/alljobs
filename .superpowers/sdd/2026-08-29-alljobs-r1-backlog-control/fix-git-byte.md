# Git Read and Raw-Byte Boundary Fix

Scope: Task 9 independent review P1 findings 1 and 3 only. No pilot, deployment, Pact, push, merge, or production action was performed.

## Changes

- Local working-tree Git reads now use a deny-external-command mode: hooks and fsmonitor are disabled, paging and interactive filters are suppressed, optional locks and lazy fetch are disabled, and the two reads remain fixed to HEAD/status facts.
- Local planning files are read as raw bytes. SHA-256 provenance and proposal/apply stale checks hash those original bytes.
- Planning text is decoded with fatal UTF-8 validation and an exact byte round-trip check, including preservation of a UTF-8 BOM. Invalid input is non-writable and proposal/apply fail closed without rewriting the file.

## RED evidence

Focused regression run before implementation failed in four expected places:

- repository-configured `core.fsmonitor` wrote the execution marker during a local planning read;
- malformed Backlog bytes produced the lossy decoded-text digest instead of their raw-byte digest;
- malformed UTF-8 remained writable and Proposal incorrectly succeeded;
- the strict UTF-8 decoder API did not yet exist.

## GREEN evidence

```text
npm test -- lib/planning/providers/git-runner.test.ts lib/planning/providers/local-working-tree.test.ts lib/planning/providers/source-resolver.test.ts lib/planning/native/digest.test.ts lib/planning/backlog/patcher.test.ts lib/planning/backlog/mutations.test.ts
Test Files  6 passed (6)
Tests       33 passed (33)

npm run typecheck
PASS

npx eslint <seven scoped source/test files>
0 errors; 1 pre-existing no-explicit-any warning in git-runner.ts

git diff --check
PASS
```

The malicious-repository fixture configures fsmonitor, filter, diff-driver, and pager commands to one marker executable and proves no marker is created. The byte fixtures prove distinct malformed sequences retain distinct digests, malformed UTF-8 is rejected with unchanged file bytes, and valid UTF-8 with a BOM round-trips exactly.
