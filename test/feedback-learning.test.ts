import { describe, expect, it } from 'vitest';
import {
  decidePreference,
  proposePreference,
  revokePreference,
  type FeedbackEvent,
} from '../src/feedback/learning.js';
import { tenantId, userId } from '../src/kernel/identity.js';

const tenant = tenantId('tenant_one');
const user = userId('user_one');

function edit(id: string, value: unknown): FeedbackEvent {
  return {
    id,
    tenantId: tenant,
    userId: user,
    artifactType: 'draft',
    artifactId: `draft_${id}`,
    eventType: 'edited',
    signalKey: 'voice.headline_length',
    signalValue: value,
    occurredAt: new Date(`2026-08-${id.padStart(2, '0')}T00:00:00Z`),
  };
}

describe('conservative feedback learning', () => {
  it('does not learn from a single edit', () => {
    expect(
      proposePreference('proposal_one', tenant, user, 'voice.headline_length', [edit('1', 'short')], new Date('2026-08-31T00:00:00Z')),
    ).toBeUndefined();
  });

  it('proposes but does not auto-apply a repeated preference', () => {
    const proposal = proposePreference(
      'proposal_one',
      tenant,
      user,
      'voice.headline_length',
      [edit('1', 'short'), edit('2', 'short'), edit('3', 'short')],
      new Date('2026-08-31T00:00:00Z'),
    );
    expect(proposal).toMatchObject({ status: 'proposed', proposedValue: 'short' });
    expect(proposal?.evidenceEventIds).toHaveLength(3);
  });

  it('ignores feedback from another tenant', () => {
    const foreign = { ...edit('1', 'short'), tenantId: tenantId('tenant_two') };
    expect(
      proposePreference('proposal_one', tenant, user, 'voice.headline_length', [foreign, edit('2', 'short'), edit('3', 'short')], new Date('2026-08-31T00:00:00Z')),
    ).toBeUndefined();
  });

  it('requires human decision and supports revocation', () => {
    const proposal = proposePreference(
      'proposal_one',
      tenant,
      user,
      'voice.headline_length',
      [edit('1', 'short'), edit('2', 'short'), edit('3', 'short')],
      new Date('2026-08-31T00:00:00Z'),
    );
    if (!proposal) throw new Error('Expected proposal');
    const applied = decidePreference(proposal, 'applied', user, new Date('2026-09-01T00:00:00Z'));
    expect(applied.status).toBe('applied');
    expect(revokePreference(applied, user, new Date('2026-09-02T00:00:00Z')).status).toBe('revoked');
  });
});

