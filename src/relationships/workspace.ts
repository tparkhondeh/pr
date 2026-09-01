import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';

export type StakeholderGroup =
  | 'client'
  | 'investor'
  | 'peer'
  | 'manager'
  | 'team'
  | 'media'
  | 'journalist'
  | 'industry_leader'
  | 'community'
  | 'potential_partner'
  | 'critic'
  | 'friend'
  | 'public'
  | 'policymaker'
  | 'other';

export type StakeholderPriority = 'low' | 'medium' | 'high';
export type RelationshipStrength = 'unknown' | 'emerging' | 'active' | 'trusted';
export type RelationshipBoundary = 'normal' | 'ask_before_prompt' | 'do_not_prompt';
export type RelationshipRecency = 'unknown' | 'recent' | 'quiet' | 'dormant' | 'protected';
export type RelationshipAttention = 'none' | 'context_needed' | 'review_context' | 'approval_required';

export type StakeholderRecord = Readonly<{
  stakeholderId: string;
  requestId: string;
  label: string;
  group: StakeholderGroup;
  outcome: string;
  priority: StakeholderPriority;
  strength: RelationshipStrength;
  boundary: RelationshipBoundary;
  contextNote: string;
  lastInteractionAt: Date | null;
  consentConfirmedAt: Date;
  createdAt: Date;
}>;

export type StakeholderSnapshot = StakeholderRecord & Readonly<{
  recency: RelationshipRecency;
  attention: RelationshipAttention;
  rationale: string;
  privacy: Readonly<{
    dataClass: 'confidential';
    allowedPurpose: 'relationship_planning';
    contactDetailsStored: false;
    automationPermitted: false;
    outboundContactPermitted: false;
  }>;
}>;

export type RelationshipWorkspaceSnapshot = Readonly<{
  generatedAt: Date;
  persistence: 'memory' | 'postgres';
  policyVersion: 'relationship-intelligence-v1';
  summary: Readonly<{
    totalStakeholders: number;
    highPriority: number;
    contextNeeded: number;
    reviewSuggested: number;
    boundaryProtected: number;
    outcomeCount: number;
  }>;
  groups: readonly Readonly<{
    group: StakeholderGroup;
    count: number;
    highPriority: number;
  }>[];
  stakeholders: readonly StakeholderSnapshot[];
}>;

export type CreateStakeholderCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  stakeholderId: string;
  label: string;
  group: StakeholderGroup;
  outcome: string;
  priority: StakeholderPriority;
  strength: RelationshipStrength;
  boundary: RelationshipBoundary;
  contextNote: string;
  lastInteractionAt: Date | null;
  consentConfirmedAt: Date;
  createdAt: Date;
}>;

export type CreateStakeholderResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  record: StakeholderRecord;
  persistence: 'memory' | 'postgres';
}>;

export type DeleteStakeholderCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  stakeholderId: string;
  deletedAt: Date;
}>;

export type DeleteStakeholderResult = Readonly<{
  outcome: 'deleted' | 'already_applied';
  stakeholderId: string;
  persistence: 'memory' | 'postgres';
}>;

export interface RelationshipWorkspaceRepository {
  readonly persistence: 'memory' | 'postgres';
  create(command: CreateStakeholderCommand): Promise<Omit<CreateStakeholderResult, 'persistence'>>;
  delete(command: DeleteStakeholderCommand): Promise<Omit<DeleteStakeholderResult, 'persistence'>>;
  list(tenantId: TenantId, actorId: UserId): Promise<readonly StakeholderRecord[]>;
}

export class RelationshipValidationError extends Error {}
export class RelationshipPermissionError extends Error {}
export class RelationshipConflictError extends Error {}
export class RelationshipNotFoundError extends Error {}

