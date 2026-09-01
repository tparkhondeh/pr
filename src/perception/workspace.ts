import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';

export type PerceptionDimension =
  | 'expertise'
  | 'trust'
  | 'leadership'
  | 'clarity'
  | 'innovation'
  | 'collaboration'
  | 'visibility'
  | 'authenticity'
  | 'other';

export type PerceptionPerspective =
  | 'self_perception'
  | 'desired_positioning'
  | 'external_perception';

export type PerceptionStage = 'not_visible' | 'emerging' | 'visible' | 'strong' | 'signature';
export type PerceptionConfidence = 'low' | 'medium' | 'high';
export type PerceptionSourceKind =
  | 'owner_reflection'
  | 'owner_goal'
  | 'direct_feedback'
  | 'survey_summary'
  | 'public_signal'
  | 'media_signal'
  | 'network_feedback'
  | 'other';
export type PerceptionEpistemicType = 'self_report' | 'goal' | 'external_perception';
export type PerceptionGap = 'insufficient_evidence' | 'aligned_range' | 'underrecognized' | 'exceeds_target';
export type BlindSpotStatus =
  | 'insufficient_evidence'
  | 'within_external_range'
  | 'self_higher_than_external'
  | 'self_lower_than_external';

export type PerceptionSignalRecord = Readonly<{
  signalId: string;
  requestId: string;
  dimension: PerceptionDimension;
  perspective: PerceptionPerspective;
  stage: PerceptionStage;
  summary: string;
  evidenceNote: string;
  sourceKind: PerceptionSourceKind;
  confidence: PerceptionConfidence;
  observedAt: Date;
  consentConfirmedAt: Date;
  createdAt: Date;
}>;

export type PerceptionSignalSnapshot = PerceptionSignalRecord & Readonly<{
  epistemicType: PerceptionEpistemicType;
  privacy: Readonly<{
    dataClass: 'confidential';
    allowedPurpose: 'perception_analysis';
    sourceIdentityStored: false;
    verbatimPrivateQuoteStored: false;
    automatedCollectionPermitted: false;
    externalActionPermitted: false;
  }>;
}>;

export type PerceptionDimensionSnapshot = Readonly<{
  dimension: PerceptionDimension;
  selfStage: PerceptionStage | null;
  desiredStage: PerceptionStage | null;
  externalRange: Readonly<{
    lowest: PerceptionStage;
    highest: PerceptionStage;
    signalCount: number;
    conflictingStages: boolean;
  }> | null;
  gap: PerceptionGap;
  blindSpot: BlindSpotStatus;
  rationale: string;
}>;

export type PerceptionWorkspaceSnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres';
  policyVersion: 'perception-engine-v1';
  summary: Readonly<{
    totalSignals: number;
    coveredDimensions: number;
    externalSignals: number;
    underrecognized: number;
    potentialBlindSpots: number;
    insufficientEvidence: number;
  }>;
  dimensions: readonly PerceptionDimensionSnapshot[];
  signals: readonly PerceptionSignalSnapshot[];
}>;

export type CreatePerceptionSignalCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  signalId: string;
  dimension: PerceptionDimension;
  perspective: PerceptionPerspective;
  stage: PerceptionStage;
  summary: string;
  evidenceNote: string;
  sourceKind: PerceptionSourceKind;
  confidence: PerceptionConfidence;
  observedAt: Date;
  consentConfirmedAt: Date;
  createdAt: Date;
}>;

export type CreatePerceptionSignalResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  record: PerceptionSignalRecord;
  persistence: 'memory' | 'postgres';
}>;

export type DeletePerceptionSignalCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  signalId: string;
  deletedAt: Date;
}>;

export type DeletePerceptionSignalResult = Readonly<{
  outcome: 'deleted' | 'already_applied';
  signalId: string;
  persistence: 'memory' | 'postgres';
}>;

