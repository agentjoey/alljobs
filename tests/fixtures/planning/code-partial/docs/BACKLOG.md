# Partial AllJobs Backlog

## AJ-B-001: Healthy Item

```yaml alljobs
id: AJ-B-001
work_mode: implementation
phase: phase-1
status: ready
priority: P0
dependencies: []
```

Healthy item body.

## AJ-B-002: Malformed Priority Item

```yaml alljobs
id: AJ-B-002
work_mode: implementation
phase: phase-1
status: ready
priority: INVALID_PRIORITY_P9
```

This item has an invalid priority and should produce a ProofIssue without breaking AJ-B-001.
