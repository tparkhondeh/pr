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

export type MemoryRightOperation =
  | Readonly<{ kind: 'correct'; reason: string; correctedText: string }>
  | Readonly<{ kind: 'contest' | 'delete' | 'revoke'; reason: string }>;

export type MemoryRightCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  proposalId: string;
  requestId: string;
  operation: MemoryRightOperation;
  occurredAt: Date;
}>;

export type MemoryRightPersistenceResult =
  | Readonly<{
      outcome: 'applied' | 'already_applied';
      operation: MemoryRightOperation['kind'];
      proposalId: string;
      requestId: string;
      activeAssertionId?: string;
      permissionsRevoked: boolean;
      occurredAt: Date;
    }>
  | Readonly<{ outcome: 'not_found' }>;

export type PersonalMemoryRecord = Readonly<{
  proposalId: string;
  assertionId: string;
  text: string | null;
  epistemicType: 'self_report';
  dataClass: 'confidential';
  confidence: number;
  confidenceRationale: string;
  provenance: Readonly<{
    evidenceCount: number;
    sourceTypes: readonly string[];
  }>;
  consent: MemoryUsePermissions;
  lifecycle: Readonly<{
    status: 'active' | 'contested' | 'consent_revoked' | 'deleted';
    revisionCount: number;
    confirmedAt: Date;
    updatedAt: Date;
    contestedAt?: Date;
    contestReason?: string;
    revokedAt?: Date;
    deletedAt?: Date;
    deletionReason?: string;
  }>;
}>;

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
  applyRight(command: MemoryRightCommand): Promise<MemoryRightPersistenceResult>;
  listMemory(tenant: TenantId, actor: UserId): Promise<readonly PersonalMemoryRecord[]>;
}

type StoredConfirmation = Exclude<
  MemoryConfirmationPersistenceResult,
  Readonly<{ outcome: 'conflict' }> | Readonly<{ outcome: 'not_found' }>
>;

type InMemoryRightState = Readonly<{
  currentText: string | null;
  revisionCount: number;
  currentValidFrom: Date | null;
  contestedReason: string | null;
  contestedAt: Date | null;
  deleted: boolean;
  deletedAt: Date | null;
  deletionReason: string | null;
  revoked: boolean;
  revokedAt: Date | null;
}>;

const emptyRightState: InMemoryRightState = {
  currentText: null,
  revisionCount: 1,
  currentValidFrom: null,
  contestedReason: null,
  contestedAt: null,
  deleted: false,
  deletedAt: null,
  deletionReason: null,
  revoked: false,
  revokedAt: null,
};

export class InMemoryConversationMemoryRepository implements ConversationMemoryRepository {
  public readonly persistence = 'memory' as const;
  readonly #turnFingerprints = new Map<string, string>();
  readonly #proposals = new Map<string, MemoryProposal>();
  readonly #confirmed = new Map<string, StoredConfirmation>();
  readonly #rightRequests = new Map<
    string,
    Readonly<{ fingerprint: string; result: Exclude<MemoryRightPersistenceResult, { outcome: 'not_found' }> }>
  >();
  readonly #rightStates = new Map<string, InMemoryRightState>();

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
    if (this.#rightStates.get(request.proposal.id)?.deleted) {
      return Promise.resolve({ outcome: 'not_found' });
    }
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

