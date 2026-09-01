import { createHash } from 'node:crypto';
import type { SqlTransaction, SqlTransactionRunner } from './sql.js';
import {
  WorkflowCostConflictError,
  WorkflowCostPermissionError,
  WorkflowCostValidationError,
  chargeFingerprint,
  componentTotal,
  reservationBlockReason,
  reservationFingerprint,
  settlementCircuitReason,
  type CostCircuitReason,
  type CostEvidence,
  type WorkflowCostCharge,
  type WorkflowCostChargeCommand,
  type WorkflowCostKind,
  type WorkflowCostPolicy,
  type WorkflowCostRepository,
  type WorkflowCostReservation,
  type WorkflowCostReservationCommand,
} from '../observability/workflow-cost-control.js';

type ReservationRow = Readonly<{
  id: string;
  request_id: string;
  request_sha256: string;
  workflow_id: string;
  invocation_id: string;
  workflow_kind: WorkflowCostKind;
  estimated_cost_minor_units: number;
  planned_steps: number;
  decision: 'allowed' | 'blocked';
  reason: CostCircuitReason | null;
  reserved_at: Date | string;
}>;

type ChargeRow = Readonly<{
  id: string;
  request_id: string;
  request_sha256: string;
  reservation_id: string;
  provider: string;
  model: string;
  input_tokens: string | number;
  output_tokens: string | number;
  cached_input_tokens: string | number;
  model_minor_units: number;
  embedding_minor_units: number;
  storage_minor_units: number;
  search_minor_units: number;
  tool_api_minor_units: number;
  compute_minor_units: number;
  actual_cost_minor_units: number;
  actual_steps: number;
  human_review_seconds: number;
  cost_evidence: CostEvidence;
  circuit_opened: boolean;
  circuit_reason: CostCircuitReason | null;
  charged_at: Date | string;
}>;

export class PostgresWorkflowCostRepository implements WorkflowCostRepository {
  public readonly persistence = 'postgres' as const;

  public constructor(
    private readonly runner: SqlTransactionRunner,
    private readonly context: Readonly<{ tenantId: string; ownerUserId: string }>,
  ) {}

