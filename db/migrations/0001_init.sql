-- 0001_init — Phase 0 foundation slice
--
-- Source: 13-TECHNICAL-ARCHITECTURE.md §3 (ERD) and §4 (role_assignment),
--         14-ROADMAP-FOR-AGENT.md Phase 0.
--
-- Deliberately includes, beyond the six minimum ERD tables, the two
-- cross-cutting tables Phase 0's own requirements depend on:
--   * audit_log    — "full audit log (append-only)" (§6 security)
--   * domain_event — durable outbox for the internal event bus (§2)

-- ---------------------------------------------------------------------------
-- Extensions
--
-- None required: gen_random_uuid() is part of PostgreSQL core since 13, and
-- PGlite (used for local/test runs) does not bundle pgcrypto.
-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Org & Holding (13-TECHNICAL-ARCHITECTURE.md §8 — tenant scoping)
-- ---------------------------------------------------------------------------
CREATE TABLE org (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE holding (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE INDEX holding_org_idx ON holding (org_id);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  email         text NOT NULL,
  full_name     text NOT NULL,
  avatar_url    text,
  -- OIDC subject claim (`sub`) from the identity provider. The app keeps its
  -- own role tables; the IdP owns only identity (13-TECHNICAL-ARCHITECTURE.md §1).
  auth_subject  text UNIQUE,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'invited', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive email uniqueness without requiring the citext extension.
CREATE UNIQUE INDEX app_user_email_lower_key ON app_user (lower(email));
CREATE INDEX app_user_org_idx ON app_user (org_id);

CREATE TRIGGER app_user_set_updated_at
  BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Role assignments — the heart of the permission system (§4)
--
-- Roles are time-boxed assignment records, never columns on app_user.
--   end_date IS NULL                 => open-ended (e.g. plain pod membership)
--   end_date set                     => rotating seat (pod_lead, coach, peer_validator)
--   revoked_at set                   => ended early, without rewriting history
-- ---------------------------------------------------------------------------
CREATE TABLE role_assignment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role_type   text NOT NULL
                CHECK (role_type IN (
                  'pod_member', 'pod_lead', 'peer_validator', 'conflict_resolver',
                  'coach', 'hub_architecture', 'hub_deployment', 'hub_coaching',
                  'hub_strategic', 'investor', 'holding_executive'
                )),
  scope_type  text NOT NULL CHECK (scope_type IN ('pod', 'cycle', 'case', 'holding', 'org')),
  -- NULL only for org-scoped roles.
  scope_id    uuid,
  start_date  date NOT NULL,
  end_date    date,
  created_by  uuid REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  CHECK (end_date IS NULL OR end_date >= start_date),
  -- Org-scoped roles must not carry a scope id; every other scope must.
  CHECK ((scope_type = 'org' AND scope_id IS NULL)
         OR (scope_type <> 'org' AND scope_id IS NOT NULL))
);

CREATE INDEX role_assignment_user_idx ON role_assignment (user_id);
CREATE INDEX role_assignment_scope_idx ON role_assignment (role_type, scope_type, scope_id);
CREATE INDEX role_assignment_window_idx ON role_assignment (start_date, end_date);
-- One live assignment per (user, role, scope): a second one would silently
-- create a duplicate seat. Historical rows are distinguished by revoked_at.
CREATE UNIQUE INDEX role_assignment_live_key
  ON role_assignment (user_id, role_type, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Pods & membership (03)
-- ---------------------------------------------------------------------------
CREATE TABLE pod (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id      uuid NOT NULL REFERENCES holding(id) ON DELETE CASCADE,
  name            text NOT NULL,
  category_tag    text,
  status          text NOT NULL DEFAULT 'trial'
                    CHECK (status IN ('trial', 'active', 'accountability', 'dissolved')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  trial_end_date  date,
  UNIQUE (holding_id, name)
);

CREATE INDEX pod_holding_idx ON pod (holding_id);
CREATE INDEX pod_status_idx ON pod (status);

CREATE TABLE pod_membership (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id      uuid NOT NULL REFERENCES pod(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  joined_at   date NOT NULL DEFAULT CURRENT_DATE,
  left_at     date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (left_at IS NULL OR left_at >= joined_at)
);

-- A user may hold at most one *active* membership in a pod (they may rejoin,
-- which closes the previous row and opens a new one).
CREATE UNIQUE INDEX pod_membership_active_key
  ON pod_membership (pod_id, user_id)
  WHERE left_at IS NULL;

CREATE INDEX pod_membership_user_idx ON pod_membership (user_id);

-- ---------------------------------------------------------------------------
-- Append-only audit log (§6)
--
-- Distinct from the user-facing Archive: it records technical detail (request
-- id, IP) for security review, and rows can never be edited or removed.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  action        text NOT NULL,
  entity_type   text,
  entity_id     uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id    text,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION audit_log_no_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (action attempted: %)', TG_OP;
END;
$$;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_no_mutation();

-- ---------------------------------------------------------------------------
-- Domain event outbox (§2 — feeds Notifications and the Archive indexer)
-- ---------------------------------------------------------------------------
CREATE TABLE domain_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  aggregate_type  text,
  aggregate_id    uuid,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  org_id          uuid REFERENCES org(id) ON DELETE SET NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz
);

CREATE INDEX domain_event_type_idx ON domain_event (event_type);
CREATE INDEX domain_event_occurred_idx ON domain_event (occurred_at DESC);
CREATE INDEX domain_event_unprocessed_idx ON domain_event (occurred_at) WHERE processed_at IS NULL;