export class RelationshipWorkspaceService {
  public constructor(
    private readonly repository: RelationshipWorkspaceRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public async create(input: Readonly<{
    actorId: UserId;
    requestId: string;
    label: string;
    group: StakeholderGroup;
    outcome: string;
    priority: StakeholderPriority;
    strength: RelationshipStrength;
    boundary: RelationshipBoundary;
    contextNote: string;
    lastInteractionAt: Date | null;
    consentConfirmed: boolean;
    occurredAt: Date;
  }>): Promise<CreateStakeholderResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    validateText(input.label, 2, 120, 'Stakeholder label');
    validateText(input.outcome, 3, 240, 'Stakeholder outcome');
    validateText(input.contextNote, 10, 1_000, 'Relationship context');
    if (!stakeholderGroups.includes(input.group)) throw new RelationshipValidationError('Stakeholder group is invalid.');
    if (!stakeholderPriorities.includes(input.priority)) throw new RelationshipValidationError('Stakeholder priority is invalid.');
    if (!relationshipStrengths.includes(input.strength)) throw new RelationshipValidationError('Relationship strength is invalid.');
    if (!relationshipBoundaries.includes(input.boundary)) throw new RelationshipValidationError('Relationship boundary is invalid.');
    if (!input.consentConfirmed) throw new RelationshipValidationError('Owner consent is required for relationship context.');
    validateDate(input.occurredAt, 'Relationship creation');
    if (input.lastInteractionAt) {
      validateDate(input.lastInteractionAt, 'Last interaction');
      if (input.lastInteractionAt > input.occurredAt) {
        throw new RelationshipValidationError('Last interaction cannot be in the future.');
      }
    }
    const result = await this.repository.create({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      stakeholderId: deterministicUuid(`stakeholder:${this.identity.tenantId}:${input.requestId}`),
      label: input.label.trim(),
      group: input.group,
      outcome: input.outcome.trim(),
      priority: input.priority,
      strength: input.strength,
      boundary: input.boundary,
      contextNote: input.contextNote.trim(),
      lastInteractionAt: input.lastInteractionAt,
      consentConfirmedAt: input.occurredAt,
      createdAt: input.occurredAt,
    });
    return { ...result, persistence: this.repository.persistence };
  }

  public async delete(input: Readonly<{
    actorId: UserId;
    requestId: string;
    stakeholderId: string;
    occurredAt: Date;
  }>): Promise<DeleteStakeholderResult> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    validateUuid(input.stakeholderId, 'Stakeholder id');
    validateDate(input.occurredAt, 'Stakeholder deletion');
    const result = await this.repository.delete({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      stakeholderId: input.stakeholderId,
      deletedAt: input.occurredAt,
    });
    return { ...result, persistence: this.repository.persistence };
  }

  public async snapshot(actorId: UserId, at: Date): Promise<RelationshipWorkspaceSnapshot> {
    this.assertOwner(actorId);
    validateDate(at, 'Relationship snapshot');
    const records = await this.repository.list(this.identity.tenantId, actorId);
    const stakeholders = records.map((record) => stakeholderSnapshot(record, at));
    const groups = stakeholderGroups.flatMap((group) => {
      const groupRecords = stakeholders.filter((record) => record.group === group);
      return groupRecords.length === 0 ? [] : [{
        group,
        count: groupRecords.length,
        highPriority: groupRecords.filter((record) => record.priority === 'high').length,
      }];
    });
    return {
      generatedAt: at,
      persistence: this.repository.persistence,
      policyVersion: 'relationship-intelligence-v1',
      summary: {
        totalStakeholders: stakeholders.length,
        highPriority: stakeholders.filter((record) => record.priority === 'high').length,
        contextNeeded: stakeholders.filter((record) => record.attention === 'context_needed').length,
        reviewSuggested: stakeholders.filter((record) => record.attention === 'review_context').length,
        boundaryProtected: stakeholders.filter((record) => record.recency === 'protected').length,
        outcomeCount: new Set(stakeholders.map((record) => normalizeText(record.outcome))).size,
      },
      groups,
      stakeholders,
    };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) {
      throw new RelationshipPermissionError('Only the owner can manage relationship context.');
    }
  }
}

