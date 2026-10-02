# Company X Ecosystem Platform — Master Product & Technical Specification

> Codename: **Ecosystem OS** (working name — rename freely)
> Purpose: This repository is a complete, implementation-ready specification for the digital platform that runs the "Self-Governing Ecosystem" operating model. It is written to be handed directly to an engineering agent (human or AI) to build the product end-to-end, screen by screen, field by field, rule by rule.

## The working product

**Live:** https://soheilxcoder.github.io/ecosystem-os/

`site/` is a complete, working implementation of this specification — not a mock-up
and not a screenshot tour. Thirteen routes, eleven role personas, full Persian and
English, a seeded organisation of six units and fifty-four people, and every rule
in `15-BUSINESS-RULES-APPENDIX.md` computed rather than typed in.

```bash
node tools/build-site.mjs          # verify, then build into dist/
node tools/smoke-site.cjs          # render every screen × every role × both languages
node tools/serve-dist.cjs           # serve dist/ the way Pages would
./tools/publish-pages.sh           # build, test, and publish to the live URL
```

No dependencies, no CDN, no build step at runtime, no network requests of any kind.
Every font is resolved from `local()` sources, every icon is inline SVG from
`site/assets/icons.js`.

Two things are worth opening first:

- **`#/design-system`** — `12-DESIGN-SYSTEM.md` and `16-VISUAL-ASSETS-MASTER-PLAN.md`
  rendered with the real components and real data, including the list of
  anti-patterns the build refuses to ship.
- **The persona switcher** in the top bar — roles here are *assignments*, not
  identities, so switching persona changes what the same screen is allowed to show.
  Try Maryam (pod member), Sara (coach of four units), Reza (Architecture Hub) and
  Dara (investor) on the same route.

## Repository layout

| Path | What it is |
|---|---|
| `00`–`15`, `DEVELOPMENT.md` | The current research specification. Read in the order below. |
| `graphics/platform-spec/` | The graphic design specification set, including `16-VISUAL-ASSETS-MASTER-PLAN.md` — the five signature diagrams. |
| `اکوسیستم_شرکت_X_نسخه_نهایی_بدون_استعاره.md` | The original Persian master model document the specification was derived from. |
| `site/` | The working static product published to GitHub Pages. |
| `tools/` | Build, smoke test, DOM shim, a Pages-accurate preview server and the one-command publish script. |
| `app/`, `components/`, `core/`, `db/`, `server/`, `lib/`, `tests/` | The Next.js + Fastify + PGlite application. `npm install && npm test`. |

All three specification sets are kept in the repository on purpose: the original
model document states the intent, the graphic design set fixes the visual
contract, and the numbered research set is the implementation spec. Where they
disagree, the numbered set wins for behaviour and `16-VISUAL-ASSETS-MASTER-PLAN.md`
wins for presentation.

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

| # | Module | Specification | Working screen |
|---|---|---|---|
| 1 | Dashboard (home) | `02-MODULE-DASHBOARD.md` | `#/dashboard` — seven role variants |
| 2 | Pods & Teams | `03-MODULE-PODS-TEAMS.md` | `#/pod/{id}` — overview, members, pitch, history |
| 3 | Bilateral Agreements (CLOU) | `04-MODULE-CLOU-AGREEMENTS.md` | `#/agreements` — list, detail, network graph |
| 4 | Internal Budget Market | `05-MODULE-BUDGET-MARKET.md` | `#/budget` — market, breakdown, history, simulator |
| 5 | 90-Day Sprint Calendar | `06-MODULE-SPRINT-CALENDAR.md` | `#/calendar` — Cycle Wheel, weekly rhythm, ICS export |
| 6 | Coaching | `07-MODULE-COACHING.md` | `#/coaching` — coach console, pod view, reassignment clock |
| 7 | Peer Review & Governance (incl. accountability/dissolution + 90-day entry rule) | `08-MODULE-PEER-REVIEW-GOVERNANCE.md` | `#/review` — queue, rubric, four-stage path, entry decision, rules |
| 8 | Strategic Hub / Admin Console (Company X) | `09-MODULE-STRATEGIC-HUB-ADMIN.md` | `#/hub` — architecture, deployment, coaching, strategic, pilots |
| 9 | Archive & Organizational Memory | `10-MODULE-ARCHIVE-KNOWLEDGE-BASE.md` | `#/archive` — index, search, lessons |
| 10 | Notifications | `11-MODULE-NOTIFICATIONS.md` | `#/notifications` — needs-action inbox, preference matrix |
| — | Investor reporting | `09`, `11` | `#/investor` — published reports, capital flow, profit split |
| — | Settings & context | `01`, `12` | `#/settings` — language, calendar, day travel, live permissions |
| — | Design system | `12`, `16` | `#/design-system` — tokens, components, diagrams, anti-patterns |

## Non-negotiable design constraints (apply to every module)

- **No manual override of the budget formula.** The 40/35/25 weighting (see appendix) is computed by the system; no human role, including Company X admins, gets a "manual adjustment" field in v1. If this is ever needed, it must be an explicit, logged, visible exception — never a hidden edit.
  *Enforced in `site/assets/domain.js` — `allocateBudget()` takes no override parameter, and the Hub's pool screen can change the pool total and the versioned share cap but has no per-unit field.*
- **Every number on every dashboard must be traceable to its source.** Clicking any statistic shows "where this number comes from" (raw records, formula, timestamp of last calculation).
  *Enforced by `ECO.ui.provTrigger` and `ECO.H.prov`; the design-system screen lists "a number without its derivation" as a refused anti-pattern.*
- **No hidden admin superpowers.** Company X's hub console can configure rules and deploy new units, but cannot silently edit a pod's score, budget, or peer-review result. All Company X actions are visible in the same audit log pods can see.
  *Enforced by `site/assets/store.js` — every mutation re-checks `can()` and the time window, and writes to the same archive index the pods read. `#/settings/permissions` renders the live matrix from that same `MATRIX` object, so the documented permissions cannot drift from the enforced ones.*
- **Rotation, not permanence.** Anywhere a "lead" or "reviewer" role appears in the UI, the interface must visibly show the rotation countdown/date — never render as a static, permanent title.
  *Enforced by `ECO.ui.rotationBadge`, which always pairs the countdown ring with a day count.*
- **Mobile-usable, desktop-primary.** Pod members will check dashboards and vote from phones; hub/admin console and detailed budget analytics are desktop-primary but must not break on mobile.
  *Enforced by the five-item mobile tab bar in `site/assets/app.js` and `ECO.H.wideScreenNote` on every dense surface.*
