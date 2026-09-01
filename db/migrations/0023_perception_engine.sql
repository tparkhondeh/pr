BEGIN;

ALTER TYPE app.consent_purpose ADD VALUE IF NOT EXISTS 'perception_analysis';

CREATE TABLE app.perception_signals (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  dimension text NOT NULL CHECK (dimension IN (
    'expertise', 'trust', 'leadership', 'clarity', 'innovation',
    'collaboration', 'visibility', 'authenticity', 'other'
  )),
  perspective text NOT NULL CHECK (perspective IN (
    'self_perception', 'desired_positioning', 'external_perception'
  )),
  visibility_stage text NOT NULL CHECK (visibility_stage IN (
    'not_visible', 'emerging', 'visible', 'strong', 'signature'
  )),
  signal_summary text NOT NULL CHECK (length(signal_summary) BETWEEN 5 AND 400),
  evidence_note text NOT NULL CHECK (length(evidence_note) BETWEEN 10 AND 1000),
  source_kind text NOT NULL CHECK (source_kind IN (
    'owner_reflection', 'owner_goal', 'direct_feedback', 'survey_summary',
    'public_signal', 'media_signal', 'network_feedback', 'other'
  )),
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  observed_at timestamptz NOT NULL,
  consent_confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  CHECK (observed_at <= created_at),
  CHECK (
    (perspective = 'self_perception' AND source_kind = 'owner_reflection') OR
    (perspective = 'desired_positioning' AND source_kind = 'owner_goal') OR
    (perspective = 'external_perception' AND source_kind NOT IN ('owner_reflection', 'owner_goal'))
  )
);

CREATE INDEX perception_signals_owner_dimension_idx
  ON app.perception_signals (tenant_id, owner_user_id, dimension, observed_at DESC, created_at DESC);

CREATE TABLE app.perception_requests (
  tenant_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'delete')),
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  result_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(result_snapshot) = 'object' AND
    jsonb_typeof(result_snapshot->'signalId') = 'string' AND
    result_snapshot = jsonb_build_object('signalId', result_snapshot->'signalId')
  ),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, owner_user_id, operation, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

ALTER TABLE app.perception_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.perception_signals FORCE ROW LEVEL SECURITY;
ALTER TABLE app.perception_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.perception_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY perception_signals_tenant_isolation ON app.perception_signals
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY perception_requests_tenant_isolation ON app.perception_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE app.perception_signals IS
  'Confidential owner-entered perception signals; source identity, verbatim private quotes, automated collection, and external action are prohibited.';

COMMIT;
