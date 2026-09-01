BEGIN;

ALTER TABLE app.model_invocations
  ADD COLUMN input_safety_policy_version text
  CHECK (
    input_safety_policy_version IS NULL OR
    input_safety_policy_version = 'model-input-safety-v1'
  );

COMMENT ON COLUMN app.model_invocations.input_safety_policy_version IS
  'Version of the fail-closed metadata-only input safety scan. NULL means a historical invocation predates this gate; it must not be backfilled without evidence.';

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
     NEW.input_safety_policy_version IS DISTINCT FROM OLD.input_safety_policy_version OR
     NEW.input_sha256 IS DISTINCT FROM OLD.input_sha256 OR
     NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'model invocation identity and governance metadata are immutable';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
