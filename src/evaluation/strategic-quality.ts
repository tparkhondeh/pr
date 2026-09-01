import { createHash } from 'node:crypto';
import type { TenantId, UserId } from '../kernel/identity.js';
import type { WorkbenchAction, WorkbenchSnapshot } from '../workbench/workbench.js';
import type { EvaluationSeverity } from './evaluation.js';

export const strategicQualityPolicyVersion = 'strategic-quality-v1' as const;
export const strategicQualityMinimumSamples = 5;

export type StrategicRecommendationDecision = 'accepted' | 'rejected' | 'needs_revision';
export type StrategicQualityPersistence = 'memory' | 'postgres';

export type StrategicRecommendationReview = Readonly<{
  id: string;
  actionId: string;
  actionTitle: string;
  actionKind: WorkbenchAction['kind'];
  actionRank: number;
  decision: StrategicRecommendationDecision;
  usefulness: 1 | 2 | 3 | 4 | 5;
  trust: 1 | 2 | 3 | 4 | 5;
  friction: 1 | 2 | 3 | 4 | 5;
  note?: string;
  strategyRevision: number;
  decisionContextRevision: number;
  decisionContextHash: string;
  decisionWindowEndsAt: Date;
  reviewedAt: Date;
  supersedesReviewId?: string;
}>;

export type StrategicRubricResult = Readonly<{
  policyVersion: typeof strategicQualityPolicyVersion;
  status: 'pass' | 'fail';
  passedChecks: number;
  totalChecks: number;
  criticalFailures: number;
  checks: readonly Readonly<{
    id: string;
    severity: EvaluationSeverity;
    passed: boolean;
    evidence: string;
  }>[];
}>;

export type StrategicQualityMetrics = Readonly<{
  acceptanceRate: number;
  averageUsefulness: number;
  averageTrust: number;
  averageFriction: number;
}>;

export type StrategicQualitySnapshot = Readonly<{
  policyVersion: typeof strategicQualityPolicyVersion;
  generatedAt: Date;
  persistence: StrategicQualityPersistence;
  context: Readonly<{
    strategyRevision: number;
    decisionContextRevision: number;
    decisionContextHash: string;
    decisionWindowEndsAt: Date;
  }>;
  rubric: StrategicRubricResult;
  ownerBaseline: Readonly<{
    status: 'collecting' | 'established';
    minimumSampleSize: typeof strategicQualityMinimumSamples;
    sampleSize: number;
    remainingSamples: number;
    accepted: number;
    rejected: number;
    needsRevision: number;
    observedMetrics: StrategicQualityMetrics | null;
    baselineMetrics: StrategicQualityMetrics | null;
  }>;
  recentReviews: readonly StrategicRecommendationReview[];
}>;

export type StrategicReviewCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  action: WorkbenchAction;
  decision: StrategicRecommendationDecision;
  usefulness: 1 | 2 | 3 | 4 | 5;
  trust: 1 | 2 | 3 | 4 | 5;
  friction: 1 | 2 | 3 | 4 | 5;
  note?: string;
  strategyRevision: number;
  decisionContextRevision: number;
  decisionContextHash: string;
  decisionWindowEndsAt: Date;
  reviewedAt: Date;
}>;

export interface StrategicQualityRepository {
  readonly persistence: StrategicQualityPersistence;
  list(generatedAt: Date): Promise<readonly StrategicRecommendationReview[]>;
  record(command: StrategicReviewCommand): Promise<readonly StrategicRecommendationReview[]>;
}

export class StrategicQualityValidationError extends Error {}
export class StrategicQualityPermissionError extends Error {}
export class StrategicQualityNotFoundError extends Error {}
export class StrategicQualityConflictError extends Error {
  public constructor(public readonly reason:
    | 'idempotency_mismatch'
    | 'strategy_changed'
    | 'decision_context_changed'
    | 'decision_expired'
    | 'acceptance_not_approved') {
    super(`Strategic quality conflict: ${reason}`);
  }
}

