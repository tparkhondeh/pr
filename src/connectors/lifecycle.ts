import { createHash } from 'node:crypto';
import type { TenantId, UserId } from '../kernel/identity.js';
import type { DataClass, Operation, Purpose } from '../kernel/policy.js';

export const connectorLifecyclePolicyVersion = 'connector-lifecycle-v1' as const;

export const connectorKinds = [
  'research_web',
  'calendar',
  'email',
  'crm',
  'social_listening',
  'publishing',
] as const;

export type ConnectorKind = (typeof connectorKinds)[number];
export type ConnectorStatus =
  | 'registered_disabled'
  | 'suspended'
  | 'revoked'
  | 'revocation_verified';
export type ConnectorCredentialState =
  | 'not_provisioned'
  | 'reference_bound'
  | 'rotation_required'
  | 'destruction_required'
  | 'destroyed';
export type ConnectorDeletionState = 'not_required' | 'required' | 'quarantined' | 'verified';

export const connectorLifecycleFindingCodes = [
  'connector_runtime_disabled',
  'connector_not_active',
  'cross_tenant_connector',
  'connector_owner_mismatch',
  'connector_expired',
  'purpose_out_of_scope',
  'operation_out_of_scope',
  'data_class_out_of_scope',
  'channel_out_of_scope',
  'resource_type_out_of_scope',
  'third_party_data_forbidden',
  'rate_limit_exceeded',
  'human_approval_required',
  'credential_reference_required',
] as const;

export type ConnectorLifecycleFindingCode = (typeof connectorLifecycleFindingCodes)[number];

export type ConnectorScope = Readonly<{
  purposes: readonly Purpose[];
  operations: readonly Operation[];
  dataClasses: readonly DataClass[];
  channels: readonly string[];
  resourceTypes: readonly string[];
  thirdPartyData: 'forbidden' | 'metadata_only';
}>;

export type ConnectorProfile = Readonly<{
  kind: ConnectorKind;
  label: string;
  risk: 'yellow' | 'red';
  allowedPurposes: readonly Purpose[];
  allowedOperations: readonly Operation[];
  allowedDataClasses: readonly DataClass[];
  allowedChannels: readonly string[];
  allowedResourceTypes: readonly string[];
  thirdPartyData: ConnectorScope['thirdPartyData'];
  credentialReferenceRequired: boolean;
  maximumRetentionDays: number;
  maximumOperationsPerHour: number;
  runtimeStatus: 'disabled';
  activationBlockers: readonly string[];
}>;

export type ConnectorRegistration = Readonly<{
  connectorId: string;
  tenantId: TenantId;
  ownerUserId: UserId;
  kind: ConnectorKind;
  status: ConnectorStatus;
  version: number;
  scope: ConnectorScope;
  scopeSha256: string;
  retentionDays: number;
  expiresAt: Date;
  credentialReferenceSha256?: string;
  credentialState: ConnectorCredentialState;
  deletionState: ConnectorDeletionState;
  providerGrantState: 'not_requested' | 'revoke_required' | 'revoked';
  rawCredentialRetained: false;
  externalNetworkCallsPermitted: false;
  outboundExecutionPermitted: false;
  registeredAt: Date;
  lastTransitionAt: Date;
  revocation?: ConnectorRevocationRecord;
  incident?: ConnectorIncidentRecord;
}>;

export type ConnectorRevocationRecord = Readonly<{
  requestId: string;
  reason: string;
  revokedAt: Date;
  inFlightCancellationRequired: true;
  providerGrantRevocationRequired: boolean;
  credentialDestructionRequired: boolean;
  cachePurgeRequired: true;
  derivedDataDeletionRequired: true;
  verificationReceiptSha256?: string;
  verifiedAt?: Date;
}>;

export type ConnectorIncidentRecord = Readonly<{
  severity: 'sev1' | 'sev2' | 'sev3';
  reason: string;
  evidenceSha256: string;
  containedAt: Date;
  inFlightCancellationRequired: true;
  credentialRotationRequired: boolean;
  evidenceRetention: 'hash_only';
}>;

