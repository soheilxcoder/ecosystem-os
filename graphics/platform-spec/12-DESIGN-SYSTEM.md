# 12 — Design System & Frontend Guidelines

## 1. Design brief, stated explicitly

**Subject matter**: an operational trust system. The product's entire value proposition is that numbers are real, formulas are visible, and nobody — not even Company X — can quietly override them. The visual design must *feel* like that claim before a user reads a single word: precise, legible, evidentiary, calm under pressure. It should feel closer to a well-designed financial terminal or an audit tool than a generic "team collaboration SaaS" product.

**Audience**: pod members (day-to-day, often on mobile, checking numbers between tasks), coaches and reviewers (focused work sessions), Company X hub staff and executives (dense, comparative, desktop-first analysis), and external investors (a much simpler, calmer reporting view).

**Primary job of the UI**: make a number trustworthy at a glance, and make the path from "raw data" to "final number" one click away, always.

**Explicitly avoid** (per the known AI-generated-design defaults): the warm cream + terracotta combination, the near-black-with-one-neon-accent look, generic rounded SaaS cards with identical soft shadows on everything, ALL-CAPS tracked eyebrow labels above every heading, middle-dot-joined meta strings, em-dash "WORD — fragment" labels, and arrows appended to every button/link label. None of these were chosen for this brief; they're just what a generic generator reaches for.

## 2. Design plan

### Color — 6 named tokens, not a generic SaaS palette
Because this product's core promise is "see exactly what's true, right now," the palette should read more like a **precision instrument** than a lifestyle brand: a cool, ink-and-paper neutral base with one confident signal color, and the four status colors kept genuinely functional (not decorative).

| Token | Hex | Role |
|---|---|---|
| `--ink-950` | `#12161C` | Primary text, high-emphasis headings |
| `--paper-100` | `#F7F8F6` | Page background (a true light neutral, not warm cream) |
| `--slate-500` | `#5B6672` | Secondary text, borders, dividers |
| `--signal-600` | `#1E6F5C` | Primary brand/action color — a deliberate deep teal-green, chosen because it reads as "verified/ledger" rather than "playful startup," and is distinct from the four status colors below so it never gets confused with a status chip |
| `--surface-white` | `#FFFFFF` | Card/panel surfaces |
| `--line-200` | `#E3E6E2` | Hairline borders |

Status colors (used ONLY for status chips and health signals, never as general decoration — see §4):
| Token | Hex | Meaning |
|---|---|---|
| `--status-neutral` | `#8B93A1` | Draft / not started |
| `--status-active` | `#2B6CB0` | In progress / active |
| `--status-good` | `#1E7A4C` | Completed / passed / healthy |
| `--status-watch` | `#B7791F` | Flagged / at risk (amber) |
| `--status-alert` | `#B23B3B` | Action required / red |

