# AllJobs Backlog

Canonical backlog for AllJobs implementation.

## AJ-B-001: Pure Markdown Parsers

```yaml alljobs
id: AJ-B-001
work_mode: implementation
phase: phase-1
status: ready
priority: P0
owner: joey
dependencies: []
done_when: All parser tests pass and section replacement preserves surrounding bytes.
```

Implement pure section splitting and YAML metadata extraction.

## AJ-B-002: Atomic Storage

```yaml alljobs
id: AJ-B-002
work_mode: implementation
phase: phase-1
status: ready
priority: P0
owner: joey
dependencies:
  - AJ-B-001
```

Digest-protected atomic writes with file locking.
