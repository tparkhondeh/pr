import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  InMemoryWorkflowCostRepository,
  WorkflowCostControlService,
} from '../src/observability/workflow-cost-control.js';
import {
  InMemoryModelInvocationJournalRepository,
  ModelInvocationJournalService,
  type BeginModelInvocationCommand,
  type CompleteModelInvocationCommand,
  type ModelInvocationBeginResult,
  type ModelInvocationJournalRepository,
  type ModelInvocationRecord,
  type ModelInvocationSummary,
} from '../src/providers/model-invocation-journal.js';
import {
  ModelInvocationReconciliationConflictError,
  ModelInvocationReconciliationPermissionError,
  ModelInvocationReconciliationService,
} from '../src/providers/model-invocation-reconciliation.js';

const tenant = tenantId('tenant-model-reconciliation');
const owner = userId('owner-model-reconciliation');
const intruder = userId('intruder-model-reconciliation');
const identity = { tenantId: tenant, ownerUserId: owner };
const startedAt = new Date('2026-09-01T15:00:00.000Z');
const reconciledAt = new Date('2026-09-01T15:05:00.000Z');
const evidenceSha256 = 'a'.repeat(64);

class DurableMemoryJournalRepository implements ModelInvocationJournalRepository {
  public readonly persistence = 'postgres' as const;
  readonly #delegate = new InMemoryModelInvocationJournalRepository();

  public begin(command: BeginModelInvocationCommand): Promise<ModelInvocationBeginResult> {
    return this.#delegate.begin(command);
  }

  public complete(command: CompleteModelInvocationCommand): Promise<ModelInvocationRecord> {
    return this.#delegate.complete(command);
  }

  public get(id: string): Promise<ModelInvocationRecord | undefined> {
    return this.#delegate.get(id);
  }

  public list(limit: number): Promise<readonly ModelInvocationRecord[]> {
    return this.#delegate.list(limit);
  }

  public summarize(): Promise<ModelInvocationSummary> {
    return this.#delegate.summarize();
  }
}

function fixture(durable = true) {
  const journal = new ModelInvocationJournalService(
    durable ? new DurableMemoryJournalRepository() : new InMemoryModelInvocationJournalRepository(),
    identity,
  );
  const costs = new WorkflowCostControlService(new InMemoryWorkflowCostRepository(), identity);
  const reconciliation = new ModelInvocationReconciliationService(journal, costs, identity);
  return { costs, journal, reconciliation };
}

async function beginInvocation(journal: ModelInvocationJournalService, suffix: string) {
  return await journal.begin(owner, {
    requestId: `model_recovery_${suffix}`,
    workflowId: `workflow:model:recovery:${suffix}`,
    invocationId: `invocation:model:recovery:${suffix}`,
    purpose: 'strategy_options',
    schemaName: 'strategic-options-v1',
    registryEntryId: 'strategy-options-live-v1',
    promptVersion: 'strategy-options-prompt-v1.0',
    provider: 'provider-test',
    model: 'model-test',
    modelTier: 'reasoning',
    dataClasses: ['internal'],
    externalProcessingApproved: true,
    inputSafetyPolicyVersion: 'model-input-safety-v1',
    inputSha256: 'b'.repeat(64),
    startedAt,
  });
}

async function reserveInvocation(
  costs: WorkflowCostControlService,
  suffix: string,
) {
  return await costs.reserve(owner, {
    requestId: `cost_recovery_${suffix}`,
    workflowId: `workflow:model:recovery:${suffix}`,
    invocationId: `invocation:model:recovery:${suffix}`,
    kind: 'strategy_recommendation',
    estimatedCostMinorUnits: 25,
    plannedSteps: 1,
    reservedAt: startedAt,
  });
}

