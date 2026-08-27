# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is Joey, the single Human Owner of a personal portfolio spanning code-development and business-operation projects. AllJobs is used from the Control Host, a daily-work computer, a development computer, and a phone to review priorities, inspect project state, and maintain planning work that AllJobs owns.

## Product Purpose

AllJobs is a personal multi-project planning control plane. It makes Project → Roadmap → Backlog / Task relationships visible in one place, helps the owner find work that needs attention, and supports deliberate registration, native planning, archive, and restore workflows. Planning Core V1 succeeds when one code project and one business project can be planned coherently without duplicating repository-owned facts.

## Positioning

AllJobs federates planning sources instead of replacing them: code Roadmap and Backlog documents remain canonical in their repositories and are projected read-only, while business Milestones and AllJobs-native Tasks remain writable on the single Control Host.

## Operating Context

- The owner reviews portfolio focus, waiting and blocked Tasks, Roadmap movement, and source freshness across projects.
- Coding agents maintain fixed repository documents through normal Git workflows; AllJobs reads local mirrors and never edits those external planning files.
- Business-planning agents may update AllJobs-native Markdown only on the Control Host with digest-protected writes; agents on other computers prepare reviewed branch or patch handoffs.
- The development machine is the only Control Host. Other computers use the browser, Git pushes, or reviewed handoffs.
- Cloudflare Tunnel and Access remain the only production entry path; the local application binds only to `127.0.0.1`.

## Capabilities and Constraints

- Projects are typed as code-development or business-operation; lifecycle labels are tags, not a forced state machine.
- Code Roadmaps contain Phases and expose one fixed Backlog document. Business Roadmaps contain Milestones and no Backlog affordance.
- Tasks exist for both project types, may bind to a Backlog item or Milestone, and may also stand alone. External Tasks are read-only; native Tasks are writable.
- Registration, archive, and restore use inspect/propose, proposal digest, explicit Human confirmation, and full revalidation before apply.
- Archive is the non-destructive unbind mechanism. There is no destructive project deletion in V1.
- Markdown and read-only Git mirrors are the data layer; there is no database, realtime collaboration, or multi-user role system.
- KPI and Measure remain a Priority 2 schema seam with no Planning Core V1 page or non-functional controls.
- The production stack is Next.js 16 App Router, React 19, TypeScript, Tailwind v4, and shadcn/ui. Task 1 uses a standalone non-production rendered mockup only.

## Brand Commitments

- Product name: AllJobs.
- The product should feel calm, precise, and information-dense, without gamification, hype, generic glass, decorative gradients, oversized vanity metrics, or repetitive card grids.
- Source ownership, read/write authority, and recovery paths must remain explicit in the interface language.

## Evidence on Hand

- Approved Planning Core architecture: `docs/superpowers/specs/2026-08-26-alljobs-federated-planning-core-design.md`.
- Approved T3 Brief revision 1: `.agent/frontend-design/planning-core-v1/brief.md`.
- Approved development plan: `docs/superpowers/plans/2026-08-26-alljobs-federated-planning-core-rebuild.md`.
- No real customer claims, benchmark claims, production planning data, or approved visual assets are available. Mockups must use clearly labeled synthetic demonstration data.

## Product Principles

1. Preserve one canonical owner for every planning fact.
2. Make hierarchy, attention, and provenance legible before decoration.
3. Keep consequential changes explicit, reviewable, and recoverable.
4. Degrade per item or per project without hiding healthy work.
5. Support focused review across devices without pretending that every device is a Control Host.

## Accessibility & Inclusion

Core read and native-Task flows must work with keyboard input at desktop, intermediate, and mobile widths. Feedback must not rely on color alone; text contrast, non-text boundaries, focus movement, live announcements, reduced-motion behavior, and mobile recomposition follow the approved T3 Brief.
