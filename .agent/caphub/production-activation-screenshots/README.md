# Production pilot screenshots

These screenshots are emitted by the single focused production-build scenario:

```bash
./node_modules/.bin/next build --webpack
npm run test:e2e:caphub-production-pilot
```

- `reviews-1440.png` — Candidate review at a 1440 CSS-pixel viewport before
  the exact Human fixture decision.
- `capability-390.png` — finalized Release detail at a true 390 CSS-pixel
  viewport, including the neutral manifest and Codex, Claude, and Hermes
  adapter previews.

The harness uses a newly owned temporary PostgreSQL cluster and home on every
run. All export targets are disabled, no target directory is created, and the
fixture is removed after Playwright exits. The images therefore contain stable
fixture IDs but no Production paths, credentials, prompts, raw responses, or
Capture bytes.

## PA-D Control Host evidence

- `caphub-production-1440.png` — the running Control Host Production build at
  a 1440 CSS-pixel viewport after PA-D. It shows the ready Capture-only Caphub
  inbox and no analysis, export, target, or provider action.
