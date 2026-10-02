-- ============================================================================
-- Migration 0008 — Strategic Hub Console (Module 09, Phase 7)
--
-- Three records Company X's hubs keep that no other module owns:
--
--   * pilot_program   — a named pilot (e.g. "Pars Pilot") tracked through the
--                       source model's two-part process: 8 preparation weeks,
--                       one 90-day sprint, then a Stop / Repeat / Expand
--                       decision. Phases and success criteria are JSON because
--                       they are a fixed-shape tracking board, not queryable
--                       relations.
--   * investor_report — an aggregated, generated snapshot. Aggregation happens
--                       at generation time and the stored metrics are already
--                       org/holding-level, so the investor portal physically
--                       cannot serve a single pod's operational detail.
--   * external_contact — the Strategic Interactions hub's lightweight contact
--                       log (investor / partner / media / institution).
--
-- The deployment wizard's launch action (server/services/hub.ts) is the ONLY
-- code path that creates `pod` rows over the API — the structural guarantee
-- that every pod starts life with an Entry Trial and a coach.
-- ============================================================================

CREATE TABLE pilot_program (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name             text NOT NULL,
  holding_id       uuid REFERENCES holding(id) ON DELETE SET NULL,
  pilot_pod_id     uuid REFERENCES pod(id) ON DELETE SET NULL,
  -- Where the pilot is on the 8-week prep + 90-day sprint timeline.
  current_phase    text NOT NULL DEFAULT 'selection_diagnostic'
                   CHECK (current_phase IN (
                     'selection_diagnostic',  -- Weeks 1–2
                     'pod_split_charter',     -- Weeks 3–4
                     'platform_setup',        -- Weeks 5–6
                     'rules_training',        -- Weeks 7–8
                     'sprint',                -- Sprint Days 1–90
                     'evaluation'             -- Post-Day-90
                   )),
  -- { <phase>: { status: 'not_started'|'in_progress'|'done', owner: text } }
  phase_status     jsonb NOT NULL DEFAULT '{}',
  -- { decisionTimeBaseline, decisionTimeCurrent, satisfactionScore,
  --   profitBudgetRatioBaseline, profitBudgetRatioCurrent }
  success_criteria jsonb NOT NULL DEFAULT '{}',
  decision         text CHECK (decision IN ('stop', 'repeat', 'expand')),
  decided_at       timestamptz,
  -- Carried into the next unit's archive when the decision is "expand".
  lessons_learned  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pilot_program_org_idx ON pilot_program (org_id, created_at DESC);

CREATE TABLE investor_report (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  generated_by  uuid REFERENCES app_user(id) ON DELETE SET NULL,
  date_from     date NOT NULL,
  date_to       date NOT NULL,
  -- { holdingIds: uuid[], podIds: uuid[] } — the aggregation scope.
  scope         jsonb NOT NULL,
  -- Aggregated metrics only; pod-level detail is never stored here.
  metrics       jsonb NOT NULL,
  published     boolean NOT NULL DEFAULT false,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);

CREATE INDEX investor_report_org_idx ON investor_report (org_id, created_at DESC);

CREATE TABLE external_contact (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name                text NOT NULL,
  relationship_type   text NOT NULL
                      CHECK (relationship_type IN ('investor', 'partner', 'media', 'institution')),
  last_interaction_at date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX external_contact_org_idx ON external_contact (org_id, relationship_type);

-- The archive gains one more indexable record: a launched pod (Module 09's
-- wizard is the only thing that can produce one). Extending the check keeps the
-- closed list closed — coaching sessions remain structurally unindexable.
ALTER TABLE archive_index_entry DROP CONSTRAINT archive_index_entry_entity_type_check;
ALTER TABLE archive_index_entry ADD CONSTRAINT archive_index_entry_entity_type_check
  CHECK (entity_type IN
    ('pitch', 'cloud', 'budget_cycle', 'accountability_case',
     'entry_trial', 'rule_change', 'lesson', 'pod'));
