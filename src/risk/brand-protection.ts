import { createHash } from 'node:crypto';
import type { ClaimGovernanceSnapshot } from '../claims/governance.js';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';
import type { WorkbenchAction } from '../workbench/workbench.js';

export const riskPolicyVersion = 'brand-protection-v1';

export const riskDimensions = [
  'consent',
  'privacy',
  'data_access',
  'sensitive_data',
  'third_party_privacy',
  'reputation_risk',
  'misinterpretation',
  'manipulation',
  'defamation',
  'conflict_of_interest',
  'disclosure',
  'authenticity',
  'security',
  'public_exposure',
  'long_term_consequences',
] as const;

export type RiskDimension = (typeof riskDimensions)[number];
export type RiskLevel = 'green' | 'yellow' | 'red';
export type RiskGate = 'allowed' | 'review_required' | 'allowed_with_acknowledgement' | 'blocked';
export type RiskReviewDecision = 'acknowledge' | 'hold' | 'escalate';

export type RiskFinding = Readonly<{
  dimension: RiskDimension;
  level: RiskLevel;
  code: string;
  rationale: string;
  mitigation: string;
}>;

export type RiskReviewRecord = Readonly<{
  reviewId: string;
  requestId: string;
  actionId: string;
  assessmentHash: string;
  expectedLevel: RiskLevel;
  decision: RiskReviewDecision;
  rationale: string;
  reviewedBy: UserId;
  reviewedAt: Date;
}>;

export type ActionRiskAssessment = Readonly<{
  actionId: string;
  actionTitle: string;
  actionKind: WorkbenchAction['kind'];
  policyVersion: typeof riskPolicyVersion;
  assessmentHash: string;
  level: RiskLevel;
  gate: RiskGate;
  rationale: string;
  findings: readonly RiskFinding[];
  reviewableDecisions: readonly RiskReviewDecision[];
  lastReview?: RiskReviewRecord;
}>;

export type BrandProtectionSnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres';
  policyVersion: typeof riskPolicyVersion;
  summary: Readonly<{
    totalActions: number;
    green: number;
    yellow: number;
    red: number;
    reviewRequired: number;
    blocked: number;
  }>;
  claimPosture: Readonly<{
    totalClaims: number;
    verified: number;
    traceBlocked: number;
    publicReady: number;
    note: string;
  }>;
  assessments: readonly ActionRiskAssessment[];
}>;

export type RiskReviewCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  reviewId: string;
  requestId: string;
  actionId: string;
  assessmentHash: string;
  expectedLevel: RiskLevel;
  decision: RiskReviewDecision;
  rationale: string;
  reviewedAt: Date;
}>;

export type RiskReviewResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  persistence: 'memory' | 'postgres';
  review: RiskReviewRecord;
}>;

export interface RiskReviewRepository {
  readonly persistence: 'memory' | 'postgres';
  latest(tenantId: TenantId, actorId: UserId): Promise<ReadonlyMap<string, RiskReviewRecord>>;
  review(command: RiskReviewCommand): Promise<Omit<RiskReviewResult, 'persistence'>>;
}

export class BrandProtectionValidationError extends Error {}
export class BrandProtectionPermissionError extends Error {}
export class BrandProtectionNotFoundError extends Error {}
export class BrandProtectionConflictError extends Error {
  public constructor(
    public readonly reason: 'idempotency_mismatch' | 'assessment_changed' | 'invalid_decision',
  ) {
    super(`Brand protection conflict: ${reason}`);
  }
}
export class BrandProtectionBlockedError extends Error {
  public constructor(public readonly reason: 'risk_review_required' | 'risk_blocked') {
    super(`Brand protection blocked: ${reason}`);
  }
}

