import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';
import type { WorkbenchApprovalRepository } from '../workbench/approval-repository.js';
import type { AttentionBudget } from './strategy.js';

export type DecisionContextPersistence = 'memory' | 'postgres';

export type EditableDecisionContext = Readonly<{
  attentionBudget: AttentionBudget;
}>;

export type DecisionContextSnapshot = EditableDecisionContext & Readonly<{
  policyVersion: 'decision-context-v1';
  revision: number;
  contextHash: string;
  updatedAt: Date;
  persistence: DecisionContextPersistence;
}>;

export type SaveDecisionContextCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  expectedRevision: number;
  value: EditableDecisionContext;
  occurredAt: Date;
}>;

export type SaveDecisionContextResult = Readonly<{
  outcome: 'saved' | 'already_saved';
  snapshot: DecisionContextSnapshot;
}>;

export class DecisionContextValidationError extends Error {}
export class DecisionContextPermissionError extends Error {}
export class DecisionContextConflictError extends Error {
  public constructor(public readonly reason: 'revision_changed' | 'idempotency_mismatch') {
    super(`Decision context conflict: ${reason}`);
  }
}

export interface DecisionContextRepository {
  readonly persistence: DecisionContextPersistence;
  find(): Promise<DecisionContextSnapshot>;
  save(command: SaveDecisionContextCommand): Promise<SaveDecisionContextResult>;
}

export class DecisionContextService {
  public constructor(
    private readonly repository: DecisionContextRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public snapshot(actorId: UserId): Promise<DecisionContextSnapshot> {
    this.assertOwner(actorId);
    return this.repository.find();
  }

  public save(input: Omit<SaveDecisionContextCommand, 'tenantId'>): Promise<SaveDecisionContextResult> {
    this.assertOwner(input.actorId);
    validateDecisionContext(input.value);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(input.requestId)) {
      throw new DecisionContextValidationError('Decision context request id is invalid.');
    }
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new DecisionContextValidationError('Decision context revision is invalid.');
    }
    return this.repository.save({ ...input, tenantId: this.identity.tenantId });
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) throw new DecisionContextPermissionError();
  }
}

export class InMemoryDecisionContextRepository implements DecisionContextRepository {
  public readonly persistence = 'memory' as const;
  #snapshot: DecisionContextSnapshot;
  readonly #requests = new Map<string, Readonly<{
    fingerprint: string;
    snapshot: DecisionContextSnapshot;
  }>>();

  public constructor(
    initial: DecisionContextSnapshot,
    private readonly approvals?: Pick<WorkbenchApprovalRepository, 'invalidateDecisionContext'>,
  ) {
    this.#snapshot = { ...initial, persistence: this.persistence };
  }

  public find(): Promise<DecisionContextSnapshot> {
    return Promise.resolve(this.#snapshot);
  }

  public async save(command: SaveDecisionContextCommand): Promise<SaveDecisionContextResult> {
    const fingerprint = requestFingerprint(command);
    const previous = this.#requests.get(command.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new DecisionContextConflictError('idempotency_mismatch');
      }
      return { outcome: 'already_saved', snapshot: previous.snapshot };
    }
    if (command.expectedRevision !== this.#snapshot.revision) {
      throw new DecisionContextConflictError('revision_changed');
    }
    const revision = command.expectedRevision + 1;
    this.#snapshot = createDecisionContextSnapshot(
      command.value,
      revision,
      command.occurredAt,
      this.persistence,
    );
    await this.approvals?.invalidateDecisionContext(revision, command.occurredAt);
    this.#requests.set(command.requestId, { fingerprint, snapshot: this.#snapshot });
    return { outcome: 'saved', snapshot: this.#snapshot };
  }
}

type DecisionContextRow = Readonly<{
  revision: string | number;
  available_minutes: string | number;
  maximum_energy_cost: string | number;
  attention_capacity: string | number;
  visibility_tolerance: string | number;
  emotional_bandwidth: string | number;
  updated_at: Date | string;
}>;

type RequestRow = Readonly<{
  request_sha256: string;
  result_snapshot: unknown;
}>;

