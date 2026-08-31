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
  evidenceIds: readonly string[];
  evidenceCount: number;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  attentionCostMinutes: number;
  energyCost: 1 | 2 | 3 | 4 | 5;
  feasible: boolean;
  utilityScore: number | null;
  opportunityCost: number | null;
  rank: number;
  evidenceState: 'insufficient' | 'grounded';
  evidenceSourceTypes: readonly string[];
  interaction: 'approve' | 'open_intake' | 'open_conversation';
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
  evidence: Readonly<{
    state: 'insufficient' | 'grounded';
    strategyEvidenceCount: number;
    withheldEvidenceCount: number;
    sourceTypes: readonly string[];
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
    approvedEvidenceIds?: readonly string[];
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

export type ResearchSourceQuality = 'primary' | 'authoritative_secondary' | 'secondary' | 'unverified';
export type ResearchSourceStance = 'supports' | 'contradicts';

export type ResearchSourceRecord = Readonly<{
  sourceId: string;
  claimId: string;
  evidenceId: string;
  requestId: string;
  title: string;
  publisher: string;
  url: string;
  excerpt: string;
  statement: string;
  quality: ResearchSourceQuality;
  stance: ResearchSourceStance;
  publishedAt: string;
  accessedAt: string;
  maxAgeDays: number;
}>;

export type ResearchSource = ResearchSourceRecord & Readonly<{
  qualityScore: number;
  freshness: 'fresh' | 'aging' | 'stale';
  ageDays: number;
  factCheckStatus: 'citation_ready' | 'review_required' | 'contradicted' | 'conflicted';
  conflictDetected: boolean;
  citation: string;
  usableForPublicClaim: boolean;
}>;

export type ResearchImportResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  persistence: 'memory' | 'postgres' | 'ephemeral';
  record: ResearchSourceRecord;
}>;

export type ResearchWorkspaceSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  summary: Readonly<{
    totalSources: number;
    citationReady: number;
    stale: number;
    conflicts: number;
    unverified: number;
  }>;
  sources: readonly ResearchSource[];
}>;

export type ClaimStatus = 'proposed' | 'verified' | 'disputed' | 'expired' | 'revoked';
export type ClaimReviewDecision = 'verify' | 'dispute' | 'revoke';
export type ClaimTraceStatus = 'complete' | 'incomplete' | 'stale' | 'unverified_source' | 'contradicted' | 'conflicted';
export type ClaimTraceCategory = 'company' | 'revenue' | 'experience' | 'education' | 'numeric' | 'award' | 'third_party' | 'research' | 'general';

export type ClaimReviewRecord = Readonly<{
  reviewId: string;
  requestId: string;
  claimId: string;
  decision: ClaimReviewDecision;
  previousStatus: ClaimStatus;
  resultingStatus: ClaimStatus;
  rationale: string;
  traceSnapshot: Readonly<Record<string, unknown>>;
  reviewedAt: string;
}>;

export type GovernedClaim = Readonly<{
  claimId: string;
  statement: string;
  kind: 'personal_fact' | 'external_fact' | 'opinion' | 'projection';
  status: ClaimStatus;
  dataClass: 'public' | 'internal' | 'confidential' | 'restricted';
  evidenceIds: readonly string[];
  sourceRefs: readonly string[];
  allowedPurposes: readonly string[];
  allowedChannels: readonly string[];
  validFrom: string;
  validUntil?: string;
  createdAt: string;
  categories: readonly ClaimTraceCategory[];
  traceStatus: ClaimTraceStatus;
  traceRationale: string;
  riskLevel: 'green' | 'yellow' | 'red';
  canUsePublicly: boolean;
  reviewableDecisions: readonly ClaimReviewDecision[];
  research?: Readonly<{
    sourceId: string;
    title: string;
    publisher: string;
    url: string;
    quality: ResearchSourceQuality;
    stance: ResearchSourceStance;
    publishedAt: string;
    accessedAt: string;
    maxAgeDays: number;
  }>;
  lastReview?: ClaimReviewRecord;
}>;

export type ClaimGovernanceSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  summary: Readonly<{
    totalClaims: number;
    verified: number;
    proposed: number;
    disputedOrRevoked: number;
    traceBlocked: number;
    publicReady: number;
  }>;
  claims: readonly GovernedClaim[];
}>;

export type ClaimReviewResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  persistence: 'memory' | 'postgres' | 'ephemeral';
  review: ClaimReviewRecord;
}>;

