import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';
import type { TenantId, UserId } from '../kernel/identity.js';
import type { WorkbenchApprovalRepository } from '../workbench/approval-repository.js';

export type StrategyContextPersistence = 'memory' | 'postgres';

export type EditableStrategyContext = Readonly<{
  goal: Readonly<{
    title: string;
    outcome: string;
    priority: 1 | 2 | 3 | 4 | 5;
    successMetrics: readonly string[];
    horizon: string;
  }>;
  desiredPositioning: Readonly<{
    audience: string;
    desiredPerception: string;
    differentiation: string;
    proofPoints: readonly string[];
    horizon: string;
  }>;
}>;

export type StrategyContextSnapshot = EditableStrategyContext & Readonly<{
  goalId: string;
  positioningId: string;
  revision: number;
  updatedAt: Date;
  persistence: StrategyContextPersistence;
}>;

export type SaveStrategyContextCommand = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  requestId: string;
  expectedRevision: number;
  value: EditableStrategyContext;
  occurredAt: Date;
}>;

export type SaveStrategyContextResult = Readonly<{
  outcome: 'saved' | 'already_saved';
  snapshot: StrategyContextSnapshot;
}>;

export class StrategyContextValidationError extends Error {}

export class StrategyContextPermissionError extends Error {}

export class StrategyContextConflictError extends Error {
  public constructor(public readonly reason: 'revision_changed' | 'idempotency_mismatch') {
    super(`Strategy context conflict: ${reason}`);
  }
}

export interface StrategyContextRepository {
  readonly persistence: StrategyContextPersistence;
  find(): Promise<StrategyContextSnapshot>;
  save(command: SaveStrategyContextCommand): Promise<SaveStrategyContextResult>;
}

export class StrategyContextService {
  public constructor(
    private readonly repository: StrategyContextRepository,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public snapshot(actorId: UserId): Promise<StrategyContextSnapshot> {
    this.assertOwner(actorId);
    return this.repository.find();
  }

  public save(input: Omit<SaveStrategyContextCommand, 'tenantId'>): Promise<SaveStrategyContextResult> {
    this.assertOwner(input.actorId);
    validateStrategyContext(input.value);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(input.requestId)) {
      throw new StrategyContextValidationError('Strategy request id is invalid.');
    }
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new StrategyContextValidationError('Strategy revision is invalid.');
    }
    return this.repository.save({ ...input, tenantId: this.identity.tenantId });
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) throw new StrategyContextPermissionError();
  }
}

export class InMemoryStrategyContextRepository implements StrategyContextRepository {
  public readonly persistence = 'memory' as const;
  #snapshot: StrategyContextSnapshot;
  readonly #requests = new Map<string, Readonly<{ fingerprint: string; snapshot: StrategyContextSnapshot }>>();

  public constructor(
    initial: StrategyContextSnapshot,
    private readonly approvalRepository?: Pick<WorkbenchApprovalRepository, 'invalidate'>,
  ) {
    this.#snapshot = { ...initial, persistence: this.persistence };
  }

  public find(): Promise<StrategyContextSnapshot> {
    return Promise.resolve(this.#snapshot);
  }

  public async save(command: SaveStrategyContextCommand): Promise<SaveStrategyContextResult> {
    const fingerprint = strategyFingerprint(command);
    const previous = this.#requests.get(command.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new StrategyContextConflictError('idempotency_mismatch');
      }
      return { outcome: 'already_saved', snapshot: previous.snapshot };
    }
    if (command.expectedRevision !== this.#snapshot.revision) {
      throw new StrategyContextConflictError('revision_changed');
    }
    const revision = command.expectedRevision + 1;
    this.#snapshot = {
      ...command.value,
      goalId: `goal_revision_${String(revision)}`,
      positioningId: `positioning_revision_${String(revision)}`,
      revision,
      updatedAt: command.occurredAt,
      persistence: this.persistence,
    };
    await this.approvalRepository?.invalidate(revision, command.occurredAt);
    this.#requests.set(command.requestId, { fingerprint, snapshot: this.#snapshot });
    return { outcome: 'saved', snapshot: this.#snapshot };
  }
}

type StrategyRow = Readonly<{
  goal_id: string;
  positioning_id: string;
  revision: string | number;
  updated_at: Date | string;
  title: string;
  outcome: string;
  priority: string | number;
  success_metrics: unknown;
  horizon: string | null;
  dimensions: unknown;
}>;

type RequestRow = Readonly<{
  fingerprint: string;
  result_snapshot: unknown;
}>;

