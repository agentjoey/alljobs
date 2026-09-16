# Caphub P2 Worker Threat Model

**Status:** Focused independent design review PASS; implementation verification pending P2-C
**Scope:** P2 deterministic preprocessing, MiniMax extraction/critic, Kimi research/assessment, host-side evidence access, durable workflow, and ReviewPacket composition
**Out of scope:** approval UI, Registry release, Builder, Obsidian, deployment, publication, production enablement

## Protected assets

- MiniMax and Kimi credential values.
- Raw capture bytes and metadata.
- Control Host configuration and filesystem outside `<ALLJOBS_HOME>/state/caphub`.
- Repository source, Git metadata, SSH material, keychain, and production services.
- Versioned stage artifacts, model-call audit, and Human review state.

## Trust boundaries

1. Browser/Capture data entering immutable P1 storage is untrusted.
2. OCR, barcode payloads, URLs, source pages, and provider output are untrusted data.
3. Host orchestration, Zod schemas, exact-origin source policy, secure storage, and deterministic state transitions are trusted enforcement code.
4. MiniMax HTTPS transport is external and receives only the bounded extraction/critic payload.
5. Kimi API-key mode is a server-only direct structured-output HTTPS transport with no model-visible tools.
6. Kimi local-login mode is an external CLI process inside an ephemeral profile plus macOS Seatbelt sandbox and a fixed-target loopback egress proxy.
7. Human review is the only path from ReviewPacket to later approval/release phases.

## Worker profiles

### MiniMax extraction/critic

- Model-visible tools: none.
- Inputs: ordered normalized images, deterministic OCR/indicators, user note, or approved evidence plus versioned output contract.
- Denied by construction: file API, Shell, Git, install, repository access, deploy, publish, approval mutation, and delegation.
- Transport: `maxRetries: 0`, 60-second timeout, one application-level schema correction maximum.

### Kimi research/assessment

- Model-visible tools: none. Host-side evidence is resolved before the model call.
- API-key mode directly calls the fixed `https://api.kimi.com/coding/v1` endpoint with AI SDK structured output, `maxRetries: 0`, no tools, and the explicitly named server secret. It does not spawn Kimi CLI.
- Local-login mode strictly parses the existing Kimi configuration, accepts only the fixed managed provider/model plus its OAuth reference, rejects unsafe ownership/mode/symlinks, copies only referenced credential material, and generates a fresh temporary config without hooks, plugins, MCP, skills, services, custom headers, tools, or alternate endpoints.
- Local-login uses a custom `tools: []` agent, an empty disposable cwd, bounded stdout/stderr, process-group timeout termination, protected-read denial, and a loopback-only egress proxy. Its child environment is allowlisted rather than inherited; SSH, GitHub, cloud, package-manager, deployment, and unrelated credential variables are absent.
- Both modes implement the same provider-neutral structured request/result contract.

### Host-side source access

- Default state: disabled.
- Search: injected port only; there is no default live search adapter in P2.
- Fetch: exact approved HTTPS origins only, no URL credentials, DNS/IP private-range rejection, vetted-address pinning in the actual TLS connection, original-hostname SNI/certificate checks, connected-peer validation, redirect revalidation, compressed/decompressed byte and time limits, and content digesting.
- Fetched content is evidence data and cannot modify prompt policy, tools, budgets, workflow state, or approval state.

## Outer sandbox

The macOS Control Host launches only local-login Kimi through `/usr/bin/sandbox-exec`. The generated deny-default profile imports Apple's `system.sb` solely for platform runtime access, adds exact executable/ephemeral-root content reads plus metadata-only path traversal, permits writes only inside the exact ephemeral Kimi Home/cwd, denies repository/Git/default-Kimi/SSH/keychain/unrelated-user content reads, leaves process fork denied, and denies direct non-loopback network. The child reaches only a host loopback proxy; that proxy accepts the fixed Kimi/Auth HTTPS targets, pins vetted public addresses, validates peers, and never logs authorization headers or bodies. The sandbox profile, zero-tool agent, strict credential projection, and egress proxy are independent controls; failure of any control fails the run closed.

Hooks are not a security boundary because Kimi hooks fail open on hook error. P2 does not rely on hooks for tool or URL enforcement.

## Threat/control matrix

