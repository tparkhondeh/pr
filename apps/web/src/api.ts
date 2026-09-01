export type FeasibilityReason =
  | 'within_budget'
  | 'attention_time_exceeded'
  | 'energy_exceeded'
  | 'attention_capacity_exceeded'
  | 'visibility_tolerance_exceeded'
  | 'emotional_bandwidth_exceeded';

export type DecisionFormat =
  | 'none' | 'private_conversation' | 'relationship_action' | 'mother_concept'
  | 'media_response' | 'event_participation' | 'research_brief';

export type ActionDecisionContract = Readonly<{
  policyVersion: 'strategic-decision-v1';
  strategyRevision: number;
  decisionContextRevision: number;
  decisionContextHash: string;
  objective: string;
  stakeholder: string;
  posture: 'now' | 'when_ready' | 'delay';
  timingRationale: string;
  decisionWindowEndsAt: string;
  format: DecisionFormat;
  platformSelected: false;
  assumptions: readonly string[];
  uncertainty: readonly string[];
  feasibilityReasons: readonly FeasibilityReason[];
  requiredApproval: 'human';
  measurementPlan: Readonly<{ signals: readonly string[]; reviewAfter: string }>;
  boundaries: Readonly<{
    recommendationIsExecution: false;
    publicApprovalGranted: false;
    externalActionPermitted: false;
  }>;
}>;

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
  attentionDemand: 1 | 2 | 3 | 4 | 5;
  visibilityCost: 1 | 2 | 3 | 4 | 5;
  emotionalCost: 1 | 2 | 3 | 4 | 5;
  feasible: boolean;
  feasibilityReasons: readonly FeasibilityReason[];
  utilityScore: number | null;
  opportunityCost: number | null;
  rank: number;
  evidenceState: 'insufficient' | 'grounded';
  evidenceSourceTypes: readonly string[];
  interaction: 'approve' | 'open_intake' | 'open_conversation';
  decision: ActionDecisionContract;
}>;

export type WorkbenchSnapshot = Readonly<{
  policyVersion: 'strategic-decision-v1';
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
    attentionCapacity: 1 | 2 | 3 | 4 | 5;
    visibilityTolerance: 1 | 2 | 3 | 4 | 5;
    emotionalBandwidth: 1 | 2 | 3 | 4 | 5;
  }>;
  decisionContext: DecisionContextSnapshot;
  decisionFrame: Readonly<{
    policyVersion: 'strategic-decision-v1';
    why: Readonly<{ goalId: string; objective: string }>;
    forWhom: string;
    currentContext: Readonly<{
      availableMinutes: number;
      maximumEnergyCost: 1 | 2 | 3 | 4 | 5;
      attentionCapacity: 1 | 2 | 3 | 4 | 5;
      visibilityTolerance: 1 | 2 | 3 | 4 | 5;
      emotionalBandwidth: 1 | 2 | 3 | 4 | 5;
    }>;
    contextBinding: Readonly<{
      strategyRevision: number;
      decisionContextRevision: number;
      decisionContextHash: string;
      decisionContextUpdatedAt: string;
    }>;
    decisionWindow: Readonly<{ generatedAt: string; expiresAt: string; durationHours: 24 }>;
    rankingTransparency: Readonly<{
      method: 'declared_weighted_policy';
      dimensions: readonly string[];
      utilityScoreVisible: true;
      opportunityCostVisible: true;
      hiddenScoreUsed: false;
    }>;
    boundaries: Readonly<{
      platformConstrained: false;
      publicApprovalGranted: false;
      externalActionPermitted: false;
    }>;
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

export type EditableDecisionContext = Readonly<{
  attentionBudget: WorkbenchSnapshot['attentionBudget'];
}>;

export type DecisionContextSnapshot = EditableDecisionContext & Readonly<{
  policyVersion: 'decision-context-v1';
  revision: number;
  contextHash: string;
  updatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  outcome?: 'saved' | 'already_saved';
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

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ArbitrationModule = 'strategy' | 'permission' | 'claims' | 'risk' | 'authenticity';
export type ArbitrationOutcome = 'recommendation_ready' | 'revision_required' | 'approval_required' | 'held';

export type ModuleOpinion = Readonly<{
  contractVersion: 'module-opinion-v1';
  module: ArbitrationModule;
  moduleVersion: string;
  position: 'support' | 'revise' | 'hold' | 'abstain';
  confidence: number;
  appliesFromAutonomyLevel: AutonomyLevel;
  rationale: string;
  provenanceRefs: readonly string[];
  authority: Readonly<{ read: 'owner_scoped_snapshot'; write: 'none' }>;
}>;

export type ArbitrationCase = Readonly<{
  caseId: string;
  requestId: string;
  policyVersion: 'intermodule-arbitration-v1';
  createdAt: string;
  validUntil: string;
  contextHash: string;
  snapshotHash: string;
  action: Readonly<{ id: string; title: string; kind: WorkbenchAction['kind']; hash: string }>;
  request: Readonly<{
    sourceModule: 'workbench';
    operation: 'evaluate_action';
    purpose: 'strategy_reasoning';
    requestedAutonomyLevel: AutonomyLevel;
    readAuthority: 'owner_scoped_snapshot';
    writeAuthority: 'append_decision_only';
  }>;
  opinions: readonly ModuleOpinion[];
  decision: Readonly<{
    outcome: ArbitrationOutcome;
    effectiveAutonomyLevel: AutonomyLevel;
    requiresHumanApproval: boolean;
    executionPermitted: false;
    dissentPreserved: boolean;
    blockingModules: readonly ArbitrationModule[];
    unknownModules: readonly ArbitrationModule[];
    downgradeReasons: readonly string[];
    appliedRules: readonly string[];
    rationale: string;
  }>;
}>;

export type ArbitrationWorkspaceSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  policyVersion: 'intermodule-arbitration-v1';
  contractVersion: 'module-opinion-v1';
  autonomy: readonly Readonly<{ level: AutonomyLevel; key: string; label: string }>[];
  mvpExecutionEnabled: false;
  availableActions: readonly Readonly<{
    id: string;
    title: string;
    kind: WorkbenchAction['kind'];
    evidenceCount: number;
    confidence: number;
    currentContextHash: string;
  }>[];
  cases: readonly Readonly<ArbitrationCase & { stale: boolean }>[];
}>;

export type ArbitrationAssessmentResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  persistence: 'memory' | 'postgres' | 'ephemeral';
  case: ArbitrationCase;
}>;

export type InitiativeMode = 'reactive' | 'balanced' | 'proactive';
export type InitiativeCueKind = 'evidence_question' | 'action_window' | 'decision_refresh';
export type InitiativeDecisionReason =
  | 'delivered'
  | 'reactive_mode'
  | 'paused'
  | 'rate_limited'
  | 'below_relevance'
  | 'no_material_signal';

export type InitiativeSettings = Readonly<{
  mode: InitiativeMode;
  maxPromptsPer24Hours: 1 | 2 | 3;
  minimumRelevance: number;
  pausedUntil: string | null;
  revision: number;
  updatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
}>;

export type InitiativeCue = Readonly<{
  candidateId: string;
  kind: InitiativeCueKind;
  title: string;
  prompt: string;
  rationale: string;
  relevance: number;
  confidence: number;
  targetView: 'intake' | 'today' | 'arbitration';
  sourceRefs: readonly string[];
  contextHash: string;
  expiresAt: string;
}>;

export type InitiativeEvaluation = Readonly<{
  evaluationId: string;
  requestId: string;
  policyVersion: 'initiative-policy-v1';
  settingsRevision: number;
  contextHash: string;
  candidate: InitiativeCue | null;
  decision: 'delivered' | 'suppressed';
  reason: InitiativeDecisionReason;
  createdAt: string;
  stale?: boolean;
}>;

export type InitiativeWorkspaceSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  policyVersion: 'initiative-policy-v1';
  settings: InitiativeSettings;
  window: Readonly<{ startsAt: string; delivered: number; remaining: number }>;
  preview: Readonly<{
    candidate: InitiativeCue | null;
    decision: 'delivered' | 'suppressed';
    reason: InitiativeDecisionReason;
  }>;
  evaluations: readonly InitiativeEvaluation[];
}>;

export type InitiativeSettingsResult = Readonly<{
  outcome: 'saved' | 'already_saved';
  settings: InitiativeSettings;
}>;

export type InitiativeEvaluationResult = Readonly<{
  outcome: 'evaluated' | 'already_evaluated';
  persistence: 'memory' | 'postgres' | 'ephemeral';
  evaluation: InitiativeEvaluation;
}>;

export type StakeholderGroup =
  | 'client' | 'investor' | 'peer' | 'manager' | 'team' | 'media' | 'journalist'
  | 'industry_leader' | 'community' | 'potential_partner' | 'critic' | 'friend'
  | 'public' | 'policymaker' | 'other';
export type StakeholderPriority = 'low' | 'medium' | 'high';
export type RelationshipStrength = 'unknown' | 'emerging' | 'active' | 'trusted';
export type RelationshipBoundary = 'normal' | 'ask_before_prompt' | 'do_not_prompt';
export type RelationshipRecency = 'unknown' | 'recent' | 'quiet' | 'dormant' | 'protected';
export type RelationshipAttention = 'none' | 'context_needed' | 'review_context' | 'approval_required';

export type StakeholderRecord = Readonly<{
  stakeholderId: string;
  requestId: string;
  label: string;
  group: StakeholderGroup;
  outcome: string;
  priority: StakeholderPriority;
  strength: RelationshipStrength;
  boundary: RelationshipBoundary;
  contextNote: string;
  lastInteractionAt: string | null;
  consentConfirmedAt: string;
  createdAt: string;
}>;

export type StakeholderSnapshot = StakeholderRecord & Readonly<{
  recency: RelationshipRecency;
  attention: RelationshipAttention;
  rationale: string;
  privacy: Readonly<{
    dataClass: 'confidential';
    allowedPurpose: 'relationship_planning';
    contactDetailsStored: false;
    automationPermitted: false;
    outboundContactPermitted: false;
  }>;
}>;

