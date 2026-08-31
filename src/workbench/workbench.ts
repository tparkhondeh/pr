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
  evidenceCount: number;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  attentionCostMinutes: number;
  energyCost: StrategicOption['energyCost'];
  feasible: boolean;
  utilityScore: number | null;
  opportunityCost: number | null;
  rank: number;
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
  actions: readonly WorkbenchAction[];
  workflow: Readonly<{
    id: string;
    status: WorkflowState['status'];
    revision: number;
    approvedActionId?: string;
    approvedAt?: string;
  }>;
}>;

export type WorkbenchSeed = Readonly<{
  goal: Goal;
  options: readonly StrategicOption[];
  attentionBudget: AttentionBudget;
  rankingPolicy: RankingPolicy;
  profile: WorkbenchSnapshot['profile'];
}>;

export class WorkbenchActionNotFoundError extends Error {
  public constructor(public readonly actionId: string) {
    super(`Workbench action not found: ${actionId}`);
  }
}

export class WorkbenchApprovalConflictError extends Error {
  public constructor(public readonly reason: 'action_not_feasible' | 'different_action_approved') {
    super(`Workbench approval conflict: ${reason}`);
  }
}

export class WorkbenchService {
  readonly #rankedOptions: readonly RankedOption[];
  readonly #attentionBudget: AttentionBudget;
  readonly #profile: WorkbenchSnapshot['profile'];
  readonly #clock: () => Date;
  readonly #awaitingWorkflow: WorkflowState;
  readonly #approvalRepository: WorkbenchApprovalRepository;
  readonly #strategyContext: Pick<StrategyContextService, 'snapshot'>;
  readonly #ownerUserId: UserId;

  public constructor(
    seed: WorkbenchSeed,
    clock: () => Date = () => new Date(),
    approvalRepository: WorkbenchApprovalRepository = new InMemoryWorkbenchApprovalRepository(),
    strategyContext?: Pick<StrategyContextService, 'snapshot'>,
  ) {
    validateGoal(seed.goal);
    this.#rankedOptions = rankStrategicOptions(
      seed.goal.tenantId,
      seed.options,
      seed.attentionBudget,
      seed.rankingPolicy,
    );
    this.#attentionBudget = seed.attentionBudget;
    this.#profile = seed.profile;
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
    this.#awaitingWorkflow = evolveWorkflow(createWorkflow('workbench_today'), {
      id: 'workbench_today:approval_requested',
      type: 'approval_requested',
    });
  }

  public async snapshot(): Promise<WorkbenchSnapshot> {
    const strategy = await this.#strategyContext.snapshot(this.#ownerUserId);
    const approval = await this.#approvalRepository.find(strategy.revision);
    return {
      generatedAt: this.#clock().toISOString(),
      runtime: { source: 'node_api', persistence: this.#approvalRepository.persistence },
      profile: this.#profile,
      goal: {
        id: strategy.goalId,
        revision: strategy.revision,
        title: strategy.goal.title,
        outcome: strategy.goal.outcome,
        successMetrics: strategy.goal.successMetrics,
      },
      attentionBudget: this.#attentionBudget,
      actions: this.#rankedOptions.map((option) => toWorkbenchAction(option, strategy)),
      workflow: {
        id: this.#awaitingWorkflow.id,
        status: approval ? 'approved' : this.#awaitingWorkflow.status,
        revision: approval?.revision ?? this.#awaitingWorkflow.revision,
        ...(approval ? { approvedActionId: approval.actionId } : {}),
        ...(approval ? { approvedAt: approval.approvedAt.toISOString() } : {}),
      },
    };
  }

  public async approve(
    actionId: string,
    actorId: UserId,
    occurredAt: Date,
  ): Promise<WorkbenchSnapshot> {
    const strategy = await this.#strategyContext.snapshot(this.#ownerUserId);
    const option = this.#rankedOptions.find((candidate) => candidate.id === actionId);
    if (!option) throw new WorkbenchActionNotFoundError(actionId);
    if (!option.feasible) throw new WorkbenchApprovalConflictError('action_not_feasible');

    evolveWorkflow(this.#awaitingWorkflow, {
      id: `workbench_today:approved:${actionId}`,
      type: 'approved',
      actorId,
      occurredAt,
    });
    const result = await this.#approvalRepository.approve({
      actionId,
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
      profile: { maturityPercent: 32, evidenceCount: 4, openContradictions: 1 },
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
  );
}

function toWorkbenchAction(
  option: RankedOption,
  strategy: StrategyContextSnapshot,
): WorkbenchAction {
  return {
    id: option.id,
    kind: option.kind,
    title: option.title,
    rationale: contextualRationale(option, strategy),
    benefits: option.benefits,
    risks: option.risks,
    prerequisites: option.prerequisites,
    evidenceCount: option.evidenceIds.length,
    confidence: option.confidence,
    riskLevel: option.riskScore < 30 ? 'low' : option.riskScore < 60 ? 'medium' : 'high',
    attentionCostMinutes: option.attentionCostMinutes,
    energyCost: option.energyCost,
    feasible: option.feasible,
    utilityScore: option.feasible ? round(option.utilityScore) : null,
    opportunityCost: option.feasible ? round(option.opportunityCost) : null,
    rank: option.rank,
  };
}

function contextualRationale(
  option: RankedOption,
  strategy: StrategyContextSnapshot,
): string {
  if (option.kind === 'private_conversation') {
    return `برای هدف «${strategy.goal.title}»، یک تعامل عمیق با ${strategy.desiredPositioning.audience} از چند انتشار عمومی ارزشمندتر است.`;
  }
  if (option.kind === 'content') {
    return `این اقدام باید ادراک «${strategy.desiredPositioning.desiredPerception}» را با تجربه و ادعاهای قابل‌ردیابی پشتیبانی کند.`;
  }
  return `عدم اقدام نیز نسبت به هدف «${strategy.goal.title}» یک گزینه آگاهانه است؛ کیفیت برند نباید قربانی پرکردن تقویم شود.`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
