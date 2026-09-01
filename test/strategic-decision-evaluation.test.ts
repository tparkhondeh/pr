import { describe, expect, it } from 'vitest';
import { runEvaluationSuite } from '../src/evaluation/evaluation.js';
import {
  createDefaultWorkbenchService,
  type WorkbenchSnapshot,
} from '../src/workbench/workbench.js';
import { groundedEvidence } from './support/grounded-evidence.js';

const fixedTime = new Date('2026-08-31T12:00:00.000Z');

describe('strategic decision quality gate', () => {
  it('passes the explainability, attention, restraint and learning rubric', async () => {
    const service = createDefaultWorkbenchService(
      () => fixedTime,
      undefined,
      { tenantId: 'tenant_primary', ownerUserId: 'owner_primary' },
      undefined,
      groundedEvidence(fixedTime),
    );
    const result = await runEvaluationSuite<undefined, WorkbenchSnapshot>(
      [
        {
          id: 'fa-strategic-decision-001',
          locale: 'fa-IR',
          input: undefined,
          checks: [
            {
              id: 'explicit-decision-frame',
              severity: 'critical',
              description: 'Why, audience, timing and ranking boundaries must be explicit.',
              evaluate: (output) => ({
                passed: Boolean(
                  output.decisionFrame.why.objective
                  && output.decisionFrame.forWhom
                  && output.decisionFrame.decisionWindow.expiresAt
                  && hasTransparentRanking(output.decisionFrame.rankingTransparency),
                ),
                evidence: output.decisionFrame.policyVersion,
              }),
            },
            {
              id: 'multidimensional-attention-budget',
              severity: 'high',
              description: 'Every option must expose time, energy, attention, visibility and emotional cost.',
              evaluate: (output) => ({
                passed: output.actions.every((action) => (
                  action.attentionCostMinutes >= 0
                  && action.energyCost >= 1
                  && action.attentionDemand >= 1
                  && action.visibilityCost >= 1
                  && action.emotionalCost >= 1
                  && action.opportunityCost !== null
                )),
                evidence: `${String(output.actions.length)} action cost contracts`,
              }),
            },
            {
              id: 'human-gated-recommendations',
              severity: 'critical',
              description: 'A recommendation must never imply approval, publication or execution.',
              evaluate: (output) => ({
                passed: output.actions.every((action) => hasHumanGate(action.decision)),
                evidence: `${String(output.actions.length)} human-gated actions`,
              }),
            },
            {
              id: 'deliberate-no-action',
              severity: 'critical',
              description: 'The option set must include an explicit, reversible no-action path.',
              evaluate: (output) => ({
                passed: output.actions.some((action) => (
                  action.kind === 'no_action'
                  && action.decision.posture === 'delay'
                  && action.decision.format === 'none'
                )),
                evidence: output.actions.map((action) => action.kind).join(' | '),
              }),
            },
            {
              id: 'mother-concept-before-platform',
              severity: 'high',
              description: 'Content must remain a Mother Concept until a separate platform adaptation step.',
              evaluate: (output) => {
                const content = output.actions.find((action) => action.kind === 'content');
                return {
                  passed: content !== undefined && isUnadaptedMotherConcept(content.decision),
                  evidence: content ? `${content.decision.format}:${String(content.decision.platformSelected)}` : 'missing',
                };
              },
            },
            {
              id: 'meaningful-learning-signals',
              severity: 'high',
              description: 'Measurement must go beyond likes, views and follower count.',
              evaluate: (output) => {
                const meaningful = new Set([
                  'کیفیت تعامل', 'عمق تعامل', 'تغییر رابطه', 'فرصت ایجادشده',
                  'تغییر ادراک', 'پیام خصوصی', 'پشیمانی کاربر', 'رضایت کاربر',
                ]);
                const covered = output.actions.filter((action) => (
                  action.decision.measurementPlan.signals.some((signal) => meaningful.has(signal))
                )).length;
                return {
                  passed: covered === output.actions.length,
                  evidence: `${String(covered)}/${String(output.actions.length)} meaningful plans`,
                };
              },
            },
          ],
        },
      ],
      () => service.snapshot(),
    );

    expect(result).toMatchObject({ passed: true, totalCases: 1, passedCases: 1, criticalFailures: 0 });
  });
});

function hasTransparentRanking(ranking: Readonly<{
  opportunityCostVisible: boolean;
  hiddenScoreUsed: boolean;
}>): boolean {
  return ranking.opportunityCostVisible && !ranking.hiddenScoreUsed;
}

function hasHumanGate(decision: Readonly<{
  requiredApproval: string;
  boundaries: Readonly<{
    recommendationIsExecution: boolean;
    publicApprovalGranted: boolean;
    externalActionPermitted: boolean;
  }>;
}>): boolean {
  return decision.requiredApproval === 'human'
    && !decision.boundaries.recommendationIsExecution
    && !decision.boundaries.publicApprovalGranted
    && !decision.boundaries.externalActionPermitted;
}

function isUnadaptedMotherConcept(decision: Readonly<{
  format: string;
  platformSelected: boolean;
}>): boolean {
  return decision.format === 'mother_concept' && !decision.platformSelected;
}
