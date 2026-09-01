import { describe, expect, it } from 'vitest';
import {
  ConnectorLifecycleConflictError,
  ConnectorLifecyclePermissionError,
  ConnectorLifecycleService,
  ConnectorLifecycleValidationError,
  ConnectorRevocationIncompleteError,
  type ConnectorRegistrationInput,
} from '../src/connectors/lifecycle.js';
import { tenantId, userId } from '../src/kernel/identity.js';

const tenant = tenantId('tenant_connector_lifecycle');
const otherTenant = tenantId('tenant_connector_other');
const owner = userId('owner_connector_lifecycle');
const outsider = userId('outsider_connector_lifecycle');
const now = new Date('2026-09-01T17:00:00.000Z');
const credentialReference = 'a'.repeat(64);
const deletionReceipt = 'd'.repeat(64);
const incidentEvidence = 'e'.repeat(64);

function service(): ConnectorLifecycleService {
  return new ConnectorLifecycleService({ tenantId: tenant, ownerUserId: owner });
}

function researchInput(overrides: Partial<ConnectorRegistrationInput> = {}): ConnectorRegistrationInput {
  return {
    actorId: owner,
    connectorId: 'connector_research_eval',
    kind: 'research_web',
    scope: {
      purposes: ['external_research'],
      operations: ['read', 'process'],
      dataClasses: ['public'],
      channels: ['web'],
      resourceTypes: ['research_source'],
      thirdPartyData: 'forbidden',
    },
    retentionDays: 14,
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    humanAttestation: true,
    privacyReviewCompleted: true,
    revocationPlanConfirmed: true,
    registeredAt: now,
    ...overrides,
  };
}

function publishingInput(overrides: Partial<ConnectorRegistrationInput> = {}): ConnectorRegistrationInput {
  return {
    actorId: owner,
    connectorId: 'connector_publishing_eval',
    kind: 'publishing',
    scope: {
      purposes: ['public_drafting'],
      operations: ['export', 'share'],
      dataClasses: ['public'],
      channels: ['linkedin'],
      resourceTypes: ['approved_draft'],
      thirdPartyData: 'forbidden',
    },
    retentionDays: 1,
    expiresAt: new Date(now.getTime() + 86_400_000),
    credentialReferenceSha256: credentialReference,
    humanAttestation: true,
    privacyReviewCompleted: true,
    revocationPlanConfirmed: true,
    registeredAt: now,
    ...overrides,
  };
}

