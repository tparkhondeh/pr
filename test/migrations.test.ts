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
});
