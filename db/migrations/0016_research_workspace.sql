BEGIN;

CREATE TABLE app.research_sources (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  claim_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 300),
  publisher text NOT NULL CHECK (length(publisher) BETWEEN 2 AND 200),
  source_url text NOT NULL CHECK (length(source_url) BETWEEN 10 AND 2048),
  excerpt text NOT NULL CHECK (length(excerpt) BETWEEN 20 AND 4000),
  statement text NOT NULL CHECK (length(statement) BETWEEN 3 AND 4000),
  quality text NOT NULL CHECK (
    quality IN ('primary', 'authoritative_secondary', 'secondary', 'unverified')
  ),
  stance text NOT NULL CHECK (stance IN ('supports', 'contradicts')),
  published_at timestamptz NOT NULL,
  accessed_at timestamptz NOT NULL,
  max_age_days integer NOT NULL CHECK (max_age_days BETWEEN 1 AND 3650),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, client_ref),
  CHECK (published_at <= accessed_at),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, claim_id)
    REFERENCES app.claims(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES app.evidence_items(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX research_sources_owner_accessed_idx
  ON app.research_sources (tenant_id, owner_user_id, accessed_at DESC);
CREATE INDEX research_sources_claim_review_idx
  ON app.research_sources (tenant_id, md5(statement), stance);

ALTER TABLE app.research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.research_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY research_sources_tenant_isolation ON app.research_sources
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
