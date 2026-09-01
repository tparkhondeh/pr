import {
  ConnectorLifecycleService,
  ConnectorLifecycleValidationError,
  ConnectorRevocationIncompleteError,
  type ConnectorAuthorizationRequest,
  type ConnectorKind,
  type ConnectorRegistrationInput,
  type ConnectorScope,
} from '../src/connectors/lifecycle.js';
import type { EvaluationCase, EvaluationSuiteResult } from '../src/evaluation/evaluation.js';
import { runEvaluationSuite } from '../src/evaluation/evaluation.js';
import { tenantId, userId } from '../src/kernel/identity.js';

export const connectorGovernanceEvaluationSuiteVersion = 'connector-governance-eval-v1' as const;

type EvaluationOutcome = 'registered_disabled' | 'denied' | 'revoked' | 'verified' | 'suspended';
type RegistrationMode =
  | 'valid'
  | 'raw_secret'
  | 'missing_human_review'
  | 'missing_privacy_review'
  | 'missing_revocation_plan'
  | 'retention_escalation'
  | 'restricted_data'
  | 'missing_credential_reference'
  | 'null_scope'
  | 'operation_escalation';
type AuthorizationMode =
  | 'runtime_disabled' | 'cross_tenant' | 'purpose_scope' | 'rate_limit' | 'missing_approval';
type LifecycleMode = 'revoke' | 'incomplete_deletion' | 'verify' | 'incident';

export type ConnectorGovernanceEvaluationOutput = Readonly<{
  outcome: EvaluationOutcome;
  codes: readonly string[];
  externalActionPermitted: boolean;
  externalNetworkCallPermitted: boolean;
  connectorActive: boolean;
  rawCredentialRetained: boolean;
  deletionPropagationVerified: boolean;
}>;

type EvaluationExpectation = Readonly<{
  outcome: EvaluationOutcome;
  requiredCodes?: readonly string[];
  attack?: boolean;
  rawCredentialAttack?: boolean;
  revocationDrill?: boolean;
  deletionPropagationVerified?: boolean;
}>;

export type ConnectorGovernanceEvaluationInput = Readonly<{
  kind: 'registration';
  connectorKind: ConnectorKind;
  mode: RegistrationMode;
  expectation: EvaluationExpectation;
}> | Readonly<{
  kind: 'authorization';
  mode: AuthorizationMode;
  expectation: EvaluationExpectation;
}> | Readonly<{
  kind: 'lifecycle';
  mode: LifecycleMode;
  expectation: EvaluationExpectation;
}>;

export type ConnectorGovernanceEvaluationSubject = (
  input: ConnectorGovernanceEvaluationInput,
) => Promise<ConnectorGovernanceEvaluationOutput>;

export type ConnectorGovernanceEvaluationReport = EvaluationSuiteResult & Readonly<{
  suiteVersion: typeof connectorGovernanceEvaluationSuiteVersion;
  scopeAttackCases: number;
  scopeAttacksBlocked: number;
  rawCredentialAttackCases: number;
  rawCredentialAttacksBlocked: number;
  revocationDrillCases: number;
  revocationDrillsPassed: number;
  deletionPropagationFailures: number;
  externalActionViolations: number;
  externalNetworkViolations: number;
  activeConnectorViolations: number;
  rawCredentialLeakageCount: number;
}>;

const evaluatedAt = new Date('2026-09-01T18:00:00.000Z');
const owner = userId('owner_connector_governance_eval');
const activeTenant = tenantId('tenant_connector_governance_eval');
const service = () => new ConnectorLifecycleService({ tenantId: activeTenant, ownerUserId: owner });

