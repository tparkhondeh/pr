import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type {
  SqlQueryResult,
  SqlTransaction,
  SqlTransactionRunner,
} from './sql.js';

export const latestSchemaMigration = '0023_perception_engine';

export type DatabasePrincipal = Readonly<{
  superuser: boolean;
  bypassRls: boolean;
  rowSecurity: string;
}>;

export function isSafeDatabasePrincipal(principal: DatabasePrincipal): boolean {
  return !principal.superuser && !principal.bypassRls && principal.rowSecurity === 'on';
}

export class PostgresRuntime implements SqlTransactionRunner {
  readonly #pool: Pool;

  public constructor(connectionString: string) {
    if (connectionString.trim().length === 0) {
      throw new Error('PostgreSQL connection string is required.');
    }
    this.#pool = new Pool({
      connectionString,
      application_name: 'wealthos-pr',
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 10,
    });
  }

  public async transaction<Result>(
    operation: (transaction: SqlTransaction) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(new PgTransaction(client));
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async readiness(): Promise<Readonly<{ ready: boolean; reason?: string }>> {
    try {
      const principalResult = await this.#pool.query<Readonly<{
        superuser: boolean;
        bypass_rls: boolean;
        row_security: string;
      }>>(`
        SELECT role.rolsuper AS superuser,
               role.rolbypassrls AS bypass_rls,
               current_setting('row_security') AS row_security
          FROM pg_roles role
         WHERE role.rolname = current_user
      `);
      const principal = principalResult.rows[0];
      if (!principal || !isSafeDatabasePrincipal({
        superuser: principal.superuser,
        bypassRls: principal.bypass_rls,
        rowSecurity: principal.row_security,
      })) {
        return { ready: false, reason: 'database_role_unsafe' };
      }
      const journalResult = await this.#pool.query<Readonly<{ present: boolean }>>(
        "SELECT to_regclass('public.pr_schema_migrations') IS NOT NULL AS present",
      );
      if (!journalResult.rows[0]?.present) {
        return { ready: false, reason: 'database_schema_outdated' };
      }
      const schemaResult = await this.#pool.query<Readonly<{ latest: string | null }>>(
        'SELECT max(id) AS latest FROM public.pr_schema_migrations',
      );
      if (schemaResult.rows[0]?.latest !== latestSchemaMigration) {
        return { ready: false, reason: 'database_schema_outdated' };
      }
      return { ready: true };
    } catch {
      return { ready: false, reason: 'database_unavailable' };
    }
  }

  public close(): Promise<void> {
    return this.#pool.end();
  }
}

class PgTransaction implements SqlTransaction {
  public constructor(private readonly client: PoolClient) {}

  public async query<Row>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.client.query<QueryResultRow>(sql, [...values]);
    return {
      rows: result.rows as unknown as readonly Row[],
      rowCount: result.rowCount ?? 0,
    };
  }
}
