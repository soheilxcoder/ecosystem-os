-- 0006 — Coaching (Module 07)
--
-- Sources: 07-MODULE-COACHING.md, 15-BUSINESS-RULES-APPENDIX.md,
--          17-MASTER-ANALYSIS-AND-REBUILD-PLAN.md §3.3 (PodHealthSignal) and
--          §5.4 (conflict-of-interest rules).
--
-- Two requirements shape this schema more than anything else, and both come
-- straight from 07's business logic:
--
--  1. **A coach's private notes must not be reachable by any other role** —
--     "including Company X's other hubs", and "enforced at the query layer
--     (row-level access control), not just hidden in the UI". A UI that omits a
--     field is one refactor away from leaking it, so the pod-facing read path
--     does not select from `coaching_session` at all. It selects from
--     `coaching_session_pod_visible`, a view whose column list simply does not
--     contain `private_notes`. There is no branch to get wrong and no
--     serialization step that could include it by accident.
--
--  2. **Coaching rotation and Pod Lead rotation must never merge** (07:
--     "the two rotation systems must never be visually or logically merged").
--     They are therefore unrelated tables with no shared state: `pod_lead_term`
--     in 0002 and `coach_assignment` here. Nothing in this migration references
--     the other, and the conflict rule below actively keeps one person out of
--     both seats for the same pod at the same time.

-- ---------------------------------------------------------------------------
-- Coach profile — the self-reported half of the roster
-- ---------------------------------------------------------------------------
-- 07 §roster asks for "coach-reported capacity ('comfortable' / 'stretched' —
-- self-reported by coach, not inferred)". Capacity is a property of the coach,
-- not of any one assignment, so it lives here rather than on the assignment
-- row. The scheduling link is what `/coaching/my-coach` renders as the pod's
-- way to reach them.
CREATE TABLE coach_profile (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  coach_user_id     uuid NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
  -- Free-form because the source model has coaches scheduling through whatever
  -- the holding already uses; the platform stores the link, it does not host it.
  scheduling_url    text,
  capacity          text NOT NULL DEFAULT 'comfortable'
                      CHECK (capacity IN ('comfortable', 'stretched')),
  -- When the coach last stated this themselves. A capacity figure nobody has
  -- confirmed in three cycles is stale, and the roster says so rather than
  -- presenting it as current.
  capacity_stated_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER coach_profile_set_updated_at
  BEFORE UPDATE ON coach_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Coach assignments
-- ---------------------------------------------------------------------------
-- 07 §data model. `start_cycle_id` is a cycle reference rather than a bare date
-- for the same reason `budget_cycle` does it in 0005: the reassignment countdown
-- is "cycle 2 of 2–3", and that arithmetic has to agree with the calendar
-- module's answer about which cycle is current. Storing a date here would let
-- the two drift.
CREATE TABLE coach_assignment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  coach_user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  pod_id              uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  start_cycle_id      uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  -- NULL while the assignment is running; set when a reassignment supersedes it.
  end_cycle_id        uuid REFERENCES sprint_cycle(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'ended')),
  -- Logged free text, required on a reassignment so the roster can answer why a
  -- pod moved. 07 §roster: "reason (free text, logged)".
  reason_for_change   text,
  created_by          uuid REFERENCES app_user(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- An ended assignment must say when it ended and why; an active one must not
  -- claim an end date it has not reached.
  CHECK (status = 'active' OR (end_cycle_id IS NOT NULL
                               AND COALESCE(btrim(reason_for_change), '') <> '')),
  CHECK (status = 'active' OR end_cycle_id IS NOT NULL)
);

-- One coach per pod at a time. This is the invariant the whole rotation rests
-- on: without it, "my coach" is ambiguous and the console's 3–5 card grid has
-- no defined membership.
CREATE UNIQUE INDEX coach_assignment_one_active_per_pod
  ON coach_assignment (pod_id) WHERE status = 'active';

CREATE INDEX coach_assignment_coach_idx ON coach_assignment (coach_user_id, status);
CREATE INDEX coach_assignment_pod_idx ON coach_assignment (pod_id, start_cycle_id DESC);

CREATE TRIGGER coach_assignment_set_updated_at
  BEFORE UPDATE ON coach_assignment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A coach may not coach a pod they belong to, and may not hold the Pod Lead