export type ConnectorRegistrationInput = Readonly<{
  actorId: UserId;
  connectorId: string;
  kind: ConnectorKind;
  scope: ConnectorScope;
  retentionDays: number;
  expiresAt: Date;
  credentialReferenceSha256?: string;
  humanAttestation: boolean;
  privacyReviewCompleted: boolean;
  revocationPlanConfirmed: boolean;
  registeredAt: Date;
}>;

export type ConnectorAuthorizationRequest = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  purpose: Purpose;
  operation: Operation;
  dataClass: DataClass;
  channel: string;
  resourceType: string;
  includesThirdPartyData: boolean;
  recentOperationCount: number;
  humanApprovalPresent: boolean;
}>;

export type ConnectorAuthorizationDecision = Readonly<{
  policyVersion: typeof connectorLifecyclePolicyVersion;
  allowed: false;
  externalActionPermitted: false;
  findingCodes: readonly ConnectorLifecycleFindingCode[];
  evaluatedScopeSha256: string;
  runtimeEnabled: false;
}>;

export type ConnectorLifecycleSnapshot = Readonly<{
  policyVersion: typeof connectorLifecyclePolicyVersion;
  generatedAt: Date;
  runtimeEnabled: false;
  externalNetworkCallsPermitted: false;
  automaticExecutionAllowed: false;
  rawCredentialAccepted: false;
  credentialReferenceFormat: 'sha256_only';
  shortLivedApprovalTokensEnabled: false;
  activationEligibleConnectors: 0;
  activeConnectors: 0;
  summary: Readonly<{
    supportedProfiles: number;
    yellowProfiles: number;
    redProfiles: number;
    profilesRequiringCredentialReference: number;
  }>;
  revocation: Readonly<{
    cancelInFlightRequired: true;
    providerGrantRevocationRequired: true;
    credentialDestructionRequiredWhenBound: true;
    cachePurgeRequired: true;
    derivedDataDeletionRequired: true;
    verificationReceiptRequired: true;
  }>;
  incident: Readonly<{
    immediateHoldRequired: true;
    evidenceRetention: 'hash_only';
    credentialRotationRequiredWhenBound: true;
    ownerNotificationRequired: true;
  }>;
  profiles: readonly ConnectorProfile[];
}>;

export class ConnectorLifecycleValidationError extends Error {}
export class ConnectorLifecyclePermissionError extends Error {}
export class ConnectorLifecycleConflictError extends Error {
  public constructor(public readonly reason: 'version_changed' | 'already_terminal' | 'idempotency_mismatch') {
    super(`Connector lifecycle conflict: ${reason}`);
  }
}
export class ConnectorRevocationIncompleteError extends Error {
  public constructor(public readonly missing: readonly string[]) {
    super(`Connector revocation verification is incomplete: ${missing.join(',')}`);
  }
}