export class StrategicQualityService {
  public constructor(
    private readonly repository: StrategicQualityRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly workbench: Pick<{ snapshot(): Promise<WorkbenchSnapshot> }, 'snapshot'>,
  ) {}

  public async snapshot(actorId: UserId, generatedAt: Date): Promise<StrategicQualitySnapshot> {
    this.assertOwner(actorId);
    const [workbench, reviews] = await Promise.all([
      this.workbench.snapshot(),
      this.repository.list(generatedAt),
    ]);
    return makeStrategicQualitySnapshot(generatedAt, this.repository.persistence, workbench, reviews);
  }

  public async review(input: Readonly<{
    actorId: UserId;
    requestId: string;
    actionId: string;
    decision: StrategicRecommendationDecision;
    usefulness: number;
    trust: number;
    friction: number;
    note?: string;
    expectedStrategyRevision: number;
    expectedDecisionContextRevision: number;
    expectedDecisionContextHash: string;
    expectedDecisionWindowEndsAt: string;
    reviewedAt: Date;
  }>): Promise<StrategicQualitySnapshot> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    validateReviewInput(input);
    const workbench = await this.workbench.snapshot();
    if (input.expectedStrategyRevision !== workbench.goal.revision) {
      throw new StrategicQualityConflictError('strategy_changed');
    }
    if (
      input.expectedDecisionContextRevision !== workbench.decisionContext.revision ||
      input.expectedDecisionContextHash !== workbench.decisionContext.contextHash
    ) {
      throw new StrategicQualityConflictError('decision_context_changed');
    }
    const decisionWindowEndsAt = new Date(input.expectedDecisionWindowEndsAt);
    if (
      Number.isNaN(decisionWindowEndsAt.getTime()) ||
      decisionWindowEndsAt.getTime() <= input.reviewedAt.getTime()
    ) {
      throw new StrategicQualityConflictError('decision_expired');
    }
    const action = workbench.actions.find((candidate) => candidate.id === input.actionId);
    if (!action) throw new StrategicQualityNotFoundError();
    if (
      action.decision.strategyRevision !== input.expectedStrategyRevision ||
      action.decision.decisionContextRevision !== input.expectedDecisionContextRevision ||
      action.decision.decisionContextHash !== input.expectedDecisionContextHash
    ) {
      throw new StrategicQualityConflictError('decision_context_changed');
    }
    if (input.decision === 'accepted' && workbench.workflow.approvedActionId !== action.id) {
      throw new StrategicQualityConflictError('acceptance_not_approved');
    }
    const reviews = await this.repository.record({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      action,
      decision: input.decision,
      usefulness: input.usefulness as 1 | 2 | 3 | 4 | 5,
      trust: input.trust as 1 | 2 | 3 | 4 | 5,
      friction: input.friction as 1 | 2 | 3 | 4 | 5,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      strategyRevision: input.expectedStrategyRevision,
      decisionContextRevision: input.expectedDecisionContextRevision,
      decisionContextHash: input.expectedDecisionContextHash,
      decisionWindowEndsAt,
      reviewedAt: input.reviewedAt,
    });
    return makeStrategicQualitySnapshot(
      input.reviewedAt,
      this.repository.persistence,
      workbench,
      reviews,
    );
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) {
      throw new StrategicQualityPermissionError('Only the owner can review recommendations.');
    }
  }
}

export class InMemoryStrategicQualityRepository implements StrategicQualityRepository {
  public readonly persistence = 'memory' as const;
  readonly #reviews = new Map<string, StrategicRecommendationReview>();
  readonly #requests = new Map<string, Readonly<{ fingerprint: string; reviewId: string }>>();

  public list(): Promise<readonly StrategicRecommendationReview[]> {
    return Promise.resolve(this.current());
  }

