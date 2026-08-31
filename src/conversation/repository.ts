import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import { tenantId, userId, type TenantId, type UserId } from '../kernel/identity.js';
import type { MemoryProposal, MemoryUsePermissions } from './intake.js';

export type ConversationTurnPersistenceCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  conversationId: string;
  turnId: string;
  text: string;
  proposeMemory: boolean;
  occurredAt: Date;
  followUpQuestion: string;
  proposal?: MemoryProposal;
}>;

export type MemoryConfirmationPersistenceResult =
  | Readonly<{
      outcome: 'confirmed' | 'already_confirmed';
      assertionId: string;
      evidenceId: string;
      permissions: MemoryUsePermissions;
      confirmedAt: Date;
    }>
  | Readonly<{
      outcome: 'conflict';
      permissions: MemoryUsePermissions;
    }>
  | Readonly<{ outcome: 'not_found' }>;

export interface ConversationMemoryRepository {
  readonly persistence: 'memory' | 'postgres';
  saveTurn(command: ConversationTurnPersistenceCommand): Promise<MemoryProposal | undefined>;
  findProposal(tenant: TenantId, proposalId: string): Promise<MemoryProposal | null>;
  confirm(request: Readonly<{
    proposal: MemoryProposal;
    actorId: UserId;
    permissions: MemoryUsePermissions;
    confirmedAt: Date;
  }>): Promise<MemoryConfirmationPersistenceResult>;
}

type StoredConfirmation = Exclude<
  MemoryConfirmationPersistenceResult,
  Readonly<{ outcome: 'conflict' }> | Readonly<{ outcome: 'not_found' }>
>;

export class InMemoryConversationMemoryRepository implements ConversationMemoryRepository {
  public readonly persistence = 'memory' as const;
  readonly #turnFingerprints = new Map<string, string>();
  readonly #proposals = new Map<string, MemoryProposal>();
  readonly #confirmed = new Map<string, StoredConfirmation>();

  public saveTurn(
    command: ConversationTurnPersistenceCommand,
  ): Promise<MemoryProposal | undefined> {
    const turnKey = `${command.tenantId}:${command.actorId}:${command.turnId}`;
    const fingerprint = turnFingerprint(command);
    const existingFingerprint = this.#turnFingerprints.get(turnKey);
    if (existingFingerprint && existingFingerprint !== fingerprint) {
      return Promise.reject(
        new ConversationRepositoryConflictError('Turn ID has conflicting content.'),
      );
    }
    this.#turnFingerprints.set(turnKey, fingerprint);

    if (!command.proposal) return Promise.resolve(undefined);
    const existing = this.#proposals.get(command.proposal.id);
    if (existing && !sameProposal(existing, command.proposal)) {
      return Promise.reject(
        new ConversationRepositoryConflictError('Proposal ID has conflicting content.'),
      );
    }
    this.#proposals.set(command.proposal.id, existing ?? command.proposal);
    return Promise.resolve(existing ?? command.proposal);
  }

  public findProposal(tenant: TenantId, proposalId: string): Promise<MemoryProposal | null> {
    const proposal = this.#proposals.get(proposalId);
    return Promise.resolve(proposal?.tenantId === tenant ? proposal : null);
  }

  public confirm(request: Readonly<{
    proposal: MemoryProposal;
    actorId: UserId;
    permissions: MemoryUsePermissions;
    confirmedAt: Date;
  }>): Promise<MemoryConfirmationPersistenceResult> {
    const existing = this.#confirmed.get(request.proposal.id);
    if (existing) {
      return Promise.resolve(
        samePermissions(existing.permissions, request.permissions)
          ? { ...existing, outcome: 'already_confirmed' }
          : { outcome: 'conflict', permissions: existing.permissions },
      );
    }
    const confirmed: StoredConfirmation = {
      outcome: 'confirmed',
      assertionId: `assertion_${request.proposal.turnId}`,
      evidenceId: `evidence_${request.proposal.turnId}`,
      permissions: request.permissions,
      confirmedAt: request.confirmedAt,
    };
    this.#confirmed.set(request.proposal.id, confirmed);
    return Promise.resolve(confirmed);
  }
}

