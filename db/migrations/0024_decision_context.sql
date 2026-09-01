BEGIN;

CREATE TABLE app.decision_context_states (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 1),
  available_minutes integer NOT NULL CHECK (available_minutes BETWEEN 0 AND 10080),
  maximum_energy_cost smallint NOT NULL CHECK (maximum_energy_cost BETWEEN 1 AND 5),
  attention_capacity smallint NOT NULL CHECK (attention_capacity BETWEEN 1 AND 5),
  visibility_tolerance smallint NOT NULL CHECK (visibility_tolerance BETWEEN 1 AND 5),
  emotional_bandwidth smallint NOT NULL CHECK (emotional_bandwidth BETWEEN 1 AND 5),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_user_id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, updated_by)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.decision_context_requests (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  request_id text NOT NULL CHECK (request_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  result_snapshot jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_user_id, request_id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

ALTER TABLE app.workbench_states
  ADD COLUMN decision_context_revision bigint NOT NULL DEFAULT 1
    CHECK (decision_context_revision >= 1),
  ADD COLUMN approved_context_sha256 text
    CHECK (approved_context_sha256 IS NULL OR approved_context_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN decision_window_ends_at timestamptz;

UPDATE app.workbench_states
   SET approved_context_sha256 = repeat('0', 64),
       decision_window_ends_at = approved_at + interval '24 hours'
 WHERE approved_action_ref IS NOT NULL;

ALTER TABLE app.workbench_states
  ADD CONSTRAINT workbench_approved_context_complete CHECK (
    approved_action_ref IS NULL
    OR (approved_context_sha256 IS NOT NULL AND decision_window_ends_at IS NOT NULL)
  );

CREATE INDEX decision_context_states_updated_idx
  ON app.decision_context_states (tenant_id, owner_user_id, updated_at DESC);

ALTER TABLE app.decision_context_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.decision_context_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.decision_context_states FORCE ROW LEVEL SECURITY;
ALTER TABLE app.decision_context_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY decision_context_states_tenant_isolation ON app.decision_context_states
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY decision_context_requests_tenant_isolation ON app.decision_context_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE app.decision_context_states IS
  'Owner-controlled, versioned attention context. Saving a new revision invalidates prior workbench approval.';

COMMIT;