  public applyRight(command: MemoryRightCommand): Promise<MemoryRightPersistenceResult> {
    const requestKey = `${command.tenantId}:${command.actorId}:${command.requestId}`;
    const fingerprint = rightFingerprint(command);
    const existingRequest = this.#rightRequests.get(requestKey);
    if (existingRequest) {
      if (existingRequest.fingerprint !== fingerprint) {
        return Promise.reject(
          new ConversationRepositoryConflictError('Memory right request ID has conflicting content.'),
        );
      }
      return Promise.resolve({ ...existingRequest.result, outcome: 'already_applied' });
    }

    const proposal = this.#proposals.get(command.proposalId);
    const confirmation = this.#confirmed.get(command.proposalId);
    if (
      !proposal ||
      !confirmation ||
      proposal.tenantId !== command.tenantId ||
      proposal.ownerUserId !== command.actorId
    ) {
      return Promise.resolve({ outcome: 'not_found' });
    }
    const state = this.#rightStates.get(command.proposalId) ?? emptyRightState;
    const activeValidFrom = state.currentValidFrom ?? confirmation.confirmedAt;
    if (
      command.occurredAt < confirmation.confirmedAt ||
      (command.operation.kind === 'correct' && command.occurredAt <= activeValidFrom)
    ) {
      return Promise.reject(
        new ConversationRepositoryConflictError('Memory right must follow confirmation.'),
      );
    }

    if (
      state.deleted &&
      command.operation.kind !== 'delete' &&
      command.operation.kind !== 'revoke'
    ) {
      return Promise.reject(new ConversationRepositoryConflictError('Memory is deleted.'));
    }

    let activeAssertionId = confirmation.assertionId;
    let permissionsRevoked = false;
    let nextState = state;
    let outcome: 'applied' | 'already_applied' = 'applied';
    if (command.operation.kind === 'correct') {
      activeAssertionId = `assertion_${command.requestId}`;
      this.#confirmed.set(command.proposalId, {
        ...confirmation,
        assertionId: activeAssertionId,
      });
      nextState = {
        ...state,
        currentText: command.operation.correctedText,
        revisionCount: state.revisionCount + 1,
        currentValidFrom: command.occurredAt,
        contestedReason: null,
        contestedAt: null,
      };
    } else if (command.operation.kind === 'contest') {
      if (state.contestedReason && state.contestedReason !== command.operation.reason) {
        return Promise.reject(
          new ConversationRepositoryConflictError('Memory is already contested for another reason.'),
        );
      }
      if (state.contestedReason) outcome = 'already_applied';
      nextState = {
        ...state,
        contestedReason: command.operation.reason,
        contestedAt: command.occurredAt,
      };
    } else if (command.operation.kind === 'revoke') {
      permissionsRevoked = true;
      if (state.revoked) outcome = 'already_applied';
      nextState = { ...state, revoked: true, revokedAt: command.occurredAt };
    } else {
      permissionsRevoked = true;
      if (state.deleted) outcome = 'already_applied';
      nextState = {
        ...state,
        deleted: true,
        deletedAt: command.occurredAt,
        deletionReason: command.operation.reason,
        revoked: true,
        revokedAt: command.occurredAt,
      };
    }
    this.#rightStates.set(command.proposalId, nextState);

    const result = {
      outcome,
      operation: command.operation.kind,
      proposalId: command.proposalId,
      requestId: command.requestId,
      activeAssertionId,
      permissionsRevoked,
      occurredAt: command.occurredAt,
    };
    this.#rightRequests.set(requestKey, { fingerprint, result });
    return Promise.resolve(result);
  }

  public listMemory(
    tenant: TenantId,
    actor: UserId,
  ): Promise<readonly PersonalMemoryRecord[]> {
    const records: PersonalMemoryRecord[] = [];
    for (const [proposalId, confirmation] of this.#confirmed) {
      const proposal = this.#proposals.get(proposalId);
      if (!proposal || proposal.tenantId !== tenant || proposal.ownerUserId !== actor) continue;
      const state = this.#rightStates.get(proposalId) ?? emptyRightState;
      const status = memoryStatus(state);
      const updatedAt = state.deletedAt ?? state.contestedAt ?? state.revokedAt
        ?? state.currentValidFrom ?? confirmation.confirmedAt;
      records.push({
        proposalId,
        assertionId: confirmation.assertionId,
        text: state.deleted ? null : (state.currentText ?? proposal.text),
        epistemicType: 'self_report',
        dataClass: 'confidential',
        confidence: state.revisionCount > 1 ? 0.75 : 0.5,
        confidenceRationale: state.revisionCount > 1
          ? 'Direct user correction of a prior self-report.'
          : 'Single user self-report; not independently corroborated.',
        provenance: {
          evidenceCount: state.deleted ? 0 : 1,
          sourceTypes: state.deleted
            ? []
            : [state.revisionCount > 1 ? 'user_correction' : 'conversation_turn'],
        },
        consent: state.revoked
          ? { personalUnderstanding: false, brandUsage: false, publicUsage: false }
          : confirmation.permissions,
        lifecycle: {
          status,
          revisionCount: state.revisionCount,
          confirmedAt: confirmation.confirmedAt,
          updatedAt,
          ...(state.contestedAt ? { contestedAt: state.contestedAt } : {}),
          ...(state.contestedReason ? { contestReason: state.contestedReason } : {}),
          ...(state.revokedAt ? { revokedAt: state.revokedAt } : {}),
          ...(state.deletedAt ? { deletedAt: state.deletedAt } : {}),
          ...(state.deletionReason ? { deletionReason: state.deletionReason } : {}),
        },
      });
    }
    records.sort((left, right) => right.lifecycle.updatedAt.getTime() - left.lifecycle.updatedAt.getTime());
    return Promise.resolve(records);
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
  deleted_at: Date | string | null;
}>;

