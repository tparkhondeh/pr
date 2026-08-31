import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';
import type { DataClass, Purpose } from '../kernel/policy.js';
import type { ResearchSourceSnapshot, ResearchWorkspaceService } from '../research/workspace.js';
import type { ClaimKind, ClaimStatus } from './claim-registry.js';
import type { ContentDraftService } from './workspace.js';

export type ClaimTraceCategory =
  | 'company'
  | 'revenue'
  | 'experience'
  | 'education'
  | 'numeric'
  | 'award'
  | 'third_party'
  | 'research'
  | 'general';

export type ClaimTraceStatus =
  | 'complete'
  | 'incomplete'
  | 'stale'
  | 'unverified_source'
  | 'contradicted'
  | 'conflicted';

export type ClaimReviewDecision = 'verify' | 'dispute' | 'revoke';

export type ClaimResearchTrace = Readonly<{
  sourceId: string;
  title: string;
  publisher: string;
  url: string;
  quality: ResearchSourceSnapshot['quality'];
  stance: ResearchSourceSnapshot['stance'];
  publishedAt: Date;
  accessedAt: Date;
  maxAgeDays: number;
}>;

export type ClaimGovernanceRecord = Readonly<{
  claimId: string;
  statement: string;
  kind: ClaimKind;
  status: ClaimStatus;
  dataClass: DataClass;
  evidenceIds: readonly string[];
  sourceRefs: readonly string[];
  allowedPurposes: readonly Purpose[];
  allowedChannels: readonly string[];
  validFrom: Date;
  validUntil?: Date;
  createdAt: Date;
  createdBy: UserId;
  verifiedAt?: Date;
  verifiedBy?: UserId;
  disputedAt?: Date;
  disputeReason?: string;
  revokedAt?: Date;
  revocationReason?: string;
  research?: ClaimResearchTrace;
  lastReview?: ClaimReviewRecord;
}>;

export type ClaimReviewRecord = Readonly<{
  reviewId: string;
  requestId: string;
  claimId: string;
  decision: ClaimReviewDecision;
  previousStatus: ClaimStatus;
  resultingStatus: ClaimStatus;
  rationale: string;
  traceSnapshot: Readonly<Record<string, unknown>>;
  reviewedBy: UserId;
  reviewedAt: Date;
}>;

export type GovernedClaimSnapshot = ClaimGovernanceRecord & Readonly<{
  categories: readonly ClaimTraceCategory[];
  traceStatus: ClaimTraceStatus;
  traceRationale: string;
  riskLevel: 'green' | 'yellow' | 'red';
  canUsePublicly: boolean;
  reviewableDecisions: readonly ClaimReviewDecision[];
}>;

export type ClaimGovernanceSnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres';
  summary: Readonly<{
    totalClaims: number;
    verified: number;
    proposed: number;
    disputedOrRevoked: number;
    traceBlocked: number;
    publicReady: number;
  }>;
  claims: readonly GovernedClaimSnapshot[];
}>;

export type ClaimReviewCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  reviewId: string;
  claimId: string;
  expectedStatus: ClaimStatus;
  decision: ClaimReviewDecision;
  resultingStatus: ClaimStatus;
  rationale: string;
  traceSnapshot: Readonly<Record<string, unknown>>;
  reviewedAt: Date;
}>;

export type ClaimReviewResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  review: ClaimReviewRecord;
  persistence: 'memory' | 'postgres';
}>;

export interface ClaimGovernanceRepository {
  readonly persistence: 'memory' | 'postgres';
  list(
    tenantId: TenantId,
    actorId: UserId,
    seeds: readonly ClaimGovernanceRecord[],
  ): Promise<readonly ClaimGovernanceRecord[]>;
  review(command: ClaimReviewCommand): Promise<Omit<ClaimReviewResult, 'persistence'>>;
  effectiveStatus(
    tenantId: TenantId,
    actorId: UserId,
    claimId: string,
    fallback: ClaimStatus,
  ): Promise<ClaimStatus>;
}

