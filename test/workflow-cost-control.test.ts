import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  InMemoryWorkflowCostRepository,
  WorkflowCostConflictError,
  WorkflowCostControlService,
  WorkflowCostPermissionError,
  WorkflowCostValidationError,
} from '../src/observability/workflow-cost-control.js';

const tenant = tenantId('tenant_primary');
const owner = userId('owner_primary');
const now = new Date('2026-09-01T12:00:00.000Z');

function service() {
  return new WorkflowCostControlService(
    new InMemoryWorkflowCostRepository(),
    { tenantId: tenant, ownerUserId: owner },
  );
}

describe('workflow cost control', () => {
  it('reserves before execution, settles measured components, and exposes truthful totals', async () => {
    const costs = service();
    const reservation = await costs.reserve(owner, {
      requestId: 'reserve_001',
      workflowId: 'workflow:strategy:1',
      invocationId: 'invocation:1',
      kind: 'strategy_recommendation',
      estimatedCostMinorUnits: 80,
      plannedSteps: 2,
      reservedAt: now,
    });
    expect(reservation).toMatchObject({ decision: 'allowed' });

    const charge = await costs.charge(owner, {
      requestId: 'charge_001',
      reservationId: reservation.id,
      provider: 'provider-a',
      model: 'model-a',
      inputTokens: 1_000,
      outputTokens: 200,
      cachedInputTokens: 400,
      components: {
        modelMinorUnits: 50,
        embeddingMinorUnits: 2,
        storageMinorUnits: 1,
        searchMinorUnits: 3,
        toolApiMinorUnits: 4,
        computeMinorUnits: 5,
      },
      actualSteps: 2,
      humanReviewSeconds: 90,
      costEvidence: 'provider_reported',
      chargedAt: now,
    });
    expect(charge).toMatchObject({ actualCostMinorUnits: 65, circuitOpened: false });

    const snapshot = await costs.snapshot(owner, now);
    expect(snapshot).toMatchObject({
      policyVersion: 'workflow-cost-budget-v1',
      truthStatus: 'measured',
      day: {
        chargedCostMinorUnits: 65,
        activeReservedCostMinorUnits: 0,
        remainingCostMinorUnits: 1_935,
        status: 'within_budget',
      },
      usage: {
        chargeCount: 1,
        measuredChargeCount: 1,
        inputTokens: 1_000,
        cachedInputTokens: 400,
        humanReviewSeconds: 90,
      },
    });
  });

  it('blocks an over-budget invocation before execution and keeps the decision idempotent', async () => {
    const costs = service();
    const input = {
      requestId: 'reserve_blocked',
      workflowId: 'workflow:research:1',
      invocationId: 'invocation:expensive',
      kind: 'research' as const,
      estimatedCostMinorUnits: 101,
      plannedSteps: 1,
      reservedAt: now,
    };
    const first = await costs.reserve(owner, input);
    const repeated = await costs.reserve(owner, input);
    expect(repeated).toEqual(first);
    expect(first).toMatchObject({
      decision: 'blocked',
      reason: 'invocation_budget_exceeded',
    });
    await expect(costs.charge(owner, {
      requestId: 'charge_blocked',
      reservationId: first.id,
      provider: 'none',
      model: 'none',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      components: {
        modelMinorUnits: 0,
        embeddingMinorUnits: 0,
        storageMinorUnits: 0,
        searchMinorUnits: 0,
        toolApiMinorUnits: 0,
        computeMinorUnits: 0,
      },
      actualSteps: 0,
      humanReviewSeconds: 0,
      costEvidence: 'none',
      chargedAt: now,
    })).rejects.toMatchObject({ reason: 'reservation_blocked' });
  });

  it('opens a workflow circuit when actual usage exceeds its reservation', async () => {
    const costs = service();
    const reservation = await costs.reserve(owner, {
      requestId: 'reserve_actual',
      workflowId: 'workflow:draft:1',
      invocationId: 'invocation:draft:1',
      kind: 'draft_generation',
      estimatedCostMinorUnits: 20,
      plannedSteps: 2,
      reservedAt: now,
    });
    const charge = await costs.charge(owner, {
      requestId: 'charge_actual',
      reservationId: reservation.id,
      provider: 'provider-a',
      model: 'model-a',
      inputTokens: 20,
      outputTokens: 10,
      cachedInputTokens: 0,
      components: {
        modelMinorUnits: 21,
        embeddingMinorUnits: 0,
        storageMinorUnits: 0,
        searchMinorUnits: 0,
        toolApiMinorUnits: 0,
        computeMinorUnits: 0,
      },
      actualSteps: 2,
      humanReviewSeconds: 0,
      costEvidence: 'provider_reported',
      chargedAt: now,
    });
    expect(charge).toMatchObject({
      circuitOpened: true,
      circuitReason: 'actual_cost_exceeded_reservation',
    });
    await expect(costs.reserve(owner, {
      requestId: 'reserve_after_open',
      workflowId: 'workflow:draft:1',
      invocationId: 'invocation:draft:2',
      kind: 'draft_generation',
      estimatedCostMinorUnits: 1,
      plannedSteps: 1,
      reservedAt: now,
    })).resolves.toMatchObject({ decision: 'blocked', reason: 'workflow_circuit_open' });
  });

  it('does not invent money for unmetered usage and protects owner boundaries', async () => {
    const costs = service();
    await expect(costs.snapshot(userId('someone_else'), now)).rejects.toBeInstanceOf(
      WorkflowCostPermissionError,
    );
    const reservation = await costs.reserve(owner, {
      requestId: 'reserve_unmetered',
      workflowId: 'workflow:other:1',
      invocationId: 'invocation:other:1',
      kind: 'other',
      estimatedCostMinorUnits: 0,
      plannedSteps: 1,
      reservedAt: now,
    });
    await expect(costs.charge(owner, {
      requestId: 'charge_invalid_unmetered',
      reservationId: reservation.id,
      provider: 'unknown',
      model: 'unknown',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      components: {
        modelMinorUnits: 1,
        embeddingMinorUnits: 0,
        storageMinorUnits: 0,
        searchMinorUnits: 0,
        toolApiMinorUnits: 0,
        computeMinorUnits: 0,
      },
      actualSteps: 1,
      humanReviewSeconds: 0,
      costEvidence: 'none',
      chargedAt: now,
    })).rejects.toBeInstanceOf(WorkflowCostValidationError);
  });

  it('rejects an idempotency key reused with different reservation input', async () => {
    const costs = service();
    await costs.reserve(owner, {
      requestId: 'reserve_conflict',
      workflowId: 'workflow:one',
      invocationId: 'invocation:one',
      kind: 'other',
      estimatedCostMinorUnits: 1,
      plannedSteps: 1,
      reservedAt: now,
    });
    await expect(costs.reserve(owner, {
      requestId: 'reserve_conflict',
      workflowId: 'workflow:one',
      invocationId: 'invocation:one',
      kind: 'other',
      estimatedCostMinorUnits: 2,
      plannedSteps: 1,
      reservedAt: now,
    })).rejects.toBeInstanceOf(WorkflowCostConflictError);
  });

  it('prevents duplicate invocation reservations and double settlement under new request ids', async () => {
    const costs = service();
    const reservation = await costs.reserve(owner, {
      requestId: 'reserve_once',
      workflowId: 'workflow:single:settlement',
      invocationId: 'invocation:single:settlement',
      kind: 'other',
      estimatedCostMinorUnits: 0,
      plannedSteps: 1,
      reservedAt: now,
    });
    await expect(costs.reserve(owner, {
      requestId: 'reserve_same_invocation_new_request',
      workflowId: 'workflow:single:settlement',
      invocationId: 'invocation:single:settlement',
      kind: 'other',
      estimatedCostMinorUnits: 0,
      plannedSteps: 1,
      reservedAt: now,
    })).rejects.toMatchObject({ reason: 'invocation_already_reserved' });
    const charge = {
      reservationId: reservation.id,
      provider: 'deterministic',
      model: 'fixture-v1',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      components: {
        modelMinorUnits: 0,
        embeddingMinorUnits: 0,
        storageMinorUnits: 0,
        searchMinorUnits: 0,
        toolApiMinorUnits: 0,
        computeMinorUnits: 0,
      },
      actualSteps: 1,
      humanReviewSeconds: 0,
      costEvidence: 'none' as const,
      chargedAt: now,
    };
    await costs.charge(owner, { ...charge, requestId: 'charge_once' });
    await expect(costs.charge(owner, {
      ...charge,
      requestId: 'charge_same_reservation_new_request',
    })).rejects.toMatchObject({ reason: 'reservation_already_charged' });
  });

  it('keeps UTC daily windows bounded and rejects a charge before reservation', async () => {
    const costs = service();
    const reservation = await costs.reserve(owner, {
      requestId: 'reserve_day_boundary',
      workflowId: 'workflow:day:boundary',
      invocationId: 'invocation:day:boundary',
      kind: 'other',
      estimatedCostMinorUnits: 0,
      plannedSteps: 1,
      reservedAt: new Date('2026-09-02T00:00:00.000Z'),
    });
    expect((await costs.snapshot(owner, new Date('2026-09-01T23:59:59.000Z'))).recentReservations)
      .toHaveLength(0);
    await expect(costs.charge(owner, {
      requestId: 'charge_before_reservation',
      reservationId: reservation.id,
      provider: 'deterministic',
      model: 'fixture-v1',
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      components: {
        modelMinorUnits: 0,
        embeddingMinorUnits: 0,
        storageMinorUnits: 0,
        searchMinorUnits: 0,
        toolApiMinorUnits: 0,
        computeMinorUnits: 0,
      },
      actualSteps: 1,
      humanReviewSeconds: 0,
      costEvidence: 'none',
      chargedAt: new Date('2026-09-01T23:59:59.999Z'),
    })).rejects.toBeInstanceOf(WorkflowCostValidationError);
  });
});
