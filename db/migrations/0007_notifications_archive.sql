-- 0007 — Notifications + Archive & Organizational Memory (Modules 11 + 10).
--
-- These two tables sets share one design premise from
-- 13-TECHNICAL-ARCHITECTURE.md §9: both are *consumers* of the same domain
-- event bus. A single state change publishes one event; the Notification
-- dispatcher and the Archive indexer each subscribe to it, so the "who should
-- be told" list and the "what should be remembered" list can never drift
-- apart into two separately maintained trigger tables.
--
-- Consequences encoded here:
--   * `notification.source_event_id` + a partial unique index = one
--     notification per recipient per event. Replaying an event cannot spam.
--   * `archive_index_entry` is an *index*, not a copy: it stores a title,
--     summary and a pointer (entity_type + entity_id) back to the module of
--     origin. The read path deep-links to the source; nothing here duplicates
--     the source record, so the two can never go out of sync.
--   * The archive only ever indexes entity types the source modules emit. A
--     coaching session's private notes are not an indexable entity type and no
--     event payload carries them, so they are structurally unable to reach a
--     search result.

-- ---------------------------------------------------------------------------
-- Notifications (Module 11)
-- ---------------------------------------------------------------------------

CREATE TABLE notification (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  recipient_user_id   uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,

  -- The canonical trigger, e.g. 'pitch_window_opened'. This — not the raw
  -- event name — is what the Needs-Action completion check keys off, because
  -- it names the *rule* (a window opened) rather than the *emission*.
  trigger_type        text NOT NULL,

  urgency             text NOT NULL CHECK (urgency IN ('informational', 'action_required', 'urgent')),
  title               text NOT NULL,
  context_text        text,
  -- Where the primary action button deep-links to.
  deep_link           text,

  -- The entity the action is about. Needs-Action items are cleared by
  -- re-querying THIS entity's live state, never by a dismissed flag, so the
  -- list stays truthful (11 §business logic).
  related_entity_type text,
  related_entity_id   uuid,

  -- The event that produced this row. Used for idempotent dedupe on replay.
  source_event_id     uuid REFERENCES domain_event(id) ON DELETE CASCADE,

  read_at             timestamptz,
  actioned_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- One notification per recipient per event. Partial: rows without a source
-- event (e.g. ones seeded directly) are not subject to it.
CREATE UNIQUE INDEX notification_dedupe_key
  ON notification (recipient_user_id, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX notification_recipient_idx ON notification (recipient_user_id, created_at DESC);
CREATE INDEX notification_org_idx ON notification (org_id, created_at DESC);

-- Per-user delivery preferences: urgency × channel. Absence of a row means the
-- default (in-app ON, email ON for action/urgent, digest ON for informational).
CREATE TABLE notification_preference (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  urgency_level text NOT NULL CHECK (urgency_level IN ('informational', 'action_required', 'urgent')),
  channel       text NOT NULL CHECK (channel IN ('in_app', 'email', 'digest')),
  enabled       boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, urgency_level, channel)
);

-- ---------------------------------------------------------------------------
-- Archive index + lessons learned (Module 10)
-- ---------------------------------------------------------------------------

CREATE TABLE archive_index_entry (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,

  entity_type     text NOT NULL CHECK (entity_type IN
                    ('pitch', 'cloud', 'budget_cycle', 'accountability_case',
                     'entry_trial', 'rule_change', 'lesson')),
  -- Pointer back to the source record. Nullable only for 'lesson' rows whose
  -- related entity lives in lesson_learned.
  entity_id       uuid,

  title           text NOT NULL,
  summary         text,
  -- Denormalised for the search filter — the source of truth stays the pod table.
  pod_ids         jsonb NOT NULL DEFAULT '[]'::jsonb,
  holding_id      uuid,
  tags            jsonb NOT NULL DEFAULT '[]'::jsonb,

  occurred_at     timestamptz NOT NULL DEFAULT now(),
  indexed_at      timestamptz NOT NULL DEFAULT now(),
  source_event_id uuid REFERENCES domain_event(id) ON DELETE CASCADE
);

-- Same idempotence guarantee as notifications: replaying an event cannot
-- produce a second index row for the same source record.
CREATE UNIQUE INDEX archive_dedupe_key
  ON archive_index_entry (entity_type, entity_id, source_event_id)
  WHERE source_event_id IS NOT NULL AND entity_id IS NOT NULL;

CREATE INDEX archive_org_date_idx ON archive_index_entry (org_id, occurred_at DESC);
CREATE INDEX archive_type_idx ON archive_index_entry (org_id, entity_type);

-- Lessons learned are the one entity genuinely authored in this module
-- (reflective/curated, not a mirror of a transaction).
CREATE TABLE lesson_learned (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  related_entity_type      text,
  related_entity_id        uuid,
  what_happened            text NOT NULL,
  what_wed_do_differently  text,
  tags                     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by               uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lesson_org_idx ON lesson_learned (org_id, created_at DESC);
