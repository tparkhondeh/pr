import { runExternalIntelligenceEvaluation } from './external-intelligence-evaluation.js';

const report = await runExternalIntelligenceEvaluation();

console.log(JSON.stringify({
  suiteVersion: report.suiteVersion,
  passed: report.passed,
  totalCases: report.totalCases,
  passedCases: report.passedCases,
  criticalFailures: report.criticalFailures,
  ssrfAttackCases: report.ssrfAttackCases,
  ssrfAttacksBlocked: report.ssrfAttacksBlocked,
  unsafePayloadCases: report.unsafePayloadCases,
  unsafePayloadsBlocked: report.unsafePayloadsBlocked,
  governanceCases: report.governanceCases,
  governanceCasesPassed: report.governanceCasesPassed,
  citationReadyAutoVerified: report.citationReadyAutoVerified,
  automaticFetchViolations: report.automaticFetchViolations,
  publicActionViolations: report.publicActionViolations,
  personalMemoryWriteViolations: report.personalMemoryWriteViolations,
  rawResponseLeakageCount: report.rawResponseLeakageCount,
}, null, 2));

if (!report.passed) process.exitCode = 1;