export type RiskLevel = 'green' | 'yellow' | 'red';
export type RiskReviewDecision = 'acknowledge' | 'hold' | 'escalate';
export type RiskDimension = 'consent' | 'privacy' | 'data_access' | 'sensitive_data' |
  'third_party_privacy' | 'reputation_risk' | 'misinterpretation' | 'manipulation' |
  'defamation' | 'conflict_of_interest' | 'disclosure' | 'authenticity' | 'security' |
  'public_exposure' | 'long_term_consequences';

export type RiskReviewRecord = Readonly<{
  reviewId: string;
  requestId: string;
  actionId: string;
  assessmentHash: string;
  expectedLevel: RiskLevel;
  decision: RiskReviewDecision;
  rationale: string;
  reviewedAt: string;
}>;

export type ActionRiskAssessment = Readonly<{
  actionId: string;
  actionTitle: string;
  actionKind: WorkbenchAction['kind'];
  policyVersion: 'brand-protection-v1';
  assessmentHash: string;
  level: RiskLevel;
  gate: 'allowed' | 'review_required' | 'allowed_with_acknowledgement' | 'blocked';
  rationale: string;
  findings: readonly Readonly<{
    dimension: RiskDimension;
    level: RiskLevel;
    code: string;
    rationale: string;
    mitigation: string;
  }>[];
  reviewableDecisions: readonly RiskReviewDecision[];
  lastReview?: RiskReviewRecord;
}>;

export type BrandProtectionSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  policyVersion: 'brand-protection-v1';
  summary: Readonly<{
    totalActions: number;
    green: number;
    yellow: number;
    red: number;
    reviewRequired: number;
    blocked: number;
  }>;
  claimPosture: Readonly<{
    totalClaims: number;
    verified: number;
    traceBlocked: number;
    publicReady: number;
    note: string;
  }>;
  assessments: readonly ActionRiskAssessment[];
}>;

export type RiskReviewResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  persistence: 'memory' | 'postgres' | 'ephemeral';
  review: RiskReviewRecord;
}>;

export type DraftChannel = 'linkedin' | 'instagram' | 'x' | 'youtube' | 'podcast' | 'newsletter' | 'blog';
export type DraftSourceKind = 'memory' | 'text_asset';

export type DraftSourceRecord = Readonly<{
  kind: DraftSourceKind;
  ref: string;
  label: string;
  assertionId: string;
  statement: string;
  evidenceIds: readonly string[];
  sourceTypes: readonly string[];
}>;

export type DraftSourceSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'mixed' | 'ephemeral';
  records: readonly DraftSourceRecord[];
}>;

export type DraftWorkspaceSnapshot = Readonly<{
  draftId: string;
  claimId: string;
  revision: number;
  strategyRevision: number;
  channel: DraftChannel;
  body: string;
  adaptation: Readonly<{
    version: 'platform-adaptation-v1';
    audienceContext: string;
    format: string;
    recommendedCharacters: Readonly<{ min: number; max: number }>;
    hardMaximumCharacters: number;
    currentCharacters: number;
    visualLanguage: string;
    interactionModel: string;
    requiredElements: readonly string[];
  }>;
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
  source: DraftSourceRecord;
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

export type ConversationTargetView = 'today' | 'memory' | 'strategy' | 'research' | 'draft' | 'risk' | 'data';

export type ConversationOrchestration = Readonly<{
  policyVersion: 'conversation-orchestrator-v1';
  intent: Readonly<{
    kind: 'reflect' | 'remember' | 'correct_memory' | 'set_strategy' | 'assess_action' |
      'research_external' | 'draft_content' | 'data_control' | 'unclear';
    confidence: number;
    rationale: string;
  }>;
  route: Readonly<{
    module: 'conversation' | 'memory' | 'strategy' | 'research' | 'draft' | 'risk' | 'data';
    mode: 'clarify' | 'analyze' | 'propose' | 'hold';
    targetView: ConversationTargetView;
    readAuthority: 'none' | 'owner_scoped';
    writeAuthority: 'none' | 'propose_only';
    requiresUserApproval: boolean;
  }>;
  provenance: Readonly<{
    sources: readonly Readonly<{
      kind: 'current_turn'; ref: string; trust: 'untrusted_user_input';
    }>[];
    personalMemoryUsed: false;
    externalResearchUsed: false;
  }>;
  safety: Readonly<{
    sensitiveDataDetected: boolean;
    promptInjectionDetected: boolean;
    publicActionRequested: boolean;
    memoryProposalAllowed: boolean;
  }>;
  arbitration: Readonly<{
    outcome: 'routed' | 'clarification_required' | 'approval_required' | 'held';
    rationale: string;
    appliedRules: readonly string[];
  }>;
  retention: Readonly<{
    turn: 'confidential' | 'not_persisted';
    rationale: string;
  }>;
  recommendedAction: Readonly<{
    kind: 'open_view' | 'clarify' | 'review_sensitive_input';
    label: string;
    targetView: ConversationTargetView;
  }>;
}>;

export type ConversationTurnResult = Readonly<{
  assistantMessage: string;
  followUpQuestion: string;
  orchestration: ConversationOrchestration;
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

export type TextAssetRecord = Readonly<{
  requestId: string;
  assetId: string;
  evidenceId: string;
  assertionId: string;
  title: string;
  content: string;
  assertionText: string;
  sourceType: 'text_asset';
  dataClass: 'confidential';
  integritySha256: string;
  occurredAt: string;
  importedAt: string;
  permissions: Readonly<{
    personalUnderstanding: true;
    brandUsage: boolean;
  }>;
}>;

export type TextAssetSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  summary: Readonly<{ assets: number; evidenceItems: number; assertions: number; dataRights: number }>;
  records: readonly TextAssetRecord[];
}>;

export type OnboardingSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral' | 'mixed';
  modelMaturity: Readonly<{
    percent: number;
    evidenceCount: number;
    sourceTypes: readonly string[];
    components: Readonly<{
      importedEvidence: number;
      confirmedSelfReports: number;
      sourceDiversity: number;
      exercisedDataControl: number;
    }>;
    nextStep: string;
  }>;
  strategyReadiness: Readonly<{
    ready: boolean;
    evidenceCount: number;
    withheldEvidenceCount: number;
    sourceTypes: readonly string[];
  }>;
  assets: TextAssetSnapshot;
}>;

