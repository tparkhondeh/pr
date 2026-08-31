import type { TenantId, UserId } from '../kernel/identity.js';
import {
  assertionId,
  createAssertion,
  evidenceId,
  type Assertion,
} from '../memory/personal-memory.js';
import {
  ConversationRepositoryConflictError,
  ConversationRepositoryPermissionError,
  InMemoryConversationMemoryRepository,
  type ConversationMemoryRepository,
  type MemoryRightOperation,
  type PersonalMemoryRecord,
} from './repository.js';
import {
  orchestrateConversationTurn,
  type ConversationOrchestration,
} from './orchestrator.js';

export type MemoryUsePermissions = Readonly<{
  personalUnderstanding: boolean;
  brandUsage: boolean;
  publicUsage: boolean;
}>;

export type MemoryProposal = Readonly<{
  id: string;
  tenantId: TenantId;
  ownerUserId: UserId;
  conversationId: string;
  turnId: string;
  text: string;
  epistemicType: 'self_report';
  dataClass: 'confidential';
  status: 'awaiting_user_confirmation';
  occurredAt: Date;
  followUpQuestion: string;
}>;

export type ConversationTurnResult = Readonly<{
  assistantMessage: string;
  followUpQuestion: string;
  orchestration: ConversationOrchestration;
  memoryProposal?: MemoryProposal;
}>;

export type ConfirmedMemory = Readonly<{
  assertion: Assertion;
  permissions: MemoryUsePermissions;
  confirmedAt: Date;
  persistence: 'memory' | 'postgres';
}>;

export type AppliedMemoryRight = Readonly<{
  outcome: 'applied' | 'already_applied';
  operation: MemoryRightOperation['kind'];
  proposalId: string;
  requestId: string;
  activeAssertionId?: string;
  permissionsRevoked: boolean;
  occurredAt: Date;
  persistence: 'memory' | 'postgres';
}>;

export type PersonalMemorySnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres';
  summary: Readonly<{
    total: number;
    active: number;
    attentionRequired: number;
    deleted: number;
  }>;
  records: readonly PersonalMemoryRecord[];
}>;

export class ConversationValidationError extends Error {}
export class MemoryProposalNotFoundError extends Error {}
export class MemoryProposalPermissionError extends Error {}
export class MemoryProposalConflictError extends Error {}

export class ConversationIntakeService {
  public constructor(
    private readonly repository: ConversationMemoryRepository = new InMemoryConversationMemoryRepository(),
  ) {}

  public async submitTurn(request: Readonly<{
    tenantId: TenantId;
    actorId: UserId;
    conversationId: string;
    turnId: string;
    text: string;
    proposeMemory: boolean;
    occurredAt: Date;
  }>): Promise<ConversationTurnResult> {
    validateSafeId(request.conversationId, 'Conversation', 64);
    validateSafeId(request.turnId, 'Turn', 48);
    const text = request.text.trim();
    if (text.length < 3 || text.length > 5_000) {
      throw new ConversationValidationError('Conversation text must be 3-5000 characters.');
    }
    if (Number.isNaN(request.occurredAt.getTime())) {
      throw new ConversationValidationError('Conversation time is invalid.');
    }

    const orchestrated = orchestrateConversationTurn({
      turnId: request.turnId,
      text,
      memoryProposalRequested: request.proposeMemory,
    });
    const shouldProposeMemory =
      request.proposeMemory && orchestrated.orchestration.safety.memoryProposalAllowed;
    const persistenceRequest = {
      ...request,
      text,
      proposeMemory: shouldProposeMemory,
    };
    if (!shouldProposeMemory) {
      return {
        ...orchestrated,
      };
    }

    const proposalId = `memory_${request.turnId}`;
    const memoryProposal: MemoryProposal = {
      id: proposalId,
      tenantId: request.tenantId,
      ownerUserId: request.actorId,
      conversationId: request.conversationId,
      turnId: request.turnId,
      text,
      epistemicType: 'self_report',
      dataClass: 'confidential',
      status: 'awaiting_user_confirmation',
      occurredAt: request.occurredAt,
      followUpQuestion: orchestrated.followUpQuestion,
    };
    const persisted = await this.persistTurn(
      persistenceRequest,
      orchestrated.followUpQuestion,
      orchestrated.orchestration,
      memoryProposal,
    );
    if (!persisted) throw new Error('Memory proposal was not returned by the repository.');
    return {
      assistantMessage: orchestrated.assistantMessage,
      followUpQuestion: persisted.followUpQuestion,
      orchestration: orchestrated.orchestration,
      memoryProposal: persisted,
    };
  }

