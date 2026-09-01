import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  defaultWorkflowCostPolicy,
  InMemoryWorkflowCostRepository,
  WorkflowCostControlService,
} from '../src/observability/workflow-cost-control.js';
import {
  defaultPromptModelRegistry,
  GovernedModelGateway,
  ModelGovernanceConflictError,
  ModelGovernanceDeniedError,
  ModelGovernancePermissionError,
  ModelGovernanceService,
  ModelOutputValidationError,
  ModelProviderExecutionError,
  ModelProviderTimeoutError,
  PromptModelRegistry,
  type ExternalModelProvider,
  type PromptModelRegistryEntry,
  type ProviderModelCommand,
  type ProviderModelResult,
} from '../src/providers/model-governance.js';
import type { ModelRequest } from '../src/providers/model-gateway.js';

const tenant = tenantId('tenant-model-governance');
const owner = userId('owner-model-governance');
const intruder = userId('intruder-model-governance');
const at = new Date('2026-09-01T12:00:00.000Z');

function activeRoute(overrides: Partial<PromptModelRegistryEntry> = {}): PromptModelRegistryEntry {
  return {
    id: 'strategy-options-live-v1',
    purpose: 'strategy_options',
    schemaName: 'strategic-options-v1',
    promptVersion: 'strategy-options-prompt-v1.0',
    provider: 'provider-test',
    model: 'model-test',
    modelTier: 'reasoning',
    risk: 'high',
    allowedDataClasses: ['public', 'internal'],
    maxOutputTokens: 1_000,
    estimatedCostMinorUnits: 25,
    plannedSteps: 1,
    timeoutMs: 1_000,
    rollout: 'active',
    evalSuite: 'strategy-options-eval-v1',
    evalStatus: 'passed',
    ...overrides,
  };
}

function request(overrides: Partial<ModelRequest<{ goal: string }>> = {}): ModelRequest<{ goal: string }> {
  return {
    requestId: 'model_request_1',
    workflowId: 'workflow:model:governance',
    invocationId: 'invocation:model:governance:1',
    tenantId: tenant,
    actorId: owner,
    purpose: 'strategy_options',
    input: { goal: 'build durable trust' },
    dataClasses: ['internal'],
    externalProcessingApproved: true,
    schemaName: 'strategic-options-v1',
    maxOutputTokens: 500,
    at,
    ...overrides,
  };
}

class StubProvider implements ExternalModelProvider {
  public calls = 0;

  public constructor(
    private readonly response: () => Promise<ProviderModelResult<unknown>>,
  ) {}

  public generateStructured<TInput, TOutput>(
    command: ProviderModelCommand<TInput>,
    signal: AbortSignal,
  ): Promise<ProviderModelResult<TOutput>> {
    void command;
    void signal;
    this.calls += 1;
    return this.response() as Promise<ProviderModelResult<TOutput>>;
  }
}

function providerResult(output: unknown = { options: ['wait', 'write'] }): ProviderModelResult<unknown> {
  return {
    output,
    usage: {
      provider: 'provider-test',
      model: 'model-test',
      inputTokens: 120,
      outputTokens: 30,
      cachedInputTokens: 20,
      costMinorUnits: 20,
      costEvidence: 'provider_reported',
    },
    providerTraceId: 'trace-1',
  };
}

function fixture(
  route = activeRoute(),
  provider = new StubProvider(() => Promise.resolve(providerResult())),
  policy = defaultWorkflowCostPolicy,
) {
  const costs = new WorkflowCostControlService(
    new InMemoryWorkflowCostRepository(),
    { tenantId: tenant, ownerUserId: owner },
    policy,
  );
  const gateway = new GovernedModelGateway(
    new PromptModelRegistry([route]),
    costs,
    provider,
    { tenantId: tenant, ownerUserId: owner },
    new Map([[route.schemaName, (value: unknown) =>
      typeof value === 'object' && value !== null && Array.isArray((value as { options?: unknown }).options)]]),
  );
  return { costs, gateway, provider };
}

