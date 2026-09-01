import { describe, expect, it } from 'vitest';
import type { SqlQueryResult, SqlTransaction, SqlTransactionRunner } from '../src/database/sql.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  DecisionContextConflictError,
  DecisionContextPermissionError,
  DecisionContextService,
  DecisionContextValidationError,
  InMemoryDecisionContextRepository,
  PostgresDecisionContextRepository,
  defaultDecisionContext,
  type EditableDecisionContext,
} from '../src/strategy/decision-context.js';
import { InMemoryWorkbenchApprovalRepository } from '../src/workbench/approval-repository.js';
import {
  createDefaultWorkbenchService,
} from '../src/workbench/workbench.js';
import { groundedEvidence } from './support/grounded-evidence.js';

const tenant = tenantId('11111111-1111-4111-8111-111111111111');
const owner = userId('22222222-2222-4222-8222-222222222222');
const changedAt = new Date('2026-08-31T16:00:00.000Z');
const value: EditableDecisionContext = {
  attentionBudget: {
    availableMinutes: 90,
    maximumEnergyCost: 2,
    attentionCapacity: 2,
    visibilityTolerance: 3,
    emotionalBandwidth: 2,
  },
};

function command(requestId = 'decision_context_one') {
  return {
    actorId: owner,
    requestId,
    expectedRevision: 1,
    value,
    occurredAt: changedAt,
  } as const;
}

