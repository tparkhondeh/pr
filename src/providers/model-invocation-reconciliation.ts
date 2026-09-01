import { createHash } from 'node:crypto';
import type { TenantId, UserId } from '../kernel/identity.js';
import {
  WorkflowCostConflictError,
  type WorkflowCostCharge,
  type WorkflowCostControlService,
  type WorkflowCostReservation,
} from '../observability/workflow-cost-control.js';
import {
  ModelInvocationConflictError,
  modelInvocationReconciliationPolicyVersion,
  type ModelInvocationJournalService,
  type ModelInvocationRecord,
} from './model-invocation-journal.js';

export const modelInvocationReconciliationDispositions = [
  'not_executed',
  'billed_output_unavailable',
] as const;

export type ModelInvocationReconciliationDisposition =
  (typeof modelInvocationReconciliationDispositions)[number];

export type ModelInvocationReconciliationUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costMinorUnits: number;
}>;

export type ReconcileModelInvocationCommand = Readonly<{
  requestId: string;
  invocationRecordId: string;
  disposition: ModelInvocationReconciliationDisposition;
  evidenceSha256: string;
  providerTraceId?: string;
  usage?: ModelInvocationReconciliationUsage;
  reconciledAt: Date;
}>;

export type ModelInvocationReconciliationResult = Readonly<{
  outcome: 'reconciled' | 'already_reconciled';
  record: ModelInvocationRecord;
  charge?: WorkflowCostCharge;
  automaticRetryAllowed: false;
}>;

export type ModelInvocationReconciliationSnapshot = Readonly<{
  policyVersion: typeof modelInvocationReconciliationPolicyVersion;
  generatedAt: Date;
  available: boolean;
  durableJournalRequired: true;
  humanConfirmationRequired: true;
  automaticRetryAllowed: false;
  rawEvidenceRetained: false;
  pendingRecoveryCount: number;
  dispositions: readonly ModelInvocationReconciliationDisposition[];
}>;

type ReconciliationJournal = Pick<
  ModelInvocationJournalService,
  'persistence' | 'get' | 'complete'
>;

type ReconciliationCosts = Pick<
  WorkflowCostControlService,
  'reservationForInvocation' | 'chargeForReservation' | 'charge'
>;

export class ModelInvocationReconciliationService {
  public constructor(
    private readonly journal: ReconciliationJournal,
    private readonly costs: ReconciliationCosts,
    private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>,
  ) {}

  public snapshot(at: Date, pendingRecoveryCount: number): ModelInvocationReconciliationSnapshot {
    validateDate(at, 'Snapshot time');
    validateCount(pendingRecoveryCount, 'Pending recovery count', 1_000_000_000);
    return {
      policyVersion: modelInvocationReconciliationPolicyVersion,
      generatedAt: at,
      available: this.journal.persistence === 'postgres',
      durableJournalRequired: true,
      humanConfirmationRequired: true,
      automaticRetryAllowed: false,
      rawEvidenceRetained: false,
      pendingRecoveryCount,
      dispositions: modelInvocationReconciliationDispositions,
    };
  }

  public async reconcile(
    actorId: UserId,
    command: ReconcileModelInvocationCommand,
  ): Promise<ModelInvocationReconciliationResult> {
    this.assertOwner(actorId);
    validateCommand(command);
    if (this.journal.persistence !== 'postgres') {
      throw new ModelInvocationReconciliationDeniedError('durable_journal_required');
    }
    const invocation = await this.journal.get(actorId, command.invocationRecordId);
    if (!invocation) throw new ModelInvocationReconciliationNotFoundError('invocation_not_found');
    const expectedStatus = command.disposition === 'not_executed'
      ? 'reconciled_not_executed' as const
      : 'reconciled_billed_output_unavailable' as const;
    const wasStarted = invocation.status === 'started';
    if (!wasStarted && invocation.status !== expectedStatus) {
      throw new ModelInvocationReconciliationConflictError('invocation_already_terminal');
    }
    const reservation = await this.costs.reservationForInvocation(
      actorId,
      invocation.workflowId,
      invocation.invocationId,
    );
    const existingCharge = reservation
      ? await this.costs.chargeForReservation(actorId, reservation.id)
      : undefined;
    try {
      const settlement = command.disposition === 'not_executed'
        ? await this.reconcileNotExecuted(actorId, invocation, reservation, existingCharge, command)
        : await this.reconcileBilled(actorId, invocation, reservation, existingCharge, command);
      return {
        outcome: wasStarted ? 'reconciled' : 'already_reconciled',
        ...settlement,
        automaticRetryAllowed: false,
      };
    } catch (error) {
      if (
        error instanceof ModelInvocationConflictError ||
        error instanceof WorkflowCostConflictError
      ) {
        throw new ModelInvocationReconciliationConflictError('reconciliation_mismatch', { cause: error });
      }
      throw error;
    }
  }

