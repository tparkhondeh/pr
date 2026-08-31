import { describe, expect, it } from 'vitest';
import {
  AuditTrailConflictError,
  AuditTrailPermissionError,
  AuditTrailService,
  InMemoryAuditTrailRepository,
  PostgresAuditTrailRepository,
} from '../src/account/audit-trail.js';
import type { SqlQueryResult, SqlTransaction, SqlTransactionRunner } from '../src/database/sql.js';
import { tenantId, userId } from '../src/kernel/identity.js';

const activeTenant = tenantId('tenant_primary');
const owner = userId('owner_primary');
const fixedTime = new Date('2026-08-31T21:00:00.000Z');

describe('audit trail', () => {
  it('keeps an owner-scoped, idempotent and explainable activity timeline', async () => {
    const service = new AuditTrailService(new InMemoryAuditTrailRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const input = {
      actorId: owner,
      requestId: 'audit_memory_delete',
      eventType: 'memory.delete',
      resourceType: 'memory_proposal',
      resourceId: 'memory_one',
      purpose: 'personal_understanding',
      decision: 'delete',
      metadata: { permissionsRevoked: true },
      occurredAt: fixedTime,
    } as const;
    const first = await service.record(input);
    const repeated = await service.record(input);
    await service.record({
      actorId: owner,
      requestId: 'audit_account_export',
      eventType: 'account.data_exported',
      resourceType: 'account',
      decision: 'exported',
      occurredAt: new Date(fixedTime.getTime() + 1_000),
    });

    expect(repeated).toEqual(first);
    await expect(service.record({ ...input, eventType: 'memory.contest' })).rejects.toBeInstanceOf(
      AuditTrailConflictError,
    );
    const snapshot = await service.snapshot(owner, fixedTime);
    expect(snapshot).toMatchObject({
      persistence: 'memory',
      summary: { total: 2, dataRights: 1, exports: 1 },
    });
    expect(snapshot.events[0]?.eventType).toBe('account.data_exported');
  });

  it('denies a different actor before reading or writing activity', async () => {
    const service = new AuditTrailService(new InMemoryAuditTrailRepository(), {
      tenantId: activeTenant,
      ownerUserId: owner,
    });
    const outsider = userId('other_user');
    await expect(service.snapshot(outsider, fixedTime)).rejects.toBeInstanceOf(
      AuditTrailPermissionError,
    );
  });

  it('sets the RLS tenant context and filters PostgreSQL activity to the owner', async () => {
    const runner = new CapturingRunner([
      {
        id: '11111111-1111-4111-8111-111111111111',
        event_type: 'workbench.action_approved',
        resource_type: 'workbench',
        resource_id: 'workbench_today',
        purpose: 'strategy_reasoning',
        decision: 'approved',
        metadata: { actionId: 'conversation' },
        occurred_at: fixedTime,
        total_count: '1',
      },
    ]);
    const repository = new PostgresAuditTrailRepository(runner, {
      tenantId: '11111111-1111-4111-8111-111111111111',
      ownerUserId: '22222222-2222-4222-8222-222222222222',
    });
    const snapshot = await repository.snapshot(fixedTime);

    expect(runner.queries[0]?.sql).toContain("set_config('app.tenant_id'");
    expect(runner.queries[1]?.sql).toContain('actor_user_id = $2');
    expect(runner.queries[1]?.values).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(snapshot).toMatchObject({
      persistence: 'postgres',
      summary: { total: 1, approvals: 1 },
      events: [{ eventType: 'workbench.action_approved' }],
    });
  });
});

class CapturingRunner implements SqlTransactionRunner {
  public readonly queries: Array<{ sql: string; values: readonly unknown[] }> = [];

  public constructor(private readonly rows: readonly Record<string, unknown>[]) {}

  public transaction<Result>(
    operation: (transaction: SqlTransaction) => Promise<Result>,
  ): Promise<Result> {
    return operation({
      query: <Row>(sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult<Row>> => {
        this.queries.push({ sql, values });
        const rows = sql.includes('FROM app.audit_events')
          ? this.rows as readonly Row[]
          : [];
        return Promise.resolve({ rows, rowCount: rows.length });
      },
    });
  }
}
