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

export type DraftChannel = 'linkedin' | 'instagram' | 'x' | 'youtube' | 'podcast' | 'newsletter' | 'blog';

export type DraftWorkspaceSnapshot = Readonly<{
  draftId: string;
  claimId: string;
  revision: number;
  strategyRevision: number;
  channel: DraftChannel;
  body: string;
  status: 'guard_failed' | 'awaiting_approval' | 'approved' | 'exported';
  guard: Readonly<{
    classification: 'green' | 'yellow' | 'red';
    mayRequestApproval: boolean;
    violations: readonly Readonly<{
      code: string;
      severity: 'yellow' | 'red';
      claimId: string;
      message: string;
    }>[];
  }>;
  source: Readonly<{
    proposalId: string;
    assertionId: string;
    statement: string;
    evidenceIds: readonly string[];
  }>;
  publicDraftingConsent: true;
  sourceAvailable: boolean;
  staleStrategy: boolean;
  approvedAt?: string;
  exportedAt?: string;
  updatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  outcome?: 'applied' | 'already_applied';
}>;

export type DraftExport = Readonly<{
  outcome: 'applied' | 'already_applied';
  filename: string;
  mimeType: string;
  content: string;
  draft: DraftWorkspaceSnapshot;
}>;

export type PreferenceDecision = 'applied' | 'rejected' | 'revoked';

export type FeedbackLearningSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  summary: Readonly<{
    recentEvents: number;
    proposed: number;
    applied: number;
  }>;
  recentEvents: readonly Readonly<{
    id: string;
    artifactType: string;
    artifactId: string;
    eventType: 'accepted' | 'rejected' | 'edited' | 'regret' | 'energy_report';
    signalKey?: string;
    signalValue?: unknown;
    occurredAt: string;
  }>[];
  preferences: readonly Readonly<{
    id: string;
    preferenceKey: string;
    proposedValue: unknown;
    evidenceEventIds: readonly string[];
    rationale: string;
    confidence: number;
    status: 'proposed' | 'applied' | 'rejected' | 'revoked';
    proposedAt: string;
    decidedAt?: string;
  }>[];
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
    evidenceIds: readonly string[];
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

export type AuditTrailSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  summary: Readonly<{
    total: number;
    approvals: number;
    dataRights: number;
    exports: number;
  }>;
  events: readonly Readonly<{
    id: string;
    eventType: string;
    resourceType: string;
    resourceId?: string;
    purpose?: string;
    decision?: string;
    metadata: Readonly<Record<string, unknown>>;
    occurredAt: string;
  }>[];
}>;

export type AccountDataExport = Readonly<{
  schemaVersion: 1;
  exportedAt: string;
  scope: 'owner_portable_data';
  consistency: 'best_effort_snapshot';
  data: Readonly<{
    workbench: WorkbenchSnapshot;
    strategy: StrategyContextSnapshot;
    memory: PersonalMemorySnapshot;
    draft: DraftWorkspaceSnapshot | null;
    feedback: FeedbackLearningSnapshot;
    activity: AuditTrailSnapshot;
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

export async function loadDraftWorkspace(signal?: AbortSignal): Promise<DraftWorkspaceSnapshot | null> {
  const payload = await requestJson('/api/drafts/current', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (payload === null) return null;
  if (!isDraftWorkspaceSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function createDraft(input: Readonly<{
  requestId: string;
  sourceProposalId: string;
  channel: DraftChannel;
  narrativeAngle: string;
  takeaway: string;
  publicDraftingConsent: boolean;
}>): Promise<DraftWorkspaceSnapshot> {
  return requestDraft('/api/drafts', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function editDraft(input: Readonly<{
  draftId: string;
  requestId: string;
  expectedRevision: number;
  body: string;
}>): Promise<DraftWorkspaceSnapshot> {
  return requestDraft(`/api/drafts/${encodeURIComponent(input.draftId)}`, {
    method: 'PUT',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      requestId: input.requestId,
      expectedRevision: input.expectedRevision,
      body: input.body,
    }),
  });
}

export async function approveDraft(input: Readonly<{
  draftId: string;
  requestId: string;
  expectedRevision: number;
}>): Promise<DraftWorkspaceSnapshot> {
  return requestDraft(`/api/drafts/${encodeURIComponent(input.draftId)}/approve`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: input.requestId, expectedRevision: input.expectedRevision }),
  });
}

export async function exportDraft(input: Readonly<{
  draftId: string;
  requestId: string;
  expectedRevision: number;
}>): Promise<DraftExport> {
  const payload = await requestJson(`/api/drafts/${encodeURIComponent(input.draftId)}/export`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: input.requestId, expectedRevision: input.expectedRevision }),
  });
  if (!isRecord(payload) || !isDraftWorkspaceSnapshot(payload['draft']) ||
      typeof payload['filename'] !== 'string' || typeof payload['mimeType'] !== 'string' ||
      typeof payload['content'] !== 'string' ||
      (payload['outcome'] !== 'applied' && payload['outcome'] !== 'already_applied')) {
    throw new WorkbenchApiError(200, 'invalid_response');
  }
  return payload as DraftExport;
}

