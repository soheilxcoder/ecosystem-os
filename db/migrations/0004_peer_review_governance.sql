-- 0004 — Peer Review & Governance (Module 08)
--
-- Sources: 08-MODULE-PEER-REVIEW-GOVERNANCE.md, 15-BUSINESS-RULES-APPENDIX.md,
--          13-TECHNICAL-ARCHITECTURE.md §9 point 3.
--
-- The spec's most emphatic instruction for this module is that the 90-Day Entry
-- Rule and the Accountability Path "must never share a state machine or UI
-- component". They are therefore two tables, two sets of terms and two sets of
-- triggers, and the database itself refuses a pod being on both at once.

-- ---------------------------------------------------------------------------
-- Peer review
-- ---------------------------------------------------------------------------
CREATE TABLE peer_review (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id          uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  pitch_id          uuid NOT NULL REFERENCES pitch(id) ON DELETE CASCADE,
  reviewer_user_id  uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  -- NULL until the reviewer saves or submits; a draft is kept so the queue can
  -- show "in progress" without pretending it was submitted.
  score             numeric(5, 2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  rubric_answers    jsonb NOT NULL DEFAULT '{}'::jsonb,
  comments          text,
  submitted_at      timestamptz,
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  -- One assignment per reviewer per pitch.
  UNIQUE (pitch_id, reviewer_user_id),
  -- A submitted review always carries a number *and* a written justification:
  -- the comments are the only thing the reviewed pod learns from.
  CHECK (submitted_at IS NULL
         OR (score IS NOT NULL AND COALESCE(btrim(comments), '') <> ''))
);

CREATE INDEX peer_review_reviewer_idx ON peer_review (reviewer_user_id, cycle_id);
CREATE INDEX peer_review_pitch_idx ON peer_review (pitch_id);

-- A submitted review is final and visible to the reviewed pod: it may never be
-- edited, only corrected by a new, separately logged record (Phase 8).
CREATE FUNCTION peer_review_no_resubmission() RETURNS trigger AS $$
BEGIN
  IF OLD.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'a submitted peer review is immutable (review %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER peer_review_submission_final
  BEFORE UPDATE ON peer_review
  FOR EACH ROW EXECUTE FUNCTION peer_review_no_resubmission();

-- ---------------------------------------------------------------------------
-- Conflict cases
-- ---------------------------------------------------------------------------
CREATE TABLE conflict_case (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  pod_a_id                  uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  pod_b_id                  uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  resolver_user_id          uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  subject                   text NOT NULL CHECK (char_length(btrim(subject)) > 0),
  status                    text NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'resolved', 'escalated')),
  -- The mediation log is a timeline both sides can add to.
  recommendation_text       text,
  escalated_to_rule_review  boolean NOT NULL DEFAULT false,
  opened_at                 timestamptz NOT NULL DEFAULT now(),
  closed_at                 timestamptz,
  CHECK (pod_a_id <> pod_b_id),
  CHECK ((status = 'open') = (closed_at IS NULL))
);

CREATE INDEX conflict_case_org_idx ON conflict_case (org_id, status);
CREATE INDEX conflict_case_resolver_idx ON conflict_case (resolver_user_id);

