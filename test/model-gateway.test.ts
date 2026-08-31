import { describe, expect, it } from 'vitest';
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
      tenantId: 'tenant-1',
      purpose: 'strategy_options',
      input: { goal: 'build trust' },
      dataClasses: ['internal'],
      schemaName: 'strategy-options-v1',
      maxOutputTokens: 500,
    });

    expect(result.output.options).toEqual(['wait', 'write']);
    expect(result.usage.estimatedCostMinorUnits).toBe(0);
  });

  it('fails closed when a fixture is missing', async () => {
    const gateway = new DeterministicModelGateway(new Map());
    await expect(
      gateway.generateStructured({
        requestId: 'missing',
        tenantId: 'tenant-1',
        purpose: 'evaluate_output',
        input: {},
        dataClasses: ['internal'],
        schemaName: 'evaluation-v1',
        maxOutputTokens: 100,
      }),
    ).rejects.toThrow('No deterministic fixture');
  });
});