describe('prompt and model governance', () => {
  it('publishes a fail-closed owner-only registry snapshot', () => {
    const service = new ModelGovernanceService(
      defaultPromptModelRegistry,
      { tenantId: tenant, ownerUserId: owner },
      false,
    );

    const snapshot = service.snapshot(owner, at);
    expect(snapshot.executionEnabled).toBe(false);
    expect(snapshot.costGateRequired).toBe(true);
    expect(snapshot.durableInvocationJournal).toBe(false);
    expect(snapshot.routes).toHaveLength(5);
    expect(snapshot.routes.every((route) => route.rollout === 'disabled')).toBe(true);
    expect(() => service.snapshot(intruder, at)).toThrow(ModelGovernancePermissionError);
  });

  it('reserves before the provider, settles measured cost, and replays idempotently', async () => {
    const { costs, gateway, provider } = fixture();
    const first = await gateway.generateStructured(request());
    const replay = await gateway.generateStructured(request());

    expect(first).toBe(replay);
    expect(provider.calls).toBe(1);
    expect(first.governance?.policyVersion).toBe('prompt-model-governance-v1');
    const snapshot = await costs.snapshot(owner, at);
    expect(snapshot.truthStatus).toBe('measured');
    expect(snapshot.day.chargedCostMinorUnits).toBe(20);
    expect(snapshot.day.activeReservedCostMinorUnits).toBe(0);
  });

  it('rejects a request-id replay with different input', async () => {
    const { gateway, provider } = fixture();
    await gateway.generateStructured(request());
    await expect(gateway.generateStructured(request({ input: { goal: 'different' } })))
      .rejects.toBeInstanceOf(ModelGovernanceConflictError);
    expect(provider.calls).toBe(1);
  });

  it.each([
    ['route_not_active', activeRoute({ rollout: 'disabled' }), request()],
    ['eval_not_passed', activeRoute({ evalStatus: 'failed' }), request()],
    ['data_class_not_allowed', activeRoute(), request({ dataClasses: ['confidential'] })],
    ['external_processing_not_approved', activeRoute(), request({ externalProcessingApproved: false })],
  ])('blocks %s before provider execution', async (_reason, route, modelRequest) => {
    const { gateway, provider } = fixture(route);
    await expect(gateway.generateStructured(modelRequest)).rejects.toBeInstanceOf(ModelGovernanceDeniedError);
    expect(provider.calls).toBe(0);
  });

  it('blocks the provider when the mandatory cost reservation exceeds policy', async () => {
    const { gateway, provider } = fixture(activeRoute(), undefined, {
      ...defaultWorkflowCostPolicy,
      perInvocationBudgetMinorUnits: 10,
    });
    await expect(gateway.generateStructured(request())).rejects.toThrow('cost_gate:invocation_budget_exceeded');
    expect(provider.calls).toBe(0);
  });

  it('charges provider usage before rejecting an invalid structured output', async () => {
    const failingProvider = new StubProvider(() => Promise.resolve(providerResult({ wrong: true })));
    const { costs, gateway } = fixture(activeRoute(), failingProvider);

    await expect(gateway.generateStructured(request())).rejects.toBeInstanceOf(ModelOutputValidationError);
    const snapshot = await costs.snapshot(owner, at);
    expect(snapshot.day.chargedCostMinorUnits).toBe(20);
    expect(snapshot.day.activeReservedCostMinorUnits).toBe(0);
  });

  it('settles an unknown provider failure as unmetered instead of inventing cost', async () => {
    const failingProvider = new StubProvider(() => Promise.reject(new Error('upstream unavailable')));
    const { costs, gateway } = fixture(activeRoute(), failingProvider);

    await expect(gateway.generateStructured(request())).rejects.toBeInstanceOf(ModelProviderExecutionError);
    const snapshot = await costs.snapshot(owner, at);
    expect(snapshot.truthStatus).toBe('unmetered');
    expect(snapshot.day.chargedCostMinorUnits).toBe(0);
    expect(snapshot.day.activeReservedCostMinorUnits).toBe(0);
  });

  it('aborts and settles a provider timeout', async () => {
    const hangingProvider = new StubProvider(() => new Promise(() => undefined));
    const { costs, gateway } = fixture(activeRoute({ timeoutMs: 1 }), hangingProvider);

    await expect(gateway.generateStructured(request())).rejects.toBeInstanceOf(ModelProviderTimeoutError);
    const snapshot = await costs.snapshot(owner, at);
    expect(snapshot.truthStatus).toBe('unmetered');
    expect(snapshot.day.activeReservedCostMinorUnits).toBe(0);
  });
});
