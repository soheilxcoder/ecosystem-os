# 02 — Module: Dashboard (Home)

## Purpose
The dashboard is step 2 of the platform's 7-step data pipeline from the source model (raw data in → live dashboard visible to everyone). It is the first screen after login and must answer, at a glance, three questions for any user: "How is my pod doing?", "How is the organization doing?", and "What needs my attention right now?"

## User stories
- As a Pod Member, I want to see my pod's current score components and where we stand in the current 90-day cycle without asking anyone.
- As any employee, I want to see other pods' public performance so the system's transparency claim is real, not marketing.
- As a Coach, I want a health-signal view across my 3–5 assigned pods so I know where to spend my attention.
- As a Company X hub member, I want an org-wide rollup across all pods/units/holdings.

## Screen: `/dashboard` (default view for Pod Member / Pod Lead)

### Layout (top to bottom, desktop)
1. **Header bar**: org/holding switcher, current date, current sprint day counter (e.g., "Day 47 of 90"), global search.
2. **"My Pod" hero card** (full width):
   - Pod name + avatar/icon
   - Current Pod Lead name + rotation countdown badge
   - Current cycle score-so-far (live estimate, clearly labeled "Live estimate — final score locked at Day 90")
   - 3 mini-stat tiles: Financial performance (this period, vs. last period, ▲/▼ arrow), Peer review status (Not yet reviewed / In review / Scored: X), Strategic alignment tag (which org goal this pod is tagged against)
   - Buttons: **[View Pod →]** (primary), **[Submit Pitch]** (only visible/enabled during Days 81–85 of the cycle, otherwise shown disabled with tooltip "Opens on Day 81"), **[Log Weekly Check-in]** (visible/enabled during Days 4–80 only)
3. **"Organization Pulse" section** (grid of cards, one per other pod, sorted by default on "Recently updated"):
   - Each card: Pod name, current score badge (color-coded per status chip convention), one-line pitch headline if published, **[View →]** link.
   - Filter/sort control: sort by Score / Name / Category / Cycle status; filter by holding/VC if applicable.
   - This grid is intentionally NOT ranked by score by default (avoid implying a punitive leaderboard) — sort-by-score is available but not the default, per source model's emphasis on transparency-not-punishment.
4. **"Cycle Timeline" widget** (right rail or below on mobile): a horizontal progress bar showing the 5 phases of the 90-day sprint (Days 1–3 / 4–80 / 81–85 / 86–88 / 89–90) from Module 5, with a marker for "today." Clicking any phase deep-links to `/calendar/org`.
5. **"Needs Your Attention" list** (right rail): action items generated from Notifications (Module 10) — e.g., "You have a pitch to review by [date]," "Your pod's CLOU proposal from [pod] is awaiting your signature," "Coaching session scheduled [date/time]." Each item has a single primary action button.
6. **"Recent Organization Activity" feed** (footer section): a chronological, read-only log — new CLOU signed, new pod's trial status resolved, cycle results announced, new unit onboarded. This is a public trust-building feed (no sensitive data), sourced from the Archive module.

### States
- **Empty state (new user, no pod yet)**: "You're not assigned to a pod yet — check with your Coaching Hub contact." No broken widgets; hero card replaced with a simple assignment-pending message.
- **Loading state**: skeleton cards for hero + grid, not a blocking spinner — grid population is progressive (cards populate as data arrives).
- **Error state (data source unreachable)**: banner at top: "Some data couldn't be refreshed. Last successful sync: [timestamp]." Never silently show stale numbers as if live.

## Screen: `/dashboard` (Coach view variant)
Replaces "My Pod" hero with a **"My Assigned Pods"** panel: a row of 3–5 compact pod-health cards (traffic-light status per pod, last coaching session date, next scheduled session). A **[Log Session]** button on each. A banner appears if any assigned pod has crossed into the accountability path (Module 7) requiring coach attention.

## Screen: `/dashboard` (Company X Hub view variant)
Replaces "My Pod" hero with an **"Org-Wide Rollup"** panel:
- Total pods, pods in trial status, pods in accountability path (counts, clickable to filtered lists)
- Aggregate budget distributed this cycle vs. last cycle
- Pilot program status card if a pilot (e.g., "Pars Pilot") is active, with a **[View Pilot Tracker →]** button to `/hub/pilots`

## Data this screen reads (no writes except check-in/pitch shortcuts)
- Pod scores and components (from Budget Market module)
- Cycle phase/day counter (from Sprint Calendar module)
- Notification queue (from Notifications module)
- Activity feed (from Archive module)

## API endpoints (see `13-TECHNICAL-ARCHITECTURE.md` for full contracts)
- `GET /api/dashboard/summary?userId=` → returns role-aware payload (pod summary, org pulse list, timeline, attention items)
- `GET /api/pods/:podId/live-score` → live-estimate score with provenance metadata
- `GET /api/activity-feed?scope=org&limit=20`
