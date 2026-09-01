import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';

export type WorkbenchApprovalRecord = Readonly<{
  workflowId: string;
  revision: number;
  strategyRevision: number;
  decisionContextRevision: number;
  decisionContextHash: string;
  decisionWindowEndsAt: Date;
  actionId: string;
  evidenceIds: readonly string[];
  approvedBy: string;
  approvedAt: Date;
}>;

export type WorkbenchApprovalCommand = Readonly<{
  actionId: string;
  evidenceIds: readonly string[];
  actorUserId: string;
  occurredAt: Date;
  expectedRevision: number;
  strategyRevision?: number;
  decisionContextRevision?: number;
  decisionContextHash: string;
  decisionWindowEndsAt: Date;
}>;

export type WorkbenchApprovalResult =
  | Readonly<{ outcome: 'approved' | 'already_approved'; record: WorkbenchApprovalRecord }>
  | Readonly<{ outcome: 'conflict'; record: WorkbenchApprovalRecord }>
  | Readonly<{ outcome: 'stale_context' }>;

export interface WorkbenchApprovalRepository {
  readonly persistence: 'memory' | 'postgres';
  find(strategyRevision?: number, decisionContextRevision?: number, at?: Date): Promise<WorkbenchApprovalRecord | null>;
  approve(command: WorkbenchApprovalCommand): Promise<WorkbenchApprovalResult>;
  invalidate(strategyRevision: number, occurredAt: Date): Promise<void>;
  invalidateDecisionContext(decisionContextRevision: number, occurredAt: Date): Promise<void>;
}

export class InMemoryWorkbenchApprovalRepository implements WorkbenchApprovalRepository {
  public readonly persistence = 'memory' as const;
  #record: WorkbenchApprovalRecord | null = null;

  public constructor(private readonly workflowId = 'workbench_today') {}

  public find(
    strategyRevision = 1,
    decisionContextRevision = 1,
    at: Date = new Date(),
  ): Promise<WorkbenchApprovalRecord | null> {
    return Promise.resolve(
      this.#record?.strategyRevision === strategyRevision &&
      this.#record.decisionContextRevision === decisionContextRevision &&
      this.#record.decisionWindowEndsAt.getTime() > at.getTime()
        ? this.#record
        : null,
    );
  }

