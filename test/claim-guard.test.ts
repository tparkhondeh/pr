import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import { evidenceId } from '../src/memory/personal-memory.js';
import {
  disputeClaim,
  proposeClaim,
  verifyClaim,
  type Claim,
  type ClaimKind,
} from '../src/claims/claim-registry.js';
import { guardDraft } from '../src/claims/draft-guard.js';

const tenant = tenantId('tenant_one');
const author = userId('user_one');
const now = new Date('2026-08-31T00:00:00Z');

function claim(kind: ClaimKind = 'personal_fact'): Claim {
  const proposed = proposeClaim({
    id: `claim_${kind}`,
    tenantId: tenant,
    statement: 'این یک ادعای قابل بررسی است.',
    kind,
    dataClass: 'confidential',
    evidenceIds: kind === 'opinion' ? [] : [evidenceId('evidence_one')],
    sourceRefs: kind === 'external_fact' ? ['https://example.test/source'] : [],
    allowedPurposes: ['public_drafting'],
    allowedChannels: ['linkedin'],
    validFrom: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: author,
  });
  return kind === 'opinion' || kind === 'projection'
    ? proposed
    : verifyClaim(proposed, author, new Date('2026-01-02T00:00:00Z'));
}

function draft(claimId: string, excerpt = 'این یک ادعای قابل بررسی است.') {
  return {
    id: 'draft_one',
    tenantId: tenant,
    channel: 'linkedin',
    purpose: 'public_drafting' as const,
    body: excerpt,
    claimExtractionComplete: true,
    claims: [{ claimId, excerpt }],
  };
}

describe('claim registry and draft guard', () => {
  it('allows a verified and permitted factual claim', () => {
    const registered = claim();
    expect(guardDraft(draft(registered.id), [registered], now)).toMatchObject({
      classification: 'green',
      mayRequestApproval: true,
    });
  });

  it('blocks an invented or unregistered claim', () => {
    expect(guardDraft(draft('missing_claim'), [], now)).toMatchObject({
      classification: 'red',
      mayRequestApproval: false,
    });
  });

  it('fails closed when claim extraction has not completed', () => {
    const registered = claim();
    const result = guardDraft(
      { ...draft(registered.id), claimExtractionComplete: false },
      [registered],
      now,
    );
    expect(result.classification).toBe('red');
    expect(result.violations.map((item) => item.code)).toContain(
      'claim_extraction_incomplete',
    );
  });

  it('blocks an unverified factual claim', () => {
    const verified = claim();
    const proposed = { ...verified, status: 'proposed' as const, verifiedAt: undefined, verifiedBy: undefined };
    const result = guardDraft(draft(proposed.id), [proposed], now);
    expect(result.violations.map((item) => item.code)).toContain('unverified_fact');
  });

  it('blocks a disputed claim', () => {
    const registered = disputeClaim(claim(), 'Source was corrected.', now);
    expect(guardDraft(draft(registered.id), [registered], now).violations[0]?.code).toBe(
      'disputed_claim',
    );
  });

  it('blocks a claim from another tenant', () => {
    const registered = { ...claim(), tenantId: tenantId('tenant_two') };
    expect(guardDraft(draft(registered.id), [registered], now).violations[0]?.code).toBe(
      'cross_tenant_claim',
    );
  });

  it('requires projections to disclose that they are forecasts', () => {
    const projection = claim('projection');
    const result = guardDraft(draft(projection.id, 'فروش سال بعد دو برابر می‌شود.'), [projection], now);
    expect(result.classification).toBe('yellow');
    expect(result.mayRequestApproval).toBe(true);
  });
});