export class ClaimGovernanceValidationError extends Error {}
export class ClaimGovernancePermissionError extends Error {}
export class ClaimGovernanceNotFoundError extends Error {}
export class ClaimGovernanceBlockedError extends Error {
  public constructor(public readonly reason: 'trace_incomplete' | 'attestation_required' | 'invalid_transition') {
    super(`Claim review blocked: ${reason}`);
  }
}
export class ClaimGovernanceConflictError extends Error {
  public constructor(public readonly reason: 'status_changed' | 'idempotency_mismatch') {
    super(`Claim review conflict: ${reason}`);
  }
}

export class ClaimGovernanceService {
  public constructor(
    private readonly repository: ClaimGovernanceRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
    private readonly dependencies: Readonly<{
      drafts: Pick<ContentDraftService, 'snapshot'>;
      research: Pick<ResearchWorkspaceService, 'snapshot'>;
    }>,
  ) {}

  public async snapshot(actorId: UserId, at: Date): Promise<ClaimGovernanceSnapshot> {
    this.assertOwner(actorId);
    const seeds = await this.seeds(actorId, at);
    const records = await this.repository.list(this.identity.tenantId, actorId, seeds);
    const conflicts = conflictingResearchStatements(records);
    const claims = records
      .map((record) => governClaim(record, at, conflicts))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return {
      generatedAt: at,
      persistence: this.repository.persistence,
      summary: {
        totalClaims: claims.length,
        verified: claims.filter((claim) => claim.status === 'verified').length,
        proposed: claims.filter((claim) => claim.status === 'proposed').length,
        disputedOrRevoked: claims.filter((claim) => claim.status === 'disputed' || claim.status === 'revoked').length,
        traceBlocked: claims.filter((claim) => claim.traceStatus !== 'complete').length,
        publicReady: claims.filter((claim) => claim.canUsePublicly).length,
      },
      claims,
    };
  }

  public async review(input: Readonly<{
    actorId: UserId;
    requestId: string;
    claimId: string;
    expectedStatus: ClaimStatus;
    decision: ClaimReviewDecision;
    rationale: string;
    humanAttestation: boolean;
    reviewedAt: Date;
  }>): Promise<ClaimReviewResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    validateUuid(input.claimId, 'Claim');
    validateText(input.rationale, 20, 2_000, 'Review rationale');
    if (!claimStatuses.includes(input.expectedStatus)) throw new ClaimGovernanceValidationError('Expected claim status is invalid.');
    if (!reviewDecisions.includes(input.decision)) throw new ClaimGovernanceValidationError('Claim review decision is invalid.');
    const snapshot = await this.snapshot(input.actorId, input.reviewedAt);
    const claim = snapshot.claims.find((candidate) => candidate.claimId === input.claimId);
    if (!claim) throw new ClaimGovernanceNotFoundError('Claim does not exist.');
    const resultingStatus = transitionStatus(input.expectedStatus, input.decision);
    if (input.decision === 'verify') {
      if (!input.humanAttestation) throw new ClaimGovernanceBlockedError('attestation_required');
      if (claim.traceStatus !== 'complete') throw new ClaimGovernanceBlockedError('trace_incomplete');
      if (claim.kind !== 'personal_fact' && claim.kind !== 'external_fact') {
        throw new ClaimGovernanceBlockedError('invalid_transition');
      }
    }
    const traceSnapshot = {
      categories: claim.categories,
      traceStatus: claim.traceStatus,
      traceRationale: claim.traceRationale,
      evidenceIds: claim.evidenceIds,
      sourceRefs: claim.sourceRefs,
      research: claim.research ? {
        sourceId: claim.research.sourceId,
        quality: claim.research.quality,
        stance: claim.research.stance,
        publishedAt: claim.research.publishedAt.toISOString(),
        accessedAt: claim.research.accessedAt.toISOString(),
        maxAgeDays: claim.research.maxAgeDays,
      } : null,
      humanAttestation: input.humanAttestation,
    };
    const result = await this.repository.review({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      reviewId: deterministicUuid(`claim-review:${this.identity.tenantId}:${input.requestId}`),
      claimId: input.claimId,
      expectedStatus: input.expectedStatus,
      decision: input.decision,
      resultingStatus,
      rationale: input.rationale.trim(),
      traceSnapshot,
      reviewedAt: input.reviewedAt,
    });
    return { ...result, persistence: this.repository.persistence };
  }

  private async seeds(actorId: UserId, at: Date): Promise<readonly ClaimGovernanceRecord[]> {
    const [draft, research] = await Promise.all([
      this.dependencies.drafts.snapshot(actorId, at),
      this.dependencies.research.snapshot(actorId, at),
    ]);
    const records: ClaimGovernanceRecord[] = research.sources.map((source) => ({
      claimId: source.claimId,
      statement: source.statement,
      kind: 'external_fact',
      status: 'proposed',
      dataClass: 'public',
      evidenceIds: [source.evidenceId],
      sourceRefs: [source.url],
      allowedPurposes: ['external_research'],
      allowedChannels: [],
      validFrom: source.publishedAt,
      createdAt: source.accessedAt,
      createdBy: actorId,
      research: researchTrace(source),
    }));
    if (draft) {
      records.push({
        claimId: draft.claimId,
        statement: draft.source.statement,
        kind: 'personal_fact',
        status: 'verified',
        dataClass: 'confidential',
        evidenceIds: draft.source.evidenceIds,
        sourceRefs: [],
        allowedPurposes: ['public_drafting'],
        allowedChannels: [draft.channel],
        validFrom: draft.updatedAt,
        createdAt: draft.updatedAt,
        createdBy: actorId,
        verifiedAt: draft.updatedAt,
        verifiedBy: actorId,
      });
    }
    return records;
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) throw new ClaimGovernancePermissionError('Only the owner can review claims.');
  }
}