const cases: readonly EvaluationCase<ConnectorGovernanceEvaluationInput, ConnectorGovernanceEvaluationOutput>[] = [
  ...(['research_web', 'calendar', 'email', 'crm', 'social_listening', 'publishing'] as const)
    .map((connectorKind, index) => registrationCase(
      `profile-${connectorKind}-disabled`, index % 2 === 0 ? 'fa-IR' : 'en-US', connectorKind, 'valid',
      { outcome: 'registered_disabled', requiredCodes: ['runtime_disabled'] },
    )),
  registrationCase('attack-raw-secret-field', 'en-US', 'publishing', 'raw_secret', {
    outcome: 'denied', requiredCodes: ['registration_rejected:raw_secret'], attack: true, rawCredentialAttack: true,
  }),
  registrationCase('attack-missing-human-review', 'fa-IR', 'calendar', 'missing_human_review', {
    outcome: 'denied', requiredCodes: ['registration_rejected:missing_human_review'], attack: true,
  }),
  registrationCase('attack-missing-privacy-review', 'en-US', 'email', 'missing_privacy_review', {
    outcome: 'denied', requiredCodes: ['registration_rejected:missing_privacy_review'], attack: true,
  }),
  registrationCase('attack-missing-revocation-plan', 'fa-IR', 'crm', 'missing_revocation_plan', {
    outcome: 'denied', requiredCodes: ['registration_rejected:missing_revocation_plan'], attack: true,
  }),
  registrationCase('attack-retention-escalation', 'en-US', 'research_web', 'retention_escalation', {
    outcome: 'denied', requiredCodes: ['registration_rejected:retention_escalation'], attack: true,
  }),
  registrationCase('attack-restricted-data', 'fa-IR', 'research_web', 'restricted_data', {
    outcome: 'denied', requiredCodes: ['registration_rejected:restricted_data'], attack: true,
  }),
  registrationCase('attack-missing-credential-reference', 'en-US', 'publishing', 'missing_credential_reference', {
    outcome: 'denied', requiredCodes: ['registration_rejected:missing_credential_reference'], attack: true,
  }),
  registrationCase('attack-null-scope', 'fa-IR', 'research_web', 'null_scope', {
    outcome: 'denied', requiredCodes: ['registration_rejected:null_scope'], attack: true,
  }),
  registrationCase('attack-operation-escalation', 'en-US', 'calendar', 'operation_escalation', {
    outcome: 'denied', requiredCodes: ['registration_rejected:operation_escalation'], attack: true,
  }),
  authorizationCase('authorization-runtime-disabled', 'fa-IR', 'runtime_disabled', {
    outcome: 'denied', requiredCodes: ['connector_runtime_disabled', 'connector_not_active'],
  }),
  authorizationCase('attack-cross-tenant', 'en-US', 'cross_tenant', {
    outcome: 'denied', requiredCodes: ['cross_tenant_connector'], attack: true,
  }),
  authorizationCase('attack-purpose-scope', 'fa-IR', 'purpose_scope', {
    outcome: 'denied', requiredCodes: ['purpose_out_of_scope'], attack: true,
  }),
  authorizationCase('attack-rate-limit', 'fa-IR', 'rate_limit', {
    outcome: 'denied', requiredCodes: ['rate_limit_exceeded'], attack: true,
  }),
  authorizationCase('attack-missing-approval', 'en-US', 'missing_approval', {
    outcome: 'denied', requiredCodes: ['human_approval_required'], attack: true,
  }),
  lifecycleCase('revocation-cleanup-plan', 'fa-IR', 'revoke', {
    outcome: 'revoked', requiredCodes: ['in_flight_cancel_required', 'credential_destruction_required'],
    revocationDrill: true,
  }),
  lifecycleCase('revocation-incomplete-deletion-denied', 'en-US', 'incomplete_deletion', {
    outcome: 'denied', requiredCodes: ['derived_data_deletion'], revocationDrill: true,
  }),
  lifecycleCase('revocation-verified-receipt', 'fa-IR', 'verify', {
    outcome: 'verified', requiredCodes: ['deletion_receipt_verified'], revocationDrill: true,
    deletionPropagationVerified: true,
  }),
  lifecycleCase('incident-immediate-hold', 'en-US', 'incident', {
    outcome: 'suspended', requiredCodes: ['outbound_held', 'credential_rotation_required'],
    revocationDrill: true,
  }),
] as const;