export class PostgresDecisionContextRepository implements DecisionContextRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{
      tenantId: string;
      ownerUserId: string;
      workflowId: string;
    }>,
    private readonly fallback: DecisionContextSnapshot,
  ) {}

  public find(): Promise<DecisionContextSnapshot> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      return (await this.findWithin(transaction)) ?? {
        ...this.fallback,
        persistence: this.persistence,
      };
    });
  }

  public save(command: SaveDecisionContextCommand): Promise<SaveDecisionContextResult> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const fingerprint = requestFingerprint(command);
      const reserved = await transaction.query(
        `INSERT INTO app.decision_context_requests (
           tenant_id, owner_user_id, request_id, request_sha256, requested_at
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, owner_user_id, request_id) DO NOTHING
         RETURNING request_id`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId, fingerprint, command.occurredAt],
      );
      if (reserved.rowCount === 0) {
        const existing = await transaction.query<RequestRow>(
          `SELECT request_sha256, result_snapshot
             FROM app.decision_context_requests
            WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
          [this.context.tenantId, this.context.ownerUserId, command.requestId],
        );
        const row = existing.rows[0];
        if (!row || row.request_sha256 !== fingerprint || !row.result_snapshot) {
          throw new DecisionContextConflictError('idempotency_mismatch');
        }
        return { outcome: 'already_saved', snapshot: parseStoredSnapshot(row.result_snapshot) };
      }

      const state = await transaction.query<{ revision: string | number }>(
        `SELECT revision FROM app.decision_context_states
          WHERE tenant_id = $1 AND owner_user_id = $2 FOR UPDATE`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      const currentRevision = state.rows[0] ? Number(state.rows[0].revision) : this.fallback.revision;
      if (currentRevision !== command.expectedRevision) {
        throw new DecisionContextConflictError('revision_changed');
      }
      const revision = currentRevision + 1;
      const budget = command.value.attentionBudget;
      const updated = await transaction.query(
        `INSERT INTO app.decision_context_states (
           tenant_id, owner_user_id, revision, available_minutes, maximum_energy_cost,
           attention_capacity, visibility_tolerance, emotional_bandwidth, updated_by, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $2, $9)
         ON CONFLICT (tenant_id, owner_user_id) DO UPDATE SET
           revision = EXCLUDED.revision,
           available_minutes = EXCLUDED.available_minutes,
           maximum_energy_cost = EXCLUDED.maximum_energy_cost,
           attention_capacity = EXCLUDED.attention_capacity,
           visibility_tolerance = EXCLUDED.visibility_tolerance,
           emotional_bandwidth = EXCLUDED.emotional_bandwidth,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXCLUDED.updated_at
         WHERE app.decision_context_states.revision = $10`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          revision,
          budget.availableMinutes,
          budget.maximumEnergyCost,
          budget.attentionCapacity,
          budget.visibilityTolerance,
          budget.emotionalBandwidth,
          command.occurredAt,
          currentRevision,
        ],
      );
      if (updated.rowCount !== 1) throw new DecisionContextConflictError('revision_changed');

      await transaction.query(
        `UPDATE app.workbench_states
            SET revision = 1,
                decision_context_revision = $4,
                status = 'awaiting_approval',
                approved_action_ref = NULL,
                approved_evidence_ids = '{}'::text[],
                approved_by = NULL,
                approved_at = NULL,
                approved_context_sha256 = NULL,
                decision_window_ends_at = NULL,
                updated_at = $5
          WHERE tenant_id = $1 AND owner_user_id = $2 AND workflow_id = $3`,
        [this.context.tenantId, this.context.ownerUserId, this.context.workflowId, revision, command.occurredAt],
      );

      const snapshot = createDecisionContextSnapshot(
        command.value,
        revision,
        command.occurredAt,
        this.persistence,
      );
      await transaction.query(
        `UPDATE app.decision_context_requests SET result_snapshot = $4::jsonb
          WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          command.requestId,
          JSON.stringify(serializeSnapshot(snapshot)),
        ],
      );
      await appendAuditAndOutbox(transaction, this.context, command, snapshot);
      return { outcome: 'saved', snapshot };
    });
  }

  private async findWithin(transaction: SqlTransaction): Promise<DecisionContextSnapshot | null> {
    const result = await transaction.query<DecisionContextRow>(
      `SELECT revision, available_minutes, maximum_energy_cost, attention_capacity,
              visibility_tolerance, emotional_bandwidth, updated_at
         FROM app.decision_context_states
        WHERE tenant_id = $1 AND owner_user_id = $2`,
      [this.context.tenantId, this.context.ownerUserId],
    );
    return result.rows[0] ? rowToSnapshot(result.rows[0], this.persistence) : null;
  }
}

export function defaultDecisionContext(
  updatedAt: Date = new Date(0),
  persistence: DecisionContextPersistence = 'memory',
): DecisionContextSnapshot {
  return createDecisionContextSnapshot(
    {
      attentionBudget: {
        availableMinutes: 150,
        maximumEnergyCost: 3,
        attentionCapacity: 3,
        visibilityTolerance: 4,
        emotionalBandwidth: 3,
      },
    },
    1,
    updatedAt,
    persistence,
  );
}

export function validateDecisionContext(value: EditableDecisionContext): EditableDecisionContext {
  const budget = value.attentionBudget;
  if (!Number.isSafeInteger(budget.availableMinutes) || budget.availableMinutes < 0 || budget.availableMinutes > 10_080) {
    throw new DecisionContextValidationError('Available minutes must be between 0 and 10080.');
  }
  for (const [label, scale] of Object.entries({
    maximumEnergyCost: budget.maximumEnergyCost,
    attentionCapacity: budget.attentionCapacity,
    visibilityTolerance: budget.visibilityTolerance,
    emotionalBandwidth: budget.emotionalBandwidth,
  })) {
    if (!Number.isInteger(scale) || scale < 1 || scale > 5) {
      throw new DecisionContextValidationError(`${label} must be between 1 and 5.`);
    }
  }
  return value;
}

