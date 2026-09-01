import { assertSafePostgresConnectionString } from './connection-policy.js';
import { applyMigrations, type MigrationConnection } from './migration-runner.js';
import { isSafeDatabasePrincipal, type DatabasePrincipal } from './postgres.js';
import type { SqlQueryResult } from './sql.js';
import type { Migration } from '../kernel/migrations.js';

export interface CommissioningConnection extends MigrationConnection {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
}

export type PostgresCommissioningConfig = Readonly<{
  migrationConnectionString: string;
  runtimeConnectionString: string;
  tenantId: string;
  ownerUserId: string;
  tenantSlug: string;
  tenantDisplayName: string;
  ownerExternalSubject: string;
}>;

export type DatabasePrincipalInspection = DatabasePrincipal & Readonly<{
  roleName: string;
  databaseName: string;
}>;

export type PostgresCommissioningResult = Readonly<{
  appliedMigrations: readonly string[];
  alreadyAppliedMigrations: readonly string[];
  latestMigration: string;
  runtimeRole: string;
  tenantId: string;
  ownerUserId: string;
}>;

export function loadPostgresCommissioningConfig(
  input: NodeJS.ProcessEnv = process.env,
): PostgresCommissioningConfig {
  const migrationConnectionString = required(input, 'PR_MIGRATION_DATABASE_URL');
  const runtimeConnectionString = required(input, 'DATABASE_URL');
  const tenantId = required(input, 'PR_TENANT_ID');
  const ownerUserId = required(input, 'PR_OWNER_USER_ID');
  const tenantSlug = required(input, 'PR_TENANT_SLUG');
  const tenantDisplayName = required(input, 'PR_TENANT_DISPLAY_NAME');
  const ownerExternalSubject = required(input, 'PR_OWNER_EXTERNAL_SUBJECT');

  assertSafePostgresConnectionString(
    migrationConnectionString,
    'PR_MIGRATION_DATABASE_URL',
  );
  assertSafePostgresConnectionString(runtimeConnectionString);
  if (!isUuid(tenantId) || !isUuid(ownerUserId)) {
    throw new Error('PR_TENANT_ID and PR_OWNER_USER_ID must be UUIDs.');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(tenantSlug)) {
    throw new Error('PR_TENANT_SLUG must match the canonical tenant slug policy.');
  }
  if (tenantDisplayName.length > 200) {
    throw new Error('PR_TENANT_DISPLAY_NAME must be at most 200 characters.');
  }
  if (ownerExternalSubject.length > 500) {
    throw new Error('PR_OWNER_EXTERNAL_SUBJECT must be at most 500 characters.');
  }
  return {
    migrationConnectionString,
    runtimeConnectionString,
    tenantId,
    ownerUserId,
    tenantSlug,
    tenantDisplayName,
    ownerExternalSubject,
  };
}

export async function commissionPostgresDatabase(
  migrationConnection: CommissioningConnection,
  runtimeConnection: CommissioningConnection,
  migrations: readonly Migration[],
  config: Omit<PostgresCommissioningConfig, 'migrationConnectionString' | 'runtimeConnectionString'>,
): Promise<PostgresCommissioningResult> {
  if (migrations.length === 0) throw new Error('No PostgreSQL migrations were found.');
  const migrationPrincipal = await inspectDatabasePrincipal(migrationConnection);
  const runtimePrincipalBefore = await inspectDatabasePrincipal(runtimeConnection);
  if (migrationPrincipal.databaseName !== runtimePrincipalBefore.databaseName) {
    throw new Error('Migration and runtime roles must connect to the same database.');
  }
  if (migrationPrincipal.roleName === runtimePrincipalBefore.roleName) {
    throw new Error('Migration and runtime PostgreSQL roles must be different.');
  }
  if (
    runtimePrincipalBefore.superuser || runtimePrincipalBefore.bypassRls ||
    runtimePrincipalBefore.rowSecurity !== 'on' || runtimePrincipalBefore.createRole ||
    runtimePrincipalBefore.createDatabase || runtimePrincipalBefore.replication
  ) {
    throw new Error('Runtime PostgreSQL role is privileged or has row security disabled.');
  }

  const migrationResult = await applyMigrations(migrationConnection, migrations);
  await grantRuntimeAccessAndSeedOwner(
    migrationConnection,
    runtimePrincipalBefore.roleName,
    migrationPrincipal.databaseName,
    config,
  );
  const latestMigration = migrations.at(-1)?.id;
  if (!latestMigration) throw new Error('Latest PostgreSQL migration is missing.');
  await verifyCommissionedRuntime(
    runtimeConnection,
    latestMigration,
    config.tenantId,
    config.ownerUserId,
  );

  return {
    appliedMigrations: migrationResult.applied,
    alreadyAppliedMigrations: migrationResult.alreadyApplied,
    latestMigration,
    runtimeRole: runtimePrincipalBefore.roleName,
    tenantId: config.tenantId,
    ownerUserId: config.ownerUserId,
  };
}

