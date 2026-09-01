import { describe, expect, it } from 'vitest';
import {
  ArbitrationConflictError,
  DecisionArbitrationService,
  InMemoryArbitrationRepository,
  arbitrate,
  moduleOpinionContractVersion,
  type ModuleOpinion,
} from '../src/arbitration/decision-arbitration.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import type { BrandProtectionSnapshot } from '../src/risk/brand-protection.js';
import type { WorkbenchAction, WorkbenchSnapshot } from '../src/workbench/workbench.js';
import { testAttentionBudget, testDecisionContract, testDecisionFrame } from './support/strategic-decision.js';

const tenant = tenantId('tenant_primary');
const owner = userId('owner_primary');
const now = new Date('2026-08-31T12:00:00.000Z');

describe('inter-module decision arbitration', () => {
  it('preserves a mandatory blocker even when several modules support utility', () => {
    const decision = arbitrate(
      { kind: 'content' },
      4,
      [
        opinion('strategy', 'support'),
        opinion('permission', 'support'),
        opinion('risk', 'hold'),
      ],
    );

    expect(decision).toMatchObject({
      outcome: 'held',
      effectiveAutonomyLevel: 1,
      executionPermitted: false,
      dissentPreserved: true,
      blockingModules: ['risk'],
    });
    expect(decision.appliedRules).toContain('single_module_cannot_override_blocker');
  });

  it('downgrades delegated execution to an approval request in the MVP', () => {
    const decision = arbitrate(
      { kind: 'private_conversation' },
      7,
      [opinion('strategy', 'support'), opinion('permission', 'support')],
    );

    expect(decision).toMatchObject({
      outcome: 'approval_required',
      effectiveAutonomyLevel: 5,
      requiresHumanApproval: true,
      executionPermitted: false,
      downgradeReasons: ['mvp_execution_disabled'],
    });
  });

  it('creates an owner-scoped, idempotent case with independent claim and risk gates', async () => {
    const action = groundedAction();
    const workbench = workbenchSnapshot(action);
    const risk = riskSnapshot(action, 'yellow', 'review_required', 0);
    const repository = new InMemoryArbitrationRepository();
    const service = new DecisionArbitrationService(
      repository,
      { tenantId: tenant, ownerUserId: owner },
      {
        workbench: { snapshot: () => Promise.resolve(workbench) },
        risk: { snapshot: () => Promise.resolve(risk) },
      },
    );

    const first = await service.assess({
      actorId: owner,
      requestId: 'arbitration_case_1',
      actionId: action.id,
      requestedAutonomyLevel: 4,
      occurredAt: now,
    });
    const replay = await service.assess({
      actorId: owner,
      requestId: 'arbitration_case_1',
      actionId: action.id,
      requestedAutonomyLevel: 4,
      occurredAt: now,
    });

    expect(first.outcome).toBe('applied');
    expect(replay.outcome).toBe('already_applied');
    expect(first.snapshot.contextHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.snapshot.snapshotHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.snapshot).toMatchObject({
      policyVersion: 'intermodule-arbitration-v1',
      request: {
        requestedAutonomyLevel: 4,
        writeAuthority: 'append_decision_only',
      },
      decision: {
        outcome: 'revision_required',
        effectiveAutonomyLevel: 3,
        executionPermitted: false,
      },
    });
    expect(first.snapshot.opinions.map((item) => item.module)).toEqual([
      'strategy', 'permission', 'claims', 'risk', 'authenticity',
    ]);
    expect(first.snapshot.opinions.map((item) => item.authority)).toEqual(
      Array.from({ length: 5 }, () => ({ read: 'owner_scoped_snapshot', write: 'none' })),
    );

    await expect(service.assess({
      actorId: owner,
      requestId: 'arbitration_case_1',
      actionId: action.id,
      requestedAutonomyLevel: 2,
      occurredAt: now,
    })).rejects.toBeInstanceOf(ArbitrationConflictError);
  });

  it('marks stored decisions stale when their bounded decision window expires', async () => {
    const action = groundedAction();
    const workbench = workbenchSnapshot(action);
    const risk = riskSnapshot(action, 'green', 'allowed', 1);
    const service = new DecisionArbitrationService(
      new InMemoryArbitrationRepository(),
      { tenantId: tenant, ownerUserId: owner },
      {
        workbench: { snapshot: () => Promise.resolve(workbench) },
        risk: { snapshot: () => Promise.resolve(risk) },
      },
    );
    await service.assess({
      actorId: owner,
      requestId: 'arbitration_expiry',
      actionId: action.id,
      requestedAutonomyLevel: 2,
      occurredAt: now,
    });

    const current = await service.snapshot(owner, new Date(now.getTime() + 60_000));
    const expired = await service.snapshot(owner, new Date(now.getTime() + 25 * 60 * 60 * 1000));

    expect(current.cases[0]?.stale).toBe(false);
    expect(expired.cases[0]?.stale).toBe(true);
  });

  it('fails closed when a recommendation has no authorized evidence', async () => {
    const action = { ...groundedAction(), evidenceIds: [], evidenceCount: 0, evidenceState: 'insufficient' as const };
    const service = new DecisionArbitrationService(
      new InMemoryArbitrationRepository(),
      { tenantId: tenant, ownerUserId: owner },
      {
        workbench: { snapshot: () => Promise.resolve(workbenchSnapshot(action)) },
        risk: { snapshot: () => Promise.resolve(riskSnapshot(action, 'red', 'blocked', 0)) },
      },
    );

    const result = await service.assess({
      actorId: owner,
      requestId: 'arbitration_no_evidence',
      actionId: action.id,
      requestedAutonomyLevel: 2,
      occurredAt: now,
    });

    expect(result.snapshot.decision).toMatchObject({
      outcome: 'held',
      blockingModules: ['permission'],
      executionPermitted: false,
    });
  });
});

