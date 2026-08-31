import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  BrandProtectionBlockedError,
  BrandProtectionConflictError,
  BrandProtectionService,
  InMemoryRiskReviewRepository,
  assessAction,
  riskDimensions,
} from '../src/risk/brand-protection.js';
import type { WorkbenchAction } from '../src/workbench/workbench.js';

const owner = userId('owner_primary');
const context = { tenantId: tenantId('tenant_primary'), ownerUserId: owner };
const reviewedAt = new Date('2026-08-31T22:30:00.000Z');

function action(overrides: Partial<WorkbenchAction> = {}): WorkbenchAction {
  return {
    id: 'essay',
    kind: 'content',
    title: 'یادداشت تحلیلی مستند',
    rationale: 'یک تجربه واقعی را بدون اغراق و با زمینه روشن توضیح می‌دهد.',
    benefits: ['تقویت اعتماد'],
    risks: ['برداشت نادرست از تجربه'],
    prerequisites: ['بررسی ادعاها'],
    evidenceIds: ['evidence_real'],
    evidenceCount: 1,
    confidence: 0.8,
    riskLevel: 'medium',
    attentionCostMinutes: 30,
    energyCost: 2,
    feasible: true,
    utilityScore: 70,
    opportunityCost: 0,
    rank: 1,
    evidenceState: 'grounded',
    evidenceSourceTypes: ['text_asset'],
    interaction: 'approve',
    ...overrides,
  };
}

describe('cross-cutting brand protection', () => {
  it('evaluates every required dimension and requires owner acknowledgement for yellow actions', async () => {
    const repository = new InMemoryRiskReviewRepository();
    const service = new BrandProtectionService(repository, context);
    const assessment = assessAction(action());

    expect(assessment.level).toBe('yellow');
    expect(assessment.gate).toBe('review_required');
    expect(assessment.findings.map((finding) => finding.dimension)).toEqual(riskDimensions);
    expect(assessment.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'public_exposure', level: 'yellow' }),
      expect.objectContaining({ dimension: 'misinterpretation', level: 'yellow' }),
      expect.objectContaining({ dimension: 'disclosure', level: 'yellow' }),
    ]));
    await expect(service.authorizeAction(owner, action())).rejects.toMatchObject({
      reason: 'risk_review_required',
    });

    const result = await service.review({
      actorId: owner,
      action: action(),
      requestId: 'risk_review_essay',
      expectedLevel: assessment.level,
      expectedAssessmentHash: assessment.assessmentHash,
      decision: 'acknowledge',
      rationale: 'پیامدهای انتشار عمومی و احتمال برداشت نادرست را مرور و محدودیت‌ها را پذیرفتم.',
      humanAttestation: true,
      reviewedAt,
    });
    expect(result.outcome).toBe('applied');
    const replay = await service.review({
      actorId: owner,
      action: action(),
      requestId: 'risk_review_essay',
      expectedLevel: assessment.level,
      expectedAssessmentHash: assessment.assessmentHash,
      decision: 'acknowledge',
      rationale: 'پیامدهای انتشار عمومی و احتمال برداشت نادرست را مرور و محدودیت‌ها را پذیرفتم.',
      humanAttestation: true,
      reviewedAt: new Date('2026-08-31T22:35:00.000Z'),
    });
    expect(replay.outcome).toBe('already_applied');
    expect(replay.review.reviewedAt).toEqual(reviewedAt);
    await expect(service.authorizeAction(owner, action())).resolves.toBeUndefined();

    const snapshot = await service.snapshot(owner, [action()], null, reviewedAt);
    expect(snapshot.assessments[0]).toMatchObject({
      level: 'yellow',
      gate: 'allowed_with_acknowledgement',
      lastReview: { decision: 'acknowledge' },
    });
    expect(snapshot.claimPosture.note).toContain('Fail-closed');
  });

  it('makes red a non-overridable veto even with high strategic value', async () => {
    const service = new BrandProtectionService(new InMemoryRiskReviewRepository(), context);
    const unsafe = action({
      id: 'unsafe_publication',
      title: 'انتشار اتهام علیه شخص ثالث',
      rationale: 'برای Engagement بالا یک اتهام تأییدنشده را عمومی می‌کند.',
      risks: ['افترا و افشای داده محرمانه'],
      riskLevel: 'high',
      utilityScore: 99,
    });
    const assessment = assessAction(unsafe);

    expect(assessment.level).toBe('red');
    expect(assessment.reviewableDecisions).not.toContain('acknowledge');
    expect(assessment.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: 'defamation', level: 'red' }),
      expect.objectContaining({ dimension: 'sensitive_data', level: 'red' }),
      expect.objectContaining({ dimension: 'reputation_risk', level: 'red' }),
    ]));
    await expect(service.authorizeAction(owner, unsafe)).rejects.toBeInstanceOf(BrandProtectionBlockedError);
    await expect(service.review({
      actorId: owner,
      action: unsafe,
      requestId: 'risk_red_override',
      expectedLevel: 'red',
      expectedAssessmentHash: assessment.assessmentHash,
      decision: 'acknowledge',
      rationale: 'با وجود ریسک قرمز می‌خواهم آن را تأیید و مستقیماً منتشر کنم.',
      humanAttestation: true,
      reviewedAt,
    })).rejects.toBeInstanceOf(BrandProtectionConflictError);
  });

  it('invalidates an acknowledgement when the assessed action changes', async () => {
    const service = new BrandProtectionService(new InMemoryRiskReviewRepository(), context);
    const initial = action();
    const assessment = assessAction(initial);
    await service.review({
      actorId: owner,
      action: initial,
      requestId: 'risk_stale_review',
      expectedLevel: 'yellow',
      expectedAssessmentHash: assessment.assessmentHash,
      decision: 'acknowledge',
      rationale: 'ریسک‌های نسخه فعلی اقدام را مرور کردم و با کنترل‌های ثبت‌شده موافقم.',
      humanAttestation: true,
      reviewedAt,
    });

    const changed = action({ risks: ['برداشت نادرست', 'داده محرمانه شخص ثالث'] });
    await expect(service.authorizeAction(owner, changed)).rejects.toMatchObject({ reason: 'risk_blocked' });
  });
});