type MemoryRequest = Readonly<{ fingerprint: string; review: ClaimReviewRecord }>;

export class InMemoryClaimGovernanceRepository implements ClaimGovernanceRepository {
  public readonly persistence = 'memory' as const;
  readonly #known = new Map<string, ClaimGovernanceRecord>();
  readonly #reviews = new Map<string, ClaimReviewRecord>();
  readonly #requests = new Map<string, MemoryRequest>();

  public list(
    tenantId: TenantId,
    actorId: UserId,
    seeds: readonly ClaimGovernanceRecord[],
  ): Promise<readonly ClaimGovernanceRecord[]> {
    for (const seed of seeds) {
      const key = memoryClaimKey(tenantId, actorId, seed.claimId);
      const review = this.#reviews.get(key);
      const record = review ? applyReview(seed, review) : seed;
      this.#known.set(key, record);
    }
    return Promise.resolve(
      [...this.#known.entries()]
        .filter(([key]) => key.startsWith(`${tenantId}:${actorId}:`))
        .map(([, record]) => record),
    );
  }

  public review(command: ClaimReviewCommand): Promise<Omit<ClaimReviewResult, 'persistence'>> {
    const requestKey = `${command.tenantId}:${command.actorId}:${command.requestId}`;
    const fingerprint = commandFingerprint(command);
    const existingRequest = this.#requests.get(requestKey);
    if (existingRequest) {
      if (existingRequest.fingerprint !== fingerprint) throw new ClaimGovernanceConflictError('idempotency_mismatch');
      return Promise.resolve({ outcome: 'already_applied', review: existingRequest.review });
    }
    const claimKey = memoryClaimKey(command.tenantId, command.actorId, command.claimId);
    const claim = this.#known.get(claimKey);
    if (!claim) throw new ClaimGovernanceNotFoundError('Claim does not exist.');
    if (claim.status !== command.expectedStatus) throw new ClaimGovernanceConflictError('status_changed');
    const review = reviewFromCommand(command);
    this.#reviews.set(claimKey, review);
    this.#known.set(claimKey, applyReview(claim, review));
    this.#requests.set(requestKey, { fingerprint, review });
    return Promise.resolve({ outcome: 'applied', review });
  }

  public effectiveStatus(
    tenantId: TenantId,
    actorId: UserId,
    claimId: string,
    fallback: ClaimStatus,
  ): Promise<ClaimStatus> {
    return Promise.resolve(this.#known.get(memoryClaimKey(tenantId, actorId, claimId))?.status ?? fallback);
  }
}

type ClaimRow = Readonly<{
  claim_id: string;
  statement: string;
  kind: ClaimKind;
  status: ClaimStatus;
  data_class: DataClass;
  evidence_ids: unknown;
  source_refs: unknown;
  allowed_purposes: unknown;
  allowed_channels: unknown;
  valid_from: Date | string;
  valid_until: Date | string | null;
  created_at: Date | string;
  created_by: string;
  verified_at: Date | string | null;
  verified_by: string | null;
  disputed_at: Date | string | null;
  dispute_reason: string | null;
  revoked_at: Date | string | null;
  revocation_reason: string | null;
  research_source_id: string | null;
  research_title: string | null;
  research_publisher: string | null;
  research_url: string | null;
  research_quality: ClaimResearchTrace['quality'] | null;
  research_stance: ClaimResearchTrace['stance'] | null;
  research_published_at: Date | string | null;
  research_accessed_at: Date | string | null;
  research_max_age_days: string | number | null;
  review_id: string | null;
  review_client_ref: string | null;
  review_decision: ClaimReviewDecision | null;
  review_previous_status: ClaimStatus | null;
  review_resulting_status: ClaimStatus | null;
  review_rationale: string | null;
  review_trace_snapshot: unknown;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
}>;

type ReviewRow = Readonly<{
  review_id: string;
  client_ref: string;
  request_sha256: string;
  claim_id: string;
  decision: ClaimReviewDecision;
  previous_status: ClaimStatus;
  resulting_status: ClaimStatus;
  rationale: string;
  trace_snapshot: unknown;
  reviewed_by: string;
  reviewed_at: Date | string;
}>;

export class PostgresClaimGovernanceRepository implements ClaimGovernanceRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public list(
    tenantId: TenantId,
    actorId: UserId,
    seeds: readonly ClaimGovernanceRecord[],
  ): Promise<readonly ClaimGovernanceRecord[]> {
    void seeds;
    this.assertContext(tenantId, actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<ClaimRow>(claimListSql(), [
        this.context.tenantId,
        this.context.ownerUserId,
      ]);
      return result.rows.map(rowToClaim);
    });
  }

