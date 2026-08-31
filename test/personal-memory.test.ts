import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  assertionId,
  contestAssertion,
  createAssertion,
  evidenceId,
  isAssertionUsable,
  supersedeAssertion,
} from '../src/memory/personal-memory.js';

const tenant = tenantId('tenant_one');
const author = userId('user_one');

function assertion(overrides: Partial<Parameters<typeof createAssertion>[0]> = {}) {
  return createAssertion({
    id: assertionId('assertion_one'),
    tenantId: tenant,
    subjectRef: 'person:user_one',
    predicate: 'values.curiosity',
    value: true,
    epistemicType: 'hypothesis',
    dataClass: 'confidential',
    confidence: 0.7,
    confidenceRationale: 'Supported by repeated behavioral examples.',
    evidence: [
      { evidenceId: evidenceId('evidence_one'), relation: 'supports' },
    ],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: author,
    ...overrides,
  });
}

describe('personal memory assertion lifecycle', () => {
  it('requires evidence for a non-uncertainty assertion', () => {
    expect(() => assertion({ evidence: [] })).toThrow('reference evidence');
  });

  it('requires rationale when confidence is present', () => {
    expect(() => assertion({ confidenceRationale: undefined })).toThrow(
      'Confidence requires a rationale',
    );
  });

  it('makes a contested assertion unusable from the contest time', () => {
    const contested = contestAssertion(
      assertion(),
      'کاربر این برداشت را نادرست می‌داند.',
      new Date('2026-02-01T00:00:00Z'),
    );
    expect(isAssertionUsable(contested, new Date('2026-01-15T00:00:00Z'))).toBe(
      true,
    );
    expect(isAssertionUsable(contested, new Date('2026-02-01T00:00:00Z'))).toBe(
      false,
    );
  });

  it('never uses a soft-deleted assertion after deletion', () => {
    const deleted = assertion({ id: assertionId('assertion_deleted') });
    const deletedAt = new Date('2026-02-01T00:00:00Z');
    expect(isAssertionUsable(deleted, new Date('2026-01-15T00:00:00Z'))).toBe(true);
    expect(isAssertionUsable(
      { ...deleted, deletedAt, deletionReason: 'User requested deletion.' },
      deletedAt,
    )).toBe(false);
  });

  it('preserves history when an assertion is superseded', () => {
    const previous = assertion();
    const replacement = assertion({
      id: assertionId('assertion_two'),
      value: false,
      validFrom: new Date('2026-03-01T00:00:00Z'),
      createdAt: new Date('2026-03-01T00:00:00Z'),
    });
    const superseded = supersedeAssertion(previous, replacement);
    expect(superseded.supersededById).toBe(replacement.id);
    expect(superseded.validTo).toEqual(new Date('2026-03-01T00:00:00Z'));
    expect(isAssertionUsable(superseded, new Date('2026-03-02T00:00:00Z'))).toBe(
      false,
    );
  });

  it('prevents cross-tenant superseding', () => {
    const replacement = assertion({
      id: assertionId('assertion_two'),
      tenantId: tenantId('tenant_two'),
      createdAt: new Date('2026-03-01T00:00:00Z'),
    });
    expect(() => supersedeAssertion(assertion(), replacement)).toThrow(
      'different tenants',
    );
  });
});
