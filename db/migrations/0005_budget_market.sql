-- 0005 — Internal Budget Market (Module 05)
--
-- Sources: 05-MODULE-BUDGET-MARKET.md, 15-BUSINESS-RULES-APPENDIX.md,
--          13-TECHNICAL-ARCHITECTURE.md §5 (connector) and §7 (corrections).
--
-- This is the highest-stakes module in the platform: it replaces a manager's
-- former discretionary budget authority, so the schema is built around one
-- requirement — a number must always be traceable to the inputs, the formula
-- version and the moment it was computed, and once locked it must be changeable
-- by exactly one path.
--
-- Three decisions are encoded here rather than left to application code:
--
--  1. **Nothing is computed twice.** `budget_cycle` references `sprint_cycle`
--     instead of restating start/end dates, so the Day 89–90 lock window is the
--     calendar module's answer and cannot drift from it (06: "every module that
--     needs to know the current phase calls one shared function").
--
--  2. **The rule version is snapshotted per cycle.** `formula_weights` and
--     `cap_fraction` are columns, not reads from live config. A rule change
--     therefore takes effect from the next cycle onward and can never rewrite a
--     cycle that has already been announced — the same guarantee 06 requires of
--     phase boundaries.
--
--  3. **Adjustments are their own columns, never folded into a total.** The
--     survival floor, the clipped excess and the redistribution are each stored
--     separately so the breakdown screen can show them as explicit lines. The
--     `15` appendix is emphatic that the cap's excess is "shown explicitly,
--     never silently absorbed", and a schema that only stores `final_budget`
--     would make that impossible to honour.

-- ---------------------------------------------------------------------------
-- Strategic goals — the 25% component's input
-- ---------------------------------------------------------------------------
-- 05 §breakdown step 3: "which org-level goal(s) this pod was tagged against
-- this cycle, the alignment score given (by whom/what process — defined by
-- Architecture Hub config, e.g. a rubric scored by the Strategic Interactions
-- Hub)". The scorer is recorded on every row, because an unattributed score
-- cannot satisfy the "show where it came from" principle.
CREATE TABLE strategic_goal (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  label         text NOT NULL,
  description   text,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, label)
);

CREATE TABLE pod_goal_alignment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  cycle_id      uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  pod_id        uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  goal_id       uuid NOT NULL REFERENCES strategic_goal(id) ON DELETE CASCADE,
  -- 0-100, from the rubric configured by Architecture Hub.
  score         numeric(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
  -- Rubric scores are weighted when a pod is tagged against several goals
  -- (core/budget.ts `strategicScore`).
  weight        numeric(6, 3) NOT NULL DEFAULT 1 CHECK (weight > 0),
  scored_by     uuid REFERENCES app_user(id),
  rationale     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- One alignment per pod per goal per cycle: re-scoring is a correction, not
  -- an overwrite, so it arrives as a new row for a new cycle.
  UNIQUE (cycle_id, pod_id, goal_id)
);

CREATE INDEX pod_goal_alignment_pod_idx ON pod_goal_alignment (pod_id, cycle_id);

-- ---------------------------------------------------------------------------
-- Financial connector — the 40% component's input
-- ---------------------------------------------------------------------------
-- 13-TECHNICAL-ARCHITECTURE.md §5: the platform is read-only against the
-- accounting system, and when a sync fails the pod's dashboard must show an
-- explicit banner rather than quietly presenting stale data as current. That
-- banner needs a record to read, which is why the sync itself is a table and
-- not just a column on the score.
CREATE TABLE financial_sync_record (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id          uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  cycle_id        uuid REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  source_system   text NOT NULL,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          text NOT NULL CHECK (status IN ('ok', 'failed', 'stale')),
  -- Raw figures in the source's own currency and unit; normalization to a
  -- 0-100 score happens in core/budget.ts and is recorded on the component.
  revenue         numeric(18, 2),
  costs           numeric(18, 2),
  profit          numeric(18, 2),
  currency        text NOT NULL DEFAULT 'IRR',
  fetched_at      timestamptz,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK (status <> 'ok' OR (fetched_at IS NOT NULL AND revenue IS NOT NULL))
);

-- Only the latest sync per pod/period matters for the banner; the rest is
-- history. A partial unique index keeps "the current one" cheap to find.
CREATE UNIQUE INDEX financial_sync_latest_idx
  ON financial_sync_record (pod_id, period_start, period_end)
  WHERE status = 'ok';

