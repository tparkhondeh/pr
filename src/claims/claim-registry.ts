import type { TenantId, UserId } from '../kernel/identity.js';
import type { DataClass, Purpose } from '../kernel/policy.js';
import type { EvidenceId } from '../memory/personal-memory.js';

export type ClaimKind = 'personal_fact' | 'external_fact' | 'opinion' | 'projection';
export type ClaimStatus = 'proposed' | 'verified' | 'disputed' | 'expired' | 'revoked';

export type Claim = Readonly<{
  id: string;
  tenantId: TenantId;
  statement: string;
  kind: ClaimKind;
  status: ClaimStatus;
  dataClass: DataClass;
  evidenceIds: readonly EvidenceId[];
  sourceRefs: readonly string[];
  allowedPurposes: readonly Purpose[];
  allowedChannels: readonly string[];
  validFrom: Date;
  validUntil?: Date | undefined;
  createdAt: Date;
  createdBy: UserId;
  verifiedAt?: Date | undefined;
  verifiedBy?: UserId | undefined;
  disputedAt?: Date | undefined;
  disputeReason?: string | undefined;
  revokedAt?: Date | undefined;
  revocationReason?: string | undefined;
}>;

export type NewClaim = Omit<
  Claim,
  | 'status'
  | 'verifiedAt'
  | 'verifiedBy'
  | 'disputedAt'
  | 'disputeReason'
  | 'revokedAt'
  | 'revocationReason'
>;

export function proposeClaim(input: NewClaim): Claim {
  if (input.statement.trim().length < 3) throw new Error('Claim statement is required.');
  if (input.validUntil && input.validUntil <= input.validFrom) {
    throw new Error('Claim validity interval is invalid.');
  }
  if (new Set(input.evidenceIds).size !== input.evidenceIds.length) {
    throw new Error('Claim has duplicate evidence.');
  }
  if (input.kind === 'external_fact' && input.sourceRefs.length === 0) {
    throw new Error('External fact requires a source reference.');
  }
  return { ...input, status: 'proposed' };
}

export function verifyClaim(claim: Claim, verifiedBy: UserId, verifiedAt: Date): Claim {
  if (claim.status !== 'proposed') throw new Error('Only proposed claims can be verified.');
  if (
    (claim.kind === 'personal_fact' || claim.kind === 'external_fact') &&
    claim.evidenceIds.length === 0
  ) {
    throw new Error('A factual claim cannot be verified without evidence.');
  }
  if (verifiedAt < claim.createdAt) throw new Error('Verification cannot predate claim.');
  return { ...claim, status: 'verified', verifiedBy, verifiedAt };
}

export function disputeClaim(claim: Claim, reason: string, disputedAt: Date): Claim {
  if (claim.status === 'revoked') throw new Error('Revoked claim cannot be disputed.');
  if (reason.trim().length < 3) throw new Error('Dispute reason is required.');
  return { ...claim, status: 'disputed', disputedAt, disputeReason: reason.trim() };
}

export function revokeClaim(claim: Claim, reason: string, revokedAt: Date): Claim {
  if (reason.trim().length < 3) throw new Error('Revocation reason is required.');
  return { ...claim, status: 'revoked', revokedAt, revocationReason: reason.trim() };
}

export function effectiveClaimStatus(claim: Claim, at: Date): ClaimStatus {
  if (claim.status === 'revoked' || claim.status === 'disputed') return claim.status;
  if (claim.validUntil && claim.validUntil <= at) return 'expired';
  return claim.status;
}
