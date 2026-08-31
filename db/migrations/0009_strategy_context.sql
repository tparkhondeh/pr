BEGIN;

CREATE TABLE app.strategy_context_states (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  current_goal_id uuid NOT NULL,
  current_positioning_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 1),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_user_id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, updated_by)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, current_goal_id)
    REFERENCES app.goals(tenant_id, id),
  FOREIGN KEY (tenant_id, current_positioning_id)
    REFERENCES app.positioning_snapshots(tenant_id, id)
);

CREATE TABLE app.strategy_context_requests (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  request_id text NOT NULL CHECK (request_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  fingerprint text NOT NULL,
  result_snapshot jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_user_id, request_id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

ALTER TABLE app.workbench_states
  ADD COLUMN strategy_revision bigint NOT NULL DEFAULT 1 CHECK (strategy_revision >= 1);

CREATE INDEX strategy_context_states_updated_idx
  ON app.strategy_context_states (tenant_id, owner_user_id, updated_at DESC);

ALTER TABLE app.strategy_context_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.strategy_context_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.strategy_context_states FORCE ROW LEVEL SECURITY;
ALTER TABLE app.strategy_context_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY strategy_context_states_tenant_isolation ON app.strategy_context_states
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY strategy_context_requests_tenant_isolation ON app.strategy_context_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
