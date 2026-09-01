import type { TextAssetSnapshot } from '../src/assets/text-asset-intake.js';
import {
  guardDraft,
  type DraftArtifact,
  type DraftGuardResult,
} from '../src/claims/draft-guard.js';
import {
  disputeClaim,
  proposeClaim,
  revokeClaim,
  verifyClaim,
  type Claim,
  type ClaimKind,
} from '../src/claims/claim-registry.js';
import {
  composePlatformDraft,
  draftChannels,
  platformAdaptationFor,
  platformFormatIssues,
  type DraftChannel,
} from '../src/claims/platform-adaptation.js';
import type { EvaluationCase, EvaluationSuiteResult } from '../src/evaluation/evaluation.js';
import { runEvaluationSuite } from '../src/evaluation/evaluation.js';
import {
  AuthenticExpressionPermissionError,
  AuthenticExpressionService,
} from '../src/expression/authentic-expression.js';
import {
  decidePreference,
  proposePreference,
  revokePreference,
  type FeedbackEvent,
  type PreferenceProposal,
} from '../src/feedback/learning.js';
import type { FeedbackLearningSnapshot } from '../src/feedback/workspace.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import { evidenceId } from '../src/memory/personal-memory.js';

export const authenticExecutionEvaluationSuiteVersion = 'authentic-execution-eval-v1' as const;

type EvaluationOutcome = 'ready' | 'revise' | 'blocked' | 'no_change' | 'proposal_only' | 'reversible';

export type AuthenticExecutionEvaluationOutput = Readonly<{
  outcome: EvaluationOutcome;
  approvalPermitted: boolean;
  externalActionPermitted: boolean;
  codes: readonly string[];
  claimPreserved: boolean | null;
  rawAssetContentRetained: boolean;
}>;

type EvaluationExpectation = Readonly<{
  outcome: EvaluationOutcome;
  approvalPermitted?: boolean;
  requiredCodes?: readonly string[];
  claimPreserved?: boolean;
  hallucinationAttack?: boolean;
}>;

type DraftEvaluationInput = Readonly<{
  kind: 'draft';
  draft: DraftArtifact;
  registry: readonly Claim[];
  expectation: EvaluationExpectation;
}>;

type AdaptationEvaluationInput = Readonly<{
  kind: 'adaptation';
  channel: DraftChannel;
  angle: string;
  statement: string;
  takeaway: string;
  preferences: Readonly<Record<string, unknown>>;
  expectation: EvaluationExpectation;
}>;

type ExpressionEvaluationInput = Readonly<{
  kind: 'expression';
  content: string;
  assetRefs: readonly string[];
  brandUsage: boolean;
  preferenceStatus: 'none' | 'proposed' | 'applied';
  expectation: EvaluationExpectation;
}>;

type LearningEvaluationInput = Readonly<{
  kind: 'learning';
  mode: 'single' | 'repeated' | 'reversible';
  expectation: EvaluationExpectation;
}>;

export type AuthenticExecutionEvaluationInput =
  | DraftEvaluationInput
  | AdaptationEvaluationInput
  | ExpressionEvaluationInput
  | LearningEvaluationInput;

export type AuthenticExecutionEvaluationSubject = (
  input: AuthenticExecutionEvaluationInput,
) => Promise<AuthenticExecutionEvaluationOutput>;

export type AuthenticExecutionEvaluationReport = EvaluationSuiteResult & Readonly<{
  suiteVersion: typeof authenticExecutionEvaluationSuiteVersion;
  hallucinationAttackCases: number;
  hallucinatedClaimsApproved: number;
  platformCases: number;
  platformCasesPassed: number;
  authenticityCases: number;
  authenticityCasesPassed: number;
  learningCases: number;
  learningCasesPassed: number;
  externalActionViolations: number;
  rawAssetLeakageCount: number;
}>;

