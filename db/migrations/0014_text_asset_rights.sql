BEGIN;

CREATE TABLE app.asset_rights_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (length(client_ref) BETWEEN 3 AND 64),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  asset_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('revoke_brand_usage', 'delete')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  result_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, asset_id)
    REFERENCES app.assets(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX asset_rights_requests_owner_time_idx
  ON app.asset_rights_requests (tenant_id, owner_user_id, created_at DESC);

ALTER TABLE app.asset_rights_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.asset_rights_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY asset_rights_requests_tenant_isolation ON app.asset_rights_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
