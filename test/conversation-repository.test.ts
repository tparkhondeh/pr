import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ConversationRepositoryPermissionError,
  PostgresConversationMemoryRepository,
} from '../src/conversation/repository.js';
import type {
  SqlQueryResult,
  SqlTransaction,
  SqlTransactionRunner,
} from '../src/database/sql.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import type { MemoryProposal } from '../src/conversation/intake.js';

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

const tenantValue = '11111111-1111-4111-8111-111111111111';
const ownerValue = '22222222-2222-4222-8222-222222222222';
const tenant = tenantId(tenantValue);
const owner = userId(ownerValue);
const occurredAt = new Date('2026-08-31T13:00:00.000Z');
const proposal: MemoryProposal = {
  id: 'memory_turn_repo',
  tenantId: tenant,
  ownerUserId: owner,
  conversationId: 'conversation_repo',
  turnId: 'turn_repo',
  text: 'صداقت در ابهام برای من مهم است.',
  epistemicType: 'self_report',
  dataClass: 'confidential',
  status: 'awaiting_user_confirmation',
  occurredAt,
  followUpQuestion: 'یک موقعیت واقعی را تعریف می‌کنی؟',
};

const proposalRow = {
  tenant_id: tenantValue,
  external_ref: proposal.id,
  conversation_ref: proposal.conversationId,
  turn_ref: proposal.turnId,
  user_text: proposal.text,
  epistemic_type: 'self_report',
  data_class: 'confidential',
  occurred_at: occurredAt.toISOString(),
  assistant_question: proposal.followUpQuestion,
  subject_user_id: ownerValue,
};

describe('Postgres conversation memory repository', () => {
  it('persists an idempotent turn and proposal under tenant RLS context', async () => {
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      {
        rows: [{
          conversation_ref: proposal.conversationId,
          user_text: proposal.text,
          assistant_question: proposal.followUpQuestion,
          propose_memory: true,
          content_sha256: createHash('sha256').update(proposal.text).digest('hex'),
        }],
        rowCount: 1,
      },
      { rows: [proposalRow], rowCount: 1 },
    ]);
    const runner = new RecordingRunner(transaction);
    const repository = new PostgresConversationMemoryRepository(runner, {
      tenantId: tenantValue,
      ownerUserId: ownerValue,
    });

    const persisted = await repository.saveTurn({
      tenantId: tenant,
      actorId: owner,
      conversationId: proposal.conversationId,
      turnId: proposal.turnId,
      text: proposal.text,
      proposeMemory: true,
      occurredAt,
      followUpQuestion: proposal.followUpQuestion,
      proposal,
    });

    expect(persisted).toMatchObject({ id: proposal.id, text: proposal.text });
    expect(runner.transactions).toBe(1);
    expect(transaction.queries[0]?.sql).toContain("set_config('app.tenant_id'");
    expect(transaction.queries[1]?.sql).toContain('app.conversation_turns');
    expect(transaction.queries[2]?.sql).toContain('app.memory_proposals');
  });

  it('confirms evidence, assertion, consent, audit and outbox in one transaction', async () => {
    const confirmedAt = new Date('2026-08-31T13:01:00.000Z');
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      {
        rows: [{
          ...proposalRow,
          status: 'proposed',
          permissions: null,
          evidence_id: null,
          assertion_id: null,
          confirmed_at: null,
        }],
        rowCount: 1,
      },
      { rows: [{ id: '33333333-3333-4333-8333-333333333333' }], rowCount: 1 },
      { rows: [{ id: '44444444-4444-4444-8444-444444444444' }], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 2 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    const runner = new RecordingRunner(transaction);
    const repository = new PostgresConversationMemoryRepository(runner, {
      tenantId: tenantValue,
      ownerUserId: ownerValue,
    });

    const result = await repository.confirm({
      proposal,
      actorId: owner,
      permissions: {
        personalUnderstanding: true,
        brandUsage: false,
        publicUsage: false,
      },
      confirmedAt,
    });

    expect(result).toMatchObject({
      outcome: 'confirmed',
      evidenceId: '33333333-3333-4333-8333-333333333333',
      assertionId: '44444444-4444-4444-8444-444444444444',
    });
    expect(runner.transactions).toBe(1);
    expect(transaction.queries).toHaveLength(9);
    expect(transaction.queries[2]?.sql).toContain('app.evidence_items');
    expect(transaction.queries[3]?.sql).toContain('app.assertions');
    expect(transaction.queries[4]?.sql).toContain('app.assertion_evidence');
    expect(transaction.queries[5]?.sql).toContain('app.consent_grants');
    expect(transaction.queries[5]?.values[3]).toEqual([
      'personal_understanding',
      'personal_understanding',
    ]);
    expect(transaction.queries[7]?.sql).toContain('app.audit_events');
    expect(transaction.queries[8]?.sql).toContain('app.outbox_events');
  });

  it('returns an existing confirmation without duplicating side effects', async () => {
    const confirmedAt = '2026-08-31T13:01:00.000Z';
    const permissions = {
      personalUnderstanding: true,
      brandUsage: false,
      publicUsage: false,
    };
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      {
        rows: [{
          ...proposalRow,
          status: 'confirmed',
          permissions,
          evidence_id: '33333333-3333-4333-8333-333333333333',
          assertion_id: '44444444-4444-4444-8444-444444444444',
          confirmed_at: confirmedAt,
        }],
        rowCount: 1,
      },
    ]);
    const repository = new PostgresConversationMemoryRepository(
      new RecordingRunner(transaction),
      { tenantId: tenantValue, ownerUserId: ownerValue },
    );

    const result = await repository.confirm({
      proposal,
      actorId: owner,
      permissions,
      confirmedAt: new Date(confirmedAt),
    });

    expect(result.outcome).toBe('already_confirmed');
    expect(transaction.queries).toHaveLength(2);
  });

  it('rejects cross-tenant or cross-owner access before opening a transaction', async () => {
    const runner = new RecordingRunner(new RecordingTransaction([]));
    const repository = new PostgresConversationMemoryRepository(runner, {
      tenantId: tenantValue,
      ownerUserId: ownerValue,
    });

    await expect(
      repository.saveTurn({
        tenantId: tenantId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        actorId: owner,
        conversationId: proposal.conversationId,
        turnId: proposal.turnId,
        text: proposal.text,
        proposeMemory: false,
        occurredAt,
        followUpQuestion: proposal.followUpQuestion,
      }),
    ).rejects.toThrow(ConversationRepositoryPermissionError);
    expect(runner.transactions).toBe(0);
  });
});