const profileList: readonly ConnectorProfile[] = [
  profile({
    kind: 'research_web', label: 'Web Research', risk: 'yellow',
    allowedPurposes: ['external_research'], allowedOperations: ['read', 'process', 'derive'],
    allowedDataClasses: ['public', 'internal'], allowedChannels: ['web'],
    allowedResourceTypes: ['research_source'], thirdPartyData: 'forbidden',
    credentialReferenceRequired: false, maximumRetentionDays: 30, maximumOperationsPerHour: 20,
  }),
  profile({
    kind: 'calendar', label: 'Calendar', risk: 'red',
    allowedPurposes: ['relationship_planning', 'strategy_reasoning'], allowedOperations: ['read', 'process'],
    allowedDataClasses: ['internal', 'confidential'], allowedChannels: ['calendar'],
    allowedResourceTypes: ['event_metadata'], thirdPartyData: 'metadata_only',
    credentialReferenceRequired: true, maximumRetentionDays: 14, maximumOperationsPerHour: 30,
  }),
  profile({
    kind: 'email', label: 'Email', risk: 'red',
    allowedPurposes: ['relationship_planning', 'perception_analysis'], allowedOperations: ['read', 'process'],
    allowedDataClasses: ['internal', 'confidential'], allowedChannels: ['email'],
    allowedResourceTypes: ['message_metadata'], thirdPartyData: 'metadata_only',
    credentialReferenceRequired: true, maximumRetentionDays: 7, maximumOperationsPerHour: 10,
  }),
  profile({
    kind: 'crm', label: 'CRM', risk: 'red',
    allowedPurposes: ['relationship_planning'], allowedOperations: ['read', 'process', 'derive'],
    allowedDataClasses: ['internal', 'confidential'], allowedChannels: ['crm'],
    allowedResourceTypes: ['relationship_metadata'], thirdPartyData: 'metadata_only',
    credentialReferenceRequired: true, maximumRetentionDays: 30, maximumOperationsPerHour: 20,
  }),
  profile({
    kind: 'social_listening', label: 'Social Listening', risk: 'red',
    allowedPurposes: ['external_research', 'perception_analysis'], allowedOperations: ['read', 'process', 'derive'],
    allowedDataClasses: ['public', 'internal'], allowedChannels: ['social'],
    allowedResourceTypes: ['public_signal'], thirdPartyData: 'metadata_only',
    credentialReferenceRequired: true, maximumRetentionDays: 14, maximumOperationsPerHour: 20,
  }),
  profile({
    kind: 'publishing', label: 'Publishing', risk: 'red',
    allowedPurposes: ['public_drafting', 'external_sharing'], allowedOperations: ['export', 'share'],
    allowedDataClasses: ['public', 'internal'],
    allowedChannels: ['linkedin', 'instagram', 'x', 'youtube', 'podcast', 'newsletter', 'blog'],
    allowedResourceTypes: ['approved_draft'], thirdPartyData: 'forbidden',
    credentialReferenceRequired: true, maximumRetentionDays: 1, maximumOperationsPerHour: 2,
  }),
] as const;

const profiles = new Map(profileList.map((item) => [item.kind, item]));

export class ConnectorLifecycleService {
  public constructor(private readonly identity: Readonly<{ tenantId: TenantId; ownerUserId: UserId }>) {}

  public snapshot(actorId: UserId, generatedAt: Date): ConnectorLifecycleSnapshot {
    this.assertOwner(actorId);
    validateDate(generatedAt, 'Connector snapshot time');
    return {
      policyVersion: connectorLifecyclePolicyVersion,
      generatedAt,
      runtimeEnabled: false,
      externalNetworkCallsPermitted: false,
      automaticExecutionAllowed: false,
      rawCredentialAccepted: false,
      credentialReferenceFormat: 'sha256_only',
      shortLivedApprovalTokensEnabled: false,
      activationEligibleConnectors: 0,
      activeConnectors: 0,
      summary: {
        supportedProfiles: profileList.length,
        yellowProfiles: profileList.filter((item) => item.risk === 'yellow').length,
        redProfiles: profileList.filter((item) => item.risk === 'red').length,
        profilesRequiringCredentialReference: profileList.filter((item) => item.credentialReferenceRequired).length,
      },
      revocation: {
        cancelInFlightRequired: true,
        providerGrantRevocationRequired: true,
        credentialDestructionRequiredWhenBound: true,
        cachePurgeRequired: true,
        derivedDataDeletionRequired: true,
        verificationReceiptRequired: true,
      },
      incident: {
        immediateHoldRequired: true,
        evidenceRetention: 'hash_only',
        credentialRotationRequiredWhenBound: true,
        ownerNotificationRequired: true,
      },
      profiles: profileList,
    };
  }

