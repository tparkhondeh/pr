BEGIN;

CREATE TABLE app.claim_reviews (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  claim_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('verify', 'dispute', 'revoke')),
  previous_status app.claim_status NOT NULL,
  resulting_status app.claim_status NOT NULL,
  rationale text NOT NULL CHECK (length(rationale) BETWEEN 20 AND 2000),
  trace_snapshot jsonb NOT NULL,
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, claim_id)
    REFERENCES app.claims(tenant_id, id) ON DELETE CASCADE,
  CHECK (owner_user_id = reviewed_by),
  CHECK (
    (decision = 'verify' AND previous_status = 'proposed' AND resulting_status = 'verified') OR
    (decision = 'dispute' AND previous_status IN ('proposed', 'verified') AND resulting_status = 'disputed') OR
    (decision = 'revoke' AND previous_status IN ('proposed', 'verified', 'disputed') AND resulting_status = 'revoked')
  )
);

CREATE INDEX claim_reviews_claim_time_idx
  ON app.claim_reviews (tenant_id, claim_id, reviewed_at DESC);

ALTER TABLE app.claim_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.claim_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY claim_reviews_tenant_isolation ON app.claim_reviews
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