type IdRow = Readonly<{ id: string }>;

type RightProposalRow = Readonly<{
  proposal_id: string;
  subject_user_id: string;
  status: 'proposed' | 'confirmed' | 'rejected' | 'expired';
  root_assertion_id: string | null;
  active_assertion_id: string | null;
  active_valid_from: Date | string | null;
  confirmed_at: Date | string | null;
  deleted_at: Date | string | null;
  contested_at: Date | string | null;
  contest_reason: string | null;
}>;

type RightRequestRow = Readonly<{
  proposal_id: string;
  operation: MemoryRightOperation['kind'];
  request_sha256: string;
  result: unknown;
  requested_at: Date | string;
}>;

type PersonalMemoryRow = Readonly<{
  proposal_ref: string;
  assertion_id: string;
  assertion_value: unknown;
  epistemic_type: 'self_report';
  data_class: 'confidential';
  confidence: string | number;
  confidence_rationale: string;
  evidence_count: string | number;
  source_types: unknown;
  personal_understanding: boolean;
  brand_usage: boolean;
  public_usage: boolean;
  revision_count: string | number;
  confirmed_at: Date | string;
  updated_at: Date | string;
  contested_at: Date | string | null;
  contest_reason: string | null;
  revoked_at: Date | string | null;
  deleted_at: Date | string | null;
  deletion_reason: string | null;
}>;

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
        `${proposalSelectSql('proposal.status, proposal.permissions, proposal.evidence_id, proposal.assertion_id, proposal.confirmed_at, proposal.deleted_at,')}
         FOR UPDATE OF proposal`,
        [this.context.tenantId, request.proposal.id],
      );
      const row = locked.rows[0];
      if (!row) return { outcome: 'not_found' };
      if (row.deleted_at) return { outcome: 'not_found' };
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
      await insertConsentGrants(
        transaction,
        this.context,
        request.permissions,
        request.confirmedAt,
        assertionId,
      );
      const permissionsJson = JSON.stringify(request.permissions);
      await transaction.query(
        `UPDATE app.memory_proposals
            SET status = 'confirmed', permissions = $3::jsonb, evidence_id = $4,
                assertion_id = $5, active_assertion_id = $5, confirmed_at = $6
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

  public async applyRight(
    command: MemoryRightCommand,
  ): Promise<MemoryRightPersistenceResult> {
    this.assertContext(command.tenantId, command.actorId);
    return await this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const proposalResult = await transaction.query<RightProposalRow>(
        `SELECT proposal.id AS proposal_id, proposal.subject_user_id, proposal.status,
                proposal.assertion_id AS root_assertion_id,
                proposal.active_assertion_id, proposal.confirmed_at, proposal.deleted_at,
                active.valid_from AS active_valid_from,
                active.contested_at, active.contest_reason
           FROM app.memory_proposals proposal
           JOIN app.assertions active
             ON active.tenant_id = proposal.tenant_id
            AND active.id = proposal.active_assertion_id
          WHERE proposal.tenant_id = $1 AND proposal.external_ref = $2
            AND proposal.subject_user_id = $3
          FOR UPDATE OF proposal, active`,
        [this.context.tenantId, command.proposalId, this.context.ownerUserId],
      );
      const proposal = proposalResult.rows[0];
      if (
        !proposal ||
        proposal.status !== 'confirmed' ||
        !proposal.root_assertion_id ||
        !proposal.active_assertion_id ||
        !proposal.confirmed_at
      ) {
        return { outcome: 'not_found' };
      }
      const confirmedAt = toDate(proposal.confirmed_at, 'Memory confirmation');
      const activeValidFrom = proposal.active_valid_from
        ? toDate(proposal.active_valid_from, 'Active assertion validity')
        : confirmedAt;
      if (
        command.occurredAt < confirmedAt ||
        (
          command.operation.kind === 'correct' &&
          command.occurredAt <= activeValidFrom
        )
      ) {
        throw new ConversationRepositoryConflictError(
          'Memory right must follow confirmation.',
        );
      }

      const requestHash = rightFingerprint(command);
      const existingRequest = await transaction.query<RightRequestRow>(
        `SELECT proposal_id, operation, request_sha256, result, requested_at
           FROM app.memory_rights_requests
          WHERE tenant_id = $1 AND subject_user_id = $2 AND client_ref = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId],
      );
      const existing = existingRequest.rows[0];
      if (existing) {
        if (
          existing.proposal_id !== proposal.proposal_id ||
          existing.operation !== command.operation.kind ||
          existing.request_sha256 !== requestHash
        ) {
          throw new ConversationRepositoryConflictError(
            'Memory right request ID has conflicting content.',
          );
        }
        return storedRightResult(existing, command);
      }

      if (
        proposal.deleted_at &&
        command.operation.kind !== 'delete' &&
        command.operation.kind !== 'revoke'
      ) {
        throw new ConversationRepositoryConflictError('Memory is deleted.');
      }

      const applied = await applyPostgresMemoryRight(
        transaction,
        this.context,
        proposal,
        command,
      );
      const storedResult = JSON.stringify({
        operation: applied.operation,
        proposalId: applied.proposalId,
        requestId: applied.requestId,
        ...(applied.activeAssertionId
          ? { activeAssertionId: applied.activeAssertionId }
          : {}),
        permissionsRevoked: applied.permissionsRevoked,
        occurredAt: applied.occurredAt.toISOString(),
      });
      await transaction.query(
        `INSERT INTO app.memory_rights_requests (
           tenant_id, subject_user_id, proposal_id, client_ref, operation,
           request_sha256, result, requested_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          proposal.proposal_id,
          command.requestId,
          command.operation.kind,
          requestHash,
          storedResult,
          command.occurredAt,
        ],
      );
      const eventType = `memory.${command.operation.kind}`;
      const metadata = JSON.stringify({
        proposalId: command.proposalId,
        requestId: command.requestId,
        operation: command.operation.kind,
        reasonSha256: textSha256(command.operation.reason),
        permissionsRevoked: applied.permissionsRevoked,
      });
      await transaction.query(
        `INSERT INTO app.audit_events (
           tenant_id, actor_user_id, event_type, resource_type, resource_id,
           purpose, decision, metadata, occurred_at
         ) VALUES ($1, $2, $3, 'memory_proposal', $4,
           'personal_understanding', $5, $6::jsonb, $7)`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          eventType,
          command.proposalId,
          applied.outcome === 'applied' ? 'applied' : 'no_change',
          metadata,
          command.occurredAt,
        ],
      );
      await transaction.query(
        `INSERT INTO app.outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
         ) VALUES ($1, 'memory_proposal', $2, $3, $4::jsonb, $5)`,
        [
          this.context.tenantId,
          command.proposalId,
          eventType,
          metadata,
          command.occurredAt,
        ],
      );
      return applied;
    });
  }

  public async listMemory(
    tenant: TenantId,
    actor: UserId,
  ): Promise<readonly PersonalMemoryRecord[]> {
    this.assertContext(tenant, actor);
    return await this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<PersonalMemoryRow>(
        `SELECT proposal.external_ref AS proposal_ref,
                active.id AS assertion_id, active.value AS assertion_value,
                active.epistemic_type, active.data_class, active.confidence,
                active.confidence_rationale,
                COALESCE(provenance.evidence_count, 0) AS evidence_count,
                COALESCE(provenance.source_types, '[]'::jsonb) AS source_types,
                COALESCE(consent.personal_understanding, false) AS personal_understanding,
                COALESCE(consent.brand_usage, false) AS brand_usage,
                COALESCE(consent.public_usage, false) AS public_usage,
                COALESCE(history.revision_count, 1) AS revision_count,
                proposal.confirmed_at,
                GREATEST(
                  proposal.confirmed_at,
                  active.created_at,
                  active.contested_at,
                  proposal.deleted_at,
                  consent.revoked_at
                ) AS updated_at,
                active.contested_at, active.contest_reason,
                consent.revoked_at, proposal.deleted_at, proposal.deletion_reason
           FROM app.memory_proposals proposal
           JOIN app.assertions active
             ON active.tenant_id = proposal.tenant_id
            AND active.id = proposal.active_assertion_id
           LEFT JOIN LATERAL (
             SELECT count(DISTINCT link.evidence_id)::integer AS evidence_count,
                    jsonb_agg(DISTINCT evidence.source_type)
                      FILTER (WHERE evidence.source_type IS NOT NULL) AS source_types
               FROM app.assertion_evidence link
               JOIN app.evidence_items evidence
                 ON evidence.tenant_id = link.tenant_id
                AND evidence.id = link.evidence_id
              WHERE link.tenant_id = proposal.tenant_id
                AND link.assertion_id = active.id
                AND evidence.deleted_at IS NULL
           ) provenance ON true
           LEFT JOIN LATERAL (
             SELECT
               count(DISTINCT operation) FILTER (
                 WHERE purpose = 'personal_understanding' AND revoked_at IS NULL
               ) >= 2 AS personal_understanding,
               count(DISTINCT operation) FILTER (
                 WHERE purpose = 'brand_usage' AND revoked_at IS NULL
               ) >= 3 AS brand_usage,
               count(DISTINCT operation) FILTER (
                 WHERE purpose = 'public_drafting' AND revoked_at IS NULL
               ) >= 3 AS public_usage,
               max(revoked_at) AS revoked_at
             FROM app.consent_grants grant_row
            WHERE grant_row.tenant_id = proposal.tenant_id
              AND grant_row.subject_user_id = proposal.subject_user_id
              AND grant_row.resource_type = 'assertion'
              AND grant_row.resource_id = active.id::text
           ) consent ON true
           LEFT JOIN LATERAL (
             WITH RECURSIVE lineage(id) AS (
               SELECT proposal.assertion_id
               UNION
               SELECT child.id
                 FROM app.assertions child
                 JOIN lineage parent ON child.supersedes_id = parent.id
                WHERE child.tenant_id = proposal.tenant_id
             )
             SELECT count(*)::integer AS revision_count FROM lineage
           ) history ON true
          WHERE proposal.tenant_id = $1
            AND proposal.subject_user_id = $2
            AND proposal.status = 'confirmed'
          ORDER BY updated_at DESC, proposal.external_ref`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      return result.rows.map(toPersonalMemoryRecord);
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
  resourceId: string,
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
       audience, channel, policy_version, granted_at, resource_type, resource_id
     )
     SELECT $1, $2, $2, grant_row.purpose::app.consent_purpose,
            grant_row.operation::app.consent_operation, 'confidential',
            'system', 'internal', 'memory-consent-v1', $3, 'assertion', $4
       FROM unnest($5::text[], $6::text[]) AS grant_row(purpose, operation)`,
    [
      context.tenantId,
      context.ownerUserId,
      grantedAt,
      resourceId,
      grants.map(([purpose]) => purpose),
      grants.map(([, operation]) => operation),
    ],
  );
}

