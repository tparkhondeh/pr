import { tenantId, userId, type UserId } from '../kernel/identity.js';
import { evidenceId } from '../memory/personal-memory.js';
import {
  InMemoryStrategyContextRepository,
  StrategyContextService,
  defaultStrategyContext,
  type StrategyContextSnapshot,
} from '../strategy/context.js';
import {
  rankStrategicOptions,
  validateGoal,
  type AttentionBudget,
  type Goal,
  type RankedOption,
  type RankingPolicy,
  type StrategicOption,
} from '../strategy/strategy.js';
import {
  createWorkflow,
  evolveWorkflow,
  type WorkflowState,
} from '../workflow/workflow.js';
import {
  InMemoryWorkbenchApprovalRepository,
  type WorkbenchApprovalRepository,
} from './approval-repository.js';
import type {
  OwnerEvidenceContextProvider,
  OwnerEvidenceContextSnapshot,
} from './evidence-context.js';

export type WorkbenchRuntime = Readonly<{
  source: 'node_api' | 'preview_worker';
  persistence: 'memory' | 'postgres' | 'ephemeral';
}>;

export type WorkbenchAction = Readonly<{
  id: string;
  kind: StrategicOption['kind'];
  title: string;
  rationale: string;
  benefits: readonly string[];
  risks: readonly string[];
  prerequisites: readonly string[];
  evidenceIds: readonly string[];
  evidenceCount: number;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  attentionCostMinutes: number;
  energyCost: StrategicOption['energyCost'];
  feasible: boolean;
  utilityScore: number | null;
  opportunityCost: number | null;
  rank: number;
  evidenceState: 'insufficient' | 'grounded';
  evidenceSourceTypes: readonly string[];
  interaction: 'approve' | 'open_intake' | 'open_conversation';
}>;

export type WorkbenchSnapshot = Readonly<{
  generatedAt: string;
  runtime: WorkbenchRuntime;
  profile: Readonly<{
    maturityPercent: number;
    evidenceCount: number;
    openContradictions: number;
  }>;
  goal: Readonly<{
    id: string;
    revision: number;
    title: string;
    outcome: string;
    successMetrics: readonly string[];
  }>;
  attentionBudget: AttentionBudget;
  evidence: Readonly<{
    state: 'insufficient' | 'grounded';
    strategyEvidenceCount: number;
    withheldEvidenceCount: number;
    sourceTypes: readonly string[];
  }>;
  actions: readonly WorkbenchAction[];
  workflow: Readonly<{
    id: string;
    status: WorkflowState['status'];
    revision: number;
    approvedActionId?: string;
    approvedEvidenceIds?: readonly string[];
    approvedAt?: string;
  }>;
}>;

export type WorkbenchSeed = Readonly<{
  goal: Goal;
  options: readonly StrategicOption[];
  attentionBudget: AttentionBudget;
  rankingPolicy: RankingPolicy;
}>;

export class WorkbenchActionNotFoundError extends Error {
  public constructor(public readonly actionId: string) {
    super(`Workbench action not found: ${actionId}`);
  }
}

export class WorkbenchApprovalConflictError extends Error {
  public constructor(
    public readonly reason:
      | 'action_not_feasible'
      | 'action_not_approvable'
      | 'different_action_approved'
      | 'insufficient_evidence',
  ) {
    super(`Workbench approval conflict: ${reason}`);
  }
}

export class WorkbenchService {
  readonly #rankedOptions: readonly RankedOption[];
  readonly #attentionBudget: AttentionBudget;
  readonly #clock: () => Date;
  readonly #awaitingWorkflow: WorkflowState;
  readonly #approvalRepository: WorkbenchApprovalRepository;
  readonly #strategyContext: Pick<StrategyContextService, 'snapshot'>;
  readonly #ownerUserId: UserId;
  readonly #evidenceContext: OwnerEvidenceContextProvider;