  public async confirmMemory(request: Readonly<{
    tenantId: TenantId;
    actorId: UserId;
    proposalId: string;
    permissions: MemoryUsePermissions;
    confirmedAt: Date;
  }>): Promise<ConfirmedMemory> {
    const proposal = await this.repository.findProposal(request.tenantId, request.proposalId);
    if (!proposal || proposal.tenantId !== request.tenantId) {
      throw new MemoryProposalNotFoundError('Memory proposal was not found.');
    }
    if (proposal.ownerUserId !== request.actorId) {
      throw new MemoryProposalPermissionError('Only the proposal owner can confirm memory.');
    }
    if (!request.permissions.personalUnderstanding) {
      throw new MemoryProposalPermissionError(
        'Personal understanding permission is required to store memory.',
      );
    }
    if (request.permissions.publicUsage && !request.permissions.brandUsage) {
      throw new MemoryProposalPermissionError('Public usage requires explicit brand usage.');
    }
    if (
      Number.isNaN(request.confirmedAt.getTime()) ||
      request.confirmedAt < proposal.occurredAt
    ) {
      throw new ConversationValidationError('Memory confirmation time is invalid.');
    }

    let persistenceResult;
    try {
      persistenceResult = await this.repository.confirm({
        proposal,
        actorId: request.actorId,
        permissions: request.permissions,
        confirmedAt: request.confirmedAt,
      });
    } catch (error: unknown) {
      if (error instanceof ConversationRepositoryPermissionError) {
        throw new MemoryProposalPermissionError(error.message);
      }
      if (error instanceof ConversationRepositoryConflictError) {
        throw new MemoryProposalConflictError(error.message);
      }
      throw error;
    }
    if (persistenceResult.outcome === 'not_found') {
      throw new MemoryProposalNotFoundError('Memory proposal was not found.');
    }
    if (persistenceResult.outcome === 'conflict') {
      throw new MemoryProposalConflictError('Confirmed permissions cannot be changed implicitly.');
    }

    const assertion = createAssertion({
      id: assertionId(persistenceResult.assertionId),
      tenantId: proposal.tenantId,
      subjectRef: proposal.ownerUserId,
      predicate: 'shared_reflection',
      value: proposal.text,
      epistemicType: proposal.epistemicType,
      dataClass: proposal.dataClass,
      confidence: 0.5,
      confidenceRationale: 'Single user self-report; not independently corroborated.',
      evidence: [
        {
          evidenceId: evidenceId(persistenceResult.evidenceId),
          relation: 'supports',
          rationale: `Conversation ${proposal.conversationId}`,
        },
      ],
      validFrom: proposal.occurredAt,
      createdAt: persistenceResult.confirmedAt,
      createdBy: request.actorId,
    });
    const confirmed: ConfirmedMemory = {
      assertion,
      permissions: persistenceResult.permissions,
      confirmedAt: persistenceResult.confirmedAt,
      persistence: this.repository.persistence,
    };
    return confirmed;
  }

