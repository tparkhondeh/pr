BEGIN;

CREATE TABLE app.stakeholder_records (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 120),
  stakeholder_group text NOT NULL CHECK (stakeholder_group IN (
    'client', 'investor', 'peer', 'manager', 'team', 'media', 'journalist',
    'industry_leader', 'community', 'potential_partner', 'critic', 'friend',
    'public', 'policymaker', 'other'
  )),
  desired_outcome text NOT NULL CHECK (length(desired_outcome) BETWEEN 3 AND 240),
  strategic_priority text NOT NULL CHECK (strategic_priority IN ('low', 'medium', 'high')),
  relationship_strength text NOT NULL CHECK (relationship_strength IN ('unknown', 'emerging', 'active', 'trusted')),
  relationship_boundary text NOT NULL CHECK (relationship_boundary IN ('normal', 'ask_before_prompt', 'do_not_prompt')),
  context_note text NOT NULL CHECK (length(context_note) BETWEEN 10 AND 1000),
  last_interaction_at timestamptz,
  consent_confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  CHECK (last_interaction_at IS NULL OR last_interaction_at <= created_at)
);

CREATE UNIQUE INDEX stakeholder_records_owner_label_group_idx
  ON app.stakeholder_records (
    tenant_id, owner_user_id, stakeholder_group,
    lower(regexp_replace(label, '\s+', ' ', 'g'))
  );
CREATE INDEX stakeholder_records_owner_priority_idx
  ON app.stakeholder_records (tenant_id, owner_user_id, strategic_priority, created_at DESC);

CREATE TABLE app.stakeholder_requests (
  tenant_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'delete')),
  client_ref text NOT NULL CHECK (client_ref ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  result_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(result_snapshot) = 'object' AND
    jsonb_typeof(result_snapshot->'stakeholderId') = 'string' AND
    result_snapshot = jsonb_build_object('stakeholderId', result_snapshot->'stakeholderId')
  ),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, owner_user_id, operation, client_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

ALTER TABLE app.stakeholder_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.stakeholder_records FORCE ROW LEVEL SECURITY;
ALTER TABLE app.stakeholder_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.stakeholder_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY stakeholder_records_tenant_isolation ON app.stakeholder_records
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY stakeholder_requests_tenant_isolation ON app.stakeholder_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE app.stakeholder_records IS
  'Confidential owner-entered relationship context for planning only; no contact details, outbound contact, or automation authority.';

COMMIT;
