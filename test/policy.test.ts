import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import { decidePolicy, type PermissionGrant } from '../src/kernel/policy.js';

const tenant = tenantId('tenant_one');
const actor = userId('user_one');
const baseGrant: PermissionGrant = {
  tenantId: tenant,
  actorId: actor,
  purpose: 'personal_understanding',
  operation: 'read',
  dataClass: 'confidential',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('decidePolicy', () => {
  it('denies by default', () => {
    expect(
      decidePolicy(baseGrant, [], new Date('2026-01-02T00:00:00Z')),
    ).toEqual({ allowed: false, reason: 'no_matching_grant' });
  });

  it('does not allow a grant from another tenant', () => {
    const request = { ...baseGrant, tenantId: tenantId('tenant_two') };
    expect(
      decidePolicy(request, [baseGrant], new Date('2026-01-02T00:00:00Z')),
    ).toEqual({ allowed: false, reason: 'no_matching_grant' });
  });

  it('rejects revoked grants', () => {
    const grant = { ...baseGrant, revokedAt: new Date('2026-01-02T00:00:00Z') };
    expect(
      decidePolicy(baseGrant, [grant], new Date('2026-01-03T00:00:00Z')),
    ).toEqual({ allowed: false, reason: 'revoked' });
  });

  it('uses a renewed active grant even when an older matching grant expired', () => {
    const expired = { ...baseGrant, expiresAt: new Date('2026-01-02T00:00:00Z') };
    const renewed = { ...baseGrant, grantedAt: new Date('2026-01-03T00:00:00Z') };
    expect(
      decidePolicy(baseGrant, [expired, renewed], new Date('2026-01-04T00:00:00Z')),
    ).toEqual({ allowed: true, reason: 'matching_grant' });
  });

  it('does not activate a matching grant before its grant time', () => {
    const future = { ...baseGrant, grantedAt: new Date('2026-01-03T00:00:00Z') };
    expect(
      decidePolicy(baseGrant, [future], new Date('2026-01-02T00:00:00Z')),
    ).toEqual({ allowed: false, reason: 'no_matching_grant' });
  });
});
