import { runModelInputSafetyEvaluation } from './model-input-safety-evaluation.js';

const report = await runModelInputSafetyEvaluation();

console.log(JSON.stringify({
  suiteVersion: report.suiteVersion,
  passed: report.passed,
  totalCases: report.totalCases,
  passedCases: report.passedCases,
  criticalFailures: report.criticalFailures,
  allowCases: report.allowCases,
  denyCases: report.denyCases,
  falsePositives: report.falsePositives,
  falseNegatives: report.falseNegatives,
}, null, 2));

if (!report.passed || report.falsePositives.length > 0 || report.falseNegatives.length > 0) {
  process.exitCode = 1;
}