  public listReservations(dayStart: Date): Promise<readonly WorkflowCostReservation[]> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      return await listReservations(transaction, this.context, dayStart);
    });
  }

  public listCharges(dayStart: Date): Promise<readonly WorkflowCostCharge[]> {
    return this.runner.transaction(async (transaction) => {
      await setTenantContext(transaction, this.context.tenantId);
      return await listCharges(transaction, this.context, dayStart);
    });
  }

  public reserve(
    command: WorkflowCostReservationCommand,
    policy: WorkflowCostPolicy,
  ): Promise<WorkflowCostReservation> {
    return this.runner.transaction(async (transaction) => {
      this.assertContext(command);
      await setTenantContext(transaction, this.context.tenantId);
      const dayStart = utcDayStart(command.reservedAt);
      await lockBudgetDay(transaction, this.context, dayStart, command.reservedAt);
      const fingerprint = reservationFingerprint(command);
      const existing = await transaction.query<ReservationRow>(
        `${reservationSelect}
           WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_sha256 !== fingerprint) {
          throw new WorkflowCostConflictError('idempotency_mismatch');
        }
        return rowToReservation(existing.rows[0]);
      }
      const invocation = await transaction.query<Readonly<{ id: string }>>(
        `SELECT id FROM app.workflow_cost_reservations
          WHERE tenant_id = $1 AND owner_user_id = $2
            AND workflow_id = $3 AND invocation_id = $4`,
        [
          this.context.tenantId, this.context.ownerUserId,
          command.workflowId, command.invocationId,
        ],
      );
      if (invocation.rowCount > 0) {
        throw new WorkflowCostConflictError('invocation_already_reserved');
      }
      const [reservations, charges] = await Promise.all([
        listReservations(transaction, this.context, dayStart),
        listCharges(transaction, this.context, dayStart),
      ]);
      const reason = reservationBlockReason(command, policy, reservations, charges);
      const reservation: WorkflowCostReservation = {
        id: deterministicUuid(`workflow-cost-reservation:${command.tenantId}:${command.actorId}:${command.requestId}`),
        requestId: command.requestId,
        workflowId: command.workflowId,
        invocationId: command.invocationId,
        kind: command.kind,
        estimatedCostMinorUnits: command.estimatedCostMinorUnits,
        plannedSteps: command.plannedSteps,
        decision: reason ? 'blocked' : 'allowed',
        ...(reason ? { reason } : {}),
        reservedAt: command.reservedAt,
      };
      await transaction.query(
        `INSERT INTO app.workflow_cost_reservations (
           id, tenant_id, owner_user_id, request_id, request_sha256,
           workflow_id, invocation_id, workflow_kind, estimated_cost_minor_units,
           planned_steps, decision, reason, reserved_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          reservation.id, this.context.tenantId, this.context.ownerUserId,
          reservation.requestId, fingerprint, reservation.workflowId,
          reservation.invocationId, reservation.kind, reservation.estimatedCostMinorUnits,
          reservation.plannedSteps, reservation.decision, reservation.reason ?? null,
          reservation.reservedAt,
        ],
      );
      await appendAudit(transaction, this.context, {
        id: reservation.id,
        eventType: `workflow_cost.reservation_${reservation.decision}`,
        decision: reservation.decision,
        occurredAt: reservation.reservedAt,
        metadata: {
          requestId: reservation.requestId,
          workflowId: reservation.workflowId,
          invocationId: reservation.invocationId,
          kind: reservation.kind,
          estimatedCostMinorUnits: reservation.estimatedCostMinorUnits,
          plannedSteps: reservation.plannedSteps,
          reason: reservation.reason ?? null,
          policyVersion: policy.version,
        },
      });
      return reservation;
    });
  }

  public charge(
    command: WorkflowCostChargeCommand,
    policy: WorkflowCostPolicy,
  ): Promise<WorkflowCostCharge> {
    return this.runner.transaction(async (transaction) => {
      this.assertContext(command);
      await setTenantContext(transaction, this.context.tenantId);
      const dayStart = utcDayStart(command.chargedAt);
      await lockBudgetDay(transaction, this.context, dayStart, command.chargedAt);
      const fingerprint = chargeFingerprint(command);
      const existing = await transaction.query<ChargeRow>(
        `${chargeSelect}
           WHERE tenant_id = $1 AND owner_user_id = $2 AND request_id = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.requestId],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_sha256 !== fingerprint) {
          throw new WorkflowCostConflictError('idempotency_mismatch');
        }
        return rowToCharge(existing.rows[0]);
      }
      const priorCharge = await transaction.query<Readonly<{ id: string }>>(
        `SELECT id FROM app.workflow_cost_charges
          WHERE tenant_id = $1 AND owner_user_id = $2 AND reservation_id = $3`,
        [this.context.tenantId, this.context.ownerUserId, command.reservationId],
      );
      if (priorCharge.rowCount > 0) {
        throw new WorkflowCostConflictError('reservation_already_charged');
      }
      const reservationResult = await transaction.query<ReservationRow>(
        `${reservationSelect}
           WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3
           FOR UPDATE`,
        [this.context.tenantId, this.context.ownerUserId, command.reservationId],
      );
      const reservationRow = reservationResult.rows[0];
      if (!reservationRow) throw new WorkflowCostConflictError('reservation_not_found');
      const reservation = rowToReservation(reservationRow);
      if (reservation.decision !== 'allowed') throw new WorkflowCostConflictError('reservation_blocked');
      if (command.chargedAt < reservation.reservedAt) {
        throw new WorkflowCostValidationError('Charge time cannot precede its reservation.');
      }
      const [dayReservations, dayCharges] = await Promise.all([
        listReservations(transaction, this.context, dayStart),
        listCharges(transaction, this.context, dayStart),
      ]);
      const actualCostMinorUnits = componentTotal(command.components);
      const circuitReason = settlementCircuitReason(
        command,
        reservation,
        actualCostMinorUnits,
        policy,
        dayReservations.some((entry) => entry.id === reservation.id)
          ? dayReservations
          : [...dayReservations, reservation],
        dayCharges,
      );
      const charge: WorkflowCostCharge = {
        id: deterministicUuid(`workflow-cost-charge:${command.tenantId}:${command.actorId}:${command.requestId}`),
        requestId: command.requestId,
        reservationId: command.reservationId,
        provider: command.provider,
        model: command.model,
        inputTokens: command.inputTokens,
        outputTokens: command.outputTokens,
        cachedInputTokens: command.cachedInputTokens,
        components: command.components,
        actualCostMinorUnits,
        actualSteps: command.actualSteps,
        humanReviewSeconds: command.humanReviewSeconds,
        costEvidence: command.costEvidence,
        circuitOpened: circuitReason !== undefined,
        ...(circuitReason ? { circuitReason } : {}),
        chargedAt: command.chargedAt,
      };
      await transaction.query(
        `INSERT INTO app.workflow_cost_charges (
           id, tenant_id, owner_user_id, request_id, request_sha256, reservation_id,
           provider, model, input_tokens, output_tokens, cached_input_tokens,
           model_minor_units, embedding_minor_units, storage_minor_units,
           search_minor_units, tool_api_minor_units, compute_minor_units,
           actual_cost_minor_units, actual_steps, human_review_seconds,
           cost_evidence, circuit_opened, circuit_reason, charged_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
         )`,
        [
          charge.id, this.context.tenantId, this.context.ownerUserId,
          charge.requestId, fingerprint, charge.reservationId, charge.provider,
          charge.model, charge.inputTokens, charge.outputTokens, charge.cachedInputTokens,
          charge.components.modelMinorUnits, charge.components.embeddingMinorUnits,
          charge.components.storageMinorUnits, charge.components.searchMinorUnits,
          charge.components.toolApiMinorUnits, charge.components.computeMinorUnits,
          charge.actualCostMinorUnits, charge.actualSteps, charge.humanReviewSeconds,
          charge.costEvidence, charge.circuitOpened, charge.circuitReason ?? null,
          charge.chargedAt,
        ],
      );
      await appendAudit(transaction, this.context, {
        id: charge.id,
        eventType: charge.circuitOpened ? 'workflow_cost.charged_circuit_opened' : 'workflow_cost.charged',
        decision: charge.circuitOpened ? 'circuit_opened' : 'recorded',
        occurredAt: charge.chargedAt,
        metadata: {
          requestId: charge.requestId,
          reservationId: charge.reservationId,
          actualCostMinorUnits: charge.actualCostMinorUnits,
          costEvidence: charge.costEvidence,
          actualSteps: charge.actualSteps,
          circuitReason: charge.circuitReason ?? null,
          policyVersion: policy.version,
        },
      });
      return charge;
    });
  }

  private assertContext(command: Readonly<{ tenantId: string; actorId: string }>): void {
    if (command.tenantId !== this.context.tenantId || command.actorId !== this.context.ownerUserId) {
      throw new WorkflowCostPermissionError('Workflow cost repository context mismatch.');
    }
  }
}

const reservationSelect = `SELECT id, request_id, request_sha256, workflow_id,
  invocation_id, workflow_kind, estimated_cost_minor_units, planned_steps,
  decision, reason, reserved_at FROM app.workflow_cost_reservations`;

const chargeSelect = `SELECT id, request_id, request_sha256, reservation_id,
  provider, model, input_tokens, output_tokens, cached_input_tokens,
  model_minor_units, embedding_minor_units, storage_minor_units,
  search_minor_units, tool_api_minor_units, compute_minor_units,
  actual_cost_minor_units, actual_steps, human_review_seconds, cost_evidence,
  circuit_opened, circuit_reason, charged_at FROM app.workflow_cost_charges`;

async function listReservations(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  dayStart: Date,
): Promise<readonly WorkflowCostReservation[]> {
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1_000);
  const result = await transaction.query<ReservationRow>(
    `${reservationSelect}
       WHERE tenant_id = $1 AND owner_user_id = $2
         AND reserved_at >= $3 AND reserved_at < $4
       ORDER BY reserved_at DESC, id DESC LIMIT 500`,
    [context.tenantId, context.ownerUserId, dayStart, dayEnd],
  );
  return result.rows.map(rowToReservation);
}

async function listCharges(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  dayStart: Date,
): Promise<readonly WorkflowCostCharge[]> {
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1_000);
  const result = await transaction.query<ChargeRow>(
    `${chargeSelect}
       WHERE tenant_id = $1 AND owner_user_id = $2
         AND charged_at >= $3 AND charged_at < $4
       ORDER BY charged_at DESC, id DESC LIMIT 500`,
    [context.tenantId, context.ownerUserId, dayStart, dayEnd],
  );
  return result.rows.map(rowToCharge);
}

async function lockBudgetDay(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  dayStart: Date,
  touchedAt: Date,
): Promise<void> {
  const budgetDay = dayStart.toISOString().slice(0, 10);
  await transaction.query(
    `INSERT INTO app.workflow_cost_budget_locks (
       tenant_id, owner_user_id, budget_day, touched_at
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, owner_user_id, budget_day)
     DO UPDATE SET touched_at = EXCLUDED.touched_at`,
    [context.tenantId, context.ownerUserId, budgetDay, touchedAt],
  );
  await transaction.query(
    `SELECT budget_day FROM app.workflow_cost_budget_locks
      WHERE tenant_id = $1 AND owner_user_id = $2 AND budget_day = $3
      FOR UPDATE`,
    [context.tenantId, context.ownerUserId, budgetDay],
  );
}

async function appendAudit(
  transaction: SqlTransaction,
  context: Readonly<{ tenantId: string; ownerUserId: string }>,
  input: Readonly<{
    id: string;
    eventType: string;
    decision: string;
    occurredAt: Date;
    metadata: Readonly<Record<string, unknown>>;
  }>,
): Promise<void> {
  const metadata = JSON.stringify(input.metadata);
  await transaction.query(
    `INSERT INTO app.audit_events (
       tenant_id, actor_user_id, event_type, resource_type, resource_id,
       purpose, decision, metadata, occurred_at
     ) VALUES ($1, $2, $3, 'workflow_cost', $4,
       'strategy_reasoning', $5, $6::jsonb, $7)`,
    [context.tenantId, context.ownerUserId, input.eventType, input.id, input.decision, metadata, input.occurredAt],
  );
  await transaction.query(
    `INSERT INTO app.outbox_events (
       tenant_id, aggregate_type, aggregate_id, event_type, payload, available_at
     ) VALUES ($1, 'workflow_cost', $2, $3, $4::jsonb, $5)`,
    [context.tenantId, input.id, input.eventType, metadata, input.occurredAt],
  );
}

function rowToReservation(row: ReservationRow): WorkflowCostReservation {
  return {
    id: row.id,
    requestId: row.request_id,
    workflowId: row.workflow_id,
    invocationId: row.invocation_id,
    kind: row.workflow_kind,
    estimatedCostMinorUnits: row.estimated_cost_minor_units,
    plannedSteps: row.planned_steps,
    decision: row.decision,
    ...(row.reason ? { reason: row.reason } : {}),
    reservedAt: toDate(row.reserved_at),
  };
}

function rowToCharge(row: ChargeRow): WorkflowCostCharge {
  return {
    id: row.id,
    requestId: row.request_id,
    reservationId: row.reservation_id,
    provider: row.provider,
    model: row.model,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    cachedInputTokens: Number(row.cached_input_tokens),
    components: {
      modelMinorUnits: row.model_minor_units,
      embeddingMinorUnits: row.embedding_minor_units,
      storageMinorUnits: row.storage_minor_units,
      searchMinorUnits: row.search_minor_units,
      toolApiMinorUnits: row.tool_api_minor_units,
      computeMinorUnits: row.compute_minor_units,
    },
    actualCostMinorUnits: row.actual_cost_minor_units,
    actualSteps: row.actual_steps,
    humanReviewSeconds: row.human_review_seconds,
    costEvidence: row.cost_evidence,
    circuitOpened: row.circuit_opened,
    ...(row.circuit_reason ? { circuitReason: row.circuit_reason } : {}),
    chargedAt: toDate(row.charged_at),
  };
}

async function setTenantContext(transaction: SqlTransaction, tenantId: string): Promise<void> {
  await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

function utcDayStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function deterministicUuid(seed: string): string {
  const chars = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((Number.parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Stored workflow cost date is invalid.');
  return date;
}
