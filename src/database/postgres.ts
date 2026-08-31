import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type {
  SqlQueryResult,
  SqlTransaction,
  SqlTransactionRunner,
} from './sql.js';

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
      await this.#pool.query('SELECT 1');
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
