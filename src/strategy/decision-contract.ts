import type { StrategyContextSnapshot } from './context.js';
import type {
  AttentionBudget,
  FeasibilityReason,
  StrategicOption,
} from './strategy.js';

export type StrategicDecisionPolicyVersion = 'strategic-decision-v1';

export type DecisionFormat =
  | 'none'
  | 'private_conversation'
  | 'relationship_action'
  | 'mother_concept'
  | 'media_response'
  | 'event_participation'
  | 'research_brief';

export type DecisionPosture = 'now' | 'when_ready' | 'delay';

export type StrategicDecisionFrame = Readonly<{
  policyVersion: StrategicDecisionPolicyVersion;
  why: Readonly<{
    goalId: string;
    objective: string;
  }>;
  forWhom: string;
  currentContext: Readonly<{
    availableMinutes: number;
    maximumEnergyCost: 1 | 2 | 3 | 4 | 5;
    visibilityTolerance: 1 | 2 | 3 | 4 | 5;
    emotionalBandwidth: 1 | 2 | 3 | 4 | 5;
  }>;
  decisionWindow: Readonly<{
    generatedAt: string;
    expiresAt: string;
    durationHours: 24;
  }>;
  rankingTransparency: Readonly<{
    method: 'declared_weighted_policy';
    dimensions: readonly ['benefit', 'strategic_fit', 'risk', 'reversibility', 'confidence', 'attention'];
    utilityScoreVisible: true;
    opportunityCostVisible: true;
    hiddenScoreUsed: false;
  }>;
  boundaries: Readonly<{
    platformConstrained: false;
    publicApprovalGranted: false;
    externalActionPermitted: false;
  }>;
}>;

export type ActionDecisionContract = Readonly<{
  policyVersion: StrategicDecisionPolicyVersion;
  objective: string;
  stakeholder: string;
  posture: DecisionPosture;
  timingRationale: string;
  decisionWindowEndsAt: string;
  format: DecisionFormat;
  platformSelected: false;
  assumptions: readonly string[];
  uncertainty: readonly string[];
  feasibilityReasons: readonly FeasibilityReason[];
  requiredApproval: 'human';
  measurementPlan: Readonly<{
    signals: readonly string[];
    reviewAfter: string;
  }>;
  boundaries: Readonly<{
    recommendationIsExecution: false;
    publicApprovalGranted: false;
    externalActionPermitted: false;
  }>;
}>;

export function createStrategicDecisionFrame(
  strategy: StrategyContextSnapshot,
  budget: AttentionBudget,
  generatedAt: Date,
): StrategicDecisionFrame {
  const expiresAt = decisionWindowEnd(generatedAt);
  return {
    policyVersion: 'strategic-decision-v1',
    why: { goalId: strategy.goalId, objective: strategy.goal.outcome },
    forWhom: strategy.desiredPositioning.audience,
    currentContext: { ...budget },
    decisionWindow: {
      generatedAt: generatedAt.toISOString(),
      expiresAt,
      durationHours: 24,
    },
    rankingTransparency: {
      method: 'declared_weighted_policy',
      dimensions: ['benefit', 'strategic_fit', 'risk', 'reversibility', 'confidence', 'attention'],
      utilityScoreVisible: true,
      opportunityCostVisible: true,
      hiddenScoreUsed: false,
    },
    boundaries: {
      platformConstrained: false,
      publicApprovalGranted: false,
      externalActionPermitted: false,
    },
  };
}

export function createActionDecisionContract(input: Readonly<{
  kind: StrategicOption['kind'];
  strategy: StrategyContextSnapshot;
  generatedAt: Date;
  feasible: boolean;
  feasibilityReasons: readonly FeasibilityReason[];
  evidenceCount: number;
  coldStart?: boolean;
}>): ActionDecisionContract {
  const expiresAt = decisionWindowEnd(input.generatedAt);
  const posture = decisionPosture(input.kind, input.feasible, input.coldStart === true);
  return {
    policyVersion: 'strategic-decision-v1',
    objective: input.strategy.goal.outcome,
    stakeholder: input.strategy.desiredPositioning.audience,
    posture,
    timingRationale: timingRationale(posture, input.kind, input.coldStart === true),
    decisionWindowEndsAt: expiresAt,
    format: decisionFormat(input.kind),
    platformSelected: false,
    assumptions: assumptions(input.evidenceCount, input.coldStart === true),
    uncertainty: uncertainty(input.kind, input.coldStart === true),
    feasibilityReasons: input.feasibilityReasons,
    requiredApproval: 'human',
    measurementPlan: {
      signals: measurementSignals(input.kind, input.strategy.goal.successMetrics),
      reviewAfter: expiresAt,
    },
    boundaries: {
      recommendationIsExecution: false,
      publicApprovalGranted: false,
      externalActionPermitted: false,
    },
  };
}

