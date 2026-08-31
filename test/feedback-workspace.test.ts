import { describe, expect, it } from 'vitest';
import {
  FeedbackLearningService,
  FeedbackPermissionError,
  InMemoryFeedbackLearningRepository,
  analyzeDraftEdit,
} from '../src/feedback/workspace.js';
import { tenantId, userId } from '../src/kernel/identity.js';

const tenant = tenantId('tenant_feedback');
const owner = userId('owner_feedback');

describe('feedback learning workspace', () => {
  it('extracts only material, explainable style signals', () => {
    const before = 'یک تیتر بسیار طولانی برای روایت امروز\n\n## زمینه\n' + 'الف'.repeat(180) + '\n\nنظر شما چیست؟';
    const after = 'تیتر کوتاه\n\n' + 'الف'.repeat(90);
    expect(analyzeDraftEdit(before, after)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'voice.draft_length', value: 'shorter' }),
      expect.objectContaining({ key: 'voice.headline_length', value: 'shorter' }),
      expect.objectContaining({ key: 'voice.heading_density', value: 'lower' }),
      expect.objectContaining({ key: 'voice.question_cta', value: 'omit' }),
    ]));
    expect(analyzeDraftEdit(after, after)).toEqual([]);
  });

  it('requires repeated edits, human application, and supports revocation', async () => {
    const service = new FeedbackLearningService(
      new InMemoryFeedbackLearningRepository(),
      { tenantId: tenant, ownerUserId: owner },
    );
    const before = `تیتر بسیار طولانی که کاربر مرتب آن را کوتاه می‌کند\n\n${'متن '.repeat(80)}\n\nنظر شما چیست؟`;
    const after = `تیتر کوتاه\n\n${'متن '.repeat(20)}`;
    for (const [index, requestId] of ['feedback_edit_one', 'feedback_edit_two', 'feedback_edit_three'].entries()) {
      const snapshot = await service.recordDraftEdit({
        actorId: owner,
        requestId,
        draftId: `draft_${String(index)}`,
        before,
        after,
        occurredAt: new Date(`2026-08-${String(index + 1).padStart(2, '0')}T10:00:00Z`),
      });
      if (index < 2) expect(snapshot.summary.proposed).toBe(0);
    }
    const proposed = await service.snapshot(owner, new Date('2026-08-31T10:00:00Z'));
    const preference = proposed.preferences.find((item) => item.preferenceKey === 'voice.draft_length');
    expect(preference).toMatchObject({ status: 'proposed', proposedValue: 'shorter' });
    if (!preference) throw new Error('Expected a preference proposal.');

    const applied = await service.decide({
      actorId: owner,
      requestId: 'preference_apply_one',
      proposalId: preference.id,
      decision: 'applied',
      occurredAt: new Date('2026-09-01T10:00:00Z'),
    });
    expect(applied.preferences.find((item) => item.id === preference.id)?.status).toBe('applied');
    expect(await service.appliedPreferences(owner, new Date('2026-09-01T10:00:00Z'))).toMatchObject({
      'voice.draft_length': 'shorter',
    });

    const revoked = await service.decide({
      actorId: owner,
      requestId: 'preference_revoke_one',
      proposalId: preference.id,
      decision: 'revoked',
      occurredAt: new Date('2026-09-02T10:00:00Z'),
    });
    expect(revoked.preferences.find((item) => item.id === preference.id)?.status).toBe('revoked');
  });

  it('records explicit rejection without learning identity from one event', async () => {
    const service = new FeedbackLearningService(
      new InMemoryFeedbackLearningRepository(),
      { tenantId: tenant, ownerUserId: owner },
    );
    const snapshot = await service.rejectDraft({
      actorId: owner,
      requestId: 'feedback_reject_one',
      draftId: 'draft_one',
      reason: 'لحن این نسخه بیش از حد رسمی است.',
      occurredAt: new Date('2026-08-31T10:00:00Z'),
    });
    expect(snapshot.recentEvents[0]).toMatchObject({
      eventType: 'rejected',
      signalKey: 'draft.rejection_reason',
    });
    expect(snapshot.preferences).toHaveLength(0);
  });

  it('does not expose the owner model to another actor', () => {
    const service = new FeedbackLearningService(
      new InMemoryFeedbackLearningRepository(),
      { tenantId: tenant, ownerUserId: owner },
    );
    expect(() => service.snapshot(userId('other_user'), new Date())).toThrow(FeedbackPermissionError);
  });
});
