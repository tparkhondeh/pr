BEGIN;

CREATE TYPE app.positioning_layer AS ENUM (
  'evidence_backed_self',
  'current_perception',
  'desired_positioning'
);

CREATE TABLE app.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 240),
  outcome text NOT NULL CHECK (length(outcome) BETWEEN 3 AND 2000),
  priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 5),
  horizon_start date,
  horizon_end date,
  success_metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'paused', 'achieved', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (horizon_end IS NULL OR horizon_start IS NULL OR horizon_end >= horizon_start),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.positioning_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL,
  layer app.positioning_layer NOT NULL,
  horizon text,
  dimensions jsonb NOT NULL,
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  FOREIGN KEY (tenant_id, subject_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.action_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL,
  objective text NOT NULL,
  stakeholder_refs text[] NOT NULL DEFAULT '{}',
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'rejected', 'expired', 'superseded')),
  UNIQUE (tenant_id, id),
  CHECK (expires_at > generated_at),
  FOREIGN KEY (tenant_id, goal_id)
    REFERENCES app.goals(tenant_id, id)
);

CREATE TABLE app.action_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  rationale text NOT NULL,
  evidence_ids uuid[] NOT NULL,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  prerequisites jsonb NOT NULL DEFAULT '[]'::jsonb,
  scores jsonb NOT NULL,
  attention_cost_minutes integer NOT NULL CHECK (attention_cost_minutes >= 0),
  energy_cost smallint NOT NULL CHECK (energy_cost BETWEEN 1 AND 5),
  utility_score numeric(8,3) NOT NULL,
  opportunity_cost numeric(8,3) NOT NULL CHECK (opportunity_cost >= 0),
  rank integer NOT NULL CHECK (rank >= 1),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, recommendation_id, rank),
  FOREIGN KEY (tenant_id, recommendation_id)
    REFERENCES app.action_recommendations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX goals_tenant_status_idx ON app.goals (tenant_id, status, priority DESC);
CREATE INDEX positioning_tenant_layer_idx
  ON app.positioning_snapshots (tenant_id, subject_user_id, layer, valid_from DESC);
CREATE INDEX recommendations_tenant_goal_idx
  ON app.action_recommendations (tenant_id, goal_id, generated_at DESC);

ALTER TABLE app.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.positioning_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.action_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.action_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.goals FORCE ROW LEVEL SECURITY;
ALTER TABLE app.positioning_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE app.action_recommendations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.action_options FORCE ROW LEVEL SECURITY;

CREATE POLICY goals_tenant_isolation ON app.goals
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY positioning_snapshots_tenant_isolation ON app.positioning_snapshots
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY action_recommendations_tenant_isolation ON app.action_recommendations
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY action_options_tenant_isolation ON app.action_options
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMIT;

