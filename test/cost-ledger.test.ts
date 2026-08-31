import { describe, expect, it } from 'vitest';
import {
  CostBudgetExceededError,
  InMemoryCostLedger,
} from '../src/observability/cost-ledger.js';

describe('cost ledger', () => {
  it('aggregates usage and ignores duplicate invocation IDs', () => {
    const ledger = new InMemoryCostLedger(100);
    const entry = {
      workflowId: 'workflow-1',
      invocationId: 'invocation-1',
      provider: 'test',
      model: 'test-model',
      inputTokens: 100,
      outputTokens: 25,
      cachedInputTokens: 50,
      costMinorUnits: 20,
    };
    ledger.record(entry);
    ledger.record(entry);
    expect(ledger.forWorkflow('workflow-1')).toMatchObject({
      invocationCount: 1,
      inputTokens: 100,
      costMinorUnits: 20,
    });
  });

  it('opens the circuit when a workflow exceeds budget', () => {
    const ledger = new InMemoryCostLedger(10);
    expect(() => {
      ledger.record({
        workflowId: 'workflow-1',
        invocationId: 'invocation-1',
        provider: 'test',
        model: 'test-model',
        inputTokens: 1,
        outputTokens: 1,
        cachedInputTokens: 0,
        costMinorUnits: 11,
      });
    }).toThrow(CostBudgetExceededError);
  });
});