export type TextAssetImportResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  persistence: 'memory' | 'postgres' | 'ephemeral';
  record: TextAssetRecord;
}>;

export type TextAssetRightOperation = 'revoke_brand_usage' | 'delete';

export type TextAssetRightResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  assetId: string;
  operation: TextAssetRightOperation;
  brandUsage: false;
  deleted: boolean;
  occurredAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
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
    assets: TextAssetSnapshot;
    research: ResearchWorkspaceSnapshot | null;
    claims: ClaimGovernanceSnapshot | null;
    risk: BrandProtectionSnapshot | null;
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

export async function loadOnboarding(signal?: AbortSignal): Promise<OnboardingSnapshot> {
  const payload = await requestJson('/api/onboarding', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isOnboardingSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function loadResearch(signal?: AbortSignal): Promise<ResearchWorkspaceSnapshot> {
  const payload = await requestJson('/api/research', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isResearchWorkspaceSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function importResearchSource(input: Readonly<{
  requestId: string;
  title: string;
  publisher: string;
  url: string;
  excerpt: string;
  statement: string;
  quality: ResearchSourceQuality;
  stance: ResearchSourceStance;
  publishedAt: string;
  maxAgeDays: number;
}>): Promise<ResearchImportResult> {
  const payload = await requestJson('/api/research/sources', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (
    !isRecord(payload) ||
    (payload['outcome'] !== 'applied' && payload['outcome'] !== 'already_applied') ||
    !isPersistence(payload['persistence']) || !isResearchSourceRecord(payload['record'])
  ) {
    throw new WorkbenchApiError(200, 'invalid_response');
  }
  return payload as ResearchImportResult;
}

export async function loadClaims(signal?: AbortSignal): Promise<ClaimGovernanceSnapshot> {
  const payload = await requestJson('/api/claims', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isClaimGovernanceSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function reviewClaim(input: Readonly<{
  claimId: string;
  requestId: string;
  expectedStatus: ClaimStatus;
  decision: ClaimReviewDecision;
  rationale: string;
  humanAttestation: boolean;
}>): Promise<ClaimReviewResult> {
  const payload = await requestJson(`/api/claims/${encodeURIComponent(input.claimId)}/reviews`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      requestId: input.requestId,
      expectedStatus: input.expectedStatus,
      decision: input.decision,
      rationale: input.rationale,
      humanAttestation: input.humanAttestation,
    }),
  });
  if (
    !isRecord(payload) ||
    (payload['outcome'] !== 'applied' && payload['outcome'] !== 'already_applied') ||
    !isPersistence(payload['persistence']) || !isClaimReviewRecord(payload['review'])
  ) throw new WorkbenchApiError(200, 'invalid_response');
  return payload as ClaimReviewResult;
}

export async function loadRisk(signal?: AbortSignal): Promise<BrandProtectionSnapshot> {
  const payload = await requestJson('/api/risk', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isBrandProtectionSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function reviewRisk(input: Readonly<{
  actionId: string;
  requestId: string;
  expectedLevel: RiskLevel;
  expectedAssessmentHash: string;
  decision: RiskReviewDecision;
  rationale: string;
  humanAttestation: boolean;
}>): Promise<RiskReviewResult> {
  const payload = await requestJson(`/api/risk/actions/${encodeURIComponent(input.actionId)}/reviews`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (
    !isRecord(payload) ||
    (payload['outcome'] !== 'applied' && payload['outcome'] !== 'already_applied') ||
    !isPersistence(payload['persistence']) || !isRiskReviewRecord(payload['review'])
  ) throw new WorkbenchApiError(200, 'invalid_response');
  return payload as RiskReviewResult;
}

export async function importTextAsset(input: Readonly<{
  requestId: string;
  title: string;
  content: string;
  assertionText: string;
  occurredAt: string;
  permissions: Readonly<{ personalUnderstanding: true; brandUsage: boolean }>;
}>): Promise<TextAssetImportResult> {
  const payload = await requestJson('/api/assets/text', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (
    !isRecord(payload) ||
    (payload['outcome'] !== 'applied' && payload['outcome'] !== 'already_applied') ||
    !isPersistence(payload['persistence']) ||
    !isTextAssetRecord(payload['record'])
  ) {
    throw new WorkbenchApiError(200, 'invalid_response');
  }
  return payload as TextAssetImportResult;
}

export async function applyTextAssetRight(input: Readonly<{
  requestId: string;
  assetId: string;
  operation: TextAssetRightOperation;
  reason: string;
}>): Promise<TextAssetRightResult> {
  const payload = await requestJson(`/api/assets/text/${encodeURIComponent(input.assetId)}/rights`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      requestId: input.requestId,
      operation: input.operation,
      reason: input.reason,
    }),
  });
  if (
    !isRecord(payload) ||
    (payload['outcome'] !== 'applied' && payload['outcome'] !== 'already_applied') ||
    typeof payload['assetId'] !== 'string' ||
    (payload['operation'] !== 'revoke_brand_usage' && payload['operation'] !== 'delete') ||
    payload['brandUsage'] !== false || typeof payload['deleted'] !== 'boolean' ||
    typeof payload['occurredAt'] !== 'string' || !isPersistence(payload['persistence'])
  ) {
    throw new WorkbenchApiError(200, 'invalid_response');
  }
  return payload as TextAssetRightResult;
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

export async function loadDraftSources(signal?: AbortSignal): Promise<DraftSourceSnapshot> {
  const payload = await requestJson('/api/drafts/sources', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isDraftSourceSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function createDraft(input: Readonly<{
  requestId: string;
  sourceKind: DraftSourceKind;
  sourceRef: string;
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

export async function confirmMemoryProposal(
  proposalId: string,
  brandUsage: boolean,
): Promise<ConfirmedMemory> {
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
          brandUsage,
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
  const evidence = payload['evidence'];
  return (
    Array.isArray(actions) &&
    actions.length >= 3 &&
    isRecord(goal) &&
    typeof goal['title'] === 'string' &&
    isRecord(workflow) &&
    typeof workflow['status'] === 'string' &&
    (
      workflow['approvedEvidenceIds'] === undefined ||
      (
        Array.isArray(workflow['approvedEvidenceIds']) &&
        workflow['approvedEvidenceIds'].every((id) => typeof id === 'string')
      )
    ) &&
    isRecord(runtime) &&
    typeof runtime['source'] === 'string' &&
    isRecord(evidence) &&
    (evidence['state'] === 'insufficient' || evidence['state'] === 'grounded') &&
    typeof evidence['strategyEvidenceCount'] === 'number' &&
    typeof evidence['withheldEvidenceCount'] === 'number' &&
    Array.isArray(evidence['sourceTypes']) &&
    actions.every(isWorkbenchAction)
  );
}

function isWorkbenchAction(value: unknown): value is WorkbenchAction {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' && typeof value['title'] === 'string' &&
    typeof value['rationale'] === 'string' && typeof value['evidenceCount'] === 'number' &&
    Array.isArray(value['evidenceIds']) &&
    value['evidenceIds'].every((evidence) => typeof evidence === 'string') &&
    (value['evidenceState'] === 'insufficient' || value['evidenceState'] === 'grounded') &&
    Array.isArray(value['evidenceSourceTypes']) &&
    (
      value['interaction'] === 'approve' || value['interaction'] === 'open_intake' ||
      value['interaction'] === 'open_conversation'
    )
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

function isResearchWorkspaceSnapshot(payload: unknown): payload is ResearchWorkspaceSnapshot {
  if (!isRecord(payload) || !isRecord(payload['summary']) || !Array.isArray(payload['sources'])) return false;
  const summary = payload['summary'];
  return (
    typeof payload['generatedAt'] === 'string' && isPersistence(payload['persistence']) &&
    typeof summary['totalSources'] === 'number' && typeof summary['citationReady'] === 'number' &&
    typeof summary['stale'] === 'number' && typeof summary['conflicts'] === 'number' &&
    typeof summary['unverified'] === 'number' && payload['sources'].every(isResearchSource)
  );
}

function isResearchSource(value: unknown): value is ResearchSource {
  if (!isResearchSourceRecord(value)) return false;
  const source = value as ResearchSourceRecord & Record<string, unknown>;
  return (
    typeof source['qualityScore'] === 'number' &&
    (source['freshness'] === 'fresh' || source['freshness'] === 'aging' || source['freshness'] === 'stale') &&
    typeof source['ageDays'] === 'number' &&
    (
      source['factCheckStatus'] === 'citation_ready' || source['factCheckStatus'] === 'review_required' ||
      source['factCheckStatus'] === 'contradicted' || source['factCheckStatus'] === 'conflicted'
    ) &&
    typeof source['conflictDetected'] === 'boolean' && typeof source['citation'] === 'string' &&
    typeof source['usableForPublicClaim'] === 'boolean'
  );
}

function isResearchSourceRecord(value: unknown): value is ResearchSourceRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value['sourceId'] === 'string' && typeof value['claimId'] === 'string' &&
    typeof value['evidenceId'] === 'string' && typeof value['requestId'] === 'string' &&
    typeof value['title'] === 'string' && typeof value['publisher'] === 'string' &&
    typeof value['url'] === 'string' && typeof value['excerpt'] === 'string' &&
    typeof value['statement'] === 'string' &&
    (
      value['quality'] === 'primary' || value['quality'] === 'authoritative_secondary' ||
      value['quality'] === 'secondary' || value['quality'] === 'unverified'
    ) &&
    (value['stance'] === 'supports' || value['stance'] === 'contradicts') &&
    typeof value['publishedAt'] === 'string' && typeof value['accessedAt'] === 'string' &&
    typeof value['maxAgeDays'] === 'number'
  );
}

function isClaimGovernanceSnapshot(payload: unknown): payload is ClaimGovernanceSnapshot {
  if (!isRecord(payload) || !isRecord(payload['summary']) || !Array.isArray(payload['claims'])) return false;
  const summary = payload['summary'];
  return (
    typeof payload['generatedAt'] === 'string' && isPersistence(payload['persistence']) &&
    typeof summary['totalClaims'] === 'number' && typeof summary['verified'] === 'number' &&
    typeof summary['proposed'] === 'number' && typeof summary['disputedOrRevoked'] === 'number' &&
    typeof summary['traceBlocked'] === 'number' && typeof summary['publicReady'] === 'number' &&
    payload['claims'].every(isGovernedClaim)
  );
}

function isGovernedClaim(value: unknown): value is GovernedClaim {
  if (!isRecord(value)) return false;
  return (
    typeof value['claimId'] === 'string' && typeof value['statement'] === 'string' &&
    isClaimStatus(value['status']) &&
    (value['kind'] === 'personal_fact' || value['kind'] === 'external_fact' ||
      value['kind'] === 'opinion' || value['kind'] === 'projection') &&
    typeof value['dataClass'] === 'string' && Array.isArray(value['evidenceIds']) &&
    value['evidenceIds'].every((item) => typeof item === 'string') &&
    Array.isArray(value['sourceRefs']) && value['sourceRefs'].every((item) => typeof item === 'string') &&
    Array.isArray(value['allowedPurposes']) && Array.isArray(value['allowedChannels']) &&
    typeof value['validFrom'] === 'string' && typeof value['createdAt'] === 'string' &&
    Array.isArray(value['categories']) && value['categories'].every((item) => typeof item === 'string') &&
    isClaimTraceStatus(value['traceStatus']) && typeof value['traceRationale'] === 'string' &&
    (value['riskLevel'] === 'green' || value['riskLevel'] === 'yellow' || value['riskLevel'] === 'red') &&
    typeof value['canUsePublicly'] === 'boolean' && Array.isArray(value['reviewableDecisions']) &&
    value['reviewableDecisions'].every(isClaimDecision) &&
    (value['lastReview'] === undefined || isClaimReviewRecord(value['lastReview']))
  );
}

function isClaimReviewRecord(value: unknown): value is ClaimReviewRecord {
  return (
    isRecord(value) && typeof value['reviewId'] === 'string' && typeof value['requestId'] === 'string' &&
    typeof value['claimId'] === 'string' && isClaimDecision(value['decision']) &&
    isClaimStatus(value['previousStatus']) && isClaimStatus(value['resultingStatus']) &&
    typeof value['rationale'] === 'string' && isRecord(value['traceSnapshot']) &&
    typeof value['reviewedAt'] === 'string'
  );
}

function isClaimStatus(value: unknown): value is ClaimStatus {
  return value === 'proposed' || value === 'verified' || value === 'disputed' ||
    value === 'expired' || value === 'revoked';
}

function isClaimDecision(value: unknown): value is ClaimReviewDecision {
  return value === 'verify' || value === 'dispute' || value === 'revoke';
}

function isClaimTraceStatus(value: unknown): value is ClaimTraceStatus {
  return value === 'complete' || value === 'incomplete' || value === 'stale' ||
    value === 'unverified_source' || value === 'contradicted' || value === 'conflicted';
}

function isBrandProtectionSnapshot(payload: unknown): payload is BrandProtectionSnapshot {
  if (
    !isRecord(payload) || payload['policyVersion'] !== 'brand-protection-v1' ||
    !isRecord(payload['summary']) || !isRecord(payload['claimPosture']) ||
    !Array.isArray(payload['assessments'])
  ) return false;
  const summary = payload['summary'];
  const claims = payload['claimPosture'];
  return (
    typeof payload['generatedAt'] === 'string' && isPersistence(payload['persistence']) &&
    typeof summary['totalActions'] === 'number' && typeof summary['green'] === 'number' &&
    typeof summary['yellow'] === 'number' && typeof summary['red'] === 'number' &&
    typeof summary['reviewRequired'] === 'number' && typeof summary['blocked'] === 'number' &&
    typeof claims['totalClaims'] === 'number' && typeof claims['verified'] === 'number' &&
    typeof claims['traceBlocked'] === 'number' && typeof claims['publicReady'] === 'number' &&
    typeof claims['note'] === 'string' && payload['assessments'].every(isActionRiskAssessment)
  );
}

function isActionRiskAssessment(value: unknown): value is ActionRiskAssessment {
  return (
    isRecord(value) && typeof value['actionId'] === 'string' &&
    typeof value['actionTitle'] === 'string' && typeof value['actionKind'] === 'string' &&
    value['policyVersion'] === 'brand-protection-v1' &&
    typeof value['assessmentHash'] === 'string' && isRiskLevel(value['level']) &&
    (value['gate'] === 'allowed' || value['gate'] === 'review_required' ||
      value['gate'] === 'allowed_with_acknowledgement' || value['gate'] === 'blocked') &&
    typeof value['rationale'] === 'string' && Array.isArray(value['findings']) &&
    value['findings'].every(isRiskFinding) && Array.isArray(value['reviewableDecisions']) &&
    value['reviewableDecisions'].every(isRiskReviewDecision) &&
    (value['lastReview'] === undefined || isRiskReviewRecord(value['lastReview']))
  );
}

function isRiskFinding(value: unknown): boolean {
  return isRecord(value) && typeof value['dimension'] === 'string' &&
    isRiskLevel(value['level']) && typeof value['code'] === 'string' &&
    typeof value['rationale'] === 'string' && typeof value['mitigation'] === 'string';
}

function isRiskReviewRecord(value: unknown): value is RiskReviewRecord {
  return isRecord(value) && typeof value['reviewId'] === 'string' &&
    typeof value['requestId'] === 'string' && typeof value['actionId'] === 'string' &&
    typeof value['assessmentHash'] === 'string' && isRiskLevel(value['expectedLevel']) &&
    isRiskReviewDecision(value['decision']) && typeof value['rationale'] === 'string' &&
    typeof value['reviewedAt'] === 'string';
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === 'green' || value === 'yellow' || value === 'red';
}

function isRiskReviewDecision(value: unknown): value is RiskReviewDecision {
  return value === 'acknowledge' || value === 'hold' || value === 'escalate';
}

function isDraftWorkspaceSnapshot(payload: unknown): payload is DraftWorkspaceSnapshot {
  if (!isRecord(payload) || !isRecord(payload['guard']) || !isRecord(payload['source']) || !isRecord(payload['adaptation'])) return false;
  const guard = payload['guard'];
  const source = payload['source'];
  const adaptation = payload['adaptation'];
  const recommended = adaptation['recommendedCharacters'];
  return (
    typeof payload['draftId'] === 'string' && typeof payload['claimId'] === 'string' &&
    typeof payload['revision'] === 'number' && typeof payload['strategyRevision'] === 'number' &&
    typeof payload['channel'] === 'string' && typeof payload['body'] === 'string' &&
    adaptation['version'] === 'platform-adaptation-v1' &&
    typeof adaptation['audienceContext'] === 'string' && typeof adaptation['format'] === 'string' &&
    isRecord(recommended) && typeof recommended['min'] === 'number' && typeof recommended['max'] === 'number' &&
    typeof adaptation['hardMaximumCharacters'] === 'number' &&
    typeof adaptation['currentCharacters'] === 'number' &&
    typeof adaptation['visualLanguage'] === 'string' && typeof adaptation['interactionModel'] === 'string' &&
    Array.isArray(adaptation['requiredElements']) && adaptation['requiredElements'].every((item) => typeof item === 'string') &&
    typeof payload['status'] === 'string' &&
    (guard['classification'] === 'green' || guard['classification'] === 'yellow' || guard['classification'] === 'red') &&
    typeof guard['mayRequestApproval'] === 'boolean' && Array.isArray(guard['violations']) &&
    isDraftSourceRecord(source) &&
    payload['publicDraftingConsent'] === true && typeof payload['sourceAvailable'] === 'boolean' &&
    typeof payload['staleStrategy'] === 'boolean' && typeof payload['updatedAt'] === 'string' &&
    (payload['persistence'] === 'memory' || payload['persistence'] === 'postgres' || payload['persistence'] === 'ephemeral')
  );
}

function isDraftSourceSnapshot(payload: unknown): payload is DraftSourceSnapshot {
  return (
    isRecord(payload) && typeof payload['generatedAt'] === 'string' &&
    (
      payload['persistence'] === 'memory' || payload['persistence'] === 'postgres' ||
      payload['persistence'] === 'mixed' || payload['persistence'] === 'ephemeral'
    ) &&
    Array.isArray(payload['records']) && payload['records'].every(isDraftSourceRecord)
  );
}

function isDraftSourceRecord(value: unknown): value is DraftSourceRecord {
  return (
    isRecord(value) && (value['kind'] === 'memory' || value['kind'] === 'text_asset') &&
    typeof value['ref'] === 'string' && typeof value['label'] === 'string' &&
    typeof value['assertionId'] === 'string' && typeof value['statement'] === 'string' &&
    Array.isArray(value['evidenceIds']) && value['evidenceIds'].every((id) => typeof id === 'string') &&
    Array.isArray(value['sourceTypes']) && value['sourceTypes'].every((type) => typeof type === 'string')
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
    isPersonalMemorySnapshot(data['memory']) && isTextAssetSnapshot(data['assets']) &&
    (data['research'] === null || isResearchWorkspaceSnapshot(data['research'])) &&
    (data['claims'] === null || isClaimGovernanceSnapshot(data['claims'])) &&
    (data['risk'] === null || isBrandProtectionSnapshot(data['risk'])) &&
    (data['draft'] === null || isDraftWorkspaceSnapshot(data['draft'])) &&
    isFeedbackLearningSnapshot(data['feedback']) && isAuditTrailSnapshot(data['activity'])
  );
}

function isOnboardingSnapshot(payload: unknown): payload is OnboardingSnapshot {
  if (
    !isRecord(payload) || !isRecord(payload['modelMaturity']) ||
    !isRecord(payload['strategyReadiness'])
  ) return false;
  const maturity = payload['modelMaturity'];
  const readiness = payload['strategyReadiness'];
  return (
    typeof payload['generatedAt'] === 'string' &&
    (
      isPersistence(payload['persistence']) ||
      payload['persistence'] === 'mixed'
    ) &&
    typeof maturity['percent'] === 'number' &&
    typeof maturity['evidenceCount'] === 'number' &&
    Array.isArray(maturity['sourceTypes']) &&
    isRecord(maturity['components']) &&
    typeof maturity['nextStep'] === 'string' &&
    typeof readiness['ready'] === 'boolean' &&
    typeof readiness['evidenceCount'] === 'number' &&
    typeof readiness['withheldEvidenceCount'] === 'number' &&
    Array.isArray(readiness['sourceTypes']) &&
    isTextAssetSnapshot(payload['assets'])
  );
}

function isTextAssetSnapshot(payload: unknown): payload is TextAssetSnapshot {
  if (!isRecord(payload) || !isRecord(payload['summary']) || !Array.isArray(payload['records'])) {
    return false;
  }
  return (
    typeof payload['generatedAt'] === 'string' &&
    isPersistence(payload['persistence']) &&
    typeof payload['summary']['assets'] === 'number' &&
    typeof payload['summary']['evidenceItems'] === 'number' &&
    typeof payload['summary']['assertions'] === 'number' &&
    typeof payload['summary']['dataRights'] === 'number' &&
    payload['records'].every(isTextAssetRecord)
  );
}

function isTextAssetRecord(value: unknown): value is TextAssetRecord {
  if (!isRecord(value) || !isRecord(value['permissions'])) return false;
  return (
    typeof value['requestId'] === 'string' && typeof value['assetId'] === 'string' &&
    typeof value['evidenceId'] === 'string' && typeof value['assertionId'] === 'string' &&
    typeof value['title'] === 'string' && typeof value['content'] === 'string' &&
    typeof value['assertionText'] === 'string' && value['sourceType'] === 'text_asset' &&
    value['dataClass'] === 'confidential' && typeof value['integritySha256'] === 'string' &&
    typeof value['occurredAt'] === 'string' && typeof value['importedAt'] === 'string' &&
    value['permissions']['personalUnderstanding'] === true &&
    typeof value['permissions']['brandUsage'] === 'boolean'
  );
}

function isPersistence(value: unknown): value is 'memory' | 'postgres' | 'ephemeral' {
  return value === 'memory' || value === 'postgres' || value === 'ephemeral';
}

function isConversationTurnResult(payload: unknown): payload is ConversationTurnResult {
  if (!isRecord(payload)) return false;
  if (
    typeof payload['assistantMessage'] !== 'string' ||
    typeof payload['followUpQuestion'] !== 'string' ||
    !isConversationOrchestration(payload['orchestration'])
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

function isConversationOrchestration(payload: unknown): payload is ConversationOrchestration {
  if (!isRecord(payload)) return false;
  const intent = payload['intent'];
  const route = payload['route'];
  const provenance = payload['provenance'];
  const safety = payload['safety'];
  const arbitration = payload['arbitration'];
  const retention = payload['retention'];
  const action = payload['recommendedAction'];
  if (
    payload['policyVersion'] !== 'conversation-orchestrator-v1' ||
    !isRecord(intent) || typeof intent['kind'] !== 'string' ||
    typeof intent['confidence'] !== 'number' || typeof intent['rationale'] !== 'string' ||
    !isRecord(route) || typeof route['module'] !== 'string' ||
    typeof route['mode'] !== 'string' || !isConversationTargetView(route['targetView']) ||
    typeof route['readAuthority'] !== 'string' || typeof route['writeAuthority'] !== 'string' ||
    typeof route['requiresUserApproval'] !== 'boolean' ||
    !isRecord(provenance) || !Array.isArray(provenance['sources']) ||
    provenance['personalMemoryUsed'] !== false || provenance['externalResearchUsed'] !== false ||
    !provenance['sources'].every((source) => isRecord(source) && source['kind'] === 'current_turn' &&
      typeof source['ref'] === 'string' && source['trust'] === 'untrusted_user_input') ||
    !isRecord(safety) || typeof safety['sensitiveDataDetected'] !== 'boolean' ||
    typeof safety['promptInjectionDetected'] !== 'boolean' ||
    typeof safety['publicActionRequested'] !== 'boolean' ||
    typeof safety['memoryProposalAllowed'] !== 'boolean' ||
    !isRecord(arbitration) || typeof arbitration['outcome'] !== 'string' ||
    typeof arbitration['rationale'] !== 'string' || !Array.isArray(arbitration['appliedRules']) ||
    !arbitration['appliedRules'].every((rule) => typeof rule === 'string') ||
    !isRecord(retention) || (retention['turn'] !== 'confidential' && retention['turn'] !== 'not_persisted') ||
    typeof retention['rationale'] !== 'string' ||
    !isRecord(action) || typeof action['kind'] !== 'string' ||
    typeof action['label'] !== 'string' || !isConversationTargetView(action['targetView'])
  ) return false;
  return intent['confidence'] >= 0 && intent['confidence'] <= 1;
}

function isConversationTargetView(value: unknown): value is ConversationTargetView {
  return value === 'today' || value === 'memory' || value === 'strategy' ||
    value === 'research' || value === 'draft' || value === 'risk' || value === 'data';
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
