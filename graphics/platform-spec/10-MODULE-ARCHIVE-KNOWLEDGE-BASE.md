# 10 — Module: Archive & Organizational Memory

## Purpose
Implements the seventh step of the platform's data pipeline from the source model: "decisions and lessons learned are archived, so organizational memory stays independent of any specific individual." This module is the org's permanent, searchable record — every other module writes into it; almost nothing is created directly here.

## User stories
- As anyone, I want to search past decisions, pitches, and CLOU agreements without asking whoever "remembers."
- As a new pod member, I want to read my pod's full history to get context fast.
- As Company X, I want to see organization-wide activity as a trust-building public feed.
- As someone running a new pilot, I want to pull lessons learned from a previous pilot into the new one.

## Screen: `/archive/decisions`
- **Search bar** (full-text, with filters): entity type (Pitch / CLOU / Budget cycle / Accountability case / Entry trial / Rule change), pod/holding, date range.
- **Results list**: each result shows type icon, title/summary line, date, related pod(s), **[View →]**.
- Every result links back to its module of origin (e.g., a Pitch result opens the read-only pitch view from Module 3) — the Archive is a **search and index layer**, not a duplicate data store, to avoid the two ever going out of sync.

## Screen: `/archive/lessons`
- A curated sub-feed of entries explicitly tagged "Lesson Learned" — these can be added from within relevant flows (e.g., after an Accountability Path resolves, or after a Pilot's post-Day-90 decision, a **[Add Lesson Learned]** button appears, opening a short structured form: What happened / What we'd do differently / Tags).
- Browsable by tag (e.g., "onboarding," "budget disputes," "pilot rollout").
- **[Attach to New Pilot]** button (visible from `/hub/pilots`) — lets the Deployment Hub pull relevant past lessons into a new pilot's setup step, per the source model's implicit expectation that later pilots benefit from earlier ones' experience.

## Screen: `/archive/:podId/history`
This is the same view already specified as `/pod/:podId/history` in Module 3 — the Archive module is the underlying service; Module 3's screen is one specific "view" into it, scoped to a single pod. No duplicate screen needs to be built; this entry exists in the sitemap only as a redirect target.

## Screen: Public Activity Feed (embedded in Dashboard, Module 1, and also browsable standalone at `/archive/activity`)
- Reverse-chronological, org-wide, non-sensitive activity log: new CLOU signed, cycle results announced, new pod completed its trial, rule changed, pilot phase advanced. This is what makes the platform's transparency claim tangible day-to-day, not just available-on-request.

## Data model
```
ArchiveIndexEntry
  id, entity_type (pitch|cloud|budget_cycle|accountability_case|entry_trial|rule_change|lesson),
  entity_id, title, summary, pod_ids (json array), holding_id, tags (json array),
  occurred_at, indexed_at

LessonLearned
  id, related_entity_type, related_entity_id, what_happened, what_wed_do_differently,
  tags (json array), created_by, created_at
```

## Business logic
- `ArchiveIndexEntry` rows are created automatically by event listeners on the source modules (a pitch submission, a CLOU signature, a cycle lock, etc. each emit an indexing event) — there is no manual "publish to archive" step for standard records, ensuring the archive can never silently fall behind reality.
- `LessonLearned` is the one entity type genuinely authored directly in this module, since it's reflective/curated content rather than a mirror of a transactional record.
- Full-text search should index title, summary, and tags at minimum; if feasible, index pitch body text and mediation logs too (subject to the same visibility/permission rules as the source record — the Archive must never leak something the source module would have restricted, e.g., a coach's private session notes must never appear in Archive search results).

## API endpoints
- `GET /api/archive/search?q=&type=&podId=&holdingId=&dateFrom=&dateTo=`
- `POST /api/archive/lessons`
- `GET /api/archive/lessons?tag=`
- `GET /api/archive/activity?scope=org|pod&podId=&limit=`
