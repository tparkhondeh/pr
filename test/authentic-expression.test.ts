import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import { AuthenticExpressionPermissionError, AuthenticExpressionService } from '../src/expression/authentic-expression.js';
import type { TextAssetSnapshot } from '../src/assets/text-asset-intake.js';
import type { FeedbackLearningSnapshot } from '../src/feedback/workspace.js';

const tenant = tenantId('tenant_primary');
const owner = userId('owner_primary');
const now = new Date('2026-08-31T12:00:00.000Z');

function assetSnapshot(brandUsage = true): TextAssetSnapshot {
  return {
    generatedAt: now,
    persistence: 'memory',
    summary: { assets: 1, evidenceItems: 1, assertions: 1, dataRights: 0 },
    records: [{
      requestId: 'asset_expression', assetId: 'asset_expression', evidenceId: 'evidence_expression', assertionId: 'assertion_expression',
      title: 'تصمیم شفاف در بحران', content: 'جزئیات محرمانه منبع', assertionText: 'شفافیت تصمیم در بحران اعتماد تیم را حفظ کرد.',
      sourceType: 'text_asset', dataClass: 'confidential', integritySha256: 'a'.repeat(64), occurredAt: now, importedAt: now,
      permissions: { personalUnderstanding: true, brandUsage },
    }],
  };
}

function feedbackSnapshot(applied = false): FeedbackLearningSnapshot {
  return {
    generatedAt: now, persistence: 'memory', summary: { recentEvents: 3, proposed: applied ? 0 : 1, applied: applied ? 1 : 0 }, recentEvents: [],
    preferences: [{
      id: '11111111-1111-4111-8111-111111111111', tenantId: tenant, userId: owner,
      preferenceKey: 'voice.question_cta', proposedValue: 'omit', evidenceEventIds: ['1', '2', '3'],
      rationale: 'کاربر سه بار پرسش پایانی را حذف کرده است.', confidence: 0.6, status: applied ? 'applied' : 'proposed', proposedAt: now,
    }],
  };
}

function service(brandUsage = true, applied = false): AuthenticExpressionService {
  return new AuthenticExpressionService(
    { tenantId: tenant, ownerUserId: owner },
    { snapshot: () => Promise.resolve(assetSnapshot(brandUsage)) },
    { snapshot: () => Promise.resolve(feedbackSnapshot(applied)) },
  );
}

describe('AuthenticExpressionService', () => {
  it('builds evidence-bound narrative seeds without promoting them to facts', async () => {
    const snapshot = await service().snapshot(owner, now);
    expect(snapshot).toMatchObject({
      policyVersion: 'authentic-expression-v1',
      summary: { narrativeSeeds: 1, evidenceBoundSeeds: 1, proposedVoiceSignals: 1, appliedVoiceSignals: 0, voiceMaturity: 'learning' },
      boundaries: { narrativeSeedIsBrandFact: false, voiceProposalAppliesAutomatically: false, factCheckIncluded: false, externalActionPermitted: false },
    });
    expect(snapshot.narrativeSeeds[0]).toMatchObject({
      maturity: 'single_source', epistemicType: 'evidence_backed_candidate',
      source: { ref: 'asset_expression', assertionId: 'assertion_expression', evidenceId: 'evidence_expression' },
      privacy: { externalActionPermitted: false },
    });
  });

  it('blocks ungrounded text and preserves all approval boundaries', async () => {
    const review = await service().review({ actorId: owner, content: 'در دنیای امروز همه ما می‌دانیم که اعتماد مهم است.', assetRefs: [], reviewedAt: now });
    expect(review).toMatchObject({
      outcome: 'block', policyVersion: 'authentic-expression-v1',
      boundaries: { factCheckIncluded: false, claimApprovalGranted: false, publicApprovalGranted: false, externalActionPermitted: false },
    });
    expect(review.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'grounding', level: 'red' }),
      expect.objectContaining({ dimension: 'generic_language', level: 'yellow' }),
    ]));
  });

  it('passes specific evidence-bound text and detects an approved voice conflict', async () => {
    const grounded = await service().review({
      actorId: owner,
      content: 'شفافیت تصمیم در بحران اعتماد تیم را حفظ کرد؛ این مشاهده از همان تجربه مشخص آمده است.',
      assetRefs: ['asset_expression'], reviewedAt: now,
    });
    expect(grounded.outcome).toBe('pass');
    expect(grounded.matchedPersonalTerms.length).toBeGreaterThanOrEqual(2);

    const conflict = await service(true, true).review({
      actorId: owner,
      content: 'شفافیت تصمیم در بحران اعتماد تیم را حفظ کرد؛ تجربه مشخصی که باید با جزئیات بررسی شود. نظر شما چیست؟',
      assetRefs: ['asset_expression'], reviewedAt: now,
    });
    expect(conflict.outcome).toBe('revise');
    expect(conflict.findings).toContainEqual(expect.objectContaining({ dimension: 'voice_alignment', level: 'yellow' }));
  });

  it('fails closed for unauthorized sources and non-owner access', async () => {
    await expect(service(false).review({ actorId: owner, content: 'این متن به یک منبع بدون اجازه متصل شده است.', assetRefs: ['asset_expression'], reviewedAt: now }))
      .rejects.toBeInstanceOf(AuthenticExpressionPermissionError);
    await expect(service().snapshot(userId('another_user'), now)).rejects.toBeInstanceOf(AuthenticExpressionPermissionError);
  });
});
