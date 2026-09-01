import { runAuthenticExecutionEvaluation } from './authentic-execution-evaluation.js';

const report = await runAuthenticExecutionEvaluation();

console.log(JSON.stringify({
  suiteVersion: report.suiteVersion,
  passed: report.passed,
  totalCases: report.totalCases,
  passedCases: report.passedCases,
  criticalFailures: report.criticalFailures,
  hallucinationAttackCases: report.hallucinationAttackCases,
  hallucinatedClaimsApproved: report.hallucinatedClaimsApproved,
  platformCases: report.platformCases,
  platformCasesPassed: report.platformCasesPassed,
  authenticityCases: report.authenticityCases,
  authenticityCasesPassed: report.authenticityCasesPassed,
  learningCases: report.learningCases,
  learningCasesPassed: report.learningCasesPassed,
  externalActionViolations: report.externalActionViolations,
  rawAssetLeakageCount: report.rawAssetLeakageCount,
}, null, 2));

if (!report.passed) process.exitCode = 1;