export const stakeholderGroups: readonly StakeholderGroup[] = [
  'client', 'investor', 'peer', 'manager', 'team', 'media', 'journalist',
  'industry_leader', 'community', 'potential_partner', 'critic', 'friend',
  'public', 'policymaker', 'other',
];
export const stakeholderPriorities: readonly StakeholderPriority[] = ['low', 'medium', 'high'];
export const relationshipStrengths: readonly RelationshipStrength[] = ['unknown', 'emerging', 'active', 'trusted'];
export const relationshipBoundaries: readonly RelationshipBoundary[] = ['normal', 'ask_before_prompt', 'do_not_prompt'];

type StoredCreateRequest = Readonly<{ fingerprint: string; stakeholderId: string }>;
type StoredDeleteRequest = Readonly<{ fingerprint: string; stakeholderId: string }>;

export class InMemoryRelationshipWorkspaceRepository implements RelationshipWorkspaceRepository {
  public readonly persistence = 'memory' as const;
  readonly #records = new Map<string, StakeholderRecord>();
  readonly #createRequests = new Map<string, StoredCreateRequest>();
  readonly #deleteRequests = new Map<string, StoredDeleteRequest>();

  public create(command: CreateStakeholderCommand): Promise<Omit<CreateStakeholderResult, 'persistence'>> {
    const requestKey = ownerRequestKey(command, 'create');
    const fingerprint = createFingerprint(command);
    const repeated = this.#createRequests.get(requestKey);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) throw new RelationshipConflictError('Stakeholder request ID has conflicting content.');
      const activeRecord = this.#records.get(ownerRecordKey(command.tenantId, command.actorId, repeated.stakeholderId));
      if (!activeRecord) throw new RelationshipConflictError('Stakeholder create request was retired by deletion.');
      return Promise.resolve({ outcome: 'already_applied', record: activeRecord });
    }
    const duplicate = [...this.#records.values()].find((record) => (
      normalizeText(record.label) === normalizeText(command.label) && record.group === command.group &&
      record.requestId !== command.requestId
    ));
    if (duplicate) throw new RelationshipConflictError('This stakeholder label already exists in the selected group.');
    const record = recordFromCreate(command);
    this.#records.set(ownerRecordKey(command.tenantId, command.actorId, command.stakeholderId), record);
    this.#createRequests.set(requestKey, { fingerprint, stakeholderId: record.stakeholderId });
    return Promise.resolve({ outcome: 'applied', record });
  }

  public delete(command: DeleteStakeholderCommand): Promise<Omit<DeleteStakeholderResult, 'persistence'>> {
    const requestKey = ownerRequestKey(command, 'delete');
    const fingerprint = deleteFingerprint(command);
    const repeated = this.#deleteRequests.get(requestKey);
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) throw new RelationshipConflictError('Stakeholder delete request has conflicting content.');
      return Promise.resolve({ outcome: 'already_applied', stakeholderId: repeated.stakeholderId });
    }
    const recordKey = ownerRecordKey(command.tenantId, command.actorId, command.stakeholderId);
    if (!this.#records.has(recordKey)) throw new RelationshipNotFoundError('Stakeholder was not found.');
    this.#records.delete(recordKey);
    this.#deleteRequests.set(requestKey, { fingerprint, stakeholderId: command.stakeholderId });
    return Promise.resolve({ outcome: 'deleted', stakeholderId: command.stakeholderId });
  }

  public list(tenantId: TenantId, actorId: UserId): Promise<readonly StakeholderRecord[]> {
    const prefix = `${tenantId}:${actorId}:`;
    return Promise.resolve(
      [...this.#records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, record]) => record)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
    );
  }
}

type StakeholderRow = Readonly<{
  stakeholder_id: string;
  client_ref: string;
  label: string;
  stakeholder_group: StakeholderGroup;
  desired_outcome: string;
  strategic_priority: StakeholderPriority;
  relationship_strength: RelationshipStrength;
  relationship_boundary: RelationshipBoundary;
  context_note: string;
  last_interaction_at: Date | string | null;
  consent_confirmed_at: Date | string;
  created_at: Date | string;
}>;

type StakeholderRequestRow = Readonly<{
  request_sha256: string;
  result_snapshot: unknown;
}>;