  public register(input: ConnectorRegistrationInput): ConnectorRegistration {
    this.assertOwner(input.actorId);
    validateExactKeys(input, registrationKeys, 'Connector registration');
    validateConnectorId(input.connectorId);
    if (!connectorKinds.includes(input.kind)) throw new ConnectorLifecycleValidationError('Connector kind is invalid.');
    if (!input.humanAttestation || !input.privacyReviewCompleted || !input.revocationPlanConfirmed) {
      throw new ConnectorLifecycleValidationError('Connector registration requires explicit human, privacy, and revocation review.');
    }
    validateDate(input.registeredAt, 'Connector registration time');
    validateDate(input.expiresAt, 'Connector expiry');
    if (input.expiresAt <= input.registeredAt || input.expiresAt.getTime() - input.registeredAt.getTime() > 90 * dayMs) {
      throw new ConnectorLifecycleValidationError('Connector registration expiry is invalid.');
    }
    const connectorProfile = profileFor(input.kind);
    const scope = validateAndNormalizeScope(input.scope, connectorProfile);
    if (
      !Number.isSafeInteger(input.retentionDays) || input.retentionDays < 1 ||
      input.retentionDays > connectorProfile.maximumRetentionDays
    ) {
      throw new ConnectorLifecycleValidationError('Connector retention exceeds the profile limit.');
    }
    if (input.credentialReferenceSha256 !== undefined) validateSha256(input.credentialReferenceSha256, 'Credential reference');
    if (connectorProfile.credentialReferenceRequired && !input.credentialReferenceSha256) {
      throw new ConnectorLifecycleValidationError('A hash-only credential reference is required for this connector profile.');
    }
    return {
      connectorId: input.connectorId,
      tenantId: this.identity.tenantId,
      ownerUserId: input.actorId,
      kind: input.kind,
      status: 'registered_disabled',
      version: 1,
      scope,
      scopeSha256: scopeHash(input.kind, scope),
      retentionDays: input.retentionDays,
      expiresAt: input.expiresAt,
      ...(input.credentialReferenceSha256 ? { credentialReferenceSha256: input.credentialReferenceSha256 } : {}),
      credentialState: input.credentialReferenceSha256 ? 'reference_bound' : 'not_provisioned',
      deletionState: 'not_required',
      providerGrantState: 'not_requested',
      rawCredentialRetained: false,
      externalNetworkCallsPermitted: false,
      outboundExecutionPermitted: false,
      registeredAt: input.registeredAt,
      lastTransitionAt: input.registeredAt,
    };
  }

  public authorize(
    registration: ConnectorRegistration,
    request: ConnectorAuthorizationRequest,
    evaluatedAt: Date,
  ): ConnectorAuthorizationDecision {
    validateDate(evaluatedAt, 'Connector authorization time');
    validateAuthorizationRequest(request);
    const connectorProfile = profileFor(registration.kind);
    const findings = new Set<ConnectorLifecycleFindingCode>([
      'connector_runtime_disabled',
      'connector_not_active',
    ]);
    if (registration.tenantId !== this.identity.tenantId || request.tenantId !== this.identity.tenantId) {
      findings.add('cross_tenant_connector');
    }
    if (registration.ownerUserId !== this.identity.ownerUserId || request.actorId !== this.identity.ownerUserId) {
      findings.add('connector_owner_mismatch');
    }
    if (evaluatedAt >= registration.expiresAt) findings.add('connector_expired');
    if (!registration.scope.purposes.includes(request.purpose)) findings.add('purpose_out_of_scope');
    if (!registration.scope.operations.includes(request.operation)) findings.add('operation_out_of_scope');
    if (!registration.scope.dataClasses.includes(request.dataClass)) findings.add('data_class_out_of_scope');
    if (!registration.scope.channels.includes(request.channel)) findings.add('channel_out_of_scope');
    if (!registration.scope.resourceTypes.includes(request.resourceType)) findings.add('resource_type_out_of_scope');
    if (request.includesThirdPartyData && registration.scope.thirdPartyData === 'forbidden') {
      findings.add('third_party_data_forbidden');
    }
    if (request.recentOperationCount >= connectorProfile.maximumOperationsPerHour) {
      findings.add('rate_limit_exceeded');
    }
    if ((request.operation === 'share' || request.operation === 'export') && !request.humanApprovalPresent) {
      findings.add('human_approval_required');
    }
    if (connectorProfile.credentialReferenceRequired && registration.credentialState !== 'reference_bound') {
      findings.add('credential_reference_required');
    }
    return {
      policyVersion: connectorLifecyclePolicyVersion,
      allowed: false,
      externalActionPermitted: false,
      findingCodes: connectorLifecycleFindingCodes.filter((code) => findings.has(code)),
      evaluatedScopeSha256: registration.scopeSha256,
      runtimeEnabled: false,
    };
  }

