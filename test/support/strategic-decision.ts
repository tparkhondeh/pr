import type { ActionDecisionContract, StrategicDecisionFrame } from '../../src/strategy/decision-contract.js';
import type { AttentionBudget, StrategicOption } from '../../src/strategy/strategy.js';

export const testAttentionBudget: AttentionBudget = {
  availableMinutes: 150,
  maximumEnergyCost: 3,
  visibilityTolerance: 4,
  emotionalBandwidth: 3,
};

export function testDecisionContract(
  kind: StrategicOption['kind'] = 'content',
  at = new Date('2026-08-31T12:00:00.000Z'),
): ActionDecisionContract {
  const expiresAt = new Date(at.getTime() + 86400000).toISOString();
  const formats: Readonly<Record<StrategicOption['kind'], ActionDecisionContract['format']>> = {
    no_action: 'none', private_conversation: 'private_conversation', relationship: 'relationship_action',
    content: 'mother_concept', media: 'media_response', event: 'event_participation', research: 'research_brief',
  };
  return {
    policyVersion: 'strategic-decision-v1',
    objective: 'تعامل عمیق',
    stakeholder: 'تصمیم‌گیران',
    posture: kind === 'no_action' ? 'delay' : 'now',
    timingRationale: 'برای Fixture فقط در پنجره فعلی معتبر است.',
    decisionWindowEndsAt: expiresAt,
    format: formats[kind],
    platformSelected: false,
    assumptions: ['Evidence مجاز نماینده Context فعلی است.'],
    uncertainty: ['نتیجه بیرونی هنوز مشاهده نشده است.'],
    feasibilityReasons: ['within_budget'],
    requiredApproval: 'human',
    measurementPlan: { signals: ['کیفیت تعامل'], reviewAfter: expiresAt },
    boundaries: { recommendationIsExecution: false, publicApprovalGranted: false, externalActionPermitted: false },
  };
}

export function testDecisionFrame(
  at = new Date('2026-08-31T12:00:00.000Z'),
): StrategicDecisionFrame {
  const expiresAt = new Date(at.getTime() + 86400000).toISOString();
  return {
    policyVersion: 'strategic-decision-v1',
    why: { goalId: 'goal-1', objective: 'تعامل عمیق' },
    forWhom: 'تصمیم‌گیران',
    currentContext: testAttentionBudget,
    decisionWindow: { generatedAt: at.toISOString(), expiresAt, durationHours: 24 },
    rankingTransparency: {
      method: 'declared_weighted_policy',
      dimensions: ['benefit', 'strategic_fit', 'risk', 'reversibility', 'confidence', 'attention'],
      utilityScoreVisible: true, opportunityCostVisible: true, hiddenScoreUsed: false,
    },
    boundaries: { platformConstrained: false, publicApprovalGranted: false, externalActionPermitted: false },
  };
}