  public review(command: ClaimReviewCommand): Promise<Omit<ClaimReviewResult, 'persistence'>> {
    this.assertContext(command.tenantId, command.actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${this.context.tenantId}:${this.context.ownerUserId}:${command.requestId}`,
      ]);
      const fingerprint = commandFingerprint(command);
      const existing = await transaction.query<ReviewRow>(reviewSelectSql(), [
        this.context.tenantId,
        this.context.ownerUserId,
        command.requestId,
      ]);
      const existingRow = existing.rows[0];
      if (existingRow) {
        if (existingRow.request_sha256 !== fingerprint) throw new ClaimGovernanceConflictError('idempotency_mismatch');
        return { outcome: 'already_applied', review: rowToReview(existingRow) };
      }
      const locked = await transaction.query<{ status: ClaimStatus }>(
        `SELECT status FROM app.claims
          WHERE tenant_id = $1 AND created_by = $2 AND id = $3
          FOR UPDATE`,
        [this.context.tenantId, this.context.ownerUserId, command.claimId],
      );
      const claim = locked.rows[0];
      if (!claim) throw new ClaimGovernanceNotFoundError('Claim does not exist.');
      if (claim.status !== command.expectedStatus) throw new ClaimGovernanceConflictError('status_changed');
      await updateClaimStatus(transaction, this.context, command);
      await transaction.query(
        `INSERT INTO app.claim_reviews (
           id, tenant_id, owner_user_id, client_ref, request_sha256, claim_id,
           decision, previous_status, resulting_status, rationale, trace_snapshot,
           reviewed_by, reviewed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $3, $12)`,
        [
          command.reviewId, this.context.tenantId, this.context.ownerUserId, command.requestId,
          fingerprint, command.claimId, command.decision, command.expectedStatus,
          command.resultingStatus, command.rationale, JSON.stringify(command.traceSnapshot),
          command.reviewedAt,
        ],
      );
      await appendClaimReviewEvents(transaction, this.context, command);
      return { outcome: 'applied', review: reviewFromCommand(command) };
    });
  }

  public effectiveStatus(
    tenantId: TenantId,
    actorId: UserId,
    claimId: string,
    fallback: ClaimStatus,
  ): Promise<ClaimStatus> {
    this.assertContext(tenantId, actorId);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<{ status: ClaimStatus }>(
        `SELECT status FROM app.claims WHERE tenant_id = $1 AND created_by = $2 AND id = $3`,
        [this.context.tenantId, this.context.ownerUserId, claimId],
      );
      return result.rows[0]?.status ?? fallback;
    });
  }

  private assertContext(tenantId: TenantId, actorId: UserId): void {
    if (tenantId !== this.context.tenantId || actorId !== this.context.ownerUserId) {
      throw new ClaimGovernancePermissionError('Claim repository context mismatch.');
    }
  }
}

function governClaim(
  record: ClaimGovernanceRecord,
  at: Date,
  conflictKeys: ReadonlySet<string>,
): GovernedClaimSnapshot {
  const categories = classifyClaim(record.statement);
  const [traceStatus, traceRationale] = traceAssessment(record, at, conflictKeys);
  const effectiveStatus = record.status !== 'revoked' && record.status !== 'disputed' &&
    record.validUntil && record.validUntil <= at ? 'expired' : record.status;
  const canUsePublicly = effectiveStatus === 'verified' && traceStatus === 'complete' &&
    record.allowedPurposes.includes('public_drafting') && record.allowedChannels.length > 0;
  const reviewableDecisions = decisionsFor(effectiveStatus, traceStatus, record.kind);
  const riskLevel = effectiveStatus !== 'verified' || traceStatus !== 'complete'
    ? 'red'
    : categories.some((category) => category !== 'general')
      ? 'yellow'
      : 'green';
  return {
    ...record,
    status: effectiveStatus,
    categories,
    traceStatus,
    traceRationale,
    riskLevel,
    canUsePublicly,
    reviewableDecisions,
  };
}

function traceAssessment(
  claim: ClaimGovernanceRecord,
  at: Date,
  conflictKeys: ReadonlySet<string>,
): readonly [ClaimTraceStatus, string] {
  if (claim.evidenceIds.length === 0) return ['incomplete', 'هیچ Evidence قابل‌ردیابی به ادعا متصل نیست.'];
  if (claim.kind === 'external_fact' && claim.sourceRefs.length === 0) {
    return ['incomplete', 'External Fact بدون Source Reference است.'];
  }
  if (!claim.research) return ['complete', 'Evidence داخلی و Provenance ادعا موجود است.'];
  const key = normalizeStatement(claim.statement);
  if (conflictKeys.has(key)) return ['conflicted', 'برای Statement یکسان، منبع حامی و ناقض هم‌زمان وجود دارد.'];
  if (claim.research.stance === 'contradicts') return ['contradicted', 'این Source ادعا را نقض می‌کند و نمی‌تواند مبنای Verify باشد.'];
  if (claim.research.quality === 'unverified') return ['unverified_source', 'کیفیت Source هنوز تأیید نشده است.'];
  const ageDays = Math.max(0, Math.floor((at.getTime() - claim.research.publishedAt.getTime()) / 86_400_000));
  if (ageDays > claim.research.maxAgeDays) return ['stale', 'Source از پنجره تازگی تعریف‌شده عبور کرده است.'];
  return ['complete', 'Source، Citation، Evidence و Freshness برای بازبینی انسانی حاضرند.'];
}

function classifyClaim(statement: string): readonly ClaimTraceCategory[] {
  const rules: readonly [ClaimTraceCategory, RegExp][] = [
    ['company', /شرکت|کسب.?و.?کار|استارتاپ|business|company/iu],
    ['revenue', /درآمد|فروش|سود|گردش مالی|revenue|sales|profit/iu],
    ['experience', /سابقه|سال تجربه|تجربه کاری|experience|worked/iu],
    ['education', /تحصیل|مدرک|دانشگاه|دانشکده|degree|university|education/iu],
    ['numeric', /[0-9۰-۹]|درصد|٪|percent/iu],
    ['award', /جایزه|رتبه|برنده|افتخار|award|winner/iu],
    ['third_party', /او|ایشان|آنها|مشتری|همکار|مدیر|he|she|they|client/iu],
    ['research', /تحقیق|پژوهش|مطالعه|گزارش|research|study|report/iu],
  ];
  const matches = rules.filter(([, expression]) => expression.test(statement)).map(([category]) => category);
  return matches.length > 0 ? matches : ['general'];
}

function decisionsFor(
  status: ClaimStatus,
  traceStatus: ClaimTraceStatus,
  kind: ClaimKind,
): readonly ClaimReviewDecision[] {
  if (status === 'proposed') {
    const canVerify = traceStatus === 'complete' && (kind === 'personal_fact' || kind === 'external_fact');
    return canVerify ? ['verify', 'dispute', 'revoke'] : ['dispute', 'revoke'];
  }
  if (status === 'verified') return ['dispute', 'revoke'];
  if (status === 'disputed') return ['revoke'];
  return [];
}

function transitionStatus(status: ClaimStatus, decision: ClaimReviewDecision): ClaimStatus {
  if (decision === 'verify' && status === 'proposed') return 'verified';
  if (decision === 'dispute' && (status === 'proposed' || status === 'verified')) return 'disputed';
  if (decision === 'revoke' && (status === 'proposed' || status === 'verified' || status === 'disputed')) return 'revoked';
  throw new ClaimGovernanceBlockedError('invalid_transition');
}

function conflictingResearchStatements(records: readonly ClaimGovernanceRecord[]): ReadonlySet<string> {
  const values = new Map<string, Set<ClaimResearchTrace['stance']>>();
  for (const record of records) {
    if (!record.research) continue;
    const key = normalizeStatement(record.statement);
    const stances = values.get(key) ?? new Set<ClaimResearchTrace['stance']>();
    stances.add(record.research.stance);
    values.set(key, stances);
  }
  return new Set([...values.entries()].filter(([, stances]) => stances.size > 1).map(([key]) => key));
}

function researchTrace(source: ResearchSourceSnapshot): ClaimResearchTrace {
  return {
    sourceId: source.sourceId,
    title: source.title,
    publisher: source.publisher,
    url: source.url,
    quality: source.quality,
    stance: source.stance,
    publishedAt: source.publishedAt,
    accessedAt: source.accessedAt,
    maxAgeDays: source.maxAgeDays,
  };
}

function applyReview(claim: ClaimGovernanceRecord, review: ClaimReviewRecord): ClaimGovernanceRecord {
  return {
    ...claim,
    status: review.resultingStatus,
    lastReview: review,
    ...(review.decision === 'verify' ? { verifiedAt: review.reviewedAt, verifiedBy: review.reviewedBy } : {}),
    ...(review.decision === 'dispute' ? { disputedAt: review.reviewedAt, disputeReason: review.rationale } : {}),
    ...(review.decision === 'revoke' ? { revokedAt: review.reviewedAt, revocationReason: review.rationale } : {}),
  };
}

function reviewFromCommand(command: ClaimReviewCommand): ClaimReviewRecord {
  return {
    reviewId: command.reviewId,
    requestId: command.requestId,
    claimId: command.claimId,
    decision: command.decision,
    previousStatus: command.expectedStatus,
    resultingStatus: command.resultingStatus,
    rationale: command.rationale,
    traceSnapshot: command.traceSnapshot,
    reviewedBy: command.actorId,
    reviewedAt: command.reviewedAt,
  };
}

function claimListSql(): string {
  return `SELECT claim.id::text AS claim_id, claim.statement, claim.kind, claim.status,
                 claim.data_class, evidence.evidence_ids, claim.source_refs,
                 claim.allowed_purposes, claim.allowed_channels, claim.valid_from,
                 claim.valid_until, claim.created_at, claim.created_by::text,
                 claim.verified_at, claim.verified_by::text, claim.disputed_at,
                 claim.dispute_reason, claim.revoked_at, claim.revocation_reason,
                 research.id::text AS research_source_id, research.title AS research_title,
                 research.publisher AS research_publisher, research.source_url AS research_url,
                 research.quality AS research_quality, research.stance AS research_stance,
                 research.published_at AS research_published_at,
                 research.accessed_at AS research_accessed_at,
                 research.max_age_days AS research_max_age_days,
                 latest.id::text AS review_id, latest.client_ref AS review_client_ref,
                 latest.decision AS review_decision, latest.previous_status AS review_previous_status,
                 latest.resulting_status AS review_resulting_status,
                 latest.rationale AS review_rationale, latest.trace_snapshot AS review_trace_snapshot,
                 latest.reviewed_by::text, latest.reviewed_at
            FROM app.claims claim
            LEFT JOIN LATERAL (
              SELECT COALESCE(jsonb_agg(link.evidence_id::text ORDER BY link.evidence_id::text), '[]'::jsonb) AS evidence_ids
                FROM app.claim_evidence link
               WHERE link.tenant_id = claim.tenant_id AND link.claim_id = claim.id
            ) evidence ON true
            LEFT JOIN app.research_sources research
              ON research.tenant_id = claim.tenant_id AND research.claim_id = claim.id
            LEFT JOIN LATERAL (
              SELECT review.* FROM app.claim_reviews review
               WHERE review.tenant_id = claim.tenant_id AND review.claim_id = claim.id
               ORDER BY review.reviewed_at DESC, review.id DESC LIMIT 1
            ) latest ON true
           WHERE claim.tenant_id = $1 AND claim.created_by = $2
           ORDER BY claim.created_at DESC`;
}

function reviewSelectSql(): string {
  return `SELECT id::text AS review_id, client_ref, request_sha256, claim_id::text,
                 decision, previous_status, resulting_status, rationale, trace_snapshot,
                 reviewed_by::text, reviewed_at
            FROM app.claim_reviews
           WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`;
}

function rowToClaim(row: ClaimRow): ClaimGovernanceRecord {
  const research = researchFromRow(row);
  const lastReview = reviewFromClaimRow(row);
  const record: ClaimGovernanceRecord = {
    claimId: row.claim_id,
    statement: row.statement,
    kind: row.kind,
    status: row.status,
    dataClass: row.data_class,
    evidenceIds: stringArray(row.evidence_ids, 'Claim evidence IDs'),
    sourceRefs: stringArray(row.source_refs, 'Claim source references'),
    allowedPurposes: stringArray(row.allowed_purposes, 'Claim purposes') as Purpose[],
    allowedChannels: stringArray(row.allowed_channels, 'Claim channels'),
    validFrom: toDate(row.valid_from, 'Claim valid from'),
    ...(row.valid_until ? { validUntil: toDate(row.valid_until, 'Claim valid until') } : {}),
    createdAt: toDate(row.created_at, 'Claim created'),
    createdBy: row.created_by as UserId,
    ...(row.verified_at && row.verified_by ? {
      verifiedAt: toDate(row.verified_at, 'Claim verification'), verifiedBy: row.verified_by as UserId,
    } : {}),
    ...(row.disputed_at && row.dispute_reason ? {
      disputedAt: toDate(row.disputed_at, 'Claim dispute'), disputeReason: row.dispute_reason,
    } : {}),
    ...(row.revoked_at && row.revocation_reason ? {
      revokedAt: toDate(row.revoked_at, 'Claim revocation'), revocationReason: row.revocation_reason,
    } : {}),
    ...(research ? { research } : {}),
    ...(lastReview ? { lastReview } : {}),
  };
  return record;
}

function researchFromRow(row: ClaimRow): ClaimResearchTrace | undefined {
  if (!row.research_source_id || !row.research_title || !row.research_publisher || !row.research_url ||
      !row.research_quality || !row.research_stance || !row.research_published_at ||
      !row.research_accessed_at || row.research_max_age_days === null) return undefined;
  const maxAgeDays = Number(row.research_max_age_days);
  if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 1) throw new Error('Stored research max age is invalid.');
  return {
    sourceId: row.research_source_id,
    title: row.research_title,
    publisher: row.research_publisher,
    url: row.research_url,
    quality: row.research_quality,
    stance: row.research_stance,
    publishedAt: toDate(row.research_published_at, 'Research published'),
    accessedAt: toDate(row.research_accessed_at, 'Research accessed'),
    maxAgeDays,
  };
}

function reviewFromClaimRow(row: ClaimRow): ClaimReviewRecord | undefined {
  if (!row.review_id || !row.review_client_ref || !row.review_decision ||
      !row.review_previous_status || !row.review_resulting_status || !row.review_rationale ||
      !row.reviewed_by || !row.reviewed_at) return undefined;
  return {
    reviewId: row.review_id,
    requestId: row.review_client_ref,
    claimId: row.claim_id,
    decision: row.review_decision,
    previousStatus: row.review_previous_status,
    resultingStatus: row.review_resulting_status,
    rationale: row.review_rationale,
    traceSnapshot: objectValue(row.review_trace_snapshot, 'Claim review trace'),
    reviewedBy: row.reviewed_by as UserId,
    reviewedAt: toDate(row.reviewed_at, 'Claim reviewed'),
  };
}

function rowToReview(row: ReviewRow): ClaimReviewRecord {
  return {
    reviewId: row.review_id,
    requestId: row.client_ref,
    claimId: row.claim_id,
    decision: row.decision,
    previousStatus: row.previous_status,
    resultingStatus: row.resulting_status,
    rationale: row.rationale,
    traceSnapshot: objectValue(row.trace_snapshot, 'Claim review trace'),
    reviewedBy: row.reviewed_by as UserId,
    reviewedAt: toDate(row.reviewed_at, 'Claim reviewed'),
  };
}

async function updateClaimStatus(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  command: ClaimReviewCommand,
): Promise<void> {
  if (command.decision === 'verify') {
    await transaction.query(
      `UPDATE app.claims SET status = 'verified', verified_at = $4, verified_by = $2
        WHERE tenant_id = $1 AND created_by = $2 AND id = $3`,
      [context.tenantId, context.ownerUserId, command.claimId, command.reviewedAt],
    );
    return;
  }
  if (command.decision === 'dispute') {
    await transaction.query(
      `UPDATE app.claims SET status = 'disputed', disputed_at = $4, dispute_reason = $5
        WHERE tenant_id = $1 AND created_by = $2 AND id = $3`,
      [context.tenantId, context.ownerUserId, command.claimId, command.reviewedAt, command.rationale],
    );
    return;
  }
  await transaction.query(
    `UPDATE app.claims SET status = 'revoked', revoked_at = $4, revocation_reason = $5
      WHERE tenant_id = $1 AND created_by = $2 AND id = $3`,
    [context.tenantId, context.ownerUserId, command.claimId, command.reviewedAt, command.rationale],
  );
}

async function appendClaimReviewEvents(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  command: ClaimReviewCommand,
): Promise<void> {
  const metadata = JSON.stringify({
    requestId: command.requestId,
    decision: command.decision,
    previousStatus: command.expectedStatus,
    resultingStatus: command.resultingStatus,
  });
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, 'claim.reviewed', 'claim', $3,
       'public_drafting', $4, $5::jsonb, $6)`,
    [context.tenantId, context.ownerUserId, command.claimId, command.decision, metadata, command.reviewedAt],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'claim', $2, 'claim.reviewed', $3::jsonb, $4)`,
    [context.tenantId, command.claimId, metadata, command.reviewedAt],
  );
}

function memoryClaimKey(tenantId: TenantId, actorId: UserId, claimId: string): string {
  return `${tenantId}:${actorId}:${claimId}`;
}

function commandFingerprint(command: ClaimReviewCommand): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hash[12] = '4';
  hash[16] = '8';
  const value = hash.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function normalizeStatement(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('fa-IR');
}

const claimStatuses: readonly ClaimStatus[] = ['proposed', 'verified', 'disputed', 'expired', 'revoked'];
const reviewDecisions: readonly ClaimReviewDecision[] = ['verify', 'dispute', 'revoke'];

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new ClaimGovernanceValidationError('Claim review request id is invalid.');
  }
}

function validateUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new ClaimGovernanceValidationError(`${label} id is invalid.`);
  }
}

function validateText(value: string, min: number, max: number, label: string): void {
  const length = value.trim().length;
  if (length < min || length > max) throw new ClaimGovernanceValidationError(`${label} is invalid.`);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} are invalid.`);
  }
  return value as string[];
}

function objectValue(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value as Readonly<Record<string, unknown>>;
}

function toDate(value: Date | string, label: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} date is invalid.`);
  return date;
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}
