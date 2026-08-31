BEGIN;

CREATE TABLE app.asset_intake_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (length(client_ref) BETWEEN 3 AND 64),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  asset_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  assertion_id uuid NOT NULL,
  result_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, asset_id)
    REFERENCES app.assets(tenant_id, id),
  FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES app.evidence_items(tenant_id, id),
  FOREIGN KEY (tenant_id, assertion_id)
    REFERENCES app.assertions(tenant_id, id)
);

CREATE INDEX asset_intake_requests_owner_time_idx
  ON app.asset_intake_requests (tenant_id, owner_user_id, created_at DESC);

ALTER TABLE app.asset_intake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.asset_intake_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY asset_intake_requests_tenant_isolation ON app.asset_intake_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
