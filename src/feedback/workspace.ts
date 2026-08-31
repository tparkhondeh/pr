import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';
import {
  decidePreference,
  proposePreference,
  revokePreference,
  type FeedbackEvent,
  type PreferenceProposal,
} from './learning.js';

export type FeedbackPersistence = 'memory' | 'postgres';
export type PreferenceDecision = 'applied' | 'rejected' | 'revoked';

export type DraftEditSignal = Readonly<{
  key: 'voice.draft_length' | 'voice.headline_length' | 'voice.heading_density' | 'voice.question_cta';
  value: 'shorter' | 'longer' | 'lower' | 'omit';
  rationale: string;
}>;

export type FeedbackLearningSnapshot = Readonly<{
  generatedAt: Date;
  persistence: FeedbackPersistence;
  summary: Readonly<{
    recentEvents: number;
    proposed: number;
    applied: number;
  }>;
  recentEvents: readonly FeedbackEvent[];
  preferences: readonly PreferenceProposal[];
}>;

type RecordCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  draftId: string;
  eventType: 'edited' | 'rejected';
  afterBodyHash?: string;
  signals: readonly DraftEditSignal[];
  rejectionReason?: string;
  occurredAt: Date;
}>;

type DecideCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  proposalId: string;
  decision: PreferenceDecision;
  occurredAt: Date;
}>;

export interface FeedbackLearningRepository {
  readonly persistence: FeedbackPersistence;
  snapshot(generatedAt: Date): Promise<FeedbackLearningSnapshot>;
  record(command: RecordCommand): Promise<FeedbackLearningSnapshot>;
  decide(command: DecideCommand): Promise<FeedbackLearningSnapshot>;
}

export class FeedbackValidationError extends Error {}
export class FeedbackPermissionError extends Error {}
export class FeedbackNotFoundError extends Error {}
export class FeedbackConflictError extends Error {
  public constructor(public readonly reason: 'idempotency_mismatch' | 'invalid_status') {
    super(`Feedback conflict: ${reason}`);
  }
}

export class FeedbackLearningService {
  public constructor(
    private readonly repository: FeedbackLearningRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public snapshot(actorId: UserId, generatedAt: Date): Promise<FeedbackLearningSnapshot> {
    this.assertOwner(actorId);
    return this.repository.snapshot(generatedAt);
  }

  public recordDraftEdit(input: Readonly<{
    actorId: UserId;
    requestId: string;
    draftId: string;
    before: string;
    after: string;
    occurredAt: Date;
  }>): Promise<FeedbackLearningSnapshot> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    if (input.draftId.trim().length === 0) throw new FeedbackValidationError('Draft id is required.');
    return this.repository.record({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      draftId: input.draftId,
      eventType: 'edited',
      afterBodyHash: hash(input.after),
      signals: analyzeDraftEdit(input.before, input.after),
      occurredAt: input.occurredAt,
    });
  }

  public rejectDraft(input: Readonly<{
    actorId: UserId;
    requestId: string;
    draftId: string;
    reason: string;
    occurredAt: Date;
  }>): Promise<FeedbackLearningSnapshot> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    const reason = input.reason.trim();
    if (input.draftId.trim().length === 0 || reason.length < 3 || reason.length > 1_000) {
      throw new FeedbackValidationError('Draft rejection is invalid.');
    }
    return this.repository.record({
      tenantId: this.identity.tenantId,
      actorId: input.actorId,
      requestId: input.requestId,
      draftId: input.draftId,
      eventType: 'rejected',
      signals: [],
      rejectionReason: reason,
      occurredAt: input.occurredAt,
    });
  }

  public decide(input: Readonly<{
    actorId: UserId;
    requestId: string;
    proposalId: string;
    decision: PreferenceDecision;
    occurredAt: Date;
  }>): Promise<FeedbackLearningSnapshot> {
    this.assertOwner(input.actorId);
    validateRequestId(input.requestId);
    if (!isUuid(input.proposalId) || !['applied', 'rejected', 'revoked'].includes(input.decision)) {
      throw new FeedbackValidationError('Preference decision is invalid.');
    }
    return this.repository.decide({ ...input, tenantId: this.identity.tenantId });
  }

  public async appliedPreferences(actorId: UserId, generatedAt: Date): Promise<Readonly<Record<string, unknown>>> {
    const snapshot = await this.snapshot(actorId, generatedAt);
    return Object.fromEntries(
      snapshot.preferences
        .filter((preference) => preference.status === 'applied')
        .map((preference) => [preference.preferenceKey, preference.proposedValue]),
    );
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) {
      throw new FeedbackPermissionError('Only the owner can manage learned preferences.');
    }
  }
}

