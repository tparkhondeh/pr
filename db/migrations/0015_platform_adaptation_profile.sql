BEGIN;

ALTER TABLE app.draft_artifacts
  ADD COLUMN adaptation_profile_version text NOT NULL DEFAULT 'platform-adaptation-v1',
  ADD CONSTRAINT draft_artifacts_adaptation_profile_version
    CHECK (adaptation_profile_version = 'platform-adaptation-v1');

COMMENT ON COLUMN app.draft_artifacts.adaptation_profile_version IS
  'Immutable contract used to compose, validate, and explain the platform-specific draft.';

COMMIT;
