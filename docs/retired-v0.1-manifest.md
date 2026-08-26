# Retired AllJobs v0.1 Cleanup Manifest

**Decision:** Human Owner explicitly chose to keep the retired application offline and authorized cleanup on 2026-08-26.
**Source commit:** `977105bc9c32d8543eff1fb08a79f258f76acdc0`
**Whole-release rollback tag:** `archive/v0.1.0-retired` → `d69b70c630234e0480e952ef892aea638202a058`
**Tracked deletion count:** 147
**Sorted path-list SHA-256:** `3083dc0ec67c9e9678f8a0e24e843a676455209661cc13a8199c7f8c4c1056cd`

## Scope

This cleanup retires only the old product implementation, sample data, old product documentation, old sprint record, and old UI evidence. It creates no replacement runtime or production UI.

The exact tracked paths resolved from the source commit are:

```text
.agent/frontend-design/alljobs-workbench-v1/brief.md
.agent/frontend-design/alljobs-workbench-v1/handoff.md
.agent/frontend-design/alljobs-workbench-v1/impl-screens/detail-1440.png
.agent/frontend-design/alljobs-workbench-v1/impl-screens/detail-390.png
.agent/frontend-design/alljobs-workbench-v1/impl-screens/log-1440.png
.agent/frontend-design/alljobs-workbench-v1/impl-screens/log-390.png
.agent/frontend-design/alljobs-workbench-v1/impl-screens/overview-1440.png
.agent/frontend-design/alljobs-workbench-v1/impl-screens/overview-390.png
.agent/frontend-design/alljobs-workbench-v1/impl-screens/projects-1440.png
.agent/frontend-design/alljobs-workbench-v1/impl-screens/projects-390.png
.agent/frontend-design/alljobs-workbench-v1/impl-screens/quickadd-success-1440.png
.agent/frontend-design/alljobs-workbench-v1/impl-screens/quickadd-validation-1440.png
.agent/frontend-design/alljobs-workbench-v1/mockup/ledger.css
.agent/frontend-design/alljobs-workbench-v1/mockup/log.html
.agent/frontend-design/alljobs-workbench-v1/mockup/overview.html
.agent/frontend-design/alljobs-workbench-v1/mockup/project.html
.agent/frontend-design/alljobs-workbench-v1/mockup/projects.html
.agent/frontend-design/alljobs-workbench-v1/mockup/screenshots/log-desktop.png
.agent/frontend-design/alljobs-workbench-v1/mockup/screenshots/log-mobile.png
.agent/frontend-design/alljobs-workbench-v1/mockup/screenshots/overview-desktop.png
.agent/frontend-design/alljobs-workbench-v1/mockup/screenshots/overview-mobile.png
.agent/frontend-design/alljobs-workbench-v1/mockup/screenshots/project-desktop.png
.agent/frontend-design/alljobs-workbench-v1/mockup/screenshots/project-mobile.png
.agent/frontend-design/alljobs-workbench-v1/mockup/screenshots/projects-desktop.png
.agent/frontend-design/alljobs-workbench-v1/mockup/screenshots/projects-mobile.png
.agent/frontend-design/alljobs-workbench-v1/mockup/screenshots/states-desktop.png
.agent/frontend-design/alljobs-workbench-v1/mockup/screenshots/states-mobile.png
.agent/frontend-design/alljobs-workbench-v1/mockup/states.html
.agent/frontend-design/alljobs-workbench-v1/tasks/T1-data-layer.md
.agent/frontend-design/alljobs-workbench-v1/tasks/T2-pages.md
.agent/frontend-design/alljobs-workbench-v1/tasks/T3-quickadd.md
.agent/frontend-design/alljobs-workbench-v1/tasks/T4-deploy-docs.md
.agent/frontend-design/alljobs-workbench-v1/verification.md
.agent/frontend-design/alljobs-workbench-v1/verify-screens/e2e-after-quickadd-1440.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/final-detail-1440.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/final-detail-390.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/final-log-1440.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/final-log-390.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/final-overview-1440.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/final-overview-390.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/final-projects-1440.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/final-projects-390.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/inject-badlog-log.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/inject-badproject-overview.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/inject-badproject-projects.png
.agent/frontend-design/alljobs-workbench-v1/verify-screens/notfound-desktop.png
.agent/frontend-design/redesign-v2/screenshots-fixed/board-alljobs-1440.png
.agent/frontend-design/redesign-v2/screenshots-fixed/board-alljobs-390.png
.agent/frontend-design/redesign-v2/screenshots-fixed/detail-1440.png
.agent/frontend-design/redesign-v2/screenshots-fixed/detail-390.png
.agent/frontend-design/redesign-v2/screenshots-fixed/stats-1440.png
.agent/frontend-design/redesign-v2/screenshots-fixed/today-1440.png
.agent/frontend-design/redesign-v2/screenshots-fixed/today-390.png
.agent/frontend-design/redesign-v2/screenshots/board-1440.png
.agent/frontend-design/redesign-v2/screenshots/board-390.png
.agent/frontend-design/redesign-v2/screenshots/board-alljobs-1440.png
.agent/frontend-design/redesign-v2/screenshots/detail-1440.png
.agent/frontend-design/redesign-v2/screenshots/detail-390.png
.agent/frontend-design/redesign-v2/screenshots/log-1440.png
.agent/frontend-design/redesign-v2/screenshots/projects-1440.png
.agent/frontend-design/redesign-v2/screenshots/stats-1440.png
.agent/frontend-design/redesign-v2/screenshots/today-1440.png
.agent/frontend-design/redesign-v2/screenshots/today-390.png
.agent/frontend-design/redesign-v2/spec.md
.agent/frontend-design/redesign-v2/verification.md
.agent/sprints/sprint-001.md
DESIGN.md
PRODUCT.md
README.md
app/(overview)/loading.tsx
app/(overview)/page.tsx
app/actions/movetask.test.ts
app/actions/movetask.ts
app/actions/quickadd.test.ts
app/actions/quickadd.ts
app/board/board-view.tsx
app/board/page.tsx
app/globals.css
app/layout.tsx
app/log/loading.tsx
app/log/log-view.tsx
app/log/page.tsx
app/projects/[slug]/detail-view.tsx
app/projects/[slug]/not-found-view.tsx
app/projects/[slug]/not-found.tsx
app/projects/[slug]/page.tsx
app/projects/layout.tsx
app/projects/page.tsx
app/projects/projects-list.tsx
app/stats/page.tsx
app/stats/stats-view.tsx
app/today-view.tsx
components/workbench/AgentPill.tsx
components/workbench/AppShell.tsx
components/workbench/Badge.tsx
components/workbench/ContentArea.tsx
components/workbench/ContractComment.tsx
components/workbench/DetailCard.tsx
components/workbench/EmptyState.tsx
components/workbench/EntryRow.tsx
components/workbench/ListRow.tsx
components/workbench/MobileNavDrawer.tsx
components/workbench/ProjectsShell.tsx
components/workbench/ProofBanner.tsx
components/workbench/QuickAddSheet.tsx
components/workbench/SegmentedControl.tsx
components/workbench/Sidebar.tsx
components/workbench/SplitView.tsx
components/workbench/StatusDot.tsx
components/workbench/Toolbar.tsx
components/workbench/index.ts
components/workbench/lib.ts
data/README.md
data/log/2026-08-07.md
data/log/2026-08-08.md
data/log/2026-08-10.md
data/log/2026-08-11.md
data/log/2026-08-23.md
data/projects/agent-pact.md
data/projects/alljobs.md
data/projects/codesk.md
data/projects/design.md
data/projects/diskwatch.md
data/projects/eastern-astrology-mvp.md
data/projects/mathmagics-mvp.md
data/projects/pactify-apps.md
data/projects/petcare-app.md
data/projects/tradelinks.md
data/tasks/alljobs.md
data/tasks/pactify-apps.md
docs/architecture.md
docs/operations.md
lib/data/append.test.ts
lib/data/append.ts
lib/data/derive.test.ts
lib/data/derive.ts
lib/data/empty-stub.ts
lib/data/read.test.ts
lib/data/read.ts
lib/data/schema.test.ts
lib/data/schema.ts
lib/data/seed.test.ts
lib/data/stats.test.ts
lib/data/stats.ts
lib/data/tasks.test.ts
lib/data/tasks.ts
lib/data/types.ts
```

## Preserved assets

- `deploy/cloudflared-config.example.yml`;
- `deploy/com.agentjoey.cloudflared.plist`;
- `deploy/com.agentjoey.alljobs.plist` pending later runtime revalidation;
- `docs/deployment.md` for the existing Tunnel/domain/Access operating knowledge;
- `alljobs.agentjoey.ai`, Cloudflare Tunnel identity, Access policy, and credentials outside Git;
- Planning Core architecture, Brief, plan, current state, backlog, and handoff;
- repository instructions, Pact state, Git/toolchain configuration, package lock, `components.json`, `lib/utils.ts`, and `scripts/shot.mjs`;
- the complete Git history and immutable `archive/v0.1.0-retired` tag.

## Safety and recovery

- Cleanup is committed as a Git deletion and is recoverable from the immutable tag.
- No Cloudflare, DNS, Access, launchd, credential, external repository, or production service operation is part of this cleanup.
- Task 1 may create only the non-production T3 rendered mockup.
- A new runtime shell, product routes, and product data directories remain blocked until the rendered Mockup Gate is approved.