  public approve(command: WorkbenchApprovalCommand): Promise<WorkbenchApprovalResult> {
    const strategyRevision = command.strategyRevision ?? 1;
    const decisionContextRevision = command.decisionContextRevision ?? 1;
    if (this.#record && (
      this.#record.strategyRevision !== strategyRevision ||
      this.#record.decisionContextRevision !== decisionContextRevision ||
      this.#record.decisionWindowEndsAt.getTime() <= command.occurredAt.getTime()
    )) {
      this.#record = null;
    }
    if (this.#record && this.#record.decisionContextHash !== command.decisionContextHash) {
      return Promise.resolve({ outcome: 'stale_context' });
    }
    if (this.#record) {
      return Promise.resolve(
        this.#record.actionId === command.actionId
          ? { outcome: 'already_approved', record: this.#record }
          : { outcome: 'conflict', record: this.#record },
      );
    }
    this.#record = {
      workflowId: this.workflowId,
      revision: command.expectedRevision + 1,
      strategyRevision,
      decisionContextRevision,
      decisionContextHash: command.decisionContextHash,
      decisionWindowEndsAt: command.decisionWindowEndsAt,
      actionId: command.actionId,
      evidenceIds: [...command.evidenceIds],
      approvedBy: command.actorUserId,
      approvedAt: command.occurredAt,
    };
    return Promise.resolve({ outcome: 'approved', record: this.#record });
  }

  public invalidate(strategyRevision: number, occurredAt: Date): Promise<void> {
    void occurredAt;
    if (this.#record && this.#record.strategyRevision < strategyRevision) this.#record = null;
    return Promise.resolve();
  }

  public invalidateDecisionContext(decisionContextRevision: number, occurredAt: Date): Promise<void> {
    void occurredAt;
    if (this.#record && this.#record.decisionContextRevision < decisionContextRevision) this.#record = null;
    return Promise.resolve();
  }
}

type ApprovalRow = Readonly<{
  workflow_id: string;
  revision: string | number;
  strategy_revision: string | number;
  decision_context_revision: string | number;
  approved_context_sha256: string;
  decision_window_ends_at: Date | string;
  approved_action_ref: string;
  approved_evidence_ids: unknown;
  approved_by: string;
  approved_at: Date | string;
}>;

export class PostgresWorkbenchApprovalRepository implements WorkbenchApprovalRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{
      tenantId: string;
      ownerUserId: string;
      workflowId: string;
    }>,
  ) {}

  public find(
    strategyRevision = 1,
    decisionContextRevision = 1,
    at: Date = new Date(),
  ): Promise<WorkbenchApprovalRecord | null> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<ApprovalRow>(
        `SELECT workflow_id, revision, strategy_revision, decision_context_revision,
                approved_context_sha256, decision_window_ends_at, approved_action_ref,
                approved_evidence_ids, approved_by, approved_at
           FROM app.workbench_states
          WHERE tenant_id = $1
            AND owner_user_id = $2
            AND workflow_id = $3
            AND strategy_revision = $4
            AND decision_context_revision = $5
            AND decision_window_ends_at > $6
            AND status = 'approved'`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          this.context.workflowId,
          strategyRevision,
          decisionContextRevision,
          at,
        ],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    });
  }

  public approve(command: WorkbenchApprovalCommand): Promise<WorkbenchApprovalResult> {
    return this.runner.transaction(async (transaction) => {
      const strategyRevision = command.strategyRevision ?? 1;
      const decisionContextRevision = command.decisionContextRevision ?? 1;
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(
        `INSERT INTO app.workbench_states (
           tenant_id, owner_user_id, workflow_id, definition_version, revision,
           strategy_revision, decision_context_revision, status
         ) VALUES ($1, $2, $3, 1, $4, $5, $6, 'awaiting_approval')
         ON CONFLICT (tenant_id, owner_user_id, workflow_id) DO UPDATE SET
           revision = 1,
           status = 'awaiting_approval',
           approved_action_ref = NULL,
           approved_evidence_ids = '{}'::text[],
           approved_by = NULL,
           approved_at = NULL,
           approved_context_sha256 = NULL,
           decision_window_ends_at = NULL,
           updated_at = $7
         WHERE app.workbench_states.status = 'approved'
           AND app.workbench_states.strategy_revision = $5
           AND app.workbench_states.decision_context_revision = $6
           AND app.workbench_states.decision_window_ends_at <= $7`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          this.context.workflowId,
          command.expectedRevision,
          strategyRevision,
          decisionContextRevision,
          command.occurredAt,
        ],
      );

      const updated = await transaction.query<ApprovalRow>(
        `UPDATE app.workbench_states
            SET status = 'approved',
                revision = revision + 1,
                approved_action_ref = $4,
                approved_evidence_ids = $5::text[],
                approved_by = $6,
                approved_at = $7,
                approved_context_sha256 = $8,
                decision_window_ends_at = $9,
                updated_at = $7
          WHERE tenant_id = $1
            AND owner_user_id = $2
            AND workflow_id = $3
            AND status = 'awaiting_approval'
            AND revision = $10
            AND strategy_revision = $11
            AND decision_context_revision = $12
        RETURNING workflow_id, revision, strategy_revision, decision_context_revision,
                  approved_context_sha256, decision_window_ends_at, approved_action_ref,
                  approved_evidence_ids, approved_by, approved_at`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          this.context.workflowId,
          command.actionId,
          command.evidenceIds,
          command.actorUserId,
          command.occurredAt,
          command.decisionContextHash,
          command.decisionWindowEndsAt,
          command.expectedRevision,
          strategyRevision,
          decisionContextRevision,
        ],
      );

      const updatedRow = updated.rows[0];
      if (updatedRow) {
        const record = toRecord(updatedRow);
        await this.appendAuditAndOutbox(transaction, record);
        return { outcome: 'approved', record };
      }

      const existing = await this.findWithin(transaction, strategyRevision, decisionContextRevision);
      if (!existing || existing.decisionContextHash !== command.decisionContextHash) {
        return { outcome: 'stale_context' };
      }
      return existing.actionId === command.actionId
        ? { outcome: 'already_approved', record: existing }
        : { outcome: 'conflict', record: existing };
    });
  }

  public invalidate(strategyRevision: number, occurredAt: Date): Promise<void> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(
        `UPDATE app.workbench_states
            SET revision = 1,
                strategy_revision = $4,
                status = 'awaiting_approval',
                approved_action_ref = NULL,
                approved_evidence_ids = '{}'::text[],
                approved_by = NULL,
                approved_at = NULL,
                approved_context_sha256 = NULL,
                decision_window_ends_at = NULL,
                updated_at = $5
          WHERE tenant_id = $1 AND owner_user_id = $2 AND workflow_id = $3
            AND strategy_revision < $4`,
        [this.context.tenantId, this.context.ownerUserId, this.context.workflowId, strategyRevision, occurredAt],
      );
    });
  }

  public invalidateDecisionContext(
    decisionContextRevision: number,
    occurredAt: Date,
  ): Promise<void> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
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
          WHERE tenant_id = $1 AND owner_user_id = $2 AND workflow_id = $3
            AND decision_context_revision < $4`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          this.context.workflowId,
          decisionContextRevision,
          occurredAt,
        ],
      );
    });
  }

  private async findWithin(
    transaction: SqlTransaction,
    strategyRevision: number,
    decisionContextRevision: number,
  ): Promise<WorkbenchApprovalRecord | null> {
    const result = await transaction.query<ApprovalRow>(
      `SELECT workflow_id, revision, strategy_revision, decision_context_revision,
              approved_context_sha256, decision_window_ends_at, approved_action_ref,
              approved_evidence_ids, approved_by, approved_at
         FROM app.workbench_states
        WHERE tenant_id = $1
          AND owner_user_id = $2
          AND workflow_id = $3
          AND strategy_revision = $4
          AND decision_context_revision = $5
          AND status = 'approved'`,
      [
        this.context.tenantId,
        this.context.ownerUserId,
        this.context.workflowId,
        strategyRevision,
        decisionContextRevision,
      ],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  private async appendAuditAndOutbox(
    transaction: SqlTransaction,
    record: WorkbenchApprovalRecord,
  ): Promise<void> {
    const metadata = JSON.stringify({
      workflowId: record.workflowId,
      actionId: record.actionId,
      evidenceIds: record.evidenceIds,
      revision: record.revision,
      strategyRevision: record.strategyRevision,
      decisionContextRevision: record.decisionContextRevision,
      decisionContextHash: record.decisionContextHash,
      decisionWindowEndsAt: record.decisionWindowEndsAt.toISOString(),
    });
    await transaction.query(
      `INSERT INTO app.audit_events (
         tenant_id, actor_user_id, event_type, resource_type, resource_id,
         purpose, decision, metadata, occurred_at
       ) VALUES ($1, $2, 'workbench.action_approved', 'workbench', $3,
         'strategy_reasoning', 'approved', $4::jsonb, $5)`,
      [
        this.context.tenantId,
        record.approvedBy,
        record.workflowId,
        metadata,
        record.approvedAt,
      ],
    );
    await transaction.query(
      `INSERT INTO app.outbox_events (
         tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
       ) VALUES ($1, 'workbench', $2, 'workbench.action_approved', $3::jsonb, $4)`,
      [this.context.tenantId, record.workflowId, metadata, record.approvedAt],
    );
  }
}

async function setTenantContext(
  transaction: SqlTransaction,
  tenantId: string,
): Promise<void> {
  await transaction.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

function toRecord(row: ApprovalRow): WorkbenchApprovalRecord {
  const revision = typeof row.revision === 'number' ? row.revision : Number(row.revision);
  const strategyRevision = typeof row.strategy_revision === 'number'
    ? row.strategy_revision
    : Number(row.strategy_revision);
  const decisionContextRevision = typeof row.decision_context_revision === 'number'
    ? row.decision_context_revision
    : Number(row.decision_context_revision);
  const approvedAt = row.approved_at instanceof Date
    ? row.approved_at
    : new Date(row.approved_at);
  const decisionWindowEndsAt = row.decision_window_ends_at instanceof Date
    ? row.decision_window_ends_at
    : new Date(row.decision_window_ends_at);
  if (
    !Number.isSafeInteger(revision) || revision < 1 ||
    !Number.isSafeInteger(strategyRevision) || strategyRevision < 1 ||
    !Number.isSafeInteger(decisionContextRevision) || decisionContextRevision < 1 ||
    !/^[0-9a-f]{64}$/u.test(row.approved_context_sha256) ||
    Number.isNaN(approvedAt.getTime()) || Number.isNaN(decisionWindowEndsAt.getTime())
  ) {
    throw new Error('Invalid workbench approval row.');
  }
  return {
    workflowId: row.workflow_id,
    revision,
    strategyRevision,
    decisionContextRevision,
    decisionContextHash: row.approved_context_sha256,
    decisionWindowEndsAt,
    actionId: row.approved_action_ref,
    evidenceIds: stringArray(row.approved_evidence_ids),
    approvedBy: row.approved_by,
    approvedAt,
  };
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('Invalid workbench approval evidence IDs.');
  }
  return value as string[];
}
