import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import type { PermissionGrant } from '../src/kernel/policy.js';
import {
  assertionId,
  createAssertion,
  evidenceId,
} from '../src/memory/personal-memory.js';
import { retrieveAssertions } from '../src/memory/retrieval.js';

const tenant = tenantId('tenant_one');
const actor = userId('user_one');
const now = new Date('2026-08-31T00:00:00Z');

const grant: PermissionGrant = {
  tenantId: tenant,
  actorId: actor,
  purpose: 'strategy_reasoning',
  operation: 'read',
  dataClass: 'confidential',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
};

const assertion = createAssertion({
  id: assertionId('assertion_one'),
  tenantId: tenant,
  subjectRef: 'person:user_one',
  predicate: 'values.curiosity',
  value: true,
  epistemicType: 'hypothesis',
  dataClass: 'confidential',
  confidence: 0.8,
  confidenceRationale: 'Repeated evidence across independent situations.',
  evidence: [{ evidenceId: evidenceId('evidence_one'), relation: 'supports' }],
  createdAt: new Date('2026-08-01T00:00:00Z'),
  createdBy: actor,
});

describe('permission-bound memory retrieval', () => {
  it('denies before retrieval when no purpose grant exists', () => {
    const result = retrieveAssertions(
      {
        tenantId: tenant,
        actorId: actor,
        purpose: 'strategy_reasoning',
        dataClass: 'confidential',
        at: now,
        limit: 10,
      },
      [],
      [assertion],
    );
    expect(result).toEqual({
      allowed: false,
      reason: 'no_matching_grant',
      assertions: [],
    });
  });

  it('never leaks assertions from another tenant', () => {
    const otherAssertion = createAssertion({
      ...assertion,
      id: assertionId('assertion_two'),
      tenantId: tenantId('tenant_two'),
    });
    const result = retrieveAssertions(
      {
        tenantId: tenant,
        actorId: actor,
        purpose: 'strategy_reasoning',
        dataClass: 'confidential',
        at: now,
        limit: 10,
      },
      [grant],
      [otherAssertion, assertion],
    );
    expect(result.allowed).toBe(true);
    expect(result.assertions.map((item) => item.id)).toEqual([assertion.id]);
  });

  it('does not return a contested assertion', () => {
    const result = retrieveAssertions(
      {
        tenantId: tenant,
        actorId: actor,
        purpose: 'strategy_reasoning',
        dataClass: 'confidential',
        at: now,
        limit: 10,
      },
      [grant],
      [{ ...assertion, contestedAt: now, contestReason: 'Incorrect.' }],
    );
    expect(result.assertions).toEqual([]);
  });

  it('keeps restricted data out of a confidential retrieval', () => {
    const result = retrieveAssertions(
      {
        tenantId: tenant,
        actorId: actor,
        purpose: 'strategy_reasoning',
        dataClass: 'confidential',
        at: now,
        limit: 10,
      },
      [grant],
      [{ ...assertion, dataClass: 'restricted' }],
    );
    expect(result.assertions).toEqual([]);
  });
});

