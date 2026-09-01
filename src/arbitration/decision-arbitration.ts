import { createHash } from 'node:crypto';
import type { ClaimGovernanceService, ClaimGovernanceSnapshot } from '../claims/governance.js';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';
import type {
  ActionRiskAssessment,
  BrandProtectionService,
  BrandProtectionSnapshot,
  RiskFinding,
} from '../risk/brand-protection.js';
import type { WorkbenchAction, WorkbenchService, WorkbenchSnapshot } from '../workbench/workbench.js';

export const arbitrationPolicyVersion = 'intermodule-arbitration-v1' as const;
export const moduleOpinionContractVersion = 'module-opinion-v1' as const;

export const autonomyLevels = [
  { level: 0, key: 'observe', label: 'مشاهده' },
  { level: 1, key: 'analyze', label: 'تحلیل' },
  { level: 2, key: 'recommend', label: 'پیشنهاد' },
  { level: 3, key: 'draft', label: 'پیش‌نویس' },
  { level: 4, key: 'prepare_action', label: 'آماده‌سازی اقدام' },
  { level: 5, key: 'ask_approval', label: 'درخواست تأیید' },
  { level: 6, key: 'execute_delegated', label: 'اجرای واگذارشده' },
  { level: 7, key: 'bounded_automation', label: 'اتوماسیون محدود' },
] as const;

export type AutonomyLevel = (typeof autonomyLevels)[number]['level'];
export type ArbitrationModule = 'strategy' | 'permission' | 'claims' | 'risk' | 'authenticity';
export type ModulePosition = 'support' | 'revise' | 'hold' | 'abstain';
export type ArbitrationOutcome =
  | 'recommendation_ready'
  | 'revision_required'
  | 'approval_required'
  | 'held';

export type ModuleOpinion = Readonly<{
  contractVersion: typeof moduleOpinionContractVersion;
  module: ArbitrationModule;
  moduleVersion: string;
  position: ModulePosition;
  confidence: number;
  appliesFromAutonomyLevel: AutonomyLevel;
  rationale: string;
  provenanceRefs: readonly string[];
  authority: Readonly<{
    read: 'owner_scoped_snapshot';
    write: 'none';
  }>;
}>;

export type ArbitrationCaseSnapshot = Readonly<{
  caseId: string;
  requestId: string;
  policyVersion: typeof arbitrationPolicyVersion;
  createdAt: string;
  validUntil: string;
  contextHash: string;
  snapshotHash: string;
  action: Readonly<{
    id: string;
    title: string;
    kind: WorkbenchAction['kind'];
    hash: string;
  }>;
  request: Readonly<{
    sourceModule: 'workbench';
    operation: 'evaluate_action';
    purpose: 'strategy_reasoning';
    requestedAutonomyLevel: AutonomyLevel;
    readAuthority: 'owner_scoped_snapshot';
    writeAuthority: 'append_decision_only';
  }>;
  opinions: readonly ModuleOpinion[];
  decision: Readonly<{
    outcome: ArbitrationOutcome;
    effectiveAutonomyLevel: AutonomyLevel;
    requiresHumanApproval: boolean;
    executionPermitted: false;
    dissentPreserved: boolean;
    blockingModules: readonly ArbitrationModule[];
    unknownModules: readonly ArbitrationModule[];
    downgradeReasons: readonly string[];
    appliedRules: readonly string[];
    rationale: string;
  }>;
}>;

export type ArbitrationWorkspaceSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres';
  policyVersion: typeof arbitrationPolicyVersion;
  contractVersion: typeof moduleOpinionContractVersion;
  autonomy: typeof autonomyLevels;
  mvpExecutionEnabled: false;
  availableActions: readonly Readonly<{
    id: string;
    title: string;
    kind: WorkbenchAction['kind'];
    evidenceCount: number;
    confidence: number;
    currentContextHash: string;
  }>[];
  cases: readonly Readonly<ArbitrationCaseSnapshot & { stale: boolean }>[];
}>;

