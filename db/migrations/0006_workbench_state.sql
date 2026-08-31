BEGIN;

CREATE TABLE app.workbench_states (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  workflow_id text NOT NULL,
  definition_version integer NOT NULL DEFAULT 1 CHECK (definition_version >= 1),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  status text NOT NULL DEFAULT 'awaiting_approval'
    CHECK (status IN (
      'draft',
      'awaiting_approval',
      'approved',
      'running',
      'completed',
      'failed',
      'cancelled'
    )),
  approved_action_ref text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_user_id, workflow_id),
  CHECK (
    (approved_action_ref IS NULL AND approved_by IS NULL AND approved_at IS NULL)
    OR
    (approved_action_ref IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CHECK (
    status NOT IN ('approved', 'running', 'completed', 'failed')
    OR approved_action_ref IS NOT NULL
  ),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, approved_by)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE INDEX workbench_states_tenant_status_idx
  ON app.workbench_states (tenant_id, owner_user_id, status, updated_at DESC);

ALTER TABLE app.workbench_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workbench_states FORCE ROW LEVEL SECURITY;

CREATE POLICY workbench_states_tenant_isolation ON app.workbench_states
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
