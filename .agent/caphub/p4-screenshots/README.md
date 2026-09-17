# Caphub P4 final-build screenshots

All captures come from the production build (`next build` + `next start`) bound to the exact
final implementation commit recorded in `.agent/caphub/p4-implementation-log.md`. Browser
captures use true 390px device metrics via Playwright (never raw headless Chrome
`--window-size=390`). The fixture PostgreSQL cluster and fixture Vault/target roots are
sentinel-owned temporary directories created by `tests/e2e/caphub-package-export-fixtures.ts`.

| File | Route | Viewport | State |
|---|---|---|---|
| `capability-waiting-1440.png` | `/capabilities/<waiting-release>` | 1440×1000 | Release waiting, adapter previews, Obsidian conflict, unconsumed deployment plan |
| `capability-deployed-1440.png` | `/capabilities/<deployed-release>` | 1440×1000 | Finalized release, active pointer, deployment history, rollback plan |
| `capability-deployed-390.png` | `/capabilities/<deployed-release>` | 390×844 (true device metrics) | Narrow viewport, no horizontal overflow |
| `shot-capability-waiting-1440.png` | `/capabilities/<waiting-release>` | 1440 (scale 2, `scripts/shot.mjs`) | Same state via shot.mjs CDP capture |
| `shot-capability-deployed-1440.png` | `/capabilities/<deployed-release>` | 1440 (scale 2, `scripts/shot.mjs`) | Same state via shot.mjs CDP capture |
| `shot-capability-deployed-390.png` | `/capabilities/<deployed-release>` | true 390 (`scripts/shot.mjs` mobile=1) | Same state via shot.mjs CDP capture |

Visual assertions per capture: semantic section headings (Release candidate / Neutral package
manifest / Adapter previews / Obsidian projection / Deployment plans / Deployment history),
no absolute roots, no publish action, Paper Workbench styling preserved.

Build SHA: `196110d` (acceptance-fix batch including scoped review fixes; see `p4-implementation-log.md`).

shot.mjs capture hashes (final build):
- shot-capability-deployed-1440.png `bb9261c0…052245e1`
- shot-capability-deployed-390.png `68453964…190234c`
- shot-capability-waiting-1440.png `5f6f4ec5…3a56a17`
Registry fixture digest: deterministic seeded records from `caphub-package-export-fixtures.ts`.
