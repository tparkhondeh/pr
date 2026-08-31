import { describe, expect, it } from 'vitest';
import type { MigrationConnection } from '../src/database/migration-runner.js';
import { applyMigrations } from '../src/database/migration-runner.js';
import type { SqlQueryResult } from '../src/database/sql.js';
import { defineMigration } from '../src/kernel/migrations.js';

class RecordingConnection implements MigrationConnection {
  public readonly queries: Readonly<{ sql: string; values: readonly unknown[] }>[] = [];

  public constructor(
    private readonly applied: readonly Readonly<{ id: string; sha256: string }>[] = [],
    private readonly failOn?: string,
  ) {}

  public query<Row>(sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    (this.queries as { sql: string; values: readonly unknown[] }[]).push({ sql, values });
    if (this.failOn && sql.includes(this.failOn)) return Promise.reject(new Error('migration failed'));
    if (sql.includes('SELECT id, sha256')) {
      return Promise.resolve({ rows: this.applied as unknown as readonly Row[], rowCount: this.applied.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  }
}

describe('PostgreSQL migration runner', () => {
  it('applies pending migrations with their journal entry in one transaction', async () => {
    const connection = new RecordingConnection();
    const migration = defineMigration('0001_example', 'BEGIN;\nCREATE TABLE example(id int);\nCOMMIT;');
    await expect(applyMigrations(connection, [migration])).resolves.toEqual({
      applied: ['0001_example'],
      alreadyApplied: [],
    });
    expect(connection.queries.map((query) => query.sql.trim())).toEqual(expect.arrayContaining([
      'BEGIN',
      'CREATE TABLE example(id int);',
      'COMMIT',
    ]));
    expect(connection.queries.some((query) => query.sql.includes('INSERT INTO public.pr_schema_migrations'))).toBe(true);
  });

  it('rejects a changed applied migration before executing it', async () => {
    const migration = defineMigration('0001_example', 'BEGIN;\nSELECT 1;\nCOMMIT;');
    const connection = new RecordingConnection([{ id: migration.id, sha256: '0'.repeat(64) }]);
    await expect(applyMigrations(connection, [migration])).rejects.toThrow('Applied migration changed');
  });

  it('rolls back a failed migration and releases the advisory lock', async () => {
    const connection = new RecordingConnection([], 'CREATE TABLE broken');
    const migration = defineMigration('0001_broken', 'BEGIN;\nCREATE TABLE broken(id int);\nCOMMIT;');
    await expect(applyMigrations(connection, [migration])).rejects.toThrow('migration failed');
    expect(connection.queries.some((query) => query.sql === 'ROLLBACK')).toBe(true);
    expect(connection.queries.at(-1)?.sql).toContain('pg_advisory_unlock');
  });
});