export type RelationshipWorkspaceSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  policyVersion: 'relationship-intelligence-v1';
  summary: Readonly<{
    totalStakeholders: number;
    highPriority: number;
    contextNeeded: number;
    reviewSuggested: number;
    boundaryProtected: number;
    outcomeCount: number;
  }>;
  groups: readonly Readonly<{ group: StakeholderGroup; count: number; highPriority: number }>[];
  stakeholders: readonly StakeholderSnapshot[];
}>;

export type CreateStakeholderResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  persistence: 'memory' | 'postgres' | 'ephemeral';
  record: StakeholderRecord;
}>;

export type DeleteStakeholderResult = Readonly<{
  outcome: 'deleted' | 'already_applied';
  persistence: 'memory' | 'postgres' | 'ephemeral';
  stakeholderId: string;
}>;

export type PerceptionDimension =
  | 'expertise' | 'trust' | 'leadership' | 'clarity' | 'innovation'
  | 'collaboration' | 'visibility' | 'authenticity' | 'other';
export type PerceptionPerspective = 'self_perception' | 'desired_positioning' | 'external_perception';
export type PerceptionStage = 'not_visible' | 'emerging' | 'visible' | 'strong' | 'signature';
export type PerceptionConfidence = 'low' | 'medium' | 'high';
export type PerceptionSourceKind =
  | 'owner_reflection' | 'owner_goal' | 'direct_feedback' | 'survey_summary'
  | 'public_signal' | 'media_signal' | 'network_feedback' | 'other';
export type PerceptionGap = 'insufficient_evidence' | 'aligned_range' | 'underrecognized' | 'exceeds_target';
export type BlindSpotStatus =
  | 'insufficient_evidence' | 'within_external_range'
  | 'self_higher_than_external' | 'self_lower_than_external';

export type PerceptionSignalRecord = Readonly<{
  signalId: string;
  requestId: string;
  dimension: PerceptionDimension;
  perspective: PerceptionPerspective;
  stage: PerceptionStage;
  summary: string;
  evidenceNote: string;
  sourceKind: PerceptionSourceKind;
  confidence: PerceptionConfidence;
  observedAt: string;
  consentConfirmedAt: string;
  createdAt: string;
}>;

export type PerceptionSignalSnapshot = PerceptionSignalRecord & Readonly<{
  epistemicType: 'self_report' | 'goal' | 'external_perception';
  privacy: Readonly<{
    dataClass: 'confidential';
    allowedPurpose: 'perception_analysis';
    sourceIdentityStored: false;
    verbatimPrivateQuoteStored: false;
    automatedCollectionPermitted: false;
    externalActionPermitted: false;
  }>;
}>;

export type PerceptionDimensionSnapshot = Readonly<{
  dimension: PerceptionDimension;
  selfStage: PerceptionStage | null;
  desiredStage: PerceptionStage | null;
  externalRange: Readonly<{
    lowest: PerceptionStage;
    highest: PerceptionStage;
    signalCount: number;
    conflictingStages: boolean;
  }> | null;
  gap: PerceptionGap;
  blindSpot: BlindSpotStatus;
  rationale: string;
}>;

export type PerceptionWorkspaceSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  policyVersion: 'perception-engine-v1';
  summary: Readonly<{
    totalSignals: number;
    coveredDimensions: number;
    externalSignals: number;
    underrecognized: number;
    potentialBlindSpots: number;
    insufficientEvidence: number;
  }>;
  dimensions: readonly PerceptionDimensionSnapshot[];
  signals: readonly PerceptionSignalSnapshot[];
}>;

export type CreatePerceptionSignalResult = Readonly<{
  outcome: 'applied' | 'already_applied';
  persistence: 'memory' | 'postgres' | 'ephemeral';
  record: PerceptionSignalRecord;
}>;

export type DeletePerceptionSignalResult = Readonly<{
  outcome: 'deleted' | 'already_applied';
  persistence: 'memory' | 'postgres' | 'ephemeral';
  signalId: string;
}>;

export type ExpressionGateLevel = 'green' | 'yellow' | 'red';
export type ExpressionGateOutcome = 'pass' | 'revise' | 'block';
export type ExpressionFindingDimension = 'grounding' | 'specificity' | 'generic_language' | 'voice_alignment';

export type NarrativeSeed = Readonly<{
  narrativeId: string;
  title: string;
  premise: string;
  maturity: 'single_source';
  source: Readonly<{ kind: 'text_asset'; ref: string; assertionId: string; evidenceId: string }>;
  epistemicType: 'evidence_backed_candidate';
  privacy: Readonly<{ dataClass: 'confidential'; allowedPurpose: 'brand_strategy'; externalActionPermitted: false }>;
}>;

export type VoiceSignal = Readonly<{
  preferenceId: string;
  key: string;
  value: unknown;
  status: 'proposed' | 'applied';
  evidenceCount: number;
  confidence: number;
  rationale: string;
}>;

export type AuthenticExpressionSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'mixed' | 'ephemeral';
  policyVersion: 'authentic-expression-v1';
  summary: Readonly<{
    narrativeSeeds: number;
    evidenceBoundSeeds: number;
    proposedVoiceSignals: number;
    appliedVoiceSignals: number;
    voiceMaturity: 'uninitialized' | 'learning' | 'confirmed';
  }>;
  narrativeSeeds: readonly NarrativeSeed[];
  voiceSignals: readonly VoiceSignal[];
  boundaries: Readonly<{
    narrativeSeedIsBrandFact: false;
    voiceProposalAppliesAutomatically: false;
    factCheckIncluded: false;
    externalActionPermitted: false;
  }>;
}>;

export type ExpressionGateFinding = Readonly<{
  dimension: ExpressionFindingDimension;
  level: ExpressionGateLevel;
  code: string;
  rationale: string;
  requiredChange: string | null;
}>;

export type AuthenticExpressionReview = Readonly<{
  reviewedAt: string;
  policyVersion: 'authentic-expression-v1';
  outcome: ExpressionGateOutcome;
  findings: readonly ExpressionGateFinding[];
  selectedSources: readonly Readonly<{ ref: string; title: string; assertionId: string; evidenceId: string }>[];
  matchedPersonalTerms: readonly string[];
  genericPhrases: readonly string[];
  appliedVoicePreferences: number;
  boundaries: Readonly<{
    factCheckIncluded: false;
    claimApprovalGranted: false;
    publicApprovalGranted: false;
    externalActionPermitted: false;
  }>;
}>;

