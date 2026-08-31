import { describe, expect, it } from 'vitest';
import { tenantId, userId } from '../src/kernel/identity.js';
import { evidenceId } from '../src/memory/personal-memory.js';
import {
  rankStrategicOptions,
  validateGoal,
  validatePositioning,
  type RankingPolicy,
  type StrategicOption,
} from '../src/strategy/strategy.js';

const tenant = tenantId('tenant_one');
const evidence = evidenceId('evidence_one');
const policy: RankingPolicy = {
  benefitWeight: 0.25,
  strategicFitWeight: 0.3,
  riskWeight: 0.2,
  reversibilityWeight: 0.1,
  confidenceWeight: 0.15,
  attentionPenaltyPerHour: 2,
};

function option(overrides: Partial<StrategicOption>): StrategicOption {
  return {
    id: 'option_one',
    tenantId: tenant,
    kind: 'content',
    title: 'انتشار مقاله تحلیلی',
    rationale: 'با هدف اعتبار تخصصی هم‌راستا است.',
    evidenceIds: [evidence],
    benefits: ['اعتبار تخصصی'],
    risks: ['برداشت نادرست'],
    prerequisites: ['بررسی ادعاها'],
    benefitScore: 80,
    strategicFitScore: 90,
    riskScore: 20,
    reversibilityScore: 50,
    confidence: 0.8,
    attentionCostMinutes: 120,
    energyCost: 3,
    ...overrides,
  };
}

describe('strategy domain', () => {
  it('keeps evidence-backed, perception and desired positioning distinct', () => {
    expect(
      validatePositioning({
        tenantId: tenant,
        subjectUserId: userId('user_one'),
        layer: 'desired_positioning',
        horizon: '1-year',
        dimensions: { trust: 'industry authority' },
        evidenceIds: [],
        validFrom: new Date('2026-08-31T00:00:00Z'),
      }).layer,
    ).toBe('desired_positioning');
  });

  it('requires measurable goals', () => {
    expect(() =>
      validateGoal({
        id: 'goal_one',
        tenantId: tenant,
        ownerUserId: userId('user_one'),
        title: 'افزایش اعتماد',
        outcome: 'ایجاد سه گفت‌وگوی باکیفیت با ذی‌نفعان اصلی',
        priority: 5,
        successMetrics: [],
      }),
    ).toThrow('success metric');
  });

  it('requires a no-action alternative', () => {
    expect(() =>
      rankStrategicOptions(
        tenant,
        [option({ id: 'one' }), option({ id: 'two' }), option({ id: 'three' })],
        { availableMinutes: 300, maximumEnergyCost: 5 },
        policy,
      ),
    ).toThrow('no-action');
  });

  it('ranks quality over action count and calculates opportunity cost', () => {
    const ranked = rankStrategicOptions(
      tenant,
      [
        option({ id: 'excellent', title: 'اقدام عالی', benefitScore: 95 }),
        option({ id: 'good', title: 'اقدام خوب', benefitScore: 60 }),
        option({
          id: 'wait',
          kind: 'no_action',
          title: 'فعلاً اقدام نکن',
          benefitScore: 50,
          attentionCostMinutes: 0,
          energyCost: 1,
        }),
      ],
      { availableMinutes: 300, maximumEnergyCost: 5 },
      policy,
    );
    expect(ranked[0]?.id).toBe('excellent');
    expect(ranked[0]?.opportunityCost).toBe(0);
    expect(ranked[1]?.opportunityCost).toBeGreaterThan(0);
  });

  it('marks options outside attention budget infeasible', () => {
    const ranked = rankStrategicOptions(
      tenant,
      [
        option({ id: 'large', attentionCostMinutes: 600 }),
        option({ id: 'small', attentionCostMinutes: 30 }),
        option({ id: 'wait', kind: 'no_action', attentionCostMinutes: 0 }),
      ],
      { availableMinutes: 60, maximumEnergyCost: 5 },
      policy,
    );
    expect(ranked.find((item) => item.id === 'large')?.feasible).toBe(false);
  });

  it('forbids options from another tenant', () => {
    expect(() =>
      rankStrategicOptions(
        tenant,
        [
          option({ id: 'one' }),
          option({ id: 'two' }),
          option({ id: 'wait', kind: 'no_action', tenantId: tenantId('tenant_two') }),
        ],
        { availableMinutes: 300, maximumEnergyCost: 5 },
        policy,
      ),
    ).toThrow('Cross-tenant');
  });
});