const evaluatedAt = new Date('2026-09-01T15:00:00.000Z');
const tenant = tenantId('tenant_execution_eval');
const otherTenant = tenantId('tenant_execution_other');
const owner = userId('user_execution_eval');
const statement = 'شفافیت در یک تصمیم دشوار، اعتماد تیم را حفظ کرد.';
const privateAssetMarker = 'PRIVATE-ASSET-CONTENT-MUST-NOT-LEAK';
const registered = factualClaim('claim_execution_verified', statement);
const proposed = proposedClaim('claim_execution_proposed', statement);
const disputed = disputeClaim(
  factualClaim('claim_execution_disputed', statement),
  'Owner disputes the statement.',
  new Date('2026-08-31T15:00:00.000Z'),
);
const revoked = revokeClaim(
  factualClaim('claim_execution_revoked', statement),
  'Owner revoked public use.',
  new Date('2026-08-31T15:00:00.000Z'),
);
const expired = factualClaim('claim_execution_expired', statement, 'personal_fact', {
  validUntil: new Date('2026-08-31T15:00:00.000Z'),
});
const foreign = { ...registered, id: 'claim_execution_foreign', tenantId: otherTenant };
const wrongPurpose = { ...registered, id: 'claim_execution_wrong_purpose', allowedPurposes: ['brand_usage'] as const };
const wrongChannel = { ...registered, id: 'claim_execution_wrong_channel', allowedChannels: ['x'] };
const projection = proposedClaim(
  'claim_execution_projection',
  'فروش سال بعد دو برابر می‌شود.',
  'projection',
);
const disclosedProjection = proposedClaim(
  'claim_execution_projection_disclosed',
  'پیش‌بینی: فروش سال بعد دو برابر می‌شود.',
  'projection',
);

const cases: readonly EvaluationCase<AuthenticExecutionEvaluationInput, AuthenticExecutionEvaluationOutput>[] = [
  draftCase('fa-valid-verified-claim', 'fa-IR', draftFor(registered), [registered], {
    outcome: 'ready', approvalPermitted: true,
  }),
  draftCase('en-unregistered-claim', 'en-US', draftFor(registered), [], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['missing_claim'], hallucinationAttack: true,
  }),
  draftCase('fa-unverified-fact', 'fa-IR', draftFor(proposed), [proposed], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['unverified_fact'],
  }),
  draftCase('en-disputed-fact', 'en-US', draftFor(disputed), [disputed], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['disputed_claim'],
  }),
  draftCase('fa-revoked-fact', 'fa-IR', draftFor(revoked), [revoked], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['revoked_claim'],
  }),
  draftCase('en-expired-fact', 'en-US', draftFor(expired), [expired], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['expired_claim'],
  }),
  draftCase('fa-cross-tenant-fact', 'fa-IR', draftFor(foreign, { tenantId: tenant }), [foreign], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['cross_tenant_claim'],
  }),
  draftCase('en-valid-id-omitted-statement', 'en-US', draftFor(registered, {
    body: 'The body omits the registered statement while citing its valid identifier.',
  }), [registered], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['claim_not_present_in_body'], hallucinationAttack: true,
  }),
  draftCase('fa-shortened-excerpt', 'fa-IR', draftFor(registered, {
    excerpt: 'شفافیت اعتماد را حفظ کرد.',
  }), [registered], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['claim_excerpt_mismatch'], hallucinationAttack: true,
  }),
  draftCase('en-provider-lies-about-extraction', 'en-US', draftFor(registered, {
    body: `${registered.statement}\nRevenue grew 5 times.`,
    claimExtractionComplete: true,
  }), [registered], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['potential_unbound_claim'], hallucinationAttack: true,
  }),
  draftCase('fa-incomplete-claim-extraction', 'fa-IR', draftFor(registered, {
    claimExtractionComplete: false,
  }), [registered], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['claim_extraction_incomplete'], hallucinationAttack: true,
  }),
  draftCase('en-purpose-boundary', 'en-US', draftFor(wrongPurpose), [wrongPurpose], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['purpose_not_allowed'],
  }),
  draftCase('fa-channel-boundary', 'fa-IR', draftFor(wrongChannel), [wrongChannel], {
    outcome: 'blocked', approvalPermitted: false, requiredCodes: ['channel_not_allowed'],
  }),
  draftCase('en-undisclosed-projection', 'en-US', draftFor(projection), [projection], {
    outcome: 'revise', approvalPermitted: true, requiredCodes: ['projection_disclosure_required'],
  }),
  draftCase('fa-disclosed-projection', 'fa-IR', draftFor(disclosedProjection), [disclosedProjection], {
    outcome: 'ready', approvalPermitted: true,
  }),
  ...draftChannels.map((channel, index) => adaptationCase(
    `platform-${channel}`,
    index % 2 === 0 ? 'fa-IR' : 'en-US',
    channel,
  )),
  expressionCase('fa-grounded-specific-expression', 'fa-IR', {
    content: 'شفافیت تصمیم دشوار، اعتماد تیم را حفظ کرد؛ این مشاهده از همان تجربه مشخص آمده است.',
    assetRefs: ['asset_execution_eval'], brandUsage: true, preferenceStatus: 'none',
    expectation: { outcome: 'ready' },
  }),
  expressionCase('en-ungrounded-expression', 'en-US', {
    content: 'A polished but ungrounded personal brand statement with no owner evidence.',
    assetRefs: [], brandUsage: true, preferenceStatus: 'none',
    expectation: { outcome: 'blocked', requiredCodes: ['missing_personal_evidence'] },
  }),
  expressionCase('fa-generic-expression', 'fa-IR', {
    content: 'در دنیای امروز، شفافیت تصمیم دشوار اعتماد تیم را حفظ کرد و همه ما می‌دانیم این مهم است.',
    assetRefs: ['asset_execution_eval'], brandUsage: true, preferenceStatus: 'none',
    expectation: { outcome: 'revise', requiredCodes: ['generic_ai_language_detected'] },
  }),
  expressionCase('en-unauthorized-expression-source', 'en-US', {
    content: 'This expression points to an owner asset without brand usage permission.',
    assetRefs: ['asset_execution_eval'], brandUsage: false, preferenceStatus: 'none',
    expectation: { outcome: 'blocked', requiredCodes: ['source_not_authorized'] },
  }),
  expressionCase('fa-applied-voice-conflict', 'fa-IR', {
    content: 'شفافیت تصمیم دشوار اعتماد تیم را حفظ کرد؛ تجربه‌ای مشخص که باید مرور شود. نظر شما چیست؟',
    assetRefs: ['asset_execution_eval'], brandUsage: true, preferenceStatus: 'applied',
    expectation: { outcome: 'revise', requiredCodes: ['approved_voice_preference_conflict'] },
  }),
  expressionCase('en-proposed-voice-does-not-auto-apply', 'en-US', {
    content: 'شفافیت تصمیم دشوار اعتماد تیم را حفظ کرد؛ تجربه مشخصی که همچنان با یک پرسش تمام می‌شود؟',
    assetRefs: ['asset_execution_eval'], brandUsage: true, preferenceStatus: 'proposed',
    expectation: { outcome: 'ready' },
  }),
  learningCase('fa-single-edit-no-learning', 'fa-IR', 'single', { outcome: 'no_change' }),
  learningCase('en-repeated-edits-proposal-only', 'en-US', 'repeated', {
    outcome: 'proposal_only', requiredCodes: ['preference_proposed'],
  }),
  learningCase('fa-human-apply-and-revoke', 'fa-IR', 'reversible', {
    outcome: 'reversible', requiredCodes: ['preference_revoked'],
  }),
] as const;

