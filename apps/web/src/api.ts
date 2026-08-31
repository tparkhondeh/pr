export type WorkbenchAction = Readonly<{
  id: string;
  kind:
    | 'no_action'
    | 'private_conversation'
    | 'relationship'
    | 'content'
    | 'media'
    | 'event'
    | 'research';
  title: string;
  rationale: string;
  benefits: readonly string[];
  risks: readonly string[];
  prerequisites: readonly string[];
  evidenceCount: number;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  attentionCostMinutes: number;
  energyCost: 1 | 2 | 3 | 4 | 5;
  feasible: boolean;
  utilityScore: number | null;
  opportunityCost: number | null;
  rank: number;
}>;

export type WorkbenchSnapshot = Readonly<{
  generatedAt: string;
  runtime: Readonly<{
    source: 'node_api' | 'preview_worker';
    persistence: 'memory' | 'ephemeral';
  }>;
  profile: Readonly<{
    maturityPercent: number;
    evidenceCount: number;
    openContradictions: number;
  }>;
  goal: Readonly<{
    id: string;
    title: string;
    outcome: string;
    successMetrics: readonly string[];
  }>;
  attentionBudget: Readonly<{
    availableMinutes: number;
    maximumEnergyCost: 1 | 2 | 3 | 4 | 5;
  }>;
  actions: readonly WorkbenchAction[];
  workflow: Readonly<{
    id: string;
    status:
      | 'draft'
      | 'awaiting_approval'
      | 'approved'
      | 'running'
      | 'completed'
      | 'failed'
      | 'cancelled';
    revision: number;
    approvedActionId?: string;
    approvedAt?: string;
  }>;
}>;

export class WorkbenchApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`Workbench API failed (${String(status)}): ${code}`);
  }
}

export async function loadWorkbench(signal?: AbortSignal): Promise<WorkbenchSnapshot> {
  return requestWorkbench('/api/workbench', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
}

export async function approveWorkbenchAction(actionId: string): Promise<WorkbenchSnapshot> {
  return requestWorkbench('/api/workbench/approval', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ actionId }),
  });
}

async function requestWorkbench(url: string, init: RequestInit): Promise<WorkbenchSnapshot> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new WorkbenchApiError(0, 'network_unavailable');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WorkbenchApiError(response.status, readErrorCode(payload));
  }
  if (!isWorkbenchSnapshot(payload)) {
    throw new WorkbenchApiError(response.status, 'invalid_response');
  }
  return payload;
}

function readErrorCode(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'unknown_error';
  const error = Reflect.get(payload, 'error');
  return typeof error === 'string' ? error : 'unknown_error';
}

function isWorkbenchSnapshot(payload: unknown): payload is WorkbenchSnapshot {
  if (!payload || typeof payload !== 'object') return false;
  const actions = Reflect.get(payload, 'actions');
  const goal = Reflect.get(payload, 'goal');
  const workflow = Reflect.get(payload, 'workflow');
  const runtime = Reflect.get(payload, 'runtime');
  return (
    Array.isArray(actions) &&
    actions.length >= 3 &&
    goal !== null &&
    typeof goal === 'object' &&
    typeof Reflect.get(goal, 'title') === 'string' &&
    workflow !== null &&
    typeof workflow === 'object' &&
    typeof Reflect.get(workflow, 'status') === 'string' &&
    runtime !== null &&
    typeof runtime === 'object' &&
    typeof Reflect.get(runtime, 'source') === 'string'
  );
}