export class ConversationRepositoryConflictError extends Error {}

type ProposalRow = Readonly<{
  tenant_id: string;
  external_ref: string;
  conversation_ref: string;
  turn_ref: string;
  user_text: string;
  epistemic_type: 'self_report';
  data_class: 'confidential';
  occurred_at: Date | string;
  assistant_question: string;
  subject_user_id: string;
}>;

type ConfirmationRow = ProposalRow & Readonly<{
  status: 'proposed' | 'confirmed' | 'rejected' | 'expired';
  permissions: unknown;
  evidence_id: string | null;
  assertion_id: string | null;
  confirmed_at: Date | string | null;
}>;

type IdRow = Readonly<{ id: string }>;

export class PostgresConversationMemoryRepository implements ConversationMemoryRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public async saveTurn(
    command: ConversationTurnPersistenceCommand,
  ): Promise<MemoryProposal | undefined> {
    this.assertContext(command.tenantId, command.actorId);
    return await this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const turn = await transaction.query<Readonly<{
        conversation_ref: string;
        user_text: string;
        assistant_question: string;
        propose_memory: boolean;
        content_sha256: string;
      }>>(
        `WITH thread AS (
           INSERT INTO app.conversation_threads (
             tenant_id, owner_user_id, external_ref, updated_at
           ) VALUES ($1, $2, $3, $7)
           ON CONFLICT (tenant_id, owner_user_id, external_ref)
           DO UPDATE SET updated_at = GREATEST(
             app.conversation_threads.updated_at,
             EXCLUDED.updated_at
           )
           RETURNING id
         ), inserted AS (
           INSERT INTO app.conversation_turns (
             tenant_id, thread_id, actor_user_id, client_ref, user_text,
             assistant_question, propose_memory, content_sha256, occurred_at
           )
           SELECT $1, id, $2, $4, $5, $6, $8, $9, $7 FROM thread
           ON CONFLICT (tenant_id, actor_user_id, client_ref) DO NOTHING
           RETURNING id
         ), selected AS (
           SELECT id FROM inserted
           UNION ALL
           SELECT id FROM app.conversation_turns
            WHERE tenant_id = $1 AND actor_user_id = $2 AND client_ref = $4
           LIMIT 1
         )
         SELECT thread.external_ref AS conversation_ref, turn.user_text,
                turn.assistant_question, turn.propose_memory,
                turn.content_sha256
           FROM selected
           JOIN app.conversation_turns turn ON turn.id = selected.id AND turn.tenant_id = $1
           JOIN app.conversation_threads thread
             ON thread.id = turn.thread_id AND thread.tenant_id = turn.tenant_id`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          command.conversationId,
          command.turnId,
          command.text,
          command.followUpQuestion,
          command.occurredAt,
          command.proposeMemory,
          textSha256(command.text),
        ],
      );
      const storedTurn = turn.rows[0];
      if (
        !storedTurn ||
        storedTurn.conversation_ref !== command.conversationId ||
        storedTurn.user_text !== command.text ||
        storedTurn.assistant_question !== command.followUpQuestion ||
        storedTurn.propose_memory !== command.proposeMemory ||
        storedTurn.content_sha256 !== textSha256(command.text)
      ) {
        throw new ConversationRepositoryConflictError('Turn ID has conflicting content.');
      }
      if (!command.proposal) return undefined;

      const proposalResult = await transaction.query<ProposalRow>(
        `WITH inserted AS (
           INSERT INTO app.memory_proposals (
             tenant_id, turn_id, subject_user_id, external_ref, predicate, value,
             epistemic_type, data_class, confidence, confidence_rationale, proposed_at
           )
           SELECT $1, turn.id, $2, $4, 'shared_reflection', $5::jsonb,
             'self_report', 'confidential', 0.5,
             'Single user self-report; not independently corroborated.', $6
             FROM app.conversation_turns turn
            WHERE turn.tenant_id = $1 AND turn.actor_user_id = $2 AND turn.client_ref = $3
           ON CONFLICT (tenant_id, external_ref) DO NOTHING
           RETURNING *
         )
         SELECT proposal.tenant_id, proposal.external_ref,
                thread.external_ref AS conversation_ref,
                turn.client_ref AS turn_ref, turn.user_text,
                proposal.epistemic_type, proposal.data_class, turn.occurred_at,
                turn.assistant_question, proposal.subject_user_id
           FROM (
             SELECT * FROM inserted
             UNION ALL
             SELECT * FROM app.memory_proposals
              WHERE tenant_id = $1 AND external_ref = $4
             LIMIT 1
           ) proposal
           JOIN app.conversation_turns turn
             ON turn.tenant_id = proposal.tenant_id AND turn.id = proposal.turn_id
           JOIN app.conversation_threads thread
             ON thread.tenant_id = turn.tenant_id AND thread.id = turn.thread_id`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          command.turnId,
          command.proposal.id,
          JSON.stringify(command.proposal.text),
          command.proposal.occurredAt,
        ],
      );
      const persisted = proposalResult.rows[0];
      if (!persisted) throw new Error('Memory proposal was not persisted.');
      const proposal = toProposal(persisted);
      if (!sameProposal(proposal, command.proposal)) {
        throw new ConversationRepositoryConflictError('Proposal ID has conflicting content.');
      }
      return proposal;
    });
  }

  public findProposal(tenant: TenantId, proposalId: string): Promise<MemoryProposal | null> {
    if (tenant !== this.context.tenantId) return Promise.resolve(null);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<ProposalRow>(proposalSelectSql(), [
        this.context.tenantId,
        proposalId,
      ]);
      return result.rows[0] ? toProposal(result.rows[0]) : null;
    });
  }

  public confirm(request: Readonly<{
    proposal: MemoryProposal;
    actorId: UserId;
    permissions: MemoryUsePermissions;
    confirmedAt: Date;
  }>): Promise<MemoryConfirmationPersistenceResult> {
    this.assertContext(request.proposal.tenantId, request.actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const locked = await transaction.query<ConfirmationRow>(
        `${proposalSelectSql('proposal.status, proposal.permissions, proposal.evidence_id, proposal.assertion_id, proposal.confirmed_at,')}
         FOR UPDATE OF proposal`,
        [this.context.tenantId, request.proposal.id],
      );
      const row = locked.rows[0];
      if (!row) return { outcome: 'not_found' };
      if (row.status === 'confirmed') return existingConfirmation(row, request.permissions);
      if (row.status !== 'proposed') return { outcome: 'not_found' };

      const evidence = await transaction.query<IdRow>(
        `INSERT INTO app.evidence_items (
           tenant_id, source_type, source_locator, content, data_class,
           integrity_sha256, occurred_at, observed_at
         ) VALUES ($1, 'conversation_turn', $2, $3::jsonb, 'confidential', $4, $5, $6)
         RETURNING id`,
        [
          this.context.tenantId,
          `${request.proposal.conversationId}/${request.proposal.turnId}`,
          JSON.stringify({
            text: request.proposal.text,
            conversationId: request.proposal.conversationId,
            turnId: request.proposal.turnId,
          }),
          textSha256(request.proposal.text),
          request.proposal.occurredAt,
          request.confirmedAt,
        ],
      );
      const evidenceId = requiredId(evidence.rows[0], 'Evidence');
      const assertion = await transaction.query<IdRow>(
        `INSERT INTO app.assertions (
           tenant_id, subject_ref, predicate, value, epistemic_type, data_class,
           confidence, confidence_rationale, valid_from, created_at, created_by
         ) VALUES ($1, $2, 'shared_reflection', $3::jsonb, 'self_report',
           'confidential', 0.5,
           'Single user self-report; not independently corroborated.', $4, $5, $2)
         RETURNING id`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          JSON.stringify(request.proposal.text),
          request.proposal.occurredAt,
          request.confirmedAt,
        ],
      );
      const assertionId = requiredId(assertion.rows[0], 'Assertion');
      await transaction.query(
        `INSERT INTO app.assertion_evidence (
           tenant_id, assertion_id, evidence_id, relation, rationale, created_at
         ) VALUES ($1, $2, $3, 'supports', $4, $5)`,
        [
          this.context.tenantId,
          assertionId,
          evidenceId,
          `Conversation ${request.proposal.conversationId}`,
          request.confirmedAt,
        ],
      );
      await insertConsentGrants(transaction, this.context, request.permissions, request.confirmedAt);
      const permissionsJson = JSON.stringify(request.permissions);
      await transaction.query(
        `UPDATE app.memory_proposals
            SET status = 'confirmed', permissions = $3::jsonb, evidence_id = $4,
                assertion_id = $5, confirmed_at = $6
          WHERE tenant_id = $1 AND external_ref = $2 AND status = 'proposed'`,
        [
          this.context.tenantId,
          request.proposal.id,
          permissionsJson,
          evidenceId,
          assertionId,
          request.confirmedAt,
        ],
      );
      const auditMetadata = JSON.stringify({
        proposalId: request.proposal.id,
        assertionId,
        evidenceId,
        permissions: request.permissions,
      });
      await transaction.query(
        `INSERT INTO app.audit_events (
           tenant_id, actor_user_id, event_type, resource_type, resource_id,
           purpose, decision, metadata, occurred_at
         ) VALUES ($1, $2, 'memory.proposal_confirmed', 'assertion', $3,
           'personal_understanding', 'approved', $4::jsonb, $5)`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          assertionId,
          auditMetadata,
          request.confirmedAt,
        ],
      );
      await transaction.query(
        `INSERT INTO app.outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
         ) VALUES ($1, 'assertion', $2, 'memory.proposal_confirmed', $3::jsonb, $4)`,
        [this.context.tenantId, assertionId, auditMetadata, request.confirmedAt],
      );
      return {
        outcome: 'confirmed',
        assertionId,
        evidenceId,
        permissions: request.permissions,
        confirmedAt: request.confirmedAt,
      };
    });
  }

  private assertContext(tenant: TenantId, actor: UserId): void {
    if (tenant !== this.context.tenantId || actor !== this.context.ownerUserId) {
      throw new ConversationRepositoryPermissionError('Conversation repository context mismatch.');
    }
  }
}

