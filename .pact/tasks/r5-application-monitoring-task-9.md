# R5 Application Monitoring — Pactify Task 9

**Required context:** Read `AGENTS.md`, the complete implementation plan at `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`, the approved design at `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`, and the approved UI brief at `.agent/frontend-design/r5-application-monitoring/brief.md` before editing. Obey the plan's Global Constraints and Shared Contracts. Use TDD/BDD, preserve the listed Human-owned dirty files, do not use production credentials or real provider mutations, and do not push/deploy/release.

verify: npm test && npm run typecheck && npm run lint && npm run build && npx playwright test --config playwright.r5.config.ts && npm run verify:deploy

### Task 9: Verify the final candidate and produce release-gate evidence

**Files:**

- Create: `tests/e2e/r5-fixtures.ts`
- Create: `tests/e2e/r5-application-monitoring.spec.ts`
- Create: `playwright.r5.config.ts`
- Create: `.agent/frontend-design/r5-application-monitoring/verification.md`
- Create: `.agent/frontend-design/r5-application-monitoring/final-desktop.png`
- Create: `.agent/frontend-design/r5-application-monitoring/final-mobile.png`
- Create: `.agent/frontend-design/r5-application-monitoring/final-project-detail.png`
- Modify: `.agent/frontend-design/r5-application-monitoring/handoff.md`
- Modify: `docs/operations.md` if present; otherwise create `docs/application-monitoring-operations.md`

- [ ] Write failing Playwright journeys that provision an isolated fixture `ALLJOBS_HOME` and normalized cache without provider network: attention triage, every Project in ledger, critical drill-down, mixed evidence, stale/backoff/permission/unsupported states, empty bindings, manual refresh safe response, keyboard traversal, responsive labels, and automated WCAG AA audit.
- [ ] Add production-like fixture startup in `playwright.r5.config.ts`; bind only `127.0.0.1` and use a port distinct from production. Tests must never read the real Control Host home or credentials.
- [ ] Run the whole story and fix every failure before recording evidence:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npx playwright test --config playwright.r5.config.ts
npm run verify:deploy
```

- [ ] Inspect all modified source and generated fixture/cache data for secrets/raw payloads and check route rendering does not call provider hosts. Record the exact candidate SHA and command results in `verification.md`.
- [ ] Start the final production build on the isolated verification port, then capture the approved fixture states with the repository script. Use a true emulated 390px viewport, not bare headless Chrome `--window-size`:

```bash
node scripts/shot.mjs http://127.0.0.1:3461/monitoring .agent/frontend-design/r5-application-monitoring/final-desktop.png 1440 1 0 light
node scripts/shot.mjs http://127.0.0.1:3461/monitoring .agent/frontend-design/r5-application-monitoring/final-mobile.png 390 2 1 light
node scripts/shot.mjs http://127.0.0.1:3461/monitoring/talentvault .agent/frontend-design/r5-application-monitoring/final-project-detail.png 1440 1 0 light
```

- [ ] Compare final screenshots to both approved mockups and run `$impeccable audit`; document any intentional difference and its evidence. Do not capture from a development server.
- [ ] Document disabled-by-default setup, credential environment-name mapping, one-shot fixture-safe validation, cache layout, operator errors/backoff, rollback by disabling monitoring, and the still-required Human-selected pilot/live-provider/release gates. Do not place actual token examples in docs.
- [ ] Update handoff with exact candidate SHA, test evidence, screenshot hashes, independent reviewer verdict, and explicit statements: not pushed, not deployed, no production credentials configured, no live provider validation performed.
- [ ] Commit exact verification artifacts:

```bash
git add tests/e2e/r5-fixtures.ts tests/e2e/r5-application-monitoring.spec.ts playwright.r5.config.ts .agent/frontend-design/r5-application-monitoring/verification.md .agent/frontend-design/r5-application-monitoring/final-desktop.png .agent/frontend-design/r5-application-monitoring/final-mobile.png .agent/frontend-design/r5-application-monitoring/final-project-detail.png .agent/frontend-design/r5-application-monitoring/handoff.md docs/application-monitoring-operations.md
git commit -m "test(monitoring): verify final application monitoring candidate"
```

If `docs/operations.md` existed and was modified instead, stage it instead of the new operations file.

**Acceptance:** Final build and all automated gates pass against the exact reviewed SHA; screenshots come from that build; independent review has no open blocking finding; production remains unchanged; pilot binding, live provider validation, Human walkthrough, push/deploy, and release remain explicit pending Human Gates.

## Primary Acceptance Protocol

After Pactify reports every task accepted, the primary agent must not rely on worker/reviewer summaries alone.

- [ ] Confirm task ownership/reviewer identity and accepted checkpoints from Pact state/log.
- [ ] Inspect `git diff` and commit history against pre-feature SHA; verify no Human dirty file entered any feature commit.
- [ ] Re-run Task 9's full command set from the final candidate checkout.
- [ ] Re-run behavior probes for one healthy, one critical, one unknown, one backing-off, and one corrupt-cache recovery scenario.
- [ ] Open all three final images and visually inspect desktop/390px/detail against approved mockups.
- [ ] Search tracked changes for token/header/raw response leakage and verify only fixed provider hosts/documents exist.
- [ ] Record the exact accepted SHA and unresolved Human Gates. Do not push, deploy, configure credentials, bind a production Project, or alter launchd without a new explicit authorization.
