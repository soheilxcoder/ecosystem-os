# 06 — Module: 90-Day Sprint Calendar

## Purpose
This module is the org-wide clock. Every other module (Pods, Budget, Peer Review, Coaching) reads the current cycle/phase from here — it must be the single source of truth for "what day of the 90-day cycle is it, for this pod." All cycles across the org are synchronized to the same calendar by default (per the source model's requirement that synchronization is what makes scoring comparable), with the sole exception of pods still in their 90-day trial/entry window (Module 7 handles that separately).

## The five phases (exact day ranges — see appendix)
```
Days 1–3    Pod Lead rotation + priority setting
Days 4–80   Execution, automated weekly check-ins
Days 81–85  Report drafting + final pitch submission
Days 86–88  Peer review by rotating panel
Days 89–90  Results announced, budget allocated, next cycle begins immediately
```

## User stories
- As anyone, I want to see what phase the organization is in today and how many days remain.
- As a Pod Lead, I want reminders as key transition days approach (Day 1, Day 81, Day 90).
- As Company X, I want to configure the calendar (start dates, holidays/pauses) for the whole org or a specific holding.

## Screen: `/calendar/org`

### Layout
1. **Circular cycle wheel** (primary visual): a ring divided into 5 proportionally-sized colored arcs matching the day ranges, with a marker showing "today." Hovering/tapping an arc shows that phase's name, day range, and what happens during it.
2. **Linear fallback view** (toggle, better for narrow screens): a horizontal bar with the same 5 segments and a today-marker.
3. **"What's happening today" card**: plain-language description of the current phase's expected activity org-wide (e.g., "Peer review panels are scoring pitches — most pods should hear results within 2 days").
4. **Upcoming milestones list**: next 3 milestone dates (e.g., "Day 81 — Pitch window opens — in 6 days") with an **[Add to my calendar]** button (generates .ics) for each.
5. **Cycle history strip** (bottom): past cycle numbers with their date ranges, clickable to jump into that historical cycle's org-wide data (read-only).

## Screen: `/calendar/pod/:podId`
Same visual structure as `/calendar/org`, but annotated with this specific pod's own milestones layered on top: when this pod's current Pod Lead term ends, when this pod's last check-in was logged, when this pod's pitch was submitted (or is due). If this pod is still within its 90-day trial/entry window (new pod), the ring instead shows the Entry-Rule timeline (see Module 7) with a clear label distinguishing it: "This pod is in its Entry Trial — see Module 7 rules."

## Screen: `/hub/architecture` → Calendar Configuration panel (Company X only)
- **Global cycle settings**: cycle length (default 90 days, editable only via versioned rule change — see Module 8's rule-versioning flow, never a silent field edit), phase boundary days (3 / 80 / 85 / 88 / 90 — editable the same way).
- **Holiday/pause calendar**: ability to insert non-counting pause days (e.g., a company-wide shutdown week) that extend the cycle without breaking day-numbering logic — this list must be visible to all users on `/calendar/org`, not hidden in an admin-only view, since it changes everyone's dates.
- **Per-holding override**: option to give a specific holding/VC its own start offset (needed for staggered rollouts like the Pars pilot, so the pilot's first cycle doesn't have to wait for the master org calendar's Day 1).

## Data model
```
SprintCycle
  id, holding_id (nullable = org-wide default calendar), cycle_number,
  start_date, end_date, phase_boundaries (json: {p1_end, p2_end, p3_end, p4_end, p5_end}),
  pause_days (json array of dates), status (active|completed)

CycleMilestoneReminder
  id, cycle_id, milestone_type (pod_lead_rotation|pitch_open|pitch_deadline|review_deadline|results),
  target_date, notified (bool)
```

## Business logic
- Every module that needs "what phase is it" calls a single shared service function `getCurrentPhase(podId, date)` rather than re-implementing day-math locally — this prevents the classic bug class of two modules disagreeing about whether it's Day 80 or Day 81.
- Pause days shift all subsequent phase boundaries forward by the same count, transparently, and the UI must show "Adjusted for N pause day(s)" wherever a boundary date is displayed, so nobody thinks a deadline moved for an unexplained reason.
- Changing cycle length or phase boundaries takes effect only from the *next* cycle onward by default — never retroactively reslices a cycle already in progress (this must be enforced in code, not just documented, since a rule change mid-cycle desynchronizing pitch/review windows would be a serious correctness bug).

## API endpoints
- `GET /api/calendar/current?scope=org|pod&podId=&holdingId=`
- `GET /api/calendar/phase?podId=&date=` → shared phase-resolution endpoint
- `POST /api/calendar/config` (Architecture Hub only, versioned)
- `GET /api/calendar/history?scope=&limit=`
