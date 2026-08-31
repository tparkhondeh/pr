BEGIN;

CREATE TABLE app.feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  artifact_type text NOT NULL,
  artifact_id text NOT NULL,
  event_type text NOT NULL
    CHECK (event_type IN ('accepted', 'rejected', 'edited', 'regret', 'energy_report')),
  signal_key text,
  signal_value jsonb,
  satisfaction smallint CHECK (satisfaction IS NULL OR satisfaction BETWEEN 1 AND 5),
  regret smallint CHECK (regret IS NULL OR regret BETWEEN 1 AND 5),
  energy smallint CHECK (energy IS NULL OR energy BETWEEN 1 AND 5),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK ((signal_key IS NULL) = (signal_value IS NULL)),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.preference_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  preference_key text NOT NULL,
  proposed_value jsonb NOT NULL,
  evidence_event_ids uuid[] NOT NULL,
  rationale text NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'applied', 'rejected', 'revoked')),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, decided_by)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE INDEX feedback_tenant_user_signal_idx
  ON app.feedback_events (tenant_id, user_id, signal_key, occurred_at DESC);
CREATE INDEX preference_proposals_pending_idx
  ON app.preference_proposals (tenant_id, user_id, status, proposed_at DESC);

ALTER TABLE app.feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.preference_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.feedback_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app.preference_proposals FORCE ROW LEVEL SECURITY;

CREATE POLICY feedback_events_tenant_isolation ON app.feedback_events
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY preference_proposals_tenant_isolation ON app.preference_proposals
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;