async function applyPostgresMemoryRight(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  proposal: RightProposalRow,
  command: MemoryRightCommand,
): Promise<Exclude<MemoryRightPersistenceResult, { outcome: 'not_found' }>> {
  let outcome: 'applied' | 'already_applied' = 'applied';
  let activeAssertionId = proposal.active_assertion_id as string;
  let permissionsRevoked = false;

  if (command.operation.kind === 'correct') {
    const evidence = await transaction.query<IdRow>(
      `INSERT INTO app.evidence_items (
         tenant_id, source_type, source_locator, content, data_class,
         integrity_sha256, occurred_at, observed_at
       ) VALUES ($1, 'user_correction', $2, $3::jsonb, 'confidential', $4, $5, $5)
       RETURNING id`,
      [
        context.tenantId,
        `${command.proposalId}/${command.requestId}`,
        JSON.stringify({
          correctedText: command.operation.correctedText,
          reason: command.operation.reason,
        }),
        textSha256(command.operation.correctedText),
        command.occurredAt,
      ],
    );
    const evidenceId = requiredId(evidence.rows[0], 'Correction evidence');
    const replacement = await transaction.query<IdRow>(
      `INSERT INTO app.assertions (
         tenant_id, subject_ref, predicate, value, epistemic_type, data_class,
         confidence, confidence_rationale, valid_from, supersedes_id,
         created_at, created_by
       ) VALUES ($1, $2, 'shared_reflection', $3::jsonb, 'self_report',
         'confidential', 0.75, 'Direct user correction of a prior self-report.',
         $4, $5, $4, $2)
       RETURNING id`,
      [
        context.tenantId,
        context.ownerUserId,
        JSON.stringify(command.operation.correctedText),
        command.occurredAt,
        proposal.active_assertion_id,
      ],
    );
    activeAssertionId = requiredId(replacement.rows[0], 'Corrected assertion');
    await transaction.query(
      `INSERT INTO app.assertion_evidence (
         tenant_id, assertion_id, evidence_id, relation, rationale, created_at
       ) VALUES ($1, $2, $3, 'supports', $4, $5)`,
      [
        context.tenantId,
        activeAssertionId,
        evidenceId,
        command.operation.reason,
        command.occurredAt,
      ],
    );
    await transaction.query(
      `UPDATE app.assertions
          SET valid_to = $3
        WHERE tenant_id = $1 AND id = $2 AND valid_to IS NULL`,
      [context.tenantId, proposal.active_assertion_id, command.occurredAt],
    );
    await transaction.query(
      `WITH revoked AS (
         UPDATE app.consent_grants
            SET revoked_at = $4, revocation_reason = 'Superseded by user correction.'
          WHERE tenant_id = $1 AND subject_user_id = $2
            AND resource_type = 'assertion' AND resource_id = $3
            AND revoked_at IS NULL
          RETURNING purpose, operation, data_class, audience, channel, policy_version
       )
       INSERT INTO app.consent_grants (
         tenant_id, subject_user_id, granted_by, purpose, operation, data_class,
         audience, channel, policy_version, granted_at, resource_type, resource_id
       )
       SELECT $1, $2, $2, purpose, operation, data_class, audience, channel,
              policy_version, $4, 'assertion', $5
         FROM revoked`,
      [
        context.tenantId,
        context.ownerUserId,
        proposal.active_assertion_id,
        command.occurredAt,
        activeAssertionId,
      ],
    );
    await transaction.query(
      `UPDATE app.memory_proposals
          SET active_assertion_id = $3
        WHERE tenant_id = $1 AND id = $2`,
      [context.tenantId, proposal.proposal_id, activeAssertionId],
    );
  } else if (command.operation.kind === 'contest') {
    if (proposal.contested_at) {
      if (proposal.contest_reason !== command.operation.reason) {
        throw new ConversationRepositoryConflictError(
          'Memory is already contested for another reason.',
        );
      }
      outcome = 'already_applied';
    } else {
      await transaction.query(
        `UPDATE app.assertions
            SET contested_at = $3, contest_reason = $4
          WHERE tenant_id = $1 AND id = $2 AND contested_at IS NULL
            AND deleted_at IS NULL`,
        [
          context.tenantId,
          proposal.active_assertion_id,
          command.occurredAt,
          command.operation.reason,
        ],
      );
    }
  } else if (command.operation.kind === 'revoke') {
    permissionsRevoked = true;
    const revoked = await transaction.query(
      `UPDATE app.consent_grants
          SET revoked_at = $4, revocation_reason = $5
        WHERE tenant_id = $1 AND subject_user_id = $2
          AND resource_type = 'assertion' AND resource_id = $3
          AND revoked_at IS NULL`,
      [
        context.tenantId,
        context.ownerUserId,
        proposal.active_assertion_id,
        command.occurredAt,
        command.operation.reason,
      ],
    );
    if (revoked.rowCount === 0) outcome = 'already_applied';
  } else {
    permissionsRevoked = true;
    if (proposal.deleted_at) {
      outcome = 'already_applied';
    } else {
      const lineage = await transaction.query<IdRow>(
        `WITH RECURSIVE lineage AS (
           SELECT id FROM app.assertions
            WHERE tenant_id = $1 AND id = $2
           UNION
           SELECT child.id
             FROM app.assertions child
             JOIN lineage parent ON child.supersedes_id = parent.id
            WHERE child.tenant_id = $1
         )
         SELECT id FROM lineage`,
        [context.tenantId, proposal.root_assertion_id],
      );
      const assertionIds = lineage.rows.map((row) => row.id);
      if (assertionIds.length === 0) throw new Error('Memory assertion lineage is missing.');
      await transaction.query(
        `UPDATE app.assertions
            SET deleted_at = $3, deletion_reason = $4
          WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
        [
          context.tenantId,
          assertionIds,
          command.occurredAt,
          command.operation.reason,
        ],
      );
      await transaction.query(
        `UPDATE app.evidence_items evidence
            SET deleted_at = $3
           FROM app.assertion_evidence link
          WHERE link.tenant_id = $1 AND link.assertion_id = ANY($2::uuid[])
            AND evidence.tenant_id = link.tenant_id AND evidence.id = link.evidence_id
            AND evidence.deleted_at IS NULL`,
        [context.tenantId, assertionIds, command.occurredAt],
      );
      await transaction.query(
        `UPDATE app.consent_grants
            SET revoked_at = $3, revocation_reason = $4
          WHERE tenant_id = $1 AND resource_type = 'assertion'
            AND resource_id = ANY($2::text[]) AND revoked_at IS NULL`,
        [
          context.tenantId,
          assertionIds,
          command.occurredAt,
          command.operation.reason,
        ],
      );
      await transaction.query(
        `UPDATE app.memory_proposals
            SET deleted_at = $3, deletion_reason = $4
          WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [
          context.tenantId,
          proposal.proposal_id,
          command.occurredAt,
          command.operation.reason,
        ],
      );
    }
  }

  return {
    outcome,
    operation: command.operation.kind,
    proposalId: command.proposalId,
    requestId: command.requestId,
    activeAssertionId,
    permissionsRevoked,
    occurredAt: command.occurredAt,
  };
}

