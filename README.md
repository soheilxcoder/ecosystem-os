# Company X Ecosystem Platform — Master Product & Technical Specification

> Codename: **Ecosystem OS** (working name — rename freely)
> Purpose: This repository is a complete, implementation-ready specification for the digital platform that runs the "Self-Governing Ecosystem" operating model. It is written to be handed directly to an engineering agent (human or AI) to build the product end-to-end, screen by screen, field by field, rule by rule.

## Why this exists

The underlying operating model (see `15-BUSINESS-RULES-APPENDIX.md` for the condensed source-of-truth) replaces a traditional single manager with six coordinated mechanisms: self-governing units, bilateral agreements (CLOU), a digital platform, rotating coaching, a strategic interactions hub, and a dynamics/evolution mechanism for founding and dissolving units. **The digital platform is the nervous system that makes the other five mechanisms actually work in practice** — without it, "transparency," "peer review," and "automatic budget allocation" are just words. This spec turns those words into screens, buttons, data models, and APIs.

## How to use this repository

Read in this order:

1. `00-OVERVIEW.md` — product vision, goals, non-goals, personas, guiding principles.
2. `01-INFORMATION-ARCHITECTURE.md` — full sitemap, navigation, and permission model.
3. `02` through `11` — one file per module. Each module file is self-contained and includes: purpose, user stories, every screen with every button/field/state, empty/error/loading states, business logic and formulas, data model for that module, and API endpoints for that module.
4. `12-DESIGN-SYSTEM.md` — visual identity, design tokens, typography, component library, motion rules.
5. `13-TECHNICAL-ARCHITECTURE.md` — stack recommendation, system architecture, full data model (ERD), integration strategy, security, multi-tenancy.
6. `14-ROADMAP-FOR-AGENT.md` — the exact build order, phase by phase, with a definition of done for each phase. **Start building here.**
7. `15-BUSINESS-RULES-APPENDIX.md` — every numeric rule, formula, percentage, and day-range in the entire model, in one place, so nothing gets re-derived incorrectly during implementation.

## Module map

| # | Module | File |
|---|---|---|
| 1 | Dashboard (home) | `02-MODULE-DASHBOARD.md` |
| 2 | Pods & Teams | `03-MODULE-PODS-TEAMS.md` |
| 3 | Bilateral Agreements (CLOU) | `04-MODULE-CLOU-AGREEMENTS.md` |
| 4 | Internal Budget Market | `05-MODULE-BUDGET-MARKET.md` |
| 5 | 90-Day Sprint Calendar | `06-MODULE-SPRINT-CALENDAR.md` |
| 6 | Coaching | `07-MODULE-COACHING.md` |
| 7 | Peer Review & Governance (incl. accountability/dissolution + 90-day entry rule) | `08-MODULE-PEER-REVIEW-GOVERNANCE.md` |
| 8 | Strategic Hub / Admin Console (Company X) | `09-MODULE-STRATEGIC-HUB-ADMIN.md` |
| 9 | Archive & Organizational Memory | `10-MODULE-ARCHIVE-KNOWLEDGE-BASE.md` |
| 10 | Notifications | `11-MODULE-NOTIFICATIONS.md` |

## Non-negotiable design constraints (apply to every module)

- **No manual override of the budget formula.** The 40/35/25 weighting (see appendix) is computed by the system; no human role, including Company X admins, gets a "manual adjustment" field in v1. If this is ever needed, it must be an explicit, logged, visible exception — never a hidden edit.
- **Every number on every dashboard must be traceable to its source.** Clicking any statistic shows "where this number comes from" (raw records, formula, timestamp of last calculation).
- **No hidden admin superpowers.** Company X's hub console can configure rules and deploy new units, but cannot silently edit a pod's score, budget, or peer-review result. All Company X actions are visible in the same audit log pods can see.
- **Rotation, not permanence.** Anywhere a "lead" or "reviewer" role appears in the UI, the interface must visibly show the rotation countdown/date — never render as a static, permanent title.
- **Mobile-usable, desktop-primary.** Pod members will check dashboards and vote from phones; hub/admin console and detailed budget analytics are desktop-primary but must not break on mobile.
