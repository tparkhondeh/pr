export type WorkflowStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowState = Readonly<{
  id: string;
  definitionVersion: number;
  revision: number;
  status: WorkflowStatus;
  processedEventIds: ReadonlySet<string>;
  approval?: Readonly<{
    approvedBy: string;
    approvedAt: Date;
  }>;
  failure?:
    | Readonly<{
        code: string;
        retryable: boolean;
      }>
    | undefined;
}>;

export type WorkflowEvent =
  | Readonly<{ id: string; type: 'approval_requested' }>
  | Readonly<{
      id: string;
      type: 'approved';
      actorId: string;
      occurredAt: Date;
    }>
  | Readonly<{ id: string; type: 'started' }>
  | Readonly<{ id: string; type: 'completed' }>
  | Readonly<{
      id: string;
      type: 'failed';
      code: string;
      retryable: boolean;
    }>
  | Readonly<{ id: string; type: 'cancelled' }>
  | Readonly<{ id: string; type: 'retry_requested' }>;

const transitions: Readonly<Record<WorkflowStatus, readonly WorkflowEvent['type'][]>> = {
  draft: ['approval_requested', 'cancelled'],
  awaiting_approval: ['approved', 'cancelled'],
  approved: ['started', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['retry_requested', 'cancelled'],
  cancelled: [],
};

export function createWorkflow(id: string, definitionVersion = 1): WorkflowState {
  if (id.trim().length === 0) throw new Error('Workflow ID is required.');
  if (!Number.isInteger(definitionVersion) || definitionVersion < 1) {
    throw new Error('Workflow definition version must be a positive integer.');
  }
  return {
    id,
    definitionVersion,
    revision: 0,
    status: 'draft',
    processedEventIds: new Set(),
  };
}

export function evolveWorkflow(
  state: WorkflowState,
  event: WorkflowEvent,
): WorkflowState {
  if (state.processedEventIds.has(event.id)) return state;
  if (!transitions[state.status].includes(event.type)) {
    throw new Error(`Invalid transition: ${state.status} -> ${event.type}`);
  }

  const processedEventIds = new Set(state.processedEventIds).add(event.id);
  const base = {
    ...state,
    revision: state.revision + 1,
    processedEventIds,
  };

  switch (event.type) {
    case 'approval_requested':
      return { ...base, status: 'awaiting_approval' };
    case 'approved':
      return {
        ...base,
        status: 'approved',
        approval: { approvedBy: event.actorId, approvedAt: event.occurredAt },
      };
    case 'started':
      return { ...base, status: 'running' };
    case 'completed':
      return { ...base, status: 'completed' };
    case 'failed':
      return {
        ...base,
        status: 'failed',
        failure: { code: event.code, retryable: event.retryable },
      };
    case 'retry_requested':
      if (!state.failure?.retryable) {
        throw new Error('A non-retryable workflow cannot be retried.');
      }
      return { ...base, status: 'approved', failure: undefined };
    case 'cancelled':
      return { ...base, status: 'cancelled' };
  }
}
