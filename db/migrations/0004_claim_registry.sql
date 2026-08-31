BEGIN;

CREATE TYPE app.claim_kind AS ENUM (
  'personal_fact',
  'external_fact',
  'opinion',
  'projection'
);

CREATE TYPE app.claim_status AS ENUM (
  'proposed',
  'verified',
  'disputed',
  'expired',
  'revoked'
);

CREATE TABLE app.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  statement text NOT NULL CHECK (length(statement) BETWEEN 3 AND 4000),
  kind app.claim_kind NOT NULL,
  status app.claim_status NOT NULL DEFAULT 'proposed',
  data_class app.data_class NOT NULL DEFAULT 'confidential',
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_purposes app.consent_purpose[] NOT NULL DEFAULT '{}',
  allowed_channels text[] NOT NULL DEFAULT '{}',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  verified_at timestamptz,
  verified_by uuid,
  disputed_at timestamptz,
  dispute_reason text,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (tenant_id, id),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK ((verified_at IS NULL) = (verified_by IS NULL)),
  CHECK ((disputed_at IS NULL) = (dispute_reason IS NULL)),
  CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL)),
  FOREIGN KEY (tenant_id, verified_by)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, created_by)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.claim_evidence (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  relation text NOT NULL CHECK (relation IN ('supports', 'contradicts')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, claim_id, evidence_id),
  FOREIGN KEY (tenant_id, claim_id)
    REFERENCES app.claims(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES app.evidence_items(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE app.draft_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  workflow_id text NOT NULL,
  channel text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'guard_failed', 'awaiting_approval', 'approved', 'exported')),
  guard_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE app.draft_claims (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  excerpt text NOT NULL,
  PRIMARY KEY (tenant_id, draft_id, claim_id),
  FOREIGN KEY (tenant_id, draft_id)
    REFERENCES app.draft_artifacts(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, claim_id)
    REFERENCES app.claims(tenant_id, id)
);

CREATE INDEX claims_tenant_status_idx
  ON app.claims (tenant_id, status, valid_until);
CREATE INDEX drafts_tenant_status_idx
  ON app.draft_artifacts (tenant_id, status, created_at DESC);

ALTER TABLE app.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.draft_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.draft_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.claims FORCE ROW LEVEL SECURITY;
ALTER TABLE app.claim_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE app.draft_artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE app.draft_claims FORCE ROW LEVEL SECURITY;

CREATE POLICY claims_tenant_isolation ON app.claims
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY claim_evidence_tenant_isolation ON app.claim_evidence
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY draft_artifacts_tenant_isolation ON app.draft_artifacts
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY draft_claims_tenant_isolation ON app.draft_claims
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;

