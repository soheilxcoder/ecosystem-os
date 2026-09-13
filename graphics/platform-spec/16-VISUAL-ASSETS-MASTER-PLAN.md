# 16 — Visual Assets Master Plan

## 0. Purpose and how this file relates to `12-DESIGN-SYSTEM.md`

`12-DESIGN-SYSTEM.md` defines the *rules* (color tokens, type scale, component states, principles). This file is the **complete inventory of every graphical asset that must actually be produced** to build the product — every icon, every custom diagram, every chart, every illustration, every micro-interaction — with exact specs so a designer or design-agent can produce them without guessing, and an engineer can implement them without inventing missing pieces.

Treat this as a production checklist. Nothing in the product should ship with a placeholder icon or an ad-hoc chart that isn't listed here — if a screen needs a visual not covered below, add it here first, then build it.

---

## 1. Asset taxonomy (six categories)

1. **Functional icon set** — small, repeated UI icons (nav items, status, actions).
2. **Custom signature diagrams** — one-of-a-kind visualizations unique to this product (the Cycle Wheel, the CLOU Network Graph, etc.) that carry real product meaning, not decoration.
3. **Standard data visualizations** — charts built from real data (bar/line/donut/treemap), specified per screen.
4. **Role & rotation iconography** — the visual language for rotating roles (Pod Lead, Coach, Peer Validator, VACC roles), used dozens of times across the product.
5. **State illustrations** — empty states, error states, success/confirmation states, onboarding.
6. **Motion/micro-interaction assets** — the small set of deliberate animations called for in the design system.

---

## 2. Functional icon set — complete inventory

**Style spec (applies to all icons in this category):** 24×24px artboard, 1.5px stroke, rounded joins, no fill except for status dots, single-color (inherits `currentColor` so it can be recolored via CSS per status token). Export as individual SVGs AND as a single optimized SVG sprite sheet for production use. Every icon needs a text `aria-label` mapped at implementation time — list that mapping in the icon's row below.

| Icon name | Used in (module/screen) | Visual concept | aria-label |
|---|---|---|---|
| `nav-dashboard` | Sidebar | Simple house/grid | "Dashboard" |
| `nav-pod` | Sidebar | Two overlapping circles (a small group) | "My Pod" |
| `nav-agreements` | Sidebar | Two nodes joined by a line with small arrowheads | "Agreements" |
| `nav-budget` | Sidebar | A simple pie/donut slice | "Budget Market" |
| `nav-calendar` | Sidebar | A ring with a small notch (echoes the Cycle Wheel) | "Sprint Calendar" |
| `nav-coaching` | Sidebar | A speech bubble with a small compass mark | "Coaching" |
| `nav-review` | Sidebar | A checklist with one checked item | "Peer Review & Cases" |
| `nav-archive` | Sidebar | A simple file box / drawer | "Archive" |
| `nav-hub` | Sidebar (Co. X only) | Four small connected dots (echoes the 4 hubs) | "Hub Console" |
| `nav-notifications` | Sidebar | Bell outline | "Notifications" |
| `nav-settings` | Sidebar | Simple gear | "Settings" |
| `action-add` | Multiple (+New buttons) | Plus in a circle | "Add" |
| `action-edit` | Multiple | Pencil | "Edit" |
| `action-view` | Multiple | Eye outline | "View" |
| `action-download` | Budget breakdown, Pod history | Downward arrow into a tray | "Download" |
| `action-export` | Budget history, Archive | Arrow leaving a box | "Export" |
| `action-search` | Archive, tables | Magnifying glass | "Search" |
| `action-filter` | Tables, lists | Simple funnel | "Filter" |
| `action-sort` | Tables | Up/down chevron pair | "Sort" |
| `provenance-info` | Every computed number | Lowercase "i" in a circle, slightly smaller (16px) than standard icon | "Show calculation source" |
| `status-dot-neutral/active/good/watch/alert` | Status chips everywhere | Filled circle, 8px, color from status tokens | (paired with text label, not read by itself) |
| `flag-at-risk` | Weekly check-in | Small triangle flag | "Marked at risk" |
| `link-clou` | Agreements | Chain-link glyph | "Direct agreement" |
| `link-shared-infra` | Agreements (network graph) | Dotted line glyph (used as a legend swatch, not a standalone icon) | "Shared infrastructure connection" |
| `vote-ballot` | Pod Lead voting, Panel votes | Simple ballot box with a checkmark going in | "Vote" |
| `case-mediation` | Conflict Resolver | Two speech bubbles overlapping, balanced | "Mediation case" |
| `trial-badge` | Entry Trial screens | A small hourglass | "In trial" |
| `accountability-badge` | Accountability Path screens | A small stepped/staircase glyph | "In accountability path" |
| `pilot-flag` | Pilot tracker | Small flag on a pole | "Pilot program" |
| `investor-portal` | Strategic hub | A simple bar-chart-in-a-window glyph | "Investor portal" |
| `data-source-synced` | Budget module, financial connector status | Circular arrows (sync) | "Data synced" |
| `data-source-error` | Same, error state | Circular arrows with a small alert dot | "Sync failed" |
| `lesson-learned` | Archive | A small bookmark/tag | "Lesson learned" |