export class ConversationRepositoryPermissionError extends Error {}

async function insertConsentGrants(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  permissions: MemoryUsePermissions,
  grantedAt: Date,
): Promise<void> {
  const grants: Array<readonly [string, string]> = [
    ['personal_understanding', 'read'],
    ['personal_understanding', 'process'],
  ];
  if (permissions.brandUsage) {
    grants.push(['brand_usage', 'read'], ['brand_usage', 'process'], ['brand_usage', 'derive']);
  }
  if (permissions.publicUsage) {
    grants.push(
      ['public_drafting', 'read'],
      ['public_drafting', 'process'],
      ['public_drafting', 'derive'],
    );
  }
  await transaction.query(
    `INSERT INTO app.consent_grants (
       tenant_id, subject_user_id, granted_by, purpose, operation, data_class,
       audience, channel, policy_version, granted_at
     )
     SELECT $1, $2, $2, grant_row.purpose::app.consent_purpose,
            grant_row.operation::app.consent_operation, 'confidential',
            'system', 'internal', 'memory-consent-v1', $3
       FROM unnest($4::text[], $5::text[]) AS grant_row(purpose, operation)`,
    [
      context.tenantId,
      context.ownerUserId,
      grantedAt,
      grants.map(([purpose]) => purpose),
      grants.map(([, operation]) => operation),
    ],
  );
}

