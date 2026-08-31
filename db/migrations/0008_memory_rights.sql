BEGIN;

ALTER TABLE app.assertions
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deletion_reason text,
  ADD CONSTRAINT assertions_deletion_pair
    CHECK ((deleted_at IS NULL) = (deletion_reason IS NULL));

ALTER TABLE app.consent_grants
  ADD COLUMN resource_type text,
  ADD COLUMN resource_id text,
  ADD CONSTRAINT consent_grants_resource_pair
    CHECK ((resource_type IS NULL) = (resource_id IS NULL));

WITH revoked_legacy_memory_consent AS (
  UPDATE app.consent_grants
     SET revoked_at = now(),
         revocation_reason = 'Migrated to assertion-scoped consent; reconfirmation required.'
   WHERE policy_version = 'memory-consent-v1'
     AND resource_type IS NULL
     AND revoked_at IS NULL
  RETURNING tenant_id, id, granted_by, purpose, revoked_at
)
INSERT INTO app.audit_events (
  tenant_id, actor_user_id, event_type, resource_type, resource_id,
  purpose, decision, metadata, occurred_at
)
SELECT tenant_id, granted_by, 'consent.scope_migrated', 'consent_grant', id::text,
       purpose, 'revoked', '{"reason":"consent_scope_migration"}'::jsonb, revoked_at
  FROM revoked_legacy_memory_consent;

ALTER TABLE app.memory_proposals
  ADD COLUMN active_assertion_id uuid,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deletion_reason text,
  ADD CONSTRAINT memory_proposals_deletion_pair
    CHECK ((deleted_at IS NULL) = (deletion_reason IS NULL));

UPDATE app.memory_proposals
   SET active_assertion_id = assertion_id
 WHERE status = 'confirmed';

ALTER TABLE app.memory_proposals
  ADD CONSTRAINT memory_proposals_confirmed_active_assertion
    CHECK (status <> 'confirmed' OR active_assertion_id IS NOT NULL),
  ADD CONSTRAINT memory_proposals_active_assertion_fk
  FOREIGN KEY (tenant_id, active_assertion_id)
    REFERENCES app.assertions(tenant_id, id);

CREATE TABLE app.memory_rights_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (length(client_ref) BETWEEN 3 AND 64),
  operation text NOT NULL CHECK (operation IN ('correct', 'contest', 'delete', 'revoke')),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  requested_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, subject_user_id, client_ref),
  FOREIGN KEY (tenant_id, subject_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, proposal_id)
    REFERENCES app.memory_proposals(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX consent_grants_resource_active_idx
  ON app.consent_grants (tenant_id, resource_type, resource_id)
  WHERE revoked_at IS NULL;

DROP INDEX app.assertions_tenant_subject_idx;
CREATE INDEX assertions_tenant_subject_idx
  ON app.assertions (tenant_id, subject_ref, predicate)
  WHERE contested_at IS NULL AND deleted_at IS NULL AND valid_to IS NULL;

ALTER TABLE app.memory_rights_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.memory_rights_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY memory_rights_requests_tenant_isolation ON app.memory_rights_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