  public async applyMemoryRight(request: Readonly<{
    tenantId: TenantId;
    actorId: UserId;
    proposalId: string;
    requestId: string;
    operation: MemoryRightOperation;
    occurredAt: Date;
  }>): Promise<AppliedMemoryRight> {
    validateSafeId(request.proposalId, 'Memory proposal', 64);
    validateSafeId(request.requestId, 'Memory right request', 64);
    const reason = request.operation.reason.trim();
    if (reason.length < 3 || reason.length > 500) {
      throw new ConversationValidationError('Memory right reason must be 3-500 characters.');
    }
    const operation = request.operation.kind === 'correct'
      ? {
          kind: 'correct' as const,
          reason,
          correctedText: request.operation.correctedText.trim(),
        }
      : { kind: request.operation.kind, reason };
    if (
      operation.kind === 'correct' &&
      (operation.correctedText.length < 3 || operation.correctedText.length > 5_000)
    ) {
      throw new ConversationValidationError('Corrected memory must be 3-5000 characters.');
    }
    if (Number.isNaN(request.occurredAt.getTime())) {
      throw new ConversationValidationError('Memory right time is invalid.');
    }

    try {
      const result = await this.repository.applyRight({
        tenantId: request.tenantId,
        actorId: request.actorId,
        proposalId: request.proposalId,
        requestId: request.requestId,
        operation,
        occurredAt: request.occurredAt,
      });
      if (result.outcome === 'not_found') {
        throw new MemoryProposalNotFoundError('Confirmed memory was not found.');
      }
      return { ...result, persistence: this.repository.persistence };
    } catch (error: unknown) {
      if (error instanceof MemoryProposalNotFoundError) throw error;
      if (error instanceof ConversationRepositoryPermissionError) {
        throw new MemoryProposalPermissionError(error.message);
      }
      if (error instanceof ConversationRepositoryConflictError) {
        throw new MemoryProposalConflictError(error.message);
      }
      throw error;
    }
  }

  public async memorySnapshot(request: Readonly<{
    tenantId: TenantId;
    actorId: UserId;
    generatedAt: Date;
  }>): Promise<PersonalMemorySnapshot> {
    if (Number.isNaN(request.generatedAt.getTime())) {
      throw new ConversationValidationError('Memory snapshot time is invalid.');
    }
    try {
      const records = await this.repository.listMemory(request.tenantId, request.actorId);
      return {
        generatedAt: request.generatedAt,
        persistence: this.repository.persistence,
        summary: {
          total: records.length,
          active: records.filter((record) => record.lifecycle.status === 'active').length,
          attentionRequired: records.filter(
            (record) =>
              record.lifecycle.status === 'contested' ||
              record.lifecycle.status === 'consent_revoked',
          ).length,
          deleted: records.filter((record) => record.lifecycle.status === 'deleted').length,
        },
        records,
      };
    } catch (error: unknown) {
      if (error instanceof ConversationRepositoryPermissionError) {
        throw new MemoryProposalPermissionError(error.message);
      }
      throw error;
    }
  }

  private async persistTurn(
    request: Readonly<{
      tenantId: TenantId;
      actorId: UserId;
      conversationId: string;
      turnId: string;
      text: string;
      proposeMemory: boolean;
      occurredAt: Date;
    }>,
    followUpQuestion: string,
    orchestration: ConversationOrchestration,
    proposal?: MemoryProposal,
  ): Promise<MemoryProposal | undefined> {
    try {
      return await this.repository.saveTurn({
        ...request,
        text: request.text.trim(),
        followUpQuestion,
        orchestration,
        ...(proposal ? { proposal } : {}),
      });
    } catch (error: unknown) {
      if (error instanceof ConversationRepositoryPermissionError) {
        throw new MemoryProposalPermissionError(error.message);
      }
      if (error instanceof ConversationRepositoryConflictError) {
        throw new MemoryProposalConflictError(error.message);
      }
      throw error;
    }
  }
}

function validateSafeId(value: string, label: string, maximumLength: number): void {
  if (
    value.length > maximumLength ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)
  ) {
    throw new ConversationValidationError(
      `${label} ID must be 3-${String(maximumLength)} safe characters.`,
    );
  }
}
