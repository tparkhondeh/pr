import { Client } from 'pg';

const connectionString = process.env['PR_TEST_RESTORED_DATABASE_URL']?.trim();
if (!connectionString) throw new Error('PR_TEST_RESTORED_DATABASE_URL is required.');

const client = new Client({ connectionString, application_name: 'wealthos-pr-restore-verifier' });
await client.connect();
try {
  const migrations = await client.query<Readonly<{ count: string }>>(
    'SELECT count(*)::text AS count FROM public.pr_schema_migrations',
  );
  const tenants = await client.query<Readonly<{ count: string }>>(
    'SELECT count(*)::text AS count FROM app.tenants',
  );
  const assets = await client.query<Readonly<{ count: string }>>(
    'SELECT count(*)::text AS count FROM app.assets',
  );
  if (migrations.rows[0]?.count !== '17') throw new Error('Restored migration journal is incomplete.');
  if (tenants.rows[0]?.count !== '2') throw new Error('Restored tenant fixtures are incomplete.');
  if (assets.rows[0]?.count !== '2') throw new Error('Restored asset fixtures are incomplete.');
  process.stdout.write('PostgreSQL restore verification passed (RPO 0 for the drill snapshot).\n');
} finally {
  await client.end();
}
