BEGIN;

CREATE TABLE app.strategic_recommendation_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  action_ref text NOT NULL CHECK (char_length(action_ref) BETWEEN 1 AND 120),
  action_title text NOT NULL CHECK (char_length(action_title) BETWEEN 1 AND 300),
  action_kind text NOT NULL CHECK (action_kind IN (
    'no_action', 'private_conversation', 'relationship', 'content', 'media', 'event', 'research'
  )),
  action_rank integer NOT NULL CHECK (action_rank >= 1),
  decision text NOT NULL CHECK (decision IN ('accepted', 'rejected', 'needs_revision')),
  usefulness smallint NOT NULL CHECK (usefulness BETWEEN 1 AND 5),
  trust smallint NOT NULL CHECK (trust BETWEEN 1 AND 5),
  friction smallint NOT NULL CHECK (friction BETWEEN 1 AND 5),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  strategy_revision bigint NOT NULL CHECK (strategy_revision >= 1),
  decision_context_revision bigint NOT NULL CHECK (decision_context_revision >= 1),
  decision_context_sha256 text NOT NULL CHECK (decision_context_sha256 ~ '^[0-9a-f]{64}$'),
  decision_window_ends_at timestamptz NOT NULL,
  reviewed_at timestamptz NOT NULL,
  supersedes_review_id uuid,
  CHECK (decision_window_ends_at > reviewed_at),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, supersedes_review_id)
    REFERENCES app.strategic_recommendation_reviews(tenant_id, id)
);

CREATE TABLE app.strategic_review_requests (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  request_id text NOT NULL CHECK (request_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  review_id uuid,
  requested_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, owner_user_id, request_id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, review_id)
    REFERENCES app.strategic_recommendation_reviews(tenant_id, id)
);

CREATE INDEX strategic_reviews_owner_time_idx
  ON app.strategic_recommendation_reviews (tenant_id, owner_user_id, reviewed_at DESC);

CREATE INDEX strategic_reviews_context_idx
  ON app.strategic_recommendation_reviews (
    tenant_id, owner_user_id, strategy_revision, decision_context_revision,
    decision_context_sha256, action_ref, reviewed_at DESC
  );

ALTER TABLE app.strategic_recommendation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.strategic_recommendation_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE app.strategic_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.strategic_review_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY strategic_recommendation_reviews_tenant_isolation
  ON app.strategic_recommendation_reviews
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY strategic_review_requests_tenant_isolation
  ON app.strategic_review_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE app.strategic_recommendation_reviews IS
  'Append-only owner reviews bound to the exact strategy, decision context and decision window. Baselines remain provisional until the policy minimum sample size is reached.';

COMMIT;