describe('model invocation reconciliation', () => {
  it('publishes a fail-closed recovery policy and rejects an ephemeral journal', async () => {
    const { journal, reconciliation } = fixture(false);
    const invocation = await beginInvocation(journal, 'memory');
    expect(reconciliation.snapshot(reconciledAt, 1)).toMatchObject({
      policyVersion: 'model-invocation-reconciliation-v1',
      available: false,
      durableJournalRequired: true,
      humanConfirmationRequired: true,
      automaticRetryAllowed: false,
      rawEvidenceRetained: false,
      pendingRecoveryCount: 1,
    });
    await expect(reconciliation.reconcile(owner, {
      requestId: 'reconcile_memory_1',
      invocationRecordId: invocation.record.id,
      disposition: 'not_executed',
      evidenceSha256,
      reconciledAt,
    })).rejects.toMatchObject({
      reason: 'durable_journal_required',
    });
  });

  it('closes a pre-reservation crash without inventing usage and never enables retry', async () => {
    const { journal, reconciliation } = fixture();
    const invocation = await beginInvocation(journal, 'before_reservation');
    const result = await reconciliation.reconcile(owner, {
      requestId: 'reconcile_before_reservation_1',
      invocationRecordId: invocation.record.id,
      disposition: 'not_executed',
      evidenceSha256,
      reconciledAt,
    });

    expect(result).toMatchObject({ outcome: 'reconciled', automaticRetryAllowed: false });
    expect(result.charge).toBeUndefined();
    expect(result.record).toMatchObject({
      status: 'reconciled_not_executed',
      reconciliationPolicyVersion: 'model-invocation-reconciliation-v1',
      reconciliationRequestId: 'reconcile_before_reservation_1',
      reconciliationEvidenceSha256: evidenceSha256,
    });
    expect(result.record).not.toHaveProperty('providerTraceId');
    expect(result.record).not.toHaveProperty('costMinorUnits');
    expect((await journal.snapshot(owner, reconciledAt)).summary).toMatchObject({
      recoveryRequired: 0,
      reconciled: 1,
    });
  });

  it('settles an allowed reservation at zero when provider non-execution is confirmed', async () => {
    const { costs, journal, reconciliation } = fixture();
    const invocation = await beginInvocation(journal, 'not_executed');
    await reserveInvocation(costs, 'not_executed');
    const command = {
      requestId: 'reconcile_not_executed_1',
      invocationRecordId: invocation.record.id,
      disposition: 'not_executed' as const,
      evidenceSha256,
      reconciledAt,
    };
    const first = await reconciliation.reconcile(owner, command);
    const replay = await reconciliation.reconcile(owner, command);

    expect(first).toMatchObject({ outcome: 'reconciled', automaticRetryAllowed: false });
    expect(first.charge).toMatchObject({
      actualCostMinorUnits: 0,
      inputTokens: 0,
      outputTokens: 0,
      costEvidence: 'none',
    });
    expect(replay).toMatchObject({ outcome: 'already_reconciled' });
    const costSnapshot = await costs.snapshot(owner, reconciledAt);
    expect(costSnapshot.day.activeReservedCostMinorUnits).toBe(0);
    expect(costSnapshot.usage.chargeCount).toBe(1);
    expect(costSnapshot.truthStatus).toBe('unmetered');
    await expect(reconciliation.reconcile(owner, {
      ...command,
      requestId: 'reconcile_not_executed_2',
      evidenceSha256: 'c'.repeat(64),
    })).rejects.toBeInstanceOf(ModelInvocationReconciliationConflictError);
  });

  it('records provider-reported billing when the output is unavailable', async () => {
    const { costs, journal, reconciliation } = fixture();
    const invocation = await beginInvocation(journal, 'billed');
    await reserveInvocation(costs, 'billed');
    const result = await reconciliation.reconcile(owner, {
      requestId: 'reconcile_billed_1',
      invocationRecordId: invocation.record.id,
      disposition: 'billed_output_unavailable',
      evidenceSha256,
      providerTraceId: 'provider-trace-recovery-1',
      usage: {
        inputTokens: 120,
        outputTokens: 30,
        cachedInputTokens: 20,
        costMinorUnits: 20,
      },
      reconciledAt,
    });

    expect(result.record).toMatchObject({
      status: 'reconciled_billed_output_unavailable',
      providerTraceId: 'provider-trace-recovery-1',
      inputTokens: 120,
      outputTokens: 30,
      costMinorUnits: 20,
      costEvidence: 'provider_reported',
      reconciliationEvidenceSha256: evidenceSha256,
    });
    expect(result.record).not.toHaveProperty('outputSha256');
    expect((await costs.snapshot(owner, reconciledAt))).toMatchObject({
      truthStatus: 'measured',
      usage: { chargeCount: 1, modelMinorUnits: 20 },
    });
    expect((await journal.snapshot(owner, reconciledAt)).summary).toMatchObject({
      recoveryRequired: 0,
      failed: 1,
      reconciled: 1,
    });
  });

  it('recovers idempotently after a crash between charge and journal completion', async () => {
    const { costs, journal } = fixture();
    const invocation = await beginInvocation(journal, 'crash_after_charge');
    const reservation = await reserveInvocation(costs, 'crash_after_charge');
    await costs.charge(owner, {
      requestId: 'gateway_charge_before_crash',
      reservationId: reservation.id,
      provider: 'provider-test',
      model: 'model-test',
      inputTokens: 80,
      outputTokens: 20,
      cachedInputTokens: 0,
      components: {
        modelMinorUnits: 15,
        embeddingMinorUnits: 0,
        storageMinorUnits: 0,
        searchMinorUnits: 0,
        toolApiMinorUnits: 0,
        computeMinorUnits: 0,
      },
      actualSteps: 1,
      humanReviewSeconds: 0,
      costEvidence: 'provider_reported',
      chargedAt: reconciledAt,
    });
    let failCompletionOnce = true;
    const flakyJournal = {
      persistence: journal.persistence,
      get: journal.get.bind(journal),
      complete: async (...args: Parameters<ModelInvocationJournalService['complete']>) => {
        if (failCompletionOnce) {
          failCompletionOnce = false;
          throw new Error('simulated process crash after charge');
        }
        return await journal.complete(...args);
      },
    };
    const reconciliation = new ModelInvocationReconciliationService(flakyJournal, costs, identity);
    const command = {
      requestId: 'reconcile_crash_after_charge_1',
      invocationRecordId: invocation.record.id,
      disposition: 'billed_output_unavailable' as const,
      evidenceSha256,
      providerTraceId: 'provider-trace-crash-1',
      usage: { inputTokens: 80, outputTokens: 20, cachedInputTokens: 0, costMinorUnits: 15 },
      reconciledAt,
    };

    await expect(reconciliation.reconcile(owner, {
      ...command,
      usage: { ...command.usage, costMinorUnits: 14 },
    })).rejects.toMatchObject({ reason: 'existing_charge_mismatch' });
    expect((await journal.get(owner, invocation.record.id))?.status).toBe('started');

    await expect(reconciliation.reconcile(owner, command)).rejects.toThrow(
      'simulated process crash after charge',
    );
    expect((await journal.get(owner, invocation.record.id))?.status).toBe('started');
    expect((await costs.snapshot(owner, reconciledAt)).usage.chargeCount).toBe(1);

    const recovered = await reconciliation.reconcile(owner, command);
    expect(recovered.record.status).toBe('reconciled_billed_output_unavailable');
    expect((await costs.snapshot(owner, reconciledAt)).usage.chargeCount).toBe(1);
    expect((await journal.snapshot(owner, reconciledAt)).summary.recoveryRequired).toBe(0);
  });

  it('protects owner boundaries', async () => {
    const { journal, reconciliation } = fixture();
    const invocation = await beginInvocation(journal, 'permission');
    await expect(reconciliation.reconcile(intruder, {
      requestId: 'reconcile_permission_1',
      invocationRecordId: invocation.record.id,
      disposition: 'not_executed',
      evidenceSha256,
      reconciledAt,
    })).rejects.toBeInstanceOf(ModelInvocationReconciliationPermissionError);
  });
});
