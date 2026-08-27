---
name: AllJobs Paper Workbench
description: A warm, precise planning workbench derived from pleurat.com aesthetics with high-density ledgers and an amber provenance status bar.
colors:
  paper: "#f1eee6"
  paper-raised: "#fbf7e6"
  paper-recessed: "#e8e4da"
  ink: "#16140e"
  ink-muted: "#4a463c"
  ink-faint: "#5e584d"
  hairline: "rgba(22, 20, 14, 0.16)"
  hairline-strong: "rgba(22, 20, 14, 0.32)"
  amber: "#f3b44a"
  amber-soft: "#fdf2de"
  amber-ink: "#16140e"
  rust: "#a83b3b"
  rust-soft: "#fbeaea"
  green: "#2e7d4f"
  green-soft: "#e8f5ee"
  focus: "#f3b44a"
typography:
  display:
    fontFamily: '"General Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"General Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16.5px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: '"General Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  row-title:
    fontFamily: '"General Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14.5px"
    fontWeight: 600
  action:
    fontFamily: '"General Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13.5px"
    fontWeight: 600
  navigation:
    fontFamily: '"General Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13.5px"
    fontWeight: 500
  caption:
    fontFamily: '"General Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12.5px"
    fontWeight: 400
  annotation:
    fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    fontSize: "10.5px"
    fontWeight: 500
    letterSpacing: "0.1em"
rounded:
  skeleton: "3px"
  compact-control: "4px"
  field: "5px"
  action: "6px"
  notice: "6px"
  surface: "8px"
  dialog: "10px"
spacing:
  micro: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  status-strip:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink}"
    typography: "{typography.annotation}"
    padding: "6px 16px"
    minHeight: "32px"
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.action}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "#e09f35"
    textColor: "{colors.ink}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.action}"
    border: "1px solid {colors.hairline-strong}"
    padding: "8px 14px"
    height: "40px"
  button-quiet-hover:
    backgroundColor: "rgba(22, 20, 14, 0.05)"
    textColor: "{colors.ink}"
  filter-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.compact-control}"
    padding: "6px 10px"
    height: "32px"
  filter-chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  field:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline-strong}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
    height: "40px"
  surface:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.surface}"
  badge-native:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.compact-control}"
    padding: "2px 6px"
  badge-external:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    border: "1px dashed {colors.hairline-strong}"
    rounded: "{rounded.compact-control}"
    padding: "2px 6px"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.navigation}"
    padding: "0 14px"
    height: "56px"
  ledger-row:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    borderBottom: "1px solid {colors.hairline}"
    padding: "10px 14px"
    height: "64px"
  notice-warning:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.amber}"
    rounded: "{rounded.notice}"
    padding: "12px 16px"
---

# Design System: AllJobs Paper Workbench

## Overview

**Creative North Star: "纸面工作台 / The Paper Workbench"**

AllJobs is a single-owner planning control plane engineered for high-density review of federated work across code-development and business-operation projects. The visual system is derived directly from the physical and typographical discipline of **pleurat.com** (curated 2026-08-27): warm cream paper surfaces, dark ink typography, crisp hairline rules, uppercase monospace annotations, and a single amber provenance status bar as its signature accent.

The system firmly rejects dashboard card walls, scroll-narrative portfolio layouts, decorative galaxy maps, gradient text, and unearned card elevation. Backlog and Task ledgers own the dominant reading plane. Source custody and freshness are immediately legible through monospace coordinates and provenance patterns: **solid fill** marks AllJobs-native writable custody, while **hatch fill** marks external read-only projections.

**Key Characteristics:**

- **Warm Cream Paper Field**: Light-only palette (`#F1EEE6` ground, `#FBF7E6` raised surfaces) with subtle 1.15px hairline dot grid.
- **Ink Typography**: General Sans for human-readable content and IBM Plex Mono for technical identifiers, document paths, Git revisions, and hash digests.
- **Amber Provenance Status Bar**: The signature element tying route identity, source custody, exact revision/digest, and freshness status to every view.
- **Hatch vs Solid Custody Notation**: Geometric hatch patterns designate external read-only documents; solid ink/amber marks native writable objects.
- **Restrained Motion**: Subtle 0.2s opacity transitions, 2px interactive row lift, and 4px arrow nudges; zero decorative scroll reveals or expensive canvas rendering.

## Colors

The palette is an authentic, high-contrast paper and ink system. Every foreground/background pairing strictly maintains a measured contrast ratio ≥4.5:1 for body copy.

