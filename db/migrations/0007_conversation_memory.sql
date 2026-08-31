BEGIN;

CREATE TABLE app.conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  external_ref text NOT NULL CHECK (length(external_ref) BETWEEN 3 AND 64),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, external_ref),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.conversation_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  client_ref text NOT NULL CHECK (length(client_ref) BETWEEN 3 AND 48),
  user_text text NOT NULL CHECK (length(user_text) BETWEEN 3 AND 5000),
  assistant_question text NOT NULL CHECK (length(assistant_question) BETWEEN 3 AND 1000),
  propose_memory boolean NOT NULL DEFAULT false,
  data_class app.data_class NOT NULL DEFAULT 'confidential',
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, actor_user_id, client_ref),
  FOREIGN KEY (tenant_id, thread_id)
    REFERENCES app.conversation_threads(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.memory_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,
  external_ref text NOT NULL CHECK (length(external_ref) BETWEEN 3 AND 64),
  predicate text NOT NULL,
  value jsonb NOT NULL,
  epistemic_type app.epistemic_type NOT NULL DEFAULT 'self_report',
  data_class app.data_class NOT NULL DEFAULT 'confidential',
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  confidence_rationale text NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'confirmed', 'rejected', 'expired')),
  permissions jsonb,
  evidence_id uuid,
  assertion_id uuid,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, external_ref),
  CHECK (
    (status = 'confirmed' AND permissions IS NOT NULL AND evidence_id IS NOT NULL
      AND assertion_id IS NOT NULL AND confirmed_at IS NOT NULL)
    OR
    (status <> 'confirmed' AND permissions IS NULL AND evidence_id IS NULL
      AND assertion_id IS NULL AND confirmed_at IS NULL)
  ),
  FOREIGN KEY (tenant_id, turn_id)
    REFERENCES app.conversation_turns(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, subject_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES app.evidence_items(tenant_id, id),
  FOREIGN KEY (tenant_id, assertion_id)
    REFERENCES app.assertions(tenant_id, id)
);

CREATE INDEX conversation_turns_tenant_time_idx
  ON app.conversation_turns (tenant_id, actor_user_id, occurred_at DESC);
CREATE INDEX memory_proposals_pending_idx
  ON app.memory_proposals (tenant_id, subject_user_id, status, proposed_at DESC);

ALTER TABLE app.conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversation_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.memory_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversation_threads FORCE ROW LEVEL SECURITY;
ALTER TABLE app.conversation_turns FORCE ROW LEVEL SECURITY;
ALTER TABLE app.memory_proposals FORCE ROW LEVEL SECURITY;

CREATE POLICY conversation_threads_tenant_isolation ON app.conversation_threads
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY conversation_turns_tenant_isolation ON app.conversation_turns
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY memory_proposals_tenant_isolation ON app.memory_proposals
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;