function opinion(
  module: ModuleOpinion['module'],
  position: ModuleOpinion['position'],
): ModuleOpinion {
  return {
    contractVersion: moduleOpinionContractVersion,
    module,
    moduleVersion: `${module}-v1`,
    position,
    confidence: 1,
    appliesFromAutonomyLevel: 2,
    rationale: `${module} says ${position}`,
    provenanceRefs: [`${module}:fixture`],
    authority: { read: 'owner_scoped_snapshot', write: 'none' },
  };
}

function groundedAction(): WorkbenchAction {
  return {
    id: 'essay',
    kind: 'content',
    title: 'یادداشت تحلیلی',
    rationale: 'یک تجربه واقعی مبنای این اقدام است.',
    benefits: ['اعتبار'],
    risks: ['برداشت خارج از زمینه'],
    prerequisites: ['Claim review'],
    evidenceIds: ['evidence-1', 'evidence-2'],
    evidenceCount: 2,
    confidence: 0.78,
    riskLevel: 'medium',
    attentionCostMinutes: 120,
    energyCost: 3,
    attentionDemand: 4,
    visibilityCost: 4,
    emotionalCost: 3,
    feasible: true,
    feasibilityReasons: ['within_budget'],
    utilityScore: 54.2,
    opportunityCost: 13.4,
    rank: 2,
    evidenceState: 'grounded',
    evidenceSourceTypes: ['text_asset'],
    interaction: 'approve',
    decision: testDecisionContract('content', now),
  };
}

function workbenchSnapshot(action: WorkbenchAction): WorkbenchSnapshot {
  return {
    policyVersion: 'strategic-decision-v1',
    generatedAt: now.toISOString(),
    runtime: { source: 'node_api', persistence: 'memory' },
    profile: { maturityPercent: 20, evidenceCount: action.evidenceCount, openContradictions: 0 },
    goal: {
      id: 'goal-1', revision: 3, title: 'اعتماد', outcome: 'تعامل عمیق', successMetrics: ['کیفیت'],
    },
    attentionBudget: testAttentionBudget,
    decisionContext: {
      policyVersion: 'decision-context-v1', revision: 1, contextHash: 'a'.repeat(64),
      updatedAt: now.toISOString(), persistence: 'memory', attentionBudget: testAttentionBudget,
    },
    decisionFrame: testDecisionFrame(now),
    evidence: {
      state: action.evidenceState,
      strategyEvidenceCount: action.evidenceCount,
      withheldEvidenceCount: 0,
      sourceTypes: action.evidenceSourceTypes,
    },
    actions: [action],
    workflow: { id: 'workbench_today', status: 'awaiting_approval', revision: 2 },
  };
}

function riskSnapshot(
  action: WorkbenchAction,
  level: 'green' | 'yellow' | 'red',
  gate: 'allowed' | 'review_required' | 'blocked',
  publicReady: number,
): BrandProtectionSnapshot {
  return {
    generatedAt: now,
    persistence: 'memory',
    policyVersion: 'brand-protection-v1',
    summary: {
      totalActions: 1,
      green: level === 'green' ? 1 : 0,
      yellow: level === 'yellow' ? 1 : 0,
      red: level === 'red' ? 1 : 0,
      reviewRequired: gate === 'review_required' ? 1 : 0,
      blocked: gate === 'blocked' ? 1 : 0,
    },
    claimPosture: {
      totalClaims: publicReady,
      verified: publicReady,
      traceBlocked: 0,
      publicReady,
      note: 'fixture',
    },
    assessments: [{
      actionId: action.id,
      actionTitle: action.title,
      actionKind: action.kind,
      policyVersion: 'brand-protection-v1',
      assessmentHash: 'a'.repeat(64),
      level,
      gate,
      rationale: `${level} risk`,
      findings: [{
        dimension: 'authenticity',
        level: action.evidenceCount > 0 ? 'green' : 'red',
        code: 'fixture',
        rationale: 'fixture authenticity',
        mitigation: 'fixture mitigation',
      }],
      reviewableDecisions: level === 'yellow' ? ['acknowledge', 'hold', 'escalate'] : level === 'red' ? ['hold', 'escalate'] : [],
    }],
  };
}