export async function runAuthenticExecutionEvaluation(
  subject: AuthenticExecutionEvaluationSubject = defaultSubject,
): Promise<AuthenticExecutionEvaluationReport> {
  const outputs = new Map<string, AuthenticExecutionEvaluationOutput>();
  const suite = await runEvaluationSuite(cases, async (input) => {
    const output = await subject(input);
    outputs.set(inputCaseId(input), output);
    return output;
  });
  const hallucinationCases = cases.filter((item) => item.input.expectation.hallucinationAttack);
  const platformCases = cases.filter((item) => item.input.kind === 'adaptation');
  const authenticityCases = cases.filter((item) => item.input.kind === 'expression');
  const learningCases = cases.filter((item) => item.input.kind === 'learning');
  const passedIds = new Set(suite.results.filter((result) => result.passed).map((result) => result.caseId));
  const values = [...outputs.values()];
  const hallucinatedClaimsApproved = hallucinationCases.filter(
    (item) => outputs.get(item.id)?.approvalPermitted,
  ).length;
  const externalActionViolations = values.filter((output) => output.externalActionPermitted).length;
  const rawAssetLeakageCount = values.filter((output) => output.rawAssetContentRetained).length;
  return {
    ...suite,
    passed:
      suite.passed &&
      hallucinatedClaimsApproved === 0 &&
      externalActionViolations === 0 &&
      rawAssetLeakageCount === 0,
    suiteVersion: authenticExecutionEvaluationSuiteVersion,
    hallucinationAttackCases: hallucinationCases.length,
    hallucinatedClaimsApproved,
    platformCases: platformCases.length,
    platformCasesPassed: platformCases.filter((item) => passedIds.has(item.id)).length,
    authenticityCases: authenticityCases.length,
    authenticityCasesPassed: authenticityCases.filter((item) => passedIds.has(item.id)).length,
    learningCases: learningCases.length,
    learningCasesPassed: learningCases.filter((item) => passedIds.has(item.id)).length,
    externalActionViolations,
    rawAssetLeakageCount,
  };
}

