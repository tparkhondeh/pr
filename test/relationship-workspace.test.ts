import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  InMemoryRelationshipWorkspaceRepository,
  RelationshipConflictError,
  RelationshipNotFoundError,
  RelationshipPermissionError,
  RelationshipValidationError,
  RelationshipWorkspaceService,
} from '../src/relationships/workspace.js';

const tenant = tenantId('00000000-0000-4000-8000-000000000001');
const owner = userId('00000000-0000-4000-8000-000000000002');
const outsider = userId('00000000-0000-4000-8000-000000000003');
const now = new Date('2026-08-31T12:00:00.000Z');

function workspace(): RelationshipWorkspaceService {
  return new RelationshipWorkspaceService(
    new InMemoryRelationshipWorkspaceRepository(),
    { tenantId: tenant, ownerUserId: owner },
  );
}

function input(requestId = 'stakeholder_create_1') {
  return {
    actorId: owner,
    requestId,
    label: 'همکار کلیدی',
    group: 'peer' as const,
    outcome: 'تقویت اعتماد برای همکاری بلندمدت',
    priority: 'high' as const,
    strength: 'trusted' as const,
    boundary: 'normal' as const,
    contextNote: 'زمینه رابطه فقط برای برنامه‌ریزی خصوصی ثبت می‌شود.',
    lastInteractionAt: new Date('2026-04-01T12:00:00.000Z'),
    consentConfirmed: true,
    occurredAt: now,
  };
}

describe('relationship workspace', () => {
  it('builds an explainable stakeholder map without contact or automation authority', async () => {
    const service = workspace();
    const created = await service.create(input());
    const snapshot = await service.snapshot(owner, now);

    expect(created.outcome).toBe('applied');
    expect(snapshot.policyVersion).toBe('relationship-intelligence-v1');
    expect(snapshot.summary).toMatchObject({
      totalStakeholders: 1,
      highPriority: 1,
      reviewSuggested: 1,
      boundaryProtected: 0,
    });
    expect(snapshot.groups).toEqual([{ group: 'peer', count: 1, highPriority: 1 }]);
    expect(snapshot.stakeholders[0]).toMatchObject({
      recency: 'dormant',
      attention: 'review_context',
      privacy: {
        dataClass: 'confidential',
        allowedPurpose: 'relationship_planning',
        contactDetailsStored: false,
        automationPermitted: false,
        outboundContactPermitted: false,
      },
    });
  });

  it('is idempotent and rejects conflicting or duplicate relationship context', async () => {
    const service = workspace();
    const first = await service.create(input());
    const replay = await service.create({
      ...input(),
      occurredAt: new Date('2026-08-31T12:10:00.000Z'),
    });
    expect(replay).toMatchObject({ outcome: 'already_applied', record: { stakeholderId: first.record.stakeholderId } });

    await expect(service.create({ ...input(), outcome: 'یک Outcome متفاوت' })).rejects.toBeInstanceOf(RelationshipConflictError);
    await expect(service.create({ ...input('stakeholder_create_2'), requestId: 'stakeholder_create_2' })).rejects.toBeInstanceOf(RelationshipConflictError);
  });

  it('honors prompt boundaries before considering recency', async () => {
    const service = workspace();
    await service.create({ ...input('stakeholder_protected'), label: 'رابطه محافظت‌شده', boundary: 'do_not_prompt' });
    await service.create({
      ...input('stakeholder_approval'),
      label: 'رابطه نیازمند تأیید',
      group: 'client',
      boundary: 'ask_before_prompt',
    });
    const snapshot = await service.snapshot(owner, now);
    expect(snapshot.stakeholders.find((item) => item.label === 'رابطه محافظت‌شده')).toMatchObject({
      recency: 'protected', attention: 'none',
    });
    expect(snapshot.stakeholders.find((item) => item.label === 'رابطه نیازمند تأیید')).toMatchObject({
      recency: 'dormant', attention: 'approval_required',
    });
  });

  it('hard-deletes owner context with idempotent replay', async () => {
    const service = workspace();
    const created = await service.create(input());
    const command = {
      actorId: owner,
      requestId: 'stakeholder_delete_1',
      stakeholderId: created.record.stakeholderId,
      occurredAt: new Date('2026-08-31T12:05:00.000Z'),
    };
    await expect(service.delete(command)).resolves.toMatchObject({ outcome: 'deleted' });
    await expect(service.delete({
      ...command,
      occurredAt: new Date('2026-08-31T12:10:00.000Z'),
    })).resolves.toMatchObject({ outcome: 'already_applied' });
    expect((await service.snapshot(owner, now)).summary.totalStakeholders).toBe(0);
    await expect(service.create(input())).rejects.toBeInstanceOf(RelationshipConflictError);
    await expect(service.delete({ ...command, requestId: 'stakeholder_delete_2' })).rejects.toBeInstanceOf(RelationshipNotFoundError);
  });

  it('requires owner scope, explicit consent and non-future interaction dates', async () => {
    const service = workspace();
    await expect(service.create({ ...input(), actorId: outsider })).rejects.toBeInstanceOf(RelationshipPermissionError);
    await expect(service.create({ ...input(), consentConfirmed: false })).rejects.toBeInstanceOf(RelationshipValidationError);
    await expect(service.create({
      ...input(),
      lastInteractionAt: new Date('2026-09-01T00:00:00.000Z'),
    })).rejects.toBeInstanceOf(RelationshipValidationError);
  });
});