| Threat | Required control | Verification |
|---|---|---|
| Prompt injection requests Shell/Git/write/deploy | zero-tool profiles; no executor ports | hostile OCR/source BDD asserts zero calls |
| Provider output forges a valid stage | strict versioned Zod schemas and evidence citation checks | unknown-key, missing-citation, bad-version tests |
| Secret leakage to logs/audit | allowlisted child env; redacted metadata-only audit | secret canary absent from stdout/stderr/audit snapshots |
| Kimi reads repository, Git, SSH, keychain, default profile, or unrelated user data | Seatbelt exact-read allowlist and strict OAuth projection | real sandbox negative read probes |
| Kimi writes project or user files | Seatbelt write allow only ephemeral root | fixture process write outside root is denied |
| Kimi spawns Shell/Git | zero-tool agent and Seatbelt nested-process denial | tool-call event rejected; nested exec probe denied |
| Kimi exfiltrates through arbitrary network | direct egress denied; loopback proxy fixed to Kimi/Auth targets | non-loopback denial and proxy target-rejection tests |
| SSRF, DNS rebinding, or redirect escape | exact origin; vetted address pinned to TLS connection; peer validation repeated per redirect | loopback/private/mixed-DNS/rebinding/peer-mismatch/redirect tests |
| Unlimited cost/retry | concurrency 1; fixed input/output/total-token/call/preprocess/OCR/fetch bounds; transport retries 0; one schema correction | byte/token/call/deadline tests |
| Duplicate work after crash | deterministic call/stage IDs; immutable artifacts; terminal audit checks | crash at every stage and resume tests |
| Ambiguous identity becomes false fact | confirmed union requires A/B evidence; otherwise `IDENTITY_AMBIGUOUS` | ambiguity fixtures |
| Model self-approves or releases | ReviewPacket always requires Human review; no release/deploy port | schema and integrated BDD |
| Malicious image decompression/OCR exhaustion | input byte/image/pixel limits before OCR; single worker | oversized and pixel-bomb tests |
| Symlink/path traversal | existing secure Caphub root and no-follow file handles | traversal/symlink storage tests |

## Proposed P2-B implementation bounds

These bounds are safe for fixture-only implementation under the standing development authorization. They do not authorize live provider or live search traffic; those calls remain separately gated.

- Concurrency: 1.
- Images per job: 8.
- Aggregate image bytes: 40 MiB.
- Aggregate pixels: 80,000,000.
- Pixels per image: 40,000,000.
- Preprocessing/OCR deadlines: 60 seconds total and 15 seconds per image.
- MiniMax/Kimi timeouts: 60/120 seconds.
- Schema corrections: 1; transport retries: 0.
- Provider calls: 8 maximum per job including corrections and optional critic.
- Provider input bytes: 2 MiB extraction; 1 MiB each research/assessment/critic.
- Total reported provider tokens: 256,000 maximum per job.
- Search/fetch: 4 queries, 8 sources, 10-second fetch timeout, 2 MiB compressed and 4 MiB decompressed per source, 2 redirects.
- Model tools: none.
- Source origins: empty/disabled by default; exact HTTPS origins only when explicitly configured.
- Additional real provider requests: require separate Human authorization.

## P2-C independent verification checklist

- [ ] MiniMax adapter registers no tools and cannot reach file/Shell/Git/deploy code.
- [ ] Kimi agent file has `tools: []`; tool-call protocol events fail closed.
- [ ] API-key mode is a direct server-side structured-output HTTP adapter and local-login mode is the only CLI adapter; both share one request/result contract.
- [ ] Kimi child environment contains no unrelated credential variables.
- [ ] Local OAuth/config projection rejects symlinks, unsafe ownership/modes, unknown fields, hooks, plugins, MCP, tools, services, custom headers, and alternate endpoints.
- [ ] Real Seatbelt probes deny reads of repository/Git/default-Kimi/SSH/keychain/unrelated-user paths, writes outside the ephemeral root, and nested process execution after the approved Kimi runtime starts.
- [ ] Real Seatbelt probes deny direct non-loopback egress; the loopback proxy rejects every target outside the fixed Kimi/Auth set.
- [ ] Host source policy blocks unapproved origins, private addresses, DNS rebinding, peer mismatch, and redirect escapes while binding the vetted address to the actual TLS connection.
- [ ] One schema correction is the only permitted second provider call.
- [ ] Audit contains metadata/digests only, without reasoning, raw prompts, raw responses, or secrets.
- [ ] Crash/resume does not duplicate artifacts or audit events and does not repeat an interrupted provider call.
- [ ] ReviewPacket cannot approve, release, install, build, deploy, or publish.
- [ ] No real provider call, production enablement, service restart, deployment, push, merge, tag, or release occurs during fixture verification.

## Residual risks

- `sandbox-exec` is macOS-specific; P2 targets the current macOS Control Host. Another host requires a separately reviewed sandbox implementation.
- OCR and barcode libraries parse hostile media. Byte/pixel/time limits reduce risk but do not replace dependency updates and future sandboxing of native/WASM decoders.
- The 2026-09-16 read-only production dependency audit reported a direct critical advisory on existing `next@16.3.0` plus transitive findings through existing `shadcn`, `gray-matter`, and ESLint chains. None resolved through the five new Task 3 direct media/OCR dependencies. This is not authorization for an unplanned framework upgrade, but applicable runtime findings must be remediated and re-audited before any Caphub production enablement.
- Live search remains disabled until an exact provider and approved source policy are configured and separately verified.
- Successful P2-A probes prove provider compatibility only; they do not authorize production traffic or future provider requests.
