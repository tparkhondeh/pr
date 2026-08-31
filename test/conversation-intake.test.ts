import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  ConversationIntakeService,
  MemoryProposalConflictError,
  MemoryProposalPermissionError,
} from '../src/conversation/intake.js';
import { InMemoryConversationMemoryRepository } from '../src/conversation/repository.js';

const tenant = tenantId('tenant_one');
const owner = userId('owner_one');
const occurredAt = new Date('2026-08-31T13:00:00.000Z');

describe('continuous conversation intake', () => {
  it('asks one contextual question without storing a memory proposal by default', async () => {
    class RecordingRepository extends InMemoryConversationMemoryRepository {
      public writes = 0;

      public override async saveTurn(...args: Parameters<InMemoryConversationMemoryRepository['saveTurn']>) {
        this.writes += 1;
        return await super.saveTurn(...args);
      }
    }
    const repository = new RecordingRepository();
    const result = await new ConversationIntakeService(repository).submitTurn({
      tenantId: tenant,
      actorId: owner,
      conversationId: 'conversation_today',
      turnId: 'turn_one',
      text: 'امروز در جلسه اتفاقی افتاد که ذهنم را درگیر کرد.',
      proposeMemory: false,
      occurredAt,
    });

    expect(result.followUpQuestion).toContain('کدام بخش');
    expect(result.memoryProposal).toBeUndefined();
    expect(repository.writes).toBe(0);
  });

  it('keeps a proposed reflection as self-report pending confirmation', async () => {
    const result = await new ConversationIntakeService().submitTurn({
      tenantId: tenant,
      actorId: owner,
      conversationId: 'conversation_today',
      turnId: 'turn_change',
      text: 'فکر می‌کنم نظرم درباره آزادی تغییر کرده است.',
      proposeMemory: true,
      occurredAt,
    });

    expect(result.followUpQuestion).toContain('باعث شد دیدگاهت تغییر کند');
    expect(result.memoryProposal).toMatchObject({
      epistemicType: 'self_report',
      dataClass: 'confidential',
      status: 'awaiting_user_confirmation',
    });
  });

  it('requires explicit understanding permission and keeps brand/public use off', async () => {
    const service = new ConversationIntakeService();
    const proposal = (await service.submitTurn({
      tenantId: tenant,
      actorId: owner,
      conversationId: 'conversation_today',
      turnId: 'turn_memory',
      text: 'صداقت در ابهام برای من مهم است.',
      proposeMemory: true,
      occurredAt,
    })).memoryProposal;
    if (!proposal) throw new Error('Expected memory proposal.');

    await expect(
      service.confirmMemory({
        tenantId: tenant,
        actorId: owner,
        proposalId: proposal.id,
        permissions: {
          personalUnderstanding: false,
          brandUsage: false,
          publicUsage: false,
        },
        confirmedAt: occurredAt,
      }),
    ).rejects.toThrow(MemoryProposalPermissionError);

    const confirmed = await service.confirmMemory({
      tenantId: tenant,
      actorId: owner,
      proposalId: proposal.id,
      permissions: {
        personalUnderstanding: true,
        brandUsage: false,
        publicUsage: false,
      },
      confirmedAt: occurredAt,
    });
    expect(confirmed.assertion.epistemicType).toBe('self_report');
    expect(confirmed.permissions).toEqual({
      personalUnderstanding: true,
      brandUsage: false,
      publicUsage: false,
    });
  });

  it('never infers public permission from personal understanding', async () => {
    const service = new ConversationIntakeService();
    const proposal = (await service.submitTurn({
      tenantId: tenant,
      actorId: owner,
      conversationId: 'conversation_today',
      turnId: 'turn_public',
      text: 'این یک تجربه شخصی است.',
      proposeMemory: true,
      occurredAt,
    })).memoryProposal;
    if (!proposal) throw new Error('Expected memory proposal.');

    await expect(
      service.confirmMemory({
        tenantId: tenant,
        actorId: owner,
        proposalId: proposal.id,
        permissions: {
          personalUnderstanding: true,
          brandUsage: false,
          publicUsage: true,
        },
        confirmedAt: occurredAt,
      }),
    ).rejects.toThrow(MemoryProposalPermissionError);
  });

  it('is idempotent for the same turn and rejects conflicting reuse', async () => {
    const service = new ConversationIntakeService();
    const request = {
      tenantId: tenant,
      actorId: owner,
      conversationId: 'conversation_today',
      turnId: 'turn_idempotent',
      text: 'یک فکر تازه درباره مسئولیت دارم.',
      proposeMemory: true,
      occurredAt,
    } as const;
    const first = await service.submitTurn(request);
    const repeated = await service.submitTurn(request);
    expect(repeated.memoryProposal?.id).toBe(first.memoryProposal?.id);

    await expect(
      service.submitTurn({ ...request, text: 'متن متفاوت با همان شناسه.' }),
    ).rejects.toThrow(MemoryProposalConflictError);
  });
});
