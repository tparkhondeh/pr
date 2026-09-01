import type { ResearchSourceSnapshot, ResearchWorkspaceService } from '../research/workspace.js';
import type { StrategyContextService, StrategyContextSnapshot } from '../strategy/context.js';
import type { TenantId, UserId } from '../kernel/identity.js';

export type OpportunityDecision = 'ignore' | 'monitor' | 'explore' | 'consider';
export type OpportunityAlignment = 'none' | 'adjacent' | 'direct';
export type OpportunityFactorStatus = 'favorable' | 'caution' | 'unknown';

export type OpportunityFactor = Readonly<{
  factor: 'goal' | 'audience' | 'timing' | 'source_quality' | 'source_conflict';
  status: OpportunityFactorStatus;
  rationale: string;
}>;

export type OpportunityAssessment = Readonly<{
  sourceId: string;
  title: string;
  publisher: string;
  citation: string;
  alignment: OpportunityAlignment;
  decision: OpportunityDecision;
  exploration: boolean;
  matchedGoalTerms: readonly string[];
  matchedAudienceTerms: readonly string[];
  factors: readonly OpportunityFactor[];
  rationale: string;
  uncertainty: string;
  nextStep: 'ignore' | 'watch' | 'research_more' | 'bring_to_strategy_review';
  trace: Readonly<{
    claimId: string;
    evidenceId: string;
    factCheckStatus: ResearchSourceSnapshot['factCheckStatus'];
  }>;
  boundaries: Readonly<{
    trendIsOpportunity: false;
    actionRecommended: false;
    publicApprovalGranted: false;
    externalActionPermitted: false;
  }>;
}>;

export type OpportunityRadarSnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres' | 'mixed';
  policyVersion: 'opportunity-radar-v1';
  strategyRevision: number;
  summary: Readonly<{
    sourcesAssessed: number;
    consider: number;
    monitor: number;
    explore: number;
    ignored: number;
    explorationBudget: 1;
    explorationUsed: number;
  }>;
  assessments: readonly OpportunityAssessment[];
  boundaries: Readonly<{
    externalMonitoringIncluded: false;
    trendIsOpportunity: false;
    hiddenOpportunityScoreUsed: false;
    actionRecommended: false;
    externalActionPermitted: false;
  }>;
}>;

export class OpportunityRadarPermissionError extends Error {}
export class OpportunityRadarValidationError extends Error {}

export class OpportunityRadarService {
  public constructor(
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly research: Pick<ResearchWorkspaceService, 'snapshot'>,
    private readonly strategy: Pick<StrategyContextService, 'snapshot'>,
  ) {}

  public async snapshot(actorId: UserId, generatedAt: Date): Promise<OpportunityRadarSnapshot> {
    this.assertOwner(actorId);
    if (Number.isNaN(generatedAt.getTime())) throw new OpportunityRadarValidationError('Opportunity radar date is invalid.');
    const [research, strategy] = await Promise.all([
      this.research.snapshot(actorId, generatedAt),
      this.strategy.snapshot(actorId),
    ]);
    let explorationUsed = false;
    const assessments = research.sources.map((source) => {
      const base = assessSource(source, strategy);
      if (base.explorationEligible && !explorationUsed) {
        explorationUsed = true;
        return finalizeAssessment(base, 'explore', true, 'research_more',
          'این Source تازه و معتبر با یک حوزه مجاور تماس دارد؛ در سقف Exploration این Snapshot فقط برای تحقیق بیشتر نگه داشته می‌شود.');
      }
      if (base.explorationEligible) {
        return finalizeAssessment(base, 'monitor', false, 'watch',
          'Source مجاور است، اما بودجه Exploration این Snapshot مصرف شده؛ فقط در Watchlist می‌ماند.');
      }
      return finalizeAssessment(base, base.decision, false, base.nextStep, base.rationale);
    });
    return {
      generatedAt,
      persistence: research.persistence === strategy.persistence ? research.persistence : 'mixed',
      policyVersion: 'opportunity-radar-v1',
      strategyRevision: strategy.revision,
      summary: {
        sourcesAssessed: assessments.length,
        consider: assessments.filter((item) => item.decision === 'consider').length,
        monitor: assessments.filter((item) => item.decision === 'monitor').length,
        explore: assessments.filter((item) => item.decision === 'explore').length,
        ignored: assessments.filter((item) => item.decision === 'ignore').length,
        explorationBudget: 1,
        explorationUsed: assessments.filter((item) => item.exploration).length,
      },
      assessments,
      boundaries: {
        externalMonitoringIncluded: false,
        trendIsOpportunity: false,
        hiddenOpportunityScoreUsed: false,
        actionRecommended: false,
        externalActionPermitted: false,
      },
    };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) throw new OpportunityRadarPermissionError('Only the owner can inspect opportunity assessments.');
  }
}

