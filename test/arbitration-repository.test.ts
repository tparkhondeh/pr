import { describe, expect, it } from 'vitest';
import {
  ArbitrationConflictError,
  PostgresArbitrationRepository,
  type ArbitrationCaseSnapshot,
} from '../src/arbitration/decision-arbitration.js';
import type { SqlQueryResult, SqlTransaction, SqlTransactionRunner } from '../src/database/sql.js';
import { tenantId, userId } from '../src/kernel/identity.js';

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
};
const snapshot = arbitrationSnapshot();

describe('Postgres arbitration repository', () => {
  it('sets tenant RLS context before reading owner cases', async () => {
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [{ client_ref: snapshot.requestId, request_sha256: 'a'.repeat(64), result_snapshot: snapshot }], rowCount: 1 },
    ]);
    const repository = new PostgresArbitrationRepository(new RecordingRunner(transaction), context);

    await expect(repository.list(tenantId(context.tenantId), userId(context.ownerUserId)))
      .resolves.toEqual([snapshot]);
    expect(transaction.queries[0]?.sql).toContain("set_config('app.tenant_id'");
    expect(transaction.queries[1]?.sql).toContain('app.arbitration_cases');
  });

  it('persists the immutable snapshot with audit and outbox in one transaction', async () => {
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    const runner = new RecordingRunner(transaction);
    const repository = new PostgresArbitrationRepository(runner, context);

    const result = await repository.save({
      tenantId: tenantId(context.tenantId),
      actorId: userId(context.ownerUserId),
      requestFingerprint: 'a'.repeat(64),
      snapshot,
    });

    expect(result.outcome).toBe('applied');
    expect(runner.transactions).toBe(1);
    expect(transaction.queries).toHaveLength(6);
    expect(transaction.queries[3]?.sql).toContain('app.arbitration_cases');
    expect(transaction.queries[4]?.sql).toContain('app.audit_events');
    expect(transaction.queries[5]?.sql).toContain('app.outbox_events');
    expect(transaction.queries[3]?.values[8]).toBe('intermodule-arbitration-v1');
  });

  it('replays an exact request and rejects a conflicting reuse without duplicate audit', async () => {
    const exact = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ client_ref: snapshot.requestId, request_sha256: 'a'.repeat(64), result_snapshot: snapshot }], rowCount: 1 },
    ]);
    const replayRepository = new PostgresArbitrationRepository(new RecordingRunner(exact), context);
    await expect(replayRepository.save({
      tenantId: tenantId(context.tenantId),
      actorId: userId(context.ownerUserId),
      requestFingerprint: 'a'.repeat(64),
      snapshot,
    })).resolves.toMatchObject({ outcome: 'already_applied' });
    expect(exact.queries.some((query) => query.sql.includes('app.audit_events'))).toBe(false);

    const conflict = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [{ client_ref: snapshot.requestId, request_sha256: 'b'.repeat(64), result_snapshot: snapshot }], rowCount: 1 },
    ]);
    const conflictRepository = new PostgresArbitrationRepository(new RecordingRunner(conflict), context);
    await expect(conflictRepository.save({
      tenantId: tenantId(context.tenantId),
      actorId: userId(context.ownerUserId),
      requestFingerprint: 'a'.repeat(64),
      snapshot,
    })).rejects.toBeInstanceOf(ArbitrationConflictError);
  });
});

function arbitrationSnapshot(): ArbitrationCaseSnapshot {
  return {
    caseId: '33333333-3333-4333-8333-333333333333',
    requestId: 'arbitration_repo_1',
    policyVersion: 'intermodule-arbitration-v1',
    createdAt: '2026-08-31T12:00:00.000Z',
    validUntil: '2026-09-01T12:00:00.000Z',
    contextHash: 'c'.repeat(64),
    snapshotHash: 'd'.repeat(64),
    action: { id: 'essay', title: 'یادداشت تحلیلی', kind: 'content', hash: 'e'.repeat(64) },
    request: {
      sourceModule: 'workbench',
      operation: 'evaluate_action',
      purpose: 'strategy_reasoning',
      requestedAutonomyLevel: 4,
      readAuthority: 'owner_scoped_snapshot',
      writeAuthority: 'append_decision_only',
    },
    opinions: [{
      contractVersion: 'module-opinion-v1',
      module: 'strategy',
      moduleVersion: 'strategy-ranking-v1',
      position: 'support',
      confidence: 0.8,
      appliesFromAutonomyLevel: 2,
      rationale: 'Grounded strategy support.',
      provenanceRefs: ['strategy_revision:1'],
      authority: { read: 'owner_scoped_snapshot', write: 'none' },
    }],
    decision: {
      outcome: 'recommendation_ready',
      effectiveAutonomyLevel: 4,
      requiresHumanApproval: true,
      executionPermitted: false,
      dissentPreserved: false,
      blockingModules: [],
      unknownModules: [],
      downgradeReasons: [],
      appliedRules: ['single_module_cannot_override_blocker'],
      rationale: 'Recommendation only.',
    },
  };
}