export interface PerceptionWorkspaceRepository {
  readonly persistence: 'memory' | 'postgres';
  create(command: CreatePerceptionSignalCommand): Promise<Omit<CreatePerceptionSignalResult, 'persistence'>>;
  delete(command: DeletePerceptionSignalCommand): Promise<Omit<DeletePerceptionSignalResult, 'persistence'>>;
  list(tenantId: TenantId, actorId: UserId): Promise<readonly PerceptionSignalRecord[]>;
}

export class PerceptionValidationError extends Error {}
export class PerceptionPermissionError extends Error {}
export class PerceptionConflictError extends Error {}
export class PerceptionNotFoundError extends Error {}

export class PerceptionWorkspaceService {
  public constructor(
    private readonly repository: PerceptionWorkspaceRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public async create(input: Readonly<{
    actorId: UserId;
    requestId: string;
    dimension: PerceptionDimension;
    perspective: PerceptionPerspective;
    stage: PerceptionStage;
    summary: string;
    evidenceNote: string;
    sourceKind: PerceptionSourceKind;
    confidence: PerceptionConfidence;
    observedAt: Date;
    consentConfirmed: boolean;
    occurredAt: Date;
  }>): Promise<CreatePerceptionSignalResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    if (!perceptionDimensions.includes(input.dimension)) throw new PerceptionValidationError('Perception dimension is invalid.');
    if (!perceptionPerspectives.includes(input.perspective)) throw new PerceptionValidationError('Perception perspective is invalid.');
    if (!perceptionStages.includes(input.stage)) throw new PerceptionValidationError('Perception stage is invalid.');
    if (!perceptionSourceKinds.includes(input.sourceKind)) throw new PerceptionValidationError('Perception source kind is invalid.');
    if (!perceptionConfidences.includes(input.confidence)) throw new PerceptionValidationError('Perception confidence is invalid.');
    validateSourceForPerspective(input.perspective, input.sourceKind);
    validateText(input.summary, 5, 400, 'Perception summary');
    validateText(input.evidenceNote, 10, 1_000, 'Perception evidence note');
    if (!input.consentConfirmed) throw new PerceptionValidationError('Explicit permission is required to store a perception signal.');
    validateDate(input.observedAt, 'Perception observation');
    validateDate(input.occurredAt, 'Perception creation');
    if (input.observedAt > input.occurredAt) throw new PerceptionValidationError('Perception observation cannot be in the future.');
    const result = await this.repository.create({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      signalId: deterministicUuid(`perception:${this.identity.tenantId}:${input.requestId}`),
      dimension: input.dimension,
      perspective: input.perspective,
      stage: input.stage,
      summary: input.summary.trim(),
      evidenceNote: input.evidenceNote.trim(),
      sourceKind: input.sourceKind,
      confidence: input.confidence,
      observedAt: input.observedAt,
      consentConfirmedAt: input.occurredAt,
      createdAt: input.occurredAt,
    });
    return { ...result, persistence: this.repository.persistence };
  }

  public async delete(input: Readonly<{
    actorId: UserId;
    requestId: string;
    signalId: string;
    occurredAt: Date;
  }>): Promise<DeletePerceptionSignalResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    validateUuid(input.signalId, 'Perception signal id');
    validateDate(input.occurredAt, 'Perception deletion');
    const result = await this.repository.delete({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      signalId: input.signalId,
      deletedAt: input.occurredAt,
    });
    return { ...result, persistence: this.repository.persistence };
  }

  public async snapshot(actorId: UserId, at: Date): Promise<PerceptionWorkspaceSnapshot> {
    this.assertOwner(actorId);
    validateDate(at, 'Perception snapshot');
    const records = await this.repository.list(this.identity.tenantId, actorId);
    const signals = records.map(signalSnapshot);
    const dimensions = perceptionDimensions.flatMap((dimension) => {
      const matches = records.filter((record) => record.dimension === dimension);
      return matches.length === 0 ? [] : [dimensionSnapshot(dimension, matches)];
    });
    return {
      generatedAt: at,
      persistence: this.repository.persistence,
      policyVersion: 'perception-engine-v1',
      summary: {
        totalSignals: signals.length,
        coveredDimensions: dimensions.length,
        externalSignals: signals.filter((signal) => signal.perspective === 'external_perception').length,
        underrecognized: dimensions.filter((dimension) => dimension.gap === 'underrecognized').length,
        potentialBlindSpots: dimensions.filter((dimension) => (
          dimension.blindSpot === 'self_higher_than_external' ||
          dimension.blindSpot === 'self_lower_than_external'
        )).length,
        insufficientEvidence: dimensions.filter((dimension) => (
          dimension.gap === 'insufficient_evidence' || dimension.blindSpot === 'insufficient_evidence'
        )).length,
      },
      dimensions,
      signals,
    };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) {
      throw new PerceptionPermissionError('Only the owner can manage perception signals.');
    }
  }
}