export type ArbitrationSaveCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestFingerprint: string;
  snapshot: ArbitrationCaseSnapshot;
}>;

export type ArbitrationSaveResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  snapshot: ArbitrationCaseSnapshot;
}>;

export interface ArbitrationRepository {
  readonly persistence: 'memory' | 'postgres';
  list(tenantId: TenantId, actorId: UserId): Promise<readonly ArbitrationCaseSnapshot[]>;
  save(command: ArbitrationSaveCommand): Promise<ArbitrationSaveResult>;
}

export class ArbitrationValidationError extends Error {}
export class ArbitrationPermissionError extends Error {}
export class ArbitrationNotFoundError extends Error {}
export class ArbitrationConflictError extends Error {
  public constructor(public readonly reason: 'idempotency_mismatch') {
    super(`Arbitration conflict: ${reason}`);
  }
}

type ArbitrationContext = Readonly<{
  workbench: WorkbenchSnapshot;
  claims: ClaimGovernanceSnapshot | null;
  risk: BrandProtectionSnapshot;
}>;

export class DecisionArbitrationService {
  public constructor(
    private readonly repository: ArbitrationRepository,
    private readonly context: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly dependencies: Readonly<{
      workbench: Pick<WorkbenchService, 'snapshot'>;
      risk: Pick<BrandProtectionService, 'snapshot'>;
      claims?: Pick<ClaimGovernanceService, 'snapshot'>;
    }>,
  ) {}

  public async snapshot(actorId: UserId, generatedAt: Date): Promise<ArbitrationWorkspaceSnapshot> {
    this.assertOwner(actorId);
    const [loaded, stored] = await Promise.all([
      this.loadContext(actorId, generatedAt),
      this.repository.list(this.context.tenantId, actorId),
    ]);
    const currentHashes = new Map(
      loaded.workbench.actions.map((action) => [action.id, contextHash(action, loaded)]),
    );
    return {
      generatedAt: generatedAt.toISOString(),
      persistence: this.repository.persistence,
      policyVersion: arbitrationPolicyVersion,
      contractVersion: moduleOpinionContractVersion,
      autonomy: autonomyLevels,
      mvpExecutionEnabled: false,
      availableActions: loaded.workbench.actions.map((action) => ({
        id: action.id,
        title: action.title,
        kind: action.kind,
        evidenceCount: action.evidenceCount,
        confidence: action.confidence,
        currentContextHash: currentHashes.get(action.id) ?? '',
      })),
      cases: stored.map((item) => ({
        ...item,
        stale:
          currentHashes.get(item.action.id) !== item.contextHash ||
          new Date(item.validUntil).getTime() <= generatedAt.getTime(),
      })),
    };
  }

  public async assess(input: Readonly<{
    actorId: UserId;
    requestId: string;
    actionId: string;
    requestedAutonomyLevel: number;
    occurredAt: Date;
  }>): Promise<ArbitrationSaveResult & { persistence: ArbitrationRepository['persistence'] }> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    const requestedAutonomyLevel = validateAutonomyLevel(input.requestedAutonomyLevel);
    const loaded = await this.loadContext(input.actorId, input.occurredAt);
    const action = loaded.workbench.actions.find((candidate) => candidate.id === input.actionId);
    if (!action) throw new ArbitrationNotFoundError('Action not found for arbitration.');
    const assessment = loaded.risk.assessments.find((candidate) => candidate.actionId === action.id);
    if (!assessment) throw new ArbitrationNotFoundError('Risk assessment not found for arbitration.');