function proposalSelectSql(extraColumns = ''): string {
  return `SELECT ${extraColumns}
                 proposal.tenant_id, proposal.external_ref,
                 thread.external_ref AS conversation_ref,
                 turn.client_ref AS turn_ref, turn.user_text,
                 proposal.epistemic_type, proposal.data_class, turn.occurred_at,
                 turn.assistant_question, proposal.subject_user_id
            FROM app.memory_proposals proposal
            JOIN app.conversation_turns turn
              ON turn.tenant_id = proposal.tenant_id AND turn.id = proposal.turn_id
            JOIN app.conversation_threads thread
              ON thread.tenant_id = turn.tenant_id AND thread.id = turn.thread_id
           WHERE proposal.tenant_id = $1 AND proposal.external_ref = $2`;
}

function toProposal(row: ProposalRow): MemoryProposal {
  const occurredAt = toDate(row.occurred_at, 'Proposal occurrence');
  return {
    id: row.external_ref,
    tenantId: tenantId(row.tenant_id),
    ownerUserId: userId(row.subject_user_id),
    conversationId: row.conversation_ref,
    turnId: row.turn_ref,
    text: row.user_text,
    epistemicType: row.epistemic_type,
    dataClass: row.data_class,
    status: 'awaiting_user_confirmation',
    occurredAt,
    followUpQuestion: row.assistant_question,
  };
}