export class BrandProtectionService {
  public constructor(
    private readonly repository: RiskReviewRepository,
    private readonly context: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public async snapshot(
    actorId: UserId,
    actions: readonly WorkbenchAction[],
    claims: ClaimGovernanceSnapshot | null,
    generatedAt: Date,
  ): Promise<BrandProtectionSnapshot> {
    this.assertOwner(actorId);
    const reviews = await this.repository.latest(this.context.tenantId, actorId);
    const assessments = actions.map((action) => applyReview(assessAction(action), reviews.get(action.id)));
    return {
      generatedAt,
      persistence: this.repository.persistence,
      policyVersion: riskPolicyVersion,
      summary: {
        totalActions: assessments.length,
        green: assessments.filter((item) => item.level === 'green').length,
        yellow: assessments.filter((item) => item.level === 'yellow').length,
        red: assessments.filter((item) => item.level === 'red').length,
        reviewRequired: assessments.filter((item) => item.gate === 'review_required').length,
        blocked: assessments.filter((item) => item.gate === 'blocked').length,
      },
      claimPosture: claims ? {
        totalClaims: claims.summary.totalClaims,
        verified: claims.summary.verified,
        traceBlocked: claims.summary.traceBlocked,
        publicReady: claims.summary.publicReady,
        note: 'Claim Governance یک Gate مستقل است؛ Risk acknowledgement هرگز Claim را Verify نمی‌کند.',
      } : {
        totalClaims: 0,
        verified: 0,
        traceBlocked: 0,
        publicReady: 0,
        note: 'Claim Governance در این Runtime در دسترس نیست و اقدام عمومی باید Fail-closed بماند.',
      },
      assessments,
    };
  }

  public async review(input: Readonly<{
    actorId: UserId;
    action: WorkbenchAction;
    requestId: string;
    expectedLevel: RiskLevel;
    expectedAssessmentHash: string;
    decision: RiskReviewDecision;
    rationale: string;
    humanAttestation: boolean;
    reviewedAt: Date;
  }>): Promise<RiskReviewResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    validateText(input.rationale, 20, 2000, 'Risk review rationale');
    if (!input.humanAttestation) throw new BrandProtectionValidationError('Human attestation is required.');
    const assessment = assessAction(input.action);
    if (assessment.assessmentHash !== input.expectedAssessmentHash || assessment.level !== input.expectedLevel) {
      throw new BrandProtectionConflictError('assessment_changed');
    }
    if (!assessment.reviewableDecisions.includes(input.decision)) {
      throw new BrandProtectionConflictError('invalid_decision');
    }
    const result = await this.repository.review({
      tenantId: this.context.tenantId,
      actorId: input.actorId,
      reviewId: deterministicUuid(`risk-review:${input.requestId}`),
      requestId: input.requestId,
      actionId: input.action.id,
      assessmentHash: assessment.assessmentHash,
      expectedLevel: assessment.level,
      decision: input.decision,
      rationale: input.rationale.trim(),
      reviewedAt: input.reviewedAt,
    });
    return { ...result, persistence: this.repository.persistence };
  }

  public async authorizeAction(actorId: UserId, action: WorkbenchAction): Promise<void> {
    this.assertOwner(actorId);
    const assessment = assessAction(action);
    if (assessment.level === 'green') return;
    if (assessment.level === 'red') throw new BrandProtectionBlockedError('risk_blocked');
    const reviews = await this.repository.latest(this.context.tenantId, actorId);
    const effective = applyReview(assessment, reviews.get(action.id));
    if (effective.gate !== 'allowed_with_acknowledgement') {
      throw new BrandProtectionBlockedError(
        effective.gate === 'blocked' ? 'risk_blocked' : 'risk_review_required',
      );
    }
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.context.ownerUserId) {
      throw new BrandProtectionPermissionError('Only the owner can review brand risk.');
    }
  }
}

export class InMemoryRiskReviewRepository implements RiskReviewRepository {
  public readonly persistence = 'memory' as const;
  readonly #byAction = new Map<string, RiskReviewRecord>();
  readonly #requests = new Map<string, Readonly<{ fingerprint: string; review: RiskReviewRecord }>>();