-- seat for a pod they coach.
--
-- The first half is 17-MASTER-ANALYSIS §5.4's conflict rule applied to
-- coaching: a coach assessing a pod they are a member of would be reviewing
-- their own work, and the health signal they act on would be one they helped
-- produce. The second half is 07's "never merged" requirement given teeth —
-- the two rotations are separate tables, and this is what stops them
-- collapsing onto one person for one pod.
CREATE FUNCTION coach_assignment_no_self_coaching() RETURNS trigger AS $$
BEGIN
  -- "Active" membership in 0001 is expressed as `left_at IS NULL`, not a status
  -- column; this reads it the way the rest of the schema does.
  IF EXISTS (
    SELECT 1 FROM pod_membership
      WHERE pod_id = NEW.pod_id
        AND user_id = NEW.coach_user_id
        AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'a coach cannot be assigned to a pod they are a member of (user %, pod %)',
      NEW.coach_user_id, NEW.pod_id;
  END IF;

  -- `pod_lead_term` is dated rather than statused, so "currently the lead" means
  -- a term whose window has not closed yet.
  IF EXISTS (
    SELECT 1 FROM pod_lead_term
      WHERE pod_id = NEW.pod_id
        AND user_id = NEW.coach_user_id
        AND end_date >= CURRENT_DATE
  ) THEN
    RAISE EXCEPTION
      'coaching and Pod Lead rotations must not overlap for the same pod (user %, pod %)',
      NEW.coach_user_id, NEW.pod_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coach_assignment_conflict_check
  BEFORE INSERT OR UPDATE OF coach_user_id, pod_id ON coach_assignment
  FOR EACH ROW EXECUTE FUNCTION coach_assignment_no_self_coaching();

-- An ended assignment stays ended. Reassignment works by closing one row and
-- opening another, so the history of who coached a pod and when is append-only
-- and the countdown can always be recomputed from it.
CREATE FUNCTION coach_assignment_no_reopen() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'ended' AND NEW.status <> 'ended' THEN
    RAISE EXCEPTION 'an ended coach assignment cannot be reopened (assignment %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coach_assignment_end_final
  BEFORE UPDATE ON coach_assignment
  FOR EACH ROW EXECUTE FUNCTION coach_assignment_no_reopen();

-- ---------------------------------------------------------------------------
-- Session requests — the pod's way in
-- ---------------------------------------------------------------------------
-- 07 §my-coach: "[Request a Session] button → simple scheduling request form
-- (topic, urgency, preferred times) sent to the assigned coach." A request is
-- not a session: it carries no notes, and it is the pod's own text, so it stays
-- pod-visible throughout.
CREATE TABLE coaching_session_request (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  pod_id            uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  coach_user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  requested_by      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  topic             text NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 300),
  urgency           text NOT NULL DEFAULT 'normal'
                      CHECK (urgency IN ('low', 'normal', 'high')),
  -- Free-form because "preferred times" means something different in every
  -- holding; the platform passes the text through rather than inventing a
  -- scheduling calendar it does not own.
  preferred_times   text,
  status            text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'scheduled', 'declined')),
  -- Set when the request turns into a session, so the pod can see the outcome.
  session_id        uuid,
  responded_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coaching_session_request_pod_idx ON coaching_session_request (pod_id, created_at DESC);
CREATE INDEX coaching_session_request_coach_idx
  ON coaching_session_request (coach_user_id, status);

