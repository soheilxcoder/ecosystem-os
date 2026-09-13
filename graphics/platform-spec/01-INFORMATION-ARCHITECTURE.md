# 01 — Information Architecture

## 1. Top-level navigation (left sidebar, persistent)

```
┌─────────────────────────┐
│ [Org logo]  [Org name ▾]│  ← org/holding switcher (for users in multiple holdings)
├─────────────────────────┤
│ 🏠 Dashboard             │
│ 👥 My Pod                │
│ 🔗 Agreements (CLOU)     │
│ 💰 Budget Market         │
│ 🗓 Sprint Calendar        │
│ 🧭 Coaching              │
│ ⚖️  Peer Review & Cases   │
│ 🗂 Archive                │
├─────────────────────────┤
│ 🛠 Hub Console  (Co. X only)│
├─────────────────────────┤
│ 🔔 Notifications  [badge]│
│ ⚙️  Settings              │
│ 👤 [Avatar] [Name ▾]     │
└─────────────────────────┘
```

- Sidebar collapses to icon-only rail below 1280px; converts to a bottom tab bar (5 primary items max: Dashboard, My Pod, Budget, Calendar, Notifications) below 768px (mobile).
- "Hub Console" item is visible only to users with a Company X hub role; invisible (not just disabled) to everyone else.
- Org/holding switcher only renders if the logged-in user belongs to more than one org/holding (e.g., a coach covering pods across VCs, or a Pars-level executive).

## 2. Full sitemap

```
/dashboard
/pod/:podId
  /pod/:podId/overview
  /pod/:podId/members
  /pod/:podId/pitch/:cycleId
  /pod/:podId/history
/agreements
  /agreements/active
  /agreements/proposals
  /agreements/:cloudId
  /agreements/new
/budget
  /budget/current-cycle
  /budget/history
  /budget/:podId/breakdown
  /budget/simulator          (read-only "what would change my score" tool)
/calendar
  /calendar/org             (org-wide 90-day cycle view)
  /calendar/pod/:podId       (pod-specific view of same cycle)
/coaching
  /coaching/my-coach         (pod member view)
  /coaching/console          (coach view: assigned pods)
  /coaching/sessions/:sessionId
/review
  /review/queue              (peer validator's assigned reviews)
  /review/cases              (conflict resolver's active cases)
  /review/accountability/:podId   (accountability-path tracker, Section 17 logic)
  /review/entry/:podId            (90-day entry-rule tracker, Section 14 logic)
/archive
  /archive/decisions
  /archive/lessons
  /archive/:podId/history
/hub                          (Company X only)
  /hub/architecture           (rule/config versioning)
  /hub/deployment             (new pod/unit/holding wizard + trial tracking)
  /hub/coaching-roster
  /hub/strategic-interactions (investor/partner reporting)
  /hub/pilots                 (pilot program tracker, e.g. "Pars Pilot")
/notifications
/settings
  /settings/profile
  /settings/org
  /settings/permissions       (Company X only)
/investor-portal               (separate restricted surface, see Module 8)
```

## 3. Permission model (roles are assignments, not identities)

A single person can simultaneously hold multiple roles. Roles are **time-boxed assignments** stored as records (role, pod/scope, start date, end date/rotation date), never as a permanent field on the user profile. This is a core data-model requirement — see `13-TECHNICAL-ARCHITECTURE.md` §4.

| Role | Scope | Can view | Can act |
|---|---|---|---|
| Pod Member | 1 pod | Own pod full detail; all other pods' public dashboards | Log check-ins, vote for Pod Lead, comment |
| Pod Lead | 1 pod, 90-day window | Same as Pod Member | + submit pitch, propose CLOUs, schedule pod meetings |
| Peer Validator | 1 review cycle, 1 target pod | Assigned pod's pitch + supporting data | Submit score + comments |
| Conflict Resolver | 1 case | Both pods' relevant shared data (not full internal data) | Log mediation notes, submit non-binding recommendation |
| Coach | 3–5 pods, 2–3 cycle rotation | Assigned pods' health dashboards, session history | Log sessions, flag for accountability path |
| Company X — Architecture | Org-wide | Rule configuration history | Propose/version rule changes (see approval flow in Module 8) |
| Company X — Deployment | Org-wide | All pods, trial-status | Create new pods/units/holdings, manage trial timelines |
| Company X — Coaching Hub | Org-wide | Coach roster + assignments | Assign/reassign coaches |
| Company X — Strategic Interactions | Org-wide (aggregated) | Aggregated financials, investor portal content | Publish investor updates |
| Investor | Assigned holding(s) | Aggregated financial reporting only | None (read-only) |
| Holding Executive (e.g. Pars CEO) | 1 holding, all its units | Cross-unit comparison, pilot tracker | Approve pilot expansion decisions |

**Design rule:** the permission system must support a user holding, e.g., "Pod Member of Pod A" + "Peer Validator of Pod B, cycle 7" + "Coach of Pods C/D/E" all at once, with the UI clearly separating these contexts (see the org/context switcher in Module 1).

## 4. Cross-cutting UI conventions

- **Rotation badge**: any role-holder's name anywhere in the UI is followed by a small pill showing the role and countdown, e.g. `Sara — Pod Lead (14 days left)`. Clicking it shows the rotation history for that seat.
- **Data provenance icon** (a small "i" or timestamp icon) next to every computed number, opening a popover: "Calculated from: [source] · Last updated: [timestamp] · Formula: [link to appendix]."
- **Status chips** use a consistent 4-color system across all modules (see `12-DESIGN-SYSTEM.md` for exact tokens):
  - Gray = draft/not started
  - Blue = in progress / active
  - Green = completed / passed / healthy
  - Amber/Red = flagged / at risk / overdue — amber for "watch," red for "action required"
