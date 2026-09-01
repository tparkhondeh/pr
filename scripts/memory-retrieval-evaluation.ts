import type { EvaluationCase, EvaluationSuiteResult } from '../src/evaluation/evaluation.js';
import { runEvaluationSuite } from '../src/evaluation/evaluation.js';
import { tenantId, type TenantId, userId } from '../src/kernel/identity.js';
import type { DataClass, PermissionGrant } from '../src/kernel/policy.js';
import {
  assertionId,
  createAssertion,
  evidenceId,
  type Assertion,
} from '../src/memory/personal-memory.js';
import {
  retrieveAssertions,
  type RetrievalRequest,
  type RetrievalResult,
} from '../src/memory/retrieval.js';

export const memoryRetrievalEvaluationSuiteVersion = 'memory-retrieval-eval-v1' as const;

type RetrievalExpectation = Readonly<{
  allowed: boolean;
  reason: RetrievalResult['reason'];
  assertionIds: readonly string[];
  forbiddenAssertionIds: readonly string[];
  abstention: boolean;
}>;

export type MemoryRetrievalEvaluationInput = Readonly<{
  caseId: string;
  request: RetrievalRequest;
  grants: readonly PermissionGrant[];
  assertions: readonly Assertion[];
  expectation: RetrievalExpectation;
}>;

export type MemoryRetrievalEvaluationSubject = (
  input: MemoryRetrievalEvaluationInput,
) => Promise<RetrievalResult>;

export type MemoryRetrievalEvaluationReport = EvaluationSuiteResult & Readonly<{
  suiteVersion: typeof memoryRetrievalEvaluationSuiteVersion;
  permissionLeakageCount: number;
  falseAllowCases: readonly string[];
  falseDenyCases: readonly string[];
  precisionAtK: number;
  recallAtK: number;
  abstentionCases: number;
  correctAbstentions: number;
}>;

const evaluatedAt = new Date('2026-09-01T12:00:00.000Z');
const ownerTenant = tenantId('tenant_retrieval_eval');
const otherTenant = tenantId('tenant_retrieval_other');
const owner = userId('user_retrieval_eval');

const highConfidence = memoryAssertion('assertion_eval_high', {
  confidence: 0.95,
  createdAt: new Date('2026-08-25T09:00:00.000Z'),
});
const mediumConfidence = memoryAssertion('assertion_eval_medium', {
  confidence: 0.8,
  createdAt: new Date('2026-08-28T09:00:00.000Z'),
});
const lowConfidence = memoryAssertion('assertion_eval_low', {
  confidence: 0.45,
  createdAt: new Date('2026-08-30T09:00:00.000Z'),
});
const otherSubject = memoryAssertion('assertion_eval_other_subject', {
  subjectRef: 'person:someone-else',
});
const otherPredicate = memoryAssertion('assertion_eval_other_predicate', {
  predicate: 'working_style.detail',
});
const foreignTenant = memoryAssertion('assertion_eval_foreign_tenant', {
  tenantId: otherTenant,
});
const restricted = memoryAssertion('assertion_eval_restricted', {
  dataClass: 'restricted',
});
const contested = {
  ...memoryAssertion('assertion_eval_contested'),
  contestedAt: new Date('2026-08-31T09:00:00.000Z'),
  contestReason: 'Owner disputes this interpretation.',
};
const deleted = {
  ...memoryAssertion('assertion_eval_deleted'),
  deletedAt: new Date('2026-08-31T09:00:00.000Z'),
  deletionReason: 'Owner requested deletion.',
};
const superseded = {
  ...memoryAssertion('assertion_eval_superseded'),
  validTo: new Date('2026-08-31T09:00:00.000Z'),
  supersededById: assertionId('assertion_eval_replacement'),
};
const futureAssertion = memoryAssertion('assertion_eval_future', {
  validFrom: new Date('2026-09-02T09:00:00.000Z'),
});
const expiredAssertion = memoryAssertion('assertion_eval_expired', {
  validTo: new Date('2026-08-31T09:00:00.000Z'),
});