    const currentContextHash = contextHash(action, loaded);
    const opinions = moduleOpinions(action, assessment, loaded);
    const decision = arbitrate(action, requestedAutonomyLevel, opinions);
    const createdAt = input.occurredAt.toISOString();
    const caseId = deterministicUuid(
      `arbitration:${this.context.tenantId}:${this.context.ownerUserId}:${input.requestId}`,
    );
    const unsigned = {
      caseId,
      requestId: input.requestId,
      policyVersion: arbitrationPolicyVersion,
      createdAt,
      validUntil: new Date(input.occurredAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      contextHash: currentContextHash,
      action: {
        id: action.id,
        title: action.title,
        kind: action.kind,
        hash: actionHash(action),
      },
      request: {
        sourceModule: 'workbench' as const,
        operation: 'evaluate_action' as const,
        purpose: 'strategy_reasoning' as const,
        requestedAutonomyLevel,
        readAuthority: 'owner_scoped_snapshot' as const,
        writeAuthority: 'append_decision_only' as const,
      },
      opinions,
      decision,
    };
    const snapshot: ArbitrationCaseSnapshot = {
      ...unsigned,
      snapshotHash: sha256(JSON.stringify(unsigned)),
    };
    const requestFingerprint = sha256(JSON.stringify({
      policyVersion: arbitrationPolicyVersion,
      actionId: action.id,
      requestedAutonomyLevel,
      contextHash: currentContextHash,
    }));
    return {
      ...await this.repository.save({
        tenantId: this.context.tenantId,
        actorId: input.actorId,
        requestFingerprint,
        snapshot,
      }),
      persistence: this.repository.persistence,
    };
  }

  private async loadContext(actorId: UserId, generatedAt: Date): Promise<ArbitrationContext> {
    const [workbench, claims] = await Promise.all([
      this.dependencies.workbench.snapshot(),
      this.dependencies.claims?.snapshot(actorId, generatedAt) ?? Promise.resolve(null),
    ]);
    const risk = await this.dependencies.risk.snapshot(
      actorId,
      workbench.actions,
      claims,
      generatedAt,
    );
    return { workbench, claims, risk };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.context.ownerUserId) {
      throw new ArbitrationPermissionError('Only the owner can arbitrate an action.');
    }
  }
}

export class InMemoryArbitrationRepository implements ArbitrationRepository {
  public readonly persistence = 'memory' as const;
  readonly #requests = new Map<string, Readonly<{
    fingerprint: string;
    snapshot: ArbitrationCaseSnapshot;
  }>>();

  public list(): Promise<readonly ArbitrationCaseSnapshot[]> {
    return Promise.resolve(
      [...this.#requests.values()]
        .map((item) => item.snapshot)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    );
  }

  public save(command: ArbitrationSaveCommand): Promise<ArbitrationSaveResult> {
    const repeated = this.#requests.get(command.snapshot.requestId);
    if (repeated) {
      if (repeated.fingerprint !== command.requestFingerprint) {
        throw new ArbitrationConflictError('idempotency_mismatch');
      }
      return Promise.resolve({ outcome: 'already_applied', snapshot: repeated.snapshot });
    }
    this.#requests.set(command.snapshot.requestId, {
      fingerprint: command.requestFingerprint,
      snapshot: command.snapshot,
    });
    return Promise.resolve({ outcome: 'applied', snapshot: command.snapshot });
  }
}

type ArbitrationRow = Readonly<{
  client_ref: string;
  request_sha256: string;
  result_snapshot: unknown;
}>;