CREATE TABLE conflict_case_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES conflict_case(id) ON DELETE CASCADE,
  author_user_id  uuid REFERENCES app_user(id) ON DELETE SET NULL,
  -- Resolver entries are marked distinctly from each pod's own statements.
  author_role     text NOT NULL CHECK (author_role IN ('resolver', 'pod_a', 'pod_b', 'system')),
  body            text NOT NULL CHECK (char_length(btrim(body)) > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conflict_case_event_case_idx ON conflict_case_event (case_id, created_at);

-- ---------------------------------------------------------------------------
-- Track 1 — 90-Day Entry Rule (trial units only)
-- ---------------------------------------------------------------------------
CREATE TABLE entry_trial (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                        uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  -- One trial per pod: the 90 days are a single, unrepeatable decision point.
  pod_id                        uuid NOT NULL UNIQUE REFERENCES pod(id) ON DELETE CASCADE,
  start_date                    date NOT NULL,
  decision_due_date             date NOT NULL,
  -- [{ label, met: true|false|null }] — defined at deployment time.
  criteria                      jsonb NOT NULL DEFAULT '[]'::jsonb,
  pod_rep_user_id               uuid REFERENCES app_user(id) ON DELETE SET NULL,
  pod_rep_recommendation        text CHECK (pod_rep_recommendation IN ('join', 'discontinue')),
  deployment_hub_user_id        uuid REFERENCES app_user(id) ON DELETE SET NULL,
  deployment_hub_recommendation text CHECK (deployment_hub_recommendation IN ('join', 'discontinue')),
  final_result                  text CHECK (final_result IN ('full_entry', 'discontinued')),
  decided_at                    timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  CHECK (decision_due_date >= start_date),
  CHECK (final_result IS NULL OR (pod_rep_recommendation IS NOT NULL
         AND deployment_hub_recommendation IS NOT NULL))
);

CREATE INDEX entry_trial_org_idx ON entry_trial (org_id, decision_due_date);

CREATE FUNCTION entry_trial_result_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.final_result IS NOT NULL AND NEW.final_result IS DISTINCT FROM OLD.final_result THEN
    RAISE EXCEPTION 'an entry trial decision is immutable — log a correction record instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entry_trial_no_result_edit
  BEFORE UPDATE OF final_result ON entry_trial
  FOR EACH ROW EXECUTE FUNCTION entry_trial_result_immutable();

-- ---------------------------------------------------------------------------
-- Track 2 — Accountability & Dissolution Path (established units only)
-- ---------------------------------------------------------------------------
CREATE TABLE accountability_case (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  pod_id                   uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  current_stage            text NOT NULL DEFAULT 'transparency'
                             CHECK (current_stage IN (
                               'transparency', 'reduced_share', 'mediation', 'correction_period')),
  stage_2_triggered_at     timestamptz,
  -- Set when the stage-2 reduction was written into the budget calculation.
  -- Module 5 reads this; it is never an untracked, manual cut.
  reduction_applied        boolean NOT NULL DEFAULT false,
  correction_start_date    date,
  correction_end_date      date,
  assigned_coach_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  conflict_case_id         uuid REFERENCES conflict_case(id) ON DELETE SET NULL,
  final_result             text CHECK (final_result IN ('continue', 'dissolve')),
  decided_at               timestamptz,
  opened_at                timestamptz NOT NULL DEFAULT now(),
  CHECK ((current_stage = 'correction_period') = (correction_start_date IS NOT NULL)),
  CHECK (correction_end_date IS NULL OR correction_start_date IS NULL
         OR correction_end_date >= correction_start_date),
  CHECK (final_result IS NULL OR decided_at IS NOT NULL)
);

-- At most one open accountability case per pod.
CREATE UNIQUE INDEX accountability_case_one_open
  ON accountability_case (pod_id) WHERE final_result IS NULL;

CREATE INDEX accountability_case_org_idx ON accountability_case (org_id, current_stage);

CREATE FUNCTION accountability_result_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.final_result IS NOT NULL AND NEW.final_result IS DISTINCT FROM OLD.final_result THEN
    RAISE EXCEPTION 'an accountability decision is immutable — log a correction record instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accountability_no_result_edit
  BEFORE UPDATE OF final_result ON accountability_case
  FOR EACH ROW EXECUTE FUNCTION accountability_result_immutable();

-- ---------------------------------------------------------------------------
-- The invariant, enforced by the database
--
-- A pod may never be on both tracks at once. The triggers below are the last
-- line of defence: the services check the same rule in
-- core/governance.ts, and property tests assert it in tests/.
-- ---------------------------------------------------------------------------
CREATE FUNCTION pod_has_open_trial(target_pod uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM entry_trial t
                  WHERE t.pod_id = target_pod AND t.final_result IS NULL);
$$ LANGUAGE sql;

CREATE FUNCTION governance_track_conflict() RETURNS trigger AS $$
DECLARE
  pod_status text;
BEGIN
  SELECT p.status INTO pod_status FROM pod p WHERE p.id = NEW.pod_id;

  IF TG_TABLE_NAME = 'accountability_case' THEN
    IF pod_status = 'trial' THEN
      RAISE EXCEPTION 'a pod in trial status follows the 90-Day Entry Rule, not the Accountability Path';
    END IF;
    IF pod_has_open_trial(NEW.pod_id) THEN
      RAISE EXCEPTION 'this pod has an open Entry Trial — it cannot also be in the Accountability Path';
    END IF;
  ELSIF TG_TABLE_NAME = 'entry_trial' THEN
    IF pod_status IS DISTINCT FROM 'trial' THEN
      RAISE EXCEPTION 'only a pod in trial status can have an Entry Trial';
    END IF;
    IF EXISTS (SELECT 1 FROM accountability_case c
                WHERE c.pod_id = NEW.pod_id AND c.final_result IS NULL) THEN
      RAISE EXCEPTION 'this pod has an open Accountability Case — it cannot also be in an Entry Trial';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accountability_case_track_guard
  BEFORE INSERT OR UPDATE OF pod_id ON accountability_case
  FOR EACH ROW EXECUTE FUNCTION governance_track_conflict();

CREATE TRIGGER entry_trial_track_guard
  BEFORE INSERT OR UPDATE OF pod_id ON entry_trial
  FOR EACH ROW EXECUTE FUNCTION governance_track_conflict();

-- ---------------------------------------------------------------------------
-- Panel vote — never a single decision-maker
-- ---------------------------------------------------------------------------
CREATE TABLE accountability_panel_member (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES accountability_case(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  -- e.g. 'Peer Pod Lead', 'Coaching Hub representative'
  role_label   text NOT NULL DEFAULT 'Panel member',
  vote         text CHECK (vote IN ('continue', 'dissolve')),
  comment      text,
  voted_at     timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, user_id),
  CHECK ((vote IS NULL) = (voted_at IS NULL))
);

CREATE INDEX accountability_panel_case_idx ON accountability_panel_member (case_id);

CREATE FUNCTION panel_vote_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.vote IS NOT NULL AND NEW.vote IS DISTINCT FROM OLD.vote THEN
    RAISE EXCEPTION 'a cast panel vote is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accountability_panel_vote_final
  BEFORE UPDATE OF vote ON accountability_panel_member
  FOR EACH ROW EXECUTE FUNCTION panel_vote_immutable();

-- ---------------------------------------------------------------------------
-- Rule versioning (shared by every module that owns a rule)
-- ---------------------------------------------------------------------------
CREATE TABLE rule_change (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  rule_name            text NOT NULL,
  old_value            jsonb,
  new_value            jsonb NOT NULL,
  proposed_by          uuid REFERENCES app_user(id) ON DELETE SET NULL,
  justification        text NOT NULL CHECK (char_length(btrim(justification)) > 0),
  -- Always a future cycle: a rule change is never retroactive.
  effective_cycle_id   uuid REFERENCES sprint_cycle(id) ON DELETE SET NULL,
  effective_cycle_number integer NOT NULL CHECK (effective_cycle_number >= 1),
  approved_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rule_change_org_idx ON rule_change (org_id, rule_name, created_at DESC);

-- ---------------------------------------------------------------------------
-- Governance settings the two tracks and the reviewer pool read
-- ---------------------------------------------------------------------------
ALTER TABLE org_governance_config
  ADD COLUMN accountability_stage2_score_threshold integer
    CHECK (accountability_stage2_score_threshold IS NULL
           OR (accountability_stage2_score_threshold BETWEEN 0 AND 100)),
  ADD COLUMN accountability_panel_size integer NOT NULL DEFAULT 3
    CHECK (accountability_panel_size BETWEEN 3 AND 11),
  ADD COLUMN accountability_correction_days integer NOT NULL DEFAULT 30
    CHECK (accountability_correction_days BETWEEN 7 AND 90),
  ADD COLUMN review_reviewers_per_pitch integer NOT NULL DEFAULT 3
    CHECK (review_reviewers_per_pitch BETWEEN 1 AND 7),
  ADD COLUMN review_comment_min_length integer NOT NULL DEFAULT 140
    CHECK (review_comment_min_length BETWEEN 0 AND 2000);