  public record(command: StrategicReviewCommand): Promise<readonly StrategicRecommendationReview[]> {
    const fingerprint = reviewFingerprint(command);
    const repeated = this.#requests.get(command.requestId);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) {
        throw new StrategicQualityConflictError('idempotency_mismatch');
      }
      return Promise.resolve(this.current());
    }
    const prior = currentReviews([...this.#reviews.values()]).find((review) =>
      review.actionId === command.action.id &&
      review.strategyRevision === command.strategyRevision &&
      review.decisionContextRevision === command.decisionContextRevision &&
      review.decisionContextHash === command.decisionContextHash,
    );
    const id = deterministicUuid(
      `strategic-review:${command.tenantId}:${command.actorId}:${command.requestId}`,
    );
    const review = toReview(id, command, prior?.id);
    this.#reviews.set(id, review);
    this.#requests.set(command.requestId, { fingerprint, reviewId: id });
    return Promise.resolve(this.current());
  }

  private current(): readonly StrategicRecommendationReview[] {
    return [...this.#reviews.values()].sort(
      (left, right) => right.reviewedAt.getTime() - left.reviewedAt.getTime(),
    );
  }
}

export function evaluateStrategicDecisionRubric(snapshot: WorkbenchSnapshot): StrategicRubricResult {
  const meaningfulSignals = new Set([
    'کیفیت تعامل', 'عمق تعامل', 'تغییر رابطه', 'فرصت ایجادشده',
    'تغییر ادراک', 'پیام خصوصی', 'پشیمانی کاربر', 'رضایت کاربر', 'انرژی کاربر',
  ]);
  const contentActions = snapshot.actions.filter((action) => action.kind === 'content');
  const checks: StrategicRubricResult['checks'] = [
    {
      id: 'explicit_decision_frame', severity: 'critical',
      passed: hasExplicitDecisionFrame(snapshot.decisionFrame),
      evidence: snapshot.decisionFrame.policyVersion,
    },
    {
      id: 'multidimensional_attention_budget', severity: 'high',
      passed: snapshot.actions.every((action) =>
        action.attentionCostMinutes >= 0 && action.energyCost >= 1 &&
        action.attentionDemand >= 1 && action.visibilityCost >= 1 &&
        action.emotionalCost >= 1 &&
        (snapshot.evidence.state === 'insufficient' || action.opportunityCost !== null),
      ),
      evidence: `${String(snapshot.actions.length)} action cost contracts`,
    },
    {
      id: 'human_gated_recommendations', severity: 'critical',
      passed: snapshot.actions.every((action) => hasHumanGate(action.decision)),
      evidence: `${String(snapshot.actions.length)} human-gated actions`,
    },
    {
      id: 'deliberate_no_action', severity: 'critical',
      passed: snapshot.actions.some((action) =>
        action.kind === 'no_action' && action.decision.posture === 'delay' &&
        action.decision.format === 'none',
      ),
      evidence: snapshot.actions.map((action) => action.kind).join(' | '),
    },
    {
      id: 'grounded_or_abstaining', severity: 'critical',
      passed: snapshot.evidence.state === 'grounded'
        ? snapshot.actions.every((action) => action.evidenceState === 'grounded')
        : snapshot.actions.every((action) => action.interaction !== 'approve' || action.kind === 'no_action'),
      evidence: `${snapshot.evidence.state}:${String(snapshot.evidence.strategyEvidenceCount)}`,
    },
    {
      id: 'current_context_binding', severity: 'critical',
      passed: snapshot.actions.every((action) =>
        action.decision.strategyRevision === snapshot.goal.revision &&
        action.decision.decisionContextRevision === snapshot.decisionContext.revision &&
        action.decision.decisionContextHash === snapshot.decisionContext.contextHash,
      ),
      evidence: `strategy:${String(snapshot.goal.revision)} context:${String(snapshot.decisionContext.revision)}`,
    },
    {
      id: 'mother_concept_before_platform', severity: 'high',
      passed: contentActions.every((action) => isMotherConcept(action.decision)),
      evidence: contentActions.length === 0 ? 'not_applicable' : `${String(contentActions.length)} mother concepts`,
    },
    {
      id: 'meaningful_learning_signals', severity: 'high',
      passed: snapshot.evidence.state === 'insufficient' || snapshot.actions.every((action) =>
        action.decision.measurementPlan.signals.some((signal) => meaningfulSignals.has(signal)),
      ),
      evidence: `${String(snapshot.actions.length)} meaningful measurement plans`,
    },
  ];
  const criticalFailures = checks.filter((check) => !check.passed && check.severity === 'critical').length;
  const passedChecks = checks.filter((check) => check.passed).length;
  return {
    policyVersion: strategicQualityPolicyVersion,
    status: checks.every((check) => check.passed) ? 'pass' : 'fail',
    passedChecks,
    totalChecks: checks.length,
    criticalFailures,
    checks,
  };
}