export class PostgresStrategyContextRepository implements StrategyContextRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{
      tenantId: string;
      ownerUserId: string;
      workflowId: string;
    }>,
    private readonly fallback: StrategyContextSnapshot,
  ) {}

  public find(): Promise<StrategyContextSnapshot> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      return (await this.findWithin(transaction)) ?? { ...this.fallback, persistence: this.persistence };
    });
  }

  public save(command: SaveStrategyContextCommand): Promise<SaveStrategyContextResult> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const fingerprint = strategyFingerprint(command);
      const reserved = await transaction.query(
        `INSERT INTO app.strategy_context_requests (
           tenant_id, owner_user_id, request_id, fingerprint, requested_at
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, owner_user_id, request_id) DO NOTHING
         RETURNING request_id`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId, fingerprint, command.occurredAt],
      );
      if (reserved.rowCount === 0) {
        const existing = await transaction.query<RequestRow>(
          `SELECT fingerprint, result_snapshot
             FROM app.strategy_context_requests
            WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
          [this.context.tenantId, this.context.ownerUserId, command.requestId],
        );
        const row = existing.rows[0];
        if (!row || row.fingerprint !== fingerprint || !row.result_snapshot) {
          throw new StrategyContextConflictError('idempotency_mismatch');
        }
        return { outcome: 'already_saved', snapshot: parseStoredSnapshot(row.result_snapshot) };
      }

      const state = await transaction.query<{ revision: string | number }>(
        `SELECT revision FROM app.strategy_context_states
          WHERE tenant_id = $1 AND owner_user_id = $2 FOR UPDATE`,
        [this.context.tenantId, this.context.ownerUserId],
      );
      const currentRevision = state.rows[0] ? Number(state.rows[0].revision) : this.fallback.revision;
      if (currentRevision !== command.expectedRevision) {
        throw new StrategyContextConflictError('revision_changed');
      }

      const goal = await transaction.query<{ id: string }>(
        `INSERT INTO app.goals (
           tenant_id, owner_user_id, title, outcome, priority, success_metrics,
           status, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'active', $7)
         RETURNING id`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          command.value.goal.title,
          command.value.goal.outcome,
          command.value.goal.priority,
          JSON.stringify(command.value.goal.successMetrics),
          command.occurredAt,
        ],
      );
      const positioning = await transaction.query<{ id: string }>(
        `INSERT INTO app.positioning_snapshots (
           tenant_id, subject_user_id, layer, horizon, dimensions, valid_from
         ) VALUES ($1, $2, 'desired_positioning', $3, $4::jsonb, $5)
         RETURNING id`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          command.value.desiredPositioning.horizon,
          JSON.stringify({
            goalHorizon: command.value.goal.horizon,
            audience: command.value.desiredPositioning.audience,
            desiredPerception: command.value.desiredPositioning.desiredPerception,
            differentiation: command.value.desiredPositioning.differentiation,
            proofPoints: command.value.desiredPositioning.proofPoints,
          }),
          command.occurredAt,
        ],
      );
      const goalId = goal.rows[0]?.id;
      const positioningId = positioning.rows[0]?.id;
      if (!goalId || !positioningId) throw new Error('Strategy context insert returned no identifiers.');
      const revision = currentRevision + 1;
      const updated = await transaction.query(
        `INSERT INTO app.strategy_context_states (
           tenant_id, owner_user_id, current_goal_id, current_positioning_id,
           revision, updated_by, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $2, $6)
         ON CONFLICT (tenant_id, owner_user_id) DO UPDATE SET
           current_goal_id = EXCLUDED.current_goal_id,
           current_positioning_id = EXCLUDED.current_positioning_id,
           revision = EXCLUDED.revision,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXCLUDED.updated_at
         WHERE app.strategy_context_states.revision = $7`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          goalId,
          positioningId,
          revision,
          command.occurredAt,
          currentRevision,
        ],
      );
      if (updated.rowCount !== 1) throw new StrategyContextConflictError('revision_changed');

      await transaction.query(
        `UPDATE app.positioning_snapshots
            SET valid_to = $3
          WHERE tenant_id = $1 AND subject_user_id = $2
            AND layer = 'desired_positioning' AND id <> $4 AND valid_to IS NULL`,
        [this.context.tenantId, this.context.ownerUserId, command.occurredAt, positioningId],
      );
      await transaction.query(
        `INSERT INTO app.workbench_states (
           tenant_id, owner_user_id, workflow_id, definition_version, revision,
           strategy_revision, status, updated_at
         ) VALUES ($1, $2, $3, 1, 1, $4, 'awaiting_approval', $5)
         ON CONFLICT (tenant_id, owner_user_id, workflow_id) DO UPDATE SET
           revision = 1,
           strategy_revision = EXCLUDED.strategy_revision,
           status = 'awaiting_approval',
           approved_action_ref = NULL, approved_by = NULL, approved_at = NULL,
           updated_at = EXCLUDED.updated_at`,
        [this.context.tenantId, this.context.ownerUserId, this.context.workflowId, revision, command.occurredAt],
      );

      const snapshot: StrategyContextSnapshot = {
        ...command.value,
        goalId,
        positioningId,
        revision,
        updatedAt: command.occurredAt,
        persistence: this.persistence,
      };
      const stored = serializeSnapshot(snapshot);
      await transaction.query(
        `UPDATE app.strategy_context_requests SET result_snapshot = $4::jsonb
          WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId, JSON.stringify(stored)],
      );
      await appendAuditAndOutbox(transaction, this.context, command, snapshot);
      return { outcome: 'saved', snapshot };
    });
  }

  private async findWithin(transaction: SqlTransaction): Promise<StrategyContextSnapshot | null> {
    const result = await transaction.query<StrategyRow>(
      `SELECT s.current_goal_id AS goal_id,
              s.current_positioning_id AS positioning_id,
              s.revision, s.updated_at, g.title, g.outcome, g.priority,
              g.success_metrics, p.horizon, p.dimensions
         FROM app.strategy_context_states s
         JOIN app.goals g ON g.tenant_id = s.tenant_id AND g.id = s.current_goal_id
         JOIN app.positioning_snapshots p
           ON p.tenant_id = s.tenant_id AND p.id = s.current_positioning_id
        WHERE s.tenant_id = $1 AND s.owner_user_id = $2`,
      [this.context.tenantId, this.context.ownerUserId],
    );
    return result.rows[0] ? rowToSnapshot(result.rows[0], this.persistence) : null;
  }
}

