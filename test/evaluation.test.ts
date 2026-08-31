import { describe, expect, it } from 'vitest';
import { runEvaluationSuite } from '../src/evaluation/evaluation.js';

type StrategyOutput = Readonly<{
  options: readonly string[];
  evidenceIds: readonly string[];
}>;

describe('evaluation harness', () => {
  it('passes an evidence-linked strategy with a do-nothing option', async () => {
    const result = await runEvaluationSuite<
      { goal: string },
      StrategyOutput
    >(
      [
        {
          id: 'fa-strategy-001',
          locale: 'fa-IR',
          input: { goal: 'افزایش اعتماد' },
          checks: [
            {
              id: 'has-alternatives',
              severity: 'high',
              description: 'At least three strategic options are required.',
              evaluate: (output) => ({
                passed: output.options.length >= 3,
                evidence: `${String(output.options.length)} options`,
              }),
            },
            {
              id: 'has-do-nothing',
              severity: 'critical',
              description: 'A deliberate no-action option is required.',
              evaluate: (output) => ({
                passed: output.options.includes('فعلاً اقدام نکن'),
                evidence: output.options.join(' | '),
              }),
            },
            {
              id: 'evidence-linked',
              severity: 'critical',
              description: 'Recommendations must reference evidence.',
              evaluate: (output) => ({
                passed: output.evidenceIds.length > 0,
                evidence: `${String(output.evidenceIds.length)} evidence links`,
              }),
            },
          ],
        },
      ],
      () =>
        Promise.resolve({
          options: ['گفت‌وگوی خصوصی', 'مقاله تحلیلی', 'فعلاً اقدام نکن'],
          evidenceIds: ['evidence-1'],
        }),
    );

    expect(result.passed).toBe(true);
    expect(result.criticalFailures).toBe(0);
  });

  it('fails the suite on a critical check', async () => {
    const result = await runEvaluationSuite<undefined, StrategyOutput>(
      [
        {
          id: 'unsafe-output',
          locale: 'en-US',
          input: undefined,
          checks: [
            {
              id: 'evidence-linked',
              severity: 'critical',
              description: 'Recommendations must reference evidence.',
              evaluate: (output) => ({
                passed: output.evidenceIds.length > 0,
                evidence: 'No evidence supplied.',
              }),
            },
          ],
        },
      ],
      () => Promise.resolve({ options: ['publish'], evidenceIds: [] }),
    );
    expect(result.passed).toBe(false);
    expect(result.criticalFailures).toBe(1);
  });
});

