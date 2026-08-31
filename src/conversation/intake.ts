import type { TenantId, UserId } from '../kernel/identity.js';
import {
  assertionId,
  createAssertion,
  evidenceId,
  type Assertion,
} from '../memory/personal-memory.js';

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
  memoryProposal?: MemoryProposal;
}>;

export type ConfirmedMemory = Readonly<{
  assertion: Assertion;
  permissions: MemoryUsePermissions;
  confirmedAt: Date;
}>;

export class ConversationValidationError extends Error {}
export class MemoryProposalNotFoundError extends Error {}
export class MemoryProposalPermissionError extends Error {}
export class MemoryProposalConflictError extends Error {}

export class ConversationIntakeService {
  readonly #proposals = new Map<string, MemoryProposal>();
  readonly #confirmed = new Map<string, ConfirmedMemory>();

  public submitTurn(request: Readonly<{
    tenantId: TenantId;
    actorId: UserId;
    conversationId: string;
    turnId: string;
    text: string;
    proposeMemory: boolean;
    occurredAt: Date;
  }>): ConversationTurnResult {
    validateSafeId(request.conversationId, 'Conversation', 64);
    validateSafeId(request.turnId, 'Turn', 48);
    const text = request.text.trim();
    if (text.length < 3 || text.length > 5_000) {
      throw new ConversationValidationError('Conversation text must be 3-5000 characters.');
    }
    if (Number.isNaN(request.occurredAt.getTime())) {
      throw new ConversationValidationError('Conversation time is invalid.');
    }

    const followUpQuestion = chooseFollowUpQuestion(text);
    if (!request.proposeMemory) {
      return {
        assistantMessage: 'شنیدم. فعلاً چیزی به حافظه پیشنهاد نمی‌کنم.',
        followUpQuestion,
      };
    }

    const proposalId = `memory_${request.turnId}`;
    const existing = this.#proposals.get(proposalId);
    if (existing) {
      if (
        existing.tenantId !== request.tenantId ||
        existing.ownerUserId !== request.actorId ||
        existing.text !== text
      ) {
        throw new MemoryProposalConflictError('Turn ID is already used by another proposal.');
      }
      return {
        assistantMessage: 'این برداشت فقط یک Self-report پیشنهادی است و هنوز حافظه قطعی نیست.',
        followUpQuestion: existing.followUpQuestion,
        memoryProposal: existing,
      };
    }

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
      followUpQuestion,
    };
    this.#proposals.set(memoryProposal.id, memoryProposal);
    return {
      assistantMessage: 'این برداشت فقط یک Self-report پیشنهادی است و هنوز حافظه قطعی نیست.',
      followUpQuestion,
      memoryProposal,
    };
  }

  public confirmMemory(request: Readonly<{
    tenantId: TenantId;
    actorId: UserId;
    proposalId: string;
    permissions: MemoryUsePermissions;
    confirmedAt: Date;
  }>): ConfirmedMemory {
    const proposal = this.#proposals.get(request.proposalId);
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

    const existing = this.#confirmed.get(proposal.id);
    if (existing) {
      if (!samePermissions(existing.permissions, request.permissions)) {
        throw new MemoryProposalConflictError('Confirmed permissions cannot be changed implicitly.');
      }
      return existing;
    }

    const assertion = createAssertion({
      id: assertionId(`assertion_${proposal.turnId}`),
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
          evidenceId: evidenceId(`evidence_${proposal.turnId}`),
          relation: 'supports',
          rationale: `Conversation ${proposal.conversationId}`,
        },
      ],
      validFrom: proposal.occurredAt,
      createdAt: request.confirmedAt,
      createdBy: request.actorId,
    });
    const confirmed: ConfirmedMemory = {
      assertion,
      permissions: request.permissions,
      confirmedAt: request.confirmedAt,
    };
    this.#confirmed.set(proposal.id, confirmed);
    return confirmed;
  }
}

function chooseFollowUpQuestion(text: string): string {
  if (/عوض|تغییر|قبلاً|دیگر|نظرم/u.test(text)) {
    return 'چه تجربه یا شواهدی باعث شد دیدگاهت تغییر کند؟';
  }
  if (/جلسه|اتفاق|دیدم|شنیدم|گفت/u.test(text)) {
    return 'کدام بخش این اتفاق برایت مهم بود و چرا؟';
  }
  return 'یک موقعیت واقعی را تعریف می‌کنی که این فکر در آن خودش را نشان داده باشد؟';
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
