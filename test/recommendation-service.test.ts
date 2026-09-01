import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import type { PermissionGrant } from '../src/kernel/policy.js';
import {
  assertionId,
  createAssertion,
  evidenceId,
} from '../src/memory/personal-memory.js';
import { InMemoryCostLedger } from '../src/observability/cost-ledger.js';
import { DeterministicModelGateway } from '../src/providers/model-gateway.js';
import {
  prepareRecommendation,
  RecommendationPermissionError,
} from '../src/strategy/recommendation-service.js';
import type { StrategicOption } from '../src/strategy/strategy.js';

const tenant = tenantId('tenant_one');
const actor = userId('user_one');
const evidence = evidenceId('evidence_one');
const assertion = createAssertion({
  id: assertionId('assertion_one'),
  tenantId: tenant,
  subjectRef: 'person:user_one',
  predicate: 'expertise.strategy',
  value: 'high',
  epistemicType: 'hypothesis',
  dataClass: 'confidential',
  confidence: 0.8,
  confidenceRationale: 'Multiple independent professional examples.',
  evidence: [{ evidenceId: evidence, relation: 'supports' }],
  createdAt: new Date('2026-08-01T00:00:00Z'),
  createdBy: actor,
});
const grant: PermissionGrant = {
  tenantId: tenant,
  actorId: actor,
  purpose: 'strategy_reasoning',
  operation: 'read',
  dataClass: 'confidential',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
};

function option(id: string, kind: StrategicOption['kind']): StrategicOption {
  return {
    id,
    tenantId: tenant,
    kind,
    title: kind === 'no_action' ? 'فعلاً اقدام نکن' : `اقدام ${id}`,
    rationale: 'این گزینه با هدف و شواهد فعلی هم‌راستا است.',
    evidenceIds: [evidence],
    benefits: ['حرکت به سمت هدف'],
    risks: ['برداشت نادرست'],
    prerequisites: ['بررسی انسانی'],
    benefitScore: kind === 'no_action' ? 40 : 80,
    strategicFitScore: kind === 'no_action' ? 50 : 85,
    riskScore: kind === 'no_action' ? 5 : 25,
    reversibilityScore: kind === 'no_action' ? 100 : 60,
    confidence: 0.8,
    attentionCostMinutes: kind === 'no_action' ? 0 : 60,
    energyCost: kind === 'no_action' ? 1 : 3,
    visibilityCost: kind === 'content' ? 4 : 1,
    emotionalCost: kind === 'no_action' ? 1 : 2,
  };
}

function request() {
  return {
    requestId: 'request_one',
    workflowId: 'workflow_one',
    tenantId: tenant,
    actorId: actor,
    goal: {
      id: 'goal_one',
      tenantId: tenant,
      ownerUserId: actor,
      title: 'افزایش اعتماد',
      outcome: 'سه گفت‌وگوی باکیفیت با مخاطبان کلیدی',
      priority: 5 as const,
      successMetrics: ['سه گفت‌وگوی باکیفیت'],
    },
    dataClass: 'confidential' as const,
    at: new Date('2026-08-31T00:00:00Z'),
    attentionBudget: {
      availableMinutes: 180,
      maximumEnergyCost: 4 as const,
      visibilityTolerance: 4 as const,
      emotionalBandwidth: 3 as const,
    },
    rankingPolicy: {
      benefitWeight: 0.25,
      strategicFitWeight: 0.3,
      riskWeight: 0.2,
      reversibilityWeight: 0.1,
      confidenceWeight: 0.15,
      attentionPenaltyPerHour: 2,
    },
  };
}

describe('recommendation service', () => {
  it('prepares an evidence-linked recommendation awaiting human approval', async () => {
    const gateway = new DeterministicModelGateway(
      new Map([
        [
          'request_one',
          { options: [option('one', 'private_conversation'), option('two', 'content'), option('wait', 'no_action')] },
        ],
      ]),
    );
    const prepared = await prepareRecommendation(request(), {
      grants: [grant],
      assertions: [assertion],
      modelGateway: gateway,
      costLedger: new InMemoryCostLedger(100),
    });
    expect(prepared.workflow.status).toBe('awaiting_approval');
    expect(prepared.rankedOptions).toHaveLength(3);
    expect(prepared.rankedOptions.some((item) => item.kind === 'no_action')).toBe(true);
    expect(prepared.evidenceAssertionIds).toEqual([assertion.id]);
    expect(prepared.workflowCost.costMinorUnits).toBe(0);
  });

  it('fails before calling a model when memory permission is missing', async () => {
    const gateway = new DeterministicModelGateway(new Map());
    await expect(
      prepareRecommendation(request(), {
        grants: [],
        assertions: [assertion],
        modelGateway: gateway,
        costLedger: new InMemoryCostLedger(100),
      }),
    ).rejects.toBeInstanceOf(RecommendationPermissionError);
  });
});
