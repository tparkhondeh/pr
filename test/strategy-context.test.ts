import { describe, expect, it } from 'vitest';
import type { SqlQueryResult, SqlTransaction, SqlTransactionRunner } from '../src/database/sql.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  InMemoryStrategyContextRepository,
  PostgresStrategyContextRepository,
  StrategyContextConflictError,
  StrategyContextPermissionError,
  StrategyContextService,
  defaultStrategyContext,
  type EditableStrategyContext,
} from '../src/strategy/context.js';
import { InMemoryWorkbenchApprovalRepository } from '../src/workbench/approval-repository.js';

const tenant = tenantId('11111111-1111-4111-8111-111111111111');
const owner = userId('22222222-2222-4222-8222-222222222222');
const changedAt = new Date('2026-08-31T16:00:00.000Z');

const value: EditableStrategyContext = {
  goal: {
    title: 'ساخت جایگاه مرجع قابل‌اعتماد',
    outcome: 'ایجاد پنج گفت‌وگوی عمیق با تصمیم‌گیران منتخب',
    priority: 5,
    successMetrics: ['کیفیت تعامل', 'فرصت‌های ایجادشده'],
    horizon: 'شش ماه آینده',
  },
  desiredPositioning: {
    audience: 'مدیران ارشد کسب‌وکار',
    desiredPerception: 'مرجعی دقیق و صادق برای تصمیم‌های دشوار',
    differentiation: 'تحلیل مبتنی بر شواهد شخصی و ادعاهای قابل‌ردیابی',
    proofPoints: ['گفت‌وگوهای باکیفیت', 'تصمیم‌های مستند'],
    horizon: 'شش ماه آینده',
  },
};

function command(requestId = 'strategy_request_one') {
  return {
    actorId: owner,
    requestId,
    expectedRevision: 1,
    value,
    occurredAt: changedAt,
  } as const;
}

describe('strategy context lifecycle', () => {
  it('versions owner edits, makes retries idempotent and invalidates old approval', async () => {
    const approval = new InMemoryWorkbenchApprovalRepository();
    await approval.approve({
      actionId: 'conversation',
      actorUserId: owner,
      occurredAt: changedAt,
      expectedRevision: 1,
      strategyRevision: 1,
    });
    const repository = new InMemoryStrategyContextRepository(
      defaultStrategyContext(tenant, owner),
      approval,
    );
    const service = new StrategyContextService(repository, { tenantId: tenant, ownerUserId: owner });

    const first = await service.save(command());
    const repeated = await service.save(command());

    expect(first).toMatchObject({ outcome: 'saved', snapshot: { revision: 2, goal: value.goal } });
    expect(repeated).toMatchObject({ outcome: 'already_saved', snapshot: { revision: 2 } });
    await expect(approval.find(2)).resolves.toBeNull();
    await expect(service.save({ ...command('strategy_stale'), expectedRevision: 1 })).rejects.toThrow(
      StrategyContextConflictError,
    );
  });

  it('allows only the owner to read or change strategy', () => {
    const repository = new InMemoryStrategyContextRepository(defaultStrategyContext(tenant, owner));
    const service = new StrategyContextService(repository, { tenantId: tenant, ownerUserId: owner });
    expect(() => service.snapshot(userId('another_owner'))).toThrow(StrategyContextPermissionError);
  });
});

type RecordedQuery = Readonly<{ sql: string; values: readonly unknown[] }>;

class RecordingTransaction implements SqlTransaction {
  public readonly queries: RecordedQuery[] = [];
  public constructor(private readonly results: SqlQueryResult<unknown>[]) {}
  public query<Row>(sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.queries.push({ sql, values });
    return Promise.resolve((this.results.shift() ?? { rows: [], rowCount: 0 }) as SqlQueryResult<Row>);
  }
}

class RecordingRunner implements SqlTransactionRunner {
  public transactions = 0;
  public constructor(public readonly sql: RecordingTransaction) {}
  public async transaction<Result>(operation: (transaction: SqlTransaction) => Promise<Result>): Promise<Result> {
    this.transactions += 1;
    return operation(this.sql);
  }
}

describe('Postgres strategy context repository', () => {
  it('updates context, expires approval, and appends audit/outbox in one transaction', async () => {
    const sql = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [{ request_id: 'strategy_request_one' }], rowCount: 1 },
      { rows: [{ revision: '1' }], rowCount: 1 },
      { rows: [{ id: '33333333-3333-4333-8333-333333333333' }], rowCount: 1 },
      { rows: [{ id: '44444444-4444-4444-8444-444444444444' }], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    const runner = new RecordingRunner(sql);
    const repository = new PostgresStrategyContextRepository(
      runner,
      { tenantId: tenant, ownerUserId: owner, workflowId: 'workbench_today' },
      defaultStrategyContext(tenant, owner),
    );

    const result = await repository.save({ ...command(), tenantId: tenant });

    expect(result).toMatchObject({ outcome: 'saved', snapshot: { revision: 2 } });
    expect(runner.transactions).toBe(1);
    expect(sql.queries[0]?.sql).toContain("set_config('app.tenant_id'");
    expect(sql.queries.some((query) => query.sql.includes('app.strategy_context_states'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes("status = 'awaiting_approval'"))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('approved_action_ref = NULL'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.audit_events'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.outbox_events'))).toBe(true);
  });
});
