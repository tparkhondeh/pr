import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  InMemoryModelInvocationJournalRepository,
  ModelInvocationConflictError,
  ModelInvocationJournalService,
  ModelInvocationPermissionError,
  ModelInvocationValidationError,
  modelInvocationValueHash,
} from '../src/providers/model-invocation-journal.js';

const tenant = tenantId('tenant-model-invocation');
const owner = userId('owner-model-invocation');
const intruder = userId('intruder-model-invocation');
const at = new Date('2026-09-01T12:00:00.000Z');

function fixture() {
  const service = new ModelInvocationJournalService(
    new InMemoryModelInvocationJournalRepository(),
    { tenantId: tenant, ownerUserId: owner },
  );
  return { service };
}

function beginInput(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'model_request_1',
    workflowId: 'workflow:model:journal',
    invocationId: 'invocation:model:journal:1',
    purpose: 'strategy_options' as const,
    schemaName: 'strategic-options-v1',
    registryEntryId: 'strategy-options-live-v1',
    promptVersion: 'strategy-options-prompt-v1.0',
    provider: 'provider-test',
    model: 'model-test',
    modelTier: 'reasoning' as const,
    dataClasses: ['internal'] as const,
    externalProcessingApproved: true,
    inputSha256: modelInvocationValueHash({ goal: 'durable trust' }),
    startedAt: at,
    ...overrides,
  };
}

describe('model invocation journal', () => {
  it('begins once and replays the same metadata without duplicating the invocation', async () => {
    const { service } = fixture();
    const first = await service.begin(owner, beginInput());
    const replay = await service.begin(owner, beginInput());

    expect(first.replay).toBe(false);
    expect(replay.replay).toBe(true);
    expect(replay.record).toEqual(first.record);
    expect(first.record.status).toBe('started');
    expect(first.record.inputSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects request-id mutation and workflow invocation reuse', async () => {
    const { service } = fixture();
    await service.begin(owner, beginInput());

    await expect(service.begin(owner, beginInput({ model: 'different-model' })))
      .rejects.toMatchObject({ reason: 'idempotency_mismatch' });
    await expect(service.begin(owner, beginInput({ requestId: 'model_request_2' })))
      .rejects.toMatchObject({ reason: 'invocation_already_recorded' });
  });

  it('allows exactly one idempotent terminal transition', async () => {
    const { service } = fixture();
    const begun = await service.begin(owner, beginInput());
    const completion = {
      requestId: begun.record.requestId,
      invocationRecordId: begun.record.id,
      status: 'succeeded' as const,
      reservationId: 'b1b4fef5-e885-4d85-a8e6-33bfcfcb0bb1',
      chargeId: '5c5f6a0a-3d1d-4ddb-9e6f-565a29ec1222',
      providerTraceId: 'trace-1',
      inputTokens: 120,
      outputTokens: 30,
      cachedInputTokens: 20,
      costMinorUnits: 20,
      costEvidence: 'provider_reported' as const,
      outputSha256: modelInvocationValueHash({ options: ['wait', 'write'] }),
      completedAt: new Date(at.getTime() + 100),
    };

    const first = await service.complete(owner, completion);
    const replay = await service.complete(owner, completion);
    expect(first.status).toBe('succeeded');
    expect(replay).toEqual(first);
    await expect(service.complete(owner, { ...completion, status: 'output_invalid' }))
      .rejects.toMatchObject({ reason: 'completion_mismatch' });
  });

  it('reports unfinished records as recovery-required and terminal outcomes truthfully', async () => {
    const { service } = fixture();
    const first = await service.begin(owner, beginInput());
    await service.begin(owner, beginInput({
      requestId: 'model_request_2',
      invocationId: 'invocation:model:journal:2',
    }));
    await service.complete(owner, {
      requestId: first.record.requestId,
      invocationRecordId: first.record.id,
      status: 'cost_blocked',
      statusReason: 'invocation_budget_exceeded',
      reservationId: 'c196dfeb-7201-4d69-9c40-7a4717c94355',
      completedAt: at,
    });

    const snapshot = await service.snapshot(owner, at);
    expect(snapshot.persistence).toBe('memory');
    expect(snapshot.durable).toBe(false);
    expect(snapshot.summary).toMatchObject({
      total: 2,
      started: 1,
      recoveryRequired: 1,
      blocked: 1,
    });
  });

  it('stores only hashes and governance metadata, never raw prompt input or output', async () => {
    const { service } = fixture();
    const secret = 'raw-private-input-that-must-not-be-stored';
    const begun = await service.begin(owner, beginInput({
      inputSha256: modelInvocationValueHash({ secret }),
    }));
    const serialized = JSON.stringify(begun.record);

    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('promptText');
    expect(serialized).not.toContain('outputText');
  });

  it('is owner-only and rejects impossible completion evidence', async () => {
    const { service } = fixture();
    await expect(service.begin(intruder, beginInput())).rejects.toBeInstanceOf(ModelInvocationPermissionError);
    const begun = await service.begin(owner, beginInput());
    await expect(service.complete(owner, {
      requestId: begun.record.requestId,
      invocationRecordId: begun.record.id,
      status: 'provider_failed',
      inputTokens: 1,
      cachedInputTokens: 2,
      costMinorUnits: 3,
      costEvidence: 'none',
      completedAt: at,
    })).rejects.toBeInstanceOf(ModelInvocationValidationError);
    expect(ModelInvocationConflictError).toBeDefined();
  });
});