  public constructor(
    seed: WorkbenchSeed,
    clock: () => Date = () => new Date(),
    approvalRepository: WorkbenchApprovalRepository = new InMemoryWorkbenchApprovalRepository(),
    strategyContext?: Pick<StrategyContextService, 'snapshot'>,
    evidenceContext: OwnerEvidenceContextProvider = emptyEvidenceContextProvider(),
  ) {
    validateGoal(seed.goal);
    this.#rankedOptions = rankStrategicOptions(
      seed.goal.tenantId,
      seed.options,
      seed.attentionBudget,
      seed.rankingPolicy,
    );
    this.#attentionBudget = seed.attentionBudget;
    this.#clock = clock;
    this.#approvalRepository = approvalRepository;
    this.#ownerUserId = seed.goal.ownerUserId;
    this.#strategyContext = strategyContext ?? new StrategyContextService(
      new InMemoryStrategyContextRepository(
        defaultStrategyContext(seed.goal.tenantId, seed.goal.ownerUserId, clock()),
        approvalRepository,
      ),
      { tenantId: seed.goal.tenantId, ownerUserId: seed.goal.ownerUserId },
    );
    this.#evidenceContext = evidenceContext;
    this.#awaitingWorkflow = evolveWorkflow(createWorkflow('workbench_today'), {
      id: 'workbench_today:approval_requested',
      type: 'approval_requested',
    });
  }

  public async snapshot(): Promise<WorkbenchSnapshot> {
    const [strategy, evidence] = await Promise.all([
      this.#strategyContext.snapshot(this.#ownerUserId),
      this.#evidenceContext.snapshot(),
    ]);
    const approval = await this.#approvalRepository.find(strategy.revision);
    const grounded = evidence.strategy.evidenceIds.length > 0;
    const effectiveApproval = grounded || approval?.actionId === 'wait' ? approval : null;
    return {
      generatedAt: this.#clock().toISOString(),
      runtime: { source: 'node_api', persistence: this.#approvalRepository.persistence },
      profile: {
        maturityPercent: evidence.maturity.percent,
        evidenceCount: evidence.maturity.evidenceCount,
        openContradictions: evidence.openContradictions,
      },
      goal: {
        id: strategy.goalId,
        revision: strategy.revision,
        title: strategy.goal.title,
        outcome: strategy.goal.outcome,
        successMetrics: strategy.goal.successMetrics,
      },
      attentionBudget: this.#attentionBudget,
      evidence: {
        state: grounded ? 'grounded' : 'insufficient',
        strategyEvidenceCount: evidence.strategy.evidenceIds.length,
        withheldEvidenceCount: evidence.strategy.withheldEvidenceCount,
        sourceTypes: evidence.strategy.sourceTypes,
      },
      actions: grounded
        ? this.#rankedOptions.map((option) => toWorkbenchAction(option, strategy, evidence))
        : coldStartActions(strategy, evidence),
      workflow: {
        id: this.#awaitingWorkflow.id,
        status: effectiveApproval ? 'approved' : this.#awaitingWorkflow.status,
        revision: effectiveApproval?.revision ?? this.#awaitingWorkflow.revision,
        ...(effectiveApproval ? { approvedActionId: effectiveApproval.actionId } : {}),
        ...(effectiveApproval ? { approvedEvidenceIds: effectiveApproval.evidenceIds } : {}),
        ...(effectiveApproval ? { approvedAt: effectiveApproval.approvedAt.toISOString() } : {}),
      },
    };
  }

  public async approve(
    actionId: string,
    actorId: UserId,
    occurredAt: Date,
  ): Promise<WorkbenchSnapshot> {
    const [strategy, evidence] = await Promise.all([
      this.#strategyContext.snapshot(this.#ownerUserId),
      this.#evidenceContext.snapshot(),
    ]);
    if (evidence.strategy.evidenceIds.length === 0) {
      const coldAction = coldStartActions(strategy, evidence).find(
        (candidate) => candidate.id === actionId,
      );
      if (!coldAction) throw new WorkbenchActionNotFoundError(actionId);
      if (coldAction.interaction !== 'approve') {
        throw new WorkbenchApprovalConflictError('action_not_approvable');
      }
      if (actionId !== 'wait') {
        throw new WorkbenchApprovalConflictError('insufficient_evidence');
      }
    }
    const option = this.#rankedOptions.find((candidate) => candidate.id === actionId);
    if (!option) throw new WorkbenchActionNotFoundError(actionId);
    if (!option.feasible) throw new WorkbenchApprovalConflictError('action_not_feasible');
    const approvedEvidenceIds = evidence.strategy.evidenceIds.length > 0
      ? toWorkbenchAction(option, strategy, evidence).evidenceIds
      : [];

    evolveWorkflow(this.#awaitingWorkflow, {
      id: `workbench_today:approved:${actionId}`,
      type: 'approved',
      actorId,
      occurredAt,
    });
    const result = await this.#approvalRepository.approve({
      actionId,
      evidenceIds: approvedEvidenceIds,
      actorUserId: actorId,
      occurredAt,
      expectedRevision: this.#awaitingWorkflow.revision,
      strategyRevision: strategy.revision,
    });
    if (result.outcome === 'conflict') {
      throw new WorkbenchApprovalConflictError('different_action_approved');
    }
    return this.snapshot();
  }
}