export class InMemoryFeedbackLearningRepository implements FeedbackLearningRepository {
  public readonly persistence = 'memory' as const;
  readonly #events = new Map<string, FeedbackEvent>();
  readonly #preferences = new Map<string, PreferenceProposal>();
  readonly #requests = new Map<string, string>();

  public snapshot(generatedAt: Date): Promise<FeedbackLearningSnapshot> {
    return Promise.resolve(this.current(generatedAt));
  }

  public record(command: RecordCommand): Promise<FeedbackLearningSnapshot> {
    const fingerprint = recordFingerprint(command);
    this.reserve(command.requestId, fingerprint);
    const events = command.eventType === 'edited'
      ? editEvents(command)
      : [rejectionEvent(command)];
    for (const event of events) this.#events.set(event.id, event);
    for (const signal of command.signals) {
      const active = [...this.#preferences.values()].some((preference) =>
        preference.preferenceKey === signal.key &&
        stableValue(preference.proposedValue) === stableValue(signal.value) &&
        (preference.status === 'proposed' || preference.status === 'applied'),
      );
      if (active) continue;
      const proposal = proposePreference(
        deterministicUuid(`preference:${command.tenantId}:${command.actorId}:${signal.key}:${command.requestId}`),
        command.tenantId,
        command.actorId,
        signal.key,
        [...this.#events.values()],
        command.occurredAt,
      );
      if (proposal) this.#preferences.set(proposal.id, { ...proposal, rationale: preferenceRationale(signal, proposal.evidenceEventIds.length) });
    }
    return Promise.resolve(this.current(command.occurredAt));
  }

  public decide(command: DecideCommand): Promise<FeedbackLearningSnapshot> {
    const fingerprint = decisionFingerprint(command);
    const repeated = this.#requests.get(command.requestId);
    if (repeated) {
      if (repeated !== fingerprint) throw new FeedbackConflictError('idempotency_mismatch');
      return Promise.resolve(this.current(command.occurredAt));
    }
    const current = this.#preferences.get(command.proposalId);
    if (!current) throw new FeedbackNotFoundError();
    let next: PreferenceProposal;
    if (command.decision === 'revoked') {
      try {
        next = revokePreference(current, command.actorId, command.occurredAt);
      } catch {
        throw new FeedbackConflictError('invalid_status');
      }
    } else {
      try {
        next = decidePreference(current, command.decision, command.actorId, command.occurredAt);
      } catch {
        throw new FeedbackConflictError('invalid_status');
      }
      if (command.decision === 'applied') {
        for (const [id, preference] of this.#preferences) {
          if (id !== current.id && preference.preferenceKey === current.preferenceKey && preference.status === 'applied') {
            this.#preferences.set(id, revokePreference(preference, command.actorId, command.occurredAt));
          }
        }
      }
    }
    this.#preferences.set(next.id, next);
    this.#requests.set(command.requestId, fingerprint);
    return Promise.resolve(this.current(command.occurredAt));
  }

  private reserve(requestId: string, fingerprint: string): void {
    const existing = this.#requests.get(requestId);
    if (existing && existing !== fingerprint) throw new FeedbackConflictError('idempotency_mismatch');
    this.#requests.set(requestId, fingerprint);
  }

