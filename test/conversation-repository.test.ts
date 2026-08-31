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

const rightProposalRow = {
  proposal_id: '55555555-5555-4555-8555-555555555555',
  subject_user_id: ownerValue,
  status: 'confirmed',
  root_assertion_id: '44444444-4444-4444-8444-444444444444',
  active_assertion_id: '44444444-4444-4444-8444-444444444444',
  active_valid_from: occurredAt.toISOString(),
  confirmed_at: occurredAt.toISOString(),
  deleted_at: null,
  contested_at: null,
  contest_reason: null,
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
          deleted_at: null,
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
    expect(transaction.queries[5]?.values[3]).toBe(
      '44444444-4444-4444-8444-444444444444',
    );
    expect(transaction.queries[5]?.values[4]).toEqual([
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
          deleted_at: null,
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

  it('corrects memory, moves scoped consent and records one rights request', async () => {
    const rightAt = new Date('2026-08-31T13:20:00.000Z');
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [rightProposalRow], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: '66666666-6666-4666-8666-666666666666' }], rowCount: 1 },
      { rows: [{ id: '77777777-7777-4777-8777-777777777777' }], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 2 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    const repository = new PostgresConversationMemoryRepository(
      new RecordingRunner(transaction),
      { tenantId: tenantValue, ownerUserId: ownerValue },
    );

    const result = await repository.applyRight({
      tenantId: tenant,
      actorId: owner,
      proposalId: proposal.id,
      requestId: 'right_repo_correct',
      operation: {
        kind: 'correct',
        reason: 'عبارت پیشین بیش از حد مطلق بود.',
        correctedText: 'در موقعیت‌های کم‌ریسک معمولاً سریع تصمیم می‌گیرم.',
      },
      occurredAt: rightAt,
    });

    expect(result).toMatchObject({
      outcome: 'applied',
      operation: 'correct',
      activeAssertionId: '77777777-7777-4777-8777-777777777777',
      permissionsRevoked: false,
    });
    expect(transaction.queries).toHaveLength(12);
    expect(transaction.queries[3]?.sql).toContain('app.evidence_items');
    expect(transaction.queries[4]?.sql).toContain('supersedes_id');
    expect(transaction.queries[7]?.sql).toContain('WITH revoked AS');
    expect(transaction.queries[9]?.sql).toContain('app.memory_rights_requests');
    expect(transaction.queries[10]?.sql).toContain('app.audit_events');
    expect(transaction.queries[11]?.sql).toContain('app.outbox_events');
  });

  it('soft-deletes an assertion lineage, evidence and scoped consent', async () => {
    const rightAt = new Date('2026-08-31T13:21:00.000Z');
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [rightProposalRow], rowCount: 1 },
      { rows: [], rowCount: 0 },
      {
        rows: [
          { id: '44444444-4444-4444-8444-444444444444' },
          { id: '77777777-7777-4777-8777-777777777777' },
        ],
        rowCount: 2,
      },
      { rows: [], rowCount: 2 },
      { rows: [], rowCount: 2 },
      { rows: [], rowCount: 2 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);
    const repository = new PostgresConversationMemoryRepository(
      new RecordingRunner(transaction),
      { tenantId: tenantValue, ownerUserId: ownerValue },
    );

    const result = await repository.applyRight({
      tenantId: tenant,
      actorId: owner,
      proposalId: proposal.id,
      requestId: 'right_repo_delete',
      operation: { kind: 'delete', reason: 'درخواست حذف کامل حافظه.' },
      occurredAt: rightAt,
    });

    expect(result).toMatchObject({
      outcome: 'applied',
      operation: 'delete',
      permissionsRevoked: true,
    });
    expect(transaction.queries).toHaveLength(11);
    expect(transaction.queries[3]?.sql).toContain('WITH RECURSIVE lineage');
    expect(transaction.queries[4]?.sql).toContain('deletion_reason');
    expect(transaction.queries[5]?.sql).toContain('app.evidence_items');
    expect(transaction.queries[6]?.sql).toContain('app.consent_grants');
    expect(transaction.queries[7]?.sql).toContain('app.memory_proposals');
  });

  it('returns the stored result for an idempotent rights retry', async () => {
    const rightAt = new Date('2026-08-31T13:22:00.000Z');
    const operation = { kind: 'revoke' as const, reason: 'لغو مجوز استفاده.' };
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      { rows: [rightProposalRow], rowCount: 1 },
      {
        rows: [{
          proposal_id: rightProposalRow.proposal_id,
          operation: 'revoke',
          request_sha256: createHash('sha256').update(JSON.stringify({
            proposalId: proposal.id,
            operation,
          })).digest('hex'),
          result: {
            operation: 'revoke',
            proposalId: proposal.id,
            requestId: 'right_repo_retry',
            activeAssertionId: rightProposalRow.active_assertion_id,
            permissionsRevoked: true,
            occurredAt: rightAt.toISOString(),
          },
          requested_at: rightAt.toISOString(),
        }],
        rowCount: 1,
      },
    ]);
    const repository = new PostgresConversationMemoryRepository(
      new RecordingRunner(transaction),
      { tenantId: tenantValue, ownerUserId: ownerValue },
    );

    const result = await repository.applyRight({
      tenantId: tenant,
      actorId: owner,
      proposalId: proposal.id,
      requestId: 'right_repo_retry',
      operation,
      occurredAt: new Date('2026-08-31T13:30:00.000Z'),
    });

    expect(result).toMatchObject({ outcome: 'already_applied', operation: 'revoke' });
    expect(transaction.queries).toHaveLength(3);
  });

  it('lists current memory with provenance and redacts deleted content', async () => {
    const deletedAt = new Date('2026-08-31T13:40:00.000Z');
    const baseRow = {
      proposal_ref: proposal.id,
      assertion_id: '44444444-4444-4444-8444-444444444444',
      assertion_value: proposal.text,
      epistemic_type: 'self_report',
      data_class: 'confidential',
      confidence: '0.500',
      confidence_rationale: 'Single user self-report; not independently corroborated.',
      evidence_count: 1,
      source_types: ['conversation_turn'],
      personal_understanding: true,
      brand_usage: false,
      public_usage: false,
      revision_count: 1,
      confirmed_at: occurredAt.toISOString(),
      updated_at: occurredAt.toISOString(),
      contested_at: null,
      contest_reason: null,
      revoked_at: null,
      deleted_at: null,
      deletion_reason: null,
    } as const;
    const transaction = new RecordingTransaction([
      { rows: [], rowCount: 1 },
      {
        rows: [
          baseRow,
          {
            ...baseRow,
            proposal_ref: 'memory_deleted_repo',
            assertion_id: '88888888-8888-4888-8888-888888888888',
            assertion_value: 'This content must be redacted.',
            personal_understanding: false,
            evidence_count: 0,
            source_types: [],
            updated_at: deletedAt.toISOString(),
            revoked_at: deletedAt.toISOString(),
            deleted_at: deletedAt.toISOString(),
            deletion_reason: 'User requested deletion.',
          },
        ],
        rowCount: 2,
      },
    ]);
    const repository = new PostgresConversationMemoryRepository(
      new RecordingRunner(transaction),
      { tenantId: tenantValue, ownerUserId: ownerValue },
    );

    const records = await repository.listMemory(tenant, owner);

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      text: proposal.text,
      provenance: { evidenceCount: 1, sourceTypes: ['conversation_turn'] },
      consent: { personalUnderstanding: true, brandUsage: false, publicUsage: false },
      lifecycle: { status: 'active', revisionCount: 1 },
    });
    expect(records[1]).toMatchObject({
      text: null,
      lifecycle: { status: 'deleted', deletionReason: 'User requested deletion.' },
    });
    expect(transaction.queries).toHaveLength(2);
    expect(transaction.queries[1]?.sql).toContain('LEFT JOIN LATERAL');
    expect(transaction.queries[1]?.sql).toContain('WITH RECURSIVE lineage');
    expect(transaction.queries[1]?.sql).toContain("resource_type = 'assertion'");
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
    await expect(repository.applyRight({
      tenantId: tenant,
      actorId: userId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      proposalId: proposal.id,
      requestId: 'right_cross_owner',
      operation: { kind: 'revoke', reason: 'Cross-owner request must fail.' },
      occurredAt,
    })).rejects.toThrow(ConversationRepositoryPermissionError);
    await expect(repository.listMemory(
      tenant,
      userId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    )).rejects.toThrow(ConversationRepositoryPermissionError);
    expect(runner.transactions).toBe(0);
  });
});