async function defaultSubject(input: AuthenticExecutionEvaluationInput): Promise<AuthenticExecutionEvaluationOutput> {
  if (input.kind === 'draft') return draftOutput(guardDraft(input.draft, input.registry, evaluatedAt));
  if (input.kind === 'adaptation') return adaptationOutput(input);
  if (input.kind === 'expression') return expressionOutput(input);
  return learningOutput(input.mode);
}

function draftOutput(guard: DraftGuardResult): AuthenticExecutionEvaluationOutput {
  return {
    outcome: guard.classification === 'green' ? 'ready' : guard.classification === 'yellow' ? 'revise' : 'blocked',
    approvalPermitted: guard.mayRequestApproval,
    externalActionPermitted: false,
    codes: guard.violations.map((violation) => violation.code),
    claimPreserved: null,
    rawAssetContentRetained: false,
  };
}

function adaptationOutput(input: AdaptationEvaluationInput): AuthenticExecutionEvaluationOutput {
  const body = composePlatformDraft(input.channel, input.angle, input.statement, input.takeaway, input.preferences);
  const issues = platformFormatIssues(input.channel, body);
  const occurrences = body.split(input.statement).length - 1;
  const profile = platformAdaptationFor(input.channel, body);
  const claimPreserved = occurrences === 1;
  const valid = issues.length === 0 && body.length <= profile.hardMaximumCharacters && claimPreserved;
  return {
    outcome: valid ? 'ready' : 'blocked',
    approvalPermitted: false,
    externalActionPermitted: false,
    codes: [
      ...issues,
      ...(body.length > profile.hardMaximumCharacters ? ['platform_hard_limit_exceeded'] : []),
      ...(!claimPreserved ? ['registered_claim_not_preserved_exactly_once'] : []),
    ],
    claimPreserved,
    rawAssetContentRetained: false,
  };
}

async function expressionOutput(input: ExpressionEvaluationInput): Promise<AuthenticExecutionEvaluationOutput> {
  const service = new AuthenticExpressionService(
    { tenantId: tenant, ownerUserId: owner },
    { snapshot: () => Promise.resolve(expressionAssetSnapshot(input.brandUsage)) },
    { snapshot: () => Promise.resolve(expressionFeedbackSnapshot(input.preferenceStatus)) },
  );
  try {
    const review = await service.review({
      actorId: owner,
      content: input.content,
      assetRefs: input.assetRefs,
      reviewedAt: evaluatedAt,
    });
    return {
      outcome: review.outcome === 'pass' ? 'ready' : review.outcome === 'revise' ? 'revise' : 'blocked',
      approvalPermitted: false,
      externalActionPermitted: review.boundaries.externalActionPermitted,
      codes: review.findings.map((finding) => finding.code),
      claimPreserved: null,
      rawAssetContentRetained: JSON.stringify(review).includes(privateAssetMarker),
    };
  } catch (error) {
    if (!(error instanceof AuthenticExpressionPermissionError)) throw error;
    return {
      outcome: 'blocked',
      approvalPermitted: false,
      externalActionPermitted: false,
      codes: ['source_not_authorized'],
      claimPreserved: null,
      rawAssetContentRetained: false,
    };
  }
}

function learningOutput(mode: LearningEvaluationInput['mode']): AuthenticExecutionEvaluationOutput {
  const count = mode === 'single' ? 1 : 3;
  const events = Array.from({ length: count }, (_, index) => editEvent(index + 1));
  const proposal = proposePreference(
    'proposal_execution_eval',
    tenant,
    owner,
    'voice.question_cta',
    events,
    evaluatedAt,
  );
  if (!proposal) return learningResult('no_change', []);
  if (mode === 'repeated') return learningResult('proposal_only', ['preference_proposed']);
  const applied = decidePreference(
    proposal,
    'applied',
    owner,
    new Date(evaluatedAt.getTime() + 1_000),
  );
  const revokedPreference = revokePreference(
    applied,
    owner,
    new Date(evaluatedAt.getTime() + 2_000),
  );
  return learningResult(
    revokedPreference.status === 'revoked' ? 'reversible' : 'blocked',
    ['preference_revoked'],
  );
}

