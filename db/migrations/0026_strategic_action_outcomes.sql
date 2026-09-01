BEGIN;

CREATE TABLE app.strategic_action_outcomes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  review_id uuid NOT NULL,
  action_ref text NOT NULL CHECK (char_length(action_ref) BETWEEN 1 AND 120),
  action_title text NOT NULL CHECK (char_length(action_title) BETWEEN 1 AND 300),
  execution_status text NOT NULL CHECK (
    execution_status IN ('completed', 'partial', 'not_executed')
  ),
  satisfaction smallint NOT NULL CHECK (satisfaction BETWEEN 1 AND 5),
  regret smallint NOT NULL CHECK (regret BETWEEN 1 AND 5),
  energy smallint NOT NULL CHECK (energy BETWEEN 1 AND 5),
  engagement_quality smallint CHECK (
    engagement_quality IS NULL OR engagement_quality BETWEEN 1 AND 5
  ),
  interaction_depth smallint CHECK (
    interaction_depth IS NULL OR interaction_depth BETWEEN 1 AND 5
  ),
  private_messages integer NOT NULL DEFAULT 0 CHECK (
    private_messages BETWEEN 0 AND 10000
  ),
  opportunities_created integer NOT NULL DEFAULT 0 CHECK (
    opportunities_created BETWEEN 0 AND 10000
  ),
  relationship_change text NOT NULL CHECK (
    relationship_change IN ('positive', 'none', 'negative', 'unknown')
  ),
  media_opportunities integer NOT NULL DEFAULT 0 CHECK (
    media_opportunities BETWEEN 0 AND 10000
  ),
  perception_shift text NOT NULL CHECK (
    perception_shift IN ('positive', 'none', 'negative', 'unknown')
  ),
  business_outcome text NOT NULL CHECK (
    business_outcome IN ('none', 'early_signal', 'material', 'unknown')
  ),
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  outcome_occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  supersedes_outcome_id uuid,
  CHECK (outcome_occurred_at <= recorded_at + interval '5 minutes'),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, review_id)
    REFERENCES app.strategic_recommendation_reviews(tenant_id, id),
  FOREIGN KEY (tenant_id, supersedes_outcome_id)
    REFERENCES app.strategic_action_outcomes(tenant_id, id)
);

CREATE TABLE app.strategic_outcome_requests (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  request_id text NOT NULL CHECK (request_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  outcome_id uuid,
  requested_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, owner_user_id, request_id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, outcome_id)
    REFERENCES app.strategic_action_outcomes(tenant_id, id)
);

CREATE INDEX strategic_outcomes_owner_time_idx
  ON app.strategic_action_outcomes (tenant_id, owner_user_id, recorded_at DESC);

CREATE INDEX strategic_outcomes_review_idx
  ON app.strategic_action_outcomes (
    tenant_id, owner_user_id, review_id, recorded_at DESC
  );

ALTER TABLE app.strategic_action_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.strategic_action_outcomes FORCE ROW LEVEL SECURITY;
ALTER TABLE app.strategic_outcome_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.strategic_outcome_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY strategic_action_outcomes_tenant_isolation
  ON app.strategic_action_outcomes
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY strategic_outcome_requests_tenant_isolation
  ON app.strategic_outcome_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE app.strategic_action_outcomes IS
  'Append-only owner follow-ups for accepted strategic recommendations. Meaningful outcomes remain separate from identity and never authorize external action.';

COMMIT;