export function createDefaultWorkbenchService(
  clock: () => Date = () => new Date(),
  approvalRepository?: WorkbenchApprovalRepository,
  identity: Readonly<{ tenantId: string; ownerUserId: string }> = {
    tenantId: 'tenant_primary',
    ownerUserId: 'owner_primary',
  },
  strategyContext?: Pick<StrategyContextService, 'snapshot'>,
  evidenceContext?: OwnerEvidenceContextProvider,
): WorkbenchService {
  const tenant = tenantId(identity.tenantId);
  const owner = userId(identity.ownerUserId);
  const valuesEvidence = evidenceId('evidence_values_integrity');
  const relationshipEvidence = evidenceId('evidence_relationship_depth');
  const experienceEvidence = evidenceId('evidence_ambiguity_experience');
  const energyEvidence = evidenceId('evidence_energy_today');

  return new WorkbenchService(
    {
      goal: {
        id: 'goal_trusted_advisor',
        tenantId: tenant,
        ownerUserId: owner,
        title: 'تقویت جایگاه «مشاور قابل‌اعتماد»',
        outcome: 'ایجاد تعامل‌های عمیق و قابل‌ردیابی با ذی‌نفعان اصلی',
        priority: 5,
        successMetrics: ['کیفیت تعامل', 'فرصت‌های ایجادشده', 'تغییر ادراک'],
      },
      attentionBudget: { availableMinutes: 150, maximumEnergyCost: 3 },
      rankingPolicy: {
        benefitWeight: 0.25,
        strategicFitWeight: 0.3,
        riskWeight: 0.2,
        reversibilityWeight: 0.1,
        confidenceWeight: 0.15,
        attentionPenaltyPerHour: 2,
      },
      options: [
        {
          id: 'conversation',
          tenantId: tenant,
          kind: 'private_conversation',
          title: 'گفت‌وگوی خصوصی با یک همکار قدیمی',
          rationale: 'برای هدف اعتمادسازی، یک تعامل عمیق از چند انتشار عمومی ارزشمندتر است.',
          evidenceIds: [relationshipEvidence, valuesEvidence],
          benefits: ['تقویت رابطه با یک ذی‌نفع کلیدی'],
          risks: ['زمان‌بندی نامناسب گفت‌وگو'],
          prerequisites: ['مرور آخرین تعامل ثبت‌شده'],
          benefitScore: 88,
          strategicFitScore: 95,
          riskScore: 15,
          reversibilityScore: 85,
          confidence: 0.84,
          attentionCostMinutes: 30,
          energyCost: 2,
        },
        {
          id: 'essay',
          tenantId: tenant,
          kind: 'content',
          title: 'یادداشت تحلیلی درباره تصمیم‌گیری در ابهام',
          rationale: 'یک تجربه ثبت‌شده، پایه روایتی اصیل و قابل‌ردیابی را فراهم می‌کند.',
          evidenceIds: [experienceEvidence, valuesEvidence],
          benefits: ['نمایش عمق فکری با تکیه بر تجربه واقعی'],
          risks: ['برداشت اغراق‌آمیز از تجربه'],
          prerequisites: ['بررسی ادعاها پیش از Draft'],
          benefitScore: 90,
          strategicFitScore: 88,
          riskScore: 42,
          reversibilityScore: 60,
          confidence: 0.78,
          attentionCostMinutes: 120,
          energyCost: 3,
        },
        {
          id: 'wait',
          tenantId: tenant,
          kind: 'no_action',
          title: 'فعلاً اقدام نکن',
          rationale: 'اگر انرژی امروز پایین است، حفظ کیفیت برند از پرکردن تقویم مهم‌تر است.',
          evidenceIds: [energyEvidence],
          benefits: ['حفظ کیفیت و بودجه توجه'],
          risks: ['از دست‌رفتن یک پنجره زمانی کوتاه'],
          prerequisites: ['بازبینی دوباره در چرخه بعد'],
          benefitScore: 55,
          strategicFitScore: 70,
          riskScore: 5,
          reversibilityScore: 95,
          confidence: 0.71,
          attentionCostMinutes: 0,
          energyCost: 1,
        },
      ],
    },
    clock,
    approvalRepository,
    strategyContext,
    evidenceContext,
  );
}

