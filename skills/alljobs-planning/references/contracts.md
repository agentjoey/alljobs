# AllJobs Planning Contracts Reference

## 1. Roadmap Item (Phase / Milestone)

```markdown
## phase-1: Foundation & Planning Core

\`\`\`yaml alljobs
id: phase-1
kind: phase
status: active
order: 10
focus: primary
start: 2026-08-26
target: 2026-09-15
\`\`\`

Description and human context.
```

## 2. Backlog Item

```markdown
## AJ-B-001: Implement Pure Markdown Parsers

\`\`\`yaml alljobs
id: AJ-B-001
work_mode: implementation
phase: phase-1
status: ready
priority: P0
rank: 100
owner: joey
dependencies: []
done_when: All parser tests pass cleanly.
\`\`\`

Task requirements and implementation guidelines.
```

## 2.1 Backlog ownership and ordering boundary

`rank` is a positive integer and must be unique within a `phase` + `priority` lane; it defines the order after Phase and Priority. A validated local working tree takes precedence over a mirror, remote commit, or cache projection. If the local source is invalid, it remains visible and non-writable rather than falling back to older content.

AllJobs may directly change only `priority` and `rank` on existing items, through an explicit proposal and Human Gate. It does not create Backlog items, change other fields, or run Git operations. New or substantive items require a repository agent to inspect the repository, choose a stable ID, verify Phase/dependencies, edit `docs/BACKLOG.md`, validate the project, and report the resulting diff and commit.

## 3. Task

```markdown
## AJ-T-042: Write domain unit tests

\`\`\`yaml alljobs
id: AJ-T-042
project: alljobs
status: doing
backlog: AJ-B-001
source:
  provider: native
\`\`\`
```
