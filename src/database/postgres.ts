import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type {
  SqlQueryResult,
  SqlTransaction,
  SqlTransactionRunner,
} from './sql.js';

export const latestSchemaMigration = '0030_model_invocation_reconciliation';

export type DatabasePrincipal = Readonly<{
  superuser: boolean;
  bypassRls: boolean;
  rowSecurity: string;
  databaseCreate: boolean;
  publicSchemaCreate: boolean;
  createRole: boolean;
  createDatabase: boolean;
  replication: boolean;
}>;

export function isSafeDatabasePrincipal(principal: DatabasePrincipal): boolean {
  return !principal.superuser && !principal.bypassRls && principal.rowSecurity === 'on' &&
    !principal.databaseCreate && !principal.publicSchemaCreate && !principal.createRole &&
    !principal.createDatabase && !principal.replication;
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
        database_create: boolean;
        public_schema_create: boolean;
        create_role: boolean;
        create_database: boolean;
        replication: boolean;
      }>>(`
        SELECT role.rolsuper AS superuser,
               role.rolbypassrls AS bypass_rls,
               current_setting('row_security') AS row_security,
               has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
               has_schema_privilege(current_user, 'public', 'CREATE') AS public_schema_create,
               role.rolcreaterole AS create_role,
               role.rolcreatedb AS create_database,
               role.rolreplication AS replication
          FROM pg_roles role
         WHERE role.rolname = current_user
      `);
      const principal = principalResult.rows[0];
      if (!principal || !isSafeDatabasePrincipal({
        superuser: principal.superuser,
        bypassRls: principal.bypass_rls,
        rowSecurity: principal.row_security,
        databaseCreate: principal.database_create,
        publicSchemaCreate: principal.public_schema_create,
        createRole: principal.create_role,
        createDatabase: principal.create_database,
        replication: principal.replication,
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
