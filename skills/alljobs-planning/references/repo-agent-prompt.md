# Repo Agent Prompt — AllJobs Planning Files

**Usage:** paste the block below (everything inside the fenced area) verbatim into the
`CLAUDE.md` or `AGENTS.md` of a code project that AllJobs tracks. Agents working in that
repo will then create and maintain `docs/ROADMAP.md` and `docs/BACKLOG.md` in the format
AllJobs expects. No knowledge of AllJobs internals is required beyond this block.

---

````markdown
## Planning Files (AllJobs Integration)

This repository's planning state is read by AllJobs, a federated planning workbench.

### The contract

- This repo **owns** `docs/ROADMAP.md` and `docs/BACKLOG.md`. They are the **single
  source of truth** for this project's planning state.
- AllJobs reads them through a **read-only Git mirror**, refreshed on push. AllJobs
  never writes back to this repo.
- To make a planning change visible in AllJobs: edit the file, **commit and push**.
  Until you push, the change does not exist for AllJobs.

### Canonical format

Both files use the same section format:

- One level-2 heading per item: `## <ID>: <Title>` (single line; the ID must match the
  `id:` field in the metadata block below it).
- Immediately after the heading, one fenced metadata block tagged ```` ```yaml alljobs ````.
- Free-text body after the fence (Markdown allowed: paragraphs, `- ` bullets, `**bold**`,
  `` `code` ``, links, `###`/smaller headings).
- A **preamble** (anything before the first `## ` heading) is allowed for prose/charter
  and is ignored by the parser. Do NOT use `##` headings in the preamble — demote them
  to `###` or lower, or they will be parsed as items.

### `docs/ROADMAP.md`

Ordered development phases. Minimal example:

```markdown
## phase-1: Foundation

```yaml alljobs
id: phase-1
kind: phase
status: active
order: 10
focus: primary
```

Set up the project skeleton and core data model.
```

Fields: `id`, `kind` (`phase` or `milestone`), `status`
(`planned | active | paused | done | cancelled`), `order` (integer, unique across the
file), optional `focus` (`primary` or `normal`; at most one active phase may be
`primary`), optional `start` / `target` dates, optional `summary`.

### `docs/BACKLOG.md`

Single-file backlog items. Minimal example:

```markdown
## AJ-B-001: Implement Markdown parser

```yaml alljobs
id: AJ-B-001
work_mode: implementation
phase: phase-1
status: ready
priority: P0
dependencies: []
done_when: Parser unit tests pass on canonical fixtures.
```

Build the section parser for `## ID: Title` + `yaml alljobs` blocks.
```

Fields: `id`, `work_mode` (`implementation | operations`), `status`
(`idea | ready | doing | blocked | done | cancelled`), `priority` (`P0 | P1 | P2`),
optional `phase`, `owner`, `done_when`, `dependencies` (list of other backlog item IDs
in this file; no cycles), and a free-text body.

**Rules:**
- `implementation` items **MUST** set `phase` to an existing phase ID from
  `docs/ROADMAP.md`. `operations` items may omit `phase`.
- Keep roadmap and backlog consistent: closing a phase implies its items are
  `done`/`cancelled`; do not point `phase` at a nonexistent ID.

### ID rules

- IDs are **stable**: never rename an ID, never reuse a retired one. Closing an item
  retires its ID forever.
- Charset: `^[A-Za-z0-9][A-Za-z0-9_-]*$` (letters/digits/hyphens/underscores, starting
  with a letter or digit).
- Headings are single-line. Bodies must NOT contain `## ` headings or code fences
  (either would break parsing); use `###` or lower inside bodies.

### Maintenance discipline

- **Add**: append a new `## ID: Title` section with a fresh ID and a complete metadata
  block.
- **Update**: edit the metadata fields and/or body of the existing section in place.
- **Close**: set `status: done` (completed) or `status: cancelled` (abandoned). Keep the
  section in the file — never delete it; AllJobs relies on the history.
- **Publish**: `git add docs/ROADMAP.md docs/BACKLOG.md && git commit && git push`.
- **Self-check**: after editing, re-read the whole file and verify every section has a
  `## ` heading whose ID matches its `id:` field, a well-formed ```` ```yaml alljobs ````
  fence, valid enum values, and no stray `## ` headings or code fences in bodies.

### Legacy backlogs

If this repo still has a bullet-style backlog (`## ` groups, `### ID — Title` headings,
`- **Field**: value` bullets), convert it with the AllJobs CLI instead of rewriting by
hand (run inside the `alljobs` repo checkout):

```bash
npm run planning:convert -- <input.md> [--out docs/BACKLOG.md] [--roadmap-out docs/ROADMAP.md]
```

It prints `already canonical` and exits 0 when no conversion is needed.
````

---

## Full field reference

For the complete field-by-field contract (including Tasks and the project registry),
see [contracts.md](contracts.md) in this skill. The prompt block above is intentionally
self-contained for the *other* repo's agents; contracts.md is the authoritative reference
when working inside AllJobs itself.
