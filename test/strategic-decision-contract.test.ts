import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import { defaultStrategyContext } from '../src/strategy/context.js';
import {
  createActionDecisionContract,
  createStrategicDecisionFrame,
} from '../src/strategy/decision-contract.js';
import { defaultDecisionContext } from '../src/strategy/decision-context.js';

const now = new Date('2026-08-31T12:00:00.000Z');
const strategy = defaultStrategyContext(tenantId('tenant_primary'), userId('owner_primary'), now);
const budget = {
  availableMinutes: 150,
  maximumEnergyCost: 3 as const,
  attentionCapacity: 3 as const,
  visibilityTolerance: 4 as const,
  emotionalBandwidth: 3 as const,
};
const decisionContext = defaultDecisionContext(now);

describe('strategic decision contract', () => {
  it('makes the Why, audience, decision window and ranking policy explicit', () => {
    const frame = createStrategicDecisionFrame(strategy, budget, now, decisionContext);
    expect(frame).toMatchObject({
      policyVersion: 'strategic-decision-v1',
      why: { goalId: strategy.goalId, objective: strategy.goal.outcome },
      forWhom: strategy.desiredPositioning.audience,
      contextBinding: {
        strategyRevision: 1,
        decisionContextRevision: 1,
        decisionContextHash: decisionContext.contextHash,
      },
      decisionWindow: { generatedAt: now.toISOString(), expiresAt: '2026-09-01T12:00:00.000Z', durationHours: 24 },
      rankingTransparency: {
        method: 'declared_weighted_policy', utilityScoreVisible: true,
        opportunityCostVisible: true, hiddenScoreUsed: false,
      },
      boundaries: { platformConstrained: false, publicApprovalGranted: false, externalActionPermitted: false },
    });
  });

  it('keeps a content decision at Mother Concept level and defines meaningful learning signals', () => {
    const contract = createActionDecisionContract({
      kind: 'content', strategy, generatedAt: now, feasible: true,
      feasibilityReasons: ['within_budget'], evidenceCount: 2,
      decisionContext,
    });
    expect(contract).toMatchObject({
      posture: 'now', format: 'mother_concept', platformSelected: false,
      requiredApproval: 'human',
      boundaries: { recommendationIsExecution: false, publicApprovalGranted: false, externalActionPermitted: false },
    });
    expect(contract.measurementPlan.signals).toEqual(
      expect.arrayContaining(['کیفیت تعامل', 'تغییر ادراک', 'پشیمانی کاربر']),
    );
    expect(contract.assumptions).toHaveLength(2);
    expect(contract.uncertainty).toHaveLength(2);
  });

  it('routes evidence-insufficient paths to when-ready instead of fabricating urgency', () => {
    const contract = createActionDecisionContract({
      kind: 'research', strategy, generatedAt: now, feasible: true,
      feasibilityReasons: ['within_budget'], evidenceCount: 0, coldStart: true,
      decisionContext,
    });
    expect(contract).toMatchObject({
      posture: 'when_ready', format: 'research_brief',
    });
    expect(contract.assumptions).toEqual(
      expect.arrayContaining(['Evidence مجاز کافی برای توصیه بیرونی هنوز وجود ندارد.']),
    );
  });
});