function decisionWindowEnd(generatedAt: Date): string {
  return new Date(generatedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function decisionPosture(
  kind: StrategicOption['kind'],
  feasible: boolean,
  coldStart: boolean,
): DecisionPosture {
  if (kind === 'no_action') return 'delay';
  if (!feasible || coldStart) return 'when_ready';
  return 'now';
}

function timingRationale(
  posture: DecisionPosture,
  kind: StrategicOption['kind'],
  coldStart: boolean,
): string {
  if (coldStart) return 'این مسیر فقط پس از ورود Evidence مجاز دوباره سنجیده می‌شود.';
  if (kind === 'no_action') return 'عدم اقدام تا Snapshot بعدی یک انتخاب آگاهانه و قابل بازگشت است.';
  if (posture === 'when_ready') return 'حداقل یکی از محدودیت‌های Attention Budget فعلی رعایت نشده است.';
  return 'Action در بودجه فعلی جا می‌گیرد، اما اجرا همچنان به تصمیم انسانی نیاز دارد.';
}

function decisionFormat(kind: StrategicOption['kind']): DecisionFormat {
  const formats: Readonly<Record<StrategicOption['kind'], DecisionFormat>> = {
    no_action: 'none',
    private_conversation: 'private_conversation',
    relationship: 'relationship_action',
    content: 'mother_concept',
    media: 'media_response',
    event: 'event_participation',
    research: 'research_brief',
  };
  return formats[kind];
}

function assumptions(evidenceCount: number, coldStart: boolean): readonly string[] {
  if (coldStart) {
    return [
      'Evidence مجاز کافی برای توصیه بیرونی هنوز وجود ندارد.',
      'عدم اقدام از ساختن قطعیت یا تجربه جعلی معتبرتر است.',
    ];
  }
  return [
    `${String(evidenceCount)} Evidence مجاز، Context فعلی این پیشنهاد را پشتیبانی می‌کند.`,
    'Attention Budget فعلی خوداظهاری و فقط برای این پنجره تصمیم معتبر است.',
  ];
}

function uncertainty(kind: StrategicOption['kind'], coldStart: boolean): readonly string[] {
  if (coldStart) return ['تناسب Action با هویت، مخاطب و زمان بدون Evidence کافی معلوم نیست.'];
  const shared = 'واکنش واقعی Stakeholder و نتیجه بیرونی هنوز مشاهده نشده است.';
  if (kind === 'content') {
    return [shared, 'Platform، Claim، Voice و Risk Gate پس از انتخاب Mother Concept جداگانه بررسی می‌شوند.'];
  }
  if (kind === 'no_action') return ['ممکن است یک پنجره زمانی کوتاه پیش از Snapshot بعدی بسته شود.'];
  return [shared, 'زمان‌بندی انسانی و آمادگی طرف مقابل باید پیش از اجرا دوباره بررسی شود.'];
}

function measurementSignals(
  kind: StrategicOption['kind'],
  goalMetrics: readonly string[],
): readonly string[] {
  const actionSignals: Readonly<Record<StrategicOption['kind'], readonly string[]>> = {
    no_action: ['رضایت کاربر از سکوت', 'پشیمانی کاربر', 'انرژی حفظ‌شده'],
    private_conversation: ['عمق تعامل', 'تغییر رابطه', 'فرصت ایجادشده'],
    relationship: ['تغییر رابطه', 'کیفیت تعامل', 'رضایت کاربر'],
    content: ['کیفیت تعامل', 'تغییر ادراک', 'پیام خصوصی', 'پشیمانی کاربر'],
    media: ['کیفیت پوشش', 'تغییر ادراک', 'فرصت رسانه‌ای'],
    event: ['کیفیت ارتباط', 'رابطه ایجادشده', 'فرصت بعدی'],
    research: ['کیفیت Source', 'رفع عدم‌قطعیت', 'تصمیم قابل‌ردیابی'],
  };
  return [...new Set([...goalMetrics, ...actionSignals[kind]])].slice(0, 8);
}
