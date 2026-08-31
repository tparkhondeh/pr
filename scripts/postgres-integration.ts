import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type QueryResultRow } from 'pg';
import {
  applyMigrations,
  type MigrationConnection,
} from '../src/database/migration-runner.js';
import type { SqlQueryResult } from '../src/database/sql.js';
import { PostgresRuntime } from '../src/database/postgres.js';
import { defineMigration } from '../src/kernel/migrations.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import { ConversationIntakeService } from '../src/conversation/intake.js';
import { PostgresConversationMemoryRepository } from '../src/conversation/repository.js';
import {
  BrandProtectionService,
  PostgresRiskReviewRepository,
  assessAction,
} from '../src/risk/brand-protection.js';
import type { WorkbenchAction } from '../src/workbench/workbench.js';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const applicationRolePassword = 'pr_app_test_password';

class PgMigrationConnection implements MigrationConnection {
  public constructor(private readonly client: Client) {}

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

async function main(): Promise<void> {
  const connectionString = requiredEnvironment('PR_TEST_ADMIN_DATABASE_URL');
  const client = new Client({ connectionString, application_name: 'wealthos-pr-integration' });
  await client.connect();
  try {
    const migrations = readdirSync(resolve('db/migrations'))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
      .sort()
      .map((name) => defineMigration(name.replace(/\.sql$/u, ''), readFileSync(resolve('db/migrations', name), 'utf8')));
    const migrationResult = await applyMigrations(new PgMigrationConnection(client), migrations);
    if (migrationResult.applied.length + migrationResult.alreadyApplied.length !== migrations.length) {
      throw new Error('Not every migration was accounted for.');
    }

    await createApplicationRole(client);
    await seedIsolationFixtures(client);
    await verifyTenantPolicies(client);
    await verifyRuntimeIsolation(client);
    await verifyBrandRiskPersistence();
    await verifyConversationOrchestrationPersistence();
    await verifyRuntimeReadiness(connectionString);
    process.stdout.write(
      `PostgreSQL integration passed (${String(migrations.length)} migrations, RLS enforced).\n`,
    );
  } finally {
    await client.end();
  }
}

async function verifyConversationOrchestrationPersistence(): Promise<void> {
  const runtime = new PostgresRuntime(requiredEnvironment('PR_TEST_APP_DATABASE_URL'));
  const owner = userId(userA);
  const service = new ConversationIntakeService(
    new PostgresConversationMemoryRepository(runtime, {
      tenantId: tenantA,
      ownerUserId: userA,
    }),
  );
  const request = {
    tenantId: tenantId(tenantA),
    actorId: owner,
    conversationId: 'conversation_integration_v1',
    turnId: 'turn_orchestration_v1',
    text: 'امروز در جلسه متوجه شدم که توضیح شفاف، ابهام تصمیم را کمتر می‌کند.',
    proposeMemory: true,
    occurredAt: new Date('2026-08-31T22:47:00.000Z'),
  } as const;
  try {
    const first = await service.submitTurn(request);
    const replay = await service.submitTurn(request);
    if (
      first.orchestration.intent.kind !== 'reflect' ||
      replay.orchestration.route.writeAuthority !== 'propose_only'
    ) {
      throw new Error('Conversation orchestration contract was not stable across replay.');
    }
    await runtime.transaction(async (transaction) => {
      await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const stored = await transaction.query<Readonly<{
        orchestration_snapshot: Record<string, unknown>;
      }>>(
        `SELECT orchestration_snapshot
           FROM app.conversation_turns
          WHERE tenant_id = $1 AND actor_user_id = $2 AND client_ref = $3`,
        [tenantA, userA, request.turnId],
      );
      const snapshot = stored.rows[0]?.orchestration_snapshot;
      if (
        snapshot?.['policyVersion'] !== 'conversation-orchestrator-v1' ||
        JSON.stringify(snapshot).includes(request.text)
      ) {
        throw new Error('Stored orchestration snapshot is missing or duplicates raw user text.');
      }
    });
  } finally {
    await runtime.close();
  }
}

async function verifyBrandRiskPersistence(): Promise<void> {
  const runtime = new PostgresRuntime(requiredEnvironment('PR_TEST_APP_DATABASE_URL'));
  const owner = userId(userA);
  const context = { tenantId: tenantId(tenantA), ownerUserId: owner };
  const service = new BrandProtectionService(
    new PostgresRiskReviewRepository(runtime, { tenantId: tenantA, ownerUserId: userA }),
    context,
  );
  const action: WorkbenchAction = {
    id: 'integration_public_action', kind: 'content', title: 'یادداشت مستند Integration',
    rationale: 'یک اقدام عمومی مستند که پیامدهای اعتباری آن باید بازبینی شود.',
    benefits: ['اعتماد'], risks: ['برداشت نادرست'], prerequisites: ['Claim Check'],
    evidenceIds: ['integration-evidence'], evidenceCount: 1, confidence: 0.8,
    riskLevel: 'medium', attentionCostMinutes: 20, energyCost: 2, feasible: true,
    utilityScore: 70, opportunityCost: 0, rank: 1, evidenceState: 'grounded',
    evidenceSourceTypes: ['text_asset'], interaction: 'approve',
  };
  const assessment = assessAction(action);
  try {
    await service.review({
      actorId: owner, action, requestId: 'risk_integration_review',
      expectedLevel: assessment.level, expectedAssessmentHash: assessment.assessmentHash,
      decision: 'acknowledge',
      rationale: 'Risk Review پایگاه داده با Assessment نسخه‌دار و Attestation انسانی تأیید شد.',
      humanAttestation: true, reviewedAt: new Date('2026-08-31T22:45:00.000Z'),
    });
    await service.authorizeAction(owner, action);
    const snapshot = await service.snapshot(owner, [action], null, new Date('2026-08-31T22:46:00.000Z'));
    if (snapshot.assessments[0]?.gate !== 'allowed_with_acknowledgement') {
      throw new Error('Persisted risk acknowledgement was not effective.');
    }
  } finally {
    await runtime.close();
  }
}

async function createApplicationRole(client: Client): Promise<void> {
  await client.query(`
    DO $$ BEGIN
      CREATE ROLE pr_app_test LOGIN PASSWORD '${applicationRolePassword}'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await client.query(`ALTER ROLE pr_app_test LOGIN PASSWORD '${applicationRolePassword}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await client.query('GRANT USAGE ON SCHEMA app TO pr_app_test');
  await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO pr_app_test');
  await client.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO pr_app_test');
  await client.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO pr_app_test');
  await client.query('GRANT SELECT ON public.pr_schema_migrations TO pr_app_test');
}

async function verifyRuntimeReadiness(adminConnectionString: string): Promise<void> {
  const adminRuntime = new PostgresRuntime(adminConnectionString);
  try {
    const unsafe = await adminRuntime.readiness();
    if (unsafe.ready || unsafe.reason !== 'database_role_unsafe') {
      throw new Error('Runtime did not reject a superuser database principal.');
    }
  } finally {
    await adminRuntime.close();
  }

  const applicationConnectionString = requiredEnvironment('PR_TEST_APP_DATABASE_URL');
  const applicationRuntime = new PostgresRuntime(applicationConnectionString);
  try {
    const safe = await applicationRuntime.readiness();
    if (!safe.ready) throw new Error(`Safe application role was not ready: ${safe.reason ?? 'unknown'}`);
  } finally {
    await applicationRuntime.close();
  }
}

async function seedIsolationFixtures(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO app.tenants (id, slug, display_name) VALUES
       ($1, 'tenant-a', 'Tenant A'), ($2, 'tenant-b', 'Tenant B')
     ON CONFLICT (id) DO NOTHING`,
    [tenantA, tenantB],
  );
  await client.query(
    `INSERT INTO app.users (id, external_subject) VALUES
       ($1, 'owner-a'), ($2, 'owner-b')
     ON CONFLICT (id) DO NOTHING`,
    [userA, userB],
  );
  await client.query(
    `INSERT INTO app.memberships (tenant_id, user_id, role) VALUES
       ($1, $2, 'owner'), ($3, $4, 'owner')
     ON CONFLICT (tenant_id, user_id) DO NOTHING`,
    [tenantA, userA, tenantB, userB],
  );
  await client.query(
    `INSERT INTO app.assets (
       tenant_id, owner_user_id, kind, object_key, content_sha256, data_class
     ) VALUES
       ($1, $2, 'text', 'fixture-a', $3, 'confidential'),
       ($4, $5, 'text', 'fixture-b', $6, 'confidential')
     ON CONFLICT (tenant_id, content_sha256) DO NOTHING`,
    [tenantA, userA, 'a'.repeat(64), tenantB, userB, 'b'.repeat(64)],
  );
  await client.query(
    `INSERT INTO app.audit_events (
       tenant_id, event_type, resource_type, resource_id, decision, metadata
     ) VALUES ($1, 'integration.seeded', 'integration', 'tenant-a', 'allowed', '{}')`,
    [tenantA],
  );
}

async function verifyTenantPolicies(client: Client): Promise<void> {
  const result = await client.query<Readonly<{
    table_name: string;
    row_security: boolean;
    force_row_security: boolean;
    policy_count: number;
  }>>(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS row_security,
           c.relforcerowsecurity AS force_row_security,
           count(p.polname)::integer AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_schema = n.nspname
       AND col.table_name = c.relname
       AND col.column_name = 'tenant_id'
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
     WHERE n.nspname = 'app' AND c.relkind = 'r'
     GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
     ORDER BY c.relname
  `);
  const violations = result.rows.filter(
    (row) => !row.row_security || !row.force_row_security || row.policy_count < 1,
  );
  if (result.rows.length === 0 || violations.length > 0) {
    throw new Error(`Tenant RLS policy violations: ${violations.map((row) => row.table_name).join(',')}`);
  }
}

async function verifyRuntimeIsolation(client: Client): Promise<void> {
  await client.query('SET ROLE pr_app_test');
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantA]);
    const visible = await client.query<Readonly<{ tenant_id: string }>>(
      'SELECT tenant_id::text FROM app.assets ORDER BY tenant_id',
    );
    if (visible.rows.length !== 1 || visible.rows[0]?.tenant_id !== tenantA) {
      throw new Error('Cross-tenant read isolation failed.');
    }
    await expectDenied(
      client.query(
        `INSERT INTO app.assets (
           tenant_id, owner_user_id, kind, object_key, content_sha256, data_class
         ) VALUES ($1, $2, 'text', 'cross-tenant-write', $3, 'confidential')`,
        [tenantB, userB, 'c'.repeat(64)],
      ),
      'Cross-tenant write was not denied.',
    );
    await expectDenied(
      client.query("UPDATE app.audit_events SET decision = 'tampered' WHERE tenant_id = $1", [tenantA]),
      'Audit mutation was not denied.',
    );
    await client.query("SELECT set_config('app.tenant_id', '', false)");
    const withoutTenant = await client.query<Readonly<{ count: string }>>(
      'SELECT count(*)::text AS count FROM app.assets',
    );
    if (withoutTenant.rows[0]?.count !== '0') throw new Error('Missing tenant context did not deny reads.');
  } finally {
    await client.query('RESET ROLE');
  }
}

async function expectDenied(operation: Promise<unknown>, message: string): Promise<void> {
  try {
    await operation;
  } catch {
    return;
  }
  throw new Error(message);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'PostgreSQL integration failed.'}\n`);
  process.exitCode = 1;
});