  public latest(): Promise<ReadonlyMap<string, RiskReviewRecord>> {
    return Promise.resolve(new Map(this.#byAction));
  }

  public review(command: RiskReviewCommand): Promise<Omit<RiskReviewResult, 'persistence'>> {
    const fingerprint = commandFingerprint(command);
    const repeated = this.#requests.get(command.requestId);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) throw new BrandProtectionConflictError('idempotency_mismatch');
      return Promise.resolve({ outcome: 'already_applied', review: repeated.review });
    }
    const review = reviewFromCommand(command);
    this.#byAction.set(command.actionId, review);
    this.#requests.set(command.requestId, { fingerprint, review });
    return Promise.resolve({ outcome: 'applied', review });
  }
}

type RiskReviewRow = Readonly<{
  review_id: string;
  client_ref: string;
  request_sha256: string;
  action_ref: string;
  assessment_sha256: string;
  expected_level: RiskLevel;
  decision: RiskReviewDecision;
  rationale: string;
  reviewed_by: string;
  reviewed_at: Date | string;
}>;

export class PostgresRiskReviewRepository implements RiskReviewRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public latest(tenantId: TenantId, actorId: UserId): Promise<ReadonlyMap<string, RiskReviewRecord>> {
    this.assertContext(tenantId, actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<RiskReviewRow>(
        `SELECT DISTINCT ON (action_ref)
                id::text AS review_id, client_ref, request_sha256, action_ref,
                assessment_sha256, expected_level, decision, rationale,
                reviewed_by::text, reviewed_at
           FROM app.risk_reviews
          WHERE tenant_id = $1 AND owner_user_id = $2
          ORDER BY action_ref, reviewed_at DESC, id DESC`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      return new Map(result.rows.map((row) => [row.action_ref, rowToReview(row)]));
    });
  }

  public review(command: RiskReviewCommand): Promise<Omit<RiskReviewResult, 'persistence'>> {
    this.assertContext(command.tenantId, command.actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${this.context.tenantId}:risk:${command.actionId}`,
      ]);
      const fingerprint = commandFingerprint(command);
      const existing = await transaction.query<RiskReviewRow>(
        `SELECT id::text AS review_id, client_ref, request_sha256, action_ref,
                assessment_sha256, expected_level, decision, rationale,
                reviewed_by::text, reviewed_at
           FROM app.risk_reviews
          WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId],
      );
      const repeated = existing.rows[0];
      if (repeated) {
        if (repeated.request_sha256 !== fingerprint) {
          throw new BrandProtectionConflictError('idempotency_mismatch');
        }
        return { outcome: 'already_applied' as const, review: rowToReview(repeated) };
      }
      await transaction.query(
        `INSERT INTO app.risk_reviews (
           id, tenant_id, owner_user_id, client_ref, request_sha256, action_ref,
           assessment_sha256, policy_version, expected_level, decision, rationale,
           reviewed_by, reviewed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $3, $12)`,
        [
          command.reviewId,
          this.context.tenantId,
          this.context.ownerUserId,
          command.requestId,
          fingerprint,
          command.actionId,
          command.assessmentHash,
          riskPolicyVersion,
          command.expectedLevel,
          command.decision,
          command.rationale,
          command.reviewedAt,
        ],
      );
      const metadata = JSON.stringify({
        requestId: command.requestId,
        assessmentHash: command.assessmentHash,
        expectedLevel: command.expectedLevel,
        decision: command.decision,
        policyVersion: riskPolicyVersion,
      });
      await transaction.query(
        `INSERT INTO app.audit_events (
           tenant_id, actor_user_id, event_type, resource_type, resource_id,
           purpose, decision, metadata, occurred_at
         ) VALUES ($1, $2, 'risk.reviewed', 'action', NULL,
           'strategy_reasoning', $3, $4::jsonb, $5)`,
        [this.context.tenantId, this.context.ownerUserId, command.decision, metadata, command.reviewedAt],
      );
      await transaction.query(
        `INSERT INTO app.outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
         ) VALUES ($1, 'action', $2, 'risk.reviewed', $3::jsonb, $4)`,
        [this.context.tenantId, deterministicUuid(`risk-action:${command.actionId}`), metadata, command.reviewedAt],
      );
      return { outcome: 'applied' as const, review: reviewFromCommand(command) };
    });
  }

  private assertContext(tenantId: TenantId, actorId: UserId): void {
    if (tenantId !== this.context.tenantId || actorId !== this.context.ownerUserId) {
      throw new BrandProtectionPermissionError('Risk repository context mismatch.');
    }
  }
}