export async function runConnectorGovernanceEvaluation(
  subject: ConnectorGovernanceEvaluationSubject = defaultSubject,
): Promise<ConnectorGovernanceEvaluationReport> {
  const outputs = new Map<string, ConnectorGovernanceEvaluationOutput>();
  const suite = await runEvaluationSuite(cases, async (input) => {
    const output = await subject(input);
    outputs.set(inputCaseId(input), output);
    return output;
  });
  const passedIds = new Set(suite.results.filter((result) => result.passed).map((result) => result.caseId));
  const attackCases = cases.filter((item) => item.input.expectation.attack);
  const rawCredentialCases = cases.filter((item) => item.input.expectation.rawCredentialAttack);
  const revocationCases = cases.filter((item) => item.input.expectation.revocationDrill);
  const values = [...outputs.values()];
  const scopeAttacksBlocked = attackCases.filter((item) => outputs.get(item.id)?.outcome === 'denied').length;
  const rawCredentialAttacksBlocked = rawCredentialCases.filter((item) => {
    const output = outputs.get(item.id);
    return output?.outcome === 'denied' && !output.rawCredentialRetained;
  }).length;
  const deletionPropagationFailures = cases.filter((item) =>
    item.input.expectation.deletionPropagationVerified === true &&
    !outputs.get(item.id)?.deletionPropagationVerified).length;
  const externalActionViolations = values.filter((output) => output.externalActionPermitted).length;
  const externalNetworkViolations = values.filter((output) => output.externalNetworkCallPermitted).length;
  const activeConnectorViolations = values.filter((output) => output.connectorActive).length;
  const rawCredentialLeakageCount = values.filter((output) => output.rawCredentialRetained).length;
  return {
    ...suite,
    passed: suite.passed && scopeAttacksBlocked === attackCases.length &&
      rawCredentialAttacksBlocked === rawCredentialCases.length && deletionPropagationFailures === 0 &&
      externalActionViolations === 0 && externalNetworkViolations === 0 &&
      activeConnectorViolations === 0 && rawCredentialLeakageCount === 0,
    suiteVersion: connectorGovernanceEvaluationSuiteVersion,
    scopeAttackCases: attackCases.length,
    scopeAttacksBlocked,
    rawCredentialAttackCases: rawCredentialCases.length,
    rawCredentialAttacksBlocked,
    revocationDrillCases: revocationCases.length,
    revocationDrillsPassed: revocationCases.filter((item) => passedIds.has(item.id)).length,
    deletionPropagationFailures,
    externalActionViolations,
    externalNetworkViolations,
    activeConnectorViolations,
    rawCredentialLeakageCount,
  };
}

function defaultSubject(
  input: ConnectorGovernanceEvaluationInput,
): Promise<ConnectorGovernanceEvaluationOutput> {
  const result = input.kind === 'registration'
    ? registrationOutput(input.connectorKind, input.mode)
    : input.kind === 'authorization'
      ? authorizationOutput(input.mode)
      : lifecycleOutput(input.mode);
  return Promise.resolve(result);
}

function registrationOutput(kind: ConnectorKind, mode: RegistrationMode): ConnectorGovernanceEvaluationOutput {
  const input = registrationInput(kind);
  try {
    const candidate = unsafeRegistrationInput(input, mode);
    const registration = service().register(candidate);
    return output('registered_disabled', ['runtime_disabled'], {
      externalNetworkCallPermitted: registration.externalNetworkCallsPermitted,
      connectorActive: registration.status !== 'registered_disabled',
      rawCredentialRetained: registration.rawCredentialRetained,
    });
  } catch (error: unknown) {
    if (!(error instanceof ConnectorLifecycleValidationError)) throw error;
    return output('denied', [`registration_rejected:${mode}`]);
  }
}

function authorizationOutput(mode: AuthorizationMode): ConnectorGovernanceEvaluationOutput {
  const lifecycle = service();
  const registration = lifecycle.register(registrationInput('publishing'));
  const request: ConnectorAuthorizationRequest = {
    tenantId: mode === 'cross_tenant' ? tenantId('tenant_connector_attacker') : activeTenant,
    actorId: owner,
    purpose: mode === 'purpose_scope' ? 'external_research' : 'public_drafting',
    operation: 'share',
    dataClass: 'public',
    channel: 'linkedin',
    resourceType: 'approved_draft',
    includesThirdPartyData: false,
    recentOperationCount: mode === 'rate_limit' ? 2 : 0,
    humanApprovalPresent: mode !== 'missing_approval',
  };
  const decision = lifecycle.authorize(registration, request, evaluatedAt);
  return output('denied', decision.findingCodes, {
    externalActionPermitted: decision.externalActionPermitted,
    externalNetworkCallPermitted: decision.runtimeEnabled,
  });
}