const activeGrant = permissionGrant();
const expiredGrant = permissionGrant({
  expiresAt: new Date('2026-08-31T09:00:00.000Z'),
});
const revokedGrant = permissionGrant({
  revokedAt: new Date('2026-08-31T09:00:00.000Z'),
});
const futureGrant = permissionGrant({
  grantedAt: new Date('2026-09-02T09:00:00.000Z'),
});

const cases: readonly EvaluationCase<MemoryRetrievalEvaluationInput, RetrievalResult>[] = [
  evaluationCase(
    'fa-ranking-and-limit',
    'fa-IR',
    retrievalRequest({ limit: 2 }),
    [activeGrant],
    [lowConfidence, mediumConfidence, highConfidence],
    expectation(true, 'matching_grant', [highConfidence.id, mediumConfidence.id]),
  ),
  evaluationCase(
    'en-subject-filter',
    'en-US',
    retrievalRequest({ subjectRef: 'person:retrieval-owner' }),
    [activeGrant],
    [otherSubject, highConfidence],
    expectation(true, 'matching_grant', [highConfidence.id], [otherSubject.id]),
  ),
  evaluationCase(
    'fa-predicate-filter',
    'fa-IR',
    retrievalRequest({ predicate: 'values.curiosity' }),
    [activeGrant],
    [otherPredicate, highConfidence],
    expectation(true, 'matching_grant', [highConfidence.id], [otherPredicate.id]),
  ),
  evaluationCase(
    'en-deny-without-grant',
    'en-US',
    retrievalRequest(),
    [],
    [highConfidence],
    expectation(false, 'no_matching_grant', [], [highConfidence.id]),
  ),
  evaluationCase(
    'fa-deny-future-grant',
    'fa-IR',
    retrievalRequest(),
    [futureGrant],
    [highConfidence],
    expectation(false, 'no_matching_grant', [], [highConfidence.id]),
  ),
  evaluationCase(
    'en-deny-expired-grant',
    'en-US',
    retrievalRequest(),
    [expiredGrant],
    [highConfidence],
    expectation(false, 'expired', [], [highConfidence.id]),
  ),
  evaluationCase(
    'fa-deny-revoked-grant',
    'fa-IR',
    retrievalRequest(),
    [revokedGrant],
    [highConfidence],
    expectation(false, 'revoked', [], [highConfidence.id]),
  ),
  evaluationCase(
    'en-renewed-grant-wins',
    'en-US',
    retrievalRequest(),
    [expiredGrant, activeGrant],
    [highConfidence],
    expectation(true, 'matching_grant', [highConfidence.id]),
  ),
  evaluationCase(
    'fa-tenant-isolation',
    'fa-IR',
    retrievalRequest(),
    [activeGrant],
    [foreignTenant, highConfidence],
    expectation(true, 'matching_grant', [highConfidence.id], [foreignTenant.id]),
  ),
  evaluationCase(
    'en-data-class-isolation',
    'en-US',
    retrievalRequest(),
    [activeGrant],
    [restricted, highConfidence],
    expectation(true, 'matching_grant', [highConfidence.id], [restricted.id]),
  ),
  evaluationCase(
    'fa-contested-abstention',
    'fa-IR',
    retrievalRequest(),
    [activeGrant],
    [contested],
    expectation(true, 'matching_grant', [], [contested.id], true),
  ),
  evaluationCase(
    'en-deleted-abstention',
    'en-US',
    retrievalRequest(),
    [activeGrant],
    [deleted],
    expectation(true, 'matching_grant', [], [deleted.id], true),
  ),
  evaluationCase(
    'fa-superseded-abstention',
    'fa-IR',
    retrievalRequest(),
    [activeGrant],
    [superseded],
    expectation(true, 'matching_grant', [], [superseded.id], true),
  ),
  evaluationCase(
    'en-future-assertion-abstention',
    'en-US',
    retrievalRequest(),
    [activeGrant],
    [futureAssertion],
    expectation(true, 'matching_grant', [], [futureAssertion.id], true),
  ),
  evaluationCase(
    'fa-expired-assertion-abstention',
    'fa-IR',
    retrievalRequest(),
    [activeGrant],
    [expiredAssertion],
    expectation(true, 'matching_grant', [], [expiredAssertion.id], true),
  ),
  evaluationCase(
    'en-empty-filter-abstention',
    'en-US',
    retrievalRequest({ subjectRef: 'person:not-present' }),
    [activeGrant],
    [highConfidence],
    expectation(true, 'matching_grant', [], [highConfidence.id], true),
  ),
] as const;

