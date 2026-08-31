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
    persistence: 'memory' | 'postgres' | 'ephemeral';
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

export type ConversationTurnResult = Readonly<{
  assistantMessage: string;
  followUpQuestion: string;
  memoryProposal?: Readonly<{
    id: string;
    epistemicType: 'self_report';
    dataClass: 'confidential';
    status: 'awaiting_user_confirmation';
    occurredAt: string;
  }>;
}>;

export type ConfirmedMemory = Readonly<{
  assertion: Readonly<{
    id: string;
    epistemicType: 'self_report';
    dataClass: 'confidential';
  }>;
  permissions: Readonly<{
    personalUnderstanding: true;
    brandUsage: false;
    publicUsage: false;
  }>;
  confirmedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
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

export async function submitConversationTurn(input: Readonly<{
  conversationId: string;
  turnId: string;
  text: string;
  proposeMemory: boolean;
}>): Promise<ConversationTurnResult> {
  const payload = await requestJson('/api/conversations/turns', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!isConversationTurnResult(payload)) {
    throw new WorkbenchApiError(200, 'invalid_response');
  }
  return payload;
}

export async function confirmMemoryProposal(proposalId: string): Promise<ConfirmedMemory> {
  const payload = await requestJson(
    `/api/memory/proposals/${encodeURIComponent(proposalId)}/confirm`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        permissions: {
          personalUnderstanding: true,
          brandUsage: false,
          publicUsage: false,
        },
      }),
    },
  );
  if (!isConfirmedMemory(payload)) {
    throw new WorkbenchApiError(200, 'invalid_response');
  }
  return payload;
}

async function requestWorkbench(url: string, init: RequestInit): Promise<WorkbenchSnapshot> {
  const payload = await requestJson(url, init);
  if (!isWorkbenchSnapshot(payload)) {
    throw new WorkbenchApiError(200, 'invalid_response');
  }
  return payload;
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
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
  return payload;
}

function readErrorCode(payload: unknown): string {
  if (!isRecord(payload)) return 'unknown_error';
  const error = payload['error'];
  return typeof error === 'string' ? error : 'unknown_error';
}

function isWorkbenchSnapshot(payload: unknown): payload is WorkbenchSnapshot {
  if (!isRecord(payload)) return false;
  const actions = payload['actions'];
  const goal = payload['goal'];
  const workflow = payload['workflow'];
  const runtime = payload['runtime'];
  return (
    Array.isArray(actions) &&
    actions.length >= 3 &&
    isRecord(goal) &&
    typeof goal['title'] === 'string' &&
    isRecord(workflow) &&
    typeof workflow['status'] === 'string' &&
    isRecord(runtime) &&
    typeof runtime['source'] === 'string'
  );
}

function isConversationTurnResult(payload: unknown): payload is ConversationTurnResult {
  if (!isRecord(payload)) return false;
  if (
    typeof payload['assistantMessage'] !== 'string' ||
    typeof payload['followUpQuestion'] !== 'string'
  ) {
    return false;
  }
  const proposal = payload['memoryProposal'];
  return proposal === undefined || (
    isRecord(proposal) &&
    typeof proposal['id'] === 'string' &&
    proposal['epistemicType'] === 'self_report' &&
    proposal['dataClass'] === 'confidential' &&
    proposal['status'] === 'awaiting_user_confirmation'
  );
}

function isConfirmedMemory(payload: unknown): payload is ConfirmedMemory {
  if (!isRecord(payload)) return false;
  const assertion = payload['assertion'];
  const permissions = payload['permissions'];
  return (
    isRecord(assertion) &&
    typeof assertion['id'] === 'string' &&
    assertion['epistemicType'] === 'self_report' &&
    assertion['dataClass'] === 'confidential' &&
    isRecord(permissions) &&
    permissions['personalUnderstanding'] === true &&
    permissions['brandUsage'] === false &&
    permissions['publicUsage'] === false &&
    typeof payload['confirmedAt'] === 'string' &&
    (
      payload['persistence'] === 'memory' ||
      payload['persistence'] === 'postgres' ||
      payload['persistence'] === 'ephemeral'
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