function hasExplicitDecisionFrame(frame: Readonly<{
  why: Readonly<{ objective: string }>;
  forWhom: string;
  decisionWindow: Readonly<{ expiresAt: string }>;
  rankingTransparency: Readonly<{
    opportunityCostVisible: boolean;
    hiddenScoreUsed: boolean;
  }>;
}>): boolean {
  return Boolean(
    frame.why.objective && frame.forWhom && frame.decisionWindow.expiresAt &&
    frame.rankingTransparency.opportunityCostVisible &&
    !frame.rankingTransparency.hiddenScoreUsed,
  );
}

function hasHumanGate(decision: Readonly<{
  requiredApproval: string;
  boundaries: Readonly<{
    recommendationIsExecution: boolean;
    publicApprovalGranted: boolean;
    externalActionPermitted: boolean;
  }>;
}>): boolean {
  return decision.requiredApproval === 'human' &&
    !decision.boundaries.recommendationIsExecution &&
    !decision.boundaries.publicApprovalGranted &&
    !decision.boundaries.externalActionPermitted;
}

function isMotherConcept(decision: Readonly<{
  format: string;
  platformSelected: boolean;
}>): boolean {
  return decision.format === 'mother_concept' && !decision.platformSelected;
}

function makeStrategicQualitySnapshot(
  generatedAt: Date,
  persistence: StrategicQualityPersistence,
  workbench: WorkbenchSnapshot,
  reviews: readonly StrategicRecommendationReview[],
): StrategicQualitySnapshot {
  const current = currentReviews(reviews);
  const accepted = current.filter((review) => review.decision === 'accepted').length;
  const rejected = current.filter((review) => review.decision === 'rejected').length;
  const needsRevision = current.filter((review) => review.decision === 'needs_revision').length;
  const observedMetrics = current.length === 0 ? null : metrics(current, accepted);
  const established = current.length >= strategicQualityMinimumSamples;
  return {
    policyVersion: strategicQualityPolicyVersion,
    generatedAt,
    persistence,
    context: {
      strategyRevision: workbench.goal.revision,
      decisionContextRevision: workbench.decisionContext.revision,
      decisionContextHash: workbench.decisionContext.contextHash,
      decisionWindowEndsAt: new Date(workbench.decisionFrame.decisionWindow.expiresAt),
    },
    rubric: evaluateStrategicDecisionRubric(workbench),
    ownerBaseline: {
      status: established ? 'established' : 'collecting',
      minimumSampleSize: strategicQualityMinimumSamples,
      sampleSize: current.length,
      remainingSamples: Math.max(0, strategicQualityMinimumSamples - current.length),
      accepted,
      rejected,
      needsRevision,
      observedMetrics,
      baselineMetrics: established ? observedMetrics : null,
    },
    recentReviews: [...reviews]
      .sort((left, right) => right.reviewedAt.getTime() - left.reviewedAt.getTime())
      .slice(0, 50),
  };
}