describe('connector lifecycle policy', () => {
  it('publishes six disabled profiles and no activation authority', () => {
    expect(service().snapshot(owner, now)).toMatchObject({
      policyVersion: 'connector-lifecycle-v1',
      runtimeEnabled: false,
      externalNetworkCallsPermitted: false,
      automaticExecutionAllowed: false,
      rawCredentialAccepted: false,
      shortLivedApprovalTokensEnabled: false,
      activationEligibleConnectors: 0,
      activeConnectors: 0,
      summary: {
        supportedProfiles: 6,
        yellowProfiles: 1,
        redProfiles: 5,
        profilesRequiringCredentialReference: 5,
      },
      revocation: {
        cancelInFlightRequired: true,
        providerGrantRevocationRequired: true,
        credentialDestructionRequiredWhenBound: true,
        cachePurgeRequired: true,
        derivedDataDeletionRequired: true,
        verificationReceiptRequired: true,
      },
    });
    expect(() => service().snapshot(outsider, now)).toThrow(ConnectorLifecyclePermissionError);
  });

  it('registers metadata only and keeps both network and execution disabled', () => {
    expect(service().register(researchInput())).toMatchObject({
      status: 'registered_disabled',
      version: 1,
      credentialState: 'not_provisioned',
      deletionState: 'not_required',
      rawCredentialRetained: false,
      externalNetworkCallsPermitted: false,
      outboundExecutionPermitted: false,
    });
    expect(service().register(publishingInput())).toMatchObject({
      status: 'registered_disabled',
      credentialReferenceSha256: credentialReference,
      credentialState: 'reference_bound',
      rawCredentialRetained: false,
    });
  });

  it('rejects raw secret fields, missing review, excessive retention, and broad scope', () => {
    const unsafe = { ...publishingInput(), accessToken: 'synthetic-secret-must-not-be-stored' };
    expect(() => service().register(unsafe as ConnectorRegistrationInput)).toThrow(
      ConnectorLifecycleValidationError,
    );
    expect(() => service().register(researchInput({ privacyReviewCompleted: false }))).toThrow(
      ConnectorLifecycleValidationError,
    );
    expect(() => service().register(researchInput({ retentionDays: 31 }))).toThrow(
      ConnectorLifecycleValidationError,
    );
    expect(() => service().register(researchInput({
      scope: { ...researchInput().scope, dataClasses: ['restricted'] },
    }))).toThrow(ConnectorLifecycleValidationError);
    const { credentialReferenceSha256, ...withoutCredential } = publishingInput();
    expect(credentialReferenceSha256).toBeDefined();
    expect(() => service().register(withoutCredential)).toThrow(ConnectorLifecycleValidationError);
    expect(() => service().register({ ...researchInput(), scope: null } as unknown as ConnectorRegistrationInput))
      .toThrow(ConnectorLifecycleValidationError);
  });

  it('denies every authorization while reporting scope, approval, and rate-limit violations', () => {
    const registration = service().register(publishingInput());
    const decision = service().authorize(registration, {
      tenantId: tenant,
      actorId: owner,
      purpose: 'external_research',
      operation: 'share',
      dataClass: 'confidential',
      channel: 'email',
      resourceType: 'message_metadata',
      includesThirdPartyData: true,
      recentOperationCount: 2,
      humanApprovalPresent: false,
    }, now);
    expect(decision).toMatchObject({
      allowed: false,
      externalActionPermitted: false,
      runtimeEnabled: false,
    });
    expect(decision.findingCodes).toEqual(expect.arrayContaining([
      'connector_runtime_disabled',
      'connector_not_active',
      'purpose_out_of_scope',
      'data_class_out_of_scope',
      'channel_out_of_scope',
      'resource_type_out_of_scope',
      'third_party_data_forbidden',
      'rate_limit_exceeded',
      'human_approval_required',
    ]));
  });

  it('denies cross-tenant and non-owner authorization without expanding scope', () => {
    const registration = service().register(researchInput());
    const decision = service().authorize(registration, {
      tenantId: otherTenant,
      actorId: outsider,
      purpose: 'external_research',
      operation: 'read',
      dataClass: 'public',
      channel: 'web',
      resourceType: 'research_source',
      includesThirdPartyData: false,
      recentOperationCount: 0,
      humanApprovalPresent: true,
    }, now);
    expect(decision.findingCodes).toEqual(expect.arrayContaining([
      'cross_tenant_connector',
      'connector_owner_mismatch',
    ]));
    expect(decision.externalActionPermitted).toBe(false);
  });

  it('revokes idempotently and creates a mandatory cleanup plan', () => {
    const registration = service().register(publishingInput());
    const command = {
      actorId: owner,
      requestId: 'revoke_connector_one',
      expectedVersion: 1,
      reason: 'مالک اتصال را لغو کرده و حذف تمام مشتقات را درخواست کرده است.',
      revokedAt: new Date(now.getTime() + 1_000),
    } as const;
    const result = service().revoke(registration, command);
    expect(result).toMatchObject({
      outcome: 'applied',
      registration: {
        status: 'revoked',
        version: 2,
        credentialState: 'destruction_required',
        deletionState: 'required',
        outboundExecutionPermitted: false,
        revocation: {
          inFlightCancellationRequired: true,
          credentialDestructionRequired: true,
          cachePurgeRequired: true,
          derivedDataDeletionRequired: true,
        },
      },
    });
    expect(service().revoke(result.registration, command)).toMatchObject({ outcome: 'already_applied' });
  });

  it('rejects stale revocation versions and incomplete deletion propagation', () => {
    const registration = service().register(publishingInput());
    expect(() => service().revoke(registration, {
      actorId: owner,
      requestId: 'revoke_stale_connector',
      expectedVersion: 2,
      reason: 'نسخه مورد انتظار قدیمی است و نباید وضعیت جدید را بازنویسی کند.',
      revokedAt: new Date(now.getTime() + 1_000),
    })).toThrow(ConnectorLifecycleConflictError);
    const revoked = service().revoke(registration, {
      actorId: owner,
      requestId: 'revoke_incomplete_connector',
      expectedVersion: 1,
      reason: 'این اتصال برای آزمون حذف کامل مشتقات لغو می‌شود.',
      revokedAt: new Date(now.getTime() + 1_000),
    }).registration;
    expect(() => service().verifyRevocation(revoked, {
      actorId: owner,
      expectedVersion: 2,
      inFlightCancelled: true,
      providerGrantRevokedOrAbsent: true,
      credentialDestroyedOrAbsent: false,
      cachesPurged: true,
      derivedDataDeleted: false,
      deletionReceiptSha256: deletionReceipt,
      humanAttestation: true,
      verifiedAt: new Date(now.getTime() + 2_000),
    })).toThrow(ConnectorRevocationIncompleteError);
  });

  it('verifies revocation only after every propagation boundary is attested', () => {
    const revoked = service().revoke(service().register(publishingInput()), {
      actorId: owner,
      requestId: 'revoke_verified_connector',
      expectedVersion: 1,
      reason: 'تمام دسترسی‌ها و مشتقات این اتصال باید حذف و رسید آن ثبت شود.',
      revokedAt: new Date(now.getTime() + 1_000),
    }).registration;
    expect(service().verifyRevocation(revoked, {
      actorId: owner,
      expectedVersion: 2,
      inFlightCancelled: true,
      providerGrantRevokedOrAbsent: true,
      credentialDestroyedOrAbsent: true,
      cachesPurged: true,
      derivedDataDeleted: true,
      deletionReceiptSha256: deletionReceipt,
      humanAttestation: true,
      verifiedAt: new Date(now.getTime() + 2_000),
    })).toMatchObject({
      status: 'revocation_verified',
      version: 3,
      credentialState: 'destroyed',
      deletionState: 'verified',
      outboundExecutionPermitted: false,
      revocation: { verificationReceiptSha256: deletionReceipt },
    });
  });

  it('contains incidents with hash-only evidence and immediate execution hold', () => {
    const contained = service().containIncident(service().register(publishingInput()), {
      actorId: owner,
      expectedVersion: 1,
      severity: 'sev1',
      reason: 'نشانه احتمال افشای Credential دیده شد و اتصال باید فوراً متوقف شود.',
      evidenceSha256: incidentEvidence,
      humanAttestation: true,
      containedAt: new Date(now.getTime() + 1_000),
    });
    expect(contained).toMatchObject({
      status: 'suspended',
      version: 2,
      credentialState: 'rotation_required',
      deletionState: 'quarantined',
      externalNetworkCallsPermitted: false,
      outboundExecutionPermitted: false,
      incident: {
        severity: 'sev1',
        evidenceSha256: incidentEvidence,
        evidenceRetention: 'hash_only',
        inFlightCancellationRequired: true,
        credentialRotationRequired: true,
      },
    });
    expect(JSON.stringify(contained)).not.toContain('synthetic-secret');
  });
});