export const perceptionDimensions: readonly PerceptionDimension[] = [
  'expertise', 'trust', 'leadership', 'clarity', 'innovation',
  'collaboration', 'visibility', 'authenticity', 'other',
];
export const perceptionPerspectives: readonly PerceptionPerspective[] = [
  'self_perception', 'desired_positioning', 'external_perception',
];
export const perceptionStages: readonly PerceptionStage[] = [
  'not_visible', 'emerging', 'visible', 'strong', 'signature',
];
export const perceptionConfidences: readonly PerceptionConfidence[] = ['low', 'medium', 'high'];
export const perceptionSourceKinds: readonly PerceptionSourceKind[] = [
  'owner_reflection', 'owner_goal', 'direct_feedback', 'survey_summary',
  'public_signal', 'media_signal', 'network_feedback', 'other',
];

type StoredRequest = Readonly<{ fingerprint: string; signalId: string }>;

export class InMemoryPerceptionWorkspaceRepository implements PerceptionWorkspaceRepository {
  public readonly persistence = 'memory' as const;
  readonly #records = new Map<string, PerceptionSignalRecord>();
  readonly #createRequests = new Map<string, StoredRequest>();
  readonly #deleteRequests = new Map<string, StoredRequest>();

  public create(command: CreatePerceptionSignalCommand): Promise<Omit<CreatePerceptionSignalResult, 'persistence'>> {
    const requestKey = ownerRequestKey(command, 'create');
    const fingerprint = createFingerprint(command);
    const repeated = this.#createRequests.get(requestKey);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) throw new PerceptionConflictError('Perception request ID has conflicting content.');
      const active = this.#records.get(ownerRecordKey(command.tenantId, command.actorId, repeated.signalId));
      if (!active) throw new PerceptionConflictError('Perception create request was retired by deletion.');
      return Promise.resolve({ outcome: 'already_applied', record: active });
    }
    const record = recordFromCreate(command);
    this.#records.set(ownerRecordKey(command.tenantId, command.actorId, command.signalId), record);
    this.#createRequests.set(requestKey, { fingerprint, signalId: record.signalId });
    return Promise.resolve({ outcome: 'applied', record });
  }

  public delete(command: DeletePerceptionSignalCommand): Promise<Omit<DeletePerceptionSignalResult, 'persistence'>> {
    const requestKey = ownerRequestKey(command, 'delete');
    const fingerprint = deleteFingerprint(command);
    const repeated = this.#deleteRequests.get(requestKey);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) throw new PerceptionConflictError('Perception delete request has conflicting content.');
      return Promise.resolve({ outcome: 'already_applied', signalId: repeated.signalId });
    }
    const recordKey = ownerRecordKey(command.tenantId, command.actorId, command.signalId);
    if (!this.#records.has(recordKey)) throw new PerceptionNotFoundError('Perception signal was not found.');
    this.#records.delete(recordKey);
    this.#deleteRequests.set(requestKey, { fingerprint, signalId: command.signalId });
    return Promise.resolve({ outcome: 'deleted', signalId: command.signalId });
  }

  public list(tenantId: TenantId, actorId: UserId): Promise<readonly PerceptionSignalRecord[]> {
    const prefix = `${tenantId}:${actorId}:`;
    return Promise.resolve([...this.#records.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, record]) => record)
      .sort(compareSignals));
  }
}

