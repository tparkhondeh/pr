import type { TenantId } from '../kernel/identity.js';
import type { Purpose } from '../kernel/policy.js';
import { effectiveClaimStatus, type Claim } from './claim-registry.js';

export type DraftClaimReference = Readonly<{
  claimId: string;
  excerpt: string;
}>;

export type DraftArtifact = Readonly<{
  id: string;
  tenantId: TenantId;
  channel: string;
  purpose: Purpose;
  body: string;
  claimExtractionComplete: boolean;
  claims: readonly DraftClaimReference[];
}>;

export type GuardViolation = Readonly<{
  code:
    | 'missing_claim'
    | 'cross_tenant_claim'
    | 'unverified_fact'
    | 'disputed_claim'
    | 'expired_claim'
    | 'revoked_claim'
    | 'purpose_not_allowed'
    | 'channel_not_allowed'
    | 'claim_extraction_incomplete'
    | 'projection_disclosure_required';
  severity: 'yellow' | 'red';
  claimId: string;
  message: string;
}>;

export type DraftGuardResult = Readonly<{
  classification: 'green' | 'yellow' | 'red';
  mayRequestApproval: boolean;
  violations: readonly GuardViolation[];
}>;

export function guardDraft(
  draft: DraftArtifact,
  registry: readonly Claim[],
  at: Date,
): DraftGuardResult {
  const byId = new Map(registry.map((claim) => [claim.id, claim]));
  const violations: GuardViolation[] = [];

  if (!draft.claimExtractionComplete) {
    violations.push(
      red(
        'claim_extraction_incomplete',
        'draft',
        'Claim extraction must complete before approval.',
      ),
    );
  }

  for (const reference of draft.claims) {
    const claim = byId.get(reference.claimId);
    if (!claim) {
      violations.push(red('missing_claim', reference.claimId, 'Claim is not registered.'));
      continue;
    }
    if (claim.tenantId !== draft.tenantId) {
      violations.push(red('cross_tenant_claim', claim.id, 'Claim belongs to another tenant.'));
      continue;
    }
    const status = effectiveClaimStatus(claim, at);
    if (status === 'disputed') {
      violations.push(red('disputed_claim', claim.id, 'Claim is disputed.'));
    } else if (status === 'expired') {
      violations.push(red('expired_claim', claim.id, 'Claim is expired.'));
    } else if (status === 'revoked') {
      violations.push(red('revoked_claim', claim.id, 'Claim is revoked.'));
    } else if (
      (claim.kind === 'personal_fact' || claim.kind === 'external_fact') &&
      status !== 'verified'
    ) {
      violations.push(red('unverified_fact', claim.id, 'Factual claim is not verified.'));
    }
    if (!claim.allowedPurposes.includes(draft.purpose)) {
      violations.push(red('purpose_not_allowed', claim.id, 'Claim use is not allowed for this purpose.'));
    }
    if (!claim.allowedChannels.includes(draft.channel)) {
      violations.push(red('channel_not_allowed', claim.id, 'Claim use is not allowed on this channel.'));
    }
    if (
      claim.kind === 'projection' &&
      !reference.excerpt.includes('پیش‌بینی') &&
      !reference.excerpt.toLowerCase().includes('projection')
    ) {
      violations.push({
        code: 'projection_disclosure_required',
        severity: 'yellow',
        claimId: claim.id,
        message: 'Projection must be explicitly disclosed.',
      });
    }
  }

  const classification = violations.some((item) => item.severity === 'red')
    ? 'red'
    : violations.length > 0
      ? 'yellow'
      : 'green';
  return {
    classification,
    mayRequestApproval: classification !== 'red',
    violations,
  };
}

function red(code: GuardViolation['code'], claimId: string, message: string): GuardViolation {
  return { code, severity: 'red', claimId, message };
}
