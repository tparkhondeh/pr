import { describe, expect, it } from 'vitest';
import { userId } from '../src/kernel/identity.js';
import {
  WorkbenchActionNotFoundError,
  WorkbenchApprovalConflictError,
  createDefaultWorkbenchService,
} from '../src/workbench/workbench.js';
import { groundedEvidence } from './support/grounded-evidence.js';

const fixedTime = new Date('2026-08-31T12:00:00.000Z');

function groundedService() {
  return createDefaultWorkbenchService(
    () => fixedTime,
    undefined,
    { tenantId: 'tenant_primary', ownerUserId: 'owner_primary' },
    undefined,
    groundedEvidence(fixedTime),
  );
}

describe('workbench application state', () => {
  it('abstains from seeded recommendations when no owner evidence is authorized', async () => {
    const snapshot = await createDefaultWorkbenchService(() => fixedTime).snapshot();

    expect(snapshot.generatedAt).toBe(fixedTime.toISOString());
    expect(snapshot.policyVersion).toBe('strategic-decision-v1');
    expect(snapshot.decisionFrame).toMatchObject({
      why: { objective: 'ایجاد تعامل‌های عمیق و قابل‌ردیابی با ذی‌نفعان اصلی' },
      decisionWindow: { durationHours: 24, expiresAt: '2026-09-01T12:00:00.000Z' },
      rankingTransparency: { utilityScoreVisible: true, opportunityCostVisible: true, hiddenScoreUsed: false },
      boundaries: { platformConstrained: false, publicApprovalGranted: false, externalActionPermitted: false },
    });
    expect(snapshot.runtime).toEqual({ source: 'node_api', persistence: 'memory' });
    expect(snapshot.workflow.status).toBe('awaiting_approval');
    expect(snapshot.actions).toHaveLength(3);
    expect(snapshot.actions[0]?.id).toBe('collect_evidence');
    expect(snapshot.actions.some((action) => action.kind === 'no_action')).toBe(true);
    expect(snapshot.actions.every((action) => action.evidenceCount === 0)).toBe(true);
    expect(snapshot.actions.map((action) => action.decision.requiredApproval)).toEqual([
      'human', 'human', 'human',
    ]);
    expect(snapshot.actions.map((action) => action.decision.boundaries.externalActionPermitted)).toEqual([
      false, false, false,
    ]);
    expect(snapshot.evidence).toEqual({
      state: 'insufficient',
      strategyEvidenceCount: 0,
      withheldEvidenceCount: 0,
      sourceTypes: [],
    });
    expect(snapshot.actions.some((action) => action.title.includes('یادداشت تحلیلی'))).toBe(false);
  });

  it('exposes evidence-grounded strategic choices after brand-analysis consent', async () => {
    const snapshot = await groundedService().snapshot();
    expect(snapshot.actions[0]?.id).toBe('conversation');
    expect(snapshot.actions.every((action) => action.evidenceCount > 0)).toBe(true);
    expect(snapshot.actions.every((action) => action.evidenceState === 'grounded')).toBe(true);
    const firstDecision = snapshot.actions[0]?.decision;
    expect(firstDecision).toMatchObject({
      posture: 'now', format: 'private_conversation', platformSelected: false,
    });
    expect(firstDecision?.measurementPlan.signals).toEqual(
      expect.arrayContaining(['عمق تعامل', 'تغییر رابطه']),
    );
    expect(snapshot.actions[1]?.decision).toMatchObject({ format: 'mother_concept', platformSelected: false });
    expect(snapshot.actions.every((action) => action.feasibilityReasons[0] === 'within_budget')).toBe(true);
    expect(snapshot.evidence).toMatchObject({ state: 'grounded', strategyEvidenceCount: 1 });
    expect(snapshot.profile).toMatchObject({ maturityPercent: 23, evidenceCount: 1 });
  });

  it('records human approval without executing the action', async () => {
    const service = groundedService();
    const approved = await service.approve('conversation', userId('owner_primary'), fixedTime);

    expect(approved.workflow).toMatchObject({
      status: 'approved',
      approvedActionId: 'conversation',
      approvedAt: fixedTime.toISOString(),
    });
    expect(approved.workflow.status).not.toBe('running');
  });

  it('is idempotent for the same approval and rejects replacement approval', async () => {
    const service = groundedService();
    const actor = userId('owner_primary');
    const first = await service.approve('conversation', actor, fixedTime);
    const repeated = await service.approve('conversation', actor, fixedTime);

    expect(repeated.workflow.revision).toBe(first.workflow.revision);
    await expect(service.approve('essay', actor, fixedTime)).rejects.toThrow(
      WorkbenchApprovalConflictError,
    );
  });

  it('rejects unknown actions', async () => {
    const service = createDefaultWorkbenchService(() => fixedTime);
    await expect(
      service.approve('missing', userId('owner_primary'), fixedTime),
    ).rejects.toThrow(WorkbenchActionNotFoundError);
  });

  it('routes cold-start collection actions instead of approving them', async () => {
    const service = createDefaultWorkbenchService(() => fixedTime);
    await expect(
      service.approve('collect_evidence', userId('owner_primary'), fixedTime),
    ).rejects.toMatchObject({ reason: 'action_not_approvable' });
    const abstained = await service.approve('wait', userId('owner_primary'), fixedTime);
    expect(abstained.workflow).toMatchObject({ status: 'approved', approvedActionId: 'wait' });
  });
});