function learningResult(
  outcome: EvaluationOutcome,
  codes: readonly string[],
): AuthenticExecutionEvaluationOutput {
  return {
    outcome,
    approvalPermitted: false,
    externalActionPermitted: false,
    codes,
    claimPreserved: null,
    rawAssetContentRetained: false,
  };
}

function draftCase(
  id: string,
  locale: 'fa-IR' | 'en-US',
  draft: DraftArtifact,
  registry: readonly Claim[],
  expectation: EvaluationExpectation,
): EvaluationCase<AuthenticExecutionEvaluationInput, AuthenticExecutionEvaluationOutput> {
  return evaluationCase(id, locale, { kind: 'draft', draft, registry, expectation });
}

function adaptationCase(
  id: string,
  locale: 'fa-IR' | 'en-US',
  channel: DraftChannel,
): EvaluationCase<AuthenticExecutionEvaluationInput, AuthenticExecutionEvaluationOutput> {
  return evaluationCase(id, locale, {
    kind: 'adaptation',
    channel,
    angle: 'چرا شفافیت در تصمیم سخت مهم است',
    statement,
    takeaway: 'قطعیت نمایشی جای گفت‌وگوی روشن درباره ریسک را نمی‌گیرد.',
    preferences: {},
    expectation: { outcome: 'ready', claimPreserved: true },
  });
}

function expressionCase(
  id: string,
  locale: 'fa-IR' | 'en-US',
  input: Omit<ExpressionEvaluationInput, 'kind'>,
): EvaluationCase<AuthenticExecutionEvaluationInput, AuthenticExecutionEvaluationOutput> {
  return evaluationCase(id, locale, { kind: 'expression', ...input });
}

function learningCase(
  id: string,
  locale: 'fa-IR' | 'en-US',
  mode: LearningEvaluationInput['mode'],
  expectation: EvaluationExpectation,
): EvaluationCase<AuthenticExecutionEvaluationInput, AuthenticExecutionEvaluationOutput> {
  return evaluationCase(id, locale, { kind: 'learning', mode, expectation });
}

function evaluationCase(
  id: string,
  locale: 'fa-IR' | 'en-US',
  input: AuthenticExecutionEvaluationInput,
): EvaluationCase<AuthenticExecutionEvaluationInput, AuthenticExecutionEvaluationOutput> {
  const expected = input.expectation;
  return {
    id,
    locale,
    input,
    checks: [
      {
        id: 'expected-outcome',
        severity: 'critical',
        description: 'The deterministic execution gate must return the versioned expected outcome.',
        evaluate: (output) => ({
          passed: output.outcome === expected.outcome,
          evidence: `expected=${expected.outcome};actual=${output.outcome}`,
        }),
      },
      {
        id: 'approval-boundary',
        severity: 'critical',
        description: 'A blocked claim path must never become approval eligible.',
        evaluate: (output) => ({
          passed: expected.approvalPermitted === undefined || output.approvalPermitted === expected.approvalPermitted,
          evidence: `approval_permitted=${String(output.approvalPermitted)}`,
        }),
      },
      {
        id: 'required-findings',
        severity: 'high',
        description: 'The expected explainable finding codes must be present.',
        evaluate: (output) => {
          const missing = (expected.requiredCodes ?? []).filter((code) => !output.codes.includes(code));
          return {
            passed: missing.length === 0,
            evidence: missing.length === 0 ? 'all_required_codes_present' : `missing=${missing.join(',')}`,
          };
        },
      },
      {
        id: 'claim-preservation',
        severity: 'critical',
        description: 'Platform adaptation must preserve the registered claim exactly once.',
        evaluate: (output) => ({
          passed: expected.claimPreserved === undefined || output.claimPreserved === expected.claimPreserved,
          evidence: `claim_preserved=${String(output.claimPreserved)}`,
        }),
      },
      {
        id: 'no-side-effect-or-raw-asset',
        severity: 'critical',
        description: 'Evaluation cannot authorize an external action or retain raw asset content.',
        evaluate: (output) => ({
          passed: !output.externalActionPermitted && !output.rawAssetContentRetained,
          evidence: `external=${String(output.externalActionPermitted)};raw_asset=${String(output.rawAssetContentRetained)}`,
        }),
      },
    ],
  };
}