-- ---------------------------------------------------------------------------
-- Coaching sessions
-- ---------------------------------------------------------------------------
-- 07 §data model, plus the two-column privacy split that the session screen is
-- built around: `private_notes` (coach and Coaching Hub only) and
-- `pod_visible_summary` (optional, short, the coach chooses what to share).
CREATE TABLE coaching_session (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  coach_user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  pod_id                uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  occurred_at           timestamptz NOT NULL,
  session_type          text NOT NULL
                          CHECK (session_type IN
                            ('check_in', 'conflict_support', 'skill_development', 'other')),
  -- The coach's own working memory. Never selected by any pod-facing query; see
  -- the view below.
  private_notes         text NOT NULL DEFAULT '',
  -- NULL means the coach saved privately and shared nothing. That is a real
  -- state and is rendered as "no summary shared", not as an empty string.
  pod_visible_summary   text CHECK (pod_visible_summary IS NULL
                                    OR char_length(pod_visible_summary) <= 1000),
  -- Which of the two buttons was used. Recorded because "was this shared
  -- deliberately?" has to be answerable afterwards, and 07's whole point is
  -- that sharing is never accidental.
  shared_with_pod       boolean NOT NULL DEFAULT false,
  request_id            uuid REFERENCES coaching_session_request(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Sharing a summary and having one are the same fact from two directions: a
  -- row marked shared with nothing to show would render as an empty card on the
  -- pod's history, and a summary present but unshared would mean the pod can
  -- see text the coach never released.
  CHECK (shared_with_pod = (pod_visible_summary IS NOT NULL))
);

CREATE INDEX coaching_session_pod_idx ON coaching_session (pod_id, occurred_at DESC);
CREATE INDEX coaching_session_coach_idx ON coaching_session (coach_user_id, occurred_at DESC);

CREATE TRIGGER coaching_session_set_updated_at
  BEFORE UPDATE ON coaching_session
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Back-fill the request once a session answers it, so the pod sees the outcome
-- rather than an open request sitting next to a completed session.
CREATE FUNCTION coaching_session_close_request() RETURNS trigger AS $$
BEGIN
  IF NEW.request_id IS NOT NULL THEN
    UPDATE coaching_session_request
       SET session_id = NEW.id,
           status = 'scheduled',
           responded_at = COALESCE(responded_at, NEW.occurred_at)
     WHERE id = NEW.request_id
       AND session_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coaching_session_request_link
  AFTER INSERT ON coaching_session
  FOR EACH ROW EXECUTE FUNCTION coaching_session_close_request();

-- ---------------------------------------------------------------------------
-- The pod-facing view — private notes are not in its column list
-- ---------------------------------------------------------------------------
-- This is the row-level access control 07 asks for, implemented as the absence
-- of a column rather than as a filter on one. Every pod-facing session read in
-- `db/repositories/coaching.ts` goes through this view, so the notes cannot be
-- returned even by a query that asks for `*`.
CREATE VIEW coaching_session_pod_visible AS
  SELECT id,
         org_id,
         coach_user_id,
         pod_id,
         occurred_at,
         session_type,
         pod_visible_summary,
         shared_with_pod,
         created_at
    FROM coaching_session;

COMMENT ON VIEW coaching_session_pod_visible IS
  'Pod-facing session history. Deliberately omits private_notes: coaching notes '
  'are the coach''s working memory and must not reach pod members, pod leads, or '
  'any Company X hub other than Coaching (07 §business logic).';

-- ---------------------------------------------------------------------------
-- Pod health signals
-- ---------------------------------------------------------------------------
-- 07 §data model. The colour is derived, not authored: it is recomputed from
-- check-in flags, budget-score trend and peer-review sentiment by the pure
-- formula in core/health.ts, and the inputs it used are snapshotted alongside
-- it so a coach can still ask "why was this red?" after the underlying
-- check-ins have moved on.
CREATE TABLE pod_health_signal (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  pod_id                uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  cycle_id              uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  signal_color          text NOT NULL CHECK (signal_color IN ('green', 'amber', 'red')),
  -- 0–100 on the same scale as a Unit Score, so the console can show the two
  -- side by side without a conversion nobody can see.
  signal_score          numeric(5, 2) NOT NULL CHECK (signal_score >= 0 AND signal_score <= 100),
  -- The three band contributions, unrounded: {checkinReliability,
  -- peerReviewSentiment, budgetScoreTrend}. Kept separate from the factors so
  -- "where did the colour come from" is answerable without re-deriving.
  score_parts           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- {atRiskCheckins, checkins, atRiskRate, scoreTrend, reviewSentiment,
  --  sentimentAssumed, trendAssumed} — exactly what core/health.ts reports.
  contributing_factors  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Which cycle each input came from: {checkinCycleNumber,
  -- sentimentCycleNumber, scoreCycleNumbers}. The three inputs do not arrive on
  -- the same schedule — peer reviews land on Days 86–88, so the freshest
  -- completed review is usually the previous cycle's. Without this the colour
  -- is traceable to its numbers but not to the period those numbers describe,
  -- which is the first thing a coach asks about.
  provenance            jsonb,
  -- Which formula produced this row. The weights are named constants in
  -- core/health.ts; if they ever change, old signals must still explain
  -- themselves in the terms they were computed with.
  formula_version       text NOT NULL DEFAULT 'health.v1',
  computed_at           timestamptz NOT NULL DEFAULT now(),

  -- One signal per pod per cycle. Recomputation upserts, so a signal is the
  -- current answer for that cycle and never a pile of near-duplicates.
  UNIQUE (pod_id, cycle_id)
);

CREATE INDEX pod_health_signal_pod_idx ON pod_health_signal (pod_id, cycle_id DESC);
CREATE INDEX pod_health_signal_color_idx ON pod_health_signal (signal_color, cycle_id);

-- The stored colour must be the colour the stored score implies. Without this,
-- a recomputation bug could write a green row with a red number and the console
-- would show whichever it happened to read.
CREATE FUNCTION pod_health_signal_color_matches_score() RETURNS trigger AS $$
DECLARE
  expected text;
BEGIN
  -- Mirrors HEALTH_THRESHOLDS in core/health.ts: green >= 72, amber >= 55.
  IF NEW.signal_score >= 72 THEN
    expected := 'green';
  ELSIF NEW.signal_score >= 55 THEN
    expected := 'amber';
  ELSE
    expected := 'red';
  END IF;

  IF NEW.signal_color <> expected THEN
    RAISE EXCEPTION 'health signal colour % contradicts score % (expected %)',
      NEW.signal_color, NEW.signal_score, expected;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pod_health_signal_color_check
  BEFORE INSERT OR UPDATE OF signal_color, signal_score ON pod_health_signal
  FOR EACH ROW EXECUTE FUNCTION pod_health_signal_color_matches_score();

-- ---------------------------------------------------------------------------
-- Red-streak threshold — org-configurable, per 07
-- ---------------------------------------------------------------------------
-- 07 gives "flagged red for 2+ consecutive cycles" as an example of an
-- org-configurable threshold. It belongs with the other governance knobs rather
-- than in a new table, so it is added to the existing per-org config row.
ALTER TABLE org_governance_config
  ADD COLUMN IF NOT EXISTS health_red_flag_streak integer NOT NULL DEFAULT 2
    CHECK (health_red_flag_streak BETWEEN 1 AND 12);
