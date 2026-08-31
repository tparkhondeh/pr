BEGIN;

CREATE TABLE app.feedback_learning_requests (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  operation text NOT NULL CHECK (operation IN ('edited', 'rejected', 'decide')),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  result_snapshot jsonb,
  requested_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE UNIQUE INDEX preference_proposals_one_active_value_idx
  ON app.preference_proposals (tenant_id, user_id, preference_key, md5(proposed_value::text))
  WHERE status IN ('proposed', 'applied');

ALTER TABLE app.feedback_learning_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.feedback_learning_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY feedback_learning_requests_tenant_isolation ON app.feedback_learning_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
