BEGIN;

ALTER TABLE app.assertions
  ADD COLUMN data_class app.data_class NOT NULL DEFAULT 'confidential';

CREATE INDEX assertions_tenant_class_idx
  ON app.assertions (tenant_id, data_class, created_at DESC);

COMMIT;

