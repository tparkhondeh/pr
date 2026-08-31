BEGIN;

CREATE TABLE app.risk_reviews (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  action_ref text NOT NULL CHECK (length(action_ref) BETWEEN 1 AND 200),
  assessment_sha256 text NOT NULL CHECK (assessment_sha256 ~ '^[0-9a-f]{64}$'),
  policy_version text NOT NULL CHECK (policy_version = 'brand-protection-v1'),
  expected_level text NOT NULL CHECK (expected_level IN ('yellow', 'red')),
  decision text NOT NULL CHECK (decision IN ('acknowledge', 'hold', 'escalate')),
  rationale text NOT NULL CHECK (length(rationale) BETWEEN 20 AND 2000),
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES app.memberships(tenant_id, user_id),
  CHECK (owner_user_id = reviewed_by),
  CHECK (expected_level = 'yellow' OR decision <> 'acknowledge')
);

CREATE INDEX risk_reviews_action_time_idx
  ON app.risk_reviews (tenant_id, owner_user_id, action_ref, reviewed_at DESC);

ALTER TABLE app.risk_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.risk_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY risk_reviews_tenant_isolation ON app.risk_reviews
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
