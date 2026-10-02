# 03 — Module: Pods & Teams

## Purpose
Implements the self-governing unit mechanism and the three rotating team-level roles (Pod Lead, Peer Validator, Conflict Resolver) from the source model. This module is where a pod lives day-to-day: membership, weekly check-ins, pitch drafting, and history.

## User stories
- As a Pod Member, I want to see who's in my pod and who currently holds the Pod Lead role.
- As a Pod Member, I want to vote for the next Pod Lead when a rotation window opens.
- As the Pod Lead, I want to log the weekly check-in and compile the end-of-cycle pitch.
- As anyone, I want to see a pod's full history across past cycles (public record).

## Screen: `/pod/:podId/overview`

### Layout
1. **Pod header**: Pod name, category/tag (e.g., "Sales," "Production"), member count, holding/VC it belongs to, status chip (Trial / Active / In Accountability Path — pulls from Module 7).
2. **Members grid**: avatar, name, tenure in pod, current role badges (if any — Pod Lead / Peer Validator elsewhere / Coach-assigned). No traditional "title" field exists for pod members beyond these rotating badges — by design, there is no permanent "manager" field anywhere in this schema.
3. **Pod Lead panel**:
   - Current Pod Lead name, start date, rotation-end date, countdown.
   - **[View Rotation History]** — expandable list of past Pod Leads with dates.
   - If within the Day 1–3 rotation window (per Sprint Calendar): a **[Vote for Next Pod Lead]** button replaces the countdown, opening the voting modal (see below).
4. **This Cycle's Priorities** (set during Days 1–3): a short list (3–5 bullet items), editable only by current Pod Lead during the Days 1–3 window, read-only afterward.
5. **Weekly Check-in Log**: a simple reverse-chronological list of check-ins (date, brief text field, optional links/attachments), with a **[+ Add Check-in]** button (enabled Days 4–80 only). Each check-in entry: free-text field (500 char limit), optional "blocked/at-risk" toggle that, when set, auto-notifies the assigned Coach.
6. **Pitch panel**: shows current cycle's pitch status (Not started / Draft / Submitted / Under peer review / Scored). **[Open Pitch Editor →]** button (Pod Lead only, enabled Days 81–85).
7. **Tabs**: Overview (this screen) | Members | Pitch History | CLOU Agreements (deep link to Module 4 filtered to this pod) | Coaching (deep link to Module 6 filtered to this pod).

### Modal: Vote for Next Pod Lead
- List of eligible candidates (all current pod members except the outgoing lead, unless re-election is explicitly allowed by org config).
- Radio-button single selection.
- **[Submit Vote]** button; once all members have voted (or the voting window closes, whichever first), result is computed and displayed with vote tally (transparent, not anonymous, per the model's transparency principle — configurable if the org wants anonymous voting).
- Tie-breaking rule must be defined in org config (e.g., current Pod Lead casts tiebreak, or random draw) — surfaced in the modal's footer text so it's never a mystery.

## Screen: `/pod/:podId/pitch/:cycleId` (Pitch Editor)

### Fields (all required to submit)
- **Previous period performance summary** (rich text, ~300 words guideline shown as a soft counter, not a hard block)
- **Key results achieved** (structured list: metric name, target, actual)
- **Next period plan** (rich text)
- **Budget request context** (optional free text — note: this does NOT set the budget; it's context for peer reviewers, since budget is formula-driven per Module 4)
- **Attachments** (file upload, e.g., supporting data exports)

### Buttons
- **[Save Draft]** (always available Days 81–85)
- **[Preview as Reviewer]** (shows exactly what peer validators will see)
- **[Submit Final]** (locks the pitch; confirmation modal: "Once submitted, this pitch cannot be edited. Continue?"); becomes disabled with a countdown once Day 85 23:59 passes — auto-submits the last saved draft if the pod never clicks Submit, with a visible warning banner starting Day 84 ("Auto-submit in: 18h 32m")

### States
- **Not yet Day 81**: screen shows a locked preview with "Pitch editor opens on Day 81" and a **[View Last Cycle's Pitch]** link instead.
- **After submission**: read-only view with a "Submitted on [timestamp] by [Pod Lead name]" stamp; a **[View Peer Review Status →]** link appears once reviewers are assigned.

## Screen: `/pod/:podId/history`
- Timeline view, one row per past 90-day cycle: cycle number/dates, final score, budget received, pitch (read-only link), peer review comments (read-only), any accountability-path flags during that cycle.
- **[Export History (CSV)]** button — available to pod members and Company X hub roles.

## Data model (this module's core entities)
```
Pod
  id, name, category_tag, holding_id, status (trial|active|accountability|dissolved),
  created_at, trial_end_date (nullable)

PodMembership
  id, pod_id, user_id, joined_at, left_at (nullable)

PodLeadTerm
  id, pod_id, user_id, cycle_id, start_date, end_date, vote_tally (json)

PeerValidatorAssignment
  id, cycle_id, reviewer_user_id, reviewer_pod_id, target_pod_id, assigned_at

ConflictCase
  id, pod_a_id, pod_b_id, resolver_user_id, status, opened_at, closed_at, recommendation_text

WeeklyCheckin
  id, pod_id, cycle_id, author_user_id, week_number, text, at_risk_flag (bool), created_at

Pitch
  id, pod_id, cycle_id, status (draft|submitted|reviewed|scored),
  previous_summary, key_results (json), next_plan, budget_context, attachments (json),
  submitted_at, submitted_by
```

## Business logic
- A pod cannot submit a pitch outside Days 81–85 of its cycle (enforced server-side, not just UI-disabled — the button being disabled client-side is not sufficient security).
- Pod Lead term is exactly 90 days by default (org-configurable at the Architecture Hub level, but changing it requires a versioned rule change — see Module 8).
- A user cannot be both Pod Lead and Peer Validator for the same cycle on pods that have an active CLOU with each other (conflict-of-interest rule) — the assignment algorithm in Module 7 must exclude this pairing.

## API endpoints
- `GET /api/pods/:podId`
- `GET /api/pods/:podId/members`
- `POST /api/pods/:podId/pod-lead-vote` (body: candidateUserId)
- `GET /api/pods/:podId/checkins?cycleId=`
- `POST /api/pods/:podId/checkins`
- `GET /api/pods/:podId/pitch/:cycleId`
- `PUT /api/pods/:podId/pitch/:cycleId` (draft save)
- `POST /api/pods/:podId/pitch/:cycleId/submit`
- `GET /api/pods/:podId/history`
