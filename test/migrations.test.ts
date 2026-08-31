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
});