  public revoke(
    registration: ConnectorRegistration,
    input: Readonly<{
      actorId: UserId;
      requestId: string;
      expectedVersion: number;
      reason: string;
      revokedAt: Date;
    }>,
  ): Readonly<{ outcome: 'applied' | 'already_applied'; registration: ConnectorRegistration }> {
    this.assertRegistrationOwner(registration, input.actorId);
    validateRequestId(input.requestId);
    validateText(input.reason, 20, 1_000, 'Connector revocation reason');
    validateDate(input.revokedAt, 'Connector revocation time');
    if (input.revokedAt < registration.lastTransitionAt) {
      throw new ConnectorLifecycleValidationError('Connector revocation precedes the current state.');
    }
    if (registration.status === 'revoked' || registration.status === 'revocation_verified') {
      const revocation = registration.revocation;
      if (revocation?.requestId === input.requestId && revocation.reason === input.reason.trim()) {
        return { outcome: 'already_applied', registration };
      }
      throw new ConnectorLifecycleConflictError('already_terminal');
    }
    assertVersion(registration, input.expectedVersion);
    const credentialDestructionRequired = registration.credentialState === 'reference_bound' ||
      registration.credentialState === 'rotation_required';
    const providerGrantRevocationRequired = registration.providerGrantState !== 'not_requested';
    return {
      outcome: 'applied',
      registration: {
        ...registration,
        status: 'revoked',
        version: registration.version + 1,
        credentialState: credentialDestructionRequired ? 'destruction_required' : 'not_provisioned',
        deletionState: 'required',
        providerGrantState: providerGrantRevocationRequired ? 'revoke_required' : 'not_requested',
        outboundExecutionPermitted: false,
        externalNetworkCallsPermitted: false,
        lastTransitionAt: input.revokedAt,
        revocation: {
          requestId: input.requestId,
          reason: input.reason.trim(),
          revokedAt: input.revokedAt,
          inFlightCancellationRequired: true,
          providerGrantRevocationRequired,
          credentialDestructionRequired,
          cachePurgeRequired: true,
          derivedDataDeletionRequired: true,
        },
      },
    };
  }

  public verifyRevocation(
    registration: ConnectorRegistration,
    input: Readonly<{
      actorId: UserId;
      expectedVersion: number;
      inFlightCancelled: boolean;
      providerGrantRevokedOrAbsent: boolean;
      credentialDestroyedOrAbsent: boolean;
      cachesPurged: boolean;
      derivedDataDeleted: boolean;
      deletionReceiptSha256: string;
      humanAttestation: boolean;
      verifiedAt: Date;
    }>,
  ): ConnectorRegistration {
    this.assertRegistrationOwner(registration, input.actorId);
    assertVersion(registration, input.expectedVersion);
    if (registration.status !== 'revoked' || !registration.revocation) {
      throw new ConnectorLifecycleConflictError('already_terminal');
    }
    validateDate(input.verifiedAt, 'Connector revocation verification time');
    if (input.verifiedAt < registration.lastTransitionAt) {
      throw new ConnectorLifecycleValidationError('Connector revocation verification precedes the current state.');
    }
    validateSha256(input.deletionReceiptSha256, 'Deletion receipt');
    const missing = [
      ...(!input.humanAttestation ? ['human_attestation'] : []),
      ...(!input.inFlightCancelled ? ['in_flight_cancellation'] : []),
      ...(!input.providerGrantRevokedOrAbsent ? ['provider_grant_revocation'] : []),
      ...(!input.credentialDestroyedOrAbsent ? ['credential_destruction'] : []),
      ...(!input.cachesPurged ? ['cache_purge'] : []),
      ...(!input.derivedDataDeleted ? ['derived_data_deletion'] : []),
    ];
    if (missing.length > 0) throw new ConnectorRevocationIncompleteError(missing);
    return {
      ...registration,
      status: 'revocation_verified',
      version: registration.version + 1,
      credentialState: registration.revocation.credentialDestructionRequired ? 'destroyed' : 'not_provisioned',
      deletionState: 'verified',
      providerGrantState: registration.revocation.providerGrantRevocationRequired ? 'revoked' : 'not_requested',
      lastTransitionAt: input.verifiedAt,
      revocation: {
        ...registration.revocation,
        verificationReceiptSha256: input.deletionReceiptSha256,
        verifiedAt: input.verifiedAt,
      },
    };
  }

