import { Client } from 'pg';
async function main(): Promise<void> {
  const socket = '/home/wealthos/apps/pr/.private/pgsocket';
  const database = `pr_acceptance_${String(Date.now())}`;
  const admin = new Client({ host: socket, port: 31556, user: 'wealthos_dev', database: 'postgres' });
  await admin.connect();
  try { await admin.query(`CREATE DATABASE ${database}`); }
  finally { await admin.end(); }
  process.env['PR_TEST_ADMIN_DATABASE_URL'] = `postgresql://wealthos_dev@localhost:31556/${database}?host=${encodeURIComponent(socket)}`;
  process.env['PR_TEST_APP_DATABASE_URL'] = `postgresql://pr_app_test:pr_app_test_password@127.0.0.1:31556/${database}`;
  await import('./postgres-integration.js');
  process.stdout.write(`Isolated acceptance database: ${database}\n`);
}
void main().catch(() => { process.stderr.write('Isolated acceptance setup failed.\n'); process.exitCode = 1; });