export class PostgresArbitrationRepository implements ArbitrationRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public list(tenantId: TenantId, actorId: UserId): Promise<readonly ArbitrationCaseSnapshot[]> {
    this.assertContext(tenantId, actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<ArbitrationRow>(
        `SELECT client_ref, request_sha256, result_snapshot
           FROM app.arbitration_cases
          WHERE tenant_id = $1 AND owner_user_id = $2
          ORDER BY created_at DESC, id DESC`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      return result.rows.map((row) => parseSnapshot(row.result_snapshot));
    });
  }

  public save(command: ArbitrationSaveCommand): Promise<ArbitrationSaveResult> {
    this.assertContext(command.tenantId, command.actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${this.context.tenantId}:arbitration:${command.snapshot.requestId}`,
      ]);
      const existing = await transaction.query<ArbitrationRow>(
        `SELECT client_ref, request_sha256, result_snapshot
           FROM app.arbitration_cases
          WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.snapshot.requestId],
      );
      const repeated = existing.rows[0];
      if (repeated) {
        if (repeated.request_sha256 !== command.requestFingerprint) {
          throw new ArbitrationConflictError('idempotency_mismatch');
        }
        return { outcome: 'already_applied' as const, snapshot: parseSnapshot(repeated.result_snapshot) };
      }
      await transaction.query(
        `INSERT INTO app.arbitration_cases (
           id, tenant_id, owner_user_id, client_ref, request_sha256, action_ref,
           action_sha256, context_sha256, policy_version, requested_autonomy_level,
           result_snapshot, valid_until, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)`,
        [
          command.snapshot.caseId,
          this.context.tenantId,
          this.context.ownerUserId,
          command.snapshot.requestId,
          command.requestFingerprint,
          command.snapshot.action.id,
          command.snapshot.action.hash,
          command.snapshot.contextHash,
          arbitrationPolicyVersion,
          command.snapshot.request.requestedAutonomyLevel,
          JSON.stringify(command.snapshot),
          command.snapshot.validUntil,
          command.snapshot.createdAt,
        ],
      );
      await appendAudit(transaction, this.context, command.snapshot);
      return { outcome: 'applied' as const, snapshot: command.snapshot };
    });
  }

  private assertContext(tenantId: TenantId, actorId: UserId): void {
    if (tenantId !== this.context.tenantId || actorId !== this.context.ownerUserId) {
      throw new ArbitrationPermissionError('Arbitration repository context mismatch.');
    }
  }
}

function moduleOpinions(
  action: WorkbenchAction,
  assessment: ActionRiskAssessment,
  context: ArbitrationContext,
): readonly ModuleOpinion[] {
  const evidenceRefs = action.evidenceIds.map((id) => `evidence:${id}`);
  const strategy: ModuleOpinion = opinion({
    module: 'strategy',
    moduleVersion: 'strategy-ranking-v1',
    position: action.feasible ? 'support' : 'hold',
    confidence: action.confidence,
    appliesFromAutonomyLevel: 2,
    rationale: action.feasible
      ? `اقدام با Confidence ${String(Math.round(action.confidence * 100))}٪ در بودجه فعلی قابل‌بررسی است؛ Utility به‌تنهایی تصمیم نهایی نیست.`
      : 'اقدام از بودجه زمان یا انرژی عبور می‌کند و در Context فعلی قابل توصیه نیست.',
    provenanceRefs: [`strategy_revision:${String(context.workbench.goal.revision)}`],
  });
  const hasAuthorizedEvidence = action.kind === 'no_action' ||
    (action.evidenceState === 'grounded' && action.evidenceIds.length > 0);
  const permission: ModuleOpinion = opinion({
    module: 'permission',
    moduleVersion: 'evidence-permission-filter-v1',
    position: hasAuthorizedEvidence ? 'support' : 'hold',
    confidence: 1,
    appliesFromAutonomyLevel: 2,
    rationale: hasAuthorizedEvidence
      ? 'فقط Evidence مالک‌محور و مجاز برای تحلیل برند در Context اقدام حاضر است.'
      : 'برای این اقدام Evidence مجاز وجود ندارد؛ Retrieval یا Utility مجوز ایجاد نمی‌کند.',
    provenanceRefs: evidenceRefs.length > 0 ? evidenceRefs : ['evidence:none_authorized'],
  });
  const publicFacing = ['content', 'media', 'event'].includes(action.kind);
  const claimsReady = context.risk.claimPosture.publicReady > 0;
  const claims: ModuleOpinion = opinion({
    module: 'claims',
    moduleVersion: 'claim-governance-v1',
    position: publicFacing ? (claimsReady ? 'support' : 'revise') : 'abstain',
    confidence: 1,
    appliesFromAutonomyLevel: 4,
    rationale: publicFacing
      ? claimsReady
        ? `${String(context.risk.claimPosture.publicReady)} Claim با Trace کامل برای استفاده عمومی آماده است.`
        : 'هیچ Claim عمومی با Trace کامل آماده نیست؛ آماده‌سازی اقدام باید به Draft/Claim Review برگردد.'
      : 'اقدام بیرونیِ Claim-bearing نیست؛ Claim Registry در این تصمیم رأی نمی‌دهد.',
    provenanceRefs: [
      `claim_policy:claim-governance-v1`,
      `public_ready:${String(context.risk.claimPosture.publicReady)}`,
    ],
  });
  const risk: ModuleOpinion = riskOpinion(assessment);
  const authenticity: ModuleOpinion = authenticityOpinion(action, assessment);
  return [strategy, permission, claims, risk, authenticity];
}

