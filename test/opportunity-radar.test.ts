import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import { OpportunityRadarPermissionError, OpportunityRadarService } from '../src/opportunities/radar.js';
import { researchSourceSafetyPolicy } from '../src/research/source-safety.js';
import type { ResearchWorkspaceSnapshot } from '../src/research/workspace.js';
import type { StrategyContextSnapshot } from '../src/strategy/context.js';

const tenant = tenantId('tenant_primary');
const owner = userId('owner_primary');
const now = new Date('2026-08-31T12:00:00.000Z');

const strategy: StrategyContextSnapshot = {
  goalId: 'goal', positioningId: 'position', revision: 3, updatedAt: now, persistence: 'memory',
  goal: { title: 'تقویت اعتماد در تصمیم‌گیری', outcome: 'گفت‌وگوی عمیق با بنیان‌گذاران', priority: 5, successMetrics: ['کیفیت تعامل'], horizon: 'سه ماه' },
  desiredPositioning: { audience: 'بنیان‌گذاران فناوری', desiredPerception: 'مشاور قابل‌اعتماد', differentiation: 'تصمیم شفاف و مبتنی بر شواهد', proofPoints: ['اعتماد تیم'], horizon: 'سه ماه' },
};

function source(input: Partial<ResearchWorkspaceSnapshot['sources'][number]> & Pick<ResearchWorkspaceSnapshot['sources'][number], 'sourceId' | 'title' | 'statement'>): ResearchWorkspaceSnapshot['sources'][number] {
  return {
    claimId: `claim_${input.sourceId}`, evidenceId: `evidence_${input.sourceId}`, requestId: `request_${input.sourceId}`,
    publisher: 'مرکز پژوهش معتبر', url: `https://example.org/${input.sourceId}`,
    excerpt: 'این گزارش جزئیات کافی برای ارزیابی اولیه را ارائه می‌کند.', quality: 'primary', stance: 'supports',
    publishedAt: new Date('2026-08-20T00:00:00.000Z'), accessedAt: now, maxAgeDays: 90,
    qualityScore: 1, freshness: 'fresh', ageDays: 11, factCheckStatus: 'citation_ready',
    conflictDetected: false, citation: `Citation ${input.sourceId}`, usableForPublicClaim: true,
    ...input,
  };
}

function radar(sources: ResearchWorkspaceSnapshot['sources']): OpportunityRadarService {
  const research: ResearchWorkspaceSnapshot = {
    generatedAt: now, persistence: 'memory',
    sourceSafety: researchSourceSafetyPolicy.snapshot(),
    summary: { totalSources: sources.length, citationReady: sources.length, stale: 0, conflicts: 0, unverified: 0 },
    sources,
  };
  return new OpportunityRadarService(
    { tenantId: tenant, ownerUserId: owner },
    { snapshot: () => Promise.resolve(research) },
    { snapshot: () => Promise.resolve(strategy) },
  );
}

describe('OpportunityRadarService', () => {
  it('distinguishes direct opportunity context from a trend and grants no action authority', async () => {
    const snapshot = await radar([
      source({ sourceId: 'direct', title: 'اعتماد بنیان‌گذاران در تصمیم شفاف', statement: 'تصمیم شفاف و شواهد، اعتماد تیم فناوری را تقویت می‌کند.' }),
    ]).snapshot(owner, now);
    expect(snapshot).toMatchObject({
      policyVersion: 'opportunity-radar-v1', strategyRevision: 3,
      summary: { sourcesAssessed: 1, consider: 1, explorationBudget: 1, explorationUsed: 0 },
      boundaries: { externalMonitoringIncluded: false, trendIsOpportunity: false, hiddenOpportunityScoreUsed: false, actionRecommended: false, externalActionPermitted: false },
    });
    expect(snapshot.assessments[0]).toMatchObject({
      alignment: 'direct', decision: 'consider', exploration: false, nextStep: 'bring_to_strategy_review',
      boundaries: { trendIsOpportunity: false, actionRecommended: false, publicApprovalGranted: false, externalActionPermitted: false },
    });
  });

  it('limits adjacent exploration to one source per snapshot', async () => {
    const snapshot = await radar([
      source({ sourceId: 'adjacent_one', title: 'جامعه‌های خلاق شهری', statement: 'پژوهش تازه درباره همکاری در یک حوزه مجاور.' }),
      source({ sourceId: 'adjacent_two', title: 'فرهنگ یادگیری موسیقی', statement: 'پژوهش معتبر در یک جامعه متفاوت و تازه.' }),
    ]).snapshot(owner, now);
    expect(snapshot.summary).toMatchObject({ explore: 1, monitor: 1, explorationUsed: 1 });
    expect(snapshot.assessments.filter((item) => item.exploration)).toHaveLength(1);
  });

  it('ignores stale or unverified sources and monitors conflicts', async () => {
    const snapshot = await radar([
      source({ sourceId: 'stale', title: 'اعتماد در فناوری', statement: 'تصمیم شفاف', freshness: 'stale', ageDays: 500 }),
      source({ sourceId: 'conflict', title: 'اعتماد بنیان‌گذاران', statement: 'تصمیم شفاف', conflictDetected: true, factCheckStatus: 'conflicted' }),
    ]).snapshot(owner, now);
    expect(snapshot.assessments).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'stale', decision: 'ignore' }),
      expect.objectContaining({ sourceId: 'conflict', decision: 'monitor', nextStep: 'research_more' }),
    ]));
  });

  it('is owner-only', async () => {
    await expect(radar([]).snapshot(userId('another_user'), now)).rejects.toBeInstanceOf(OpportunityRadarPermissionError);
  });
});
