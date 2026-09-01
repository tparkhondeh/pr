import { describe, expect, it } from 'vitest';
import { proposeClaim, verifyClaim } from '../src/claims/claim-registry.js';
import { prepareDraft, DraftPermissionError } from '../src/claims/draft-service.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import type { PermissionGrant } from '../src/kernel/policy.js';
import { evidenceId } from '../src/memory/personal-memory.js';
import { InMemoryCostLedger } from '../src/observability/cost-ledger.js';
import { DeterministicModelGateway } from '../src/providers/model-gateway.js';
import type { RankedOption } from '../src/strategy/strategy.js';

const tenant = tenantId('tenant_one');
const actor = userId('user_one');
const evidence = evidenceId('evidence_one');
const claim = verifyClaim(
  proposeClaim({
    id: 'claim_one',
    tenantId: tenant,
    statement: 'این تجربه در سال ۱۴۰۵ رخ داده است.',
    kind: 'personal_fact',
    dataClass: 'confidential',
    evidenceIds: [evidence],
    sourceRefs: [],
    allowedPurposes: ['public_drafting'],
    allowedChannels: ['linkedin'],
    validFrom: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: actor,
  }),
  actor,
  new Date('2026-01-02T00:00:00Z'),
);
const grant: PermissionGrant = {
  tenantId: tenant,
  actorId: actor,
  purpose: 'public_drafting',
  operation: 'derive',
  dataClass: 'confidential',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
};
const option: RankedOption = {
  id: 'option_one',
  tenantId: tenant,
  kind: 'content',
  title: 'روایت یک تجربه',
  rationale: 'این روایت با هدف هم‌راستا است.',
  evidenceIds: [evidence],
  benefits: ['اعتماد'],
  risks: ['برداشت نادرست'],
  prerequisites: ['بررسی ادعا'],
  benefitScore: 80,
  strategicFitScore: 80,
  riskScore: 20,
  reversibilityScore: 50,
  confidence: 0.8,
  attentionCostMinutes: 60,
  energyCost: 3,
  attentionDemand: 3,
  visibilityCost: 3,
  emotionalCost: 2,
  feasible: true,
  feasibilityReasons: ['within_budget'],
  utilityScore: 65,
  opportunityCost: 0,
  rank: 1,
};

function request() {
  return {
    requestId: 'draft_request_one',
    workflowId: 'draft_workflow_one',
    draftId: 'draft_one',
    tenantId: tenant,
    actorId: actor,
    channel: 'linkedin',
    dataClass: 'confidential' as const,
    selectedOption: option,
    at: new Date('2026-08-31T00:00:00Z'),
  };
}

describe('draft preparation pipeline', () => {
  it('guards a draft and waits for explicit human approval', async () => {
    const gateway = new DeterministicModelGateway(
      new Map([
        [
          'draft_request_one',
          {
            body: claim.statement,
            claimExtractionComplete: true,
            claims: [{ claimId: claim.id, excerpt: claim.statement }],
          },
        ],
      ]),
    );
    const prepared = await prepareDraft(request(), {
      grants: [grant],
      claims: [claim],
      modelGateway: gateway,
      costLedger: new InMemoryCostLedger(100),
    });
    expect(prepared.guard.classification).toBe('green');
    expect(prepared.workflow.status).toBe('awaiting_approval');
  });

  it('blocks a red draft before the approval state', async () => {
    const gateway = new DeterministicModelGateway(
      new Map([
        [
          'draft_request_one',
          {
            body: 'من به عددی بدون منبع اشاره می‌کنم.',
            claimExtractionComplete: true,
            claims: [{ claimId: 'invented_claim', excerpt: 'عدد بدون منبع' }],
          },
        ],
      ]),
    );
    const prepared = await prepareDraft(request(), {
      grants: [grant],
      claims: [claim],
      modelGateway: gateway,
      costLedger: new InMemoryCostLedger(100),
    });
    expect(prepared.guard.classification).toBe('red');
    expect(prepared.workflow.status).toBe('draft');
  });

  it('denies before model use when public drafting permission is absent', async () => {
    await expect(
      prepareDraft(request(), {
        grants: [],
        claims: [claim],
        modelGateway: new DeterministicModelGateway(new Map()),
        costLedger: new InMemoryCostLedger(100),
      }),
    ).rejects.toBeInstanceOf(DraftPermissionError);
  });
});