---

## 3. Custom signature diagrams — full specification

These are the diagrams that make this product look and feel like nothing else — each gets its own detailed brief.

### 3.1 The Cycle Wheel (Sprint Calendar, Module 06 — primary visual)
- **What it shows:** the org's or a pod's current position within the 90-day cycle.
- **Structure:** a ring (SVG `<circle>` with a `stroke-dasharray` technique, or 5 separate `<path>` arcs), divided into 5 arcs proportional to day-ranges: Days 1–3 (3.3%), 4–80 (85.5%), 81–85 (5.5%), 86–88 (3.3%), 89–90 (2.2%).
- **Colors:** each arc uses a distinct tone within the `--signal-600` family (5-step tint/shade ramp) rather than the five unrelated status colors, so the wheel reads as one continuous process, not five disconnected events.
- **Today marker:** a small filled dot on the ring's edge at the exact proportional position for "today," with a thin radial line extending inward to a center label showing "Day 47 of 90."
- **Interaction:** hovering/tapping an arc shows a tooltip with phase name + date range; clicking navigates to that phase's detail.
- **Responsive behavior:** below 480px width, replace entirely with the linear Pipeline/Timeline bar variant (§3.2) — do not shrink the wheel below a size where the today-marker and arc boundaries remain legible (minimum usable diameter ≈160px).
- **Accessibility:** the SVG must include a hidden text equivalent ("Day 47 of 90 — currently in the Execution phase (Days 4–80)") for screen readers, since the visual alone doesn't convey this.

### 3.2 Linear Pipeline/Timeline bar (mobile fallback for 3.1; also used standalone in Entry Trial tracker)
- A horizontal bar, same 5-segment proportional logic as the wheel, with a vertical today-marker line crossing it.
- Used standalone (not just as a fallback) in the Entry Trial screen (Module 08), where the visual is simpler: a single 90-day bar with no internal phase segments (since the Entry Rule has no sub-phases), a today-marker, and a binary branch at the end (§3.4 covers the branch).

### 3.3 CLOU Network Graph (Agreements, Module 04)
- **Nodes:** one per pod, sized uniformly (do not size nodes by budget/score — this graph is about relationships, not performance; mixing the two encodings would confuse the CLOU-vs-infrastructure teaching point).
- **Edges:** solid lines with a small arrowhead for direct CLOU agreements (arrow points toward the receiving pod for one-directional services; double-arrowhead for bidirectional). Dotted lines connect every node to one shared central "Platform & Budget Market" hub node — rendered fainter than the CLOU edges so the eye reads solid = specific relationship, dotted = generic infrastructure.
- **Layout algorithm:** force-directed layout (e.g., d3-force) with the shared hub node pinned at the visual center; re-run layout only when the underlying agreement set changes, not on every render (a shifting graph layout on every page load would undermine the "trustworthy, stable" design principle).
- **Legend:** always visible, not tucked into a menu: two swatches — solid line "Direct Agreement (CLOU)" and dotted line "Shared Platform / Budget Market."
- **List-view fallback:** a plain sortable table (Pod A / Pod B / Service / Status) — required per the design system's accessibility rule (§6 of file 12), not optional.

### 3.4 Binary decision branch (used in Entry Trial Day-90 decision, and Accountability Path's final panel-vote outcome)
- A simple fork glyph: a single path splitting into two, each ending in a labeled pill (green "Full Entry" / red-gray "Discontinued" for Entry Trial; green "Continues" / gray "Dissolved" for Accountability).
- Before the decision is made: both branches shown in neutral gray with a "pending" dashed outline. After: the taken branch fills with its status color and a checkmark; the untaken branch dims further.

