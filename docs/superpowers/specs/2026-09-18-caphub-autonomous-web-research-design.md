# Caphub Autonomous Web Research Design

**Date:** 2026-09-18  
**Status:** Approved direction; written design pending Human Owner review  
**Scope:** Replace Caphub's source-URL-dependent research entry with one bounded MiniMax-M3 server-side web search, while keeping DeepSeek responsible for structured research and assessment.

## Decision

Caphub analysis must work when an image contains no source URL. The Human Owner has retired the rule that a Capture or an exact source-origin allowlist is required before research may start. Caphub may ask MiniMax-M3 to search the public web for sources inferred from the extracted entities, aliases, and claims.

The implementation uses the MiniMax OpenAI-compatible Responses API at `https://api.minimax.io/v1/responses` with the provider-hosted `web_search` server tool. DeepSeek's Responses API does not provide built-in web search, so DeepSeek remains the schema structurer and assessor after search evidence is collected.

## Goals

- Complete Capture-to-Review analysis without requiring `Capture.source_url` or an extracted URL.
- Let the model choose useful search queries from the V2 extraction result.
- Preserve evidence URLs and citation text so a reviewer can trace conclusions.
- Keep one bounded provider request, no automatic retry, deterministic limits, and metadata-only provider audit records.
- Re-analyze already terminal V2 Captures through a new immutable analysis-contract version.

## Non-goals

- General-purpose browsing, an interactive browser, crawling, authenticated pages, JavaScript execution, downloads, or form submission.
- A new search-vendor credential or a local MCP/CLI subprocess.
- Automatic approval, publication, installation, export, deployment planning, shell, Git, or code execution.
- Removing the existing explicit-URL fetch path. It remains available when a configured source policy permits it.

## Architecture

### Provider responsibilities

| Stage | Provider | Responsibility |
|---|---|---|
| Extraction observation | MiniMax-M3 | Observe the image |
| Extraction structuring | DeepSeek Flash | Produce Extraction Contract V2 |
| Web search | MiniMax-M3 | Search once and return cited public results |
| Research structuring | DeepSeek Flash | Build the research dossier from normalized evidence |
| Assessment | DeepSeek Flash | Compare the dossier with the Registry |
| Critic | MiniMax-M3 | Existing bounded critic behavior |

### Search adapter

Add a dedicated MiniMax web-search adapter rather than enabling arbitrary tools on the existing visual-observation provider. Its request contract is fixed:

- model: `MiniMax-M3`;
- one Responses API request;
- `tools: [{ "type": "web_search" }]` and no other tools;
- input contains only normalized entity names, aliases, domains, extracted claims, and unresolved questions;
- no image bytes, Capture object bytes, credentials, Registry snapshot, or local paths;
- no retry;
- a 120-second deadline;
- at most eight normalized cited results.

The response parser accepts a completed response with one final assistant message and URL citation annotations. Each retained citation must contain an HTTPS URL, a non-empty title, and non-empty citation content. The parser retains only normalized citations and digests; it does not persist search queries, provider reasoning, or the raw response.

### Evidence normalization

Search citations become inline `SourceCandidate` records. `buildResearchDossier` hashes their citation content directly rather than requiring the Control Host to fetch each result. Existing explicit URLs still use the current pinned HTTPS fetch path when configured.

Evidence tier is assigned deterministically:

- **A / official:** citation hostname exactly matches a domain extracted for the same entity;
- **A / repository:** recognized repository hosts such as GitHub or GitLab;
- **B / package:** recognized package registries such as npm or PyPI;
- **D / unknown:** all other results.

The search model cannot promote its own result to a stronger tier. Existing dossier identity checks remain in force: without A/B evidence, identity stays ambiguous and goes to human review rather than being silently confirmed.

### Workflow and audit

The research stage performs this sequence:

1. Build one bounded search brief from the extraction artifact.
2. Execute one audited MiniMax `web_search` operation.
3. Normalize and deduplicate up to eight HTTPS citations.
4. Add any explicit Capture URLs that are fetchable under the existing source policy.
5. Send normalized evidence to DeepSeek for the existing research schema.
6. Continue through assessment, critic, ReviewPacket, Registry, and Review Center.

`web_search` becomes an allowed model-call audit operation. Started and terminal events record provider, model, contract version, input/output digests, byte counts, token counts, finish status, and failure code. They never store the key, raw provider response, reasoning, or full searched page content. The call consumes the existing per-job provider-call and token budgets.

Search failure, timeout, quota exhaustion, malformed citations, or zero citations stops at the research stage with a precise human-review reason. It does not retry or fall back to invented evidence.

## Analysis Contract V3

Set the active contract to `caphub-analysis-v3`. The V3 job identifier hashes the Capture identity, object digest, and V3 contract label. A newly created V3 job may reference the terminal V2 job as its predecessor. Historical V1/V2 jobs and artifacts remain immutable and readable.

This version change is required because adding autonomous search changes the inputs, provider-call graph, evidence provenance, and observable outcome of the research stage. It also permits the existing real Capture to be re-analyzed without creating a duplicate Capture record.

## Configuration and deployment

- Reuse the existing private `MINIMAX_API_KEY`; add no credential.
- Keep `sourceAllowedOrigins` for the explicit-URL fetch path, but an empty list no longer disables model search.
- Keep exports and deployment targets disabled.
- Keep the application bound to `127.0.0.1:3456` behind the existing Tunnel and Access controls.
- Reload only `com.agentjoey.alljobs` after the final production build.

## Verification

Development follows RED-GREEN TDD and real-boundary BDD:

1. Adapter tests prove the exact `web_search` request, citation parsing, HTTPS filtering, limits, no retry, abort behavior, and redacted errors.
2. Research tests prove a no-URL extraction can reach DeepSeek using inline search evidence, while empty/malformed evidence stops before DeepSeek.
3. Service behavior tests prove V3 lineage, one search call, audit events, shared budgets, downstream ReviewPacket creation, and immutable V2 preservation.
4. Focused tests, typecheck, focused lint, production build, and deployment verification pass.
5. A no-Capture synthetic live search probe confirms the configured MiniMax credential and response shape.
6. After production reload, the existing Capture `cap_379e2508ead34c349fcb303bcd39eff2` receives one V3 canary run. Acceptance requires a research artifact with cited evidence, downstream assessment and ReviewPacket artifacts, a Review Center item, and complete provider audit events.

No push, merge, tag, release, or traffic change is part of this design unless separately authorized.

## Provider references

- [MiniMax Server Tools](https://platform.minimax.io/docs/guides/server-tools): `web_search` is available through the OpenAI-compatible Responses API and runs on MiniMax's server.
- [DeepSeek Responses API compatibility](https://api-docs.deepseek.com/guides/responses_api/): function tools are supported, but built-in `web_search` is ignored.
