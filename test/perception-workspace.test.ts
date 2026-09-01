import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  InMemoryPerceptionWorkspaceRepository,
  PerceptionConflictError,
  PerceptionNotFoundError,
  PerceptionPermissionError,
  PerceptionValidationError,
  PerceptionWorkspaceService,
} from '../src/perception/workspace.js';

const tenant = tenantId('00000000-0000-4000-8000-000000000001');
const owner = userId('00000000-0000-4000-8000-000000000002');
const outsider = userId('00000000-0000-4000-8000-000000000003');
const now = new Date('2026-08-31T12:00:00.000Z');

function workspace(): PerceptionWorkspaceService {
  return new PerceptionWorkspaceService(
    new InMemoryPerceptionWorkspaceRepository(),
    { tenantId: tenant, ownerUserId: owner },
  );
}

function input(requestId = 'perception_create_1') {
  return {
    actorId: owner,
    requestId,
    dimension: 'trust' as const,
    perspective: 'external_perception' as const,
    stage: 'visible' as const,
    summary: 'اعتماد در تعامل‌های حرفه‌ای دیده شده است.',
    evidenceNote: 'خلاصه‌ی بدون هویت از بازخورد مستقیم و با اجازه‌ی ثبت.',
    sourceKind: 'direct_feedback' as const,
    confidence: 'medium' as const,
    observedAt: new Date('2026-08-20T12:00:00.000Z'),
    consentConfirmed: true,
    occurredAt: now,
  };
}

describe('perception workspace', () => {
  it('separates epistemic lanes and reports a qualitative gap without hidden scoring', async () => {
    const service = workspace();
    await service.create(input());
    await service.create({
      ...input('perception_self_1'),
      perspective: 'self_perception',
      sourceKind: 'owner_reflection',
      stage: 'signature',
      summary: 'مالک اعتمادسازی را یکی از ویژگی‌های شاخص خود می‌داند.',
    });
    await service.create({
      ...input('perception_desired_1'),
      perspective: 'desired_positioning',
      sourceKind: 'owner_goal',
      stage: 'strong',
      summary: 'جایگاه مطلوب، اعتماد حرفه‌ای قوی و پایدار است.',
    });

    const snapshot = await service.snapshot(owner, now);
    expect(snapshot.policyVersion).toBe('perception-engine-v1');
    expect(snapshot.summary).toMatchObject({
      totalSignals: 3,
      coveredDimensions: 1,
      externalSignals: 1,
      underrecognized: 1,
      potentialBlindSpots: 1,
    });
    expect(snapshot.dimensions[0]).toMatchObject({
      dimension: 'trust',
      selfStage: 'signature',
      desiredStage: 'strong',
      externalRange: { lowest: 'visible', highest: 'visible', signalCount: 1, conflictingStages: false },
      gap: 'underrecognized',
      blindSpot: 'self_higher_than_external',
    });
    expect(snapshot.signals.map((signal) => signal.epistemicType).sort()).toEqual([
      'external_perception', 'goal', 'self_report',
    ]);
    expect(snapshot.signals[0]?.privacy).toEqual({
      dataClass: 'confidential',
      allowedPurpose: 'perception_analysis',
      sourceIdentityStored: false,
      verbatimPrivateQuoteStored: false,
      automatedCollectionPermitted: false,
      externalActionPermitted: false,
    });
  });

  it('preserves conflicting external stages as a range', async () => {
    const service = workspace();
    await service.create(input());
    await service.create({
      ...input('perception_external_2'),
      stage: 'strong',
      sourceKind: 'network_feedback',
      observedAt: new Date('2026-08-25T12:00:00.000Z'),
      summary: 'در شبکه‌ی حرفه‌ای اعتماد قوی گزارش شده است.',
    });
    await service.create({
      ...input('perception_desired_2'),
      perspective: 'desired_positioning',
      sourceKind: 'owner_goal',
      stage: 'strong',
      summary: 'هدف، اعتماد حرفه‌ای قوی است.',
    });
    const dimension = (await service.snapshot(owner, now)).dimensions[0];
    expect(dimension).toMatchObject({
      externalRange: { lowest: 'visible', highest: 'strong', signalCount: 2, conflictingStages: true },
      gap: 'aligned_range',
    });
    expect(dimension?.rationale).toContain('اختلاف Signalها حفظ شده');
  });

  it('returns insufficient evidence instead of inventing a conclusion', async () => {
    const service = workspace();
    await service.create({
      ...input(),
      perspective: 'self_perception',
      sourceKind: 'owner_reflection',
    });
    const dimension = (await service.snapshot(owner, now)).dimensions[0];
    expect(dimension).toMatchObject({ gap: 'insufficient_evidence', blindSpot: 'insufficient_evidence' });
    expect(dimension?.rationale).toContain('داده کافی نیست');
  });

  it('is idempotent and hard-deletes sensitive signal text', async () => {
    const service = workspace();
    const first = await service.create(input());
    await expect(service.create({ ...input(), occurredAt: new Date('2026-08-31T12:05:00.000Z') }))
      .resolves.toMatchObject({ outcome: 'already_applied', record: { signalId: first.record.signalId } });
    await expect(service.create({ ...input(), stage: 'strong' })).rejects.toBeInstanceOf(PerceptionConflictError);
    const deletion = {
      actorId: owner,
      requestId: 'perception_delete_1',
      signalId: first.record.signalId,
      occurredAt: new Date('2026-08-31T12:10:00.000Z'),
    };
    await expect(service.delete(deletion)).resolves.toMatchObject({ outcome: 'deleted' });
    await expect(service.delete({ ...deletion, occurredAt: new Date('2026-08-31T12:15:00.000Z') }))
      .resolves.toMatchObject({ outcome: 'already_applied' });
    expect((await service.snapshot(owner, now)).signals).toEqual([]);
    await expect(service.create(input())).rejects.toBeInstanceOf(PerceptionConflictError);
    await expect(service.delete({ ...deletion, requestId: 'perception_delete_2' }))
      .rejects.toBeInstanceOf(PerceptionNotFoundError);
  });

  it('requires owner permission, explicit consent, valid source lanes and non-future dates', async () => {
    const service = workspace();
    await expect(service.create({ ...input(), actorId: outsider })).rejects.toBeInstanceOf(PerceptionPermissionError);
    await expect(service.create({ ...input(), consentConfirmed: false })).rejects.toBeInstanceOf(PerceptionValidationError);
    await expect(service.create({ ...input(), sourceKind: 'owner_goal' })).rejects.toBeInstanceOf(PerceptionValidationError);
    await expect(service.create({ ...input(), observedAt: new Date('2026-09-01T00:00:00.000Z') }))
      .rejects.toBeInstanceOf(PerceptionValidationError);
  });
});