export function assessAction(action: WorkbenchAction): ActionRiskAssessment {
  const findings = new Map<RiskDimension, RiskFinding>(
    riskDimensions.map((dimension) => [dimension, greenFinding(dimension)]),
  );
  const set = (dimension: RiskDimension, level: RiskLevel, code: string, rationale: string, mitigation: string) => {
    const current = findings.get(dimension);
    if (!current || levelRank(level) >= levelRank(current.level)) {
      findings.set(dimension, { dimension, level, code, rationale, mitigation });
    }
  };
  const text = [action.title, action.rationale, ...action.risks, ...action.prerequisites].join(' ');
  const publicAction = action.kind === 'content' || action.kind === 'media' || action.kind === 'event';

  if (publicAction) {
    set('public_exposure', 'yellow', 'public_action', 'این اقدام برای مخاطب بیرونی قابل مشاهده و بازتفسیر است.', 'دامنه انتشار و مخاطب را محدود و خروجی نهایی را دوباره بازبینی کنید.');
    set('disclosure', 'yellow', 'disclosure_check', 'منافع، همکاری تجاری یا نقش اشخاص باید پیش از انتشار آشکار شوند.', 'Disclosure لازم را صریح و نزدیک به ادعای مربوط درج کنید.');
    set('long_term_consequences', 'yellow', 'durable_public_record', 'اثر عمومی می‌تواند خارج از زمینه اولیه باقی بماند.', 'سناریوی بازنشر و برداشت پنج‌ساله را پیش از تأیید مرور کنید.');
  }
  if (action.kind === 'private_conversation' || action.kind === 'relationship') {
    set('third_party_privacy', 'yellow', 'third_party_context', 'تعامل با فرد دیگر شامل حریم و زمینه انسانی اوست.', 'فقط اطلاعات لازم را استفاده کنید و از افشای گفت‌وگو بدون رضایت بپرهیزید.');
  }
  if (action.kind === 'research') {
    set('data_access', 'yellow', 'external_source_boundary', 'Research ممکن است داده بیرونی یا متعلق به شخص ثالث را وارد کند.', 'منبع، مجوز استفاده و داده حساس را قبل از Import بررسی کنید.');
  }
  if (publicAction && action.evidenceState !== 'grounded') {
    set('consent', 'red', 'missing_evidence_consent', 'اقدام عمومی بدون Evidence مجاز و رضایت قابل‌ردیابی پیشنهاد شده است.', 'ابتدا Evidence را با Purpose و Consent روشن ثبت کنید.');
    set('authenticity', 'red', 'ungrounded_public_action', 'بدون Evidence، اصالت و نسبت‌دادن تجربه قابل اثبات نیست.', 'اقدام را متوقف و منبع واقعی را متصل کنید.');
  }
  if (action.riskLevel === 'high') {
    set('reputation_risk', 'red', 'high_reputation_risk', 'Risk پایه اقدام در سطح High است و Utility اجازه Override آن را ندارد.', 'اقدام را Hold و برای بررسی انسانی/حقوقی Escalate کنید.');
  } else if (action.riskLevel === 'medium') {
    set('reputation_risk', 'yellow', 'material_reputation_risk', 'ریسک اعتباری اقدام مادی است و نیاز به پذیرش آگاهانه دارد.', 'Rationale و پیامد احتمالی را پیش از تأیید ثبت کنید.');
  }
  if (/برداشت|ابهام|misinterpret|out of context/iu.test(text)) {
    set('misinterpretation', 'yellow', 'misinterpretation_signal', 'شرح اقدام احتمال برداشت نادرست را نشان می‌دهد.', 'زمینه، محدودیت و منظور اصلی را در خروجی روشن کنید.');
  }
  if (/داده حساس|محرمانه|private|confidential|شماره تماس|آدرس/iu.test(text)) {
    set('sensitive_data', 'red', 'sensitive_data_signal', 'اقدام احتمال استفاده از داده حساس یا محرمانه دارد.', 'داده را حذف/ناشناس‌سازی و مجوز دسترسی را جداگانه اثبات کنید.');
  }
  if (/تهمت|افترا|اتهام|defam|allegation|accus/iu.test(text)) {
    set('defamation', 'red', 'defamation_signal', 'محتوا می‌تواند به‌عنوان اتهام یا افترا علیه شخص ثالث فهمیده شود.', 'انتشار را متوقف و بررسی حقوقی و شواهد مستقل انجام دهید.');
  }
  if (/دستکاری|فریب|manipulat|deceiv/iu.test(text)) {
    set('manipulation', 'red', 'manipulation_signal', 'روش اقدام می‌تواند متکی بر فریب یا دستکاری مخاطب باشد.', 'هدف و روش را به تعامل شفاف و غیرتحمیلی بازطراحی کنید.');
  }
  if (/تعارض منافع|اسپانسر|هدیه|conflict of interest|sponsor/iu.test(text)) {
    set('conflict_of_interest', 'yellow', 'conflict_signal', 'احتمال تعارض منافع یا رابطه مادی وجود دارد.', 'رابطه و منفعت مرتبط را پیش از اقدام Disclosure کنید.');
  }
  if (/رمز|گذرواژه|توکن|secret|password|api.?key/iu.test(text)) {
    set('security', 'red', 'secret_exposure_signal', 'شرح اقدام نشانه‌ای از Secret یا credential دارد.', 'Secret را حذف و در صورت افشا فوراً Rotate کنید.');
  }
  if (/اغراق|exaggerat/iu.test(text)) {
    set('authenticity', 'yellow', 'exaggeration_signal', 'شرح اقدام احتمال اغراق یا برداشت بزرگ‌نمایانه را نشان می‌دهد.', 'ادعا را با Trace، محدودیت و زبان دقیق بازنویسی کنید.');
  }
  if (/ساختگی|جعلی|fake|fabricat/iu.test(text)) {
    set('authenticity', 'red', 'fabrication_signal', 'شرح اقدام احتمال جعل هویتی یا تجربه ساختگی را نشان می‌دهد.', 'ادعا را حذف یا فقط با Trace و تأیید انسانی بازنویسی کنید.');
  }

  const ordered = riskDimensions.map((dimension) => findings.get(dimension) ?? greenFinding(dimension));
  const level = ordered.reduce<RiskLevel>((highest, item) =>
    levelRank(item.level) > levelRank(highest) ? item.level : highest, 'green');
  const assessmentHash = createHash('sha256').update(JSON.stringify({
    policyVersion: riskPolicyVersion,
    action: {
      id: action.id,
      kind: action.kind,
      title: action.title,
      rationale: action.rationale,
      risks: action.risks,
      prerequisites: action.prerequisites,
      evidenceIds: action.evidenceIds,
      evidenceState: action.evidenceState,
      riskLevel: action.riskLevel,
    },
    findings: ordered,
  })).digest('hex');
  return {
    actionId: action.id,
    actionTitle: action.title,
    actionKind: action.kind,
    policyVersion: riskPolicyVersion,
    assessmentHash,
    level,
    gate: level === 'green' ? 'allowed' : level === 'yellow' ? 'review_required' : 'blocked',
    rationale: overallRationale(level, ordered),
    findings: ordered,
    reviewableDecisions: level === 'yellow' ? ['acknowledge', 'hold', 'escalate'] : level === 'red' ? ['hold', 'escalate'] : [],
  };
}

