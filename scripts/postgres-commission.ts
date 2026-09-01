import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type QueryResultRow } from 'pg';
import {
  commissionPostgresDatabase,
  loadPostgresCommissioningConfig,
  type CommissioningConnection,
} from '../src/database/commissioning.js';
import type { SqlQueryResult } from '../src/database/sql.js';
import { defineMigration } from '../src/kernel/migrations.js';

class PgCommissioningConnection implements CommissioningConnection {
  public constructor(private readonly client: Client) {}

  public async query<Row>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.client.query<QueryResultRow>(sql, [...values]);
    return { rows: result.rows as unknown as readonly Row[], rowCount: result.rowCount ?? 0 };
  }
}

async function main(): Promise<void> {
  const config = loadPostgresCommissioningConfig();
  const migrations = readdirSync(resolve('db/migrations'))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort()
    .map((name) => defineMigration(
      name.replace(/\.sql$/u, ''),
      readFileSync(resolve('db/migrations', name), 'utf8'),
    ));
  const migrationClient = new Client({
    connectionString: config.migrationConnectionString,
    application_name: 'wealthos-pr-commissioning',
    connectionTimeoutMillis: 10_000,
  });
  const runtimeClient = new Client({
    connectionString: config.runtimeConnectionString,
    application_name: 'wealthos-pr-commissioning-verify',
    connectionTimeoutMillis: 10_000,
  });
  await Promise.all([migrationClient.connect(), runtimeClient.connect()]);
  try {
    const result = await commissionPostgresDatabase(
      new PgCommissioningConnection(migrationClient),
      new PgCommissioningConnection(runtimeClient),
      migrations,
      config,
    );
    process.stdout.write(
      `PostgreSQL commissioning passed (${String(result.appliedMigrations.length)} applied, ` +
      `${String(result.alreadyAppliedMigrations.length)} existing, latest ${result.latestMigration}).\n`,
    );
  } finally {
    await Promise.allSettled([migrationClient.end(), runtimeClient.end()]);
  }
}

await main().catch((error: unknown) => {
  const raw = error instanceof Error ? error.message : 'PostgreSQL commissioning failed.';
  const message = raw.replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[redacted database URL]');
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