export async function runMemoryRetrievalEvaluation(
  subject: MemoryRetrievalEvaluationSubject = defaultSubject,
): Promise<MemoryRetrievalEvaluationReport> {
  const outputs = new Map<string, RetrievalResult>();
  const suite = await runEvaluationSuite(cases, async (input) => {
    const output = await subject(input);
    outputs.set(input.caseId, output);
    return output;
  });
  let permissionLeakageCount = 0;
  let truePositiveCount = 0;
  let retrievedCount = 0;
  let expectedCount = 0;
  let correctAbstentions = 0;
  const falseAllowCases: string[] = [];
  const falseDenyCases: string[] = [];

  for (const evaluation of cases) {
    const output = outputs.get(evaluation.id);
    if (!output) continue;
    const expected = evaluation.input.expectation;
    const actualIds = output.assertions.map((assertion) => assertion.id);
    const expectedIds = new Set(expected.assertionIds);
    const forbiddenIds = new Set(expected.forbiddenAssertionIds);
    permissionLeakageCount += actualIds.filter((id) => forbiddenIds.has(id)).length;
    truePositiveCount += actualIds.filter((id) => expectedIds.has(id)).length;
    retrievedCount += actualIds.length;
    expectedCount += expected.assertionIds.length;
    if (!expected.allowed && output.allowed) falseAllowCases.push(evaluation.id);
    if (expected.allowed && !output.allowed) falseDenyCases.push(evaluation.id);
    if (expected.abstention && output.allowed && output.assertions.length === 0) {
      correctAbstentions += 1;
    }
  }

  const abstentionCases = cases.filter((item) => item.input.expectation.abstention).length;
  const precisionAtK = retrievedCount === 0 ? 1 : truePositiveCount / retrievedCount;
  const recallAtK = expectedCount === 0 ? 1 : truePositiveCount / expectedCount;
  return {
    ...suite,
    passed:
      suite.passed &&
      permissionLeakageCount === 0 &&
      falseAllowCases.length === 0 &&
      falseDenyCases.length === 0 &&
      precisionAtK === 1 &&
      recallAtK === 1 &&
      correctAbstentions === abstentionCases,
    suiteVersion: memoryRetrievalEvaluationSuiteVersion,
    permissionLeakageCount,
    falseAllowCases,
    falseDenyCases,
    precisionAtK,
    recallAtK,
    abstentionCases,
    correctAbstentions,
  };
}

function defaultSubject(input: MemoryRetrievalEvaluationInput): Promise<RetrievalResult> {
  return Promise.resolve(retrieveAssertions(input.request, input.grants, input.assertions));
}

