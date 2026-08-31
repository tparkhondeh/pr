BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;

CREATE TYPE app.data_class AS ENUM (
  'public',
  'internal',
  'confidential',
  'restricted'
);

CREATE TYPE app.epistemic_type AS ENUM (
  'fact',
  'observation',
  'self_report',
  'external_perception',
  'behavioral_evidence',
  'hypothesis',
  'inference',
  'uncertainty'
);

CREATE TYPE app.consent_purpose AS ENUM (
  'personal_understanding',
  'strategy_reasoning',
  'brand_usage',
  'public_drafting',
  'external_research',
  'external_sharing'
);

CREATE TYPE app.consent_operation AS ENUM (
  'read',
  'process',
  'derive',
  'export',
  'share'
);

CREATE TABLE app.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  suspended_at timestamptz
);

CREATE TABLE app.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

CREATE TABLE app.memberships (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'reviewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE app.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  kind text NOT NULL,
  object_key text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  data_class app.data_class NOT NULL DEFAULT 'confidential',
  occurred_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, content_sha256),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  asset_id uuid,
  source_type text NOT NULL,
  source_locator text,
  content jsonb NOT NULL,
  data_class app.data_class NOT NULL DEFAULT 'confidential',
  integrity_sha256 text NOT NULL CHECK (integrity_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, asset_id)
    REFERENCES app.assets(tenant_id, id)
);

CREATE TABLE app.assertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  subject_ref text NOT NULL,
  predicate text NOT NULL,
  value jsonb NOT NULL,
  epistemic_type app.epistemic_type NOT NULL,
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  confidence_rationale text,
  valid_from timestamptz,
  valid_to timestamptz,
  supersedes_id uuid,
  contested_at timestamptz,
  contest_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (tenant_id, id),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from),
  CHECK ((contested_at IS NULL) = (contest_reason IS NULL)),
  FOREIGN KEY (tenant_id, created_by)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, supersedes_id)
    REFERENCES app.assertions(tenant_id, id)
);

CREATE TABLE app.assertion_evidence (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  assertion_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  relation text NOT NULL CHECK (relation IN ('supports', 'contradicts')),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, assertion_id, evidence_id),
  FOREIGN KEY (tenant_id, assertion_id)
    REFERENCES app.assertions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES app.evidence_items(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE app.consent_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  purpose app.consent_purpose NOT NULL,
  operation app.consent_operation NOT NULL,
  data_class app.data_class NOT NULL,
  audience text NOT NULL DEFAULT 'system',
  channel text NOT NULL DEFAULT 'internal',
  policy_version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  UNIQUE (tenant_id, id),
  CHECK (expires_at IS NULL OR expires_at > granted_at),
  CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL)),
  FOREIGN KEY (tenant_id, subject_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, granted_by)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid,
  event_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  purpose app.consent_purpose,
  decision text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  UNIQUE (tenant_id, id)
);

CREATE INDEX evidence_items_tenant_observed_idx
  ON app.evidence_items (tenant_id, observed_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX assertions_tenant_subject_idx
  ON app.assertions (tenant_id, subject_ref, predicate)
  WHERE contested_at IS NULL;
CREATE INDEX consent_grants_active_idx
  ON app.consent_grants (tenant_id, subject_user_id, purpose, operation, data_class)
  WHERE revoked_at IS NULL;
CREATE INDEX audit_events_tenant_time_idx
  ON app.audit_events (tenant_id, occurred_at DESC);
CREATE INDEX outbox_events_ready_idx
  ON app.outbox_events (available_at, created_at)
  WHERE published_at IS NULL;

CREATE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE FUNCTION app.prevent_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END;
$$;

CREATE TRIGGER audit_events_immutable
BEFORE UPDATE OR DELETE ON app.audit_events
FOR EACH ROW EXECUTE FUNCTION app.prevent_audit_mutation();

ALTER TABLE app.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assertion_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.consent_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE app.assets FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_items FORCE ROW LEVEL SECURITY;
ALTER TABLE app.assertions FORCE ROW LEVEL SECURITY;
ALTER TABLE app.assertion_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE app.consent_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_events FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant_isolation ON app.memberships
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY assets_tenant_isolation ON app.assets
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY evidence_items_tenant_isolation ON app.evidence_items
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY assertions_tenant_isolation ON app.assertions
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY assertion_evidence_tenant_isolation ON app.assertion_evidence
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY consent_grants_tenant_isolation ON app.consent_grants
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY audit_events_tenant_isolation ON app.audit_events
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY outbox_events_tenant_isolation ON app.outbox_events
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;

