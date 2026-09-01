import { describe, expect, it } from 'vitest';
import {
  runMemoryRetrievalEvaluation,
  type MemoryRetrievalEvaluationSubject,
} from '../scripts/memory-retrieval-evaluation.js';

describe('permission-bound memory retrieval evaluation', () => {
  it('passes the bilingual release set with perfect ranking and zero leakage', async () => {
    const report = await runMemoryRetrievalEvaluation();

    expect(report).toMatchObject({
      suiteVersion: 'memory-retrieval-eval-v1',
      passed: true,
      totalCases: 16,
      passedCases: 16,
      criticalFailures: 0,
      permissionLeakageCount: 0,
      falseAllowCases: [],
      falseDenyCases: [],
      precisionAtK: 1,
      recallAtK: 1,
      abstentionCases: 6,
      correctAbstentions: 6,
    });
    expect(JSON.stringify(report)).not.toContain('synthetic-private-value');
  });

  it('fails closed when a subject bypasses policy and temporal filters', async () => {
    const leakySubject: MemoryRetrievalEvaluationSubject = (input) => Promise.resolve({
      allowed: true,
      reason: 'matching_grant',
      assertions: input.assertions,
    });
    const report = await runMemoryRetrievalEvaluation(leakySubject);

    expect(report.passed).toBe(false);
    expect(report.criticalFailures).toBeGreaterThan(0);
    expect(report.permissionLeakageCount).toBeGreaterThan(0);
    expect(report.falseAllowCases.length).toBeGreaterThan(0);
  });
});