function evaluationCase(
  id: string,
  locale: 'fa-IR' | 'en-US',
  request: RetrievalRequest,
  grants: readonly PermissionGrant[],
  assertions: readonly Assertion[],
  expected: RetrievalExpectation,
): EvaluationCase<MemoryRetrievalEvaluationInput, RetrievalResult> {
  return {
    id,
    locale,
    input: { caseId: id, request, grants, assertions, expectation: expected },
    checks: [
      {
        id: 'access-decision',
        severity: 'critical',
        description: 'Retrieval must make the expected deny-by-default access decision.',
        evaluate: (output) => ({
          passed: output.allowed === expected.allowed && output.reason === expected.reason,
          evidence: `expected=${String(expected.allowed)}:${expected.reason};actual=${String(output.allowed)}:${output.reason}`,
        }),
      },
      {
        id: 'exact-ranked-ids',
        severity: 'high',
        description: 'Returned assertion IDs and rank must match the versioned fixture.',
        evaluate: (output) => {
          const actual = output.assertions.map((assertion) => assertion.id);
          return {
            passed: JSON.stringify(actual) === JSON.stringify(expected.assertionIds),
            evidence: `expected=${expected.assertionIds.join(',') || 'none'};actual=${actual.join(',') || 'none'}`,
          };
        },
      },
      {
        id: 'permission-leakage-zero',
        severity: 'critical',
        description: 'Forbidden tenant, class, temporal, deleted, or contested assertions must never appear.',
        evaluate: (output) => {
          const forbidden = new Set(expected.forbiddenAssertionIds);
          const leaked = output.assertions
            .map((assertion) => assertion.id)
            .filter((id) => forbidden.has(id));
          return {
            passed: leaked.length === 0,
            evidence: leaked.length === 0 ? 'no_forbidden_ids' : `leaked=${leaked.join(',')}`,
          };
        },
      },
      {
        id: 'calibrated-abstention',
        severity: 'critical',
        description: 'When no usable evidence exists, retrieval must return an allowed empty result.',
        evaluate: (output) => ({
          passed: !expected.abstention || (output.allowed && output.assertions.length === 0),
          evidence: expected.abstention
            ? `allowed=${String(output.allowed)};count=${String(output.assertions.length)}`
            : 'not_an_abstention_case',
        }),
      },
    ],
  };
}

function expectation(
  allowed: boolean,
  reason: RetrievalResult['reason'],
  assertionIds: readonly string[],
  forbiddenAssertionIds: readonly string[] = [],
  abstention = false,
): RetrievalExpectation {
  return { allowed, reason, assertionIds, forbiddenAssertionIds, abstention };
}

function retrievalRequest(overrides: Partial<RetrievalRequest> = {}): RetrievalRequest {
  return {
    tenantId: ownerTenant,
    actorId: owner,
    purpose: 'strategy_reasoning',
    dataClass: 'confidential',
    at: evaluatedAt,
    limit: 10,
    ...overrides,
  };
}

function permissionGrant(overrides: Partial<PermissionGrant> = {}): PermissionGrant {
  return {
    tenantId: ownerTenant,
    actorId: owner,
    purpose: 'strategy_reasoning',
    operation: 'read',
    dataClass: 'confidential',
    grantedAt: new Date('2026-08-01T09:00:00.000Z'),
    ...overrides,
  };
}

function memoryAssertion(
  id: string,
  overrides: Readonly<{
    tenantId?: TenantId;
    subjectRef?: string;
    predicate?: string;
    dataClass?: DataClass;
    confidence?: number;
    createdAt?: Date;
    validFrom?: Date;
    validTo?: Date;
  }> = {},
): Assertion {
  const createdAt = overrides.createdAt ?? new Date('2026-08-20T09:00:00.000Z');
  return createAssertion({
    id: assertionId(id),
    tenantId: overrides.tenantId ?? ownerTenant,
    subjectRef: overrides.subjectRef ?? 'person:retrieval-owner',
    predicate: overrides.predicate ?? 'values.curiosity',
    value: `synthetic-private-value:${id}`,
    epistemicType: 'self_report',
    dataClass: overrides.dataClass ?? 'confidential',
    confidence: overrides.confidence ?? 0.75,
    confidenceRationale: 'Synthetic versioned evaluation fixture.',
    evidence: [{ evidenceId: evidenceId(`evidence_${id}`), relation: 'supports' }],
    ...(overrides.validFrom ? { validFrom: overrides.validFrom } : {}),
    ...(overrides.validTo ? { validTo: overrides.validTo } : {}),
    createdAt,
    createdBy: owner,
  });
}