function lifecycleOutput(mode: LifecycleMode): ConnectorGovernanceEvaluationOutput {
  const lifecycle = service();
  const registration = lifecycle.register(registrationInput('publishing'));
  if (mode === 'incident') {
    const contained = lifecycle.containIncident(registration, {
      actorId: owner,
      expectedVersion: 1,
      severity: 'sev1',
      reason: 'Synthetic connector incident requires immediate containment.',
      evidenceSha256: 'c'.repeat(64),
      humanAttestation: true,
      containedAt: evaluatedAt,
    });
    return output('suspended', ['outbound_held', 'credential_rotation_required'], {
      externalNetworkCallPermitted: contained.externalNetworkCallsPermitted,
      connectorActive: false,
    });
  }
  const revoked = lifecycle.revoke(registration, {
    actorId: owner,
    requestId: 'revoke_connector_eval',
    expectedVersion: 1,
    reason: 'Synthetic owner revocation drill for connector governance.',
    revokedAt: evaluatedAt,
  }).registration;
  if (mode === 'revoke') {
    return output('revoked', ['in_flight_cancel_required', 'credential_destruction_required'], {
      externalNetworkCallPermitted: revoked.externalNetworkCallsPermitted,
    });
  }
  try {
    const verified = lifecycle.verifyRevocation(revoked, {
      actorId: owner,
      expectedVersion: 2,
      inFlightCancelled: true,
      providerGrantRevokedOrAbsent: true,
      credentialDestroyedOrAbsent: true,
      cachesPurged: true,
      derivedDataDeleted: mode === 'verify',
      deletionReceiptSha256: 'd'.repeat(64),
      humanAttestation: true,
      verifiedAt: new Date(evaluatedAt.getTime() + 1_000),
    });
    return output('verified', ['deletion_receipt_verified'], {
      deletionPropagationVerified: verified.deletionState === 'verified',
      externalNetworkCallPermitted: verified.externalNetworkCallsPermitted,
    });
  } catch (error: unknown) {
    if (!(error instanceof ConnectorRevocationIncompleteError)) throw error;
    return output('denied', error.missing);
  }
}

function unsafeRegistrationInput(
  input: ConnectorRegistrationInput,
  mode: RegistrationMode,
): ConnectorRegistrationInput {
  if (mode === 'raw_secret') {
    return { ...input, accessToken: 'synthetic-raw-secret' } as ConnectorRegistrationInput;
  }
  if (mode === 'missing_human_review') return { ...input, humanAttestation: false };
  if (mode === 'missing_privacy_review') return { ...input, privacyReviewCompleted: false };
  if (mode === 'missing_revocation_plan') return { ...input, revocationPlanConfirmed: false };
  if (mode === 'retention_escalation') return { ...input, retentionDays: 91 };
  if (mode === 'restricted_data') {
    return { ...input, scope: { ...input.scope, dataClasses: ['restricted'] } };
  }
  if (mode === 'missing_credential_reference') {
    const { credentialReferenceSha256, ...withoutCredential } = input;
    void credentialReferenceSha256;
    return withoutCredential;
  }
  if (mode === 'null_scope') return { ...input, scope: null } as unknown as ConnectorRegistrationInput;
  if (mode === 'operation_escalation') {
    return { ...input, scope: { ...input.scope, operations: ['share'] } };
  }
  return input;
}

function registrationInput(kind: ConnectorKind): ConnectorRegistrationInput {
  return {
    actorId: owner,
    connectorId: `connector_eval_${kind}`,
    kind,
    scope: scopeFor(kind),
    retentionDays: kind === 'publishing' ? 1 : 7,
    expiresAt: new Date(evaluatedAt.getTime() + 30 * 86_400_000),
    ...(kind === 'research_web' ? {} : { credentialReferenceSha256: 'b'.repeat(64) }),
    humanAttestation: true,
    privacyReviewCompleted: true,
    revocationPlanConfirmed: true,
    registeredAt: new Date(evaluatedAt.getTime() - 1_000),
  };
}

function scopeFor(kind: ConnectorKind): ConnectorScope {
  const scopes: Readonly<Record<ConnectorKind, ConnectorScope>> = {
    research_web: {
      purposes: ['external_research'], operations: ['read'], dataClasses: ['public'],
      channels: ['web'], resourceTypes: ['research_source'], thirdPartyData: 'forbidden',
    },
    calendar: {
      purposes: ['relationship_planning'], operations: ['read'], dataClasses: ['internal'],
      channels: ['calendar'], resourceTypes: ['event_metadata'], thirdPartyData: 'metadata_only',
    },
    email: {
      purposes: ['relationship_planning'], operations: ['read'], dataClasses: ['internal'],
      channels: ['email'], resourceTypes: ['message_metadata'], thirdPartyData: 'metadata_only',
    },
    crm: {
      purposes: ['relationship_planning'], operations: ['read'], dataClasses: ['internal'],
      channels: ['crm'], resourceTypes: ['relationship_metadata'], thirdPartyData: 'metadata_only',
    },
    social_listening: {
      purposes: ['external_research'], operations: ['read'], dataClasses: ['public'],
      channels: ['social'], resourceTypes: ['public_signal'], thirdPartyData: 'metadata_only',
    },
    publishing: {
      purposes: ['public_drafting'], operations: ['share'], dataClasses: ['public'],
      channels: ['linkedin'], resourceTypes: ['approved_draft'], thirdPartyData: 'forbidden',
    },
  };
  return scopes[kind];
}