export async function inspectDatabasePrincipal(
  connection: CommissioningConnection,
): Promise<DatabasePrincipalInspection> {
  const result = await connection.query<Readonly<{
    role_name: string;
    database_name: string;
    superuser: boolean;
    bypass_rls: boolean;
    row_security: string;
    database_create: boolean;
    public_schema_create: boolean;
    create_role: boolean;
    create_database: boolean;
    replication: boolean;
  }>>(`
    SELECT current_user AS role_name,
           current_database() AS database_name,
           role.rolsuper AS superuser,
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
  const row = result.rows[0];
  if (!row) throw new Error('Unable to inspect the PostgreSQL principal.');
  return {
    roleName: row.role_name,
    databaseName: row.database_name,
    superuser: row.superuser,
    bypassRls: row.bypass_rls,
    rowSecurity: row.row_security,
    databaseCreate: row.database_create,
    publicSchemaCreate: row.public_schema_create,
    createRole: row.create_role,
    createDatabase: row.create_database,
    replication: row.replication,
  };
}

export function quotePostgresIdentifier(value: string): string {
  if (value.length === 0 || value.includes('\0')) {
    throw new Error('Invalid PostgreSQL identifier.');
  }
  return `"${value.replaceAll('"', '""')}"`;
}

async function grantRuntimeAccessAndSeedOwner(
  connection: CommissioningConnection,
  runtimeRole: string,
  databaseName: string,
  config: Omit<PostgresCommissioningConfig, 'migrationConnectionString' | 'runtimeConnectionString'>,
): Promise<void> {
  const role = quotePostgresIdentifier(runtimeRole);
  const database = quotePostgresIdentifier(databaseName);
  await connection.query('BEGIN');
  try {
    await connection.query(`REVOKE CREATE ON DATABASE ${database} FROM ${role}`);
    await connection.query(`REVOKE CREATE ON SCHEMA public FROM ${role}`);
    await connection.query(`GRANT USAGE ON SCHEMA app TO ${role}`);
    await connection.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ${role}`,
    );
    await connection.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO ${role}`);
    await connection.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${role}`);
    await connection.query(`GRANT SELECT ON public.pr_schema_migrations TO ${role}`);
    await connection.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA app ` +
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    );
    await connection.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    );
    await connection.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO ${role}`,
    );

    await connection.query(
      `INSERT INTO app.tenants (id, slug, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [config.tenantId, config.tenantSlug, config.tenantDisplayName],
    );
    await connection.query(
      `INSERT INTO app.users (id, external_subject)
       VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [config.ownerUserId, config.ownerExternalSubject],
    );
    await connection.query("SELECT set_config('app.tenant_id', $1, true)", [config.tenantId]);
    await connection.query(
      `INSERT INTO app.memberships (tenant_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (tenant_id, user_id) DO NOTHING`,
      [config.tenantId, config.ownerUserId],
    );
    const identity = await connection.query<Readonly<{
      slug: string;
      display_name: string;
      external_subject: string;
      role: string;
      revoked_at: string | null;
    }>>(
      `SELECT tenant.slug, tenant.display_name, app_user.external_subject,
              membership.role, membership.revoked_at::text
         FROM app.tenants tenant
         JOIN app.memberships membership ON membership.tenant_id = tenant.id
         JOIN app.users app_user ON app_user.id = membership.user_id
        WHERE tenant.id = $1 AND app_user.id = $2`,
      [config.tenantId, config.ownerUserId],
    );
    const owner = identity.rows[0];
    if (
      !owner || owner.slug !== config.tenantSlug ||
      owner.display_name !== config.tenantDisplayName ||
      owner.external_subject !== config.ownerExternalSubject ||
      owner.role !== 'owner' || owner.revoked_at !== null
    ) {
      throw new Error('Existing tenant or owner identity conflicts with commissioning input.');
    }
    await connection.query(
      `INSERT INTO app.audit_events (
         tenant_id, actor_user_id, event_type, resource_type, resource_id, decision, metadata
       ) VALUES ($1, $2, 'database.commissioned', 'database', $3, 'allowed', $4::jsonb)`,
      [
        config.tenantId,
        config.ownerUserId,
        databaseName,
        JSON.stringify({ policyVersion: 'postgres-commissioning-v1' }),
      ],
    );
    await connection.query('COMMIT');
  } catch (error: unknown) {
    await connection.query('ROLLBACK');
    throw error;
  }
}

async function verifyCommissionedRuntime(
  connection: CommissioningConnection,
  latestMigration: string,
  tenantId: string,
  ownerUserId: string,
): Promise<void> {
  const principal = await inspectDatabasePrincipal(connection);
  if (!isSafeDatabasePrincipal(principal)) {
    throw new Error('Runtime PostgreSQL role retains unsafe database privileges.');
  }
  const schema = await connection.query<Readonly<{ latest: string | null }>>(
    'SELECT max(id) AS latest FROM public.pr_schema_migrations',
  );
  if (schema.rows[0]?.latest !== latestMigration) {
    throw new Error('Runtime PostgreSQL schema is not at the expected migration.');
  }
  await connection.query('BEGIN');
  try {
    await connection.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const membership = await connection.query<Readonly<{ role: string }>>(
      `SELECT role FROM app.memberships
        WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [tenantId, ownerUserId],
    );
    if (membership.rows[0]?.role !== 'owner') {
      throw new Error('Runtime role cannot read the commissioned owner through RLS.');
    }
    await connection.query('ROLLBACK');
  } catch (error: unknown) {
    await connection.query('ROLLBACK');
    throw error;
  }
}

function required(input: NodeJS.ProcessEnv, name: string): string {
  const value = input[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}