export function defaultStrategyContext(
  tenantId: TenantId,
  ownerUserId: UserId,
  updatedAt: Date = new Date(0),
): StrategyContextSnapshot {
  void tenantId;
  void ownerUserId;
  return {
    goalId: '00000000-0000-4000-8000-000000000301',
    positioningId: '00000000-0000-4000-8000-000000000302',
    revision: 1,
    updatedAt,
    persistence: 'memory',
    goal: {
      title: 'تقویت جایگاه «مشاور قابل‌اعتماد»',
      outcome: 'ایجاد تعامل‌های عمیق و قابل‌ردیابی با ذی‌نفعان اصلی',
      priority: 5,
      successMetrics: ['کیفیت تعامل', 'فرصت‌های ایجادشده', 'تغییر ادراک'],
      horizon: 'سه ماه آینده',
    },
    desiredPositioning: {
      audience: 'بنیان‌گذاران و تصمیم‌گیران کسب‌وکار',
      desiredPerception: 'مشاوری قابل‌اعتماد، عمیق و صادق در شرایط ابهام',
      differentiation: 'ترکیب قضاوت انسانی، شواهد قابل‌ردیابی و پرهیز از نمایش‌گری',
      proofPoints: ['کیفیت گفت‌وگوهای خصوصی', 'تصمیم‌های مستند', 'روایت‌های مبتنی بر تجربه واقعی'],
      horizon: 'سه ماه آینده',
    },
  };
}

export function validateStrategyContext(value: EditableStrategyContext): EditableStrategyContext {
  requireText(value.goal.title, 3, 240, 'Goal title');
  requireText(value.goal.outcome, 3, 2000, 'Goal outcome');
  requireList(value.goal.successMetrics, 1, 8, 3, 240, 'Success metrics');
  requireText(value.goal.horizon, 3, 120, 'Goal horizon');
  if (!Number.isInteger(value.goal.priority) || value.goal.priority < 1 || value.goal.priority > 5) {
    throw new StrategyContextValidationError('Goal priority is invalid.');
  }
  requireText(value.desiredPositioning.audience, 3, 500, 'Positioning audience');
  requireText(value.desiredPositioning.desiredPerception, 3, 1000, 'Desired perception');
  requireText(value.desiredPositioning.differentiation, 3, 1000, 'Differentiation');
  requireList(value.desiredPositioning.proofPoints, 1, 8, 3, 500, 'Proof points');
  requireText(value.desiredPositioning.horizon, 3, 120, 'Positioning horizon');
  return value;
}

