import type { TenantId, UserId } from './identity.js';

export const purposes = [
  'personal_understanding',
  'strategy_reasoning',
  'brand_usage',
  'public_drafting',
  'external_research',
  'external_sharing',
  'relationship_planning',
  'perception_analysis',
] as const;

export type Purpose = (typeof purposes)[number];
export type Operation = 'read' | 'process' | 'derive' | 'export' | 'share';
export type DataClass = 'public' | 'internal' | 'confidential' | 'restricted';

export type PolicyRequest = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  purpose: Purpose;
  operation: Operation;
  dataClass: DataClass;
}>;

export type PermissionGrant = PolicyRequest &
  Readonly<{
    grantedAt: Date;
    expiresAt?: Date;
    revokedAt?: Date;
  }>;

export type PolicyDecision =
  | Readonly<{ allowed: true; reason: 'matching_grant' }>
  | Readonly<{
      allowed: false;
      reason: 'no_matching_grant' | 'expired' | 'revoked';
    }>;

export function decidePolicy(
  request: PolicyRequest,
  grants: readonly PermissionGrant[],
  now: Date,
): PolicyDecision {
  const matching = grants.find(
    (grant) =>
      grant.tenantId === request.tenantId &&
      grant.actorId === request.actorId &&
      grant.purpose === request.purpose &&
      grant.operation === request.operation &&
      grant.dataClass === request.dataClass,
  );

  if (!matching) return { allowed: false, reason: 'no_matching_grant' };
  if (matching.revokedAt && matching.revokedAt <= now) {
    return { allowed: false, reason: 'revoked' };
  }
  if (matching.expiresAt && matching.expiresAt <= now) {
    return { allowed: false, reason: 'expired' };
  }
  return { allowed: true, reason: 'matching_grant' };
}