function toWorkbenchAction(
  option: RankedOption,
  strategy: StrategyContextSnapshot,
  evidence: OwnerEvidenceContextSnapshot,
): WorkbenchAction {
  const usableEvidenceIds = option.kind === 'content'
    ? evidence.strategy.evidenceIds
    : evidence.strategy.evidenceIds.slice(0, option.kind === 'no_action' ? 1 : 2);
  const groundedConfidence = Math.min(
    option.confidence,
    0.5 + Math.min(0.3, usableEvidenceIds.length * 0.1),
  );
  return {
    id: option.id,
    kind: option.kind,
    title: option.title,
    rationale: contextualRationale(option, strategy, usableEvidenceIds.length),
    benefits: option.benefits,
    risks: option.risks,
    prerequisites: option.prerequisites,
    evidenceIds: usableEvidenceIds,
    evidenceCount: usableEvidenceIds.length,
    confidence: groundedConfidence,
    riskLevel: option.riskScore < 30 ? 'low' : option.riskScore < 60 ? 'medium' : 'high',
    attentionCostMinutes: option.attentionCostMinutes,
    energyCost: option.energyCost,
    feasible: option.feasible,
    utilityScore: option.feasible ? round(option.utilityScore) : null,
    opportunityCost: option.feasible ? round(option.opportunityCost) : null,
    rank: option.rank,
    evidenceState: 'grounded',
    evidenceSourceTypes: evidence.strategy.sourceTypes,
    interaction: 'approve',
  };
}

function contextualRationale(
  option: RankedOption,
  strategy: StrategyContextSnapshot,
  evidenceCount: number,
): string {
  if (option.kind === 'private_conversation') {
    return `با اتکا به ${String(evidenceCount)} شاهد مجاز برای تحلیل برند و برای هدف «${strategy.goal.title}»، یک تعامل عمیق با ${strategy.desiredPositioning.audience} از چند انتشار عمومی ارزشمندتر است.`;
  }
  if (option.kind === 'content') {
    return `${String(evidenceCount)} شاهد مجاز در دسترس است؛ این اقدام باید ادراک «${strategy.desiredPositioning.desiredPerception}» را فقط با ادعاهای قابل‌ردیابی پشتیبانی کند.`;
  }
  return `با وجود ${String(evidenceCount)} شاهد مجاز، عدم اقدام نیز نسبت به هدف «${strategy.goal.title}» یک گزینه آگاهانه است؛ کیفیت برند نباید قربانی پرکردن تقویم شود.`;
}