type BaseAssessment = Readonly<{
  source: ResearchSourceSnapshot;
  alignment: OpportunityAlignment;
  matchedGoalTerms: readonly string[];
  matchedAudienceTerms: readonly string[];
  factors: readonly OpportunityFactor[];
  decision: Exclude<OpportunityDecision, 'explore'>;
  explorationEligible: boolean;
  rationale: string;
  uncertainty: string;
  nextStep: OpportunityAssessment['nextStep'];
}>;

function assessSource(source: ResearchSourceSnapshot, strategy: StrategyContextSnapshot): BaseAssessment {
  const sourceTerms = new Set(terms(`${source.title} ${source.statement} ${source.excerpt} ${source.publisher}`));
  const goalTerms = terms(`${strategy.goal.title} ${strategy.goal.outcome} ${strategy.goal.successMetrics.join(' ')}`);
  const audienceTerms = terms(`${strategy.desiredPositioning.audience} ${strategy.desiredPositioning.desiredPerception} ${strategy.desiredPositioning.differentiation} ${strategy.desiredPositioning.proofPoints.join(' ')}`);
  const matchedGoalTerms = distinct(goalTerms.filter((term) => sourceTerms.has(term))).slice(0, 12);
  const matchedAudienceTerms = distinct(audienceTerms.filter((term) => sourceTerms.has(term))).slice(0, 12);
  const totalMatches = new Set([...matchedGoalTerms, ...matchedAudienceTerms]).size;
  const alignment: OpportunityAlignment = (
    (matchedGoalTerms.length > 0 && matchedAudienceTerms.length > 0) || totalMatches >= 3
  ) ? 'direct' : totalMatches > 0 ? 'adjacent' : 'none';
  const qualityFavorable = source.quality === 'primary' || source.quality === 'authoritative_secondary';
  const timingFavorable = source.freshness === 'fresh';
  const conflict = source.conflictDetected || source.factCheckStatus === 'conflicted' || source.factCheckStatus === 'contradicted';
  const factors: readonly OpportunityFactor[] = [
    factor('goal', matchedGoalTerms.length > 0 ? 'favorable' : 'unknown', matchedGoalTerms.length > 0 ? `هم‌پوشانی با Goal: ${matchedGoalTerms.join('، ')}` : 'هم‌پوشانی واژگانی روشن با Goal ثبت‌شده پیدا نشد.'),
    factor('audience', matchedAudienceTerms.length > 0 ? 'favorable' : 'unknown', matchedAudienceTerms.length > 0 ? `هم‌پوشانی با Audience/Positioning: ${matchedAudienceTerms.join('، ')}` : 'تناسب روشن با Audience یا Positioning ثبت‌شده پیدا نشد.'),
    factor('timing', timingFavorable ? 'favorable' : source.freshness === 'aging' ? 'caution' : 'caution', `Freshness منبع: ${source.freshness} (${String(source.ageDays)} روز).`),
    factor('source_quality', qualityFavorable ? 'favorable' : source.quality === 'secondary' ? 'caution' : 'caution', `کیفیت منبع: ${source.quality}.`),
    factor('source_conflict', conflict ? 'caution' : 'favorable', conflict ? 'برای Statement مرتبط، تعارض یا Contradiction ثبت شده است.' : 'در Workspace فعلی تعارض ثبت‌شده‌ای برای این Statement وجود ندارد.'),
  ];

  if (source.freshness === 'stale' || source.quality === 'unverified') {
    return base(source, alignment, matchedGoalTerms, matchedAudienceTerms, factors, 'ignore', false,
      'Source برای تصمیم فرصت، کهنه یا تأییدنشده است؛ Popularity احتمالی جای Freshness و Quality را نمی‌گیرد.',
      'داده Audience response، timing window و context بیرونی مستقل در دسترس نیست.', 'ignore');
  }
  if (conflict || source.stance === 'contradicts') {
    return base(source, alignment, matchedGoalTerms, matchedAudienceTerms, factors, 'monitor', false,
      'وجود تعارض یا Stance مخالف مانع تبدیل این Source به Opportunity Candidate می‌شود؛ فعلاً فقط باید رصد و تحقیق شود.',
      'حل تعارض منابع و اثر آن بر Goal هنوز انجام نشده است.', 'research_more');
  }
  if (alignment === 'direct' && qualityFavorable && timingFavorable) {
    return base(source, alignment, matchedGoalTerms, matchedAudienceTerms, factors, 'consider', false,
      'Source تازه و معتبر با Goal و Audience/Positioning هم‌پوشانی مستقیم دارد؛ فقط برای Strategy Review قابل طرح است.',
      'تناسب انسانی، ظرفیت توجه، ریسک و واکنش Audience هنوز ارزیابی کامل نشده‌اند.', 'bring_to_strategy_review');
  }
  if ((alignment === 'adjacent' || alignment === 'none') && qualityFavorable && timingFavorable) {
    return base(source, alignment, matchedGoalTerms, matchedAudienceTerms, factors, 'monitor', true,
      'Source معتبر و تازه است اما تناسب مستقیم کافی ندارد.',
      'این مسیر Exploration است و هنوز ارتباط آن با Person/Brand/Goal اثبات نشده است.', 'watch');
  }
  return base(source, alignment, matchedGoalTerms, matchedAudienceTerms, factors, 'monitor', false,
    'برخی عوامل مثبت‌اند، اما Timing، Quality یا Alignment برای Strategy Review کافی نیست.',
    'اطلاعات Context، Audience response و attention cost کامل نیست.', 'watch');
}