function requireText(value: string, min: number, max: number, label: string): void {
  const length = value.trim().length;
  if (length < min || length > max) throw new StrategyContextValidationError(`${label} is invalid.`);
}

function requireList(
  values: readonly string[],
  minItems: number,
  maxItems: number,
  minLength: number,
  maxLength: number,
  label: string,
): void {
  if (values.length < minItems || values.length > maxItems) {
    throw new StrategyContextValidationError(`${label} are invalid.`);
  }
  values.forEach((value) => {
    requireText(value, minLength, maxLength, label);
  });
}

function strategyFingerprint(command: SaveStrategyContextCommand): string {
  return JSON.stringify({
    tenantId: command.tenantId,
    actorId: command.actorId,
    expectedRevision: command.expectedRevision,
    value: command.value,
  });
}

function rowToSnapshot(row: StrategyRow, persistence: StrategyContextPersistence): StrategyContextSnapshot {
  const metrics = stringArray(row.success_metrics, 'success metrics');
  const dimensions = objectValue(row.dimensions, 'positioning dimensions');
  const proofPoints = stringArray(dimensions['proofPoints'], 'proof points');
  const updatedAt = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
  const revision = Number(row.revision);
  const priority = Number(row.priority);
  if (!Number.isSafeInteger(revision) || revision < 1 || ![1, 2, 3, 4, 5].includes(priority) || Number.isNaN(updatedAt.getTime())) {
    throw new Error('Invalid strategy context row.');
  }
  return {
    goalId: row.goal_id,
    positioningId: row.positioning_id,
    revision,
    updatedAt,
    persistence,
    goal: {
      title: row.title,
      outcome: row.outcome,
      priority: priority as 1 | 2 | 3 | 4 | 5,
      successMetrics: metrics,
      horizon: typeof dimensions['goalHorizon'] === 'string'
        ? dimensions['goalHorizon']
        : (row.horizon ?? ''),
    },
    desiredPositioning: {
      audience: stringValue(dimensions['audience']),
      desiredPerception: stringValue(dimensions['desiredPerception']),
      differentiation: stringValue(dimensions['differentiation']),
      proofPoints,
      horizon: row.horizon ?? '',
    },
  };
}

function serializeSnapshot(snapshot: StrategyContextSnapshot): Record<string, unknown> {
  return { ...snapshot, updatedAt: snapshot.updatedAt.toISOString() };
}

function parseStoredSnapshot(value: unknown): StrategyContextSnapshot {
  const record = objectValue(value, 'strategy request result');
  const goal = objectValue(record['goal'], 'goal');
  const positioning = objectValue(record['desiredPositioning'], 'desired positioning');
  const updatedAt = new Date(stringValue(record['updatedAt']));
  return {
    goalId: stringValue(record['goalId']),
    positioningId: stringValue(record['positioningId']),
    revision: Number(record['revision']),
    updatedAt,
    persistence: record['persistence'] === 'postgres' ? 'postgres' : 'memory',
    goal: {
      title: stringValue(goal['title']),
      outcome: stringValue(goal['outcome']),
      priority: Number(goal['priority']) as 1 | 2 | 3 | 4 | 5,
      successMetrics: stringArray(goal['successMetrics'], 'success metrics'),
      horizon: stringValue(goal['horizon']),
    },
    desiredPositioning: {
      audience: stringValue(positioning['audience']),
      desiredPerception: stringValue(positioning['desiredPerception']),
      differentiation: stringValue(positioning['differentiation']),
      proofPoints: stringArray(positioning['proofPoints'], 'proof points'),
      horizon: stringValue(positioning['horizon']),
    },
  };
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid strategy string.');
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

async function appendAuditAndOutbox(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string; workflowId: string }>,
  command: SaveStrategyContextCommand,
  snapshot: StrategyContextSnapshot,
): Promise<void> {
  const metadata = JSON.stringify({
    requestId: command.requestId,
    revision: snapshot.revision,
    goalId: snapshot.goalId,
    positioningId: snapshot.positioningId,
    invalidatedWorkflowId: context.workflowId,
  });
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, 'strategy.context_updated', 'strategy_context', $3,
       'strategy_reasoning', 'user_confirmed', $4::jsonb, $5)`,
    [context.tenantId, command.actorId, context.ownerUserId, metadata, command.occurredAt],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'strategy_context', $2, 'strategy.context_updated', $3::jsonb, $4)`,
    [context.tenantId, context.ownerUserId, metadata, command.occurredAt],
  );
}