function riskOpinion(assessment: ActionRiskAssessment): ModuleOpinion {
  const position: ModulePosition = assessment.level === 'red'
    ? 'hold'
    : assessment.level === 'yellow' && assessment.gate === 'review_required'
      ? 'revise'
      : 'support';
  return opinion({
    module: 'risk',
    moduleVersion: assessment.policyVersion,
    position,
    confidence: 1,
    appliesFromAutonomyLevel: 4,
    rationale: assessment.rationale,
    provenanceRefs: [
      `risk_assessment:${assessment.assessmentHash}`,
      ...(assessment.lastReview ? [`risk_review:${assessment.lastReview.reviewId}`] : []),
    ],
  });
}

function authenticityOpinion(
  action: WorkbenchAction,
  assessment: ActionRiskAssessment,
): ModuleOpinion {
  const finding = assessment.findings.find((item) => item.dimension === 'authenticity');
  const acknowledged = assessment.lastReview?.decision === 'acknowledge';
  const position: ModulePosition = finding?.level === 'red'
    ? 'hold'
    : finding?.level === 'yellow' && !acknowledged
      ? 'revise'
      : action.evidenceState === 'grounded' && action.evidenceCount > 0
        ? 'support'
        : 'abstain';
  return opinion({
    module: 'authenticity',
    moduleVersion: 'authenticity-grounding-v1',
    position,
    confidence: position === 'support' ? 0.65 : 1,
    appliesFromAutonomyLevel: 3,
    rationale: authenticityRationale(position, finding, action.evidenceCount),
    provenanceRefs: [
      `risk_assessment:${assessment.assessmentHash}`,
      ...action.evidenceIds.map((id) => `evidence:${id}`),
    ],
  });
}

function authenticityRationale(
  position: ModulePosition,
  finding: RiskFinding | undefined,
  evidenceCount: number,
): string {
  if (position === 'hold') return finding?.rationale ?? 'Authenticity blocker detected.';
  if (position === 'revise') return finding?.rationale ?? 'Authenticity requires revision.';
  if (position === 'support') {
    return `${String(evidenceCount)} Evidence مجاز Grounding حداقلی می‌دهد؛ این رأی ادعای Voice Match کامل نیست.`;
  }
  return 'Evidence کافی برای قضاوت اصالت وجود ندارد؛ ماژول به‌جای ساختن قطعیت رأی ممتنع می‌دهد.';
}

function opinion(input: Omit<ModuleOpinion, 'contractVersion' | 'authority'>): ModuleOpinion {
  return {
    contractVersion: moduleOpinionContractVersion,
    ...input,
    authority: { read: 'owner_scoped_snapshot', write: 'none' },
  };
}