function base(
  source: ResearchSourceSnapshot,
  alignment: OpportunityAlignment,
  matchedGoalTerms: readonly string[],
  matchedAudienceTerms: readonly string[],
  factors: readonly OpportunityFactor[],
  decision: BaseAssessment['decision'],
  explorationEligible: boolean,
  rationale: string,
  uncertainty: string,
  nextStep: OpportunityAssessment['nextStep'],
): BaseAssessment {
  return { source, alignment, matchedGoalTerms, matchedAudienceTerms, factors, decision, explorationEligible, rationale, uncertainty, nextStep };
}

function finalizeAssessment(
  base: BaseAssessment,
  decision: OpportunityDecision,
  exploration: boolean,
  nextStep: OpportunityAssessment['nextStep'],
  rationale: string,
): OpportunityAssessment {
  return {
    sourceId: base.source.sourceId,
    title: base.source.title,
    publisher: base.source.publisher,
    citation: base.source.citation,
    alignment: base.alignment,
    decision,
    exploration,
    matchedGoalTerms: base.matchedGoalTerms,
    matchedAudienceTerms: base.matchedAudienceTerms,
    factors: base.factors,
    rationale,
    uncertainty: base.uncertainty,
    nextStep,
    trace: {
      claimId: base.source.claimId,
      evidenceId: base.source.evidenceId,
      factCheckStatus: base.source.factCheckStatus,
    },
    boundaries: {
      trendIsOpportunity: false,
      actionRecommended: false,
      publicApprovalGranted: false,
      externalActionPermitted: false,
    },
  };
}

function factor(factorName: OpportunityFactor['factor'], status: OpportunityFactorStatus, rationale: string): OpportunityFactor {
  return { factor: factorName, status, rationale };
}

const stopTerms = new Set([
  'برای', 'اینکه', 'است', 'هست', 'شود', 'شده', 'کردن', 'درباره', 'یعنی', 'اما', 'اگر', 'یک', 'های',
  'that', 'this', 'with', 'from', 'have', 'about', 'were', 'been', 'into', 'your', 'their', 'will',
]);

function terms(value: string): readonly string[] {
  return value.toLocaleLowerCase('fa-IR').split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim()).filter((term) => term.length >= 4 && !stopTerms.has(term));
}

function distinct(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}
