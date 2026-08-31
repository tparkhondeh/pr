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
});

