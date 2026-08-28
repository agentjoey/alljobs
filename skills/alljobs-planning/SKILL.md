---
name: alljobs-planning
description: Canonical planning skill for managing federated Roadmaps, Backlogs, and Tasks across code and business projects in AllJobs. Use when updating repo-owned planning files (docs/ROADMAP.md, docs/BACKLOG.md) or AllJobs-native business Milestones and Tasks.
---

# AllJobs Planning Skill

This skill governs how agents interact with project planning across the federated AllJobs ecosystem.

## 1. Core Principles

1. **Repo-Owned Planning for Code Projects**:
   - Code repositories own their own `docs/ROADMAP.md` (Phases) and `docs/BACKLOG.md` (Backlog).
   - AllJobs reads these files via read-only Git bare mirrors. AllJobs NEVER writes back to code repository files.
   - To make planning updates visible in AllJobs, commit and push changes to the repository's configured Git branch.

2. **AllJobs-Native Planning for Business Projects**:
   - Business projects maintain Milestones and Tasks directly in AllJobs (`data/roadmaps/<slug>.md`, `data/tasks/<slug>.md`).
   - Business projects do not have Backlog documents.

3. **Stable Identifiers & Section Formats**:
   - Every Phase, Milestone, Backlog Item, and Task uses a unique stable identifier (e.g. `phase-1`, `m-01`, `AJ-B-001`, `AJ-T-042`).
   - Sections use level-2 Markdown headings followed by a fenced ````yaml alljobs` block.

4. **Zero Silent Overwrites (Digest Protection)**:
   - Native mutations require Expected Digest verification to prevent concurrent write collisions (`STALE_WRITE`).

---

## 2. Agent Workflow Routing

- **For Code Repositories**: Read [references/code-project.md](references/code-project.md)
- **For Business / Native Projects**: Read [references/business-project.md](references/business-project.md)
- **For Schema Specifications**: Read [references/contracts.md](references/contracts.md)
- **To Onboard Another Repo**: Paste [references/repo-agent-prompt.md](references/repo-agent-prompt.md) into that repo's CLAUDE.md/AGENTS.md so its agents maintain `docs/ROADMAP.md` / `docs/BACKLOG.md` in canonical format.

---

## 3. Validation

Always validate modified planning documents before committing or applying:
```bash
npm run planning:skill:validate
```

---

## 4. Importing Non-Standard Backlogs

Code repositories that still keep a "bullet-style" backlog (`## ` group headings,
`### ID — Title` item headings, `- **Field**: value` bullets) can be converted to
the canonical section format with:
```bash
npm run planning:convert -- <input.md> [--out <path>] [--roadmap-out <path>]
```
- If the input already parses as canonical, the command prints `already canonical` and exits 0.
- Otherwise it maps legacy Status/Priority values onto the canonical enums, binds items to
  phases via `**范围**`/`**Scope**` lists (unbound items go to a `maintenance` phase), writes
  canonical backlog sections to `--out` (default: stdout) and roadmap sections to `--roadmap-out`.
- The command exits non-zero if any item is unmappable; review its summary before committing
  the result to the owning repository.
