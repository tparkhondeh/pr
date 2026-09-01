BEGIN;

CREATE TABLE app.initiative_settings (
  tenant_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('reactive', 'balanced', 'proactive')),
  max_prompts_per_24_hours smallint NOT NULL CHECK (max_prompts_per_24_hours BETWEEN 1 AND 3),
  minimum_relevance numeric(4, 3) NOT NULL CHECK (minimum_relevance BETWEEN 0.5 AND 0.95),
  paused_until timestamptz,
  revision bigint NOT NULL CHECK (revision >= 2),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, owner_user_id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, updated_by)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.initiative_setting_requests (
  tenant_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.initiative_evaluations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  context_sha256 text NOT NULL CHECK (context_sha256 ~ '^[0-9a-f]{64}$'),
  policy_version text NOT NULL CHECK (policy_version = 'initiative-policy-v1'),
  decision text NOT NULL CHECK (decision IN ('delivered', 'suppressed')),
  reason text NOT NULL CHECK (reason IN (
    'delivered', 'reactive_mode', 'paused', 'rate_limited',
    'below_relevance', 'no_material_signal'
  )),
  relevance_score numeric(4, 3) CHECK (relevance_score BETWEEN 0 AND 1),
  result_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  CHECK (jsonb_typeof(result_snapshot) = 'object'),
  CHECK (result_snapshot ?& ARRAY[
    'evaluationId', 'requestId', 'policyVersion', 'settingsRevision',
    'contextHash', 'candidate', 'decision', 'reason', 'createdAt'
  ]),
  CHECK (result_snapshot->>'policyVersion' = policy_version),
  CHECK (result_snapshot->>'decision' = decision),
  CHECK (result_snapshot->>'reason' = reason)
);

CREATE INDEX initiative_evaluations_window_idx
  ON app.initiative_evaluations (tenant_id, owner_user_id, created_at DESC)
  WHERE decision = 'delivered';

ALTER TABLE app.initiative_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.initiative_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE app.initiative_setting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.initiative_setting_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE app.initiative_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.initiative_evaluations FORCE ROW LEVEL SECURITY;

CREATE POLICY initiative_settings_tenant_isolation ON app.initiative_settings
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY initiative_setting_requests_tenant_isolation ON app.initiative_setting_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY initiative_evaluations_tenant_isolation ON app.initiative_evaluations
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE app.initiative_evaluations IS
  'Owner-scoped proactive cue decisions; rate-limited decision support only, with no outbound notification or action side effect.';

COMMIT;
