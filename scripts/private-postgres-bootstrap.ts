import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Client } from 'pg';

const root = '/home/wealthos/apps/pr';
const privateRoot = `${root}/.private`;
const bin = `${root}/.infrastructure/pgsql/bin`;
const data = `${privateRoot}/pgdata`;
const socket = `${privateRoot}/pgsocket`;
const port = 31556;
type Provision = { migrationPassword: string; runtimePassword: string; tenantId: string; ownerId: string };
async function main(): Promise<void> {
  if (process.platform !== 'linux' || process.env['USER'] !== 'wealthos_dev') {
    throw new Error('This bootstrap is restricted to the PR server account.');
  }
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  // Existing cPanel directories can retain inherited ACLs despite mkdir's mode option.
  execFileSync('setfacl', ['-b', '-k', privateRoot], { stdio: 'ignore' });
  chmodSync(privateRoot, 0o700);
  const maintenancePath = `${privateRoot}/maintenance.token`;
  if (!existsSync(maintenancePath)) writeFileSync(maintenancePath, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  mkdirSync(socket, { recursive: true, mode: 0o700 });
  const secretPath = `${privateRoot}/postgres-provision.json`;
  if (!existsSync(secretPath)) {
    const config: Provision = { migrationPassword: randomBytes(32).toString('hex'),
      runtimePassword: randomBytes(32).toString('hex'), tenantId: randomUUID(), ownerId: randomUUID() };
    writeFileSync(secretPath, JSON.stringify(config), { mode: 0o600, flag: 'wx' });
  }
  const provision = JSON.parse(readFileSync(secretPath, 'utf8')) as Provision;
  for (const password of [provision.runtimePassword, provision.migrationPassword]) {
    if (!/^[a-f0-9]{64}$/u.test(password)) throw new Error('Invalid private credential format.');
  }
  if (!existsSync(`${data}/PG_VERSION`)) {
    execFileSync(`${bin}/initdb`, ['-D', data, '-U', 'wealthos_dev', '--auth-local=peer',
      '--auth-host=scram-sha-256', '--encoding=UTF8', '--locale=C'], { stdio: 'ignore' });
    writeFileSync(`${data}/postgresql.auto.conf`, [
      "listen_addresses = '127.0.0.1'", `port = ${String(port)}`, `unix_socket_directories = '${socket}'`,
      'unix_socket_permissions = 0700', 'max_connections = 30', "shared_buffers = '64MB'",
      "work_mem = '4MB'", "password_encryption = 'scram-sha-256'", "log_statement = 'none'",
      "log_min_error_statement = 'panic'", 'log_connections = off', 'log_disconnections = off',
    ].join('\n') + '\n', { mode: 0o600 });
  }
  try { execFileSync(`${bin}/pg_ctl`, ['status', '-D', data], { stdio: 'ignore' }); }
  catch {
    execFileSync('pm2', ['start', `${bin}/postgres`, '--name', 'wealthos-pr-postgres',
      '--interpreter', 'none', '--kill-timeout', '15000', '--', '-D', data], { stdio: 'ignore' });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const admin = new Client({ host: socket, port, user: 'wealthos_dev', database: 'postgres' });
  await admin.connect();
  try {
    const inspected = await admin.query<{ data_directory: string }>('SHOW data_directory');
    if (inspected.rows[0]?.data_directory !== data) throw new Error('Unexpected PostgreSQL cluster.');
    for (const [role, password] of [['pr_migrate', provision.migrationPassword], ['pr_runtime', provision.runtimePassword]] as const) {
      const found = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
      if (found.rowCount === 0) {
        await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
      }
    }
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', ['pr']);
    if (!existing.rowCount) await admin.query('CREATE DATABASE pr OWNER pr_migrate');
    await admin.query('REVOKE ALL ON DATABASE pr FROM PUBLIC');
    await admin.query('GRANT CONNECT ON DATABASE pr TO pr_runtime');
    await admin.query('ALTER ROLE pr_runtime SET row_security = on');
  } finally { await admin.end(); }
  const url = (role: string, password: string) => `postgresql://${role}:${password}@127.0.0.1:${String(port)}/pr`;
  const runtime = { DATABASE_URL: url('pr_runtime', provision.runtimePassword),
    PR_TENANT_ID: provision.tenantId, PR_OWNER_USER_ID: provision.ownerId,
    PR_ALLOW_EPHEMERAL_PRODUCTION: 'false' };
  const commissioning = { ...runtime, PR_MIGRATION_DATABASE_URL: url('pr_migrate', provision.migrationPassword),
    PR_TENANT_SLUG: 'pr_owner', PR_TENANT_DISPLAY_NAME: 'PR private owner', PR_OWNER_EXTERNAL_SUBJECT: 'basic-auth:pr_owner' };
  // Candidate only: production must not adopt it before commissioning and restore tests.
  writeFileSync(`${privateRoot}/runtime-candidate.json`, JSON.stringify(runtime), { mode: 0o600 });
  writeFileSync(`${privateRoot}/commissioning.json`, JSON.stringify(commissioning), { mode: 0o600 });
  process.stdout.write('PR-owned PostgreSQL prepared; production unchanged.\n');
}
void main().catch(() => { process.stderr.write('Private PostgreSQL bootstrap failed; no secret details emitted.\n'); process.exitCode = 1; });