function currentReviews(
  reviews: readonly StrategicRecommendationReview[],
): readonly StrategicRecommendationReview[] {
  const superseded = new Set(
    reviews.flatMap((review) => review.supersedesReviewId ? [review.supersedesReviewId] : []),
  );
  const latest = new Map<string, StrategicRecommendationReview>();
  for (const review of [...reviews]
    .filter((candidate) => !superseded.has(candidate.id))
    .sort((left, right) => right.reviewedAt.getTime() - left.reviewedAt.getTime())) {
    const key = [
      review.actionId,
      String(review.strategyRevision),
      String(review.decisionContextRevision),
      review.decisionContextHash,
    ].join(':');
    if (!latest.has(key)) latest.set(key, review);
  }
  return [...latest.values()];
}

function metrics(
  reviews: readonly StrategicRecommendationReview[],
  accepted: number,
): StrategicQualityMetrics {
  const average = (select: (review: StrategicRecommendationReview) => number): number =>
    round(reviews.reduce((total, review) => total + select(review), 0) / reviews.length);
  return {
    acceptanceRate: round(accepted / reviews.length),
    averageUsefulness: average((review) => review.usefulness),
    averageTrust: average((review) => review.trust),
    averageFriction: average((review) => review.friction),
  };
}

function toReview(
  id: string,
  command: StrategicReviewCommand,
  supersedesReviewId?: string,
): StrategicRecommendationReview {
  return {
    id,
    actionId: command.action.id,
    actionTitle: command.action.title,
    actionKind: command.action.kind,
    actionRank: command.action.rank,
    decision: command.decision,
    usefulness: command.usefulness,
    trust: command.trust,
    friction: command.friction,
    ...(command.note ? { note: command.note } : {}),
    strategyRevision: command.strategyRevision,
    decisionContextRevision: command.decisionContextRevision,
    decisionContextHash: command.decisionContextHash,
    decisionWindowEndsAt: command.decisionWindowEndsAt,
    reviewedAt: command.reviewedAt,
    ...(supersedesReviewId ? { supersedesReviewId } : {}),
  };
}

export function reviewFingerprint(command: StrategicReviewCommand): string {
  return createHash('sha256').update(JSON.stringify({
    actionId: command.action.id,
    decision: command.decision,
    usefulness: command.usefulness,
    trust: command.trust,
    friction: command.friction,
    note: command.note ?? null,
    strategyRevision: command.strategyRevision,
    decisionContextRevision: command.decisionContextRevision,
    decisionContextHash: command.decisionContextHash,
    decisionWindowEndsAt: command.decisionWindowEndsAt.toISOString(),
  })).digest('hex');
}

function validateReviewInput(input: Readonly<{
  actionId: string;
  decision: StrategicRecommendationDecision;
  usefulness: number;
  trust: number;
  friction: number;
  note?: string;
  expectedStrategyRevision: number;
  expectedDecisionContextRevision: number;
  expectedDecisionContextHash: string;
}>): void {
  if (input.actionId.trim().length === 0 || input.actionId.length > 120) {
    throw new StrategicQualityValidationError('Action id is invalid.');
  }
  if (!['accepted', 'rejected', 'needs_revision'].includes(input.decision)) {
    throw new StrategicQualityValidationError('Review decision is invalid.');
  }
  if (![input.usefulness, input.trust, input.friction].every(isRating)) {
    throw new StrategicQualityValidationError('Review ratings must be integers from 1 to 5.');
  }
  if (input.note !== undefined && input.note.trim().length > 1_000) {
    throw new StrategicQualityValidationError('Review note is too long.');
  }
  if (
    !Number.isInteger(input.expectedStrategyRevision) || input.expectedStrategyRevision < 1 ||
    !Number.isInteger(input.expectedDecisionContextRevision) || input.expectedDecisionContextRevision < 1 ||
    !/^[0-9a-f]{64}$/u.test(input.expectedDecisionContextHash)
  ) {
    throw new StrategicQualityValidationError('Review context expectation is invalid.');
  }
}

function isRating(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new StrategicQualityValidationError('Strategic review request id is invalid.');
  }
}

function deterministicUuid(seed: string): string {
  const chars = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((Number.parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