CREATE INDEX financial_sync_pod_idx ON financial_sync_record (pod_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Budget cycle
-- ---------------------------------------------------------------------------
CREATE TABLE budget_cycle (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  -- The sprint cycle this budget belongs to. Phase math is never restated here.
  cycle_id              uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  cycle_number          integer NOT NULL CHECK (cycle_number >= 1),
  status                text NOT NULL DEFAULT 'provisional'
                          CHECK (status IN ('provisional', 'locked')),

  -- Total allocatable budget for the period, in minor money units.
  total_pool            numeric(18, 2) NOT NULL CHECK (total_pool >= 0),

  -- Snapshot of the rules in force when this cycle was computed. Reading live
  -- config here would let a rule change rewrite an announced cycle.
  formula_weights       jsonb NOT NULL,
  cap_fraction          numeric(4, 3) NOT NULL DEFAULT 0.300
                          CHECK (cap_fraction > 0 AND cap_fraction <= 1),

  -- Allocation totals, stored so the summary card is a read and not a recompute
  -- (and so a re-run can be compared against what was announced).
  reserved_for_survival numeric(18, 2),
  distributable_pool    numeric(18, 2),
  cap_amount            numeric(18, 2),
  total_capped          numeric(18, 2),
  total_redistributed   numeric(18, 2),
  -- Pool nobody can receive because every pod already sits at the ceiling.
  -- Reported, never spent silently (17-MASTER-ANALYSIS §0.3, §4.2).
  unallocated           numeric(18, 2),
  -- Positive when the pool cannot even cover the survival budgets.
  shortfall             numeric(18, 2),
  survival_scaled       boolean NOT NULL DEFAULT false,

  calculated_at         timestamptz,
  locked_at             timestamptz,
  locked_by             uuid REFERENCES app_user(id),
  -- Traceability reference shown on the breakdown screen after the lock.
  audit_hash            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- One budget cycle per sprint cycle per org.
  UNIQUE (cycle_id),
  CHECK (status = 'provisional' OR (locked_at IS NOT NULL AND audit_hash IS NOT NULL)),
  CHECK (locked_at IS NULL OR calculated_at IS NOT NULL)
);

CREATE TRIGGER budget_cycle_set_updated_at
  BEFORE UPDATE ON budget_cycle
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The formula weights are the constitutional 40/35/25 split. They must be the
-- three known components and must sum to 100 — the same invariant
-- core/governance.ts enforces on a rule change, applied here so a bad snapshot
-- cannot be written in the first place.
CREATE FUNCTION budget_cycle_weights_valid() RETURNS trigger AS $$
DECLARE
  total numeric;
BEGIN
  IF jsonb_typeof(NEW.formula_weights) <> 'object' THEN
    RAISE EXCEPTION 'formula_weights must be a JSON object';
  END IF;
  IF NOT (NEW.formula_weights ? 'financial'
          AND NEW.formula_weights ? 'peer_review'
          AND NEW.formula_weights ? 'strategic') THEN
    RAISE EXCEPTION 'formula_weights must carry financial, peer_review and strategic';
  END IF;
  SELECT COALESCE(SUM((value)::numeric), 0) INTO total
    FROM jsonb_each_text(NEW.formula_weights);
  IF total <> 100 THEN
    RAISE EXCEPTION 'formula_weights must sum to 100, got %', total;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER budget_cycle_weights_check
  BEFORE INSERT OR UPDATE OF formula_weights ON budget_cycle
  FOR EACH ROW EXECUTE FUNCTION budget_cycle_weights_valid();

-- A locked cycle is immutable: the only way to change an announced number is a
-- CorrectionRecord (13-TECHNICAL-ARCHITECTURE.md §7). Enforced here so no
-- application path — including a future one nobody has written yet — can make
-- a quiet edit.
CREATE FUNCTION budget_cycle_no_edit_after_lock() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'locked' THEN
    -- The correction workflow is the sole exception, and it works by appending
    -- a correction record and recomputing into a *new* row, never by reopening
    -- this one.
    RAISE EXCEPTION 'budget cycle % is locked and immutable (use a correction record)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER budget_cycle_lock_final
  BEFORE UPDATE ON budget_cycle
  FOR EACH ROW EXECUTE FUNCTION budget_cycle_no_edit_after_lock();

-- ---------------------------------------------------------------------------
-- Score components — the three inputs, with their provenance
-- ---------------------------------------------------------------------------
CREATE TABLE pod_score_component (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_cycle_id       uuid NOT NULL REFERENCES budget_cycle(id) ON DELETE CASCADE,
  cycle_id              uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  pod_id                uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  component_type        text NOT NULL
                          CHECK (component_type IN ('financial', 'peer_review', 'strategic')),
  -- The raw values behind the score, kept so the breakdown screen can show
  -- "78/100 — percentile rank among 6 pods" instead of a bare number.
  raw_inputs            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'percentile_rank' | 'min_max' | 'target' | 'peer_average' | 'rubric'
  normalization_method  text NOT NULL,
  score                 numeric(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
  -- A human-readable one-line "why" for the sub-bar (05 §current-cycle 4).
  explanation           text,
  calculated_at         timestamptz NOT NULL DEFAULT now(),
  -- One component per pod per cycle. Recomputation overwrites a *provisional*
  -- component; a locked one is protected by the budget_cycle trigger above.
  UNIQUE (budget_cycle_id, pod_id, component_type)
);

CREATE INDEX pod_score_component_pod_idx ON pod_score_component (pod_id, cycle_id);

-- ---------------------------------------------------------------------------
-- Allocation results
-- ---------------------------------------------------------------------------
CREATE TABLE pod_budget_result (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_cycle_id         uuid NOT NULL REFERENCES budget_cycle(id) ON DELETE CASCADE,
  cycle_id                uuid NOT NULL REFERENCES sprint_cycle(id) ON DELETE CASCADE,
  pod_id                  uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,

  unit_score              numeric(6, 3) NOT NULL CHECK (unit_score >= 0),

  -- Snapshot of the pod's fixed costs at calculation time. Storing only the
  -- derived floor would make the breakdown unable to show where it came from,
  -- and re-reading the live figure would let a later cost change silently
  -- rewrite an announced budget.
  monthly_fixed_costs     numeric(18, 2) NOT NULL DEFAULT 0
                            CHECK (monthly_fixed_costs >= 0),
  survival_budget         numeric(18, 2) NOT NULL DEFAULT 0
                            CHECK (survival_budget >= 0),
  survival_budget_applied boolean NOT NULL DEFAULT true,

  -- What the proportional formula wanted before the ceiling intervened. Kept
  -- separately so the breakdown can show the adjustment as its own line.
  raw_budget_share        numeric(18, 2) NOT NULL DEFAULT 0,
  formula_share           numeric(18, 2) NOT NULL DEFAULT 0,
  cap_applied             boolean NOT NULL DEFAULT false,
  cap_reduction           numeric(18, 2) NOT NULL DEFAULT 0,
  redistributed_amount    numeric(18, 2) NOT NULL DEFAULT 0,

  final_budget            numeric(18, 2) NOT NULL DEFAULT 0
                            CHECK (final_budget >= 0),
  -- Share of the total pool as a percentage — what the allocation bar draws.
  share_of_pool_percent   numeric(6, 3) NOT NULL DEFAULT 0,

  locked                  boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (budget_cycle_id, pod_id),
  -- The final number is always the sum of its parts. Storing all of them and
  -- letting them disagree would defeat the whole point of the module.
  CHECK (final_budget = survival_budget + formula_share),
  -- A cap that clipped nothing must not claim a reduction.
  CHECK (cap_applied OR cap_reduction = 0),
  -- The lock flag follows the cycle, never the individual row.
  CHECK (locked OR final_budget >= 0)
);

CREATE INDEX pod_budget_result_pod_idx ON pod_budget_result (pod_id, cycle_id);

CREATE TRIGGER pod_budget_result_set_updated_at
  BEFORE UPDATE ON pod_budget_result
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A locked result is immutable (05 §business logic 6). The trigger is on the
-- row as well as on the cycle because the correction workflow is the only
-- sanctioned way past it, and that workflow appends rather than updates.
CREATE FUNCTION pod_budget_result_no_edit_after_lock() RETURNS trigger AS $$
BEGIN
  IF OLD.locked THEN
    RAISE EXCEPTION
      'budget result % is locked; corrections arrive as a new record, never an edit',
      OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pod_budget_result_lock_final
  BEFORE UPDATE ON pod_budget_result
  FOR EACH ROW EXECUTE FUNCTION pod_budget_result_no_edit_after_lock();

-- A result cannot outlive its cycle's provisional status: once the cycle is
-- locked every result under it must be locked too. Deferrable so the locking
-- transaction can write the results first and the cycle second.
CREATE FUNCTION pod_budget_result_matches_cycle_lock() RETURNS trigger AS $$
DECLARE
  cycle_locked boolean;
BEGIN
  SELECT (status = 'locked') INTO cycle_locked
    FROM budget_cycle WHERE id = NEW.budget_cycle_id;
  IF cycle_locked AND NOT NEW.locked THEN
    RAISE EXCEPTION
      'budget cycle % is locked, so result % must be locked as well',
      NEW.budget_cycle_id, NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER pod_budget_result_cycle_lock
  AFTER INSERT OR UPDATE ON pod_budget_result
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION pod_budget_result_matches_cycle_lock();

-- ---------------------------------------------------------------------------
-- Pod fixed costs — the survival floor's input
-- ---------------------------------------------------------------------------
-- 15-BUSINESS-RULES-APPENDIX: "Survival Budget = 1 month of that unit's fixed
-- costs". The figure lives on the pod because it is a property of the pod, but
-- every calculation snapshots it into pod_budget_result so history stays exact.
ALTER TABLE pod
  ADD COLUMN monthly_fixed_costs numeric(18, 2) NOT NULL DEFAULT 0
    CHECK (monthly_fixed_costs >= 0);