### Primary

- **Warm Paper Ground** (`paper`, `#F1EEE6`): the base application canvas and primary workspace plane.
- **Raised Paper Surface** (`paper-raised`, `#FBF7E6`): containers, ledger tables, inputs, and dialog cards.
- **Recessed Paper** (`paper-recessed`, `#E8E4DA`): secondary wells, subtle headers, and recessed metadata backgrounds.
- **Deep Ink** (`ink`, `#16140E`): primary reading typography, solid native markers, and high-emphasis boundaries.
- **Muted Ink** (`ink-muted`, `#4A463C`): secondary labels, captions, and non-active metadata (contrast ratio ~7.9:1 against paper).
- **Faint Ink** (`ink-faint`, `#5E584D`): IDs, quiet timestamps, and helper text (contrast ratio ~5.9:1 against paper).

### Accents & Semantics

- **Amber Provenance** (`amber`, `#F3B44A`): signature status strip fill, primary action button, and current-position mark. Paired exclusively with `#16140E` ink text (contrast ratio ~9.7:1).
- **Soft Amber Well** (`amber-soft`, `#FDF2DE`): warning banners, inspection notices, and stale-state callouts.
- **Rust Attention** (`rust`, `#A83B3B`): blocked tasks, collision errors, and critical human gate alerts. Paired with explicit text.
- **Soft Rust** (`rust-soft`, `#FBEAEA`): error notice backgrounds.
- **Survey Green** (`green`, `#2E7D4F`): verified source health and successful writes.
- **Hairline Rule** (`hairline`, `rgba(22, 20, 14, 0.16)`): crisp structural borders and row separators.
- **Strong Hairline** (`hairline-strong`, `rgba(22, 20, 14, 0.32)`): interactive borders and focused control outlines.

**The Amber Provenance Rule.** Amber is strictly reserved for the provenance status bar, confirmed primary actions, and current route indications. It is never used as uncontained text on cream paper. Rust and green are always accompanied by textual labels and geometric symbols.

## Typography

**Primary Display & Body:** General Sans (Fontshare, OFL)  
**Technical & Coordinate Annotation:** IBM Plex Mono (Google Fonts / OFL)

### Hierarchy

- **Display** (650, `clamp(30px, 3vw, 44px)`, line-height 1.05, letter-spacing `-0.025em`): one balanced page title and thesis per view.
- **Title** (600, 16.5px, letter-spacing `-0.01em`): section headers, surface titles, and dialog titles.
- **Body** (400, 16px, line-height 1.55): primary descriptions, instructions, and context with a maximum line length of 70 characters.
- **Row Title** (600, 14.5px): work-item headings inside dense ledger rows.
- **Action** (600, 13.5px): buttons, tabs, and concise interactive labels.
- **Navigation** (500, 13.5px): header route labels.
- **Caption / Meta** (400/500, 12.5px): project tags, due dates, and secondary facts.
- **Annotation / Mono** (500, 10.5px, letter-spacing `0.1em`, uppercase): route paths, source custody identifiers, Git hashes, document digests, and Human Gate notices.

**The Dual-Type Rule.** General Sans carries human thought and task execution; IBM Plex Mono carries technical custody, file paths, hashes, and machine-verified states. Never interchange them.

## Layout & Spatial Composition

The desktop shell is centered up to a 1600px max width with 24px-32px margins. The layout adheres to a **Ledger-First** composition:

- **Desktop (≥1120px)**: The left column (65-70% width) is dedicated entirely to dense Backlog and Task ledgers. The right column (30-35% width) holds compact source custody facts, Roadmap milestone stages, and recovery tools.
- **Intermediate (721px - 1119px)**: Grids collapse into a single column where the primary ledger leads, followed by the source custody and secondary panels.
- **Mobile (≤720px)**: The header recomposes into a compact brand/status row with a horizontally scrollable navigation strip. Ledger rows dynamically stack into structured multi-line cards with two-line wrapping, avoiding clipped or horizontally scrollable data tables. Touch targets maintain a strict 44px minimum height.

## Elevation & Depth

The Paper Workbench is flat and tactile. Depth is established through subtle tonal layering (`#F1EEE6` ground vs `#FBF7E6` raised surfaces), 1px hairline rules, and diagonal hatch patterns rather than drop shadows.