export function arbitrate(
  action: Pick<WorkbenchAction, 'kind'>,
  requestedAutonomyLevel: AutonomyLevel,
  opinions: readonly ModuleOpinion[],
): ArbitrationCaseSnapshot['decision'] {
  const active = opinions.filter(
    (item) => item.appliesFromAutonomyLevel <= requestedAutonomyLevel,
  );
  const holds = active.filter((item) => item.position === 'hold');
  const revisions = active.filter((item) => item.position === 'revise');
  const unknown = active.filter((item) => item.position === 'abstain');
  const mvpDowngrade = requestedAutonomyLevel > 5;
  const effectiveAutonomyLevel = (
    holds.length > 0
      ? Math.min(requestedAutonomyLevel, 1)
      : revisions.length > 0
        ? Math.min(requestedAutonomyLevel, 3)
        : Math.min(requestedAutonomyLevel, 5)
  ) as AutonomyLevel;
  const outcome: ArbitrationOutcome = holds.length > 0
    ? 'held'
    : revisions.length > 0
      ? 'revision_required'
      : requestedAutonomyLevel >= 5
        ? 'approval_required'
        : 'recommendation_ready';
  const externalAction = action.kind !== 'no_action' && action.kind !== 'research';
  const requiresHumanApproval = requestedAutonomyLevel >= 5 ||
    (externalAction && requestedAutonomyLevel >= 4);
  const downgradeReasons = [
    ...(mvpDowngrade ? ['mvp_execution_disabled'] : []),
    ...(holds.length > 0 ? ['blocking_module_present'] : []),
    ...(revisions.length > 0 ? ['mandatory_revision_present'] : []),
  ];
  return {
    outcome,
    effectiveAutonomyLevel,
    requiresHumanApproval,
    executionPermitted: false,
    dissentPreserved: active.some((item) => item.position !== 'support'),
    blockingModules: [...new Set(holds.map((item) => item.module))],
    unknownModules: [...new Set(unknown.map((item) => item.module))],
    downgradeReasons,
    appliedRules: [
      'privacy_security_before_utility',
      'permission_before_retrieval_utility',
      'claim_and_risk_gates_are_independent',
      'single_module_cannot_override_blocker',
      'dissent_and_abstention_are_preserved',
      'public_side_effect_requires_human_approval',
      'mvp_execution_ceiling_is_level_5',
    ],
    rationale: decisionRationale(outcome, holds, revisions, mvpDowngrade),
  };
}

function decisionRationale(
  outcome: ArbitrationOutcome,
  holds: readonly ModuleOpinion[],
  revisions: readonly ModuleOpinion[],
  mvpDowngrade: boolean,
): string {
  if (outcome === 'held') {
    return `حداقل یک Gate الزام‌آور (${holds.map((item) => item.module).join('، ')}) اقدام را متوقف کرد؛ رأی‌های Utility قادر به Override نیستند.`;
  }
  if (outcome === 'revision_required') {
    return `پیش از ادامه، اصلاح الزام‌آور از ${revisions.map((item) => item.module).join('، ')} لازم است و مخالفت در Snapshot حفظ شد.`;
  }
  if (outcome === 'approval_required') {
    return mvpDowngrade
      ? 'درخواست اجرای خودکار به سقف Level 5 کاهش یافت؛ MVP هیچ Side Effect بیرونی اجرا نمی‌کند و تأیید انسانی لازم است.'
      : 'همه Gateهای فعال عبور کرده‌اند، اما مرحله فعلی فقط درخواست تأیید انسانی است و اجرا مجاز نیست.';
  }
  return 'Gateهای فعال برای این سطح عبور کرده‌اند؛ نتیجه فقط Recommendation است و هیچ Side Effect ایجاد نمی‌کند.';
}

function contextHash(action: WorkbenchAction, context: ArbitrationContext): string {
  const assessment = context.risk.assessments.find((candidate) => candidate.actionId === action.id);
  return sha256(JSON.stringify({
    policyVersion: arbitrationPolicyVersion,
    actionHash: actionHash(action),
    strategyRevision: context.workbench.goal.revision,
    decisionContextRevision: context.workbench.decisionContext.revision,
    decisionContextHash: context.workbench.decisionContext.contextHash,
    risk: assessment ? {
      assessmentHash: assessment.assessmentHash,
      gate: assessment.gate,
      reviewId: assessment.lastReview?.reviewId ?? null,
    } : null,
    claims: context.risk.claimPosture,
  }));
}