  private async reconcileNotExecuted(
    actorId: UserId,
    invocation: ModelInvocationRecord,
    reservation: WorkflowCostReservation | undefined,
    existingCharge: WorkflowCostCharge | undefined,
    command: ReconcileModelInvocationCommand,
  ): Promise<Readonly<{ record: ModelInvocationRecord; charge?: WorkflowCostCharge }>> {
    if (existingCharge && !isZeroUnmeteredCharge(existingCharge, invocation)) {
      throw new ModelInvocationReconciliationConflictError('existing_charge_mismatch');
    }
    const charge = reservation?.decision === 'allowed'
      ? existingCharge ?? await this.costs.charge(actorId, {
          requestId: reconciliationChargeRequestId(invocation.id),
          reservationId: reservation.id,
          provider: invocation.provider,
          model: invocation.model,
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          components: zeroComponents(0),
          actualSteps: 0,
          humanReviewSeconds: 0,
          costEvidence: 'none',
          chargedAt: command.reconciledAt,
        })
      : undefined;
    const record = await this.journal.complete(actorId, {
      requestId: invocation.requestId,
      invocationRecordId: invocation.id,
      status: 'reconciled_not_executed',
      statusReason: 'provider_not_executed_confirmed',
      ...(reservation ? { reservationId: reservation.id } : {}),
      ...(charge ? {
        chargeId: charge.id,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        costMinorUnits: 0,
        costEvidence: 'none' as const,
      } : {}),
      reconciliationPolicyVersion: modelInvocationReconciliationPolicyVersion,
      reconciliationRequestId: command.requestId,
      reconciliationEvidenceSha256: command.evidenceSha256,
      completedAt: command.reconciledAt,
    });
    return { record, ...(charge ? { charge } : {}) };
  }

  private async reconcileBilled(
    actorId: UserId,
    invocation: ModelInvocationRecord,
    reservation: WorkflowCostReservation | undefined,
    existingCharge: WorkflowCostCharge | undefined,
    command: ReconcileModelInvocationCommand,
  ): Promise<Readonly<{ record: ModelInvocationRecord; charge: WorkflowCostCharge }>> {
    if (!reservation || reservation.decision !== 'allowed') {
      throw new ModelInvocationReconciliationDeniedError('allowed_reservation_required');
    }
    if (!command.providerTraceId || !command.usage) {
      throw new ModelInvocationReconciliationValidationError(
        'Billed reconciliation requires provider trace and usage.',
      );
    }
    if (existingCharge && !matchesBilledUsage(existingCharge, invocation, command.usage)) {
      throw new ModelInvocationReconciliationConflictError('existing_charge_mismatch');
    }
    const charge = existingCharge ?? await this.costs.charge(actorId, {
      requestId: reconciliationChargeRequestId(invocation.id),
      reservationId: reservation.id,
      provider: invocation.provider,
      model: invocation.model,
      inputTokens: command.usage.inputTokens,
      outputTokens: command.usage.outputTokens,
      cachedInputTokens: command.usage.cachedInputTokens,
      components: zeroComponents(command.usage.costMinorUnits),
      actualSteps: reservation.plannedSteps,
      humanReviewSeconds: 0,
      costEvidence: 'provider_reported',
      chargedAt: command.reconciledAt,
    });
    const record = await this.journal.complete(actorId, {
      requestId: invocation.requestId,
      invocationRecordId: invocation.id,
      status: 'reconciled_billed_output_unavailable',
      statusReason: 'provider_billed_output_unavailable',
      reservationId: reservation.id,
      chargeId: charge.id,
      providerTraceId: command.providerTraceId,
      inputTokens: command.usage.inputTokens,
      outputTokens: command.usage.outputTokens,
      cachedInputTokens: command.usage.cachedInputTokens,
      costMinorUnits: command.usage.costMinorUnits,
      costEvidence: 'provider_reported',
      reconciliationPolicyVersion: modelInvocationReconciliationPolicyVersion,
      reconciliationRequestId: command.requestId,
      reconciliationEvidenceSha256: command.evidenceSha256,
      completedAt: command.reconciledAt,
    });
    return { record, charge };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) {
      throw new ModelInvocationReconciliationPermissionError('Only the owner may reconcile model invocations.');
    }
  }
}