type PerceptionRow = Readonly<{
  signal_id: string;
  client_ref: string;
  dimension: PerceptionDimension;
  perspective: PerceptionPerspective;
  visibility_stage: PerceptionStage;
  signal_summary: string;
  evidence_note: string;
  source_kind: PerceptionSourceKind;
  confidence: PerceptionConfidence;
  observed_at: Date | string;
  consent_confirmed_at: Date | string;
  created_at: Date | string;
}>;

type PerceptionRequestRow = Readonly<{ request_sha256: string; result_snapshot: unknown }>;

export class PostgresPerceptionWorkspaceRepository implements PerceptionWorkspaceRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public create(command: CreatePerceptionSignalCommand): Promise<Omit<CreatePerceptionSignalResult, 'persistence'>> {
    this.assertContext(command);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await requestLock(transaction, this.context, command.requestId, 'create');
      const fingerprint = createFingerprint(command);
      const existing = await readRequest(transaction, this.context, command.requestId, 'create');
      if (existing) {
        if (existing.request_sha256 !== fingerprint) throw new PerceptionConflictError('Perception request ID has conflicting content.');
        const signalId = parseStoredSignalId(existing.result_snapshot);
        const active = await transaction.query<PerceptionRow>(
          `${perceptionSelect()} WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3`,
          [this.context.tenantId, this.context.ownerUserId, signalId],
        );
        const row = active.rows[0];
        if (!row) throw new PerceptionConflictError('Perception create request was retired by deletion.');
        return { outcome: 'already_applied', record: rowToRecord(row) };
      }
      const record = recordFromCreate(command);
      await transaction.query(
        `INSERT INTO app.perception_signals (
           id, tenant_id, owner_user_id, client_ref, dimension, perspective,
           visibility_stage, signal_summary, evidence_note, source_kind,
           confidence, observed_at, consent_confirmed_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          command.signalId, this.context.tenantId, this.context.ownerUserId,
          command.requestId, command.dimension, command.perspective, command.stage,
          command.summary, command.evidenceNote, command.sourceKind, command.confidence,
          command.observedAt, command.consentConfirmedAt, command.createdAt,
        ],
      );
      await writeRequest(transaction, this.context, command.requestId, 'create', fingerprint, { signalId: record.signalId }, command.createdAt);
      await appendPerceptionEvents(transaction, this.context, {
        requestId: command.requestId,
        signalId: command.signalId,
        eventType: 'perception.signal_recorded',
        decision: 'recorded',
        occurredAt: command.createdAt,
        metadata: { policyVersion: 'perception-engine-v1', sourceIdentityStored: false },
      });
      return { outcome: 'applied', record };
    });
  }

  public delete(command: DeletePerceptionSignalCommand): Promise<Omit<DeletePerceptionSignalResult, 'persistence'>> {
    this.assertContext(command);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await requestLock(transaction, this.context, command.requestId, 'delete');
      const fingerprint = deleteFingerprint(command);
      const existing = await readRequest(transaction, this.context, command.requestId, 'delete');
      if (existing) {
        if (existing.request_sha256 !== fingerprint) throw new PerceptionConflictError('Perception delete request has conflicting content.');
        return { outcome: 'already_applied', signalId: parseStoredSignalId(existing.result_snapshot) };
      }
      const deleted = await transaction.query<{ signal_id: string }>(
        `DELETE FROM app.perception_signals
          WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3
          RETURNING id::text AS signal_id`,
        [this.context.tenantId, this.context.ownerUserId, command.signalId],
      );
      if (deleted.rowCount === 0) throw new PerceptionNotFoundError('Perception signal was not found.');
      await writeRequest(transaction, this.context, command.requestId, 'delete', fingerprint, { signalId: command.signalId }, command.deletedAt);
      await appendPerceptionEvents(transaction, this.context, {
        requestId: command.requestId,
        signalId: command.signalId,
        eventType: 'perception.signal_deleted',
        decision: 'deleted',
        occurredAt: command.deletedAt,
        metadata: { hardDelete: true },
      });
      return { outcome: 'deleted', signalId: command.signalId };
    });
  }

  public list(tenantId: TenantId, actorId: UserId): Promise<readonly PerceptionSignalRecord[]> {
    if (tenantId !== this.context.tenantId || actorId !== this.context.ownerUserId) {
      throw new PerceptionPermissionError('Perception repository context mismatch.');
    }
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<PerceptionRow>(
        `${perceptionSelect()}
          WHERE tenant_id = $1 AND owner_user_id = $2
          ORDER BY observed_at DESC, created_at DESC`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      return result.rows.map(rowToRecord);
    });
  }

  private assertContext(command: CreatePerceptionSignalCommand | DeletePerceptionSignalCommand): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new PerceptionPermissionError('Perception repository context mismatch.');
    }
  }
}

function signalSnapshot(record: PerceptionSignalRecord): PerceptionSignalSnapshot {
  return {
    ...record,
    epistemicType: epistemicType(record.perspective),
    privacy: {
      dataClass: 'confidential',
      allowedPurpose: 'perception_analysis',
      sourceIdentityStored: false,
      verbatimPrivateQuoteStored: false,
      automatedCollectionPermitted: false,
      externalActionPermitted: false,
    },
  };
}

function dimensionSnapshot(
  dimension: PerceptionDimension,
  records: readonly PerceptionSignalRecord[],
): PerceptionDimensionSnapshot {
  const self = latest(records.filter((record) => record.perspective === 'self_perception'));
  const desired = latest(records.filter((record) => record.perspective === 'desired_positioning'));
  const external = records.filter((record) => record.perspective === 'external_perception');
  const externalIndexes = external.map((record) => stageIndex(record.stage));
  const lowestIndex = externalIndexes.length === 0 ? null : Math.min(...externalIndexes);
  const highestIndex = externalIndexes.length === 0 ? null : Math.max(...externalIndexes);
  const externalRange = lowestIndex === null || highestIndex === null ? null : {
    lowest: stageFromIndex(lowestIndex),
    highest: stageFromIndex(highestIndex),
    signalCount: external.length,
    conflictingStages: lowestIndex !== highestIndex,
  };
  const gap = perceptionGap(desired?.stage ?? null, lowestIndex, highestIndex);
  const blindSpot = blindSpotStatus(self?.stage ?? null, lowestIndex, highestIndex);
  return {
    dimension,
    selfStage: self?.stage ?? null,
    desiredStage: desired?.stage ?? null,
    externalRange,
    gap,
    blindSpot,
    rationale: analysisRationale(gap, blindSpot, externalRange?.conflictingStages ?? false),
  };
}

function perceptionGap(
  desired: PerceptionStage | null,
  lowestExternal: number | null,
  highestExternal: number | null,
): PerceptionGap {
  if (!desired || lowestExternal === null || highestExternal === null) return 'insufficient_evidence';
  const target = stageIndex(desired);
  if (highestExternal < target) return 'underrecognized';
  if (lowestExternal > target) return 'exceeds_target';
  return 'aligned_range';
}

function blindSpotStatus(
  self: PerceptionStage | null,
  lowestExternal: number | null,
  highestExternal: number | null,
): BlindSpotStatus {
  if (!self || lowestExternal === null || highestExternal === null) return 'insufficient_evidence';
  const selfIndex = stageIndex(self);
  if (selfIndex > highestExternal) return 'self_higher_than_external';
  if (selfIndex < lowestExternal) return 'self_lower_than_external';
  return 'within_external_range';
}

function analysisRationale(gap: PerceptionGap, blindSpot: BlindSpotStatus, conflict: boolean): string {
  if (conflict && gap !== 'insufficient_evidence') {
    return 'External Perceptionها هم‌سطح نیستند؛ اختلاف Signalها حفظ شده و نیازمند مرور زمینه است.';
  }
  if (gap === 'insufficient_evidence' || blindSpot === 'insufficient_evidence') {
    return 'برای مقایسه کامل داده کافی نیست؛ هیچ نتیجه‌ای به‌عنوان حقیقت اعلام نمی‌شود.';
  }
  if (gap === 'underrecognized') return 'Stage ادراک بیرونی پایین‌تر از جایگاه مطلوب ثبت شده است؛ این فقط یک Gap کیفی است.';
  if (gap === 'exceeds_target') return 'Stage ادراک بیرونی بالاتر از جایگاه مطلوب ثبت شده است؛ نیاز به قضاوت مالک دارد.';
  if (blindSpot === 'self_higher_than_external') return 'Self Perception بالاتر از Signal بیرونی است؛ یک Blind Spot احتمالی، نه Fact.';
  if (blindSpot === 'self_lower_than_external') return 'Self Perception پایین‌تر از Signal بیرونی است؛ یک تفاوت قابل بررسی، نه Fact.';
  return 'Stage مطلوب، Self Perception و Range بیرونی در محدوده مشترک قرار دارند.';
}

function latest(records: readonly PerceptionSignalRecord[]): PerceptionSignalRecord | undefined {
  return [...records].sort(compareSignals)[0];
}

function compareSignals(left: PerceptionSignalRecord, right: PerceptionSignalRecord): number {
  return right.observedAt.getTime() - left.observedAt.getTime() || right.createdAt.getTime() - left.createdAt.getTime();
}

function stageIndex(stage: PerceptionStage): number {
  return perceptionStages.indexOf(stage);
}

function stageFromIndex(index: number): PerceptionStage {
  const stage = perceptionStages[index];
  if (!stage) throw new Error('Perception stage index is invalid.');
  return stage;
}

function epistemicType(perspective: PerceptionPerspective): PerceptionEpistemicType {
  if (perspective === 'self_perception') return 'self_report';
  if (perspective === 'desired_positioning') return 'goal';
  return 'external_perception';
}

function validateSourceForPerspective(perspective: PerceptionPerspective, source: PerceptionSourceKind): void {
  if (perspective === 'self_perception' && source !== 'owner_reflection') {
    throw new PerceptionValidationError('Self perception requires owner reflection as its source.');
  }
  if (perspective === 'desired_positioning' && source !== 'owner_goal') {
    throw new PerceptionValidationError('Desired positioning requires owner goal as its source.');
  }
  if (perspective === 'external_perception' && (source === 'owner_reflection' || source === 'owner_goal')) {
    throw new PerceptionValidationError('External perception requires an external signal source kind.');
  }
}

function recordFromCreate(command: CreatePerceptionSignalCommand): PerceptionSignalRecord {
  return {
    signalId: command.signalId,
    requestId: command.requestId,
    dimension: command.dimension,
    perspective: command.perspective,
    stage: command.stage,
    summary: command.summary,
    evidenceNote: command.evidenceNote,
    sourceKind: command.sourceKind,
    confidence: command.confidence,
    observedAt: command.observedAt,
    consentConfirmedAt: command.consentConfirmedAt,
    createdAt: command.createdAt,
  };
}

function perceptionSelect(): string {
  return `SELECT id::text AS signal_id, client_ref, dimension, perspective,
                 visibility_stage, signal_summary, evidence_note, source_kind,
                 confidence, observed_at, consent_confirmed_at, created_at
            FROM app.perception_signals`;
}

function rowToRecord(row: PerceptionRow): PerceptionSignalRecord {
  return {
    signalId: row.signal_id,
    requestId: row.client_ref,
    dimension: row.dimension,
    perspective: row.perspective,
    stage: row.visibility_stage,
    summary: row.signal_summary,
    evidenceNote: row.evidence_note,
    sourceKind: row.source_kind,
    confidence: row.confidence,
    observedAt: toDate(row.observed_at, 'Perception observation'),
    consentConfirmedAt: toDate(row.consent_confirmed_at, 'Perception consent'),
    createdAt: toDate(row.created_at, 'Perception creation'),
  };
}

async function requestLock(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  requestId: string,
  operation: 'create' | 'delete',
): Promise<void> {
  await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `${context.tenantId}:${context.ownerUserId}:perception:${operation}:${requestId}`,
  ]);
}

async function readRequest(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  requestId: string,
  operation: 'create' | 'delete',
): Promise<PerceptionRequestRow | undefined> {
  const result = await transaction.query<PerceptionRequestRow>(
    `SELECT request_sha256, result_snapshot FROM app.perception_requests
      WHERE tenant_id = $1 AND owner_user_id = $2 AND operation = $3 AND client_ref = $4`,
    [context.tenantId, context.ownerUserId, operation, requestId],
  );
  return result.rows[0];
}

async function writeRequest(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  requestId: string,
  operation: 'create' | 'delete',
  fingerprint: string,
  resultSnapshot: unknown,
  createdAt: Date,
): Promise<void> {
  await transaction.query(
    `INSERT INTO app.perception_requests (
       tenant_id, owner_user_id, operation, client_ref, request_sha256,
       result_snapshot, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [context.tenantId, context.ownerUserId, operation, requestId, fingerprint, JSON.stringify(resultSnapshot), createdAt],
  );
}

async function appendPerceptionEvents(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  event: Readonly<{
    requestId: string;
    signalId: string;
    eventType: 'perception.signal_recorded' | 'perception.signal_deleted';
    decision: 'recorded' | 'deleted';
    occurredAt: Date;
    metadata: Readonly<Record<string, unknown>>;
  }>,
): Promise<void> {
  const metadata = JSON.stringify({ requestId: event.requestId, ...event.metadata });
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, $3, 'perception_signal', $4, 'perception_analysis', $5, $6::jsonb, $7)`,
    [context.tenantId, context.ownerUserId, event.eventType, event.signalId, event.decision, metadata, event.occurredAt],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'perception_signal', $2, $3, $4::jsonb, $5)`,
    [context.tenantId, event.signalId, event.eventType, metadata, event.occurredAt],
  );
}

