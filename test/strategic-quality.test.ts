import { describe, expect, it } from 'vitest';
import {
  InMemoryStrategicQualityRepository,
  StrategicQualityConflictError,
  StrategicQualityPermissionError,
  StrategicQualityService,
  evaluateStrategicDecisionRubric,
} from '../src/evaluation/strategic-quality.js';
import { tenantId, userId } from '../src/kernel/identity.js';
import {
  createDefaultWorkbenchService,
  type WorkbenchSnapshot,
} from '../src/workbench/workbench.js';
import { groundedEvidence } from './support/grounded-evidence.js';

const fixedTime = new Date('2026-08-31T12:00:00.000Z');
const activeTenant = tenantId('tenant_primary');
const owner = userId('owner_primary');

function createGroundedWorkbench() {
  return createDefaultWorkbenchService(
    () => fixedTime,
    undefined,
    { tenantId: activeTenant, ownerUserId: owner },
    undefined,
    groundedEvidence(fixedTime),
  );
}

describe('strategic quality baseline', () => {
  it('treats explicit cold-start abstention as a valid quality posture', async () => {
    const workbench = createDefaultWorkbenchService(
      () => fixedTime,
      undefined,
      { tenantId: activeTenant, ownerUserId: owner },
    );
    const service = new StrategicQualityService(
      new InMemoryStrategicQualityRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
      workbench,
    );

    const snapshot = await service.snapshot(owner, fixedTime);

    expect(snapshot.rubric).toMatchObject({ status: 'pass', criticalFailures: 0 });
    expect(snapshot.rubric.checks.find((check) => check.id === 'grounded_or_abstaining')).toMatchObject({
      passed: true,
      evidence: 'insufficient:0',
    });
  });

  it('runs the operational rubric but refuses to invent an owner baseline', async () => {
    const workbench = createGroundedWorkbench();
    const service = new StrategicQualityService(
      new InMemoryStrategicQualityRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
      workbench,
    );

    const snapshot = await service.snapshot(owner, fixedTime);

    expect(snapshot.rubric).toMatchObject({
      policyVersion: 'strategic-quality-v1',
      status: 'pass',
      criticalFailures: 0,
    });
    expect(snapshot.ownerBaseline).toEqual({
      status: 'collecting',
      minimumSampleSize: 5,
      sampleSize: 0,
      remainingSamples: 5,
      accepted: 0,
      rejected: 0,
      needsRevision: 0,
      observedMetrics: null,
      baselineMetrics: null,
    });
  });

  it('binds acceptance to a real approval and preserves idempotency', async () => {
    const workbench = createGroundedWorkbench();
    const repository = new InMemoryStrategicQualityRepository();
    const service = new StrategicQualityService(
      repository,
      { tenantId: activeTenant, ownerUserId: owner },
      workbench,
    );
    const source = await workbench.snapshot();
    const input = {
      actorId: owner,
      requestId: 'strategic_review_accept_one',
      actionId: 'essay',
      decision: 'accepted' as const,
      usefulness: 5,
      trust: 4,
      friction: 2,
      note: 'برای تصمیم امروز مفید بود.',
      expectedStrategyRevision: source.goal.revision,
      expectedDecisionContextRevision: source.decisionContext.revision,
      expectedDecisionContextHash: source.decisionContext.contextHash,
      expectedDecisionWindowEndsAt: source.actions.find((action) => action.id === 'essay')?.decision.decisionWindowEndsAt ?? '',
      reviewedAt: fixedTime,
    };

    await expect(service.review(input)).rejects.toMatchObject({
      reason: 'acceptance_not_approved',
    });
    await workbench.approve('essay', owner, fixedTime);
    const first = await service.review(input);
    const repeated = await service.review(input);

    expect(first.ownerBaseline).toMatchObject({
      status: 'collecting', sampleSize: 1, accepted: 1, baselineMetrics: null,
      observedMetrics: { acceptanceRate: 1, averageUsefulness: 5, averageTrust: 4, averageFriction: 2 },
    });
    expect(repeated.recentReviews).toHaveLength(1);
    await expect(service.review({ ...input, usefulness: 4 })).rejects.toBeInstanceOf(
      StrategicQualityConflictError,
    );
    await expect(service.snapshot(userId('another_owner'), fixedTime)).rejects.toBeInstanceOf(
      StrategicQualityPermissionError,
    );
  });

  it('establishes a baseline only after five context-bound samples', async () => {
    const base = await createGroundedWorkbench().snapshot();
    let revision = 1;
    const mutableWorkbench = {
      snapshot: (): Promise<WorkbenchSnapshot> => Promise.resolve(withRevision(base, revision)),
    };
    const service = new StrategicQualityService(
      new InMemoryStrategicQualityRepository(),
      { tenantId: activeTenant, ownerUserId: owner },
      mutableWorkbench,
    );
    let latest = await mutableWorkbench.snapshot();
    let quality = await service.snapshot(owner, fixedTime);
    for (let index = 1; index <= 5; index += 1) {
      revision = index;
      latest = await mutableWorkbench.snapshot();
      const action = latest.actions[0];
      if (!action) throw new Error('Expected a strategic action.');
      quality = await service.review({
        actorId: owner,
        requestId: `strategic_review_cycle_${String(index)}`,
        actionId: action.id,
        decision: index <= 3 ? 'rejected' : 'needs_revision',
        usefulness: index,
        trust: 4,
        friction: 2,
        expectedStrategyRevision: latest.goal.revision,
        expectedDecisionContextRevision: latest.decisionContext.revision,
        expectedDecisionContextHash: latest.decisionContext.contextHash,
        expectedDecisionWindowEndsAt: action.decision.decisionWindowEndsAt,
        reviewedAt: fixedTime,
      });
    }

    expect(quality.ownerBaseline).toMatchObject({
      status: 'established',
      sampleSize: 5,
      remainingSamples: 0,
      accepted: 0,
      rejected: 3,
      needsRevision: 2,
      observedMetrics: { acceptanceRate: 0, averageUsefulness: 3 },
      baselineMetrics: { acceptanceRate: 0, averageUsefulness: 3 },
    });
  });

  it('fails the rubric when a recommendation drops its human gate', async () => {
    const snapshot = await createGroundedWorkbench().snapshot();
    const first = snapshot.actions[0];
    if (!first) throw new Error('Expected a strategic action.');
    const unsafe = {
      ...snapshot,
      actions: [{
        ...first,
        decision: {
          ...first.decision,
          boundaries: { ...first.decision.boundaries, externalActionPermitted: true },
        },
      }, ...snapshot.actions.slice(1)],
    } as unknown as WorkbenchSnapshot;

    expect(evaluateStrategicDecisionRubric(unsafe)).toMatchObject({
      status: 'fail',
      criticalFailures: 1,
    });
  });
});

function withRevision(source: WorkbenchSnapshot, revision: number): WorkbenchSnapshot {
  const hash = revision.toString(16).padStart(64, '0');
  return {
    ...source,
    goal: { ...source.goal, revision },
    decisionContext: { ...source.decisionContext, revision, contextHash: hash },
    actions: source.actions.map((action) => ({
      ...action,
      decision: {
        ...action.decision,
        strategyRevision: revision,
        decisionContextRevision: revision,
        decisionContextHash: hash,
      },
    })),
  };
}