function existingConfirmation(
  row: ConfirmationRow,
  requestedPermissions: MemoryUsePermissions,
): MemoryConfirmationPersistenceResult {
  const permissions = parsePermissions(row.permissions);
  if (!samePermissions(permissions, requestedPermissions)) {
    return { outcome: 'conflict', permissions };
  }
  if (!row.assertion_id || !row.evidence_id || !row.confirmed_at) {
    throw new Error('Confirmed memory proposal is incomplete.');
  }
  return {
    outcome: 'already_confirmed',
    assertionId: row.assertion_id,
    evidenceId: row.evidence_id,
    permissions,
    confirmedAt: toDate(row.confirmed_at, 'Memory confirmation'),
  };
}

function parsePermissions(value: unknown): MemoryUsePermissions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored memory permissions are invalid.');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record['personalUnderstanding'] !== 'boolean' ||
    typeof record['brandUsage'] !== 'boolean' ||
    typeof record['publicUsage'] !== 'boolean'
  ) {
    throw new Error('Stored memory permissions are invalid.');
  }
  return {
    personalUnderstanding: record['personalUnderstanding'],
    brandUsage: record['brandUsage'],
    publicUsage: record['publicUsage'],
  };
}

function requiredId(row: IdRow | undefined, label: string): string {
  if (!row?.id) throw new Error(`${label} ID was not returned.`);
  return row.id;
}

function toDate(value: Date | string, label: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} time is invalid.`);
  return date;
}

function textSha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function turnFingerprint(command: ConversationTurnPersistenceCommand): string {
  return textSha256(
    JSON.stringify({
      conversationId: command.conversationId,
      text: command.text,
      proposeMemory: command.proposeMemory,
      followUpQuestion: command.followUpQuestion,
    }),
  );
}

function sameProposal(left: MemoryProposal, right: MemoryProposal): boolean {
  return (
    left.id === right.id &&
    left.tenantId === right.tenantId &&
    left.ownerUserId === right.ownerUserId &&
    left.conversationId === right.conversationId &&
    left.turnId === right.turnId &&
    left.text === right.text
  );
}

function samePermissions(
  left: MemoryUsePermissions,
  right: MemoryUsePermissions,
): boolean {
  return (
    left.personalUnderstanding === right.personalUnderstanding &&
    left.brandUsage === right.brandUsage &&
    left.publicUsage === right.publicUsage
  );
}

async function setTenantContext(
  transaction: SqlTransaction,
  tenant: string,
): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
}