  private current(generatedAt: Date): FeedbackLearningSnapshot {
    return makeSnapshot(
      generatedAt,
      this.persistence,
      [...this.#events.values()],
      [...this.#preferences.values()],
    );
  }
}

type FeedbackRow = Readonly<{
  id: string;
  tenant_id: string;
  user_id: string;
  artifact_type: string;
  artifact_id: string;
  event_type: FeedbackEvent['eventType'];
  signal_key: string | null;
  signal_value: unknown;
  satisfaction: number | null;
  regret: number | null;
  energy: number | null;
  occurred_at: Date | string;
}>;

type PreferenceRow = Readonly<{
  id: string;
  tenant_id: string;
  user_id: string;
  preference_key: string;
  proposed_value: unknown;
  evidence_event_ids: unknown;
  rationale: string;
  confidence: string | number;
  status: PreferenceProposal['status'];
  proposed_at: Date | string;
  decided_at: Date | string | null;
  decided_by: string | null;
}>;

export class PostgresFeedbackLearningRepository implements FeedbackLearningRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public snapshot(generatedAt: Date): Promise<FeedbackLearningSnapshot> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      return this.snapshotWithin(transaction, generatedAt);
    });
  }

  public record(command: RecordCommand): Promise<FeedbackLearningSnapshot> {
    return this.runner.transaction(async (transaction) => {
      this.assertContext(command);
      await setTenantContext(transaction, this.context.tenantId);
      const fingerprint = recordFingerprint(command);
      const repeated = await reserveRequest(transaction, this.context, command.requestId, command.eventType, fingerprint, command.occurredAt);
      if (repeated) return this.snapshotWithin(transaction, command.occurredAt);
      const events = command.eventType === 'edited' ? editEvents(command) : [rejectionEvent(command)];
      for (const event of events) await insertFeedbackEvent(transaction, event);
      for (const signal of command.signals) {
        await proposePreferenceWithin(transaction, this.context, signal, command);
      }
      await appendLearningEvents(transaction, this.context, command, `feedback.${command.eventType}`);
      await completeRequest(transaction, this.context, command.requestId, { recorded: events.map((event) => event.id) });
      return this.snapshotWithin(transaction, command.occurredAt);
    });
  }

  public decide(command: DecideCommand): Promise<FeedbackLearningSnapshot> {
    return this.runner.transaction(async (transaction) => {
      this.assertContext(command);
      await setTenantContext(transaction, this.context.tenantId);
      const fingerprint = decisionFingerprint(command);
      const repeated = await reserveRequest(transaction, this.context, command.requestId, 'decide', fingerprint, command.occurredAt);
      if (repeated) return this.snapshotWithin(transaction, command.occurredAt);
      const result = await transaction.query<PreferenceRow>(
        `SELECT * FROM app.preference_proposals
          WHERE tenant_id = $1 AND user_id = $2 AND id = $3 FOR UPDATE`,
        [this.context.tenantId, this.context.ownerUserId, command.proposalId],
      );
      const current = result.rows[0];
      if (!current) throw new FeedbackNotFoundError();
      if (command.decision === 'revoked' ? current.status !== 'applied' : current.status !== 'proposed') {
        throw new FeedbackConflictError('invalid_status');
      }
      if (command.decision === 'applied') {
        await transaction.query(
          `UPDATE app.preference_proposals SET status = 'revoked', decided_at = $4, decided_by = $2
            WHERE tenant_id = $1 AND user_id = $2 AND preference_key = $3
              AND status = 'applied' AND id <> $5`,
          [this.context.tenantId, this.context.ownerUserId, current.preference_key, command.occurredAt, command.proposalId],
        );
      }
      await transaction.query(
        `UPDATE app.preference_proposals SET status = $4, decided_at = $5, decided_by = $2
          WHERE tenant_id = $1 AND user_id = $2 AND id = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.proposalId, command.decision, command.occurredAt],
      );
      await appendLearningEvents(transaction, this.context, command, `preference.${command.decision}`);
      await completeRequest(transaction, this.context, command.requestId, { proposalId: command.proposalId, decision: command.decision });
      return this.snapshotWithin(transaction, command.occurredAt);
    });
  }

  private async snapshotWithin(transaction: SqlTransaction, generatedAt: Date): Promise<FeedbackLearningSnapshot> {
    const [events, preferences] = await Promise.all([
      transaction.query<FeedbackRow>(
        `SELECT * FROM app.feedback_events
          WHERE tenant_id = $1 AND user_id = $2
          ORDER BY occurred_at DESC, id DESC LIMIT 50`,
        [this.context.tenantId, this.context.ownerUserId],
      ),
      transaction.query<PreferenceRow>(
        `SELECT * FROM app.preference_proposals
          WHERE tenant_id = $1 AND user_id = $2
          ORDER BY proposed_at DESC, id DESC`,
        [this.context.tenantId, this.context.ownerUserId],
      ),
    ]);
    return makeSnapshot(
      generatedAt,
      this.persistence,
      events.rows.map(rowToEvent),
      preferences.rows.map(rowToPreference),
    );
  }

  private assertContext(command: RecordCommand | DecideCommand): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new FeedbackPermissionError('Feedback repository context mismatch.');
    }
  }
}

export function analyzeDraftEdit(before: string, after: string): readonly DraftEditSignal[] {
  const previous = before.trim();
  const next = after.trim();
  if (previous === next) return [];
  const signals: DraftEditSignal[] = [];
  const difference = next.length - previous.length;
  if (difference <= -20 && next.length <= previous.length * 0.82) {
    signals.push({ key: 'voice.draft_length', value: 'shorter', rationale: 'کاربر متن را به‌طور معنادار کوتاه کرده است.' });
  } else if (difference >= 20 && next.length >= previous.length * 1.18) {
    signals.push({ key: 'voice.draft_length', value: 'longer', rationale: 'کاربر متن را به‌طور معنادار بسط داده است.' });
  }
  const previousHeadline = firstLine(previous);
  const nextHeadline = firstLine(next);
  if (previousHeadline.length - nextHeadline.length >= 8 && nextHeadline.length <= previousHeadline.length * 0.8) {
    signals.push({ key: 'voice.headline_length', value: 'shorter', rationale: 'کاربر تیتر را کوتاه‌تر کرده است.' });
  }
  if (headingCount(next) < headingCount(previous)) {
    signals.push({ key: 'voice.heading_density', value: 'lower', rationale: 'کاربر تعداد تیترهای میانی را کاهش داده است.' });
  }
  if (endsWithQuestion(previous) && !endsWithQuestion(next)) {
    signals.push({ key: 'voice.question_cta', value: 'omit', rationale: 'کاربر پرسش پایانی را حذف کرده است.' });
  }
  return signals;
}

function editEvents(command: RecordCommand): readonly FeedbackEvent[] {
  if (command.signals.length === 0) return [baseEvent(command, 0)];
  return command.signals.map((signal, index) => ({
    ...baseEvent(command, index),
    signalKey: signal.key,
    signalValue: signal.value,
  }));
}

function rejectionEvent(command: RecordCommand): FeedbackEvent {
  return {
    ...baseEvent(command, 0),
    eventType: 'rejected',
    signalKey: 'draft.rejection_reason',
    signalValue: command.rejectionReason,
  };
}

function baseEvent(command: RecordCommand, index: number): FeedbackEvent {
  return {
    id: deterministicUuid(`feedback:${command.tenantId}:${command.actorId}:${command.requestId}:${String(index)}`),
    tenantId: command.tenantId,
    userId: command.actorId,
    artifactType: 'draft',
    artifactId: command.draftId,
    eventType: command.eventType,
    occurredAt: command.occurredAt,
  };
}

function makeSnapshot(
  generatedAt: Date,
  persistence: FeedbackPersistence,
  events: readonly FeedbackEvent[],
  preferences: readonly PreferenceProposal[],
): FeedbackLearningSnapshot {
  const recentEvents = [...events]
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, 50);
  const orderedPreferences = [...preferences]
    .sort((left, right) => right.proposedAt.getTime() - left.proposedAt.getTime());
  return {
    generatedAt,
    persistence,
    summary: {
      recentEvents: recentEvents.length,
      proposed: orderedPreferences.filter((item) => item.status === 'proposed').length,
      applied: orderedPreferences.filter((item) => item.status === 'applied').length,
    },
    recentEvents,
    preferences: orderedPreferences,
  };
}

async function proposePreferenceWithin(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  signal: DraftEditSignal,
  command: RecordCommand,
): Promise<void> {
  const events = await transaction.query<Readonly<{ id: string }>>(
    `SELECT id FROM app.feedback_events
      WHERE tenant_id = $1 AND user_id = $2 AND event_type = 'edited'
        AND signal_key = $3 AND signal_value = $4::jsonb
      ORDER BY occurred_at, id`,
    [context.tenantId, context.ownerUserId, signal.key, JSON.stringify(signal.value)],
  );
  if (events.rows.length < 3) return;
  const active = await transaction.query(
    `SELECT id FROM app.preference_proposals
      WHERE tenant_id = $1 AND user_id = $2 AND preference_key = $3
        AND proposed_value = $4::jsonb AND status IN ('proposed', 'applied') LIMIT 1`,
    [context.tenantId, context.ownerUserId, signal.key, JSON.stringify(signal.value)],
  );
  if (active.rowCount === 1) return;
  const ids = events.rows.map((row) => row.id);
  const confidence = Math.min(0.95, ids.length / 5);
  await transaction.query(
    `INSERT INTO app.preference_proposals (
       id, tenant_id, user_id, preference_key, proposed_value,
       evidence_event_ids, rationale, confidence, status, proposed_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::uuid[], $7, $8, 'proposed', $9)`,
    [
      deterministicUuid(`preference:${context.tenantId}:${context.ownerUserId}:${signal.key}:${command.requestId}`),
      context.tenantId,
      context.ownerUserId,
      signal.key,
      JSON.stringify(signal.value),
      ids,
      preferenceRationale(signal, ids.length),
      confidence,
      command.occurredAt,
    ],
  );
}

async function insertFeedbackEvent(transaction: SqlTransaction, event: FeedbackEvent): Promise<void> {
  await transaction.query(
    `INSERT INTO app.feedback_events (
       id, tenant_id, user_id, artifact_type, artifact_id, event_type,
       signal_key, signal_value, satisfaction, regret, energy, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
     ON CONFLICT (tenant_id, id) DO NOTHING`,
    [
      event.id, event.tenantId, event.userId, event.artifactType, event.artifactId,
      event.eventType, event.signalKey ?? null,
      event.signalValue === undefined ? null : JSON.stringify(event.signalValue),
      event.satisfaction ?? null, event.regret ?? null, event.energy ?? null, event.occurredAt,
    ],
  );
}

async function reserveRequest(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  requestId: string,
  operation: string,
  fingerprint: string,
  occurredAt: Date,
): Promise<boolean> {
  const inserted = await transaction.query(
    `INSERT INTO app.feedback_learning_requests (
       tenant_id, owner_user_id, client_ref, operation, fingerprint, requested_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, owner_user_id, client_ref) DO NOTHING
     RETURNING client_ref`,
    [context.tenantId, context.ownerUserId, requestId, operation, fingerprint, occurredAt],
  );
  if (inserted.rowCount === 1) return false;
  const existing = await transaction.query<Readonly<{ fingerprint: string }>>(
    `SELECT fingerprint FROM app.feedback_learning_requests
      WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`,
    [context.tenantId, context.ownerUserId, requestId],
  );
  if (existing.rows[0]?.fingerprint !== fingerprint) throw new FeedbackConflictError('idempotency_mismatch');
  return true;
}

async function completeRequest(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  requestId: string,
  result: unknown,
): Promise<void> {
  await transaction.query(
    `UPDATE app.feedback_learning_requests SET result_snapshot = $4::jsonb
      WHERE tenant_id = $1 AND owner_user_id = $2 AND client_ref = $3`,
    [context.tenantId, context.ownerUserId, requestId, JSON.stringify(result)],
  );
}

async function appendLearningEvents(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  command: RecordCommand | DecideCommand,
  eventType: string,
): Promise<void> {
  const resourceId = 'draftId' in command ? command.draftId : command.proposalId;
  const resourceType = 'draftId' in command ? 'draft' : 'preference_proposal';
  const metadata = JSON.stringify({ requestId: command.requestId, operation: eventType });
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, 'personal_understanding', $3, $6::jsonb, $7)`,
    [context.tenantId, context.ownerUserId, eventType, resourceType, resourceId, metadata, command.occurredAt],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [context.tenantId, resourceType, resourceId, eventType, metadata, command.occurredAt],
  );
}

function rowToEvent(row: FeedbackRow): FeedbackEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    userId: row.user_id as UserId,
    artifactType: row.artifact_type,
    artifactId: row.artifact_id,
    eventType: row.event_type,
    ...(row.signal_key !== null ? { signalKey: row.signal_key, signalValue: row.signal_value } : {}),
    ...(row.satisfaction !== null ? { satisfaction: row.satisfaction as 1 | 2 | 3 | 4 | 5 } : {}),
    ...(row.regret !== null ? { regret: row.regret as 1 | 2 | 3 | 4 | 5 } : {}),
    ...(row.energy !== null ? { energy: row.energy as 1 | 2 | 3 | 4 | 5 } : {}),
    occurredAt: toDate(row.occurred_at),
  };
}

function rowToPreference(row: PreferenceRow): PreferenceProposal {
  const confidence = Number(row.confidence);
  if (!Number.isFinite(confidence) || !Array.isArray(row.evidence_event_ids)) {
    throw new Error('Stored preference proposal is invalid.');
  }
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    userId: row.user_id as UserId,
    preferenceKey: row.preference_key,
    proposedValue: row.proposed_value,
    evidenceEventIds: row.evidence_event_ids.map(String),
    rationale: row.rationale,
    confidence,
    status: row.status,
    proposedAt: toDate(row.proposed_at),
    ...(row.decided_at ? { decidedAt: toDate(row.decided_at) } : {}),
    ...(row.decided_by ? { decidedBy: row.decided_by as UserId } : {}),
  };
}

