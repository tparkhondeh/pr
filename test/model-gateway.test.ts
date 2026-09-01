import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import { DeterministicModelGateway } from '../src/providers/model-gateway.js';

describe('deterministic model gateway', () => {
  it('returns typed offline fixtures with zero cost', async () => {
    const gateway = new DeterministicModelGateway(
      new Map([['request-1', { options: ['wait', 'write'] }]]),
    );
    const result = await gateway.generateStructured<
      { goal: string },
      { options: string[] }
    >({
      requestId: 'request-1',
      workflowId: 'workflow:model:1',
      invocationId: 'invocation:model:1',
      tenantId: tenantId('tenant-1'),
      actorId: userId('owner-1'),
      purpose: 'strategy_options',
      input: { goal: 'build trust' },
      dataClasses: ['internal'],
      externalProcessingApproved: false,
      schemaName: 'strategy-options-v1',
      maxOutputTokens: 500,
      at: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(result.output.options).toEqual(['wait', 'write']);
    expect(result.usage.estimatedCostMinorUnits).toBe(0);
  });

  it('fails closed when a fixture is missing', async () => {
    const gateway = new DeterministicModelGateway(new Map());
    await expect(
      gateway.generateStructured({
        requestId: 'missing',
        workflowId: 'workflow:model:missing',
        invocationId: 'invocation:model:missing',
        tenantId: tenantId('tenant-1'),
        actorId: userId('owner-1'),
        purpose: 'evaluate_output',
        input: {},
        dataClasses: ['internal'],
        externalProcessingApproved: false,
        schemaName: 'evaluation-v1',
        maxOutputTokens: 100,
        at: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ).rejects.toThrow('No deterministic fixture');
  });
});