  public containIncident(
    registration: ConnectorRegistration,
    input: Readonly<{
      actorId: UserId;
      expectedVersion: number;
      severity: ConnectorIncidentRecord['severity'];
      reason: string;
      evidenceSha256: string;
      humanAttestation: boolean;
      containedAt: Date;
    }>,
  ): ConnectorRegistration {
    this.assertRegistrationOwner(registration, input.actorId);
    assertVersion(registration, input.expectedVersion);
    if (registration.status === 'revoked' || registration.status === 'revocation_verified') {
      throw new ConnectorLifecycleConflictError('already_terminal');
    }
    if (!['sev1', 'sev2', 'sev3'].includes(input.severity)) {
      throw new ConnectorLifecycleValidationError('Connector incident severity is invalid.');
    }
    if (!input.humanAttestation) throw new ConnectorLifecycleValidationError('Incident containment requires human attestation.');
    validateText(input.reason, 20, 1_000, 'Connector incident reason');
    validateSha256(input.evidenceSha256, 'Incident evidence');
    validateDate(input.containedAt, 'Connector incident containment time');
    if (input.containedAt < registration.lastTransitionAt) {
      throw new ConnectorLifecycleValidationError('Connector incident containment precedes the current state.');
    }
    const credentialRotationRequired = registration.credentialState === 'reference_bound';
    return {
      ...registration,
      status: 'suspended',
      version: registration.version + 1,
      credentialState: credentialRotationRequired ? 'rotation_required' : registration.credentialState,
      deletionState: 'quarantined',
      outboundExecutionPermitted: false,
      externalNetworkCallsPermitted: false,
      lastTransitionAt: input.containedAt,
      incident: {
        severity: input.severity,
        reason: input.reason.trim(),
        evidenceSha256: input.evidenceSha256,
        containedAt: input.containedAt,
        inFlightCancellationRequired: true,
        credentialRotationRequired,
        evidenceRetention: 'hash_only',
      },
    };
  }

  private assertOwner(actorId: UserId): void {
    if (actorId !== this.identity.ownerUserId) {
      throw new ConnectorLifecyclePermissionError('Only the owner can inspect connector governance.');
    }
  }

  private assertRegistrationOwner(registration: ConnectorRegistration, actorId: UserId): void {
    this.assertOwner(actorId);
    if (registration.tenantId !== this.identity.tenantId || registration.ownerUserId !== actorId) {
      throw new ConnectorLifecyclePermissionError('Connector registration context mismatch.');
    }
  }
}

const registrationKeys = [
  'actorId',
  'connectorId',
  'kind',
  'scope',
  'retentionDays',
  'expiresAt',
  'credentialReferenceSha256',
  'humanAttestation',
  'privacyReviewCompleted',
  'revocationPlanConfirmed',
  'registeredAt',
] as const;

const scopeKeys = [
  'purposes',
  'operations',
  'dataClasses',
  'channels',
  'resourceTypes',
  'thirdPartyData',
] as const;

const dayMs = 86_400_000;

function profile(input: Omit<ConnectorProfile, 'runtimeStatus' | 'activationBlockers'>): ConnectorProfile {
  return {
    ...input,
    runtimeStatus: 'disabled',
    activationBlockers: [
      'adapter_not_configured',
      'runtime_globally_disabled',
      'short_lived_approval_token_unavailable',
      'connector_specific_revocation_drill_required',
    ],
  };
}

function profileFor(kind: ConnectorKind): ConnectorProfile {
  const value = profiles.get(kind);
  if (!value) throw new ConnectorLifecycleValidationError('Connector profile is unavailable.');
  return value;
}

