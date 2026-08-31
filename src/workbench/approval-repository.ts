import type { SqlTransaction, SqlTransactionRunner } from '../database/sql.js';

export type WorkbenchApprovalRecord = Readonly<{
  workflowId: string;
  revision: number;
  strategyRevision: number;
  actionId: string;
  approvedBy: string;
  approvedAt: Date;
}>;

export type WorkbenchApprovalCommand = Readonly<{
  actionId: string;
  actorUserId: string;
  occurredAt: Date;
  expectedRevision: number;
  strategyRevision?: number;
}>;

export type WorkbenchApprovalResult =
  | Readonly<{ outcome: 'approved' | 'already_approved'; record: WorkbenchApprovalRecord }>
  | Readonly<{ outcome: 'conflict'; record: WorkbenchApprovalRecord }>;

export interface WorkbenchApprovalRepository {
  readonly persistence: 'memory' | 'postgres';
  find(strategyRevision?: number): Promise<WorkbenchApprovalRecord | null>;
  approve(command: WorkbenchApprovalCommand): Promise<WorkbenchApprovalResult>;
  invalidate(strategyRevision: number, occurredAt: Date): Promise<void>;
}

export class InMemoryWorkbenchApprovalRepository implements WorkbenchApprovalRepository {
  public readonly persistence = 'memory' as const;
  #record: WorkbenchApprovalRecord | null = null;

  public constructor(private readonly workflowId = 'workbench_today') {}

  public find(strategyRevision = 1): Promise<WorkbenchApprovalRecord | null> {
    return Promise.resolve(
      this.#record?.strategyRevision === strategyRevision ? this.#record : null,
    );
  }

  public approve(command: WorkbenchApprovalCommand): Promise<WorkbenchApprovalResult> {
    const strategyRevision = command.strategyRevision ?? 1;
    if (this.#record && this.#record.strategyRevision !== strategyRevision) {
      this.#record = null;
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
      actionId: command.actionId,
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
}

type ApprovalRow = Readonly<{
  workflow_id: string;
  revision: string | number;
  strategy_revision: string | number;
  approved_action_ref: string;
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

  public find(strategyRevision = 1): Promise<WorkbenchApprovalRecord | null> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      const result = await transaction.query<ApprovalRow>(
        `SELECT workflow_id, revision, strategy_revision, approved_action_ref, approved_by, approved_at
           FROM app.workbench_states
          WHERE tenant_id = $1
            AND owner_user_id = $2
            AND workflow_id = $3
            AND strategy_revision = $4
            AND status = 'approved'`,
        [this.context.tenantId, this.context.ownerUserId, this.context.workflowId, strategyRevision],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    });
  }

  public approve(command: WorkbenchApprovalCommand): Promise<WorkbenchApprovalResult> {
    return this.runner.transaction(async (transaction) => {
      const strategyRevision = command.strategyRevision ?? 1;
      await setTenantContext(transaction, this.context.tenantId);
      await transaction.query(
        `INSERT INTO app.workbench_states (
           tenant_id, owner_user_id, workflow_id, definition_version, revision,
           strategy_revision, status
         ) VALUES ($1, $2, $3, 1, $4, $5, 'awaiting_approval')
         ON CONFLICT (tenant_id, owner_user_id, workflow_id) DO NOTHING`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          this.context.workflowId,
          command.expectedRevision,
          strategyRevision,
        ],
      );

      const updated = await transaction.query<ApprovalRow>(
        `UPDATE app.workbench_states
            SET status = 'approved',
                revision = revision + 1,
                approved_action_ref = $4,
                approved_by = $5,
                approved_at = $6,
                updated_at = $6
          WHERE tenant_id = $1
            AND owner_user_id = $2
            AND workflow_id = $3
            AND status = 'awaiting_approval'
            AND revision = $7
            AND strategy_revision = $8
        RETURNING workflow_id, revision, strategy_revision, approved_action_ref, approved_by, approved_at`,
        [
          this.context.tenantId,
          this.context.ownerUserId,
          this.context.workflowId,
          command.actionId,
          command.actorUserId,
          command.occurredAt,
          command.expectedRevision,
          strategyRevision,
        ],
      );

      const updatedRow = updated.rows[0];
      if (updatedRow) {
        const record = toRecord(updatedRow);
        await this.appendAuditAndOutbox(transaction, record);
        return { outcome: 'approved', record };
      }

      const existing = await this.findWithin(transaction, strategyRevision);
      if (!existing) throw new Error('Workbench approval strategy changed during approval.');
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
                approved_by = NULL,
                approved_at = NULL,
                updated_at = $5
          WHERE tenant_id = $1 AND owner_user_id = $2 AND workflow_id = $3
            AND strategy_revision < $4`,
        [this.context.tenantId, this.context.ownerUserId, this.context.workflowId, strategyRevision, occurredAt],
      );
    });
  }

  private async findWithin(
    transaction: SqlTransaction,
    strategyRevision: number,
  ): Promise<WorkbenchApprovalRecord | null> {
    const result = await transaction.query<ApprovalRow>(
      `SELECT workflow_id, revision, strategy_revision, approved_action_ref, approved_by, approved_at
         FROM app.workbench_states
        WHERE tenant_id = $1
          AND owner_user_id = $2
          AND workflow_id = $3
          AND strategy_revision = $4
          AND status = 'approved'`,
      [this.context.tenantId, this.context.ownerUserId, this.context.workflowId, strategyRevision],
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
      revision: record.revision,
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
  const approvedAt = row.approved_at instanceof Date
    ? row.approved_at
    : new Date(row.approved_at);
  if (
    !Number.isSafeInteger(revision) || revision < 1 ||
    !Number.isSafeInteger(strategyRevision) || strategyRevision < 1 ||
    Number.isNaN(approvedAt.getTime())
  ) {
    throw new Error('Invalid workbench approval row.');
  }
  return {
    workflowId: row.workflow_id,
    revision,
    strategyRevision,
    actionId: row.approved_action_ref,
    approvedBy: row.approved_by,
    approvedAt,
  };
}
