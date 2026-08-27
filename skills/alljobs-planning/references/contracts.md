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
owner: joey
dependencies: []
done_when: All parser tests pass cleanly.
\`\`\`

Task requirements and implementation guidelines.
```

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