function applyReview(
  assessment: ActionRiskAssessment,
  review: RiskReviewRecord | undefined,
): ActionRiskAssessment {
  if (!review || review.assessmentHash !== assessment.assessmentHash || review.expectedLevel !== assessment.level) {
    return assessment;
  }
  const gate: RiskGate = review.decision === 'acknowledge' && assessment.level === 'yellow'
    ? 'allowed_with_acknowledgement'
    : 'blocked';
  return { ...assessment, gate, lastReview: review };
}

function greenFinding(dimension: RiskDimension): RiskFinding {
  return {
    dimension,
    level: 'green',
    code: 'no_material_signal',
    rationale: 'در داده فعلی نشانه مادی برای این بُعد دیده نشد؛ این نتیجه جایگزین بررسی انسانی نیست.',
    mitigation: 'در صورت تغییر Context، ارزیابی را دوباره اجرا کنید.',
  };
}

function overallRationale(level: RiskLevel, findings: readonly RiskFinding[]): string {
  const material = findings.filter((finding) => finding.level !== 'green');
  if (level === 'green') return 'هیچ Signal مادی در قواعد فعلی پیدا نشد؛ اقدام در محدوده فعلی مجاز است.';
  const dimensions = material.map((finding) => finding.dimension).join('، ');
  return level === 'red'
    ? `حداقل یک مانع Red در ${dimensions} وجود دارد؛ Strategy یا Engagement نمی‌تواند آن را Override کند.`
    : `ریسک‌های مادی در ${dimensions} وجود دارد و پذیرش آگاهانه مالک پیش از اقدام لازم است.`;
}