export async function loadFeedbackLearning(signal?: AbortSignal): Promise<FeedbackLearningSnapshot> {
  const payload = await requestJson('/api/feedback', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isFeedbackLearningSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function loadAuditTrail(signal?: AbortSignal): Promise<AuditTrailSnapshot> {
  const payload = await requestJson('/api/account/activity', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isAuditTrailSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function exportAccountData(): Promise<AccountDataExport> {
  const payload = await requestJson('/api/account/export', {
    headers: { accept: 'application/json' },
  });
  if (!isAccountDataExport(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function rejectDraftFeedback(input: Readonly<{
  draftId: string;
  requestId: string;
  reason: string;
}>): Promise<FeedbackLearningSnapshot> {
  const payload = await requestJson(`/api/feedback/drafts/${encodeURIComponent(input.draftId)}/reject`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: input.requestId, reason: input.reason }),
  });
  if (!isFeedbackLearningSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function decideLearnedPreference(input: Readonly<{
  proposalId: string;
  requestId: string;
  decision: PreferenceDecision;
}>): Promise<FeedbackLearningSnapshot> {
  const payload = await requestJson(`/api/feedback/preferences/${encodeURIComponent(input.proposalId)}/decision`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: input.requestId, decision: input.decision }),
  });
  if (!isFeedbackLearningSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
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

async function requestDraft(url: string, init: RequestInit): Promise<DraftWorkspaceSnapshot> {
  const payload = await requestJson(url, init);
  if (!isDraftWorkspaceSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
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

function isDraftWorkspaceSnapshot(payload: unknown): payload is DraftWorkspaceSnapshot {
  if (!isRecord(payload) || !isRecord(payload['guard']) || !isRecord(payload['source'])) return false;
  const guard = payload['guard'];
  const source = payload['source'];
  return (
    typeof payload['draftId'] === 'string' && typeof payload['claimId'] === 'string' &&
    typeof payload['revision'] === 'number' && typeof payload['strategyRevision'] === 'number' &&
    typeof payload['channel'] === 'string' && typeof payload['body'] === 'string' &&
    typeof payload['status'] === 'string' &&
    (guard['classification'] === 'green' || guard['classification'] === 'yellow' || guard['classification'] === 'red') &&
    typeof guard['mayRequestApproval'] === 'boolean' && Array.isArray(guard['violations']) &&
    typeof source['proposalId'] === 'string' && typeof source['assertionId'] === 'string' &&
    typeof source['statement'] === 'string' && Array.isArray(source['evidenceIds']) &&
    payload['publicDraftingConsent'] === true && typeof payload['sourceAvailable'] === 'boolean' &&
    typeof payload['staleStrategy'] === 'boolean' && typeof payload['updatedAt'] === 'string' &&
    (payload['persistence'] === 'memory' || payload['persistence'] === 'postgres' || payload['persistence'] === 'ephemeral')
  );
}

function isFeedbackLearningSnapshot(payload: unknown): payload is FeedbackLearningSnapshot {
  if (!isRecord(payload) || !isRecord(payload['summary']) ||
      !Array.isArray(payload['recentEvents']) || !Array.isArray(payload['preferences'])) return false;
  const summary = payload['summary'];
  return (
    typeof payload['generatedAt'] === 'string' &&
    (payload['persistence'] === 'memory' || payload['persistence'] === 'postgres' || payload['persistence'] === 'ephemeral') &&
    typeof summary['recentEvents'] === 'number' && typeof summary['proposed'] === 'number' &&
    typeof summary['applied'] === 'number' &&
    payload['recentEvents'].every((event) => isRecord(event) && typeof event['id'] === 'string' &&
      typeof event['artifactId'] === 'string' && typeof event['eventType'] === 'string' && typeof event['occurredAt'] === 'string') &&
    payload['preferences'].every((preference) => isRecord(preference) && typeof preference['id'] === 'string' &&
      typeof preference['preferenceKey'] === 'string' && Array.isArray(preference['evidenceEventIds']) &&
      typeof preference['rationale'] === 'string' && typeof preference['confidence'] === 'number' &&
      typeof preference['status'] === 'string' && typeof preference['proposedAt'] === 'string')
  );
}

function isAuditTrailSnapshot(payload: unknown): payload is AuditTrailSnapshot {
  if (!isRecord(payload) || !isRecord(payload['summary']) || !Array.isArray(payload['events'])) {
    return false;
  }
  const summary = payload['summary'];
  return (
    typeof payload['generatedAt'] === 'string' &&
    (payload['persistence'] === 'memory' || payload['persistence'] === 'postgres' || payload['persistence'] === 'ephemeral') &&
    typeof summary['total'] === 'number' && typeof summary['approvals'] === 'number' &&
    typeof summary['dataRights'] === 'number' && typeof summary['exports'] === 'number' &&
    payload['events'].every((event) => isRecord(event) && typeof event['id'] === 'string' &&
      typeof event['eventType'] === 'string' && typeof event['resourceType'] === 'string' &&
      isRecord(event['metadata']) && typeof event['occurredAt'] === 'string')
  );
}

function isAccountDataExport(payload: unknown): payload is AccountDataExport {
  if (!isRecord(payload) || !isRecord(payload['data'])) return false;
  const data = payload['data'];
  return (
    payload['schemaVersion'] === 1 && payload['scope'] === 'owner_portable_data' &&
    payload['consistency'] === 'best_effort_snapshot' && typeof payload['exportedAt'] === 'string' &&
    isWorkbenchSnapshot(data['workbench']) && isStrategyContextSnapshot(data['strategy']) &&
    isPersonalMemorySnapshot(data['memory']) &&
    (data['draft'] === null || isDraftWorkspaceSnapshot(data['draft'])) &&
    isFeedbackLearningSnapshot(data['feedback']) && isAuditTrailSnapshot(data['activity'])
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
    Array.isArray(value['provenance']['evidenceIds']) &&
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
