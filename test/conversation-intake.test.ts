import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  ConversationIntakeService,
  MemoryProposalConflictError,
  MemoryProposalNotFoundError,
  MemoryProposalPermissionError,
} from '../src/conversation/intake.js';
import { InMemoryConversationMemoryRepository } from '../src/conversation/repository.js';

const tenant = tenantId('tenant_one');
const owner = userId('owner_one');
const occurredAt = new Date('2026-08-31T13:00:00.000Z');

describe('continuous conversation intake', () => {
  it('asks one contextual question without persisting raw text or creating memory by default', async () => {
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
    expect(result.orchestration).toMatchObject({
      intent: { kind: 'reflect' },
      route: { writeAuthority: 'none' },
      retention: { turn: 'not_persisted' },
    });
    expect(repository.writes).toBe(0);
  });

  it('does not persist or propose a turn containing sensitive data', async () => {
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
      conversationId: 'conversation_sensitive',
      turnId: 'turn_sensitive',
      text: 'پسورد من: super-secret-value است؛ این را یادت بمونه.',
      proposeMemory: true,
      occurredAt,
    });

    expect(result.memoryProposal).toBeUndefined();
    expect(result.orchestration.retention.turn).toBe('not_persisted');
    expect(result.orchestration.safety.sensitiveDataDetected).toBe(true);
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
    expect(result.orchestration.retention.turn).toBe('confidential');
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

  it('corrects confirmed memory without rewriting its history', async () => {
    const service = new ConversationIntakeService();
    const proposal = (await service.submitTurn({
      tenantId: tenant,
      actorId: owner,
      conversationId: 'conversation_rights',
      turnId: 'turn_rights_correct',
      text: 'من همیشه تصمیم‌ها را سریع می‌گیرم.',
      proposeMemory: true,
      occurredAt,
    })).memoryProposal;
    if (!proposal) throw new Error('Expected memory proposal.');
    await service.confirmMemory({
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

    const request = {
      tenantId: tenant,
      actorId: owner,
      proposalId: proposal.id,
      requestId: 'right_correct_one',
      operation: {
        kind: 'correct' as const,
        reason: 'عبارت قبلی بیش از حد مطلق بود.',
        correctedText: 'در شرایط کم‌ریسک معمولاً سریع تصمیم می‌گیرم.',
      },
      occurredAt: new Date('2026-08-31T13:10:00.000Z'),
    };
    const corrected = await service.applyMemoryRight(request);
    const repeated = await service.applyMemoryRight(request);

    expect(corrected).toMatchObject({ outcome: 'applied', operation: 'correct' });
    expect(corrected.activeAssertionId).not.toBeUndefined();
    expect(repeated).toMatchObject({
      outcome: 'already_applied',
      activeAssertionId: corrected.activeAssertionId,
    });
  });

  it.each(['contest', 'revoke', 'delete'] as const)(
    'applies the %s right only after explicit confirmation',
    async (kind) => {
      const service = new ConversationIntakeService();
      const proposal = (await service.submitTurn({
        tenantId: tenant,
        actorId: owner,
        conversationId: `conversation_${kind}`,
        turnId: `turn_right_${kind}`,
        text: 'این برداشت باید تحت کنترل مستقیم من باشد.',
        proposeMemory: true,
        occurredAt,
      })).memoryProposal;
      if (!proposal) throw new Error('Expected memory proposal.');
      await service.confirmMemory({
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

      const result = await service.applyMemoryRight({
        tenantId: tenant,
        actorId: owner,
        proposalId: proposal.id,
        requestId: `right_${kind}_one`,
        operation: { kind, reason: 'درخواست صریح کاربر برای کنترل حافظه.' },
        occurredAt: new Date('2026-08-31T13:11:00.000Z'),
      });

      expect(result.operation).toBe(kind);
      expect(result.permissionsRevoked).toBe(kind === 'revoke' || kind === 'delete');
      if (kind === 'delete') {
        await expect(service.confirmMemory({
          tenantId: tenant,
          actorId: owner,
          proposalId: proposal.id,
          permissions: {
            personalUnderstanding: true,
            brandUsage: false,
            publicUsage: false,
          },
          confirmedAt: new Date('2026-08-31T13:12:00.000Z'),
        })).rejects.toThrow(MemoryProposalNotFoundError);
      }
    },
  );

  it('rejects a reused right request ID with different meaning', async () => {
    const service = new ConversationIntakeService();
    const proposal = (await service.submitTurn({
      tenantId: tenant,
      actorId: owner,
      conversationId: 'conversation_right_conflict',
      turnId: 'turn_right_conflict',
      text: 'یک برداشت قابل کنترل.',
      proposeMemory: true,
      occurredAt,
    })).memoryProposal;
    if (!proposal) throw new Error('Expected memory proposal.');
    await service.confirmMemory({
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
    const common = {
      tenantId: tenant,
      actorId: owner,
      proposalId: proposal.id,
      requestId: 'right_conflicting',
      occurredAt: new Date('2026-08-31T13:12:00.000Z'),
    };
    await service.applyMemoryRight({
      ...common,
      operation: { kind: 'contest', reason: 'این برداشت دقیق نیست.' },
    });
    await expect(service.applyMemoryRight({
      ...common,
      operation: { kind: 'revoke', reason: 'مجوز استفاده را لغو می‌کنم.' },
    })).rejects.toThrow(MemoryProposalConflictError);
  });

  it('builds a redacted personal-memory snapshot with provenance and consent status', async () => {
    const service = new ConversationIntakeService();
    const createConfirmed = async (suffix: string, text: string) => {
      const proposal = (await service.submitTurn({
        tenantId: tenant,
        actorId: owner,
        conversationId: `conversation_snapshot_${suffix}`,
        turnId: `turn_snapshot_${suffix}`,
        text,
        proposeMemory: true,
        occurredAt,
      })).memoryProposal;
      if (!proposal) throw new Error('Expected memory proposal.');
      await service.confirmMemory({
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
      return proposal;
    };
    await createConfirmed('active', 'این حافظه فعال باقی می‌ماند.');
    const corrected = await createConfirmed('corrected', 'این متن نیاز به اصلاح دارد.');
    await service.applyMemoryRight({
      tenantId: tenant,
      actorId: owner,
      proposalId: corrected.id,
      requestId: 'right_snapshot_correct',
      operation: {
        kind: 'correct',
        reason: 'نسخه دقیق‌تر جایگزین شود.',
        correctedText: 'این نسخه اصلاح‌شده و دقیق‌تر است.',
      },
      occurredAt: new Date('2026-08-31T13:20:00.000Z'),
    });
    await service.applyMemoryRight({
      tenantId: tenant,
      actorId: owner,
      proposalId: corrected.id,
      requestId: 'right_snapshot_contest',
      operation: { kind: 'contest', reason: 'این برداشت هنوز نیاز به بررسی دارد.' },
      occurredAt: new Date('2026-08-31T13:21:00.000Z'),
    });
    const revoked = await createConfirmed('revoked', 'این حافظه باید بدون مجوز بماند.');
    await service.applyMemoryRight({
      tenantId: tenant,
      actorId: owner,
      proposalId: revoked.id,
      requestId: 'right_snapshot_revoke',
      operation: { kind: 'revoke', reason: 'مجوز استفاده لغو شد.' },
      occurredAt: new Date('2026-08-31T13:22:00.000Z'),
    });
    const deleted = await createConfirmed('deleted', 'این متن پس از حذف نباید برگردد.');
    await service.applyMemoryRight({
      tenantId: tenant,
      actorId: owner,
      proposalId: deleted.id,
      requestId: 'right_snapshot_delete',
      operation: { kind: 'delete', reason: 'درخواست حذف صریح کاربر.' },
      occurredAt: new Date('2026-08-31T13:23:00.000Z'),
    });

    const snapshot = await service.memorySnapshot({
      tenantId: tenant,
      actorId: owner,
      generatedAt: new Date('2026-08-31T13:24:00.000Z'),
    });

    expect(snapshot.summary).toEqual({ total: 4, active: 1, attentionRequired: 2, deleted: 1 });
    expect(snapshot.records.find((record) => record.proposalId === corrected.id)).toMatchObject({
      text: 'این نسخه اصلاح‌شده و دقیق‌تر است.',
      provenance: { sourceTypes: ['user_correction'] },
      lifecycle: { status: 'contested', revisionCount: 2 },
    });
    expect(snapshot.records.find((record) => record.proposalId === revoked.id)).toMatchObject({
      consent: { personalUnderstanding: false, brandUsage: false, publicUsage: false },
      lifecycle: { status: 'consent_revoked' },
    });
    expect(snapshot.records.find((record) => record.proposalId === deleted.id)).toMatchObject({
      text: null,
      provenance: { evidenceCount: 0, sourceTypes: [] },
      lifecycle: { status: 'deleted' },
    });
  });
});
