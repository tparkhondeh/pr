BEGIN;

ALTER TABLE app.draft_artifacts
  ADD COLUMN owner_user_id uuid,
  ADD COLUMN source_proposal_ref text,
  ADD COLUMN source_assertion_id uuid,
  ADD COLUMN strategy_revision bigint CHECK (strategy_revision IS NULL OR strategy_revision >= 1),
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN exported_at timestamptz,
  ADD COLUMN created_by uuid,
  ADD CONSTRAINT draft_artifacts_approval_pair
    CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  ADD CONSTRAINT draft_artifacts_owner_fk
    FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  ADD CONSTRAINT draft_artifacts_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES app.memberships(tenant_id, user_id),
  ADD CONSTRAINT draft_artifacts_approved_by_fk
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES app.memberships(tenant_id, user_id),
  ADD CONSTRAINT draft_artifacts_source_assertion_fk
    FOREIGN KEY (tenant_id, source_assertion_id)
    REFERENCES app.assertions(tenant_id, id);

CREATE TABLE app.draft_workspace_requests (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  operation text NOT NULL CHECK (operation IN ('create', 'edit', 'approve', 'export')),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  result_snapshot jsonb,
  requested_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE INDEX draft_artifacts_owner_updated_idx
  ON app.draft_artifacts (tenant_id, owner_user_id, updated_at DESC)
  WHERE owner_user_id IS NOT NULL;

ALTER TABLE app.draft_workspace_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.draft_workspace_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY draft_workspace_requests_tenant_isolation ON app.draft_workspace_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
