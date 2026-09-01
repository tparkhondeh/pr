import { describe, expect, it } from 'vitest';
import {
  runConnectorGovernanceEvaluation,
  type ConnectorGovernanceEvaluationSubject,
} from '../scripts/connector-governance-evaluation.js';

describe('connector governance release evaluation', () => {
  it('passes the disabled profiles, scope attacks, authorization, revocation, deletion, and incident set', async () => {
    const report = await runConnectorGovernanceEvaluation();

    expect(report).toMatchObject({
      suiteVersion: 'connector-governance-eval-v1',
      passed: true,
      totalCases: 24,
      passedCases: 24,
      criticalFailures: 0,
      scopeAttackCases: 13,
      scopeAttacksBlocked: 13,
      rawCredentialAttackCases: 1,
      rawCredentialAttacksBlocked: 1,
      revocationDrillCases: 4,
      revocationDrillsPassed: 4,
      deletionPropagationFailures: 0,
      externalActionViolations: 0,
      externalNetworkViolations: 0,
      activeConnectorViolations: 0,
      rawCredentialLeakageCount: 0,
    });
  });

  it('turns red when a subject activates network, execution, and raw credential retention', async () => {
    const bypass: ConnectorGovernanceEvaluationSubject = () => Promise.resolve({
      outcome: 'registered_disabled',
      codes: [],
      externalActionPermitted: true,
      externalNetworkCallPermitted: true,
      connectorActive: true,
      rawCredentialRetained: true,
      deletionPropagationVerified: false,
    });
    const report = await runConnectorGovernanceEvaluation(bypass);

    expect(report.passed).toBe(false);
    expect(report.criticalFailures).toBeGreaterThan(0);
    expect(report.externalActionViolations).toBeGreaterThan(0);
    expect(report.externalNetworkViolations).toBeGreaterThan(0);
    expect(report.activeConnectorViolations).toBeGreaterThan(0);
    expect(report.rawCredentialLeakageCount).toBeGreaterThan(0);
  });
});