### Type — two families, clearly distinct roles
- **Display/headline face**: a high-contrast serif with a slightly technical, ledger-like character (e.g., a text serif like Source Serif 4 or Newsreader) — used ONLY for section headings and the large hero numbers on the Dashboard/Budget screens. This is what gives the product a distinct identity instead of defaulting to a generic geometric sans everywhere.
- **UI/body face**: a clean, highly legible grotesque sans (e.g., Inter or IBM Plex Sans) for all body text, labels, buttons, and table data — chosen for its excellent tabular figures, since this product displays a lot of numbers that must align in columns.
- **Tabular numerals**: enabled by default (`font-variant-numeric: tabular-nums`) everywhere a number appears in a table or comparison — non-negotiable for a budget/scoring product where misaligned digits undermine the "precision" feeling the whole design is built on.
- Type scale (base 16px): 14 / 16 / 18 / 22 / 28 / 36 / 48, with the 36/48 sizes reserved for the "big number" treatment (e.g., a pod's final budget figure) and never used decoratively elsewhere.
- Line length: body text and pitch/comment content capped at ~72 characters; tables and dashboards are exempt (data density is the point there).

### Layout concept
```
Dashboard hero: a single dominant "big number" card (this cycle's score or
budget) sits top-left, NOT centered — center-aligned hero treatments are the
generic default for marketing pages; this is a working tool, so content is
left-aligned throughout, consistent with how financial terminals and admin
consoles are actually scanned (top-to-bottom, left-to-right, no ceremony).

┌─────────────────────────────┬───────────────┐
│  [Big number: live score]   │ Cycle Timeline │
│  small supporting stats     │ (ring/bar)     │
├─────────────────────────────┴───────────────┤
│  Organization Pulse (grid of pod cards)      │
├───────────────────────────────────────────────┤
│  Needs Your Attention  |  Recent Activity     │
└───────────────────────────────────────────────┘
```
- Grid: 12-column, 24px gutter on desktop; single column on mobile with the "big number" card always first.
- Cards are NOT uniformly rounded-with-shadow (avoiding the generic SaaS-card tell). Instead: primary data cards (scores, budgets) use a **1px hairline border + no shadow + a 2px left border in the relevant status color** — this reads as a ledger/statement line item, not a floating card. Secondary/navigational cards (e.g., a module entry point) may use a subtle shadow, kept visually distinct from data cards so the eye learns "bordered = a number I should trust, shadowed = a place I can go."

### Principles unique to this product
1. **The formula is always one click away.** Every computed number is a link, not just text (see the provenance icon convention in `01-INFORMATION-ARCHITECTURE.md`).
2. **Rotation is drawn, not just written.** Any rotating role uses a small radial countdown glyph (a tiny circular progress ring next to the name) rather than only text like "(14 days left)" — this is the one place a small custom icon is worth the investment, since it appears dozens of times across the product and materially reinforces the "nothing here is permanent" principle.
3. **Status color is earned, not decorative.** The five status tokens above are the ONLY place color beyond ink/paper/signal appears in day-to-day UI chrome. No gradients-as-decoration, no rainbow charts for their own sake.
4. **One motion moment per major screen.** E.g., on the Budget Market breakdown screen, the weighted-sum arithmetic line animates once, in sequence, when the page first loads (40% term appears, then 35%, then 25%, then the sum) — a single orchestrated reveal that mirrors how a human would explain the calculation out loud. Hover states are simple opacity/border changes, not scattered lift-and-shadow effects on every card.

## 3. Copy & voice guidelines
- Buttons name the exact action and outcome consistency matters: "Submit Pitch" always leads to a state literally labeled "Submitted," never "Pitch sent" or "Finalized" inconsistently across screens.
- Empty states are instructions, not apologies: "No agreements yet — propose one with a pod you exchange work with" rather than "Sorry, nothing here."
- Errors state what happened and what to do: "Couldn't calculate this cycle's budget — 3 pods still have unscored pitches. [View pending reviews]" rather than a generic "Something went wrong."
- No exclamation points, no "Oops," no forced friendliness — the tone throughout is that of a calm, competent colleague reading you the numbers straight.

## 4. Core components (build once, reuse everywhere)

| Component | Key states | Notes |
|---|---|---|
| **Status Chip** | neutral / active / good / watch / alert | Text label + color dot, never color-only (accessibility — see §6) |
| **Rotation Badge** | active (with radial countdown) / expired / vacant | Used for Pod Lead, Coach assignment, Peer Validator |
| **Data Card** (hairline + left status border) | default / loading (skeleton) / stale (dimmed + timestamp banner) | Used for all score/budget/health numbers |
| **Provenance Popover** | closed / open | Triggered by the small "i" icon next to any computed number |
| **Stepper** (vertical) | not-started / active / complete / skipped | Used for Accountability Path (4 stages), Pilot phases |
| **Voting Modal** | selecting / submitted / results | Used for Pod Lead election, Panel votes |
| **Pipeline/Timeline bar** | — | Used for Sprint Calendar (linear variant) and Entry Trial tracker |
| **Cycle Wheel** (radial) | — | Sprint Calendar primary view; SVG-based, must degrade to the linear Pipeline bar under 480px width |
| **Table with tabular numerals** | sortable, filterable | Used in Budget history, Archive search results, Coaching roster |
| **Network Graph** (pods + agreements) | list-view fallback | Used in CLOU module; must provide a list-view toggle since graph layouts are inherently harder to navigate via keyboard/screen reader |

## 5. Iconography
Plain, functional business iconography only — flowchart nodes, funnels, gauges, calendars, checkmarks, org-chart nodes, simple line icons (16/20/24px grid, 1.5px stroke). Explicitly no organic, biological, retail, or other metaphorical imagery anywhere in the product, consistent with the source model's own "no metaphor" principle — the platform should look like what it is: a business operating system.

## 6. Accessibility & quality floor (non-negotiable, every screen)
- Color is never the sole signal: every status chip and health indicator pairs color with a text label or icon shape.
- Visible keyboard focus states on every interactive element (2px `--signal-600` outline, 2px offset).
- Contrast: body text on `--paper-100`/`--surface-white` must meet WCAG AA (4.5:1); the `--status-watch` amber in particular must be checked against white backgrounds and darkened if needed for small text.
- `prefers-reduced-motion` respected: the "one motion moment per screen" (§2.4) is disabled/instant for users with this preference set.
- Responsive down to a 360px-wide mobile viewport for every pod-facing screen (Dashboard, My Pod, Notifications, Budget breakdown, Calendar); the Hub Console and Budget history table may declare a "best on larger screens" banner below 768px rather than forcing a broken layout, but must never be fully inaccessible on mobile (view-only degraded mode is acceptable).

## 7. Design-review checklist (apply before shipping any new screen)
1. Does every number on this screen trace back to its source in one click?
2. Is any rotating role shown without its countdown/expiry? (Not allowed.)
3. Is color used anywhere purely for decoration rather than status/brand? (Remove it.)
4. Would this screen still make sense to someone who has never seen an org chart with a "manager" box on it? (It must — the product's entire premise is that such a box doesn't exist here.)
5. Take a screenshot at 1440px, 768px, and 375px widths and compare against the layout concept in §2 before merging.
