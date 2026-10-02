# 14 — Roadmap for the Build Agent

This is the exact build order. Each phase has a definition of done. Do not start a phase until the previous phase's definition of done is fully met — several later modules assume earlier ones are already correct (e.g., Peer Review assignment logic depends on Pods and CLOU both existing first).

## Phase 0 — Foundations (no user-facing screens yet)
**Build:**
- Postgres schema for: `Org`, `Holding`, `User`, `RoleAssignment`, `Pod`, `PodMembership` (the absolute minimum ERD slice from `13-TECHNICAL-ARCHITECTURE.md` §3).
- Auth integration (OIDC login) + the `authorize()` middleware pattern from §4 of the same file.
- The internal event bus (even a simple in-process pub/sub is fine for v1) that Archive and Notifications will both subscribe to later.
- Design tokens from `12-DESIGN-SYSTEM.md` §2 implemented as a Tailwind config / CSS variable sheet, plus the base component shells (Data Card, Status Chip, Rotation Badge) built and visually reviewed against the design-review checklist (`12-DESIGN-SYSTEM.md` §7) BEFORE any real screen uses them.

**Definition of done:** a user can log in, see an empty shell of the sidebar from `01-INFORMATION-ARCHITECTURE.md` §1, and the three base components render correctly at 1440px/768px/375px.

## Phase 1 — Pods & Sprint Calendar (Modules 03 + 06)
**Why first:** every other module reads "what pod am I in" and "what day of the cycle is it."

**Build:** full Module 3 (Pod overview, members, Pod Lead rotation + voting, weekly check-ins, pitch editor with the exact Day 81–85 window enforcement) and full Module 6 (org-wide + per-pod calendar, the shared `getCurrentPhase()` service, Architecture Hub calendar config).

**Definition of done:** a pod can be manually seeded via a DB script (deployment wizard doesn't exist yet), its members can log in, vote for a Pod Lead, log check-ins during Days 4–80, and submit a pitch during Days 81–85 — with the server rejecting a submission attempt outside that window (test this explicitly, not just via disabled buttons).

## Phase 2 — CLOU Agreements (Module 04)
**Build:** full proposal wizard, response flows, agreement detail, and the network graph view (list-view first if the graph is taking longer — ship list view, follow with graph).

**Definition of done:** two seeded pods can propose, counter, and accept an agreement end-to-end; the graph/list correctly shows unrelated pods as connected only via the shared-infrastructure dotted line, per the exact rule in Module 4.

## Phase 3 — Peer Review & Governance (Module 08) — build before Budget Market
**Why before Budget:** the budget formula's Peer Review component (35% weight) needs real review data to calculate against; build the review workflow first so Phase 4 has real inputs to test with, not mocked ones.

**Build:** peer review assignment (with the conflict-of-interest exclusions from Module 3/8), the scoring form, Conflict Resolver case workspace, and — critically — the two governance state machines (Entry Trial, Accountability Path) built as clearly separate code paths from day one, with the automated test suite specified in `13-TECHNICAL-ARCHITECTURE.md` §9 point 3 written alongside, not after.

**Definition of done:** a full review cycle can be assigned and scored end-to-end; an Entry Trial can be walked from Day 0 to a Day-90 decision; an Accountability Case can be walked through all 4 stages to a panel vote — all three flows tested independently and confirmed never to cross-contaminate state.

## Phase 4 — Internal Budget Market (Module 05)
**Build:** the formula engine (as pure, unit-tested functions per `13-TECHNICAL-ARCHITECTURE.md` §9 point 1), the financial data connector interface (can start with a manual CSV-upload connector as a stand-in for a real accounting integration), the full breakdown screen with provenance drill-down, budget history, and the read-only simulator.

**Definition of done:** running the formula engine against a hand-calculated example (documented in the appendix, §15) produces byte-for-byte matching output; the 30% cap and redistribution logic is verified against a scenario with at least 2 pods simultaneously hitting the cap.

## Phase 5 — Coaching (Module 07)
**Build:** coach console, session logging (with the private/pod-visible split), the roster/assignment matrix, and the derived `PodHealthSignal` computation.

**Definition of done:** a coach assigned to 3+ seeded pods sees correct health signals derived from real check-in/score/review data already in the system from prior phases; reassignment countdown displays correctly at 2 and 3 cycles.

## Phase 6 — Notifications & Archive (Modules 10 + 11)
**Why together, and why last among the "core" modules:** both are event-driven consumers of everything built in Phases 1–5; building them last means the full canonical trigger list (`11-MODULE-NOTIFICATIONS.md`'s table) can be wired against real, already-working event emitters rather than speculative ones.

**Build:** the event-bus subscribers for both Notification dispatch and Archive indexing; the Notifications inbox screen and preferences; the Archive search screen and Lessons Learned flow.

**Definition of done:** performing any single action from Phases 1–5 (e.g., submitting a pitch) produces both a correctly-routed notification and a correctly-indexed, searchable Archive entry, without either being manually triggered.

## Phase 7 — Strategic Hub / Admin Console (Module 09)
**Why last:** this module's Deployment Wizard is the "proper" way to create a pod, but Phases 1–6 deliberately used manually-seeded pods so each module could be built and tested independently first. Building the wizard last, once every downstream module already works, means the wizard has real, working destinations to wire into.

**Build:** full deployment wizard (replacing the DB-seed script used in earlier phases), trial tracker, rule versioning UI (the backend rule-change data model should already exist from Phase 3/4 — this phase adds the shared UI), strategic interactions reporting + investor portal, and the pilot tracker.

**Definition of done:** a brand-new pod can be created entirely through the wizard, automatically receives an `EntryTrial` record, an assigned coach, and a connected data source, and appears correctly across Dashboard, Calendar, and Budget without any manual database intervention. A full pilot (using seed data mirroring the "Pars Pilot" example in the appendix) can be tracked end-to-end through its 8-week prep + 90-day sprint + decision.

## Phase 8 — Hardening
- Full accessibility pass against `12-DESIGN-SYSTEM.md` §6.
- Security review against `13-TECHNICAL-ARCHITECTURE.md` §6 (row-level access control tests for coach notes and investor aggregation minimums specifically — these are the two highest-risk data-leak points in the whole spec).
- Load-test the budget-lock calculation (Module 5) under a realistic pod count (e.g., 50–200 pods) since it's the one calculation that must complete reliably within the Day 89–90 window for every cycle going forward.
- Implement the Correction Record workflow (`13-TECHNICAL-ARCHITECTURE.md` §7) and verify it against a simulated real-world error scenario.

## Explicit non-goals for v1 (do not build until requested)
- AI-driven pod/talent matching.
- Native mobile apps (a responsive web app per `12-DESIGN-SYSTEM.md` §6 is the v1 target; native apps are a v2+ decision).
- Push/SMS notifications.
- Multi-currency support (assume a single organizational currency in v1 unless the org's actual holdings require otherwise — flag this early if so, since it would touch the Budget Market formula's normalization step).