function coldStartActions(
  strategy: StrategyContextSnapshot,
  evidence: OwnerEvidenceContextSnapshot,
): readonly WorkbenchAction[] {
  const withheld = evidence.strategy.withheldEvidenceCount;
  return [
    {
      id: 'collect_evidence',
      kind: 'research',
      title: 'یک منبع واقعی برای تحلیل برند وارد کن',
      rationale: withheld > 0
        ? `${String(withheld)} شاهد فقط برای فهم شخصی ثبت شده، اما برای تحلیل برند مجوز ندارد. یک منبع مرتبط را با دامنه استفاده روشن آماده کنید.`
        : 'هنوز هیچ شاهد مالک‌محور و مجازی برای تحلیل برند وجود ندارد؛ قبل از پیشنهاد حرکت بیرونی، یک منبع واقعی ثبت کنید.',
      benefits: ['ساخت پایه قابل‌ردیابی برای تصمیم بعدی'],
      risks: ['ورود متن نامرتبط یا بیش‌ازحد حساس'],
      prerequisites: ['انتخاب یک متن واقعی', 'تعیین صریح مجوز تحلیل برند'],
      evidenceIds: [],
      evidenceCount: 0,
      confidence: 1,
      riskLevel: 'low',
      attentionCostMinutes: 10,
      energyCost: 1,
      feasible: true,
      utilityScore: null,
      opportunityCost: null,
      rank: 1,
      evidenceState: 'insufficient',
      evidenceSourceTypes: [],
      interaction: 'open_intake',
    },
    {
      id: 'reflect_first',
      kind: 'private_conversation',
      title: 'یک تجربه واقعی را در گفت‌وگو ثبت کن',
      rationale: 'اگر منبع آماده‌ای ندارید، یک تجربه مشخص را تعریف کنید؛ سیستم فقط با تأیید جداگانه آن را به حافظه تبدیل می‌کند.',
      benefits: ['شروع کم‌اصطکاک مدل شخصی'],
      risks: ['یک Self-report منفرد هنوز شاهد مستقل نیست'],
      prerequisites: ['تعریف یک موقعیت مشخص', 'تأیید جداگانه حافظه'],
      evidenceIds: [],
      evidenceCount: 0,
      confidence: 1,
      riskLevel: 'low',
      attentionCostMinutes: 8,
      energyCost: 1,
      feasible: true,
      utilityScore: null,
      opportunityCost: null,
      rank: 2,
      evidenceState: 'insufficient',
      evidenceSourceTypes: [],
      interaction: 'open_conversation',
    },
    {
      id: 'wait',
      kind: 'no_action',
      title: 'تا رسیدن شاهد، اقدام عمومی نکن',
      rationale: `برای هدف «${strategy.goal.title}» هنوز Evidence مجاز کافی وجود ندارد؛ Abstain کردن از توصیه عمومی از ساختن قطعیت کاذب معتبرتر است.`,
      benefits: ['پرهیز از توصیه و ادعای بدون پشتوانه'],
      risks: ['عقب‌افتادن یک پنجره زمانی کوتاه'],
      prerequisites: ['بازبینی پس از ورود اولین منبع مجاز'],
      evidenceIds: [],
      evidenceCount: 0,
      confidence: 1,
      riskLevel: 'low',
      attentionCostMinutes: 0,
      energyCost: 1,
      feasible: true,
      utilityScore: null,
      opportunityCost: null,
      rank: 3,
      evidenceState: 'insufficient',
      evidenceSourceTypes: [],
      interaction: 'approve',
    },
  ];
}

function emptyEvidenceContextProvider(): OwnerEvidenceContextProvider {
  return {
    snapshot: () => Promise.resolve({
      generatedAt: new Date(0),
      persistence: 'memory',
      maturity: {
        percent: 0,
        evidenceCount: 0,
        sourceTypes: [],
        components: {
          importedEvidence: 0,
          confirmedSelfReports: 0,
          sourceDiversity: 0,
          exercisedDataControl: 0,
        },
        nextStep: 'یک یادداشت یا متن واقعی وارد کنید.',
      },
      strategy: { evidenceIds: [], assertionIds: [], sourceTypes: [], withheldEvidenceCount: 0 },
      openContradictions: 0,
    }),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
