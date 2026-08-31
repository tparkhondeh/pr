import { describe, expect, it } from 'vitest';
import type {
  SqlQueryResult,
  SqlTransaction,
  SqlTransactionRunner,
} from '../src/database/sql.js';
import { PostgresWorkbenchApprovalRepository } from '../src/workbench/approval-repository.js';

type RecordedQuery = Readonly<{ sql: string; values: readonly unknown[] }>;

class RecordingTransaction implements SqlTransaction {
  public readonly queries: RecordedQuery[] = [];

  public constructor(private readonly results: SqlQueryResult<unknown>[]) {}

  public query<Row>(sql: string, values: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.queries.push({ sql, values });
    const result = this.results.shift() ?? { rows: [], rowCount: 0 };
    return Promise.resolve(result as SqlQueryResult<Row>);
  }
}

class RecordingRunner implements SqlTransactionRunner {
  public transactions = 0;

  public constructor(public readonly sql: RecordingTransaction) {}

  public async transaction<Result>(
    operation: (transaction: SqlTransaction) => Promise<Result>,
  ): Promise<Result> {
    this.transactions += 1;
    return operation(this.sql);
  }
}

const context = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  ownerUserId: '22222222-2222-4222-8222-222222222222',
  workflowId: 'workbench_today',
};

const approvedRow = {
  workflow_id: context.workflowId,
  revision: '2',
  approved_action_ref: 'conversation',
  approved_by: context.ownerUserId,
  approved_at: '2026-08-31T12:00:00.000Z',
};

describe('Postgres workbench approval repository', () => {
  it('sets tenant RLS context before reading approval state', async () => {
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [approvedRow], rowCount: 1 },
    ]);
    const runner = new RecordingRunner(transaction);
    const repository = new PostgresWorkbenchApprovalRepository(runner, context);

    await expect(repository.find()).resolves.toMatchObject({
      actionId: 'conversation',
      revision: 2,
    });
    expect(runner.transactions).toBe(1);
    expect(transaction.queries[0]?.sql).toContain("set_config('app.tenant_id'");
    expect(transaction.queries[0]?.values).toEqual([context.tenantId]);
  });

  it('persists approval with optimistic locking, audit and outbox atomically', async () => {
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [approvedRow], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    const runner = new RecordingRunner(transaction);
    const repository = new PostgresWorkbenchApprovalRepository(runner, context);

    const result = await repository.approve({
      actionId: 'conversation',
      actorUserId: context.ownerUserId,
      occurredAt: new Date('2026-08-31T12:00:00.000Z'),
      expectedRevision: 1,
    });

    expect(result.outcome).toBe('approved');
    expect(runner.transactions).toBe(1);
    expect(transaction.queries).toHaveLength(5);
    expect(transaction.queries[2]?.sql).toContain("status = 'awaiting_approval'");
    expect(transaction.queries[2]?.sql).toContain('revision = $7');
    expect(transaction.queries[3]?.sql).toContain('app.audit_events');
    expect(transaction.queries[4]?.sql).toContain('app.outbox_events');
  });

  it('returns an explainable conflict without duplicating audit events', async () => {
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      {
        rows: [{ ...approvedRow, approved_action_ref: 'essay' }],
        rowCount: 1,
      },
    ]);
    const repository = new PostgresWorkbenchApprovalRepository(
      new RecordingRunner(transaction),
      context,
    );

    const result = await repository.approve({
      actionId: 'conversation',
      actorUserId: context.ownerUserId,
      occurredAt: new Date('2026-08-31T12:01:00.000Z'),
      expectedRevision: 1,
    });

    expect(result).toMatchObject({
      outcome: 'conflict',
      record: { actionId: 'essay' },
    });
    expect(transaction.queries.some((query) => query.sql.includes('app.audit_events'))).toBe(false);
    expect(transaction.queries.some((query) => query.sql.includes('app.outbox_events'))).toBe(false);
  });
});