- **Resting surfaces**: Flat with a 1px `rgba(22, 20, 14, 0.16)` hairline border.
- **Interactive hover**: 2px upward lift (`translateY(-2px)`) with a subtle border transition (`rgba(22, 20, 14, 0.32)`).
- **Dialog modal**: A single soft structural shadow (`0 20px 60px rgba(22, 20, 14, 0.24)`) separating the Human Gate modal from the underlying workbench.

## Components

### 1. Amber Provenance Status Bar (`#status-strip`)
- **Signature Component**: Fixed beneath the top header across all views.
- **Content**: Bound to route path, source provider, custody mode, Git revision/digest, and freshness status.
- **Styling**: `#F3B44A` golden amber field, `#16140E` monospace text, 6px × 16px padding, uppercase tracking.

### 2. Primary & Quiet Buttons
- **Primary**: Solid amber `#F3B44A` background, `#16140E` text, 6px radius, 40px height (44px on mobile). Used for the single confirmed next action.
- **Quiet**: Transparent background, `#16140E` text, 1px `rgba(22,20,14,.32)` border.

### 3. Dense Ledger Rows, Backlog Drawers & Project Cards Grid
- **Ledger Rows**: 64px min-height, grid layout (ID, Title + Context, Project/Phase, Due/Status, Actions, Badge).
- **Backlog Expandable Drawers**: Clicking any Backlog item expands an integrated detail drawer containing context specifications, phase/milestone bindings, source document references (`docs/BACKLOG.md`), and inline actions (Copy ID, Create Native Task, View in Repo).
- **Project Cards Grid**: Large structured cards in a responsive grid layout (derived from standard project workbench dashboards), displaying project name, phase/milestone subhead, freshness badge, custody tag, metrics (task & backlog count), and document paths with smooth tactile hover elevation (`translateY(-3px)`).
- **Hover**: 2px-3px lift, hairline border darkens, chevron/arrow nudges smoothly.
- **Mobile**: Recomposes to stacked lines with full text wrap and 44px hit targets.

### 4. Universal Header Search (`⌘K`)
- **Position**: Integrated directly into the top application header between navigation and status.
- **Behavior**: Real-time cross-project filtering across tasks, backlog items, and registered projects, with keyboard shortcut shortcut `⌘K` focus trap.

### 5. Vertical Roadmap Timeline (`.roadmap-timeline-v`)
- **Structure**: Vertical chronological axis connecting phase and milestone cards with circular step markers.
- **States**: `Active` (amber node + amber-tinted card), `Done` (green node), `Next` / `Planned` (hairline ink nodes).
- **Context**: Binds phase name, description, active item count, and canonical document path (`docs/ROADMAP.md`).

### 6. Portfolio Personal Workbench Dashboard
- **Stat Strip (KPI Cards)**: 4 compact KPI cards tracking Active Projects (`4/4 Synced`), Ongoing Work (`5 Native / 2 Repo`), Attention Required (`Blocked / Stale`), and Monthly Velocity (`18 completed · 0 DB`).
- **Ongoing Work Queue**: Primary ledger view prioritizing in-progress, blocked, and waiting items with fast filter chips.
- **Activity & Sync Sparkline**: Smooth area-stroke curve displaying daily completion and sync pace without cluttering the reading plane.

### 7. Provenance & Custody Badges
- **Native / Writable**: Solid deep ink `#16140E` background with `#F1EEE6` text.
- **External / Read-only**: Transparent background with 1px dashed border or diagonal hatch pattern.

### 8. Human Gate Dialogs
- **Confirmation Boundary**: Used for registration, archiving, restoration, and native writes. Displays exact document mutations, digest verification, and stale-state zero-write guarantees.

## Do's and Don'ts

### Do:
- **Do** make Backlog and Task ledgers the dominant visual plane on every screen.
- **Do** bind every view to the amber provenance status bar showing exact source custody, revision, and digest.
- **Do** distinguish external read-only projections (hatch fill / dashed badge) from native writable objects (solid fill).
- **Do** preserve full copy, error reasons, and disabled explanations in text, not color alone.
- **Do** provide smooth `prefers-reduced-motion` fallbacks for all transitions.

### Don't:
- **Don't** include decorative star atlases, celestial charts, galaxy canvases, or dot-grid diagrams.
- **Don't** use card grids or floating dashboard widgets that fragment linear reading.
- **Don't** use gradient text, decorative glassmorphism, or dark nocturnal themes in revision 3.
- **Don't** shrink desktop tables on mobile into horizontally unreadable clipping containers.
- **Don't** execute canonical writes or bypass the explicit Human Gate confirmation boundary.
