import { describe, expect, it } from 'vitest';
import {
  runModelInputSafetyEvaluation,
} from '../scripts/model-input-safety-evaluation.js';

describe('model input safety adversarial evaluation', () => {
  it('passes the versioned Persian and English release gate without false decisions', async () => {
    const report = await runModelInputSafetyEvaluation();

    expect(report).toMatchObject({
      suiteVersion: 'model-input-safety-eval-v1',
      passed: true,
      totalCases: 21,
      passedCases: 21,
      criticalFailures: 0,
      allowCases: 4,
      denyCases: 17,
      falsePositives: [],
      falseNegatives: [],
    });
  });
});
