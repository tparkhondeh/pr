import { describe, expect, it } from 'vitest';
import { createWorkflow, evolveWorkflow } from '../src/workflow/workflow.js';

describe('workflow state machine', () => {
  it('requires approval before execution', () => {
    const workflow = createWorkflow('recommendation-1');
    expect(() =>
      evolveWorkflow(workflow, { id: 'event-1', type: 'started' }),
    ).toThrow('Invalid transition');
  });

  it('executes the approval path', () => {
    let workflow = createWorkflow('recommendation-1');
    workflow = evolveWorkflow(workflow, {
      id: 'event-1',
      type: 'approval_requested',
    });
    workflow = evolveWorkflow(workflow, {
      id: 'event-2',
      type: 'approved',
      actorId: 'owner-1',
      occurredAt: new Date('2026-08-31T00:00:00Z'),
    });
    workflow = evolveWorkflow(workflow, { id: 'event-3', type: 'started' });
    workflow = evolveWorkflow(workflow, { id: 'event-4', type: 'completed' });

    expect(workflow.status).toBe('completed');
    expect(workflow.revision).toBe(4);
    expect(workflow.approval?.approvedBy).toBe('owner-1');
  });

  it('is idempotent for repeated event IDs', () => {
    const workflow = evolveWorkflow(createWorkflow('recommendation-1'), {
      id: 'event-1',
      type: 'approval_requested',
    });
    const repeated = evolveWorkflow(workflow, {
      id: 'event-1',
      type: 'approval_requested',
    });
    expect(repeated).toBe(workflow);
  });

  it('only retries retryable failures', () => {
    let workflow = createWorkflow('recommendation-1');
    workflow = evolveWorkflow(workflow, {
      id: 'event-1',
      type: 'approval_requested',
    });
    workflow = evolveWorkflow(workflow, {
      id: 'event-2',
      type: 'approved',
      actorId: 'owner-1',
      occurredAt: new Date('2026-08-31T00:00:00Z'),
    });
    workflow = evolveWorkflow(workflow, { id: 'event-3', type: 'started' });
    workflow = evolveWorkflow(workflow, {
      id: 'event-4',
      type: 'failed',
      code: 'provider_timeout',
      retryable: false,
    });
    expect(() =>
      evolveWorkflow(workflow, { id: 'event-5', type: 'retry_requested' }),
    ).toThrow('non-retryable');
  });
});

