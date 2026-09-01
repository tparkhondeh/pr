import { describe, expect, it } from 'vitest';
import {
  runExternalIntelligenceEvaluation,
  type ExternalIntelligenceEvaluationSubject,
} from '../scripts/external-intelligence-evaluation.js';

describe('external intelligence release evaluation', () => {
  it('passes the bilingual SSRF, response, citation, freshness, conflict, and separation set', async () => {
    const report = await runExternalIntelligenceEvaluation();

    expect(report).toMatchObject({
      suiteVersion: 'external-intelligence-eval-v1',
      passed: true,
      totalCases: 30,
      passedCases: 30,
      criticalFailures: 0,
      ssrfAttackCases: 15,
      ssrfAttacksBlocked: 15,
      unsafePayloadCases: 4,
      unsafePayloadsBlocked: 4,
      governanceCases: 5,
      governanceCasesPassed: 5,
      citationReadyAutoVerified: 0,
      automaticFetchViolations: 0,
      publicActionViolations: 0,
      personalMemoryWriteViolations: 0,
      rawResponseLeakageCount: 0,
    });
  });

  it('turns red when a subject bypasses source safety and enables automatic side effects', async () => {
    const bypass: ExternalIntelligenceEvaluationSubject = () => Promise.resolve({
      outcome: 'allow',
      codes: [],
      metadataImportPermitted: true,
      fetchTargetEligible: true,
      automaticFetchPermitted: true,
      claimAutomaticallyVerified: true,
      publicClaimExecutionPermitted: true,
      personalMemoryWritten: true,
      rawResponseRetained: true,
    });
    const report = await runExternalIntelligenceEvaluation(bypass);

    expect(report.passed).toBe(false);
    expect(report.criticalFailures).toBeGreaterThan(0);
    expect(report.automaticFetchViolations).toBeGreaterThan(0);
    expect(report.publicActionViolations).toBeGreaterThan(0);
    expect(report.personalMemoryWriteViolations).toBeGreaterThan(0);
    expect(report.rawResponseLeakageCount).toBeGreaterThan(0);
  });
});
