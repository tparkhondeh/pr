BEGIN;

ALTER TABLE app.draft_artifacts
  ADD COLUMN source_kind text NOT NULL DEFAULT 'memory'
    CHECK (source_kind IN ('memory', 'text_asset'));

ALTER TABLE app.workbench_states
  ADD COLUMN approved_evidence_ids text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX draft_artifacts_source_idx
  ON app.draft_artifacts (tenant_id, owner_user_id, source_kind, source_proposal_ref)
  WHERE owner_user_id IS NOT NULL AND source_proposal_ref IS NOT NULL;

COMMIT;
