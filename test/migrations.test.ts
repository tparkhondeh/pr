import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertAppendOnlyMigrations,
  defineMigration,
} from '../src/kernel/migrations.js';

const migrationPath = fileURLToPath(
  new URL('../db/migrations/0001_foundation.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');
const classificationMigrationPath = fileURLToPath(
  new URL('../db/migrations/0002_assertion_data_class.sql', import.meta.url),
);
const classificationSql = readFileSync(classificationMigrationPath, 'utf8');
const strategyMigrationPath = fileURLToPath(
  new URL('../db/migrations/0003_strategy_loop.sql', import.meta.url),
);
const strategySql = readFileSync(strategyMigrationPath, 'utf8');
const claimMigrationPath = fileURLToPath(
  new URL('../db/migrations/0004_claim_registry.sql', import.meta.url),
);
const claimSql = readFileSync(claimMigrationPath, 'utf8');
const feedbackMigrationPath = fileURLToPath(
  new URL('../db/migrations/0005_feedback_learning.sql', import.meta.url),
);
const feedbackSql = readFileSync(feedbackMigrationPath, 'utf8');
const workbenchMigrationPath = fileURLToPath(
  new URL('../db/migrations/0006_workbench_state.sql', import.meta.url),
);
const workbenchSql = readFileSync(workbenchMigrationPath, 'utf8');
const conversationMigrationPath = fileURLToPath(
  new URL('../db/migrations/0007_conversation_memory.sql', import.meta.url),
);
const conversationSql = readFileSync(conversationMigrationPath, 'utf8');
const memoryRightsMigrationPath = fileURLToPath(
  new URL('../db/migrations/0008_memory_rights.sql', import.meta.url),
);
const memoryRightsSql = readFileSync(memoryRightsMigrationPath, 'utf8');
const strategyContextMigrationPath = fileURLToPath(
  new URL('../db/migrations/0009_strategy_context.sql', import.meta.url),
);
const strategyContextSql = readFileSync(strategyContextMigrationPath, 'utf8');
const draftWorkspaceMigrationPath = fileURLToPath(
  new URL('../db/migrations/0010_draft_workspace.sql', import.meta.url),
);
const draftWorkspaceSql = readFileSync(draftWorkspaceMigrationPath, 'utf8');
const feedbackWorkspaceMigrationPath = fileURLToPath(
  new URL('../db/migrations/0011_feedback_workspace.sql', import.meta.url),
);
const feedbackWorkspaceSql = readFileSync(feedbackWorkspaceMigrationPath, 'utf8');
const textAssetMigrationPath = fileURLToPath(
  new URL('../db/migrations/0012_text_asset_intake.sql', import.meta.url),
);
const textAssetSql = readFileSync(textAssetMigrationPath, 'utf8');
const draftSourceMigrationPath = fileURLToPath(
  new URL('../db/migrations/0013_draft_source_provenance.sql', import.meta.url),
);
const draftSourceSql = readFileSync(draftSourceMigrationPath, 'utf8');
const assetRightsMigrationPath = fileURLToPath(
  new URL('../db/migrations/0014_text_asset_rights.sql', import.meta.url),
);
const assetRightsSql = readFileSync(assetRightsMigrationPath, 'utf8');
const platformAdaptationMigrationPath = fileURLToPath(
  new URL('../db/migrations/0015_platform_adaptation_profile.sql', import.meta.url),
);
const platformAdaptationSql = readFileSync(platformAdaptationMigrationPath, 'utf8');
const researchWorkspaceMigrationPath = fileURLToPath(
  new URL('../db/migrations/0016_research_workspace.sql', import.meta.url),
);
const researchWorkspaceSql = readFileSync(researchWorkspaceMigrationPath, 'utf8');
const claimReviewMigrationPath = fileURLToPath(
  new URL('../db/migrations/0017_claim_review_lifecycle.sql', import.meta.url),
);
const claimReviewSql = readFileSync(claimReviewMigrationPath, 'utf8');

describe('foundation migration', () => {
  it('is transactional and receives a stable checksum', () => {
    const migration = defineMigration('0001_foundation', sql);
    expect(migration.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('defines the required tenant-owned tables', () => {
    for (const table of [
      'memberships',
      'assets',
      'evidence_items',
      'assertions',
      'assertion_evidence',
      'consent_grants',
      'audit_events',
      'outbox_events',
    ]) {
      expect(sql).toContain(`CREATE TABLE app.${table}`);
      expect(sql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
  });

  it('makes audit events append-only', () => {
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON app.audit_events');
    expect(sql).toContain("RAISE EXCEPTION 'audit events are append-only'");
  });

  it('rejects edits to an applied migration', () => {
    const migration = defineMigration('0001_foundation', sql);
    expect(() => {
      assertAppendOnlyMigrations(
        new Map([[migration.id, '0'.repeat(64)]]),
        [migration],
      );
    }).toThrow('Applied migration changed');
  });

  it('adds assertion classification in an append-only migration', () => {
    const migration = defineMigration(
      '0002_assertion_data_class',
      classificationSql,
    );
    expect(migration.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(classificationSql).toContain(
      "ADD COLUMN data_class app.data_class NOT NULL DEFAULT 'confidential'",
    );
  });

  it('adds tenant-isolated strategy tables', () => {
    defineMigration('0003_strategy_loop', strategySql);
    for (const table of [
      'goals',
      'positioning_snapshots',
      'action_recommendations',
      'action_options',
    ]) {
      expect(strategySql).toContain(`CREATE TABLE app.${table}`);
      expect(strategySql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(strategySql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
  });

  it('adds tenant-isolated claim and draft tables', () => {
    defineMigration('0004_claim_registry', claimSql);
    for (const table of ['claims', 'claim_evidence', 'draft_artifacts', 'draft_claims']) {
      expect(claimSql).toContain(`CREATE TABLE app.${table}`);
      expect(claimSql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(claimSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
  });

  it('adds tenant-isolated feedback learning tables', () => {
    defineMigration('0005_feedback_learning', feedbackSql);
    for (const table of ['feedback_events', 'preference_proposals']) {
      expect(feedbackSql).toContain(`CREATE TABLE app.${table}`);
      expect(feedbackSql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
      expect(feedbackSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
  });

  it('adds tenant-isolated, optimistic workbench state', () => {
    defineMigration('0006_workbench_state', workbenchSql);
    expect(workbenchSql).toContain('CREATE TABLE app.workbench_states');
    expect(workbenchSql).toContain(
      'ALTER TABLE app.workbench_states FORCE ROW LEVEL SECURITY',
    );
    expect(workbenchSql).toContain('CREATE POLICY workbench_states_tenant_isolation');
    expect(workbenchSql).toContain('revision bigint NOT NULL');
    expect(workbenchSql).toContain(
      "status NOT IN ('approved', 'running', 'completed', 'failed')",
    );
  });

  it('adds tenant-isolated conversation and consent-first memory staging', () => {
    defineMigration('0007_conversation_memory', conversationSql);
    for (const table of [
      'conversation_threads',
      'conversation_turns',
      'memory_proposals',
    ]) {
      expect(conversationSql).toContain(`CREATE TABLE app.${table}`);
      expect(conversationSql).toContain(
        `ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`,
      );
      expect(conversationSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(conversationSql).toContain("status = 'confirmed' AND permissions IS NOT NULL");
    expect(conversationSql).toContain('content_sha256 text NOT NULL');
  });

  it('adds auditable, idempotent and tenant-isolated memory rights', () => {
    defineMigration('0008_memory_rights', memoryRightsSql);
    expect(memoryRightsSql).toContain('CREATE TABLE app.memory_rights_requests');
    expect(memoryRightsSql).toContain(
      'ALTER TABLE app.memory_rights_requests FORCE ROW LEVEL SECURITY',
    );
    expect(memoryRightsSql).toContain(
      'CREATE POLICY memory_rights_requests_tenant_isolation',
    );
    expect(memoryRightsSql).toContain("operation IN ('correct', 'contest', 'delete', 'revoke')");
    expect(memoryRightsSql).toContain('UNIQUE (tenant_id, subject_user_id, client_ref)');
    expect(memoryRightsSql).toContain('active_assertion_id uuid');
    expect(memoryRightsSql).toContain('deleted_at timestamptz');
    expect(memoryRightsSql).toContain('resource_type text');
    expect(memoryRightsSql).toContain('revoked_legacy_memory_consent');
    expect(memoryRightsSql).toContain("'consent.scope_migrated'");
    expect(memoryRightsSql.indexOf('SET active_assertion_id = assertion_id')).toBeLessThan(
      memoryRightsSql.indexOf('memory_proposals_confirmed_active_assertion'),
    );
  });

  it('adds versioned owner strategy context and binds approvals to its revision', () => {
    defineMigration('0009_strategy_context', strategyContextSql);
    for (const table of ['strategy_context_states', 'strategy_context_requests']) {
      expect(strategyContextSql).toContain(`CREATE TABLE app.${table}`);
      expect(strategyContextSql).toContain(
        `ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`,
      );
      expect(strategyContextSql).toContain(`CREATE POLICY ${table}_tenant_isolation`);
    }
    expect(strategyContextSql).toContain('current_goal_id uuid NOT NULL');
    expect(strategyContextSql).toContain('current_positioning_id uuid NOT NULL');
    expect(strategyContextSql).toContain('result_snapshot jsonb');
    expect(strategyContextSql).toContain('ADD COLUMN strategy_revision bigint NOT NULL');
  });

  it('adds an auditable and idempotent owner draft workspace', () => {
    defineMigration('0010_draft_workspace', draftWorkspaceSql);
    expect(draftWorkspaceSql).toContain('CREATE TABLE app.draft_workspace_requests');
    expect(draftWorkspaceSql).toContain(
      'ALTER TABLE app.draft_workspace_requests FORCE ROW LEVEL SECURITY',
    );
    expect(draftWorkspaceSql).toContain('ADD COLUMN source_assertion_id uuid');
    expect(draftWorkspaceSql).toContain('ADD COLUMN strategy_revision bigint');
    expect(draftWorkspaceSql).toContain('ADD COLUMN revision bigint NOT NULL DEFAULT 1');
    expect(draftWorkspaceSql).toContain("operation IN ('create', 'edit', 'approve', 'export')");
  });

  it('adds idempotent tenant-isolated feedback requests and active preference protection', () => {
    defineMigration('0011_feedback_workspace', feedbackWorkspaceSql);
    expect(feedbackWorkspaceSql).toContain('CREATE TABLE app.feedback_learning_requests');
    expect(feedbackWorkspaceSql).toContain(
      'ALTER TABLE app.feedback_learning_requests FORCE ROW LEVEL SECURITY',
    );
    expect(feedbackWorkspaceSql).toContain('CREATE POLICY feedback_learning_requests_tenant_isolation');
    expect(feedbackWorkspaceSql).toContain("operation IN ('edited', 'rejected', 'decide')");
    expect(feedbackWorkspaceSql).toContain('preference_proposals_one_active_value_idx');
  });

  it('adds idempotent tenant-isolated text asset intake requests', () => {
    defineMigration('0012_text_asset_intake', textAssetSql);
    expect(textAssetSql).toContain('CREATE TABLE app.asset_intake_requests');
    expect(textAssetSql).toContain(
      'ALTER TABLE app.asset_intake_requests FORCE ROW LEVEL SECURITY',
    );
    expect(textAssetSql).toContain('CREATE POLICY asset_intake_requests_tenant_isolation');
    expect(textAssetSql).toContain('UNIQUE (tenant_id, owner_user_id, client_ref)');
    expect(textAssetSql).toContain('request_sha256 text NOT NULL');
    expect(textAssetSql).toContain('result_snapshot jsonb NOT NULL');
  });

  it('records whether a draft source is memory or a text asset', () => {
    defineMigration('0013_draft_source_provenance', draftSourceSql);
    expect(draftSourceSql).toContain('ADD COLUMN source_kind text NOT NULL');
    expect(draftSourceSql).toContain("source_kind IN ('memory', 'text_asset')");
    expect(draftSourceSql).toContain('ADD COLUMN approved_evidence_ids text[] NOT NULL');
    expect(draftSourceSql).toContain('CREATE INDEX draft_artifacts_source_idx');
  });

  it('adds idempotent tenant-isolated text asset rights requests', () => {
    defineMigration('0014_text_asset_rights', assetRightsSql);
    expect(assetRightsSql).toContain('CREATE TABLE app.asset_rights_requests');
    expect(assetRightsSql).toContain("operation IN ('revoke_brand_usage', 'delete')");
    expect(assetRightsSql).toContain('UNIQUE (tenant_id, owner_user_id, client_ref)');
    expect(assetRightsSql).toContain('ALTER TABLE app.asset_rights_requests FORCE ROW LEVEL SECURITY');
    expect(assetRightsSql).toContain('CREATE POLICY asset_rights_requests_tenant_isolation');
  });

  it('freezes the platform adaptation contract used by each draft', () => {
    defineMigration('0015_platform_adaptation_profile', platformAdaptationSql);
    expect(platformAdaptationSql).toContain('ADD COLUMN adaptation_profile_version text NOT NULL');
    expect(platformAdaptationSql).toContain("adaptation_profile_version = 'platform-adaptation-v1'");
  });

  it('keeps external research in a dedicated tenant-isolated workspace', () => {
    defineMigration('0016_research_workspace', researchWorkspaceSql);
    expect(researchWorkspaceSql).toContain('CREATE TABLE app.research_sources');
    expect(researchWorkspaceSql).toContain("quality IN ('primary', 'authoritative_secondary', 'secondary', 'unverified')");
    expect(researchWorkspaceSql).toContain("stance IN ('supports', 'contradicts')");
    expect(researchWorkspaceSql).toContain('ALTER TABLE app.research_sources FORCE ROW LEVEL SECURITY');
    expect(researchWorkspaceSql).toContain('CREATE POLICY research_sources_tenant_isolation');
  });

  it('adds an append-only, tenant-isolated human claim review lifecycle', () => {
    defineMigration('0017_claim_review_lifecycle', claimReviewSql);
    expect(claimReviewSql).toContain('CREATE TABLE app.claim_reviews');
    expect(claimReviewSql).toContain("decision IN ('verify', 'dispute', 'revoke')");
    expect(claimReviewSql).toContain('UNIQUE (tenant_id, owner_user_id, client_ref)');
    expect(claimReviewSql).toContain('trace_snapshot jsonb NOT NULL');
    expect(claimReviewSql).toContain('ALTER TABLE app.claim_reviews FORCE ROW LEVEL SECURITY');
    expect(claimReviewSql).toContain('CREATE POLICY claim_reviews_tenant_isolation');
  });
});
