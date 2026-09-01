BEGIN;

CREATE TABLE app.model_invocations (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  request_id text NOT NULL CHECK (request_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  workflow_id text NOT NULL CHECK (char_length(workflow_id) BETWEEN 3 AND 120),
  invocation_id text NOT NULL CHECK (char_length(invocation_id) BETWEEN 3 AND 120),
  purpose text NOT NULL CHECK (purpose IN (
    'extract_evidence', 'synthesize_hypothesis', 'strategy_options',
    'draft_content', 'evaluate_output'
  )),
  schema_name text NOT NULL CHECK (char_length(schema_name) BETWEEN 1 AND 120),
  registry_entry_id text NOT NULL CHECK (char_length(registry_entry_id) BETWEEN 1 AND 120),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 120),
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 120),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  model_tier text NOT NULL CHECK (model_tier IN ('economy', 'balanced', 'reasoning')),
  data_classes text[] NOT NULL CHECK (
    cardinality(data_classes) BETWEEN 1 AND 4 AND
    data_classes <@ ARRAY['public', 'internal', 'confidential', 'restricted']::text[]
  ),
  external_processing_approved boolean NOT NULL,
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN (
    'started', 'succeeded', 'cost_blocked', 'provider_failed',
    'timed_out', 'usage_invalid', 'output_invalid'
  )),
  status_reason text CHECK (status_reason IS NULL OR char_length(status_reason) BETWEEN 1 AND 200),
  reservation_id uuid,
  charge_id uuid,
  provider_trace_id text CHECK (
    provider_trace_id IS NULL OR char_length(provider_trace_id) BETWEEN 1 AND 200
  ),
  input_tokens bigint CHECK (input_tokens BETWEEN 0 AND 1000000000),
  output_tokens bigint CHECK (output_tokens BETWEEN 0 AND 1000000000),
  cached_input_tokens bigint CHECK (
    cached_input_tokens BETWEEN 0 AND 1000000000 AND
    (input_tokens IS NULL OR cached_input_tokens <= input_tokens)
  ),
  cost_minor_units integer CHECK (cost_minor_units BETWEEN 0 AND 1000000000),
  cost_evidence text CHECK (cost_evidence IN ('provider_reported', 'estimated', 'none')),
  output_sha256 text CHECK (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$'),
  completion_sha256 text CHECK (completion_sha256 IS NULL OR completion_sha256 ~ '^[0-9a-f]{64}$'),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, request_id),
  UNIQUE (tenant_id, owner_user_id, workflow_id, invocation_id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, reservation_id)
    REFERENCES app.workflow_cost_reservations(tenant_id, id),
  FOREIGN KEY (tenant_id, charge_id)
    REFERENCES app.workflow_cost_charges(tenant_id, id),
  CHECK (cost_evidence <> 'none' OR cost_minor_units = 0),
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  CHECK (
    (status = 'started' AND completed_at IS NULL AND completion_sha256 IS NULL AND
      status_reason IS NULL AND reservation_id IS NULL AND charge_id IS NULL AND
      provider_trace_id IS NULL AND input_tokens IS NULL AND output_tokens IS NULL AND
      cached_input_tokens IS NULL AND cost_minor_units IS NULL AND cost_evidence IS NULL AND
      output_sha256 IS NULL) OR
    (status <> 'started' AND completed_at IS NOT NULL AND completion_sha256 IS NOT NULL)
  ),
  CHECK (
    status = 'started' OR
    (status = 'cost_blocked' AND reservation_id IS NOT NULL AND charge_id IS NULL AND
      provider_trace_id IS NULL AND input_tokens IS NULL AND output_tokens IS NULL AND
      cached_input_tokens IS NULL AND cost_minor_units IS NULL AND cost_evidence IS NULL AND
      output_sha256 IS NULL) OR
    (status IN ('provider_failed', 'timed_out', 'usage_invalid') AND
      reservation_id IS NOT NULL AND charge_id IS NOT NULL AND
      input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND
      cached_input_tokens IS NOT NULL AND cost_minor_units IS NOT NULL AND
      cost_evidence IS NOT NULL) OR
    (status IN ('succeeded', 'output_invalid') AND
      reservation_id IS NOT NULL AND charge_id IS NOT NULL AND
      input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND
      cached_input_tokens IS NOT NULL AND cost_minor_units IS NOT NULL AND
      cost_evidence IS NOT NULL AND output_sha256 IS NOT NULL)
  )
);

CREATE INDEX model_invocations_owner_started_idx
  ON app.model_invocations (tenant_id, owner_user_id, started_at DESC);
CREATE INDEX model_invocations_recovery_idx
  ON app.model_invocations (tenant_id, owner_user_id, status, started_at DESC);

ALTER TABLE app.model_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.model_invocations FORCE ROW LEVEL SECURITY;

CREATE POLICY model_invocations_tenant_isolation
  ON app.model_invocations
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE OR REPLACE FUNCTION app.protect_model_invocation_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'model invocation journal entries cannot be deleted';
  END IF;

  IF OLD.status <> 'started' OR NEW.status = 'started' THEN
    RAISE EXCEPTION 'model invocation journal permits one terminal transition only';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR
     NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR
     NEW.request_id IS DISTINCT FROM OLD.request_id OR
     NEW.request_sha256 IS DISTINCT FROM OLD.request_sha256 OR
     NEW.workflow_id IS DISTINCT FROM OLD.workflow_id OR
     NEW.invocation_id IS DISTINCT FROM OLD.invocation_id OR
     NEW.purpose IS DISTINCT FROM OLD.purpose OR
     NEW.schema_name IS DISTINCT FROM OLD.schema_name OR
     NEW.registry_entry_id IS DISTINCT FROM OLD.registry_entry_id OR
     NEW.prompt_version IS DISTINCT FROM OLD.prompt_version OR
     NEW.provider IS DISTINCT FROM OLD.provider OR
     NEW.model IS DISTINCT FROM OLD.model OR
     NEW.model_tier IS DISTINCT FROM OLD.model_tier OR
     NEW.data_classes IS DISTINCT FROM OLD.data_classes OR
     NEW.external_processing_approved IS DISTINCT FROM OLD.external_processing_approved OR
     NEW.input_sha256 IS DISTINCT FROM OLD.input_sha256 OR
     NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'model invocation identity and governance metadata are immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER model_invocations_terminal_transition
BEFORE UPDATE OR DELETE ON app.model_invocations
FOR EACH ROW EXECUTE FUNCTION app.protect_model_invocation_transition();

COMMENT ON TABLE app.model_invocations IS
  'Owner-scoped durable model invocation journal. It stores governance metadata and SHA-256 references only; raw prompt, input, and output content are intentionally excluded.';
COMMENT ON COLUMN app.model_invocations.input_sha256 IS
  'Hash reference only. Raw model input is never stored in this journal.';
COMMENT ON COLUMN app.model_invocations.output_sha256 IS
  'Hash reference only. Raw provider output is never stored in this journal.';

COMMIT;
