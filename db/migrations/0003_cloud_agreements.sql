-- 0003 — Bilateral agreements / CLOU (Module 04)
--
-- Source: 04-MODULE-CLOU-AGREEMENTS.md, 15-BUSINESS-RULES-APPENDIX.md.
--
-- The module's central rule is encoded in the schema itself: a CLOU may only
-- exist between two pods that actually exchange something, so
-- `service_description` carries a CHECK constraint that rejects an empty
-- string. The guardrail in the wizard is a usability affordance; this is the
-- control.

-- ---------------------------------------------------------------------------
-- CLOU agreement
-- ---------------------------------------------------------------------------
CREATE TABLE cloud_agreement (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  -- Pod A is always the pod that opened the proposal.
  pod_a_id              uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  pod_b_id              uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  name                  text NOT NULL
                          CHECK (char_length(btrim(name)) BETWEEN 3 AND 140),
  -- The rule from Module 04: no described exchange, no agreement.
  service_description   text NOT NULL
                          CHECK (char_length(btrim(service_description)) > 0),
  direction             text NOT NULL CHECK (direction IN ('a_to_b', 'b_to_a', 'bidirectional')),
  cadence               text NOT NULL CHECK (cadence IN ('one_time', 'recurring')),
  frequency             text CHECK (frequency IN (
                          'weekly', 'biweekly', 'monthly', 'quarterly',
                          'semiannual', 'annual')),
  -- Structured when one of the three priced models fits, free text otherwise:
  -- { model: 'fixed_fee'|'per_unit'|'revenue_share'|'other', amount, unit, notes }
  pricing_terms         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                text NOT NULL DEFAULT 'proposed' CHECK (status IN (
                          'proposed', 'countered', 'declined',
                          'active', 'renegotiating', 'archived')),
  -- Which pod owes the next response. NULL once the agreement is settled
  -- (declined / active / archived), which is what the proposals inbox reads.
  awaiting_pod_id       uuid REFERENCES pod(id) ON DELETE SET NULL,
  created_by_user_id    uuid REFERENCES app_user(id) ON DELETE SET NULL,
  start_date            date,
  renewal_date          date,
  activated_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (pod_a_id <> pod_b_id),
  CHECK (cadence <> 'recurring' OR frequency IS NOT NULL),
  CHECK (cadence <> 'one_time' OR frequency IS NULL),
  CHECK ((status IN ('proposed', 'countered', 'renegotiating')) = (awaiting_pod_id IS NOT NULL)),
  CHECK (status <> 'active' OR start_date IS NOT NULL)
);

CREATE INDEX cloud_agreement_org_idx ON cloud_agreement (org_id, status);
CREATE INDEX cloud_agreement_pod_a_idx ON cloud_agreement (pod_a_id);
CREATE INDEX cloud_agreement_pod_b_idx ON cloud_agreement (pod_b_id);
CREATE INDEX cloud_agreement_awaiting_idx ON cloud_agreement (awaiting_pod_id)
  WHERE awaiting_pod_id IS NOT NULL;

CREATE FUNCTION cloud_agreement_set_last_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.last_updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cloud_agreement_touch
  BEFORE UPDATE ON cloud_agreement
  FOR EACH ROW EXECUTE FUNCTION cloud_agreement_set_last_updated_at();

-- ---------------------------------------------------------------------------
-- Activity log — the status history rendered on the agreement detail screen.
--
-- `terms` is a snapshot of the agreement at the moment of the event, so the
-- history stays truthful after later renegotiations (a counter-proposal must
-- remain readable months later).
--
-- `accepted` is deliberately an event rather than a status: in this model
-- accepting a proposal and the agreement coming into force are a single
-- action, so a separate `accepted` status would never be observable.
-- ---------------------------------------------------------------------------
CREATE TABLE cloud_agreement_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id    uuid NOT NULL REFERENCES cloud_agreement(id) ON DELETE CASCADE,
  event_type      text NOT NULL CHECK (event_type IN (
                    'proposed', 'countered', 'accepted', 'declined',
                    'renegotiated', 'renewed', 'archived')),
  actor_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  terms           jsonb,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cloud_agreement_event_agreement_idx
  ON cloud_agreement_event (agreement_id, created_at);

-- ---------------------------------------------------------------------------
-- Two-party archive confirmation
--
-- Ending an agreement takes a confirmation from *each* side. Stored per pod,
-- so a single click can never destroy the record (Module 04: "a two-party
-- confirmation modal, not a single-click delete").
-- ---------------------------------------------------------------------------
CREATE TABLE cloud_agreement_archive_confirmation (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id          uuid NOT NULL REFERENCES cloud_agreement(id) ON DELETE CASCADE,
  pod_id                uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  confirmed_by_user_id  uuid REFERENCES app_user(id) ON DELETE SET NULL,
  note                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id, pod_id),
  CHECK (confirmed_by_user_id IS NOT NULL)
);

CREATE INDEX cloud_agreement_archive_idx
  ON cloud_agreement_archive_confirmation (agreement_id);
