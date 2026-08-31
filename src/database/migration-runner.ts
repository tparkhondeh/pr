import {
  assertAppendOnlyMigrations,
  type Migration,
} from '../kernel/migrations.js';
import type { SqlQueryResult } from './sql.js';

export interface MigrationConnection {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
}

export type MigrationRunResult = Readonly<{
  applied: readonly string[];
  alreadyApplied: readonly string[];
}>;

const advisoryLockSql = "SELECT pg_advisory_lock(hashtext('wealthos-pr:migrations'))";
const advisoryUnlockSql = "SELECT pg_advisory_unlock(hashtext('wealthos-pr:migrations'))";

export async function applyMigrations(
  connection: MigrationConnection,
  migrations: readonly Migration[],
): Promise<MigrationRunResult> {
  await connection.query(advisoryLockSql);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS public.pr_schema_migrations (
        id text PRIMARY KEY CHECK (id ~ '^[0-9]{4}_[a-z0-9_]+$'),
        sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    const appliedRows = await connection.query<Readonly<{ id: string; sha256: string }>>(
      'SELECT id, sha256 FROM public.pr_schema_migrations ORDER BY id',
    );
    const applied = new Map(appliedRows.rows.map((row) => [row.id, row.sha256]));
    assertAppendOnlyMigrations(applied, migrations);

    const newlyApplied: string[] = [];
    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      await connection.query('BEGIN');
      try {
        await connection.query(transactionBody(migration));
        await connection.query(
          'INSERT INTO public.pr_schema_migrations (id, sha256) VALUES ($1, $2)',
          [migration.id, migration.sha256],
        );
        await connection.query('COMMIT');
        newlyApplied.push(migration.id);
      } catch (error: unknown) {
        await connection.query('ROLLBACK');
        throw error;
      }
    }
    return {
      applied: newlyApplied,
      alreadyApplied: migrations
        .filter((migration) => applied.has(migration.id))
        .map((migration) => migration.id),
    };
  } finally {
    await connection.query(advisoryUnlockSql);
  }
}

function transactionBody(migration: Migration): string {
  const body = migration.sql.trim()
    .replace(/^BEGIN;\s*/u, '')
    .replace(/\s*COMMIT;$/u, '')
    .trim();
  if (!body) throw new Error(`Migration ${migration.id} has no statements.`);
  return body;
}