function validateAndNormalizeScope(scope: ConnectorScope, connectorProfile: ConnectorProfile): ConnectorScope {
  validateExactKeys(scope, scopeKeys, 'Connector scope');
  const normalized: ConnectorScope = {
    purposes: normalizeSet(scope.purposes, connectorProfile.allowedPurposes, 'Connector purpose'),
    operations: normalizeSet(scope.operations, connectorProfile.allowedOperations, 'Connector operation'),
    dataClasses: normalizeSet(scope.dataClasses, connectorProfile.allowedDataClasses, 'Connector data class'),
    channels: normalizeLabels(scope.channels, connectorProfile.allowedChannels, 'Connector channel'),
    resourceTypes: normalizeLabels(scope.resourceTypes, connectorProfile.allowedResourceTypes, 'Connector resource type'),
    thirdPartyData: scope.thirdPartyData,
  };
  if (scope.thirdPartyData !== connectorProfile.thirdPartyData) {
    throw new ConnectorLifecycleValidationError('Connector third-party scope exceeds the profile.');
  }
  if (normalized.dataClasses.includes('restricted')) {
    throw new ConnectorLifecycleValidationError('Restricted data cannot enter an MVP connector.');
  }
  return normalized;
}

function normalizeSet<Value extends string>(
  values: unknown,
  allowed: readonly Value[],
  label: string,
): readonly Value[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > allowed.length) {
    throw new ConnectorLifecycleValidationError(`${label} scope is invalid.`);
  }
  const candidates: readonly unknown[] = values;
  const normalized: Value[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !allowed.includes(candidate as Value)) {
      throw new ConnectorLifecycleValidationError(`${label} scope exceeds the profile.`);
    }
    normalized.push(candidate as Value);
  }
  const unique = [...new Set<Value>(normalized)];
  if (unique.length !== normalized.length) {
    throw new ConnectorLifecycleValidationError(`${label} scope exceeds the profile.`);
  }
  return [...unique].sort();
}

function normalizeLabels(values: readonly string[], allowed: readonly string[], label: string): readonly string[] {
  for (const value of values) validateLabel(value, label);
  return normalizeSet(values, allowed, label);
}

function validateAuthorizationRequest(request: ConnectorAuthorizationRequest): void {
  validateLabel(request.channel, 'Connector authorization channel');
  validateLabel(request.resourceType, 'Connector authorization resource type');
  if (!Number.isSafeInteger(request.recentOperationCount) || request.recentOperationCount < 0) {
    throw new ConnectorLifecycleValidationError('Connector operation count is invalid.');
  }
}

function assertVersion(registration: ConnectorRegistration, expectedVersion: number): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== registration.version) {
    throw new ConnectorLifecycleConflictError('version_changed');
  }
}

function scopeHash(kind: ConnectorKind, scope: ConnectorScope): string {
  return sha256(JSON.stringify({ policyVersion: connectorLifecyclePolicyVersion, kind, scope }));
}

function validateExactKeys(
  value: unknown,
  allowedKeys: readonly string[],
  label: string,
): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConnectorLifecycleValidationError(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ConnectorLifecycleValidationError(`${label} must be a plain object.`);
  }
  const unknown = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) throw new ConnectorLifecycleValidationError(`${label} contains unsupported fields.`);
}

function validateConnectorId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new ConnectorLifecycleValidationError('Connector id is invalid.');
  }
}

function validateRequestId(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(value)) {
    throw new ConnectorLifecycleValidationError('Connector request id is invalid.');
  }
}

function validateLabel(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/u.test(value)) {
    throw new ConnectorLifecycleValidationError(`${label} is invalid.`);
  }
}

function validateText(value: string, min: number, max: number, label: string): void {
  const length = value.trim().length;
  if (length < min || length > max) throw new ConnectorLifecycleValidationError(`${label} is invalid.`);
}

function validateSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new ConnectorLifecycleValidationError(`${label} hash is invalid.`);
}

function validateDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ConnectorLifecycleValidationError(`${label} is invalid.`);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
