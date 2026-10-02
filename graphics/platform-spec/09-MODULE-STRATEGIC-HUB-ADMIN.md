# 09 — Module: Strategic Hub / Admin Console (Company X)

## Purpose
The single console for Company X's four hubs (Architecture, Deployment, Coaching, Strategic Interactions). Critically, this console must NOT function as a general "admin override" panel — every action here is scoped to exactly what the source model assigns to Company X, and nothing here can silently edit a pod's score, budget, or peer-review outcome (those flows live in their own modules with their own audited paths).

## Sub-console: `/hub/architecture`
Already detailed in Module 8 (Rule Versioning) and Module 6 (Calendar Configuration). This is the design/rules layer.

**Additional screen — Model Health Overview**:
- Aggregate stats: number of active rule versions, pods currently non-compliant with a recently changed rule (if any transition period applies), a changelog feed of the last 20 rule changes org-wide.

## Sub-console: `/hub/deployment`

### Screen: New Pod/Unit/Holding Wizard
Multi-step wizard mirroring the source model's onboarding sequence (Section 13/18/19 style process):

**Step 1 — Type**: New pod within existing holding / New holding (from-zero founding) / New pilot unit (e.g., "select one of 12 VCs" style flow).

**Step 2 — Basics**: Name, category tag, holding assignment, initial member list (add by email/invite), initial size (validated against the org's configured pilot-selection criteria if this is a pilot — e.g., "15–30 people" band shown as guidance with a soft warning if outside range).

**Step 3 — Selection criteria checklist** (for pilot-style deployments): a configurable checklist matching the source model's four criteria — team size band, leadership support confirmed (checkbox + named sponsor), financial/CRM system identified as connectable (with an integration-test button), non-critical-to-holding confirmation. This checklist's state feeds directly into the `EntryTrial.criteria` record from Module 8.

**Step 4 — Platform setup**: connect financial/CRM data source (OAuth or API-key flow to the integration layer — see `13-TECHNICAL-ARCHITECTURE.md`), assign initial coach (pulls from Coaching Hub roster, Module 7), set trial start date (defaults to today, can be scheduled).

**Step 5 — Review & launch**: summary, **[Launch Pod]** button → creates the `Pod` record with `status = trial`, creates the linked `EntryTrial` record (Module 8), sends welcome notifications to all initial members.

### Screen: Trial Status Tracker (`/hub/deployment` default view)
- Table of all pods currently in `trial` status: pod name, holding, days remaining until Day 90 decision, criteria-checklist completion %, **[Open Entry Tracker →]** (deep link to Module 8's `/review/entry/:podId`).

## Sub-console: `/hub/coaching-roster`
Fully specified in Module 7.

## Sub-console: `/hub/strategic-interactions`

### Screen: Investor/Partner Reporting
- **Report builder**: select date range, select holding(s)/pod(s) to aggregate (aggregation only — this screen structurally cannot expose single-pod operational detail beyond what that pod has already made public via its own dashboard), select metrics (total budget distributed, aggregate financial performance trend, number of active pods, number of pods successfully past trial vs. discontinued).
- **[Generate Report]** → produces a shareable, read-only snapshot (PDF or a link to `/investor-portal` scoped view).
- **[Publish to Investor Portal]** button — pushes the report to the restricted `/investor-portal` surface for assigned investor users.

### Screen: Media/Partner Contact Log (lightweight CRM-style list)
- Simple contact list with relationship type (Investor/Partner/Media/Institution), last interaction date, notes. Not a full CRM — just enough for the Strategic Interactions Hub to track its own external relationships per the source model's description of this hub's task.

## Sub-console: `/hub/pilots`
Purpose-built for tracking a named pilot program (e.g., "Pars Pilot") end-to-end, mirroring the source model's two-part pilot process exactly.

### Screen: Pilot Overview
- Pilot name, target holding (e.g., "Pars — 12 VCs"), selected pilot unit, current phase (mapped 1:1 to the source model's 8-week prep + 90-day sprint timeline):
  - Weeks 1–2: Selection & diagnostic interviews
  - Weeks 3–4: Pod split, coach assignment, charter drafted
  - Weeks 5–6: Lightweight platform setup
  - Weeks 7–8: Team training on rules
  - Sprint Days 1–90: (deep-links directly into that pod's `/calendar/pod/:podId`)
  - Post-Day-90: Evaluation meeting
- Each phase row has an owner field (e.g., "Deployment Hub + VC CEO") and a status (Not started/In progress/Done), matching the exact ownership table from the source model.
- **Success criteria panel**: the three source-defined criteria as trackable metrics — tactical decision time (input manually or computed from timestamped decision logs if available), pod satisfaction survey (link to a simple in-app survey form sent at sprint end), profit-to-budget ratio vs. this same team's prior traditional-structure performance (manual baseline entry + automatic current-cycle comparison from Module 5).
- **Post-Day-90 decision recorder**: **[Record Decision: Stop / Repeat / Expand to Next Unit]** — this triggers, if "Expand" is chosen, a pre-filled New Pod Wizard (Deployment sub-console) for the next unit, carrying over lessons-learned notes into that new pod's Archive record (Module 10).

## Data model
```
Holding
  id, name, parent_org_id (nullable, for multi-holding groups like Pars)

PilotProgram
  id, name, holding_id, pilot_pod_id, current_phase, phase_status (json),
  success_criteria (json: {decisionTimeBaseline, decisionTimeCurrent, satisfactionScore,
    profitBudgetRatioBaseline, profitBudgetRatioCurrent}),
  decision (nullable: stop|repeat|expand), decided_at

InvestorReport
  id, generated_by, date_range, scope (json: holdingIds/podIds), metrics (json),
  published (bool), published_at

ExternalContact
  id, name, relationship_type (investor|partner|media|institution), last_interaction_at, notes
```

## Business logic
- The Deployment Wizard's Step 5 launch action is the single entry point that creates a `Pod` — no other code path in the system creates a pod record, ensuring every pod always has a proper `EntryTrial` and initial coach assignment from day one.
- Investor Portal aggregation queries must enforce a minimum aggregation size (e.g., cannot generate a report scoped to a single pod if that would effectively expose pod-level detail beyond what's already public) — configurable threshold, off by default only if the org explicitly wants pod-level transparency to extend to investors too.

## API endpoints
- `POST /api/hub/deployment/pods` (the wizard's final launch action)
- `GET /api/hub/deployment/trials`
- `GET /api/hub/strategic/reports`
- `POST /api/hub/strategic/reports`
- `POST /api/hub/strategic/reports/:id/publish`
- `GET /api/hub/pilots/:id`
- `POST /api/hub/pilots/:id/phase-update`
- `POST /api/hub/pilots/:id/decision`
