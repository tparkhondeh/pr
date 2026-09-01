import { runMemoryRetrievalEvaluation } from './memory-retrieval-evaluation.js';

const report = await runMemoryRetrievalEvaluation();

console.log(JSON.stringify({
  suiteVersion: report.suiteVersion,
  passed: report.passed,
  totalCases: report.totalCases,
  passedCases: report.passedCases,
  criticalFailures: report.criticalFailures,
  permissionLeakageCount: report.permissionLeakageCount,
  falseAllowCases: report.falseAllowCases,
  falseDenyCases: report.falseDenyCases,
  precisionAtK: report.precisionAtK,
  recallAtK: report.recallAtK,
  abstentionCases: report.abstentionCases,
  correctAbstentions: report.correctAbstentions,
}, null, 2));

if (!report.passed) process.exitCode = 1;