export function decisionContextHash(input: Readonly<{
  revision: number;
  attentionBudget: AttentionBudget;
}>): string {
  return createHash('sha256').update(JSON.stringify({
    policyVersion: 'decision-context-v1',
    revision: input.revision,
    attentionBudget: canonicalAttentionBudget(input.attentionBudget),
  })).digest('hex');
}

function createDecisionContextSnapshot(
  value: EditableDecisionContext,
  revision: number,
  updatedAt: Date,
  persistence: DecisionContextPersistence,
): DecisionContextSnapshot {
  validateDecisionContext(value);
  const snapshot = {
    policyVersion: 'decision-context-v1' as const,
    revision,
    attentionBudget: { ...value.attentionBudget },
  };
  return {
    ...snapshot,
    contextHash: decisionContextHash(snapshot),
    updatedAt,
    persistence,
  };
}

function requestFingerprint(command: SaveDecisionContextCommand): string {
  return createHash('sha256').update(JSON.stringify({
    tenantId: command.tenantId,
    actorId: command.actorId,
    expectedRevision: command.expectedRevision,
    value: { attentionBudget: canonicalAttentionBudget(command.value.attentionBudget) },
  })).digest('hex');
}

function canonicalAttentionBudget(budget: AttentionBudget): AttentionBudget {
  return {
    availableMinutes: budget.availableMinutes,
    maximumEnergyCost: budget.maximumEnergyCost,
    attentionCapacity: budget.attentionCapacity,
    visibilityTolerance: budget.visibilityTolerance,
    emotionalBandwidth: budget.emotionalBandwidth,
  };
}

function rowToSnapshot(
  row: DecisionContextRow,
  persistence: DecisionContextPersistence,
): DecisionContextSnapshot {
  const updatedAt = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
  const value: EditableDecisionContext = {
    attentionBudget: {
      availableMinutes: numberValue(row.available_minutes),
      maximumEnergyCost: decisionScale(row.maximum_energy_cost),
      attentionCapacity: decisionScale(row.attention_capacity),
      visibilityTolerance: decisionScale(row.visibility_tolerance),
      emotionalBandwidth: decisionScale(row.emotional_bandwidth),
    },
  };
  const revision = numberValue(row.revision);
  if (revision < 1 || Number.isNaN(updatedAt.getTime())) {
    throw new Error('Invalid decision context row.');
  }
  return createDecisionContextSnapshot(value, revision, updatedAt, persistence);
}

function serializeSnapshot(snapshot: DecisionContextSnapshot): Record<string, unknown> {
  return { ...snapshot, updatedAt: snapshot.updatedAt.toISOString() };
}

function parseStoredSnapshot(value: unknown): DecisionContextSnapshot {
  const record = objectValue(value);
  const budget = objectValue(record['attentionBudget']);
  const updatedAt = new Date(stringValue(record['updatedAt']));
  const snapshot = createDecisionContextSnapshot(
    {
      attentionBudget: {
        availableMinutes: numberValue(budget['availableMinutes']),
        maximumEnergyCost: decisionScale(budget['maximumEnergyCost']),
        attentionCapacity: decisionScale(budget['attentionCapacity']),
        visibilityTolerance: decisionScale(budget['visibilityTolerance']),
        emotionalBandwidth: decisionScale(budget['emotionalBandwidth']),
      },
    },
    numberValue(record['revision']),
    updatedAt,
    record['persistence'] === 'postgres' ? 'postgres' : 'memory',
  );
  if (snapshot.contextHash !== stringValue(record['contextHash'])) {
    throw new Error('Stored decision context hash is invalid.');
  }
  return snapshot;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid stored decision context.');
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid decision context string.');
  return value;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('Invalid decision context number.');
  return parsed;
}

function decisionScale(value: unknown): 1 | 2 | 3 | 4 | 5 {
  const parsed = numberValue(value);
  if (parsed < 1 || parsed > 5) throw new Error('Invalid decision context scale.');
  return parsed as 1 | 2 | 3 | 4 | 5;
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

async function appendAuditAndOutbox(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string; workflowId: string }>,
  command: SaveDecisionContextCommand,
  snapshot: DecisionContextSnapshot,
): Promise<void> {
  const metadata = JSON.stringify({
    requestId: command.requestId,
    revision: snapshot.revision,
    contextHash: snapshot.contextHash,
    invalidatedWorkflowId: context.workflowId,
  });
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, 'decision.context_saved', 'decision_context', $3,
       'strategy_reasoning', 'saved', $4::jsonb, $5)`,
    [
      context.tenantId,
      context.ownerUserId,
      context.ownerUserId,
      metadata,
      command.occurredAt,
    ],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'decision_context', $2, 'decision.context_saved', $3::jsonb, $4)`,
    [context.tenantId, context.ownerUserId, metadata, command.occurredAt],
  );
}
