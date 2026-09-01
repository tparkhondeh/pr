BEGIN;

CREATE TABLE app.arbitration_cases (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  action_ref text NOT NULL CHECK (length(action_ref) BETWEEN 1 AND 200),
  action_sha256 text NOT NULL CHECK (action_sha256 ~ '^[0-9a-f]{64}$'),
  context_sha256 text NOT NULL CHECK (context_sha256 ~ '^[0-9a-f]{64}$'),
  policy_version text NOT NULL CHECK (policy_version = 'intermodule-arbitration-v1'),
  requested_autonomy_level smallint NOT NULL CHECK (requested_autonomy_level BETWEEN 0 AND 7),
  result_snapshot jsonb NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  CHECK (jsonb_typeof(result_snapshot) = 'object'),
  CHECK (result_snapshot ?& ARRAY[
    'caseId', 'requestId', 'policyVersion', 'createdAt', 'validUntil',
    'contextHash', 'snapshotHash', 'action', 'request', 'opinions', 'decision'
  ]),
  CHECK (result_snapshot->>'policyVersion' = policy_version),
  CHECK ((result_snapshot->'request'->>'requestedAutonomyLevel')::smallint = requested_autonomy_level),
  CHECK (jsonb_typeof(result_snapshot->'opinions') = 'array'),
  CHECK (jsonb_array_length(result_snapshot->'opinions') BETWEEN 1 AND 20),
  CHECK (result_snapshot->'decision'->>'executionPermitted' = 'false'),
  CHECK ((result_snapshot->'decision'->>'effectiveAutonomyLevel')::smallint BETWEEN 0 AND 5)
);

CREATE INDEX arbitration_cases_action_time_idx
  ON app.arbitration_cases (tenant_id, owner_user_id, action_ref, created_at DESC);

ALTER TABLE app.arbitration_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.arbitration_cases FORCE ROW LEVEL SECURITY;

CREATE POLICY arbitration_cases_tenant_isolation ON app.arbitration_cases
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE app.arbitration_cases IS
  'Append-only, owner-scoped inter-module opinions and deterministic arbitration decisions; no public side effect is authorized.';

COMMIT;
