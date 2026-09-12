-- 0002 — Sprint Calendar (06) and Pods & Teams (03)
--
-- Source: 06-MODULE-SPRINT-CALENDAR.md, 03-MODULE-PODS-TEAMS.md,
--         15-BUSINESS-RULES-APPENDIX.md (cycle day ranges).

-- ---------------------------------------------------------------------------
-- Calendar configuration (Architecture Hub, versioned)
--
-- A config row is never edited: a change inserts a new version that takes
-- effect from a given cycle number onward. A cycle in progress keeps the
-- boundaries it was created with, so a mid-cycle rule change cannot
-- desynchronise the pitch and review windows (06-MODULE-SPRINT-CALENDAR.md,
-- "Business logic").
-- ---------------------------------------------------------------------------
CREATE TABLE cycle_config (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  -- NULL = the org-wide default calendar.
  holding_id                  uuid REFERENCES holding(id) ON DELETE CASCADE,
  cycle_length_days           integer NOT NULL DEFAULT 90
                                CHECK (cycle_length_days BETWEEN 7 AND 365),
  phase_boundaries            jsonb NOT NULL
                                DEFAULT '{"p1_end":3,"p2_end":80,"p3_end":85,"p4_end":88,"p5_end":90}'::jsonb,
  -- First cycle number this version governs.
  effective_from_cycle_number integer NOT NULL DEFAULT 1 CHECK (effective_from_cycle_number >= 1),
  note                        text,
  created_by                  uuid REFERENCES app_user(id),
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cycle_config_scope_version_key
  ON cycle_config (
    org_id,
    COALESCE(holding_id, '00000000-0000-0000-0000-000000000000'::uuid),
    effective_from_cycle_number
  );

CREATE INDEX cycle_config_scope_idx ON cycle_config (org_id, holding_id);

-- ---------------------------------------------------------------------------
-- Sprint cycles
-- ---------------------------------------------------------------------------
CREATE TABLE sprint_cycle (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  -- NULL = the org-wide default calendar (06-MODULE-SPRINT-CALENDAR.md).
  holding_id        uuid REFERENCES holding(id) ON DELETE CASCADE,
  cycle_number      integer NOT NULL CHECK (cycle_number >= 1),
  start_date        date NOT NULL,
  -- Recomputed whenever pause days change (pause days extend the cycle).
  end_date          date NOT NULL,
  -- Snapshot of the boundaries this cycle was created with: {p1_end..p5_end}.
  phase_boundaries  jsonb NOT NULL
                      DEFAULT '{"p1_end":3,"p2_end":80,"p3_end":85,"p4_end":88,"p5_end":90}'::jsonb,
  pause_days        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX sprint_cycle_scope_number_key
  ON sprint_cycle (
    org_id,
    COALESCE(holding_id, '00000000-0000-0000-0000-000000000000'::uuid),
    cycle_number
  );

-- At most one active cycle per scope keeps "what day is it" unambiguous.
CREATE UNIQUE INDEX sprint_cycle_one_active_key
  ON sprint_cycle (org_id, COALESCE(holding_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'active';

CREATE INDEX sprint_cycle_dates_idx ON sprint_cycle (start_date, end_date);

-- ---------------------------------------------------------------------------
-- Cycle milestone reminders
-- ---------------------------------------------------------------------------
CREATE TABLE cycle_milestone_reminder (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  milestone_type  text NOT NULL CHECK (milestone_type IN (
                    'pod_lead_rotation', 'pitch_open', 'pitch_deadline',
                    'review_deadline', 'results')),
  target_date     date NOT NULL,
  notified        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, milestone_type)
);

-- ---------------------------------------------------------------------------
-- Pod cycle plan: the 3–5 priorities set during Days 1–3
-- ---------------------------------------------------------------------------
CREATE TABLE pod_cycle_plan (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id      uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  cycle_id    uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  priorities  jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by  uuid REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pod_id, cycle_id)
);

CREATE TRIGGER pod_cycle_plan_set_updated_at
  BEFORE UPDATE ON pod_cycle_plan
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Weekly check-ins (Days 4–80)
-- ---------------------------------------------------------------------------
CREATE TABLE weekly_checkin (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id          uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  cycle_id        uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  author_user_id  uuid REFERENCES app_user(id) ON DELETE SET NULL,
  week_number     integer NOT NULL CHECK (week_number BETWEEN 1 AND 53),
  body            text NOT NULL CHECK (char_length(body) <= 500),
  at_risk_flag    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX weekly_checkin_pod_cycle_idx ON weekly_checkin (pod_id, cycle_id, week_number DESC);
CREATE INDEX weekly_checkin_created_idx ON weekly_checkin (created_at DESC);

-- ---------------------------------------------------------------------------
-- Pitches (Days 81–85)
-- ---------------------------------------------------------------------------
CREATE TABLE pitch (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id            uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  cycle_id          uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'submitted', 'reviewed', 'scored')),
  previous_summary  text,
  key_results       jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_plan         text,
  budget_context    text,
  attachments       jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at      timestamptz,
  submitted_by      uuid REFERENCES app_user(id),
  -- True when the system submitted the last draft at the Day-85 deadline.
  auto_submitted    boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- One pitch per pod per cycle.
  UNIQUE (pod_id, cycle_id),
  CHECK (status = 'draft' OR submitted_at IS NOT NULL)
);

CREATE INDEX pitch_pod_idx ON pitch (pod_id, cycle_id);
CREATE INDEX pitch_status_idx ON pitch (status);

CREATE TRIGGER pitch_set_updated_at
  BEFORE UPDATE ON pitch
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Pod Lead terms and votes (Days 1–3)
-- ---------------------------------------------------------------------------
CREATE TABLE pod_lead_term (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id      uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  cycle_id    uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  vote_tally  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX pod_lead_term_pod_idx ON pod_lead_term (pod_id, cycle_id);
CREATE INDEX pod_lead_term_user_idx ON pod_lead_term (user_id);

-- One vote per member per cycle. Deliberately not anonymous: the model's
-- transparency principle applies to the Pod Lead election too
-- (03-MODULE-PODS-TEAMS.md).
CREATE TABLE pod_lead_vote (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id            uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  cycle_id          uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  voter_user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pod_id, cycle_id, voter_user_id)
);

CREATE INDEX pod_lead_vote_cycle_idx ON pod_lead_vote (pod_id, cycle_id);

-- ---------------------------------------------------------------------------
-- Pod governance settings (org-wide; one row per organisation)
--
-- Two rules the Pod Lead election needs, surfaced in the voting UI so the
-- outcome is never a mystery (03-MODULE-PODS-TEAMS.md). Proper rule versioning
-- with an approval flow arrives with the Architecture Hub console (Module 09).
-- ---------------------------------------------------------------------------
CREATE TABLE org_governance_config (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL UNIQUE REFERENCES org(id) ON DELETE CASCADE,
  -- 'longest_tenure' | 'lead_tiebreak' | 'random'
  tie_break_rule          text NOT NULL DEFAULT 'longest_tenure'
                            CHECK (tie_break_rule IN ('longest_tenure', 'lead_tiebreak', 'random')),
  allow_lead_re_election  boolean NOT NULL DEFAULT false,
  updated_by              uuid REFERENCES app_user(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER org_governance_config_set_updated_at
  BEFORE UPDATE ON org_governance_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