function recordFingerprint(command: RecordCommand): string {
  return hash(JSON.stringify({
    operation: command.eventType,
    draftId: command.draftId,
    afterBodyHash: command.afterBodyHash,
    rejectionReason: command.rejectionReason,
  }));
}

function decisionFingerprint(command: DecideCommand): string {
  return hash(JSON.stringify({ operation: 'decide', proposalId: command.proposalId, decision: command.decision }));
}

function preferenceRationale(signal: DraftEditSignal, count: number): string {
  return `${String(count)} ویرایش هم‌جهت ثبت شده است. ${signal.rationale} این فقط یک پیشنهاد است و بدون تأیید مالک اعمال نمی‌شود.`;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/u).find((line) => line.trim().length > 0)?.trim() ?? '';
}

function headingCount(value: string): number {
  return value.split(/\r?\n/u).filter((line) => /^#{1,6}\s+/u.test(line.trim())).length;
}

function endsWithQuestion(value: string): boolean {
  return /[؟?]\s*$/u.test(value);
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new FeedbackValidationError('Feedback request id is invalid.');
  }
}

function deterministicUuid(seed: string): string {
  const chars = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = '8';
  const value = chars.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableValue(value: unknown): string {
  return JSON.stringify(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Stored feedback date is invalid.');
  return date;
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}
