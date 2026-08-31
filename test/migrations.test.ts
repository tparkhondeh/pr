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
});
