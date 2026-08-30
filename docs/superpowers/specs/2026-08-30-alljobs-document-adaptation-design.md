# AllJobs Document Adaptation and Degradation Design

## Purpose

AllJobs must remain useful when a registered code project has planning documents
that are missing, only partly canonical, or written as ordinary Markdown. It
must do that without treating inferred data as repository truth or weakening
the existing `docs/ROADMAP.md` and `docs/BACKLOG.md` contracts.

This design adds a read-only adaptation layer around the current strict
parsers. It does not replace them, write documents, or create a general plugin
framework.

## Decision

Keep the current canonical parsers unchanged and add a small, internal
document-triage result for each Roadmap and Backlog source:

| State | Meaning | What AllJobs may show | What AllJobs may do |
| --- | --- | --- | --- |
| `canonical` | Strict parser returned valid canonical sections with no document-level blocking issue. | Official phases and Backlog items; normal planning health. | Existing canonical read behavior only. |
| `recoverable` | A document is present and readable, but strict parsing has isolated errors or only recognizable candidate structure. | Candidate sections, source excerpts, exact diagnostics, and freshness. | Offer a copy-only repository-agent handoff. |
| `unstructured` | Markdown is readable but has no trustworthy canonical section model. | File presence, compact outline/summary, and missing-field guidance. | Offer a copy-only standardization handoff. |
| `missing` | The fixed planning document path is absent. | Explicit missing-document state and the expected path. | Offer a copy-only creation handoff. |
| `unavailable` | Local, remote, and cache sources cannot provide a readable document. | Source failure and last known projection where one exists. | Read-only refresh guidance; no inferred content. |

Only `canonical` data participates in project counts, active-phase selection,
relations, Backlog ordering, or future agent-queue eligibility. The other
states are evidence and guidance, never a second planning source.

## Why this approach

Three alternatives were considered:

1. Make the current parser permissive. This would silently turn guesses into
   canonical priority, status, phase, or IDs, and would weaken R1 safeguards.
2. Require every repository to standardize before AllJobs shows anything. This
   is safe but gives no help at the moment users most need it.
3. Preserve the strict parser and add a read-only diagnostic/adaptation layer.
   This gives immediate orientation and a concrete route to canonical form
   without granting guessed data planning authority.

Option 3 is selected. It is bounded to the two fixed Markdown documents and
can be proven with fixtures before it is offered to additional sources.

## Data flow

```text
resolved local / mirror / cache bytes
        |
        +--> strict parser --> canonical projection --> relations and normal UI
        |
        +--> document triage --> health, candidates, diagnostics, handoff
                                      |
                                      +--> read-only degraded UI
```

The source resolver continues to select the Control Host working tree first.
Triage receives the exact bytes, source path, digest, revision, source mode,
and parser issues from that selected source. It never silently substitutes a
remote or cache copy when a readable local document is incomplete or invalid.

## Triage contract

The internal result is intentionally narrow:

```ts
type DocumentTriage = {
  document: "roadmap" | "backlog";
  state: "canonical" | "recoverable" | "unstructured" | "missing" | "unavailable";
  sourcePath: string;
  digest?: string;
  revision?: string;
  diagnostics: ProofIssue[];
  candidates: ReadonlyArray<{
    heading: string;
    line: number;
    evidence: string;
    confidence: "recognized" | "ambiguous";
    missingCanonicalFields: string[];
  }>;
  handoff?: string;
};
```

`candidates` are deliberately not `RoadmapItem` or `BacklogItem`. They have no
stable ID, phase relation, priority, rank, status, dependency, or mutability
until a repository agent places those fields in a canonical document.

## Recognition rules

Recognition is deterministic and evidence-preserving:

- Roadmap candidates come from meaningful Markdown headings such as `Phase`,
  `Milestone`, `R<number>`, or an ordered phase heading. A heading alone is a
  candidate, not a phase.
- Backlog candidates come from a task-like heading or checklist entry. Checkbox
  completion is displayed as source text and is never converted to canonical
  Backlog `status` automatically.
- Adjacent YAML is inspected only to report present or missing canonical keys.
  Invalid values remain diagnostics; no fallback value is inferred.
- Candidate confidence is `recognized` only when a deterministic source shape
  matches; otherwise it is `ambiguous` and shown as an outline, not an item.
- The first output always names the exact file, digest, revision, and source
  mode. An owner can verify every candidate against the document.

No natural-language model, semantic inference, or background analysis is part
of this layer. Those belong to the separately authorized R2 assistant and
remain owner-invoked.

## Source and integrity behavior

Missing fixed files must no longer collapse to a silent `0 Backlog` or `0
Roadmap`. The UI reports the missing path and offers a prepared handoff that
contains the current source digest/revision and the canonical template.

When the selected Control Host source is locally modified, AllJobs labels that
state and retains the local projection. If Git HEAD lacks one of the documents,
the absence is reported as provenance context; it does not erase a successfully
parsed local document. Any future direct write path remains blocked unless its
own complete-file digest and current-file reinspection pass.

Remote and cached projections remain read-only. A degraded local document never
falls back to an older mirror or cache merely to make a card look healthier.

## UI behavior

Project and Portfolio surfaces add a compact planning-health marker:

- `Canonical` shows the existing Roadmap and Backlog counts.
- `Needs attention` opens the exact document diagnostics and source evidence.
- `Missing document` names `docs/ROADMAP.md` or `docs/BACKLOG.md` and provides
  a copy-only repository-agent handoff.
- `Unstructured document` shows an outline marked "candidate" with missing
  canonical fields; it is visually distinct from the Backlog ledger.

The Backlog ordering editor, task creation relations, metrics, and future agent
queue render only canonical items. There is no drag, rank, priority, or apply
control in degraded states.

## Repository-agent handoff

Every non-canonical state can generate a copy-only handoff containing:

1. selected source path, source mode, revision, and digest;
2. exact parser diagnostics and candidate headings with line references;
3. the required canonical template for the missing document type;
4. an explicit instruction to choose stable IDs and validate relations in the
   repository's normal review workflow; and
5. a statement that AllJobs made no repository write, commit, push, merge,
   fetch, or agent-start action.

The handoff never claims approval and cannot apply a conversion.

## Delivery slices

1. **Triage core:** classify canonical, missing, and unavailable source bytes;
   preserve strict parser output and source provenance.
2. **Recoverable document support:** add deterministic heading/checklist
   candidates and diagnostics for the two fixed document types.
3. **Degraded UI and handoff:** render planning health, candidate evidence, and
   copy-only repository-agent standardization packages.
4. **Observed expansion only:** after two real repositories demonstrate the
   same additional format need, decide whether a shared adapter boundary is
   warranted. Do not pre-build a plugin platform.

## Verification requirements

- Unit fixtures cover canonical, partial, missing, unstructured, unreadable,
  local-modified, remote, and cached inputs for both document types.
- Each fixture proves that non-canonical candidates cannot enter relations,
  counts, ordering, or mutation controls.
- Component tests cover visible source/digest, diagnostics, missing-path
  guidance, and copy-only handoff content.
- Browser evidence covers desktop, 900px, and true 390px layouts, including
  keyboard access to the handoff action where present.
- A real AllJobs repository check verifies that a missing Backlog is shown as a
  missing source before canonicalization and as normal data after parsing.

## Non-goals

- automatic document conversion or repository writes;
- inferred IDs, phases, priorities, ranks, dependencies, or statuses;
- fallback from invalid local content to an older remote/cache copy;
- autonomous coding-agent invocation or background content analysis; and
- a general adapter or plugin framework before observed reuse proves one.
