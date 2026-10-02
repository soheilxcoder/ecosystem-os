-- 0009 — Correction Records (Phase 8, 13-TECHNICAL-ARCHITECTURE.md §7).
--
-- Locked records (budget results, entry-trial decisions, accountability
-- outcomes, financial sync figures) are immutable by design. Real errors still
-- happen, so the system's ONE correction path is this table: a correction
-- never overwrites the original row — readers see the original (marked
-- superseded) beside the correction (with who approved it and why).
--
-- The two-person rule is structural: `proposed_by` and `approved_by` are
-- distinct columns, and the service layer refuses approval by the proposer.
-- Both must hold Architecture Hub seats (checked in the route guards).

CREATE TABLE correction_record (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,

  original_entity_type  text NOT NULL
                        CHECK (original_entity_type IN (
                          'budget_result',      -- a locked budget cycle result
                          'financial_sync',     -- an accounting/CRM sync figure
                          'entry_trial',        -- a 90-Day Entry decision
                          'accountability_case',-- an accountability outcome
                          'peer_review_score'   -- a submitted review score
                        )),
  original_entity_id    uuid NOT NULL,
  field_corrected       text NOT NULL,

  -- Snapshots, never live references: the original value is frozen at
  -- proposal time so later upstream changes cannot rewrite history.
  original_value        jsonb NOT NULL,
  corrected_value       jsonb NOT NULL,
  reason                text NOT NULL CHECK (char_length(reason) >= 10),

  proposed_by           uuid NOT NULL REFERENCES app_user(id),
  -- NULL until a SECOND, distinct Architecture Hub user approves.
  approved_by           uuid REFERENCES app_user(id),
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at            timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),

  CHECK (approved_by IS NULL OR approved_by <> proposed_by)
);

CREATE INDEX correction_record_org_idx ON correction_record (org_id, created_at DESC);
CREATE INDEX correction_record_entity_idx
  ON correction_record (original_entity_type, original_entity_id);

-- The Archive's index gains the correction entity type: every approved
-- correction must be visible in the same history the pods read (§7).
ALTER TABLE archive_index_entry DROP CONSTRAINT archive_index_entry_entity_type_check;
ALTER TABLE archive_index_entry ADD CONSTRAINT archive_index_entry_entity_type_check
  CHECK (entity_type IN (
    'pitch', 'cloud', 'budget_cycle', 'accountability_case',
    'entry_trial', 'rule_change', 'lesson', 'pod', 'correction'));
