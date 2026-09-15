import { Client } from 'pg';
import { execFileSync } from 'node:child_process';
async function main(): Promise<void> {
  if (process.argv.includes('--run-suite')) { await import('./postgres-integration.js'); return; }
  const socket = '/home/wealthos/apps/pr/.private/pgsocket';
  const database = `pr_acceptance_${String(Date.now())}`;
  const admin = new Client({ host: socket, port: 31556, user: 'wealthos_dev', database: 'postgres' });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    process.env['PR_TEST_ADMIN_DATABASE_URL'] = `postgresql://wealthos_dev@localhost:31556/${database}?host=${encodeURIComponent(socket)}`;
    process.env['PR_TEST_APP_DATABASE_URL'] = `postgresql://pr_app_test:pr_app_test_password@127.0.0.1:31556/${database}`;
    const entry = process.argv[1];
    if (!entry) throw new Error('Acceptance entry point missing.');
    // Wait for the complete suite, not just module import, before removing test login.
    execFileSync(process.execPath, [...process.execArgv, entry, '--run-suite'], { stdio: 'inherit', env: process.env });
    process.stdout.write(`Isolated acceptance database: ${database}\n`);
  } finally {
    try {
      const role = await admin.query("SELECT 1 FROM pg_roles WHERE rolname='pr_app_test'");
      if (role.rowCount) await admin.query('ALTER ROLE pr_app_test NOLOGIN');
      process.stdout.write('Synthetic test role login disabled; databases preserved.\n');
    } finally { await admin.end(); }
  }
}
void main().catch(() => { process.stderr.write('Isolated acceptance setup failed.\n'); process.exitCode = 1; });