export class PostgresRelationshipWorkspaceRepository implements RelationshipWorkspaceRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public create(command: CreateStakeholderCommand): Promise<Omit<CreateStakeholderResult, 'persistence'>> {
    this.assertContext(command);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await requestLock(transaction, this.context, command.requestId, 'create');
      const fingerprint = createFingerprint(command);
      const existing = await readRequest(transaction, this.context, command.requestId, 'create');
      if (existing) {
        if (existing.request_sha256 !== fingerprint) throw new RelationshipConflictError('Stakeholder request ID has conflicting content.');
        const stakeholderId = parseStoredStakeholderId(existing.result_snapshot);
        const active = await transaction.query<StakeholderRow>(
          `${stakeholderSelect()} WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3`,
          [this.context.tenantId, this.context.ownerUserId, stakeholderId],
        );
        const activeRow = active.rows[0];
        if (!activeRow) throw new RelationshipConflictError('Stakeholder create request was retired by deletion.');
        return { outcome: 'already_applied', record: rowToRecord(activeRow) };
      }
      const duplicate = await transaction.query<{ stakeholder_id: string }>(
        `SELECT id::text AS stakeholder_id FROM app.stakeholder_records
          WHERE tenant_id = $1 AND owner_user_id = $2 AND stakeholder_group = $3
            AND lower(regexp_replace(label, '\\s+', ' ', 'g')) = $4`,
        [this.context.tenantId, this.context.ownerUserId, command.group, normalizeText(command.label)],
      );
      if (duplicate.rowCount > 0) throw new RelationshipConflictError('This stakeholder label already exists in the selected group.');
      const record = recordFromCreate(command);
      await transaction.query(
        `INSERT INTO app.stakeholder_records (
           id, tenant_id, owner_user_id, client_ref, label, stakeholder_group,
           desired_outcome, strategic_priority, relationship_strength,
           relationship_boundary, context_note, last_interaction_at,
           consent_confirmed_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          command.stakeholderId, this.context.tenantId, this.context.ownerUserId,
          command.requestId, command.label, command.group, command.outcome,
          command.priority, command.strength, command.boundary, command.contextNote,
          command.lastInteractionAt, command.consentConfirmedAt, command.createdAt,
        ],
      );
      await writeRequest(
        transaction,
        this.context,
        command.requestId,
        'create',
        fingerprint,
        { stakeholderId: record.stakeholderId },
        command.createdAt,
      );
      await appendRelationshipEvents(transaction, this.context, {
        requestId: command.requestId,
        stakeholderId: command.stakeholderId,
        eventType: 'relationship.stakeholder_recorded',
        decision: 'recorded',
        occurredAt: command.createdAt,
        metadata: { policyVersion: 'relationship-intelligence-v1', contactDetailsStored: false },
      });
      return { outcome: 'applied', record };
    });
  }

  public delete(command: DeleteStakeholderCommand): Promise<Omit<DeleteStakeholderResult, 'persistence'>> {
    this.assertContext(command);
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await requestLock(transaction, this.context, command.requestId, 'delete');
      const fingerprint = deleteFingerprint(command);
      const existing = await readRequest(transaction, this.context, command.requestId, 'delete');
      if (existing) {
        if (existing.request_sha256 !== fingerprint) throw new RelationshipConflictError('Stakeholder delete request has conflicting content.');
        const stakeholderId = parseStoredStakeholderId(existing.result_snapshot);
        return { outcome: 'already_applied', stakeholderId };
      }
      const deleted = await transaction.query<{ stakeholder_id: string }>(
        `DELETE FROM app.stakeholder_records
          WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3
          RETURNING id::text AS stakeholder_id`,
        [this.context.tenantId, this.context.ownerUserId, command.stakeholderId],
      );
      if (deleted.rowCount === 0) throw new RelationshipNotFoundError('Stakeholder was not found.');
      const resultSnapshot = { stakeholderId: command.stakeholderId };
      await writeRequest(transaction, this.context, command.requestId, 'delete', fingerprint, resultSnapshot, command.deletedAt);
      await appendRelationshipEvents(transaction, this.context, {
        requestId: command.requestId,
        stakeholderId: command.stakeholderId,
        eventType: 'relationship.stakeholder_deleted',
        decision: 'deleted',
        occurredAt: command.deletedAt,
        metadata: { hardDelete: true },
      });
      return { outcome: 'deleted', stakeholderId: command.stakeholderId };
    });
  }

  public list(tenantId: TenantId, actorId: UserId): Promise<readonly StakeholderRecord[]> {
    if (tenantId !== this.context.tenantId || actorId !== this.context.ownerUserId) {
      throw new RelationshipPermissionError('Relationship repository context mismatch.');
    }
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<StakeholderRow>(
        `${stakeholderSelect()}
          WHERE tenant_id = $1 AND owner_user_id = $2
          ORDER BY created_at DESC`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      return result.rows.map(rowToRecord);
    });
  }

  private assertContext(command: CreateStakeholderCommand | DeleteStakeholderCommand): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new RelationshipPermissionError('Relationship repository context mismatch.');
    }
  }
}

function stakeholderSnapshot(record: StakeholderRecord, at: Date): StakeholderSnapshot {
  const recency = relationshipRecency(record, at);
  const attention = relationshipAttention(record, recency);
  return {
    ...record,
    recency,
    attention,
    rationale: attentionRationale(attention),
    privacy: {
      dataClass: 'confidential',
      allowedPurpose: 'relationship_planning',
      contactDetailsStored: false,
      automationPermitted: false,
      outboundContactPermitted: false,
    },
  };
}

function relationshipRecency(record: StakeholderRecord, at: Date): RelationshipRecency {
  if (record.boundary === 'do_not_prompt') return 'protected';
  if (!record.lastInteractionAt) return 'unknown';
  const ageDays = Math.max(0, Math.floor((at.getTime() - record.lastInteractionAt.getTime()) / 86_400_000));
  if (ageDays <= 30) return 'recent';
  if (ageDays <= 90) return 'quiet';
  return 'dormant';
}

function relationshipAttention(record: StakeholderRecord, recency: RelationshipRecency): RelationshipAttention {
  if (recency === 'protected' || record.priority !== 'high') return 'none';
  if (record.boundary === 'ask_before_prompt' && (recency === 'unknown' || recency === 'dormant')) {
    return 'approval_required';
  }
  if (recency === 'unknown') return 'context_needed';
  if (recency === 'dormant') return 'review_context';
  return 'none';
}

function attentionRationale(attention: RelationshipAttention): string {
  switch (attention) {
    case 'context_needed': return 'برای این رابطه مهم، تاریخ آخرین تعامل ثبت نشده است؛ فقط Context را کامل کن.';
    case 'review_context': return 'رابطه مهم مدتی بدون تعامل ثبت‌شده بوده است؛ Context را مرور کن، بدون توصیه خودکار به تماس.';
    case 'approval_required': return 'Boundary این رابطه ایجاب می‌کند پیش از هر Prompt یا پیشنهاد، تأیید صریح گرفته شود.';
    case 'none': return 'هیچ اقدام خودکاری پیشنهاد نمی‌شود.';
  }
}

function recordFromCreate(command: CreateStakeholderCommand): StakeholderRecord {
  return {
    stakeholderId: command.stakeholderId,
    requestId: command.requestId,
    label: command.label,
    group: command.group,
    outcome: command.outcome,
    priority: command.priority,
    strength: command.strength,
    boundary: command.boundary,
    contextNote: command.contextNote,
    lastInteractionAt: command.lastInteractionAt,
    consentConfirmedAt: command.consentConfirmedAt,
    createdAt: command.createdAt,
  };
}

function stakeholderSelect(): string {
  return `SELECT id::text AS stakeholder_id, client_ref, label, stakeholder_group,
                 desired_outcome, strategic_priority, relationship_strength,
                 relationship_boundary, context_note, last_interaction_at,
                 consent_confirmed_at, created_at
            FROM app.stakeholder_records`;
}

function rowToRecord(row: StakeholderRow): StakeholderRecord {
  return {
    stakeholderId: row.stakeholder_id,
    requestId: row.client_ref,
    label: row.label,
    group: row.stakeholder_group,
    outcome: row.desired_outcome,
    priority: row.strategic_priority,
    strength: row.relationship_strength,
    boundary: row.relationship_boundary,
    contextNote: row.context_note,
    lastInteractionAt: row.last_interaction_at === null ? null : toDate(row.last_interaction_at, 'Last interaction'),
    consentConfirmedAt: toDate(row.consent_confirmed_at, 'Relationship consent'),
    createdAt: toDate(row.created_at, 'Relationship creation'),
  };
}

async function requestLock(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  requestId: string,
  operation: 'create' | 'delete',
): Promise<void> {
  await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `${context.tenantId}:${context.ownerUserId}:relationship:${operation}:${requestId}`,
  ]);
}

async function readRequest(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  requestId: string,
  operation: 'create' | 'delete',
): Promise<StakeholderRequestRow | undefined> {
  const result = await transaction.query<StakeholderRequestRow>(
    `SELECT request_sha256, result_snapshot FROM app.stakeholder_requests
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
    `INSERT INTO app.stakeholder_requests (
       tenant_id, owner_user_id, operation, client_ref, request_sha256,
       result_snapshot, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [context.tenantId, context.ownerUserId, operation, requestId, fingerprint, JSON.stringify(resultSnapshot), createdAt],
  );
}

async function appendRelationshipEvents(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  event: Readonly<{
    requestId: string;
    stakeholderId: string;
    eventType: 'relationship.stakeholder_recorded' | 'relationship.stakeholder_deleted';
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
     ) VALUES ($1, $2, $3, 'stakeholder', $4, 'relationship_planning', $5, $6::jsonb, $7)`,
    [context.tenantId, context.ownerUserId, event.eventType, event.stakeholderId, event.decision, metadata, event.occurredAt],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'stakeholder', $2, $3, $4::jsonb, $5)`,
    [context.tenantId, event.stakeholderId, event.eventType, metadata, event.occurredAt],
  );
}

function createFingerprint(command: CreateStakeholderCommand): string {
  return createHash('sha256').update(JSON.stringify({
    operation: 'create',
    tenantId: command.tenantId,
    actorId: command.actorId,
    requestId: command.requestId,
    stakeholderId: command.stakeholderId,
    label: command.label,
    group: command.group,
    outcome: command.outcome,
    priority: command.priority,
    strength: command.strength,
    boundary: command.boundary,
    contextNote: command.contextNote,
    lastInteractionAt: command.lastInteractionAt?.toISOString() ?? null,
  })).digest('hex');
}

function deleteFingerprint(command: DeleteStakeholderCommand): string {
  return createHash('sha256').update(JSON.stringify({
    operation: 'delete',
    tenantId: command.tenantId,
    actorId: command.actorId,
    requestId: command.requestId,
    stakeholderId: command.stakeholderId,
  })).digest('hex');
}

function ownerRequestKey(
  command: Pick<CreateStakeholderCommand | DeleteStakeholderCommand, 'tenantId' | 'actorId' | 'requestId'>,
  operation: 'create' | 'delete',
): string {
  return `${command.tenantId}:${command.actorId}:${operation}:${command.requestId}`;
}

function ownerRecordKey(tenantId: TenantId, actorId: UserId, stakeholderId: string): string {
  return `${tenantId}:${actorId}:${stakeholderId}`;
}

function parseStoredStakeholderId(value: unknown): string {
  if (!isRecord(value) || typeof value['stakeholderId'] !== 'string') {
    throw new Error('Stored stakeholder delete result is invalid.');
  }
  validateUuid(value['stakeholderId'], 'Stored stakeholder id');
  return value['stakeholderId'];
}

function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hash[12] = '4';
  hash[16] = '8';
  const value = hash.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('fa-IR');
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new RelationshipValidationError('Relationship request id is invalid.');
  }
}

function validateUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new RelationshipValidationError(`${label} is invalid.`);
  }
}

function validateText(value: string, min: number, max: number, label: string): void {
  const length = value.trim().length;
  if (length < min || length > max) throw new RelationshipValidationError(`${label} is invalid.`);
}

function validateDate(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) throw new RelationshipValidationError(`${label} date is invalid.`);
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