function reviewFromCommand(command: RiskReviewCommand): RiskReviewRecord {
  return {
    reviewId: command.reviewId,
    requestId: command.requestId,
    actionId: command.actionId,
    assessmentHash: command.assessmentHash,
    expectedLevel: command.expectedLevel,
    decision: command.decision,
    rationale: command.rationale,
    reviewedBy: command.actorId,
    reviewedAt: command.reviewedAt,
  };
}

function rowToReview(row: RiskReviewRow): RiskReviewRecord {
  return {
    reviewId: row.review_id,
    requestId: row.client_ref,
    actionId: row.action_ref,
    assessmentHash: row.assessment_sha256,
    expectedLevel: row.expected_level,
    decision: row.decision,
    rationale: row.rationale,
    reviewedBy: row.reviewed_by as UserId,
    reviewedAt: toDate(row.reviewed_at),
  };
}

function commandFingerprint(command: RiskReviewCommand): string {
  return createHash('sha256').update(JSON.stringify({
    tenantId: command.tenantId,
    actorId: command.actorId,
    requestId: command.requestId,
    actionId: command.actionId,
    assessmentHash: command.assessmentHash,
    expectedLevel: command.expectedLevel,
    decision: command.decision,
    rationale: command.rationale,
  })).digest('hex');
}

function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hash[12] = '4';
  hash[16] = '8';
  const value = hash.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new BrandProtectionValidationError('Risk review request id is invalid.');
  }
}

function validateText(value: string, min: number, max: number, label: string): void {
  const length = value.trim().length;
  if (length < min || length > max) throw new BrandProtectionValidationError(`${label} is invalid.`);
}

function levelRank(level: RiskLevel): number {
  return level === 'green' ? 0 : level === 'yellow' ? 1 : 2;
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Stored risk review date is invalid.');
  return date;
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}
