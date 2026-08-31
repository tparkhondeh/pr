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
    revision: number;
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

export type EditableStrategyContext = Readonly<{
  goal: Readonly<{
    title: string;
    outcome: string;
    priority: 1 | 2 | 3 | 4 | 5;
    successMetrics: readonly string[];
    horizon: string;
  }>;
  desiredPositioning: Readonly<{
    audience: string;
    desiredPerception: string;
    differentiation: string;
    proofPoints: readonly string[];
    horizon: string;
  }>;
}>;

export type StrategyContextSnapshot = EditableStrategyContext & Readonly<{
  revision: number;
  updatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  goalId: string;
  positioningId: string;
  outcome?: 'saved' | 'already_saved';
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

export type MemoryRightKind = 'correct' | 'contest' | 'delete' | 'revoke';

export type AppliedMemoryRight = Readonly<{
  outcome: 'applied' | 'already_applied';
  operation: MemoryRightKind;
  proposalId: string;
  requestId: string;
  activeAssertionId?: string;
  permissionsRevoked: boolean;
  occurredAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
}>;

export type PersonalMemoryRecord = Readonly<{
  proposalId: string;
  assertionId: string;
  text: string | null;
  epistemicType: 'self_report';
  dataClass: 'confidential';
  confidence: number;
  confidenceRationale: string;
  provenance: Readonly<{
    evidenceCount: number;
    sourceTypes: readonly string[];
  }>;
  consent: Readonly<{
    personalUnderstanding: boolean;
    brandUsage: boolean;
    publicUsage: boolean;
  }>;
  lifecycle: Readonly<{
    status: 'active' | 'contested' | 'consent_revoked' | 'deleted';
    revisionCount: number;
    confirmedAt: string;
    updatedAt: string;
    contestedAt?: string;
    contestReason?: string;
    revokedAt?: string;
    deletedAt?: string;
    deletionReason?: string;
  }>;
}>;

export type PersonalMemorySnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  summary: Readonly<{
    total: number;
    active: number;
    attentionRequired: number;
    deleted: number;
  }>;
  records: readonly PersonalMemoryRecord[];
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

export async function loadPersonalMemory(signal?: AbortSignal): Promise<PersonalMemorySnapshot> {
  const payload = await requestJson('/api/memory', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isPersonalMemorySnapshot(payload)) {
    throw new WorkbenchApiError(200, 'invalid_response');
  }
  return payload;
}

export async function loadStrategyContext(signal?: AbortSignal): Promise<StrategyContextSnapshot> {
  const payload = await requestJson('/api/strategy', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isStrategyContextSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function saveStrategyContext(input: Readonly<{
  requestId: string;
  expectedRevision: number;
  value: EditableStrategyContext;
}>): Promise<StrategyContextSnapshot> {
  const payload = await requestJson('/api/strategy', {
    method: 'PUT',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!isStrategyContextSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
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

export async function applyMemoryRight(
  proposalId: string,
  input: Readonly<{
    requestId: string;
    operation: MemoryRightKind;
    reason: string;
    correctedText?: string;
  }>,
): Promise<AppliedMemoryRight> {
  const payload = await requestJson(
    `/api/memory/proposals/${encodeURIComponent(proposalId)}/rights`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );
  if (!isAppliedMemoryRight(payload)) {
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

function isStrategyContextSnapshot(payload: unknown): payload is StrategyContextSnapshot {
  if (!isRecord(payload) || !isRecord(payload['goal']) || !isRecord(payload['desiredPositioning'])) {
    return false;
  }
  const goal = payload['goal'];
  const positioning = payload['desiredPositioning'];
  return (
    typeof payload['revision'] === 'number' &&
    typeof payload['updatedAt'] === 'string' &&
    (payload['persistence'] === 'memory' || payload['persistence'] === 'postgres' || payload['persistence'] === 'ephemeral') &&
    typeof payload['goalId'] === 'string' &&
    typeof payload['positioningId'] === 'string' &&
    typeof goal['title'] === 'string' &&
    typeof goal['outcome'] === 'string' &&
    typeof goal['priority'] === 'number' &&
    Array.isArray(goal['successMetrics']) && goal['successMetrics'].every((item) => typeof item === 'string') &&
    typeof goal['horizon'] === 'string' &&
    typeof positioning['audience'] === 'string' &&
    typeof positioning['desiredPerception'] === 'string' &&
    typeof positioning['differentiation'] === 'string' &&
    Array.isArray(positioning['proofPoints']) && positioning['proofPoints'].every((item) => typeof item === 'string') &&
    typeof positioning['horizon'] === 'string'
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

function isAppliedMemoryRight(payload: unknown): payload is AppliedMemoryRight {
  if (!isRecord(payload)) return false;
  return (
    (payload['outcome'] === 'applied' || payload['outcome'] === 'already_applied') &&
    (
      payload['operation'] === 'correct' ||
      payload['operation'] === 'contest' ||
      payload['operation'] === 'delete' ||
      payload['operation'] === 'revoke'
    ) &&
    typeof payload['proposalId'] === 'string' &&
    typeof payload['requestId'] === 'string' &&
    typeof payload['permissionsRevoked'] === 'boolean' &&
    typeof payload['occurredAt'] === 'string' &&
    (
      payload['persistence'] === 'memory' ||
      payload['persistence'] === 'postgres' ||
      payload['persistence'] === 'ephemeral'
    )
  );
}

function isPersonalMemorySnapshot(payload: unknown): payload is PersonalMemorySnapshot {
  if (!isRecord(payload) || !Array.isArray(payload['records']) || !isRecord(payload['summary'])) {
    return false;
  }
  return (
    typeof payload['generatedAt'] === 'string' &&
    (
      payload['persistence'] === 'memory' ||
      payload['persistence'] === 'postgres' ||
      payload['persistence'] === 'ephemeral'
    ) &&
    typeof payload['summary']['total'] === 'number' &&
    payload['records'].every(isPersonalMemoryRecord)
  );
}

function isPersonalMemoryRecord(value: unknown): value is PersonalMemoryRecord {
  if (!isRecord(value) || !isRecord(value['provenance']) || !isRecord(value['consent']) || !isRecord(value['lifecycle'])) {
    return false;
  }
  return (
    typeof value['proposalId'] === 'string' &&
    typeof value['assertionId'] === 'string' &&
    (typeof value['text'] === 'string' || value['text'] === null) &&
    value['epistemicType'] === 'self_report' &&
    value['dataClass'] === 'confidential' &&
    typeof value['confidence'] === 'number' &&
    typeof value['provenance']['evidenceCount'] === 'number' &&
    Array.isArray(value['provenance']['sourceTypes']) &&
    typeof value['consent']['personalUnderstanding'] === 'boolean' &&
    (
      value['lifecycle']['status'] === 'active' ||
      value['lifecycle']['status'] === 'contested' ||
      value['lifecycle']['status'] === 'consent_revoked' ||
      value['lifecycle']['status'] === 'deleted'
    ) &&
    typeof value['lifecycle']['revisionCount'] === 'number' &&
    typeof value['lifecycle']['updatedAt'] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