### 3.5 Vertical Stepper (Accountability Path, Module 08; also Pilot phase tracker, Module 09)
- 4 nodes (Accountability) or N nodes (Pilot, variable per the pilot's defined phases) connected by a vertical line.
- Node states: upcoming (hollow circle, gray), active (filled circle, `--status-active` blue, with a subtle pulse — this is one of the design system's sanctioned "one motion moment" exceptions since it indicates something currently in progress), complete (filled circle, `--status-good` green, checkmark inside), skipped (rare — hollow circle with a dash inside, used only if a stage is explicitly bypassed by rule, e.g., mediation skipped because both parties agreed immediately).
- Each node expands on click to show that stage's detail panel inline (accordion behavior), rather than navigating away — keeps the whole path visible while examining one stage.

### 3.6 Rotation countdown glyph (used wherever a rotating role/name appears — the single most-repeated custom asset in the product)
- A tiny (16px) circular progress ring drawn around or beside a role badge, filling clockwise from a full ring (just rotated in) to an empty/thinning ring (about to rotate out). Not a full pie-chart — just a thin stroke ring, so it reads as "time remaining," not as a data chart competing for attention.
- Color: always `--slate-500` neutral, never a status color — this glyph communicates time, not performance, and must not be visually confused with health/status indicators.
- Must render legibly at 16px — test at that exact size early; if the ring reads as noise that small, fall back to a simpler "3 o'clock position wedge" notch instead of a full progress ring.

### 3.7 VACC role icon set (Visionary / Architect / Catalyst / Coach — used in onboarding, Hub console, and any "remaining leadership" explainer content)
- Four icons, same 24×24 stroke style as §2, each depicting the role's function abstractly and literally — no metaphorical imagery (per the source model's explicit no-metaphor requirement):
  - **Visionary:** a simple horizon line with a dot above it (a "long view" glyph — a compass or telescope is acceptable as long as it stays literal/business-object, not a stylized eye or crystal ball).
  - **Architect:** a simple blueprint/ruler-and-square glyph.
  - **Catalyst:** a small spark/starburst glyph, kept geometric (not organic/flame-like, to avoid drifting toward metaphor).
  - **Coach:** a simple two-person outline with one slightly guiding gesture (a hand or arrow), avoiding any hierarchy implication (both figures same size).

### 3.8 Budget waterfall/arithmetic strip (Budget breakdown, Module 05)
- Not a chart in the traditional sense — a horizontal strip showing the actual arithmetic: `0.40 × 78` → `+` → `0.35 × 82` → `+` → `0.25 × 65` → `=` → `76.65`, each term appearing as a small labeled block, connected by plus/equals glyphs.
- This is the "show the formula" principle (file 01) made literally visual — treat it as a distinct component, not a repurposed bar chart.
- Animation: on first load only, terms appear left-to-right in sequence (the one sanctioned "orchestrated reveal" per the design system's motion principle) — never re-animates on subsequent views of the same locked cycle.

### 3.9 Capital flow diagram (Investor reporting, Module 09; informed by Appendix file 15's capital-flow section)
- A left-to-right directional flow: Investor node → Holding/Project node → Budget Market node (small icon reference to §3.8's world) → Units node (fan-out to represent "many pods") → back to a final 3-way split shown as a small donut (Investor 45% / Company X 18% / Units 37%).
- Keep this diagram schematic and clean (a Sankey-style flow is acceptable but must not require the reader to interpret proportional line thickness precisely — label every percentage explicitly since investor-facing content should never rely on eyeballing relative widths).

---

## 4. Standard data visualizations — per-screen chart specification

| Screen | Chart type | Data | X-axis | Y-axis / encoding | Color mapping |
|---|---|---|---|---|---|
| Dashboard → Org Pulse grid | Card grid (not a chart) | Pod scores | — | Card color border = status token | Status tokens |
| Budget → current cycle | Horizontal stacked bar or treemap | All pods' budget share | Cumulative % or absolute amount | Pod segments | One neutral hue ramp (`--signal-600` tints) + a distinct highlight color for "my pod" |
| Budget → pod breakdown | Custom arithmetic strip (§3.8) + a small donut for the 40/35/25 weighting | This pod's 3 components | — | Donut slices | 3 distinct, consistent colors reused everywhere the 3 components appear (financial / peer / strategic) — pick 3 tokens once and use them identically in every chart in this table that shows these components |
| Budget → history | Line chart | Score over time, optionally 3 sub-lines for components | Cycle number | Score 0–100 | Same 3-component colors as above; "my pod" line bold, comparison pod (if selected) dashed |
| Budget → history (comparison) | Same line chart, second pod overlaid | — | — | — | Comparison pod uses `--slate-500` regardless of its own identity elsewhere, to avoid a proliferation of arbitrary pod colors |
| Coaching console | Traffic-light grid (not a chart) | Pod health signal | — | Card background tint = status token | Status tokens |
| Coaching roster | Assignment matrix (grid) | Coach × Pod | Pods | Coaches | Filled cell = active assignment; no color coding needed beyond fill/empty |
| Sprint Calendar | Cycle Wheel (§3.1) / Pipeline bar (§3.2) | Phase boundaries | — | — | 5-step tint ramp, see §3.1 |
| Archive search | Plain table with tabular numerals | Mixed entity types | — | — | Small type-icon per row (reuses §2 icons) |
| Pilot tracker | Horizontal Gantt-style bar | Pilot phases (8 weeks prep + 90-day sprint) | Time (weeks/days) | Phase bars | Status tokens for phase completion state |
| Investor portal | Aggregate trend line + capital flow diagram (§3.9) | Aggregated financials | Cycle number | Aggregate metric | Muted, calmer palette than internal dashboards — investor view should feel like a simplified statement, not an operational cockpit |

**Cross-cutting chart rules:**
- Every chart has a visible title and, where relevant, a subtitle stating the time period covered (never assume the axis labels alone convey this).
- Every chart's data points are keyboard-focusable with a text-equivalent tooltip (accessibility floor from file 12 §6 applies to charts specifically, not just static UI).
- No 3D effects, no gratuitous gradients on chart fills — flat fills only, consistent with the "precision instrument" brief.

---

## 5. State illustrations — empty, error, and success states

**Style spec:** simple, single-color line illustrations (using the same stroke weight as the icon set, just larger — roughly 120–160px bounding box) rather than colorful mascot-style illustrations, to stay consistent with the "calm, evidentiary" brief and avoid the product feeling like a consumer app. No characters/mascots.

| Context | Screen(s) | Illustration concept | Copy pattern (see file 12 §3 for voice rules) |
|---|---|---|---|
| No pod assigned yet | Dashboard | An empty single node, waiting to connect to others | "You're not assigned to a pod yet — check with your Coaching Hub contact." |
| No agreements yet | Agreements | Two unconnected nodes | "No agreements yet — propose one with a pod you exchange work with." |
| No pitch submitted (before window opens) | Pod pitch editor | A locked document glyph | "Pitch editor opens on Day 81." |
| No reviews assigned | Peer Review queue | An empty inbox tray | "No reviews assigned to you this cycle." |
| No coaching sessions logged | Coaching / My Coach | An empty calendar page | "No sessions yet — request one when you're ready." |
| No search results | Archive | A magnifying glass over a blank page | "No results for '[query]' — try a different term or clear filters." |
| Data sync failed | Budget breakdown | A broken/paused sync-arrows glyph (reuses `data-source-error` icon, enlarged) | "Financial data last synced [date] — sync failed, contact Architecture Hub." |
| Correction applied | Any locked number that has a Correction Record | A small "superseded" stamp glyph next to the corrected value | Inline, not a full illustration — "Corrected on [date] — see reason" |
| Pitch submitted successfully | Pod pitch editor | A simple checkmark-in-circle, larger confirmation size | "Submitted on [timestamp]." |
| New pod launched (Deployment wizard) | Hub → Deployment | A single node appearing/settling into the network | "Pod launched — trial period began today." |
| Pilot decision recorded | Pilot tracker | The binary branch glyph (§3.4), reused | Result-specific, per §3.4 |

---

## 6. Motion / micro-interaction inventory

Per the design system's "one motion moment per major screen" principle, this is the complete, deliberately short list of every animation in the product — if an engineer or agent is tempted to add a hover-lift or fade-in anywhere not listed here, that's a signal to stop and check this list first.

| Interaction | Where | Behavior | Duration |
|---|---|---|---|
| Budget arithmetic reveal | Budget breakdown (§3.8) | Terms appear left-to-right in sequence on first load only | ~1.2s total, ~300ms per term |
| Rotation ring update | Anywhere §3.6 appears | Ring smoothly animates to new fill level only when the countdown value actually changes (e.g., day rollover), not on every re-render | 400ms ease-out |
| Stepper node activation | Accountability/Pilot stepper (§3.5) | Active node pulses gently (opacity 100%→70%→100%) to indicate "in progress," loops while active | 2s loop, subtle |
| Vote submission confirmation | Voting modal | Ballot icon (§2 `vote-ballot`) does a single small scale-bounce on submit | 250ms |
| Network graph layout settle | CLOU graph (§3.3) | Force-directed layout settles once on load/data-change, not continuously | ~1s settle, then static |
| Notification arrival | Bell icon | Badge count updates with a single small scale-pop, no persistent shake/wiggle | 200ms |
| Cycle Wheel today-marker | Sprint Calendar (§3.1) | Static position, no animation — only the underlying data (day) changes it, once per day, no need to animate a daily change | — |

All of the above must respect `prefers-reduced-motion`: reduce to an instant state-change (no transition) rather than removing the interaction's meaning entirely.

---

## 7. Asset production & handoff pipeline

1. **File formats:** all icons and custom diagrams as SVG (hand-optimized or run through SVGO — target <2KB per simple icon). Charts are code-rendered (Recharts/D3), not static image exports, so no raster asset production needed for §4. State illustrations (§5) also as SVG.
2. **Naming convention:** `category-name.svg`, kebab-case, matching the "Icon name" column in §2 exactly (e.g., `nav-dashboard.svg`, `flag-at-risk.svg`) — this lets the sprite-build step and the component library reference assets predictably without a lookup table.
3. **Folder structure:**
```
/assets
  /icons          (all of §2, flat, one file per icon)
  /diagrams       (source SVG/design files for §3's custom diagrams — these are usually
                    hand-built as React/SVG components, not static files, but keep a
                    reference design file per diagram here for design review)
  /illustrations  (all of §5)
```
4. **Color handling:** icons and illustrations use `currentColor` or CSS custom properties (never hardcoded hex inside the SVG) so they inherit design tokens and can be recolored per status without duplicate files.
5. **Review gate:** every new asset goes through the same design-review checklist as full screens (file 12 §7), specifically checkpoint 3 ("is color used anywhere purely for decoration?") and checkpoint 4 ("would this make sense to someone who's never seen a manager org-chart box?") — both checkpoints apply directly to icons like the VACC set (§3.7) and any onboarding illustration.
6. **Accessibility handoff:** every icon's `aria-label` (already listed in §2's table) and every chart's text-equivalent (per §4's cross-cutting rule) must be implemented at the same time the visual asset is integrated — not added later as a follow-up ticket.

---

## 8. Master production checklist (mapped to the engineering roadmap's phases, file 14)

| Asset group | Needed by roadmap phase | Priority |
|---|---|---|
| Base icon set (§2, nav + action icons) | Phase 0 | Blocking — Phase 0's component shells depend on these |
| Rotation countdown glyph (§3.6) | Phase 0/1 | Blocking — used the moment Pod Lead rotation ships |
| Pipeline/Timeline bar (§3.2) | Phase 1 | Blocking |
| Cycle Wheel (§3.1) | Phase 1 | High — can ship Phase 1 with the linear bar only and add the wheel as a fast-follow if design time is tight |
| CLOU Network Graph + list fallback (§3.3) | Phase 2 | High — build list-view first if needed, graph as fast-follow (explicitly allowed per Module 04's own spec) |
| Vote/case icons, binary decision branch (§3.4), stepper (§3.5) | Phase 3 | Blocking |
| Budget arithmetic strip (§3.8), budget charts (§4 budget rows) | Phase 4 | Blocking |
| VACC role icons (§3.7) | Phase 5 or onboarding content, whichever ships first | Medium |
| State illustrations (§5) | Rolling — each phase should ship its own module's empty/error states, not defer all illustration work to the end | Blocking per-module |
| Capital flow diagram (§3.9), investor charts | Phase 7 | Medium |
| Full motion pass (§6) | Phase 8 (Hardening) | Polish — functional without it, but required before calling v1 done, since several motion moments (e.g., §3.8's reveal) are core to the "show the formula" brief, not decoration |
