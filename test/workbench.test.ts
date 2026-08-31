import { describe, expect, it } from 'vitest';
import { userId } from '../src/kernel/identity.js';
import {
  WorkbenchActionNotFoundError,
  WorkbenchApprovalConflictError,
  createDefaultWorkbenchService,
} from '../src/workbench/workbench.js';

const fixedTime = new Date('2026-08-31T12:00:00.000Z');

describe('workbench application state', () => {
  it('exposes ranked evidence-aware choices including deliberate no-action', async () => {
    const snapshot = await createDefaultWorkbenchService(() => fixedTime).snapshot();

    expect(snapshot.generatedAt).toBe(fixedTime.toISOString());
    expect(snapshot.runtime).toEqual({ source: 'node_api', persistence: 'memory' });
    expect(snapshot.workflow.status).toBe('awaiting_approval');
    expect(snapshot.actions).toHaveLength(3);
    expect(snapshot.actions[0]?.id).toBe('conversation');
    expect(snapshot.actions.some((action) => action.kind === 'no_action')).toBe(true);
    expect(snapshot.actions.every((action) => action.evidenceCount > 0)).toBe(true);
  });

  it('records human approval without executing the action', async () => {
    const service = createDefaultWorkbenchService(() => fixedTime);
    const approved = await service.approve('conversation', userId('owner_primary'), fixedTime);

    expect(approved.workflow).toMatchObject({
      status: 'approved',
      approvedActionId: 'conversation',
      approvedAt: fixedTime.toISOString(),
    });
    expect(approved.workflow.status).not.toBe('running');
  });

  it('is idempotent for the same approval and rejects replacement approval', async () => {
    const service = createDefaultWorkbenchService(() => fixedTime);
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
});