function createFingerprint(command: CreatePerceptionSignalCommand): string {
  return createHash('sha256').update(JSON.stringify({
    operation: 'create',
    tenantId: command.tenantId,
    actorId: command.actorId,
    requestId: command.requestId,
    signalId: command.signalId,
    dimension: command.dimension,
    perspective: command.perspective,
    stage: command.stage,
    summary: command.summary,
    evidenceNote: command.evidenceNote,
    sourceKind: command.sourceKind,
    confidence: command.confidence,
    observedAt: command.observedAt.toISOString(),
  })).digest('hex');
}

function deleteFingerprint(command: DeletePerceptionSignalCommand): string {
  return createHash('sha256').update(JSON.stringify({
    operation: 'delete',
    tenantId: command.tenantId,
    actorId: command.actorId,
    requestId: command.requestId,
    signalId: command.signalId,
  })).digest('hex');
}

function ownerRequestKey(
  command: Pick<CreatePerceptionSignalCommand | DeletePerceptionSignalCommand, 'tenantId' | 'actorId' | 'requestId'>,
  operation: 'create' | 'delete',
): string {
  return `${command.tenantId}:${command.actorId}:${operation}:${command.requestId}`;
}

function ownerRecordKey(tenantId: TenantId, actorId: UserId, signalId: string): string {
  return `${tenantId}:${actorId}:${signalId}`;
}

function parseStoredSignalId(value: unknown): string {
  if (!isRecord(value) || typeof value['signalId'] !== 'string') {
    throw new Error('Stored perception result is invalid.');
  }
  validateUuid(value['signalId'], 'Stored perception signal id');
  return value['signalId'];
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
    throw new PerceptionValidationError('Perception request id is invalid.');
  }
}

function validateUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new PerceptionValidationError(`${label} is invalid.`);
  }
}

function validateText(value: string, min: number, max: number, label: string): void {
  const length = value.trim().length;
  if (length < min || length > max) throw new PerceptionValidationError(`${label} is invalid.`);
}

function validateDate(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) throw new PerceptionValidationError(`${label} date is invalid.`);
}

function toDate(value: Date | string, label: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} date is invalid.`);
  return date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}