function storedRightResult(
  row: RightRequestRow,
  command: MemoryRightCommand,
): Exclude<MemoryRightPersistenceResult, { outcome: 'not_found' }> {
  if (!row.result || typeof row.result !== 'object' || Array.isArray(row.result)) {
    throw new Error('Stored memory right result is invalid.');
  }
  const result = row.result as Record<string, unknown>;
  const activeAssertionId = result['activeAssertionId'];
  const permissionsRevoked = result['permissionsRevoked'];
  if (
    (activeAssertionId !== undefined && typeof activeAssertionId !== 'string') ||
    typeof permissionsRevoked !== 'boolean'
  ) {
    throw new Error('Stored memory right result is invalid.');
  }
  return {
    outcome: 'already_applied',
    operation: command.operation.kind,
    proposalId: command.proposalId,
    requestId: command.requestId,
    ...(typeof activeAssertionId === 'string' ? { activeAssertionId } : {}),
    permissionsRevoked,
    occurredAt: toDate(row.requested_at, 'Memory right request'),
  };
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

function toPersonalMemoryRecord(row: PersonalMemoryRow): PersonalMemoryRecord {
  const deletedAt = row.deleted_at
    ? toDate(row.deleted_at, 'Memory deletion')
    : undefined;
  const contestedAt = row.contested_at
    ? toDate(row.contested_at, 'Memory contest')
    : undefined;
  const revokedAt = row.revoked_at
    ? toDate(row.revoked_at, 'Memory consent revocation')
    : undefined;
  const confidence = numericValue(row.confidence, 'Memory confidence');
  const evidenceCount = numericValue(row.evidence_count, 'Evidence count');
  const revisionCount = numericValue(row.revision_count, 'Revision count');
  if (!deletedAt && typeof row.assertion_value !== 'string') {
    throw new Error('Active memory value is invalid.');
  }
  const status: PersonalMemoryRecord['lifecycle']['status'] = deletedAt
    ? 'deleted'
    : contestedAt
      ? 'contested'
      : row.personal_understanding
        ? 'active'
        : 'consent_revoked';
  return {
    proposalId: row.proposal_ref,
    assertionId: row.assertion_id,
    text: deletedAt ? null : row.assertion_value as string,
    epistemicType: row.epistemic_type,
    dataClass: row.data_class,
    confidence,
    confidenceRationale: row.confidence_rationale,
    provenance: {
      evidenceCount,
      sourceTypes: stringArray(row.source_types, 'Evidence source types'),
    },
    consent: {
      personalUnderstanding: row.personal_understanding,
      brandUsage: row.brand_usage,
      publicUsage: row.public_usage,
    },
    lifecycle: {
      status,
      revisionCount,
      confirmedAt: toDate(row.confirmed_at, 'Memory confirmation'),
      updatedAt: toDate(row.updated_at, 'Memory update'),
      ...(contestedAt ? { contestedAt } : {}),
      ...(row.contest_reason ? { contestReason: row.contest_reason } : {}),
      ...(revokedAt ? { revokedAt } : {}),
      ...(deletedAt ? { deletedAt } : {}),
      ...(row.deletion_reason ? { deletionReason: row.deletion_reason } : {}),
    },
  };
}

function numericValue(value: string | number, label: string): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`${label} is invalid.`);
  return numeric;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} are invalid.`);
  }
  return value as string[];
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

function rightFingerprint(command: MemoryRightCommand): string {
  return textSha256(
    JSON.stringify({
      proposalId: command.proposalId,
      operation: command.operation,
    }),
  );
}

function memoryStatus(
  state: InMemoryRightState,
): PersonalMemoryRecord['lifecycle']['status'] {
  if (state.deleted) return 'deleted';
  if (state.contestedAt) return 'contested';
  if (state.revoked) return 'consent_revoked';
  return 'active';
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
