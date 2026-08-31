export type EvaluationSeverity = 'critical' | 'high' | 'medium' | 'low';

export type EvaluationCheck<TOutput> = Readonly<{
  id: string;
  severity: EvaluationSeverity;
  description: string;
  evaluate: (output: TOutput) => Readonly<{
    passed: boolean;
    evidence: string;
  }>;
}>;

export type EvaluationCase<TInput, TOutput> = Readonly<{
  id: string;
  locale: 'fa-IR' | 'en-US';
  input: TInput;
  checks: readonly EvaluationCheck<TOutput>[];
}>;

export type EvaluationCaseResult = Readonly<{
  caseId: string;
  passed: boolean;
  checkResults: readonly Readonly<{
    checkId: string;
    severity: EvaluationSeverity;
    passed: boolean;
    evidence: string;
  }>[];
}>;

export type EvaluationSuiteResult = Readonly<{
  passed: boolean;
  totalCases: number;
  passedCases: number;
  criticalFailures: number;
  results: readonly EvaluationCaseResult[];
}>;

export async function runEvaluationSuite<TInput, TOutput>(
  cases: readonly EvaluationCase<TInput, TOutput>[],
  subject: (input: TInput) => Promise<TOutput>,
): Promise<EvaluationSuiteResult> {
  const results: EvaluationCaseResult[] = [];

  for (const evaluationCase of cases) {
    const output = await subject(evaluationCase.input);
    const checkResults = evaluationCase.checks.map((check) => {
      const result = check.evaluate(output);
      return {
        checkId: check.id,
        severity: check.severity,
        passed: result.passed,
        evidence: result.evidence,
      };
    });
    results.push({
      caseId: evaluationCase.id,
      passed: checkResults.every((result) => result.passed),
      checkResults,
    });
  }

  const criticalFailures = results.reduce(
    (count, result) =>
      count +
      result.checkResults.filter(
        (check) => !check.passed && check.severity === 'critical',
      ).length,
    0,
  );
  const passedCases = results.filter((result) => result.passed).length;

  return {
    passed: passedCases === results.length && criticalFailures === 0,
    totalCases: results.length,
    passedCases,
    criticalFailures,
    results,
  };
}