export type OpportunityDecision = 'ignore' | 'monitor' | 'explore' | 'consider';
export type OpportunityAlignment = 'none' | 'adjacent' | 'direct';
export type OpportunityFactorStatus = 'favorable' | 'caution' | 'unknown';
export type OpportunityFactor = Readonly<{
  factor: 'goal' | 'audience' | 'timing' | 'source_quality' | 'source_conflict';
  status: OpportunityFactorStatus;
  rationale: string;
}>;
export type OpportunityAssessment = Readonly<{
  sourceId: string;
  title: string;
  publisher: string;
  citation: string;
  alignment: OpportunityAlignment;
  decision: OpportunityDecision;
  exploration: boolean;
  matchedGoalTerms: readonly string[];
  matchedAudienceTerms: readonly string[];
  factors: readonly OpportunityFactor[];
  rationale: string;
  uncertainty: string;
  nextStep: 'ignore' | 'watch' | 'research_more' | 'bring_to_strategy_review';
  trace: Readonly<{ claimId: string; evidenceId: string; factCheckStatus: string }>;
  boundaries: Readonly<{
    trendIsOpportunity: false;
    actionRecommended: false;
    publicApprovalGranted: false;
    externalActionPermitted: false;
  }>;
}>;
export type OpportunityRadarSnapshot = Readonly<{
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'mixed' | 'ephemeral';
  policyVersion: 'opportunity-radar-v1';
  strategyRevision: number;
  summary: Readonly<{
    sourcesAssessed: number;
    consider: number;
    monitor: number;
    explore: number;
    ignored: number;
    explorationBudget: 1;
    explorationUsed: number;
  }>;
  assessments: readonly OpportunityAssessment[];
  boundaries: Readonly<{
    externalMonitoringIncluded: false;
    trendIsOpportunity: false;
    hiddenOpportunityScoreUsed: false;
    actionRecommended: false;
    externalActionPermitted: false;
  }>;
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

export type StrategicRecommendationDecision = 'accepted' | 'rejected' | 'needs_revision';
export type StrategicOutcomeExecutionStatus = 'completed' | 'partial' | 'not_executed';
export type StrategicOutcomeChange = 'positive' | 'none' | 'negative' | 'unknown';
export type StrategicBusinessOutcome = 'none' | 'early_signal' | 'material' | 'unknown';

export type WorkflowCostKind = 'strategy_recommendation' | 'draft_generation' | 'research' |
  'platform_adaptation' | 'evaluation' | 'other';
export type WorkflowCostCircuitReason = 'invocation_budget_exceeded' | 'workflow_budget_exceeded' |
  'daily_budget_exceeded' | 'workflow_invocation_limit_exceeded' |
  'workflow_step_limit_exceeded' | 'workflow_circuit_open' |
  'actual_cost_exceeded_reservation' | 'actual_steps_exceeded_reservation';

export type WorkflowCostSnapshot = Readonly<{
  policyVersion: 'workflow-cost-budget-v1';
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  policy: Readonly<{
    version: 'workflow-cost-budget-v1';
    currency: 'USD';
    perInvocationBudgetMinorUnits: number;
    perWorkflowBudgetMinorUnits: number;
    dailyBudgetMinorUnits: number;
    maxInvocationsPerWorkflow: number;
    maxStepsPerWorkflow: number;
    warningRatio: number;
  }>;
  truthStatus: 'no_usage' | 'measured' | 'estimated' | 'unmetered' | 'mixed';
  day: Readonly<{
    date: string;
    chargedCostMinorUnits: number;
    activeReservedCostMinorUnits: number;
    remainingCostMinorUnits: number;
    status: 'within_budget' | 'warning' | 'circuit_open';
  }>;
  usage: Readonly<{
    chargeCount: number;
    measuredChargeCount: number;
    estimatedChargeCount: number;
    unmeteredChargeCount: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    modelMinorUnits: number;
    embeddingMinorUnits: number;
    storageMinorUnits: number;
    searchMinorUnits: number;
    toolApiMinorUnits: number;
    computeMinorUnits: number;
    humanReviewSeconds: number;
  }>;
  workflows: readonly Readonly<{
    workflowId: string;
    kind: WorkflowCostKind;
    invocationCount: number;
    chargedCostMinorUnits: number;
    activeReservedCostMinorUnits: number;
    actualSteps: number;
    status: 'within_budget' | 'warning' | 'circuit_open';
    circuitReason?: WorkflowCostCircuitReason;
  }>[];
  recentReservations: readonly Readonly<{
    id: string;
    workflowId: string;
    invocationId: string;
    kind: WorkflowCostKind;
    estimatedCostMinorUnits: number;
    plannedSteps: number;
    decision: 'allowed' | 'blocked';
    reason?: WorkflowCostCircuitReason;
    reservedAt: string;
  }>[];
  recentCharges: readonly Readonly<{
    id: string;
    reservationId: string;
    provider: string;
    model: string;
    actualCostMinorUnits: number;
    costEvidence: 'provider_reported' | 'estimated' | 'none';
    circuitOpened: boolean;
    circuitReason?: WorkflowCostCircuitReason;
    chargedAt: string;
  }>[];
}>;

export type ModelGovernanceSnapshot = Readonly<{
  policyVersion: 'prompt-model-governance-v1';
  generatedAt: string;
  providerConfigured: boolean;
  executionEnabled: boolean;
  costGateRequired: true;
  durableInvocationJournal: false;
  routes: readonly Readonly<{
    id: string;
    purpose: 'extract_evidence' | 'synthesize_hypothesis' | 'strategy_options' |
      'draft_content' | 'evaluate_output';
    schemaName: string;
    promptVersion: string;
    provider: string;
    model: string;
    modelTier: 'economy' | 'balanced' | 'reasoning';
    risk: 'low' | 'medium' | 'high';
    allowedDataClasses: readonly ('public' | 'internal' | 'confidential' | 'restricted')[];
    maxOutputTokens: number;
    estimatedCostMinorUnits: number;
    plannedSteps: number;
    timeoutMs: number;
    rollout: 'disabled' | 'shadow' | 'canary' | 'active';
    evalSuite: string;
    evalStatus: 'not_run' | 'failed' | 'passed';
  }>[];
}>;

export type StrategicQualitySnapshot = Readonly<{
  policyVersion: 'strategic-quality-v1';
  generatedAt: string;
  persistence: 'memory' | 'postgres' | 'ephemeral';
  context: Readonly<{
    strategyRevision: number;
    decisionContextRevision: number;
    decisionContextHash: string;
    decisionWindowEndsAt: string;
  }>;
  rubric: Readonly<{
    policyVersion: 'strategic-quality-v1';
    status: 'pass' | 'fail';
    passedChecks: number;
    totalChecks: number;
    criticalFailures: number;
    checks: readonly Readonly<{
      id: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      passed: boolean;
      evidence: string;
    }>[];
  }>;
  ownerBaseline: Readonly<{
    status: 'collecting' | 'established';
    minimumSampleSize: 5;
    sampleSize: number;
    remainingSamples: number;
    accepted: number;
    rejected: number;
    needsRevision: number;
    observedMetrics: Readonly<{
      acceptanceRate: number;
      averageUsefulness: number;
      averageTrust: number;
      averageFriction: number;
    }> | null;
    baselineMetrics: Readonly<{
      acceptanceRate: number;
      averageUsefulness: number;
      averageTrust: number;
      averageFriction: number;
    }> | null;
  }>;
  outcomeBaseline: Readonly<{
    policyVersion: 'strategic-outcome-followup-v1';
    status: 'collecting' | 'established';
    minimumSampleSize: 5;
    sampleSize: number;
    remainingSamples: number;
    completed: number;
    partial: number;
    notExecuted: number;
    observedMetrics: StrategicOutcomeMetrics | null;
    baselineMetrics: StrategicOutcomeMetrics | null;
  }>;
  recentReviews: readonly Readonly<{
    id: string;
    actionId: string;
    actionTitle: string;
    actionKind: WorkbenchAction['kind'];
    actionRank: number;
    decision: StrategicRecommendationDecision;
    usefulness: 1 | 2 | 3 | 4 | 5;
    trust: 1 | 2 | 3 | 4 | 5;
    friction: 1 | 2 | 3 | 4 | 5;
    note?: string;
    strategyRevision: number;
    decisionContextRevision: number;
    decisionContextHash: string;
    decisionWindowEndsAt: string;
    reviewedAt: string;
    supersedesReviewId?: string;
  }>[];
  recentOutcomes: readonly Readonly<{
    id: string;
    reviewId: string;
    actionId: string;
    actionTitle: string;
    executionStatus: StrategicOutcomeExecutionStatus;
    satisfaction: 1 | 2 | 3 | 4 | 5;
    regret: 1 | 2 | 3 | 4 | 5;
    energy: 1 | 2 | 3 | 4 | 5;
    engagementQuality?: 1 | 2 | 3 | 4 | 5;
    interactionDepth?: 1 | 2 | 3 | 4 | 5;
    privateMessages: number;
    opportunitiesCreated: number;
    relationshipChange: StrategicOutcomeChange;
    mediaOpportunities: number;
    perceptionShift: StrategicOutcomeChange;
    businessOutcome: StrategicBusinessOutcome;
    note?: string;
    outcomeOccurredAt: string;
    recordedAt: string;
    supersedesOutcomeId?: string;
  }>[];
}>;

type StrategicOutcomeMetrics = Readonly<{
  completionRate: number;
  followThroughRate: number;
  averageSatisfaction: number;
  averageRegret: number;
  averageEnergy: number;
  averageEngagementQuality: number | null;
  averageInteractionDepth: number | null;
  privateMessages: number;
  opportunitiesCreated: number;
  relationshipImprovements: number;
  mediaOpportunities: number;
  positivePerceptionShifts: number;
  materialBusinessOutcomes: number;
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
    arbitration: ArbitrationWorkspaceSnapshot | null;
    initiative: InitiativeWorkspaceSnapshot | null;
    relationships: RelationshipWorkspaceSnapshot | null;
    perception: PerceptionWorkspaceSnapshot | null;
    draft: DraftWorkspaceSnapshot | null;
    feedback: FeedbackLearningSnapshot;
    strategicQuality: StrategicQualitySnapshot | null;
    workflowCosts: WorkflowCostSnapshot | null;
    modelGovernance: ModelGovernanceSnapshot | null;
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

export async function loadArbitration(signal?: AbortSignal): Promise<ArbitrationWorkspaceSnapshot> {
  const payload = await requestJson('/api/arbitration', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isArbitrationWorkspaceSnapshot(payload)) {
    throw new WorkbenchApiError(200, 'invalid_response');
  }
  return payload;
}

export async function assessArbitration(input: Readonly<{
  requestId: string;
  actionId: string;
  requestedAutonomyLevel: AutonomyLevel;
}>): Promise<ArbitrationAssessmentResult> {
  const payload = await requestJson('/api/arbitration/cases', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (
    !isRecord(payload) ||
    (payload['outcome'] !== 'applied' && payload['outcome'] !== 'already_applied') ||
    !isPersistence(payload['persistence']) || !isArbitrationCase(payload['case'])
  ) {
    throw new WorkbenchApiError(200, 'invalid_response');
  }
  return payload as ArbitrationAssessmentResult;
}

export async function loadInitiative(signal?: AbortSignal): Promise<InitiativeWorkspaceSnapshot> {
  const payload = await requestJson('/api/initiative', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isInitiativeWorkspaceSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function updateInitiativeSettings(input: Readonly<{
  requestId: string;
  expectedRevision: number;
  mode: InitiativeMode;
  maxPromptsPer24Hours: 1 | 2 | 3;
  minimumRelevance: number;
  pausedUntil: string | null;
}>): Promise<InitiativeSettingsResult> {
  const payload = await requestJson('/api/initiative/settings', {
    method: 'PUT',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (
    !isRecord(payload) || (payload['outcome'] !== 'saved' && payload['outcome'] !== 'already_saved') ||
    !isInitiativeSettings(payload['settings'])
  ) throw new WorkbenchApiError(200, 'invalid_response');
  return payload as InitiativeSettingsResult;
}

export async function evaluateInitiative(input: Readonly<{
  requestId: string;
}>): Promise<InitiativeEvaluationResult> {
  const payload = await requestJson('/api/initiative/evaluations', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (
    !isRecord(payload) ||
    (payload['outcome'] !== 'evaluated' && payload['outcome'] !== 'already_evaluated') ||
    !isPersistence(payload['persistence']) || !isInitiativeEvaluation(payload['evaluation'])
  ) throw new WorkbenchApiError(200, 'invalid_response');
  return payload as InitiativeEvaluationResult;
}

export async function loadRelationships(signal?: AbortSignal): Promise<RelationshipWorkspaceSnapshot> {
  const payload = await requestJson('/api/relationships', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isRelationshipWorkspaceSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function createStakeholder(input: Readonly<{
  requestId: string;
  label: string;
  group: StakeholderGroup;
  outcome: string;
  priority: StakeholderPriority;
  strength: RelationshipStrength;
  boundary: RelationshipBoundary;
  contextNote: string;
  lastInteractionAt: string | null;
  consentConfirmed: boolean;
}>): Promise<CreateStakeholderResult> {
  const payload = await requestJson('/api/relationships/stakeholders', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (
    !isRecord(payload) || (payload['outcome'] !== 'applied' && payload['outcome'] !== 'already_applied') ||
    !isPersistence(payload['persistence']) || !isStakeholderRecord(payload['record'])
  ) throw new WorkbenchApiError(200, 'invalid_response');
  return payload as CreateStakeholderResult;
}

export async function deleteStakeholder(input: Readonly<{
  requestId: string;
  stakeholderId: string;
}>): Promise<DeleteStakeholderResult> {
  const payload = await requestJson(
    `/api/relationships/stakeholders/${encodeURIComponent(input.stakeholderId)}/delete`,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: input.requestId }),
    },
  );
  if (
    !isRecord(payload) || (payload['outcome'] !== 'deleted' && payload['outcome'] !== 'already_applied') ||
    !isPersistence(payload['persistence']) || typeof payload['stakeholderId'] !== 'string'
  ) throw new WorkbenchApiError(200, 'invalid_response');
  return payload as DeleteStakeholderResult;
}

export async function loadPerception(signal?: AbortSignal): Promise<PerceptionWorkspaceSnapshot> {
  const payload = await requestJson('/api/perception', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isPerceptionWorkspaceSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function createPerceptionSignal(input: Readonly<{
  requestId: string;
  dimension: PerceptionDimension;
  perspective: PerceptionPerspective;
  stage: PerceptionStage;
  summary: string;
  evidenceNote: string;
  sourceKind: PerceptionSourceKind;
  confidence: PerceptionConfidence;
  observedAt: string;
  consentConfirmed: boolean;
}>): Promise<CreatePerceptionSignalResult> {
  const payload = await requestJson('/api/perception/signals', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (
    !isRecord(payload) || (payload['outcome'] !== 'applied' && payload['outcome'] !== 'already_applied') ||
    !isPersistence(payload['persistence']) || !isPerceptionSignalRecord(payload['record'])
  ) throw new WorkbenchApiError(200, 'invalid_response');
  return payload as CreatePerceptionSignalResult;
}

export async function deletePerceptionSignal(input: Readonly<{
  requestId: string;
  signalId: string;
}>): Promise<DeletePerceptionSignalResult> {
  const payload = await requestJson(
    `/api/perception/signals/${encodeURIComponent(input.signalId)}/delete`,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: input.requestId }),
    },
  );
  if (
    !isRecord(payload) || (payload['outcome'] !== 'deleted' && payload['outcome'] !== 'already_applied') ||
    !isPersistence(payload['persistence']) || typeof payload['signalId'] !== 'string'
  ) throw new WorkbenchApiError(200, 'invalid_response');
  return payload as DeletePerceptionSignalResult;
}

export async function loadAuthenticExpression(signal?: AbortSignal): Promise<AuthenticExpressionSnapshot> {
  const payload = await requestJson('/api/expression', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isAuthenticExpressionSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function reviewAuthenticExpression(input: Readonly<{
  content: string;
  assetRefs: readonly string[];
}>): Promise<AuthenticExpressionReview> {
  const payload = await requestJson('/api/expression/review', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!isAuthenticExpressionReview(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function loadOpportunityRadar(signal?: AbortSignal): Promise<OpportunityRadarSnapshot> {
  const payload = await requestJson('/api/opportunities', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isOpportunityRadarSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
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

export async function loadDecisionContext(signal?: AbortSignal): Promise<DecisionContextSnapshot> {
  const payload = await requestJson('/api/decision-context', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isDecisionContextSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function saveDecisionContext(input: Readonly<{
  requestId: string;
  expectedRevision: number;
  value: EditableDecisionContext;
}>): Promise<DecisionContextSnapshot> {
  const payload = await requestJson('/api/decision-context', {
    method: 'PUT',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!isDecisionContextSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
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

export async function loadStrategicQuality(signal?: AbortSignal): Promise<StrategicQualitySnapshot> {
  const payload = await requestJson('/api/strategic-quality', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isStrategicQualitySnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function loadWorkflowCosts(signal?: AbortSignal): Promise<WorkflowCostSnapshot> {
  const payload = await requestJson('/api/workflow-cost', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isWorkflowCostSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function loadModelGovernance(signal?: AbortSignal): Promise<ModelGovernanceSnapshot> {
  const payload = await requestJson('/api/model-governance', {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!isModelGovernanceSnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function submitStrategicRecommendationReview(input: Readonly<{
  requestId: string;
  actionId: string;
  decision: StrategicRecommendationDecision;
  usefulness: number;
  trust: number;
  friction: number;
  note?: string;
  expectedStrategyRevision: number;
  expectedDecisionContextRevision: number;
  expectedDecisionContextHash: string;
  expectedDecisionWindowEndsAt: string;
}>): Promise<StrategicQualitySnapshot> {
  const payload = await requestJson('/api/strategic-quality/reviews', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!isStrategicQualitySnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
  return payload;
}

export async function submitStrategicOutcome(input: Readonly<{
  requestId: string;
  reviewId: string;
  executionStatus: StrategicOutcomeExecutionStatus;
  satisfaction: number;
  regret: number;
  energy: number;
  engagementQuality?: number;
  interactionDepth?: number;
  privateMessages: number;
  opportunitiesCreated: number;
  relationshipChange: StrategicOutcomeChange;
  mediaOpportunities: number;
  perceptionShift: StrategicOutcomeChange;
  businessOutcome: StrategicBusinessOutcome;
  note?: string;
  outcomeOccurredAt: string;
}>): Promise<StrategicQualitySnapshot> {
  const payload = await requestJson('/api/strategic-quality/outcomes', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!isStrategicQualitySnapshot(payload)) throw new WorkbenchApiError(200, 'invalid_response');
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

export async function approveWorkbenchAction(input: Readonly<{
  actionId: string;
  expectedStrategyRevision: number;
  expectedDecisionContextRevision: number;
  expectedDecisionContextHash: string;
  expectedDecisionWindowEndsAt: string;
}>): Promise<WorkbenchSnapshot> {
  return requestWorkbench('/api/workbench/approval', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
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
  const attentionBudget = payload['attentionBudget'];
  const decisionContext = payload['decisionContext'];
  return (
    payload['policyVersion'] === 'strategic-decision-v1' &&
    typeof payload['generatedAt'] === 'string' &&
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
    isRecord(attentionBudget) &&
    typeof attentionBudget['availableMinutes'] === 'number' &&
    isDecisionScale(attentionBudget['maximumEnergyCost']) &&
    isDecisionScale(attentionBudget['attentionCapacity']) &&
    isDecisionScale(attentionBudget['visibilityTolerance']) &&
    isDecisionScale(attentionBudget['emotionalBandwidth']) &&
    isDecisionContextSnapshot(decisionContext) &&
    isStrategicDecisionFrame(payload['decisionFrame']) &&
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
    isDecisionScale(value['energyCost']) && isDecisionScale(value['attentionDemand']) &&
    isDecisionScale(value['visibilityCost']) &&
    isDecisionScale(value['emotionalCost']) && typeof value['feasible'] === 'boolean' &&
    Array.isArray(value['feasibilityReasons']) && value['feasibilityReasons'].every(isFeasibilityReason) &&
    Array.isArray(value['evidenceIds']) &&
    value['evidenceIds'].every((evidence) => typeof evidence === 'string') &&
    (value['evidenceState'] === 'insufficient' || value['evidenceState'] === 'grounded') &&
    Array.isArray(value['evidenceSourceTypes']) &&
    (
      value['interaction'] === 'approve' || value['interaction'] === 'open_intake' ||
      value['interaction'] === 'open_conversation'
    ) && isActionDecisionContract(value['decision'])
  );
}

function isStrategicDecisionFrame(value: unknown): value is WorkbenchSnapshot['decisionFrame'] {
  if (!isRecord(value) || value['policyVersion'] !== 'strategic-decision-v1' ||
      !isRecord(value['why']) || typeof value['forWhom'] !== 'string' ||
      !isRecord(value['currentContext']) || !isRecord(value['contextBinding']) ||
      !isRecord(value['decisionWindow']) ||
      !isRecord(value['rankingTransparency']) || !isRecord(value['boundaries'])) return false;
  const why = value['why'];
  const context = value['currentContext'];
  const contextBinding = value['contextBinding'];
  const window = value['decisionWindow'];
  const ranking = value['rankingTransparency'];
  const boundaries = value['boundaries'];
  return typeof why['goalId'] === 'string' && typeof why['objective'] === 'string' &&
    typeof context['availableMinutes'] === 'number' && isDecisionScale(context['maximumEnergyCost']) &&
    isDecisionScale(context['attentionCapacity']) &&
    isDecisionScale(context['visibilityTolerance']) && isDecisionScale(context['emotionalBandwidth']) &&
    typeof contextBinding['strategyRevision'] === 'number' &&
    typeof contextBinding['decisionContextRevision'] === 'number' &&
    typeof contextBinding['decisionContextHash'] === 'string' &&
    /^[0-9a-f]{64}$/u.test(contextBinding['decisionContextHash']) &&
    typeof contextBinding['decisionContextUpdatedAt'] === 'string' &&
    typeof window['generatedAt'] === 'string' && typeof window['expiresAt'] === 'string' &&
    window['durationHours'] === 24 && ranking['method'] === 'declared_weighted_policy' &&
    Array.isArray(ranking['dimensions']) && ranking['dimensions'].every((item) => typeof item === 'string') &&
    ranking['utilityScoreVisible'] === true && ranking['opportunityCostVisible'] === true &&
    ranking['hiddenScoreUsed'] === false && boundaries['platformConstrained'] === false &&
    boundaries['publicApprovalGranted'] === false && boundaries['externalActionPermitted'] === false;
}

function isActionDecisionContract(value: unknown): value is ActionDecisionContract {
  if (!isRecord(value) || value['policyVersion'] !== 'strategic-decision-v1' ||
      typeof value['strategyRevision'] !== 'number' ||
      typeof value['decisionContextRevision'] !== 'number' ||
      typeof value['decisionContextHash'] !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(value['decisionContextHash']) ||
      typeof value['objective'] !== 'string' || typeof value['stakeholder'] !== 'string' ||
      !['now', 'when_ready', 'delay'].includes(String(value['posture'])) ||
      typeof value['timingRationale'] !== 'string' || typeof value['decisionWindowEndsAt'] !== 'string' ||
      !isDecisionFormat(value['format']) || value['platformSelected'] !== false ||
      !isStringArray(value['assumptions']) || !isStringArray(value['uncertainty']) ||
      !Array.isArray(value['feasibilityReasons']) || !value['feasibilityReasons'].every(isFeasibilityReason) ||
      value['requiredApproval'] !== 'human' || !isRecord(value['measurementPlan']) ||
      !isRecord(value['boundaries'])) return false;
  const measurement = value['measurementPlan'];
  const boundaries = value['boundaries'];
  return isStringArray(measurement['signals']) && typeof measurement['reviewAfter'] === 'string' &&
    boundaries['recommendationIsExecution'] === false && boundaries['publicApprovalGranted'] === false &&
    boundaries['externalActionPermitted'] === false;
}

function isFeasibilityReason(value: unknown): value is FeasibilityReason {
  return value === 'within_budget' || value === 'attention_time_exceeded' || value === 'energy_exceeded' ||
    value === 'attention_capacity_exceeded' ||
    value === 'visibility_tolerance_exceeded' || value === 'emotional_bandwidth_exceeded';
}

function isDecisionContextSnapshot(payload: unknown): payload is DecisionContextSnapshot {
  if (!isRecord(payload) || !isRecord(payload['attentionBudget'])) return false;
  const budget = payload['attentionBudget'];
  return payload['policyVersion'] === 'decision-context-v1' &&
    typeof payload['revision'] === 'number' && typeof payload['contextHash'] === 'string' &&
    /^[0-9a-f]{64}$/u.test(payload['contextHash']) && typeof payload['updatedAt'] === 'string' &&
    isPersistence(payload['persistence']) && typeof budget['availableMinutes'] === 'number' &&
    isDecisionScale(budget['maximumEnergyCost']) && isDecisionScale(budget['attentionCapacity']) &&
    isDecisionScale(budget['visibilityTolerance']) && isDecisionScale(budget['emotionalBandwidth']);
}

function isDecisionFormat(value: unknown): value is DecisionFormat {
  return value === 'none' || value === 'private_conversation' || value === 'relationship_action' ||
    value === 'mother_concept' || value === 'media_response' || value === 'event_participation' ||
    value === 'research_brief';
}

function isDecisionScale(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
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

function isArbitrationWorkspaceSnapshot(payload: unknown): payload is ArbitrationWorkspaceSnapshot {
  if (
    !isRecord(payload) || payload['policyVersion'] !== 'intermodule-arbitration-v1' ||
    payload['contractVersion'] !== 'module-opinion-v1' ||
    payload['mvpExecutionEnabled'] !== false || !Array.isArray(payload['autonomy']) ||
    !Array.isArray(payload['availableActions']) || !Array.isArray(payload['cases'])
  ) return false;
  return (
    typeof payload['generatedAt'] === 'string' && isPersistence(payload['persistence']) &&
    payload['autonomy'].every((item) => isRecord(item) && isAutonomyLevel(item['level']) &&
      typeof item['key'] === 'string' && typeof item['label'] === 'string') &&
    payload['availableActions'].every((item) => isRecord(item) &&
      typeof item['id'] === 'string' && typeof item['title'] === 'string' &&
      typeof item['kind'] === 'string' && typeof item['evidenceCount'] === 'number' &&
      typeof item['confidence'] === 'number' && typeof item['currentContextHash'] === 'string') &&
    payload['cases'].every((item) => isRecord(item) && typeof item['stale'] === 'boolean' &&
      isArbitrationCase(item))
  );
}

function isArbitrationCase(value: unknown): value is ArbitrationCase {
  if (!isRecord(value)) return false;
  const action = value['action'];
  const request = value['request'];
  const decision = value['decision'];
  return (
    value['policyVersion'] === 'intermodule-arbitration-v1' &&
    typeof value['caseId'] === 'string' && typeof value['requestId'] === 'string' &&
    typeof value['createdAt'] === 'string' && typeof value['validUntil'] === 'string' &&
    typeof value['contextHash'] === 'string' && typeof value['snapshotHash'] === 'string' &&
    isRecord(action) && typeof action['id'] === 'string' && typeof action['title'] === 'string' &&
    typeof action['kind'] === 'string' && typeof action['hash'] === 'string' &&
    isRecord(request) && request['sourceModule'] === 'workbench' &&
    request['operation'] === 'evaluate_action' && request['purpose'] === 'strategy_reasoning' &&
    isAutonomyLevel(request['requestedAutonomyLevel']) &&
    request['readAuthority'] === 'owner_scoped_snapshot' &&
    request['writeAuthority'] === 'append_decision_only' &&
    Array.isArray(value['opinions']) && value['opinions'].every(isModuleOpinion) &&
    isRecord(decision) && isArbitrationOutcome(decision['outcome']) &&
    isAutonomyLevel(decision['effectiveAutonomyLevel']) &&
    typeof decision['requiresHumanApproval'] === 'boolean' &&
    decision['executionPermitted'] === false && typeof decision['dissentPreserved'] === 'boolean' &&
    isStringArray(decision['blockingModules']) && isStringArray(decision['unknownModules']) &&
    isStringArray(decision['downgradeReasons']) && isStringArray(decision['appliedRules']) &&
    typeof decision['rationale'] === 'string'
  );
}

function isModuleOpinion(value: unknown): value is ModuleOpinion {
  return (
    isRecord(value) && value['contractVersion'] === 'module-opinion-v1' &&
    isArbitrationModule(value['module']) && typeof value['moduleVersion'] === 'string' &&
    (value['position'] === 'support' || value['position'] === 'revise' ||
      value['position'] === 'hold' || value['position'] === 'abstain') &&
    typeof value['confidence'] === 'number' && isAutonomyLevel(value['appliesFromAutonomyLevel']) &&
    typeof value['rationale'] === 'string' && isStringArray(value['provenanceRefs']) &&
    isRecord(value['authority']) && value['authority']['read'] === 'owner_scoped_snapshot' &&
    value['authority']['write'] === 'none'
  );
}

function isAutonomyLevel(value: unknown): value is AutonomyLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 7;
}

function isArbitrationModule(value: unknown): value is ArbitrationModule {
  return value === 'strategy' || value === 'permission' || value === 'claims' ||
    value === 'risk' || value === 'authenticity';
}

function isArbitrationOutcome(value: unknown): value is ArbitrationOutcome {
  return value === 'recommendation_ready' || value === 'revision_required' ||
    value === 'approval_required' || value === 'held';
}

function isInitiativeWorkspaceSnapshot(value: unknown): value is InitiativeWorkspaceSnapshot {
  if (!isRecord(value) || value['policyVersion'] !== 'initiative-policy-v1') return false;
  const window = value['window'];
  const preview = value['preview'];
  return (
    typeof value['generatedAt'] === 'string' && isPersistence(value['persistence']) &&
    isInitiativeSettings(value['settings']) &&
    isRecord(window) && typeof window['startsAt'] === 'string' &&
    typeof window['delivered'] === 'number' && typeof window['remaining'] === 'number' &&
    isRecord(preview) && (preview['candidate'] === null || isInitiativeCue(preview['candidate'])) &&
    (preview['decision'] === 'delivered' || preview['decision'] === 'suppressed') &&
    isInitiativeReason(preview['reason']) && Array.isArray(value['evaluations']) &&
    value['evaluations'].every(isInitiativeEvaluation)
  );
}

function isInitiativeSettings(value: unknown): value is InitiativeSettings {
  return isRecord(value) && isInitiativeMode(value['mode']) &&
    (value['maxPromptsPer24Hours'] === 1 || value['maxPromptsPer24Hours'] === 2 ||
      value['maxPromptsPer24Hours'] === 3) &&
    typeof value['minimumRelevance'] === 'number' &&
    (value['pausedUntil'] === null || typeof value['pausedUntil'] === 'string') &&
    typeof value['revision'] === 'number' && typeof value['updatedAt'] === 'string' &&
    isPersistence(value['persistence']);
}

function isInitiativeCue(value: unknown): value is InitiativeCue {
  return isRecord(value) && typeof value['candidateId'] === 'string' &&
    isInitiativeCueKind(value['kind']) && typeof value['title'] === 'string' &&
    typeof value['prompt'] === 'string' && typeof value['rationale'] === 'string' &&
    typeof value['relevance'] === 'number' && typeof value['confidence'] === 'number' &&
    (value['targetView'] === 'intake' || value['targetView'] === 'today' || value['targetView'] === 'arbitration') &&
    isStringArray(value['sourceRefs']) && typeof value['contextHash'] === 'string' &&
    typeof value['expiresAt'] === 'string';
}

function isInitiativeEvaluation(value: unknown): value is InitiativeEvaluation {
  return isRecord(value) && typeof value['evaluationId'] === 'string' &&
    typeof value['requestId'] === 'string' && value['policyVersion'] === 'initiative-policy-v1' &&
    typeof value['settingsRevision'] === 'number' && typeof value['contextHash'] === 'string' &&
    (value['candidate'] === null || isInitiativeCue(value['candidate'])) &&
    (value['decision'] === 'delivered' || value['decision'] === 'suppressed') &&
    isInitiativeReason(value['reason']) && typeof value['createdAt'] === 'string' &&
    (value['stale'] === undefined || typeof value['stale'] === 'boolean');
}

function isInitiativeMode(value: unknown): value is InitiativeMode {
  return value === 'reactive' || value === 'balanced' || value === 'proactive';
}

function isInitiativeCueKind(value: unknown): value is InitiativeCueKind {
  return value === 'evidence_question' || value === 'action_window' || value === 'decision_refresh';
}

function isInitiativeReason(value: unknown): value is InitiativeDecisionReason {
  return value === 'delivered' || value === 'reactive_mode' || value === 'paused' ||
    value === 'rate_limited' || value === 'below_relevance' || value === 'no_material_signal';
}

function isRelationshipWorkspaceSnapshot(value: unknown): value is RelationshipWorkspaceSnapshot {
  if (
    !isRecord(value) || value['policyVersion'] !== 'relationship-intelligence-v1' ||
    typeof value['generatedAt'] !== 'string' || !isPersistence(value['persistence']) ||
    !isRecord(value['summary']) || !Array.isArray(value['groups']) || !Array.isArray(value['stakeholders'])
  ) return false;
  const summary = value['summary'];
  return (
    typeof summary['totalStakeholders'] === 'number' && typeof summary['highPriority'] === 'number' &&
    typeof summary['contextNeeded'] === 'number' && typeof summary['reviewSuggested'] === 'number' &&
    typeof summary['boundaryProtected'] === 'number' && typeof summary['outcomeCount'] === 'number' &&
    value['groups'].every((group) => isRecord(group) && isStakeholderGroup(group['group']) &&
      typeof group['count'] === 'number' && typeof group['highPriority'] === 'number') &&
    value['stakeholders'].every(isStakeholderSnapshot)
  );
}

function isStakeholderSnapshot(value: unknown): value is StakeholderSnapshot {
  if (!isStakeholderRecord(value)) return false;
  const candidate = value as unknown as Record<string, unknown>;
  if (!isRecord(candidate['privacy'])) return false;
  const privacy = candidate['privacy'];
  return isRelationshipRecency(candidate['recency']) && isRelationshipAttention(candidate['attention']) &&
    typeof candidate['rationale'] === 'string' && privacy['dataClass'] === 'confidential' &&
    privacy['allowedPurpose'] === 'relationship_planning' && privacy['contactDetailsStored'] === false &&
    privacy['automationPermitted'] === false && privacy['outboundContactPermitted'] === false;
}

function isStakeholderRecord(value: unknown): value is StakeholderRecord {
  return isRecord(value) && typeof value['stakeholderId'] === 'string' &&
    typeof value['requestId'] === 'string' && typeof value['label'] === 'string' &&
    isStakeholderGroup(value['group']) && typeof value['outcome'] === 'string' &&
    isStakeholderPriority(value['priority']) && isRelationshipStrength(value['strength']) &&
    isRelationshipBoundary(value['boundary']) && typeof value['contextNote'] === 'string' &&
    (value['lastInteractionAt'] === null || typeof value['lastInteractionAt'] === 'string') &&
    typeof value['consentConfirmedAt'] === 'string' && typeof value['createdAt'] === 'string';
}

function isStakeholderGroup(value: unknown): value is StakeholderGroup {
  return value === 'client' || value === 'investor' || value === 'peer' || value === 'manager' ||
    value === 'team' || value === 'media' || value === 'journalist' || value === 'industry_leader' ||
    value === 'community' || value === 'potential_partner' || value === 'critic' || value === 'friend' ||
    value === 'public' || value === 'policymaker' || value === 'other';
}

function isStakeholderPriority(value: unknown): value is StakeholderPriority {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isRelationshipStrength(value: unknown): value is RelationshipStrength {
  return value === 'unknown' || value === 'emerging' || value === 'active' || value === 'trusted';
}

function isRelationshipBoundary(value: unknown): value is RelationshipBoundary {
  return value === 'normal' || value === 'ask_before_prompt' || value === 'do_not_prompt';
}

function isRelationshipRecency(value: unknown): value is RelationshipRecency {
  return value === 'unknown' || value === 'recent' || value === 'quiet' ||
    value === 'dormant' || value === 'protected';
}

function isRelationshipAttention(value: unknown): value is RelationshipAttention {
  return value === 'none' || value === 'context_needed' || value === 'review_context' ||
    value === 'approval_required';
}

function isPerceptionWorkspaceSnapshot(value: unknown): value is PerceptionWorkspaceSnapshot {
  if (
    !isRecord(value) || value['policyVersion'] !== 'perception-engine-v1' ||
    typeof value['generatedAt'] !== 'string' || !isPersistence(value['persistence']) ||
    !isRecord(value['summary']) || !Array.isArray(value['dimensions']) || !Array.isArray(value['signals'])
  ) return false;
  const summary = value['summary'];
  return typeof summary['totalSignals'] === 'number' && typeof summary['coveredDimensions'] === 'number' &&
    typeof summary['externalSignals'] === 'number' && typeof summary['underrecognized'] === 'number' &&
    typeof summary['potentialBlindSpots'] === 'number' && typeof summary['insufficientEvidence'] === 'number' &&
    value['dimensions'].every(isPerceptionDimensionSnapshot) && value['signals'].every(isPerceptionSignalSnapshot);
}

function isPerceptionDimensionSnapshot(value: unknown): value is PerceptionDimensionSnapshot {
  if (!isRecord(value) || !isPerceptionDimension(value['dimension']) ||
      (value['selfStage'] !== null && !isPerceptionStage(value['selfStage'])) ||
      (value['desiredStage'] !== null && !isPerceptionStage(value['desiredStage'])) ||
      !isPerceptionGap(value['gap']) || !isBlindSpotStatus(value['blindSpot']) ||
      typeof value['rationale'] !== 'string') return false;
  const range = value['externalRange'];
  return range === null || (isRecord(range) && isPerceptionStage(range['lowest']) &&
    isPerceptionStage(range['highest']) && typeof range['signalCount'] === 'number' &&
    typeof range['conflictingStages'] === 'boolean');
}

function isPerceptionSignalSnapshot(value: unknown): value is PerceptionSignalSnapshot {
  if (!isPerceptionSignalRecord(value)) return false;
  const candidate = value as unknown as Record<string, unknown>;
  if (!isRecord(candidate['privacy'])) return false;
  const privacy = candidate['privacy'];
  return (candidate['epistemicType'] === 'self_report' || candidate['epistemicType'] === 'goal' ||
    candidate['epistemicType'] === 'external_perception') && privacy['dataClass'] === 'confidential' &&
    privacy['allowedPurpose'] === 'perception_analysis' && privacy['sourceIdentityStored'] === false &&
    privacy['verbatimPrivateQuoteStored'] === false && privacy['automatedCollectionPermitted'] === false &&
    privacy['externalActionPermitted'] === false;
}

function isPerceptionSignalRecord(value: unknown): value is PerceptionSignalRecord {
  return isRecord(value) && typeof value['signalId'] === 'string' && typeof value['requestId'] === 'string' &&
    isPerceptionDimension(value['dimension']) && isPerceptionPerspective(value['perspective']) &&
    isPerceptionStage(value['stage']) && typeof value['summary'] === 'string' &&
    typeof value['evidenceNote'] === 'string' && isPerceptionSourceKind(value['sourceKind']) &&
    isPerceptionConfidence(value['confidence']) && typeof value['observedAt'] === 'string' &&
    typeof value['consentConfirmedAt'] === 'string' && typeof value['createdAt'] === 'string';
}

function isPerceptionDimension(value: unknown): value is PerceptionDimension {
  return value === 'expertise' || value === 'trust' || value === 'leadership' || value === 'clarity' ||
    value === 'innovation' || value === 'collaboration' || value === 'visibility' ||
    value === 'authenticity' || value === 'other';
}

function isPerceptionPerspective(value: unknown): value is PerceptionPerspective {
  return value === 'self_perception' || value === 'desired_positioning' || value === 'external_perception';
}

function isPerceptionStage(value: unknown): value is PerceptionStage {
  return value === 'not_visible' || value === 'emerging' || value === 'visible' ||
    value === 'strong' || value === 'signature';
}

function isPerceptionSourceKind(value: unknown): value is PerceptionSourceKind {
  return value === 'owner_reflection' || value === 'owner_goal' || value === 'direct_feedback' ||
    value === 'survey_summary' || value === 'public_signal' || value === 'media_signal' ||
    value === 'network_feedback' || value === 'other';
}

function isPerceptionConfidence(value: unknown): value is PerceptionConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isPerceptionGap(value: unknown): value is PerceptionGap {
  return value === 'insufficient_evidence' || value === 'aligned_range' ||
    value === 'underrecognized' || value === 'exceeds_target';
}

function isBlindSpotStatus(value: unknown): value is BlindSpotStatus {
  return value === 'insufficient_evidence' || value === 'within_external_range' ||
    value === 'self_higher_than_external' || value === 'self_lower_than_external';
}

function isAuthenticExpressionSnapshot(value: unknown): value is AuthenticExpressionSnapshot {
  if (!isRecord(value) || value['policyVersion'] !== 'authentic-expression-v1' ||
      typeof value['generatedAt'] !== 'string' ||
      !(isPersistence(value['persistence']) || value['persistence'] === 'mixed') ||
      !isRecord(value['summary']) || !Array.isArray(value['narrativeSeeds']) || !Array.isArray(value['voiceSignals']) ||
      !isRecord(value['boundaries'])) return false;
  const summary = value['summary'];
  const boundaries = value['boundaries'];
  return typeof summary['narrativeSeeds'] === 'number' && typeof summary['evidenceBoundSeeds'] === 'number' &&
    typeof summary['proposedVoiceSignals'] === 'number' && typeof summary['appliedVoiceSignals'] === 'number' &&
    (summary['voiceMaturity'] === 'uninitialized' || summary['voiceMaturity'] === 'learning' || summary['voiceMaturity'] === 'confirmed') &&
    value['narrativeSeeds'].every(isNarrativeSeed) && value['voiceSignals'].every(isVoiceSignal) &&
    boundaries['narrativeSeedIsBrandFact'] === false && boundaries['voiceProposalAppliesAutomatically'] === false &&
    boundaries['factCheckIncluded'] === false && boundaries['externalActionPermitted'] === false;
}

function isNarrativeSeed(value: unknown): value is NarrativeSeed {
  if (!isRecord(value) || typeof value['narrativeId'] !== 'string' || typeof value['title'] !== 'string' ||
      typeof value['premise'] !== 'string' || value['maturity'] !== 'single_source' ||
      value['epistemicType'] !== 'evidence_backed_candidate' || !isRecord(value['source']) || !isRecord(value['privacy'])) return false;
  const source = value['source'];
  const privacy = value['privacy'];
  return source['kind'] === 'text_asset' && typeof source['ref'] === 'string' && typeof source['assertionId'] === 'string' &&
    typeof source['evidenceId'] === 'string' && privacy['dataClass'] === 'confidential' &&
    privacy['allowedPurpose'] === 'brand_strategy' && privacy['externalActionPermitted'] === false;
}

function isVoiceSignal(value: unknown): value is VoiceSignal {
  return isRecord(value) && typeof value['preferenceId'] === 'string' && typeof value['key'] === 'string' &&
    (value['status'] === 'proposed' || value['status'] === 'applied') && typeof value['evidenceCount'] === 'number' &&
    typeof value['confidence'] === 'number' && typeof value['rationale'] === 'string';
}

function isAuthenticExpressionReview(value: unknown): value is AuthenticExpressionReview {
  if (!isRecord(value) || value['policyVersion'] !== 'authentic-expression-v1' || typeof value['reviewedAt'] !== 'string' ||
      (value['outcome'] !== 'pass' && value['outcome'] !== 'revise' && value['outcome'] !== 'block') ||
      !Array.isArray(value['findings']) || !Array.isArray(value['selectedSources']) ||
      !isStringArray(value['matchedPersonalTerms']) || !isStringArray(value['genericPhrases']) ||
      typeof value['appliedVoicePreferences'] !== 'number' || !isRecord(value['boundaries'])) return false;
  const boundaries = value['boundaries'];
  return value['findings'].every(isExpressionFinding) && value['selectedSources'].every(isExpressionSource) &&
    boundaries['factCheckIncluded'] === false && boundaries['claimApprovalGranted'] === false &&
    boundaries['publicApprovalGranted'] === false && boundaries['externalActionPermitted'] === false;
}

function isExpressionFinding(value: unknown): value is ExpressionGateFinding {
  return isRecord(value) &&
    (value['dimension'] === 'grounding' || value['dimension'] === 'specificity' ||
      value['dimension'] === 'generic_language' || value['dimension'] === 'voice_alignment') &&
    (value['level'] === 'green' || value['level'] === 'yellow' || value['level'] === 'red') &&
    typeof value['code'] === 'string' && typeof value['rationale'] === 'string' &&
    (value['requiredChange'] === null || typeof value['requiredChange'] === 'string');
}

function isExpressionSource(value: unknown): value is AuthenticExpressionReview['selectedSources'][number] {
  return isRecord(value) && typeof value['ref'] === 'string' && typeof value['title'] === 'string' &&
    typeof value['assertionId'] === 'string' && typeof value['evidenceId'] === 'string';
}

function isOpportunityRadarSnapshot(value: unknown): value is OpportunityRadarSnapshot {
  if (!isRecord(value) || value['policyVersion'] !== 'opportunity-radar-v1' || typeof value['generatedAt'] !== 'string' ||
      !(isPersistence(value['persistence']) || value['persistence'] === 'mixed') || typeof value['strategyRevision'] !== 'number' ||
      !isRecord(value['summary']) || !Array.isArray(value['assessments']) || !isRecord(value['boundaries'])) return false;
  const summary = value['summary'];
  const boundaries = value['boundaries'];
  return typeof summary['sourcesAssessed'] === 'number' && typeof summary['consider'] === 'number' &&
    typeof summary['monitor'] === 'number' && typeof summary['explore'] === 'number' &&
    typeof summary['ignored'] === 'number' && summary['explorationBudget'] === 1 &&
    typeof summary['explorationUsed'] === 'number' && value['assessments'].every(isOpportunityAssessment) &&
    boundaries['externalMonitoringIncluded'] === false && boundaries['trendIsOpportunity'] === false &&
    boundaries['hiddenOpportunityScoreUsed'] === false && boundaries['actionRecommended'] === false &&
    boundaries['externalActionPermitted'] === false;
}

function isOpportunityAssessment(value: unknown): value is OpportunityAssessment {
  if (!isRecord(value) || typeof value['sourceId'] !== 'string' || typeof value['title'] !== 'string' ||
      typeof value['publisher'] !== 'string' || typeof value['citation'] !== 'string' ||
      !isOpportunityAlignment(value['alignment']) || !isOpportunityDecision(value['decision']) ||
      typeof value['exploration'] !== 'boolean' || !isStringArray(value['matchedGoalTerms']) ||
      !isStringArray(value['matchedAudienceTerms']) || !Array.isArray(value['factors']) ||
      typeof value['rationale'] !== 'string' || typeof value['uncertainty'] !== 'string' ||
      !['ignore', 'watch', 'research_more', 'bring_to_strategy_review'].includes(String(value['nextStep'])) ||
      !isRecord(value['trace']) || !isRecord(value['boundaries'])) return false;
  const trace = value['trace'];
  const boundaries = value['boundaries'];
  return value['factors'].every(isOpportunityFactor) && typeof trace['claimId'] === 'string' &&
    typeof trace['evidenceId'] === 'string' && typeof trace['factCheckStatus'] === 'string' &&
    boundaries['trendIsOpportunity'] === false && boundaries['actionRecommended'] === false &&
    boundaries['publicApprovalGranted'] === false && boundaries['externalActionPermitted'] === false;
}

function isOpportunityFactor(value: unknown): value is OpportunityFactor {
  return isRecord(value) && ['goal', 'audience', 'timing', 'source_quality', 'source_conflict'].includes(String(value['factor'])) &&
    (value['status'] === 'favorable' || value['status'] === 'caution' || value['status'] === 'unknown') &&
    typeof value['rationale'] === 'string';
}

function isOpportunityAlignment(value: unknown): value is OpportunityAlignment {
  return value === 'none' || value === 'adjacent' || value === 'direct';
}

function isOpportunityDecision(value: unknown): value is OpportunityDecision {
  return value === 'ignore' || value === 'monitor' || value === 'explore' || value === 'consider';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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

function isStrategicQualitySnapshot(payload: unknown): payload is StrategicQualitySnapshot {
  if (
    !isRecord(payload) || payload['policyVersion'] !== 'strategic-quality-v1' ||
    typeof payload['generatedAt'] !== 'string' || !isPersistence(payload['persistence']) ||
    !isRecord(payload['context']) || !isRecord(payload['rubric']) ||
    !isRecord(payload['ownerBaseline']) || !isRecord(payload['outcomeBaseline']) ||
    !Array.isArray(payload['recentReviews']) || !Array.isArray(payload['recentOutcomes'])
  ) return false;
  const context = payload['context'];
  const rubric = payload['rubric'];
  const baseline = payload['ownerBaseline'];
  const outcomeBaseline = payload['outcomeBaseline'];
  const isMetrics = (value: unknown): boolean => isRecord(value) &&
    typeof value['acceptanceRate'] === 'number' && typeof value['averageUsefulness'] === 'number' &&
    typeof value['averageTrust'] === 'number' && typeof value['averageFriction'] === 'number';
  return (
    typeof context['strategyRevision'] === 'number' &&
    typeof context['decisionContextRevision'] === 'number' &&
    typeof context['decisionContextHash'] === 'string' &&
    /^[0-9a-f]{64}$/u.test(context['decisionContextHash']) &&
    typeof context['decisionWindowEndsAt'] === 'string' &&
    rubric['policyVersion'] === 'strategic-quality-v1' &&
    (rubric['status'] === 'pass' || rubric['status'] === 'fail') &&
    typeof rubric['passedChecks'] === 'number' && typeof rubric['totalChecks'] === 'number' &&
    typeof rubric['criticalFailures'] === 'number' && Array.isArray(rubric['checks']) &&
    rubric['checks'].every((check) => isRecord(check) && typeof check['id'] === 'string' &&
      ['critical', 'high', 'medium', 'low'].includes(String(check['severity'])) &&
      typeof check['passed'] === 'boolean' && typeof check['evidence'] === 'string') &&
    (baseline['status'] === 'collecting' || baseline['status'] === 'established') &&
    baseline['minimumSampleSize'] === 5 && typeof baseline['sampleSize'] === 'number' &&
    typeof baseline['remainingSamples'] === 'number' && typeof baseline['accepted'] === 'number' &&
    typeof baseline['rejected'] === 'number' && typeof baseline['needsRevision'] === 'number' &&
    (baseline['observedMetrics'] === null || isMetrics(baseline['observedMetrics'])) &&
    (baseline['baselineMetrics'] === null || isMetrics(baseline['baselineMetrics'])) &&
    outcomeBaseline['policyVersion'] === 'strategic-outcome-followup-v1' &&
    (outcomeBaseline['status'] === 'collecting' || outcomeBaseline['status'] === 'established') &&
    outcomeBaseline['minimumSampleSize'] === 5 &&
    typeof outcomeBaseline['sampleSize'] === 'number' &&
    typeof outcomeBaseline['remainingSamples'] === 'number' &&
    typeof outcomeBaseline['completed'] === 'number' &&
    typeof outcomeBaseline['partial'] === 'number' &&
    typeof outcomeBaseline['notExecuted'] === 'number' &&
    (outcomeBaseline['observedMetrics'] === null || isStrategicOutcomeMetrics(outcomeBaseline['observedMetrics'])) &&
    (outcomeBaseline['baselineMetrics'] === null || isStrategicOutcomeMetrics(outcomeBaseline['baselineMetrics'])) &&
    payload['recentReviews'].every((review) => isRecord(review) &&
      typeof review['id'] === 'string' && typeof review['actionId'] === 'string' &&
      typeof review['actionTitle'] === 'string' && isStrategicActionKind(review['actionKind']) &&
      typeof review['actionRank'] === 'number' &&
      (review['decision'] === 'accepted' || review['decision'] === 'rejected' || review['decision'] === 'needs_revision') &&
      isDecisionScale(review['usefulness']) && isDecisionScale(review['trust']) &&
      isDecisionScale(review['friction']) && typeof review['strategyRevision'] === 'number' &&
      typeof review['decisionContextRevision'] === 'number' &&
      typeof review['decisionContextHash'] === 'string' &&
      typeof review['decisionWindowEndsAt'] === 'string' && typeof review['reviewedAt'] === 'string') &&
    payload['recentOutcomes'].every((outcome) => isRecord(outcome) &&
      typeof outcome['id'] === 'string' && typeof outcome['reviewId'] === 'string' &&
      typeof outcome['actionId'] === 'string' && typeof outcome['actionTitle'] === 'string' &&
      isStrategicOutcomeExecutionStatus(outcome['executionStatus']) &&
      isDecisionScale(outcome['satisfaction']) && isDecisionScale(outcome['regret']) &&
      isDecisionScale(outcome['energy']) &&
      (outcome['engagementQuality'] === undefined || isDecisionScale(outcome['engagementQuality'])) &&
      (outcome['interactionDepth'] === undefined || isDecisionScale(outcome['interactionDepth'])) &&
      typeof outcome['privateMessages'] === 'number' &&
      typeof outcome['opportunitiesCreated'] === 'number' &&
      isStrategicOutcomeChange(outcome['relationshipChange']) &&
      typeof outcome['mediaOpportunities'] === 'number' &&
      isStrategicOutcomeChange(outcome['perceptionShift']) &&
      isStrategicBusinessOutcome(outcome['businessOutcome']) &&
      typeof outcome['outcomeOccurredAt'] === 'string' && typeof outcome['recordedAt'] === 'string')
  );
}

function isStrategicOutcomeMetrics(value: unknown): value is StrategicOutcomeMetrics {
  if (!isRecord(value)) return false;
  return typeof value['completionRate'] === 'number' &&
    typeof value['followThroughRate'] === 'number' &&
    typeof value['averageSatisfaction'] === 'number' &&
    typeof value['averageRegret'] === 'number' && typeof value['averageEnergy'] === 'number' &&
    (value['averageEngagementQuality'] === null || typeof value['averageEngagementQuality'] === 'number') &&
    (value['averageInteractionDepth'] === null || typeof value['averageInteractionDepth'] === 'number') &&
    typeof value['privateMessages'] === 'number' &&
    typeof value['opportunitiesCreated'] === 'number' &&
    typeof value['relationshipImprovements'] === 'number' &&
    typeof value['mediaOpportunities'] === 'number' &&
    typeof value['positivePerceptionShifts'] === 'number' &&
    typeof value['materialBusinessOutcomes'] === 'number';
}

function isWorkflowCostSnapshot(payload: unknown): payload is WorkflowCostSnapshot {
  if (
    !isRecord(payload) || payload['policyVersion'] !== 'workflow-cost-budget-v1' ||
    typeof payload['generatedAt'] !== 'string' || !isPersistence(payload['persistence']) ||
    !isRecord(payload['policy']) || !isRecord(payload['day']) || !isRecord(payload['usage']) ||
    !Array.isArray(payload['workflows']) || !Array.isArray(payload['recentReservations']) ||
    !Array.isArray(payload['recentCharges'])
  ) return false;
  const policy = payload['policy'];
  const day = payload['day'];
  const usage = payload['usage'];
  const numericPolicy = [
    'perInvocationBudgetMinorUnits', 'perWorkflowBudgetMinorUnits', 'dailyBudgetMinorUnits',
    'maxInvocationsPerWorkflow', 'maxStepsPerWorkflow', 'warningRatio',
  ];
  const numericUsage = [
    'chargeCount', 'measuredChargeCount', 'estimatedChargeCount', 'unmeteredChargeCount',
    'inputTokens', 'outputTokens', 'cachedInputTokens', 'modelMinorUnits',
    'embeddingMinorUnits', 'storageMinorUnits', 'searchMinorUnits', 'toolApiMinorUnits',
    'computeMinorUnits', 'humanReviewSeconds',
  ];
  return (
    policy['version'] === 'workflow-cost-budget-v1' && policy['currency'] === 'USD' &&
    numericPolicy.every((key) => typeof policy[key] === 'number') &&
    ['no_usage', 'measured', 'estimated', 'unmetered', 'mixed'].includes(String(payload['truthStatus'])) &&
    typeof day['date'] === 'string' && typeof day['chargedCostMinorUnits'] === 'number' &&
    typeof day['activeReservedCostMinorUnits'] === 'number' &&
    typeof day['remainingCostMinorUnits'] === 'number' &&
    ['within_budget', 'warning', 'circuit_open'].includes(String(day['status'])) &&
    numericUsage.every((key) => typeof usage[key] === 'number') &&
    payload['workflows'].every((workflow) => isRecord(workflow) &&
      typeof workflow['workflowId'] === 'string' && isWorkflowCostKind(workflow['kind']) &&
      typeof workflow['invocationCount'] === 'number' &&
      typeof workflow['chargedCostMinorUnits'] === 'number' &&
      typeof workflow['activeReservedCostMinorUnits'] === 'number' &&
      typeof workflow['actualSteps'] === 'number' &&
      ['within_budget', 'warning', 'circuit_open'].includes(String(workflow['status']))) &&
    payload['recentReservations'].every((entry) => isRecord(entry) &&
      typeof entry['id'] === 'string' && typeof entry['workflowId'] === 'string' &&
      isWorkflowCostKind(entry['kind']) && typeof entry['estimatedCostMinorUnits'] === 'number' &&
      (entry['decision'] === 'allowed' || entry['decision'] === 'blocked') &&
      typeof entry['reservedAt'] === 'string') &&
    payload['recentCharges'].every((entry) => isRecord(entry) &&
      typeof entry['id'] === 'string' && typeof entry['reservationId'] === 'string' &&
      typeof entry['actualCostMinorUnits'] === 'number' && typeof entry['chargedAt'] === 'string')
  );
}

function isWorkflowCostKind(value: unknown): value is WorkflowCostKind {
  return value === 'strategy_recommendation' || value === 'draft_generation' ||
    value === 'research' || value === 'platform_adaptation' ||
    value === 'evaluation' || value === 'other';
}

function isModelGovernanceSnapshot(payload: unknown): payload is ModelGovernanceSnapshot {
  if (
    !isRecord(payload) || payload['policyVersion'] !== 'prompt-model-governance-v1' ||
    typeof payload['generatedAt'] !== 'string' || typeof payload['providerConfigured'] !== 'boolean' ||
    typeof payload['executionEnabled'] !== 'boolean' || payload['costGateRequired'] !== true ||
    payload['durableInvocationJournal'] !== false || !Array.isArray(payload['routes'])
  ) return false;
  return payload['routes'].every((route) => isRecord(route) &&
    typeof route['id'] === 'string' && isModelPurpose(route['purpose']) &&
    typeof route['schemaName'] === 'string' && typeof route['promptVersion'] === 'string' &&
    typeof route['provider'] === 'string' && typeof route['model'] === 'string' &&
    ['economy', 'balanced', 'reasoning'].includes(String(route['modelTier'])) &&
    ['low', 'medium', 'high'].includes(String(route['risk'])) &&
    Array.isArray(route['allowedDataClasses']) && route['allowedDataClasses'].every((value) =>
      ['public', 'internal', 'confidential', 'restricted'].includes(String(value))) &&
    typeof route['maxOutputTokens'] === 'number' &&
    typeof route['estimatedCostMinorUnits'] === 'number' &&
    typeof route['plannedSteps'] === 'number' && typeof route['timeoutMs'] === 'number' &&
    ['disabled', 'shadow', 'canary', 'active'].includes(String(route['rollout'])) &&
    typeof route['evalSuite'] === 'string' &&
    ['not_run', 'failed', 'passed'].includes(String(route['evalStatus'])));
}

function isModelPurpose(value: unknown): boolean {
  return value === 'extract_evidence' || value === 'synthesize_hypothesis' ||
    value === 'strategy_options' || value === 'draft_content' || value === 'evaluate_output';
}

function isStrategicOutcomeExecutionStatus(value: unknown): value is StrategicOutcomeExecutionStatus {
  return value === 'completed' || value === 'partial' || value === 'not_executed';
}

function isStrategicOutcomeChange(value: unknown): value is StrategicOutcomeChange {
  return value === 'positive' || value === 'none' || value === 'negative' || value === 'unknown';
}

function isStrategicBusinessOutcome(value: unknown): value is StrategicBusinessOutcome {
  return value === 'none' || value === 'early_signal' || value === 'material' || value === 'unknown';
}

function isStrategicActionKind(value: unknown): value is WorkbenchAction['kind'] {
  return value === 'no_action' || value === 'private_conversation' || value === 'relationship' ||
    value === 'content' || value === 'media' || value === 'event' || value === 'research';
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
    (data['arbitration'] === null || isArbitrationWorkspaceSnapshot(data['arbitration'])) &&
    (data['initiative'] === null || isInitiativeWorkspaceSnapshot(data['initiative'])) &&
    (data['relationships'] === null || isRelationshipWorkspaceSnapshot(data['relationships'])) &&
    (data['perception'] === null || isPerceptionWorkspaceSnapshot(data['perception'])) &&
    (data['draft'] === null || isDraftWorkspaceSnapshot(data['draft'])) &&
    isFeedbackLearningSnapshot(data['feedback']) &&
    (data['strategicQuality'] === null || isStrategicQualitySnapshot(data['strategicQuality'])) &&
    (data['workflowCosts'] === null || isWorkflowCostSnapshot(data['workflowCosts'])) &&
    (data['modelGovernance'] === null || isModelGovernanceSnapshot(data['modelGovernance'])) &&
    isAuditTrailSnapshot(data['activity'])
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