export class ModelInvocationReconciliationValidationError extends Error {}
export class ModelInvocationReconciliationPermissionError extends Error {}
export class ModelInvocationReconciliationNotFoundError extends Error {}
export class ModelInvocationReconciliationDeniedError extends Error {
  public constructor(public readonly reason: 'durable_journal_required' | 'allowed_reservation_required') {
    super(`Model invocation reconciliation denied: ${reason}`);
  }
}
export class ModelInvocationReconciliationConflictError extends Error {
  public constructor(
    public readonly reason:
      | 'invocation_already_terminal'
      | 'reconciliation_mismatch'
      | 'existing_charge_mismatch',
    options?: ErrorOptions,
  ) {
    super(`Model invocation reconciliation conflict: ${reason}`, options);
  }
}

function validateCommand(command: ReconcileModelInvocationCommand): void {
  validateRequestId(command.requestId);
  if (!isUuid(command.invocationRecordId)) {
    throw new ModelInvocationReconciliationValidationError('Invocation record id is invalid.');
  }
  if (!modelInvocationReconciliationDispositions.includes(command.disposition)) {
    throw new ModelInvocationReconciliationValidationError('Reconciliation disposition is invalid.');
  }
  if (!/^[0-9a-f]{64}$/u.test(command.evidenceSha256)) {
    throw new ModelInvocationReconciliationValidationError('Evidence hash is invalid.');
  }
  if (command.providerTraceId !== undefined) validateLabel(command.providerTraceId, 'Provider trace id');
  if (command.disposition === 'not_executed') {
    if (command.providerTraceId !== undefined || command.usage !== undefined) {
      throw new ModelInvocationReconciliationValidationError(
        'Not-executed reconciliation cannot claim provider usage.',
      );
    }
  } else {
    if (!command.providerTraceId || !command.usage) {
      throw new ModelInvocationReconciliationValidationError(
        'Billed reconciliation requires provider trace and usage.',
      );
    }
    validateCount(command.usage.inputTokens, 'Input tokens', 1_000_000_000);
    validateCount(command.usage.outputTokens, 'Output tokens', 1_000_000_000);
    validateCount(command.usage.cachedInputTokens, 'Cached input tokens', 1_000_000_000);
    validateCount(command.usage.costMinorUnits, 'Cost', 1_000_000);
    if (command.usage.cachedInputTokens > command.usage.inputTokens) {
      throw new ModelInvocationReconciliationValidationError('Cached input tokens exceed input tokens.');
    }
  }
  validateDate(command.reconciledAt, 'Reconciliation time');
}

function reconciliationChargeRequestId(invocationRecordId: string): string {
  const digest = createHash('sha256').update(`reconciliation:${invocationRecordId}`).digest('hex').slice(0, 40);
  return `mir_c_${digest}`;
}

function isZeroUnmeteredCharge(
  charge: WorkflowCostCharge,
  invocation: ModelInvocationRecord,
): boolean {
  return charge.provider === invocation.provider && charge.model === invocation.model &&
    charge.inputTokens === 0 && charge.outputTokens === 0 && charge.cachedInputTokens === 0 &&
    charge.actualCostMinorUnits === 0 && charge.costEvidence === 'none';
}

function matchesBilledUsage(
  charge: WorkflowCostCharge,
  invocation: ModelInvocationRecord,
  usage: ModelInvocationReconciliationUsage,
): boolean {
  return charge.provider === invocation.provider && charge.model === invocation.model &&
    charge.inputTokens === usage.inputTokens && charge.outputTokens === usage.outputTokens &&
    charge.cachedInputTokens === usage.cachedInputTokens &&
    charge.actualCostMinorUnits === usage.costMinorUnits &&
    charge.costEvidence === 'provider_reported';
}

function zeroComponents(modelMinorUnits: number) {
  return {
    modelMinorUnits,
    embeddingMinorUnits: 0,
    storageMinorUnits: 0,
    searchMinorUnits: 0,
    toolApiMinorUnits: 0,
    computeMinorUnits: 0,
  };
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new ModelInvocationReconciliationValidationError('Request id is invalid.');
  }
}

function validateLabel(value: string, label: string): void {
  let containsControlCharacter = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 32) {
      containsControlCharacter = true;
      break;
    }
  }
  if (value.trim().length === 0 || value.length > 200 || containsControlCharacter) {
    throw new ModelInvocationReconciliationValidationError(`${label} is invalid.`);
  }
}

function validateCount(value: number, label: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new ModelInvocationReconciliationValidationError(`${label} is invalid.`);
  }
}

function validateDate(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new ModelInvocationReconciliationValidationError(`${label} is invalid.`);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
