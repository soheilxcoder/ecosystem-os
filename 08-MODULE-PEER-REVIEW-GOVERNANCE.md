# 08 — Module: Peer Review & Governance

## Purpose
Covers three related but distinct workflows that must NOT be visually or logically merged (the source model explicitly separates them):
1. **Peer Review** — scoring pitches each cycle (feeds Budget Market, Module 5).
2. **Conflict Resolution** — mediating disputes between pods (Conflict Resolver role).
3. **Governance paths** — two structurally different tracks that are easy to confuse and must be kept visually distinct in the UI:
   - **90-Day Entry Rule** (new/trial pods — no correction period, binary pass/fail at Day 90).
   - **Accountability & Dissolution Path** (established pods — gradual, with a 30-day correction period and a panel vote).

## User stories
- As a Peer Validator, I want a focused queue of pitches assigned to me, with a simple scoring form.
- As a Conflict Resolver, I want a case workspace showing both sides' relevant data.
- As anyone, I want to see, transparently, where a pod stands in the Entry Rule or Accountability Path if it's on one.
- As a Company X hub member, I want to convene and record a panel vote when an accountability case reaches its decision point.

## Screen: `/review/queue` (Peer Validator view)
- List of pitches assigned to this reviewer this cycle (typically pulled from other, unrelated pods to preserve impartiality — assignment logic lives in the backend, see below).
- Each row: target pod name, pitch submitted date, due date for review (Days 86–88), status (Not started/In progress/Submitted).
- **[Review →]** opens the pitch (read-only, same content as Module 3's pitch editor) alongside a **scoring panel**:
  - Numeric score input (0–100, with a rubric tooltip describing what different score bands mean, to reduce reviewer-to-reviewer inconsistency)
  - Structured sub-questions (e.g., "Did the pod meet its stated targets?" Yes/Partially/No; "Is the next-period plan realistic?" scale)
  - Free-text comments (required, minimum length enforced — no bare numeric scores with zero justification, since comments are what the reviewed pod sees and learns from)
  - **[Submit Review]** button — confirmation modal warns this is final and visible to the reviewed pod.

## Screen: `/review/cases` (Conflict Resolver view)
- List of active/past cases assigned to this user.
- **Case workspace** (`/review/cases/:caseId`):
  - Two side-by-side panels: Pod A's relevant shared data (the specific CLOU or interaction in dispute, check-in mentions, etc.), Pod B's equivalent — deliberately scoped to shared/relevant data only, not each pod's full internal dashboard (per the permission table in `01-INFORMATION-ARCHITECTURE.md`).
  - **Mediation log**: a running timeline of notes, meetings held, positions stated — both pods' representatives (current Pod Leads) can add their own dated entries; the resolver's entries are marked distinctly.
  - **Recommendation field**: free text, explicitly labeled "Advisory only — this is not a binding decision," submitted with a **[Submit Recommendation]** button that closes the case (status → Resolved) or, if unresolved, a **[Escalate]** button that hands off to the Architecture Hub for a rule-level review (rare path, logged).

## Screen: `/review/entry/:podId` — 90-Day Entry Rule Tracker
Purpose-built, visually distinct (different color treatment, e.g., a dashed border and a "TRIAL" ribbon) from the Accountability Path screen below, to prevent the two being confused during implementation or by users.

- **Trial timeline**: Day 0 (entry) → Day 90 (decision point), simple linear bar, no intermediate correction stages shown (there are none, by design).
- **Trial criteria checklist** (defined at deployment time by the Deployment Hub — see Module 8's deployment wizard): a short list of what "fits the model and creates real value" means for this specific unit (e.g., "Completed at least one full pitch cycle," "No unresolved conflict cases," "Financial data successfully integrated"). Each item shows a status (Met/Not yet/N/A).
- **Day 90 decision panel** (unlocked only at/after Day 90): a **bilateral decision** record — both the pod's own representative and a Company X Deployment Hub member must independently record a recommendation (Join fully / Do not continue), then a joint decision is logged. **[Record Decision]** button, visible to both parties, with the final outcome clearly stamped: "RESULT: Full entry" or "RESULT: Discontinued — no correction period applies (Entry Rule)." This final phrase is deliberately hardcoded in the UI copy to reinforce the distinction from the Accountability Path.

## Screen: `/review/accountability/:podId` — Accountability & Dissolution Path
For pods with an established track record (i.e., pods that have completed at least one full cycle outside trial status).

- **Four-stage tracker** (vertical stepper UI), matching the exact source-model stages:
  1. **Full Transparency** — always "active" by default (the dashboard/budget modules are already public); this stage has no special action, it's shown as the baseline that's always true.
  2. **Reduced Credibility & Profit Share** — triggered automatically when [org-configured performance threshold] is crossed; shows the specific reduction applied (cross-references Module 5's budget calculation, flagged as "reduced due to accountability stage 2").
  3. **Mediation by Conflict Resolver** — if disagreement/dispute continues; deep-links into `/review/cases` if a case is opened for this.
  4. **30-Day Correction Period** — start date, end date, assigned coach's intensive-support session log (deep link to Module 6), and, at the end, a **Panel Vote**.
- **Panel Vote sub-screen**: list of panel members (per org config — e.g., a rotating group of peer Pod Leads plus a Coaching Hub representative; never a single person, per the source rule), each casts Continue/Dissolve with an optional comment, **[Tally & Finalize]** button (enabled once all panel members have voted or a quorum/deadline rule is met), final result stamped immutably.
- **Cross-reference banner** at the top of this screen: "This is the standard accountability path for established pods. New pods in their first 90 days follow the Entry Rule instead — [link]." (and the reverse banner appears on the Entry Rule screen) — this cross-linking is a direct, deliberate implementation of the source document's explicit instruction that these two must not be confused.

## Screen: `/hub/architecture` → Rule Versioning panel (referenced by multiple modules)
Since several modules (Budget formula, Sprint Calendar boundaries, Accountability thresholds) require "rule changes," this shared panel handles all of them uniformly:
- **Current rules table**: rule name, current value, last changed date, changed by.
- **[Propose Change]** button → form: rule, new value, effective cycle (always "next cycle," never retroactive), justification text (required).
- **Change history**: full versioned log, publicly viewable by all users (transparency principle extends to the rules themselves, not just the data measured by them).

## Data model
```
PeerReview
  id, cycle_id, pitch_id, reviewer_user_id, score_0_100, rubric_answers (json),
  comments, submitted_at

ConflictCase
  -- (also referenced in Module 3; canonical definition here)
  id, pod_a_id, pod_b_id, resolver_user_id, status (open|resolved|escalated),
  opened_at, closed_at, recommendation_text, escalated_to_rule_review (bool)

EntryTrial
  id, pod_id, start_date, decision_due_date (start_date + 90d),
  criteria (json array {label, met_bool}), pod_rep_recommendation, deployment_hub_recommendation,
  final_result (nullable: full_entry|discontinued), decided_at

AccountabilityCase
  id, pod_id, current_stage (transparency|reduced_share|mediation|correction_period),
  stage_2_triggered_at, correction_start_date, correction_end_date,
  panel_votes (json array {user_id, vote, comment}), final_result (nullable: continue|dissolve),
  decided_at

RuleChange
  id, rule_name, old_value, new_value, proposed_by, justification,
  effective_cycle_id, approved_at
```

## Business logic
- A `PeerReview` reviewer assignment must exclude: (a) members of the target pod, (b) members of a pod with an active `CloudAgreement` with the target pod (conflict of interest, per Module 3's rule), (c) the target pod's assigned coach.
- `EntryTrial.final_result` and `AccountabilityCase.final_result`, once set, are immutable — any later correction requires a new, separately logged record referencing the original (never an in-place edit), consistent with the platform-wide "no silent edits" principle.
- Stage 2 of the Accountability Path ("reduced credibility & profit share") must write a specific, visible adjustment record into Module 5's budget calculation — it cannot be a manual, untracked budget cut.

## API endpoints
- `GET /api/review/queue?reviewerUserId=`
- `POST /api/review/:pitchId/score`
- `GET /api/review/cases?userId=`
- `POST /api/review/cases/:id/log`
- `POST /api/review/cases/:id/recommend`
- `GET /api/review/entry/:podId`
- `POST /api/review/entry/:podId/decision`
- `GET /api/review/accountability/:podId`
- `POST /api/review/accountability/:podId/panel-vote`
- `POST /api/hub/rules/propose`
- `GET /api/hub/rules/history`
