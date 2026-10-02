# 07 — Module: Coaching

## Purpose
Implements rotating coaching exactly as specified: a coach covers 3–5 pods, reassigned every 2–3 cycles to prevent personal dependency, never issues directives, and is distinct from the Pod Lead rotation (Module 3) — the two rotation systems must never be visually or logically merged.

## User stories
- As a Pod Member, I want to know who my coach is and how to reach them.
- As a Coach, I want a console showing all my assigned pods' health at a glance, so I know where to focus.
- As Company X's Coaching Hub, I want to assign/reassign coaches to pods and track when reassignment is due.
- As a Coach, I want to log sessions and, when needed, flag a pod into the accountability path (handoff to Module 8).

## Screen: `/coaching/my-coach` (Pod Member/Lead view)
- Coach's name, contact/scheduling link, "coaching since [date]," reassignment-due indicator (e.g., "Rotates to a new coach around [date range]" — shown as an approximate window, not a hard-committed date, since reassignment depends on the Coaching Hub's scheduling).
- **Session history**: list of past sessions with this coach (date, brief topic/note if the coach chose to share one — coaches control what session detail is pod-visible vs. private to the coach, since coaching often involves sensitive interpersonal content; see privacy note below).
- **[Request a Session]** button → simple scheduling request form (topic, urgency, preferred times) sent to the assigned coach.

## Screen: `/coaching/console` (Coach view)
### Layout
1. **Assigned pods grid** (3–5 cards): pod name, health indicator (traffic-light, computed from a combination of recent check-in "at-risk" flags from Module 3, budget-score trend from Module 5, and peer-review sentiment), last session date, next scheduled session, **[Log Session]** and **[Schedule Session]** buttons on each card.
2. **Reassignment timer**: a visible countdown/progress bar showing "Cycle 2 of 2–3 with this pod set — reassignment review due around [date]." This makes the "no personal dependency" rule visible as an actual UI element, not just a policy.
3. **Flag banner**: if any assigned pod's health indicator has been red for a sustained period (org-configurable threshold, e.g., "flagged red for 2+ consecutive cycles"), a prominent card appears: **[Consider Accountability Path →]** linking to Module 8's accountability tracker for that pod. This is a suggestion surfaced to the coach, never an automatic action — the coach (a human) decides whether to initiate it.

## Screen: `/coaching/sessions/:sessionId` (Session log entry)
### Fields
- Date/time (auto-filled, editable)
- Pod (auto-filled from context)
- Session type (Check-in / Conflict support / Skill development / Other)
- Private notes (visible only to the coach and Coaching Hub — never pod-visible; this is the coach's own working memory)
- Pod-visible summary (optional, short, shown to the pod in their session history — the coach chooses what to share here)
- **[Save Private]** / **[Save & Share Summary with Pod]** — two distinct buttons, so sharing is always a deliberate choice, never accidental.

## Screen: `/hub/coaching-roster` (Company X — Coaching Hub only)
### Layout
1. **Coach directory table**: coach name, currently assigned pods (chips), assignment start date, cycles remaining until mandatory review, coach-reported capacity ("comfortable" / "stretched" — self-reported by coach, not inferred).
2. **Assignment matrix view**: pods on one axis, coaches on the other, visual grid showing current assignments; drag-and-drop (desktop) or a select-based reassign flow (mobile-safe fallback) to move a pod to a different coach.
3. **[+ Reassign]** button on any pod row → modal: select new coach, effective date (defaults to next cycle boundary, per the "changes take effect next cycle" principle from Module 5), reason (free text, logged).
4. **Ratio guidance panel**: a reference card showing the source model's real-world benchmarks (Buurtzorg's 1:660 ratio at 21 coaches for 14,000 people; the smaller-pilot realistic ratio of 1 coach per 3–5 pods, ~15–40 people) to help the Coaching Hub judge whether current assignments are within a healthy range. This is guidance, not an enforced constraint — the UI should warn ("This coach now covers 6 pods — above the suggested 3–5 range") but not block the assignment.

## Data model
```
CoachAssignment
  id, coach_user_id, pod_id, start_cycle_id, end_cycle_id (nullable),
  status (active|ended), reason_for_change (nullable)

CoachingSession
  id, coach_user_id, pod_id, occurred_at, session_type,
  private_notes, pod_visible_summary (nullable), created_at

PodHealthSignal
  id, pod_id, cycle_id, computed_at, signal_color (green|amber|red),
  contributing_factors (json: {atRiskCheckins, scoreTrend, reviewSentiment})
```

## Business logic
- `PodHealthSignal` is recomputed on a schedule (e.g., nightly) and on-demand when relevant inputs change (new at-risk check-in, new score published) — it is a derived, explainable value: clicking it must show the contributing factors, per the platform-wide provenance principle.
- Reassignment "due" state is a soft reminder at 2 cycles, escalating to a more visible flag at 3 cycles — never auto-executed; a human at the Coaching Hub always confirms the actual reassignment.
- A coach's private notes are never exposed via any API to non-coach/non-Coaching-Hub roles, including Company X's other hubs — this must be enforced at the query layer (row-level access control), not just hidden in the UI.

## API endpoints
- `GET /api/coaching/my-coach?podId=`
- `GET /api/coaching/console?coachUserId=`
- `POST /api/coaching/sessions`
- `GET /api/coaching/roster` (Coaching Hub only)
- `POST /api/coaching/assignments` (create/reassign, Coaching Hub only)
- `GET /api/coaching/pod-health/:podId?cycleId=`