function actionHash(action: WorkbenchAction): string {
  return sha256(JSON.stringify({
    id: action.id,
    kind: action.kind,
    title: action.title,
    rationale: action.rationale,
    risks: action.risks,
    prerequisites: action.prerequisites,
    evidenceIds: action.evidenceIds,
    evidenceState: action.evidenceState,
    confidence: action.confidence,
    riskLevel: action.riskLevel,
    utilityScore: action.utilityScore,
    opportunityCost: action.opportunityCost,
    feasible: action.feasible,
    feasibilityReasons: action.feasibilityReasons,
    attentionCostMinutes: action.attentionCostMinutes,
    energyCost: action.energyCost,
    attentionDemand: action.attentionDemand,
    visibilityCost: action.visibilityCost,
    emotionalCost: action.emotionalCost,
    decision: stableDecisionContract(action),
  }));
}

function stableDecisionContract(action: WorkbenchAction): Record<string, unknown> {
  return {
    policyVersion: action.decision.policyVersion,
    strategyRevision: action.decision.strategyRevision,
    decisionContextRevision: action.decision.decisionContextRevision,
    decisionContextHash: action.decision.decisionContextHash,
    objective: action.decision.objective,
    stakeholder: action.decision.stakeholder,
    posture: action.decision.posture,
    format: action.decision.format,
    platformSelected: action.decision.platformSelected,
    assumptions: action.decision.assumptions,
    uncertainty: action.decision.uncertainty,
    feasibilityReasons: action.decision.feasibilityReasons,
    requiredApproval: action.decision.requiredApproval,
    measurementSignals: action.decision.measurementPlan.signals,
    boundaries: action.decision.boundaries,
  };
}

function parseSnapshot(value: unknown): ArbitrationCaseSnapshot {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  if (
    !isRecord(parsed) || parsed['policyVersion'] !== arbitrationPolicyVersion ||
    typeof parsed['caseId'] !== 'string' || typeof parsed['requestId'] !== 'string' ||
    typeof parsed['contextHash'] !== 'string' || typeof parsed['snapshotHash'] !== 'string' ||
    !Array.isArray(parsed['opinions']) || !isRecord(parsed['decision']) ||
    !isRecord(parsed['action']) || !isRecord(parsed['request']) ||
    typeof parsed['createdAt'] !== 'string' || typeof parsed['validUntil'] !== 'string'
  ) {
    throw new Error('Stored arbitration snapshot is invalid.');
  }
  return parsed as ArbitrationCaseSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new ArbitrationValidationError('Arbitration request id is invalid.');
  }
}

function validateAutonomyLevel(value: number): AutonomyLevel {
  if (!Number.isInteger(value) || value < 0 || value > 7) {
    throw new ArbitrationValidationError('Requested autonomy level is invalid.');
  }
  return value as AutonomyLevel;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function deterministicUuid(seed: string): string {
  const hash = sha256(seed).slice(0, 32).split('');
  hash[12] = '4';
  hash[16] = '8';
  const value = hash.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function appendAudit(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  snapshot: ArbitrationCaseSnapshot,
): Promise<void> {
  const metadata = JSON.stringify({
    requestId: snapshot.requestId,
    actionId: snapshot.action.id,
    requestedAutonomyLevel: snapshot.request.requestedAutonomyLevel,
    effectiveAutonomyLevel: snapshot.decision.effectiveAutonomyLevel,
    outcome: snapshot.decision.outcome,
    policyVersion: snapshot.policyVersion,
    snapshotHash: snapshot.snapshotHash,
  });
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, 'decision.arbitrated', 'arbitration_case', $3,
       'strategy_reasoning', $4, $5::jsonb, $6)`,
    [
      context.tenantId,
      context.ownerUserId,
      snapshot.caseId,
      snapshot.decision.outcome,
      metadata,
      snapshot.createdAt,
    ],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'arbitration_case', $2, 'decision.arbitrated', $3::jsonb, $4)`,
    [context.tenantId, snapshot.caseId, metadata, snapshot.createdAt],
  );
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}
