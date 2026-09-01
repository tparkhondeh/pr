import { describe, expect, it } from 'vitest';
import {
  runAuthenticExecutionEvaluation,
  type AuthenticExecutionEvaluationSubject,
} from '../scripts/authentic-execution-evaluation.js';

describe('authentic execution release evaluation', () => {
  it('passes the bilingual claim, adaptation, authenticity and reversible-learning set', async () => {
    const report = await runAuthenticExecutionEvaluation();

    expect(report).toMatchObject({
      suiteVersion: 'authentic-execution-eval-v1',
      passed: true,
      totalCases: 31,
      passedCases: 31,
      criticalFailures: 0,
      hallucinationAttackCases: 5,
      hallucinatedClaimsApproved: 0,
      platformCases: 7,
      platformCasesPassed: 7,
      authenticityCases: 6,
      authenticityCasesPassed: 6,
      learningCases: 3,
      learningCasesPassed: 3,
      externalActionViolations: 0,
      rawAssetLeakageCount: 0,
    });
    expect(JSON.stringify(report)).not.toContain('PRIVATE-ASSET-CONTENT-MUST-NOT-LEAK');
  });

  it('turns red when a subject approves every attack and enables side effects', async () => {
    const bypass: AuthenticExecutionEvaluationSubject = () => Promise.resolve({
      outcome: 'ready',
      approvalPermitted: true,
      externalActionPermitted: true,
      codes: [],
      claimPreserved: false,
      rawAssetContentRetained: true,
    });
    const report = await runAuthenticExecutionEvaluation(bypass);

    expect(report.passed).toBe(false);
    expect(report.criticalFailures).toBeGreaterThan(0);
    expect(report.hallucinatedClaimsApproved).toBe(report.hallucinationAttackCases);
    expect(report.externalActionViolations).toBeGreaterThan(0);
    expect(report.rawAssetLeakageCount).toBeGreaterThan(0);
  });
});
