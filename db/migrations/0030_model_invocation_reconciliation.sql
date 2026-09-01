BEGIN;

ALTER TABLE app.model_invocations
  ADD COLUMN reconciliation_policy_version text
    CHECK (
      reconciliation_policy_version IS NULL OR
      reconciliation_policy_version = 'model-invocation-reconciliation-v1'
    ),
  ADD COLUMN reconciliation_request_id text
    CHECK (
      reconciliation_request_id IS NULL OR
      reconciliation_request_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$'
    ),
  ADD COLUMN reconciliation_evidence_sha256 text
    CHECK (
      reconciliation_evidence_sha256 IS NULL OR
      reconciliation_evidence_sha256 ~ '^[0-9a-f]{64}$'
    );

ALTER TABLE app.model_invocations
  DROP CONSTRAINT model_invocations_status_check,
  ADD CONSTRAINT model_invocations_status_check CHECK (status IN (
    'started', 'succeeded', 'cost_blocked', 'provider_failed',
    'timed_out', 'usage_invalid', 'output_invalid',
    'reconciled_not_executed', 'reconciled_billed_output_unavailable'
  ));

DO $migration$
DECLARE
  terminal_shape_constraint record;
  matched_constraint_count integer := 0;
BEGIN
  FOR terminal_shape_constraint IN
    SELECT constraint_definition.conname
    FROM pg_constraint AS constraint_definition
    JOIN pg_class AS constrained_table
      ON constrained_table.oid = constraint_definition.conrelid
    JOIN pg_namespace AS constrained_schema
      ON constrained_schema.oid = constrained_table.relnamespace
    WHERE constrained_schema.nspname = 'app'
      AND constrained_table.relname = 'model_invocations'
      AND constraint_definition.contype = 'c'
      AND position('cost_blocked' IN pg_get_constraintdef(constraint_definition.oid)) > 0
      AND position('provider_failed' IN pg_get_constraintdef(constraint_definition.oid)) > 0
      AND position('output_invalid' IN pg_get_constraintdef(constraint_definition.oid)) > 0
      AND position('reservation_id' IN pg_get_constraintdef(constraint_definition.oid)) > 0
  LOOP
    matched_constraint_count := matched_constraint_count + 1;
    EXECUTE format(
      'ALTER TABLE app.model_invocations DROP CONSTRAINT %I',
      terminal_shape_constraint.conname
    );
  END LOOP;

  IF matched_constraint_count <> 1 THEN
    RAISE EXCEPTION
      'expected exactly one legacy model invocation terminal-shape constraint, found %',
      matched_constraint_count;
  END IF;
END;
$migration$;

ALTER TABLE app.model_invocations
  ADD CONSTRAINT model_invocations_terminal_shape_check CHECK (
    (status = 'started' AND
      reconciliation_policy_version IS NULL AND
      reconciliation_request_id IS NULL AND
      reconciliation_evidence_sha256 IS NULL) OR
    (status = 'cost_blocked' AND reservation_id IS NOT NULL AND charge_id IS NULL AND
      provider_trace_id IS NULL AND input_tokens IS NULL AND output_tokens IS NULL AND
      cached_input_tokens IS NULL AND cost_minor_units IS NULL AND cost_evidence IS NULL AND
      output_sha256 IS NULL AND reconciliation_policy_version IS NULL AND
      reconciliation_request_id IS NULL AND reconciliation_evidence_sha256 IS NULL) OR
    (status IN ('provider_failed', 'timed_out', 'usage_invalid') AND
      reservation_id IS NOT NULL AND charge_id IS NOT NULL AND
      input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND
      cached_input_tokens IS NOT NULL AND cost_minor_units IS NOT NULL AND
      cost_evidence IS NOT NULL AND reconciliation_policy_version IS NULL AND
      reconciliation_request_id IS NULL AND reconciliation_evidence_sha256 IS NULL) OR
    (status IN ('succeeded', 'output_invalid') AND
      reservation_id IS NOT NULL AND charge_id IS NOT NULL AND
      input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND
      cached_input_tokens IS NOT NULL AND cost_minor_units IS NOT NULL AND
      cost_evidence IS NOT NULL AND output_sha256 IS NOT NULL AND
      reconciliation_policy_version IS NULL AND reconciliation_request_id IS NULL AND
      reconciliation_evidence_sha256 IS NULL) OR
    (status = 'reconciled_not_executed' AND
      provider_trace_id IS NULL AND output_sha256 IS NULL AND
      reconciliation_policy_version = 'model-invocation-reconciliation-v1' AND
      reconciliation_request_id IS NOT NULL AND reconciliation_evidence_sha256 IS NOT NULL AND
      (
        (charge_id IS NULL AND input_tokens IS NULL AND output_tokens IS NULL AND
          cached_input_tokens IS NULL AND cost_minor_units IS NULL AND cost_evidence IS NULL) OR
        (reservation_id IS NOT NULL AND charge_id IS NOT NULL AND input_tokens = 0 AND
          output_tokens = 0 AND cached_input_tokens = 0 AND cost_minor_units = 0 AND
          cost_evidence = 'none')
      )) OR
    (status = 'reconciled_billed_output_unavailable' AND
      reservation_id IS NOT NULL AND charge_id IS NOT NULL AND provider_trace_id IS NOT NULL AND
      input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND
      cached_input_tokens IS NOT NULL AND cost_minor_units IS NOT NULL AND
      cost_evidence = 'provider_reported' AND output_sha256 IS NULL AND
      reconciliation_policy_version = 'model-invocation-reconciliation-v1' AND
      reconciliation_request_id IS NOT NULL AND reconciliation_evidence_sha256 IS NOT NULL)
  );

COMMENT ON COLUMN app.model_invocations.reconciliation_policy_version IS
  'Versioned human-in-the-loop recovery policy. NULL means the invocation was not reconciled.';
COMMENT ON COLUMN app.model_invocations.reconciliation_request_id IS
  'Idempotency key for the owner-confirmed recovery decision.';
COMMENT ON COLUMN app.model_invocations.reconciliation_evidence_sha256 IS
  'Hash-only reference to provider or billing evidence. Raw evidence is intentionally excluded.';

COMMIT;
