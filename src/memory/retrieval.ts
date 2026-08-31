import type { TenantId, UserId } from '../kernel/identity.js';
import {
  decidePolicy,
  type DataClass,
  type PermissionGrant,
  type Purpose,
} from '../kernel/policy.js';
import {
  isAssertionUsable,
  type Assertion,
} from './personal-memory.js';

export type RetrievalRequest = Readonly<{
  tenantId: TenantId;
  actorId: UserId;
  purpose: Purpose;
  dataClass: DataClass;
  at: Date;
  subjectRef?: string;
  predicate?: string;
  limit: number;
}>;

export type RetrievalResult =
  | Readonly<{
      allowed: false;
      reason: 'no_matching_grant' | 'expired' | 'revoked';
      assertions: readonly [];
    }>
  | Readonly<{
      allowed: true;
      reason: 'matching_grant';
      assertions: readonly Assertion[];
    }>;

export function retrieveAssertions(
  request: RetrievalRequest,
  grants: readonly PermissionGrant[],
  assertions: readonly Assertion[],
): RetrievalResult {
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100) {
    throw new Error('Retrieval limit must be between 1 and 100.');
  }

  const decision = decidePolicy(
    {
      tenantId: request.tenantId,
      actorId: request.actorId,
      purpose: request.purpose,
      operation: 'read',
      dataClass: request.dataClass,
    },
    grants,
    request.at,
  );
  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason, assertions: [] };
  }

  const selected = assertions
    .filter(
      (assertion) =>
        assertion.tenantId === request.tenantId &&
        assertion.dataClass === request.dataClass &&
        isAssertionUsable(assertion, request.at) &&
        (!request.subjectRef || assertion.subjectRef === request.subjectRef) &&
        (!request.predicate || assertion.predicate === request.predicate),
    )
    .sort(compareAssertions)
    .slice(0, request.limit);

  return { allowed: true, reason: decision.reason, assertions: selected };
}

function compareAssertions(left: Assertion, right: Assertion): number {
  const confidenceDifference = (right.confidence ?? -1) - (left.confidence ?? -1);
  if (confidenceDifference !== 0) return confidenceDifference;
  return right.createdAt.getTime() - left.createdAt.getTime();
}