function output(
  outcome: EvaluationOutcome,
  codes: readonly string[],
  overrides: Partial<Omit<ConnectorGovernanceEvaluationOutput, 'outcome' | 'codes'>> = {},
): ConnectorGovernanceEvaluationOutput {
  return {
    outcome,
    codes,
    externalActionPermitted: false,
    externalNetworkCallPermitted: false,
    connectorActive: false,
    rawCredentialRetained: false,
    deletionPropagationVerified: false,
    ...overrides,
  };
}

function registrationCase(
  id: string,
  locale: 'fa-IR' | 'en-US',
  connectorKind: ConnectorKind,
  mode: RegistrationMode,
  expectation: EvaluationExpectation,
): EvaluationCase<ConnectorGovernanceEvaluationInput, ConnectorGovernanceEvaluationOutput> {
  return evaluationCase(id, locale, { kind: 'registration', connectorKind, mode, expectation });
}

function authorizationCase(
  id: string,
  locale: 'fa-IR' | 'en-US',
  mode: AuthorizationMode,
  expectation: EvaluationExpectation,
): EvaluationCase<ConnectorGovernanceEvaluationInput, ConnectorGovernanceEvaluationOutput> {
  return evaluationCase(id, locale, { kind: 'authorization', mode, expectation });
}

function lifecycleCase(
  id: string,
  locale: 'fa-IR' | 'en-US',
  mode: LifecycleMode,
  expectation: EvaluationExpectation,
): EvaluationCase<ConnectorGovernanceEvaluationInput, ConnectorGovernanceEvaluationOutput> {
  return evaluationCase(id, locale, { kind: 'lifecycle', mode, expectation });
}

function evaluationCase(
  id: string,
  locale: 'fa-IR' | 'en-US',
  input: ConnectorGovernanceEvaluationInput,
): EvaluationCase<ConnectorGovernanceEvaluationInput, ConnectorGovernanceEvaluationOutput> {
  return {
    id,
    locale,
    input,
    checks: [
      {
        id: 'expected-outcome',
        severity: 'critical',
        description: 'The connector lifecycle gate must return the expected versioned outcome.',
        evaluate: (result) => ({
          passed: result.outcome === input.expectation.outcome,
          evidence: `expected=${input.expectation.outcome};actual=${result.outcome}`,
        }),
      },
      {
        id: 'required-findings',
        severity: 'high',
        description: 'The connector decision must preserve explainable denial and cleanup codes.',
        evaluate: (result) => {
          const missing = (input.expectation.requiredCodes ?? []).filter((code) => !result.codes.includes(code));
          return {
            passed: missing.length === 0,
            evidence: missing.length === 0 ? 'all_required_codes_present' : `missing=${missing.join(',')}`,
          };
        },
      },
      {
        id: 'no-external-side-effects',
        severity: 'critical',
        description: 'No evaluated connector path may activate a connector, call the network, or execute externally.',
        evaluate: (result) => ({
          passed: !result.externalActionPermitted && !result.externalNetworkCallPermitted && !result.connectorActive,
          evidence: `external=${String(result.externalActionPermitted)};network=${String(result.externalNetworkCallPermitted)};active=${String(result.connectorActive)}`,
        }),
      },
      {
        id: 'no-raw-credential-retention',
        severity: 'critical',
        description: 'Raw connector credentials must never be retained by the lifecycle contract.',
        evaluate: (result) => ({
          passed: !result.rawCredentialRetained,
          evidence: `raw_credential_retained=${String(result.rawCredentialRetained)}`,
        }),
      },
      {
        id: 'deletion-propagation',
        severity: 'critical',
        description: 'A verified revocation drill must include deletion propagation evidence.',
        evaluate: (result) => ({
          passed: input.expectation.deletionPropagationVerified !== true || result.deletionPropagationVerified,
          evidence: `deletion_propagation_verified=${String(result.deletionPropagationVerified)}`,
        }),
      },
    ],
  };
}

function inputCaseId(input: ConnectorGovernanceEvaluationInput): string {
  const match = cases.find((item) => item.input === input);
  if (!match) throw new Error('Connector governance evaluation case is not registered.');
  return match.id;
}
