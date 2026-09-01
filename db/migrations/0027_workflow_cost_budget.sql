BEGIN;

CREATE TABLE app.workflow_cost_budget_locks (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  budget_day date NOT NULL,
  touched_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, owner_user_id, budget_day),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id)
);

CREATE TABLE app.workflow_cost_reservations (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  request_id text NOT NULL CHECK (request_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  workflow_id text NOT NULL CHECK (char_length(workflow_id) BETWEEN 3 AND 120),
  invocation_id text NOT NULL CHECK (char_length(invocation_id) BETWEEN 3 AND 120),
  workflow_kind text NOT NULL CHECK (workflow_kind IN (
    'strategy_recommendation', 'draft_generation', 'research',
    'platform_adaptation', 'evaluation', 'other'
  )),
  estimated_cost_minor_units integer NOT NULL CHECK (
    estimated_cost_minor_units BETWEEN 0 AND 1000000
  ),
  planned_steps integer NOT NULL CHECK (planned_steps BETWEEN 0 AND 1000),
  decision text NOT NULL CHECK (decision IN ('allowed', 'blocked')),
  reason text CHECK (reason IS NULL OR reason IN (
    'invocation_budget_exceeded', 'workflow_budget_exceeded',
    'daily_budget_exceeded', 'workflow_invocation_limit_exceeded',
    'workflow_step_limit_exceeded', 'workflow_circuit_open',
    'actual_cost_exceeded_reservation', 'actual_steps_exceeded_reservation'
  )),
  reserved_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, request_id),
  UNIQUE (tenant_id, owner_user_id, workflow_id, invocation_id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  CHECK (
    (decision = 'allowed' AND reason IS NULL) OR
    (decision = 'blocked' AND reason IS NOT NULL)
  )
);

CREATE TABLE app.workflow_cost_charges (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  request_id text NOT NULL CHECK (request_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  reservation_id uuid NOT NULL,
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 120),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  input_tokens bigint NOT NULL CHECK (input_tokens BETWEEN 0 AND 1000000000),
  output_tokens bigint NOT NULL CHECK (output_tokens BETWEEN 0 AND 1000000000),
  cached_input_tokens bigint NOT NULL CHECK (
    cached_input_tokens BETWEEN 0 AND input_tokens
  ),
  model_minor_units integer NOT NULL CHECK (model_minor_units BETWEEN 0 AND 1000000),
  embedding_minor_units integer NOT NULL CHECK (embedding_minor_units BETWEEN 0 AND 1000000),
  storage_minor_units integer NOT NULL CHECK (storage_minor_units BETWEEN 0 AND 1000000),
  search_minor_units integer NOT NULL CHECK (search_minor_units BETWEEN 0 AND 1000000),
  tool_api_minor_units integer NOT NULL CHECK (tool_api_minor_units BETWEEN 0 AND 1000000),
  compute_minor_units integer NOT NULL CHECK (compute_minor_units BETWEEN 0 AND 1000000),
  actual_cost_minor_units integer NOT NULL CHECK (actual_cost_minor_units BETWEEN 0 AND 6000000),
  actual_steps integer NOT NULL CHECK (actual_steps BETWEEN 0 AND 1000),
  human_review_seconds integer NOT NULL CHECK (human_review_seconds BETWEEN 0 AND 86400),
  cost_evidence text NOT NULL CHECK (cost_evidence IN ('provider_reported', 'estimated', 'none')),
  circuit_opened boolean NOT NULL,
  circuit_reason text CHECK (circuit_reason IS NULL OR circuit_reason IN (
    'invocation_budget_exceeded', 'workflow_budget_exceeded',
    'daily_budget_exceeded', 'workflow_invocation_limit_exceeded',
    'workflow_step_limit_exceeded', 'workflow_circuit_open',
    'actual_cost_exceeded_reservation', 'actual_steps_exceeded_reservation'
  )),
  charged_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, request_id),
  UNIQUE (tenant_id, reservation_id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, reservation_id)
    REFERENCES app.workflow_cost_reservations(tenant_id, id),
  CHECK (actual_cost_minor_units =
    model_minor_units + embedding_minor_units + storage_minor_units +
    search_minor_units + tool_api_minor_units + compute_minor_units
  ),
  CHECK (cost_evidence <> 'none' OR actual_cost_minor_units = 0),
  CHECK (
    (circuit_opened AND circuit_reason IS NOT NULL) OR
    (NOT circuit_opened AND circuit_reason IS NULL)
  )
);

CREATE INDEX workflow_cost_reservations_owner_day_idx
  ON app.workflow_cost_reservations (tenant_id, owner_user_id, reserved_at DESC);
CREATE INDEX workflow_cost_reservations_workflow_idx
  ON app.workflow_cost_reservations (tenant_id, owner_user_id, workflow_id, reserved_at DESC);
CREATE INDEX workflow_cost_charges_owner_day_idx
  ON app.workflow_cost_charges (tenant_id, owner_user_id, charged_at DESC);

ALTER TABLE app.workflow_cost_budget_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workflow_cost_budget_locks FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workflow_cost_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workflow_cost_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workflow_cost_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workflow_cost_charges FORCE ROW LEVEL SECURITY;

CREATE POLICY workflow_cost_budget_locks_tenant_isolation
  ON app.workflow_cost_budget_locks
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY workflow_cost_reservations_tenant_isolation
  ON app.workflow_cost_reservations
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY workflow_cost_charges_tenant_isolation
  ON app.workflow_cost_charges
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE app.workflow_cost_reservations IS
  'Append-only preflight decisions. Allowed reservations consume budget before execution; blocked reservations prove the circuit breaker acted before spend.';
COMMENT ON TABLE app.workflow_cost_charges IS
  'Append-only actual workflow usage split by model, embedding, storage, search, tool/API, compute, and human review. Unknown cost is stored as unmetered zero, never invented.';

COMMIT;
