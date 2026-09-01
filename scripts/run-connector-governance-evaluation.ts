import { runConnectorGovernanceEvaluation } from './connector-governance-evaluation.js';

const report = await runConnectorGovernanceEvaluation();

console.log(JSON.stringify({
  suiteVersion: report.suiteVersion,
  passed: report.passed,
  totalCases: report.totalCases,
  passedCases: report.passedCases,
  criticalFailures: report.criticalFailures,
  scopeAttackCases: report.scopeAttackCases,
  scopeAttacksBlocked: report.scopeAttacksBlocked,
  rawCredentialAttackCases: report.rawCredentialAttackCases,
  rawCredentialAttacksBlocked: report.rawCredentialAttacksBlocked,
  revocationDrillCases: report.revocationDrillCases,
  revocationDrillsPassed: report.revocationDrillsPassed,
  deletionPropagationFailures: report.deletionPropagationFailures,
  externalActionViolations: report.externalActionViolations,
  externalNetworkViolations: report.externalNetworkViolations,
  activeConnectorViolations: report.activeConnectorViolations,
  rawCredentialLeakageCount: report.rawCredentialLeakageCount,
}, null, 2));

if (!report.passed) process.exitCode = 1;
