import type { TenantId, UserId } from '../kernel/identity.js';
import type { EvidenceId } from '../memory/personal-memory.js';

export type Goal = Readonly<{
  id: string;
  tenantId: TenantId;
  ownerUserId: UserId;
  title: string;
  outcome: string;
  priority: 1 | 2 | 3 | 4 | 5;
  horizonStart?: Date;
  horizonEnd?: Date;
  successMetrics: readonly string[];
}>;

export type PositioningLayer =
  | 'evidence_backed_self'
  | 'current_perception'
  | 'desired_positioning';

export type PositioningSnapshot = Readonly<{
  tenantId: TenantId;
  subjectUserId: UserId;
  layer: PositioningLayer;
  horizon?: string;
  dimensions: Readonly<Record<string, unknown>>;
  evidenceIds: readonly EvidenceId[];
  confidence?: number;
  validFrom: Date;
}>;

export type ActionKind =
  | 'no_action'
  | 'private_conversation'
  | 'relationship'
  | 'content'
  | 'media'
  | 'event'
  | 'research';

export type StrategicOption = Readonly<{
  id: string;
  tenantId: TenantId;
  kind: ActionKind;
  title: string;
  rationale: string;
  evidenceIds: readonly EvidenceId[];
  benefits: readonly string[];
  risks: readonly string[];
  prerequisites: readonly string[];
  benefitScore: number;
  strategicFitScore: number;
  riskScore: number;
  reversibilityScore: number;
  confidence: number;
  attentionCostMinutes: number;
  energyCost: 1 | 2 | 3 | 4 | 5;
  visibilityCost: 1 | 2 | 3 | 4 | 5;
  emotionalCost: 1 | 2 | 3 | 4 | 5;
}>;

export type RankingPolicy = Readonly<{
  benefitWeight: number;
  strategicFitWeight: number;
  riskWeight: number;
  reversibilityWeight: number;
  confidenceWeight: number;
  attentionPenaltyPerHour: number;
}>;

export type AttentionBudget = Readonly<{
  availableMinutes: number;
  maximumEnergyCost: 1 | 2 | 3 | 4 | 5;
  visibilityTolerance: 1 | 2 | 3 | 4 | 5;
  emotionalBandwidth: 1 | 2 | 3 | 4 | 5;
}>;

export type FeasibilityReason =
  | 'within_budget'
  | 'attention_time_exceeded'
  | 'energy_exceeded'
  | 'visibility_tolerance_exceeded'
  | 'emotional_bandwidth_exceeded';

export type RankedOption = StrategicOption &
  Readonly<{
    feasible: boolean;
    feasibilityReasons: readonly FeasibilityReason[];
    utilityScore: number;
    opportunityCost: number;
    rank: number;
  }>;

export function validateGoal(goal: Goal): Goal {
  if (goal.title.trim().length < 3) throw new Error('Goal title is too short.');
  if (goal.outcome.trim().length < 3) throw new Error('Goal outcome is too short.');
  if (goal.successMetrics.length === 0) {
    throw new Error('Goal requires at least one success metric.');
  }
  if (goal.horizonStart && goal.horizonEnd && goal.horizonEnd < goal.horizonStart) {
    throw new Error('Goal horizon is invalid.');
  }
  return goal;
}

export function validatePositioning(snapshot: PositioningSnapshot): PositioningSnapshot {
  if (Object.keys(snapshot.dimensions).length === 0) {
    throw new Error('Positioning requires at least one dimension.');
  }
  if (snapshot.layer === 'desired_positioning' && !snapshot.horizon) {
    throw new Error('Desired positioning requires a horizon.');
  }
  if (
    snapshot.layer !== 'desired_positioning' &&
    snapshot.evidenceIds.length === 0
  ) {
    throw new Error('Observed positioning requires evidence.');
  }
  validateUnitScore(snapshot.confidence, 'Positioning confidence');
  return snapshot;
}