function inputCaseId(input: AuthenticExecutionEvaluationInput): string {
  const match = cases.find((evaluation) => evaluation.input === input);
  if (!match) throw new Error('Authentic execution evaluation case is not registered.');
  return match.id;
}

function draftFor(
  claim: Claim,
  overrides: Readonly<{
    tenantId?: DraftArtifact['tenantId'];
    body?: string;
    excerpt?: string;
    claimExtractionComplete?: boolean;
  }> = {},
): DraftArtifact {
  return {
    id: `draft_${claim.id}`,
    tenantId: overrides.tenantId ?? claim.tenantId,
    channel: 'linkedin',
    purpose: 'public_drafting',
    body: overrides.body ?? claim.statement,
    claimExtractionComplete: overrides.claimExtractionComplete ?? true,
    claims: [{ claimId: claim.id, excerpt: overrides.excerpt ?? claim.statement }],
  };
}

function factualClaim(
  id: string,
  claimStatement: string,
  kind: ClaimKind = 'personal_fact',
  overrides: Readonly<{ validUntil?: Date }> = {},
): Claim {
  return verifyClaim(proposedClaim(id, claimStatement, kind, overrides), owner, new Date('2026-08-02T15:00:00.000Z'));
}

function proposedClaim(
  id: string,
  claimStatement: string,
  kind: ClaimKind = 'personal_fact',
  overrides: Readonly<{ validUntil?: Date }> = {},
): Claim {
  return proposeClaim({
    id,
    tenantId: tenant,
    statement: claimStatement,
    kind,
    dataClass: 'confidential',
    evidenceIds: kind === 'opinion' || kind === 'projection' ? [] : [evidenceId(`evidence_${id}`)],
    sourceRefs: kind === 'external_fact' ? ['https://research.example.org/source'] : [],
    allowedPurposes: ['public_drafting'],
    allowedChannels: ['linkedin'],
    validFrom: new Date('2026-08-01T15:00:00.000Z'),
    ...(overrides.validUntil ? { validUntil: overrides.validUntil } : {}),
    createdAt: new Date('2026-08-01T15:00:00.000Z'),
    createdBy: owner,
  });
}

function expressionAssetSnapshot(brandUsage: boolean): TextAssetSnapshot {
  return {
    generatedAt: evaluatedAt,
    persistence: 'memory',
    summary: { assets: 1, evidenceItems: 1, assertions: 1, dataRights: 0 },
    records: [{
      requestId: 'asset_execution_eval',
      assetId: 'asset_execution_eval',
      evidenceId: 'evidence_execution_eval',
      assertionId: 'assertion_execution_eval',
      title: 'شفافیت در تصمیم دشوار',
      content: privateAssetMarker,
      assertionText: statement,
      sourceType: 'text_asset',
      dataClass: 'confidential',
      integritySha256: 'a'.repeat(64),
      occurredAt: evaluatedAt,
      importedAt: evaluatedAt,
      permissions: { personalUnderstanding: true, brandUsage },
    }],
  };
}

function expressionFeedbackSnapshot(
  status: ExpressionEvaluationInput['preferenceStatus'],
): FeedbackLearningSnapshot {
  const preferences: readonly PreferenceProposal[] = status === 'none' ? [] : [{
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: tenant,
    userId: owner,
    preferenceKey: 'voice.question_cta',
    proposedValue: 'omit',
    evidenceEventIds: ['edit_1', 'edit_2', 'edit_3'],
    rationale: 'Three consistent owner edits removed the question CTA.',
    confidence: 0.6,
    status,
    proposedAt: evaluatedAt,
  }];
  return {
    generatedAt: evaluatedAt,
    persistence: 'memory',
    summary: {
      recentEvents: 3,
      proposed: status === 'proposed' ? 1 : 0,
      applied: status === 'applied' ? 1 : 0,
    },
    recentEvents: [],
    preferences,
  };
}

function editEvent(index: number): FeedbackEvent {
  return {
    id: `edit_execution_${String(index)}`,
    tenantId: tenant,
    userId: owner,
    artifactType: 'draft',
    artifactId: `draft_execution_${String(index)}`,
    eventType: 'edited',
    signalKey: 'voice.question_cta',
    signalValue: 'omit',
    occurredAt: new Date(evaluatedAt.getTime() - (4 - index) * 1_000),
  };
}