describe('decision context lifecycle', () => {
  it('versions owner edits, makes retries idempotent, and invalidates old approval', async () => {
    const approvals = new InMemoryWorkbenchApprovalRepository();
    await approvals.approve({
      actionId: 'conversation', evidenceIds: ['evidence_context'], actorUserId: owner,
      occurredAt: changedAt, expectedRevision: 1, strategyRevision: 1,
      decisionContextRevision: 1, decisionContextHash: defaultDecisionContext().contextHash,
      decisionWindowEndsAt: new Date(changedAt.getTime() + 86_400_000),
    });
    const service = new DecisionContextService(
      new InMemoryDecisionContextRepository(defaultDecisionContext(), approvals),
      { tenantId: tenant, ownerUserId: owner },
    );

    const first = await service.save(command());
    const replay = await service.save(command());

    expect(first).toMatchObject({
      outcome: 'saved',
      snapshot: { revision: 2, attentionBudget: value.attentionBudget },
    });
    expect(first.snapshot.contextHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(replay).toMatchObject({ outcome: 'already_saved', snapshot: { revision: 2 } });
    await expect(approvals.find(1, 2, changedAt)).resolves.toBeNull();
    await expect(service.save({ ...command('decision_context_stale'), expectedRevision: 1 }))
      .rejects.toBeInstanceOf(DecisionContextConflictError);
  });

  it('allows only the owner and validates all five independent capacities', () => {
    const service = new DecisionContextService(
      new InMemoryDecisionContextRepository(defaultDecisionContext()),
      { tenantId: tenant, ownerUserId: owner },
    );
    expect(() => service.snapshot(userId('another_owner'))).toThrow(DecisionContextPermissionError);
    expect(() => service.save({
      ...command('decision_context_invalid'),
      value: { attentionBudget: { ...value.attentionBudget, attentionCapacity: 0 as 1 } },
    })).toThrow(DecisionContextValidationError);
  });

  it('rejects a stale or expired client approval and leaves no current approval after a save race', async () => {
    let now = new Date('2026-08-31T12:00:00.000Z');
    const approvals = new InMemoryWorkbenchApprovalRepository();
    const contexts = new DecisionContextService(
      new InMemoryDecisionContextRepository(defaultDecisionContext(now), approvals),
      { tenantId: tenantId('tenant_primary'), ownerUserId: userId('owner_primary') },
    );
    const workbench = createDefaultWorkbenchService(
      () => now,
      approvals,
      { tenantId: 'tenant_primary', ownerUserId: 'owner_primary' },
      undefined,
      groundedEvidence(now),
      contexts,
    );
    const before = await workbench.snapshot();
    const action = before.actions.find((candidate) => candidate.id === 'conversation');
    if (!action) throw new Error('Expected conversation action.');
    const expectation = {
      strategyRevision: action.decision.strategyRevision,
      decisionContextRevision: action.decision.decisionContextRevision,
      decisionContextHash: action.decision.decisionContextHash,
      decisionWindowEndsAt: action.decision.decisionWindowEndsAt,
    };

    await Promise.allSettled([
      workbench.approve('conversation', userId('owner_primary'), now, expectation),
      contexts.save({
        actorId: userId('owner_primary'), requestId: 'decision_context_race',
        expectedRevision: 1, value, occurredAt: new Date(now.getTime() + 1),
      }),
    ]);
    const after = await workbench.snapshot();
    expect(after.decisionContext.revision).toBe(2);
    expect(after.workflow.status).toBe('awaiting_approval');
    await expect(workbench.approve('conversation', userId('owner_primary'), now, expectation))
      .rejects.toMatchObject({
        reason: 'decision_context_changed',
      });

    now = new Date(new Date(expectation.decisionWindowEndsAt).getTime() + 1);
    const current = await workbench.snapshot();
    const currentAction = current.actions.find((candidate) => candidate.id === 'conversation');
    if (!currentAction) throw new Error('Expected current conversation action.');
    await expect(workbench.approve('conversation', userId('owner_primary'), now, {
      strategyRevision: currentAction.decision.strategyRevision,
      decisionContextRevision: currentAction.decision.decisionContextRevision,
      decisionContextHash: currentAction.decision.decisionContextHash,
      decisionWindowEndsAt: expectation.decisionWindowEndsAt,
    })).rejects.toMatchObject({ reason: 'decision_expired' });
  });

  it('fails closed when a stored approval revision matches but its context hash does not', async () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    const approvals = new InMemoryWorkbenchApprovalRepository();
    await approvals.approve({
      actionId: 'conversation', evidenceIds: ['evidence_mismatched_hash'],
      actorUserId: userId('owner_primary'), occurredAt: now, expectedRevision: 1,
      strategyRevision: 1, decisionContextRevision: 1,
      decisionContextHash: 'b'.repeat(64),
      decisionWindowEndsAt: new Date(now.getTime() + 86_400_000),
    });
    const workbench = createDefaultWorkbenchService(
      () => now, approvals, { tenantId: 'tenant_primary', ownerUserId: 'owner_primary' },
      undefined, groundedEvidence(now),
    );
    const snapshot = await workbench.snapshot();
    expect(snapshot.workflow.status).toBe('awaiting_approval');
    expect(snapshot.workflow).not.toHaveProperty('approvedActionId');
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

describe('Postgres decision context repository', () => {
  it('saves state, expires approval, and appends audit/outbox in one tenant transaction', async () => {
    const sql = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [{ request_id: 'decision_context_one' }], rowCount: 1 },
      { rows: [{ revision: '1' }], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    const runner = new RecordingRunner(sql);
    const repository = new PostgresDecisionContextRepository(
      runner,
      { tenantId: tenant, ownerUserId: owner, workflowId: 'workbench_today' },
      defaultDecisionContext(),
    );

    const result = await repository.save({ ...command(), tenantId: tenant });

    expect(result).toMatchObject({ outcome: 'saved', snapshot: { revision: 2, persistence: 'postgres' } });
    expect(runner.transactions).toBe(1);
    expect(sql.queries[0]?.sql).toContain("set_config('app.tenant_id'");
    expect(sql.queries.some((query) => query.sql.includes('app.decision_context_states'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes("status = 'awaiting_approval'"))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('approved_context_sha256 = NULL'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.audit_events'))).toBe(true);
    expect(sql.queries.some((query) => query.sql.includes('app.outbox_events'))).toBe(true);
  });
});