export function rankStrategicOptions(
  tenantId: TenantId,
  options: readonly StrategicOption[],
  budget: AttentionBudget,
  policy: RankingPolicy,
): readonly RankedOption[] {
  if (options.length < 3) throw new Error('At least three strategic options are required.');
  if (!options.some((option) => option.kind === 'no_action')) {
    throw new Error('A deliberate no-action option is required.');
  }
  validateRankingPolicy(policy);
  validateBudget(budget);

  const evaluated = options.map((option) => {
    validateOption(tenantId, option);
    const feasibilityReasons: FeasibilityReason[] = [];
    if (option.attentionCostMinutes > budget.availableMinutes) feasibilityReasons.push('attention_time_exceeded');
    if (option.energyCost > budget.maximumEnergyCost) feasibilityReasons.push('energy_exceeded');
    if (option.visibilityCost > budget.visibilityTolerance) feasibilityReasons.push('visibility_tolerance_exceeded');
    if (option.emotionalCost > budget.emotionalBandwidth) feasibilityReasons.push('emotional_bandwidth_exceeded');
    const feasible = feasibilityReasons.length === 0;
    const utilityScore = feasible
      ? option.benefitScore * policy.benefitWeight +
        option.strategicFitScore * policy.strategicFitWeight -
        option.riskScore * policy.riskWeight +
        option.reversibilityScore * policy.reversibilityWeight +
        option.confidence * 100 * policy.confidenceWeight -
        (option.attentionCostMinutes / 60) * policy.attentionPenaltyPerHour
      : Number.NEGATIVE_INFINITY;
    const effectiveReasons: readonly FeasibilityReason[] = feasible
      ? ['within_budget']
      : feasibilityReasons;
    return {
      ...option,
      feasible,
      feasibilityReasons: effectiveReasons,
      utilityScore,
    };
  });
  const bestScore = Math.max(...evaluated.map((option) => option.utilityScore));

  return evaluated
    .sort((left, right) => right.utilityScore - left.utilityScore)
    .map((option, index) => ({
      ...option,
      opportunityCost: option.feasible ? bestScore - option.utilityScore : Infinity,
      rank: index + 1,
    }));
}

function validateOption(tenantId: TenantId, option: StrategicOption): void {
  if (option.tenantId !== tenantId) throw new Error('Cross-tenant option is forbidden.');
  if (option.title.trim().length < 3 || option.rationale.trim().length < 3) {
    throw new Error('Option title and rationale are required.');
  }
  if (option.evidenceIds.length === 0) throw new Error('Option requires evidence.');
  for (const [label, score] of Object.entries({
    benefit: option.benefitScore,
    strategicFit: option.strategicFitScore,
    risk: option.riskScore,
    reversibility: option.reversibilityScore,
  })) {
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error(`${label} score must be between 0 and 100.`);
    }
  }
  validateUnitScore(option.confidence, 'Option confidence');
  if (!Number.isInteger(option.attentionCostMinutes) || option.attentionCostMinutes < 0) {
    throw new Error('Attention cost must be a non-negative integer.');
  }
  for (const [label, cost] of Object.entries({
    energy: option.energyCost,
    visibility: option.visibilityCost,
    emotional: option.emotionalCost,
  })) {
    if (!Number.isInteger(cost) || cost < 1 || cost > 5) {
      throw new Error(`${label} cost must be between 1 and 5.`);
    }
  }
}

function validateRankingPolicy(policy: RankingPolicy): void {
  const weights = [
    policy.benefitWeight,
    policy.strategicFitWeight,
    policy.riskWeight,
    policy.reversibilityWeight,
    policy.confidenceWeight,
  ];
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error('Ranking weights must be non-negative.');
  }
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (Math.abs(sum - 1) > 0.000_001) throw new Error('Ranking weights must sum to 1.');
  if (!Number.isFinite(policy.attentionPenaltyPerHour) || policy.attentionPenaltyPerHour < 0) {
    throw new Error('Attention penalty must be non-negative.');
  }
}

function validateBudget(budget: AttentionBudget): void {
  if (!Number.isInteger(budget.availableMinutes) || budget.availableMinutes < 0) {
    throw new Error('Attention budget must be a non-negative integer.');
  }
  for (const [label, value] of Object.entries({
    maximumEnergyCost: budget.maximumEnergyCost,
    visibilityTolerance: budget.visibilityTolerance,
    emotionalBandwidth: budget.emotionalBandwidth,
  })) {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(`${label} must be between 1 and 5.`);
    }
  }
}

function validateUnitScore(value: number | undefined, label: string): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
}
