import {
  ArrowUpLeft,
  BellRing,
  BrainCircuit,
  BookOpenText,
  Check,
  ChevronLeft,
  CircleGauge,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  Fingerprint,
  History,
  Lightbulb,
  LockKeyhole,
  LoaderCircle,
  MessageCircleMore,
  Network,
  PencilLine,
  Radar,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react';
import {
  WorkbenchApiError,
  applyTextAssetRight,
  applyMemoryRight,
  assessArbitration,
  approveWorkbenchAction,
  approveDraft,
  confirmMemoryProposal,
  createDraft,
  createPerceptionSignal,
  createStakeholder,
  deletePerceptionSignal,
  deleteStakeholder,
  editDraft,
  exportAccountData,
  exportDraft,
  evaluateInitiative,
  importTextAsset,
  importResearchSource,
  loadAuthenticExpression,
  reviewClaim,
  reviewAuthenticExpression,
  reviewRisk,
  decideLearnedPreference,
  loadDraftWorkspace,
  loadDraftSources,
  loadFeedbackLearning,
  loadAuditTrail,
  loadArbitration,
  loadInitiative,
  loadRelationships,
  loadOnboarding,
  loadOpportunityRadar,
  loadPerception,
  loadPersonalMemory,
  loadResearch,
  loadClaims,
  loadRisk,
  loadStrategyContext,
  loadWorkbench,
  rejectDraftFeedback,
  saveStrategyContext,
  submitConversationTurn,
  updateInitiativeSettings,
  type AppliedMemoryRight,
  type ArbitrationWorkspaceSnapshot,
  type AuthenticExpressionReview,
  type AuthenticExpressionSnapshot,
  type AutonomyLevel,
  type AuditTrailSnapshot,
  type ConversationTurnResult,
  type DraftChannel,
  type DraftSourceKind,
  type DraftSourceSnapshot,
  type DraftWorkspaceSnapshot,
  type FeedbackLearningSnapshot,
  type MemoryRightKind,
  type OnboardingSnapshot,
  type OpportunityRadarSnapshot,
  type PerceptionConfidence,
  type PerceptionDimension,
  type PerceptionPerspective,
  type PerceptionSourceKind,
  type PerceptionStage,
  type PerceptionWorkspaceSnapshot,
  type PersonalMemoryRecord,
  type PersonalMemorySnapshot,
  type ResearchSourceQuality,
  type ResearchSourceStance,
  type ResearchWorkspaceSnapshot,
  type ClaimGovernanceSnapshot,
  type ClaimReviewDecision,
  type BrandProtectionSnapshot,
  type InitiativeMode,
  type InitiativeWorkspaceSnapshot,
  type RelationshipBoundary,
  type RelationshipStrength,
  type RelationshipWorkspaceSnapshot,
  type RiskReviewDecision,
  type EditableStrategyContext,
  type StrategyContextSnapshot,
  type StakeholderGroup,
  type StakeholderPriority,
  type TextAssetRightOperation,
  type WorkbenchAction,
  type WorkbenchSnapshot,
} from './api';

const kindLabels: Readonly<Record<WorkbenchAction['kind'], string>> = {
  no_action: 'سکوت آگاهانه',
  private_conversation: 'گفت‌وگوی خصوصی',
  relationship: 'رابطه',
  content: 'محتوا',
  media: 'رسانه',
  event: 'رویداد',
  research: 'تحقیق',
};

const riskLabels: Readonly<Record<WorkbenchAction['riskLevel'], string>> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'زیاد',
};

export function App() {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null);
  const [activeView, setActiveView] = useState<'today' | 'intake' | 'memory' | 'research' | 'opportunities' | 'claims' | 'risk' | 'arbitration' | 'initiative' | 'relationships' | 'perception' | 'expression' | 'strategy' | 'draft' | 'learning' | 'data'>('today');
  const [selected, setSelected] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'approving' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [conversationId] = useState(() => `conversation_${Date.now().toString(36)}`);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [conversationText, setConversationText] = useState('');
  const [proposeMemory, setProposeMemory] = useState(false);
  const [conversationResult, setConversationResult] = useState<ConversationTurnResult | null>(null);
  const [conversationState, setConversationState] = useState<
    'idle' | 'sending' | 'confirming' | 'applying_right'
  >('idle');
  const [memoryConfirmed, setMemoryConfirmed] = useState(false);
  const [memoryBrandUsage, setMemoryBrandUsage] = useState(false);
  const [memoryPersistence, setMemoryPersistence] = useState<
    'memory' | 'postgres' | 'ephemeral' | null
  >(null);
  const [memoryRightKind, setMemoryRightKind] = useState<MemoryRightKind>('contest');
  const [memoryRightReason, setMemoryRightReason] = useState('');
  const [correctedMemoryText, setCorrectedMemoryText] = useState('');
  const [memoryRightRequestId, setMemoryRightRequestId] = useState<string | null>(null);
  const [memoryRightResult, setMemoryRightResult] = useState<AppliedMemoryRight | null>(null);
  const [memorySnapshot, setMemorySnapshot] = useState<PersonalMemorySnapshot | null>(null);
  const [memoryViewState, setMemoryViewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [memoryViewError, setMemoryViewError] = useState<string | null>(null);
  const [strategySnapshot, setStrategySnapshot] = useState<StrategyContextSnapshot | null>(null);
  const [strategyViewState, setStrategyViewState] = useState<'idle' | 'loading' | 'ready' | 'saving' | 'error'>('idle');
  const [strategyViewError, setStrategyViewError] = useState<string | null>(null);
  const [researchSnapshot, setResearchSnapshot] = useState<ResearchWorkspaceSnapshot | null>(null);
  const [researchViewState, setResearchViewState] = useState<'idle' | 'loading' | 'ready' | 'mutating' | 'error'>('idle');
  const [researchViewError, setResearchViewError] = useState<string | null>(null);
  const [opportunitySnapshot, setOpportunitySnapshot] = useState<OpportunityRadarSnapshot | null>(null);
  const [opportunityViewState, setOpportunityViewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [opportunityViewError, setOpportunityViewError] = useState<string | null>(null);
  const [claimSnapshot, setClaimSnapshot] = useState<ClaimGovernanceSnapshot | null>(null);
  const [claimViewState, setClaimViewState] = useState<'idle' | 'loading' | 'ready' | 'mutating' | 'error'>('idle');
  const [claimViewError, setClaimViewError] = useState<string | null>(null);
  const [riskSnapshot, setRiskSnapshot] = useState<BrandProtectionSnapshot | null>(null);
  const [riskViewState, setRiskViewState] = useState<'idle' | 'loading' | 'ready' | 'mutating' | 'error'>('idle');
  const [riskViewError, setRiskViewError] = useState<string | null>(null);
  const [arbitrationSnapshot, setArbitrationSnapshot] = useState<ArbitrationWorkspaceSnapshot | null>(null);
  const [arbitrationViewState, setArbitrationViewState] = useState<'idle' | 'loading' | 'ready' | 'mutating' | 'error'>('idle');
  const [arbitrationViewError, setArbitrationViewError] = useState<string | null>(null);
  const [initiativeSnapshot, setInitiativeSnapshot] = useState<InitiativeWorkspaceSnapshot | null>(null);
  const [initiativeViewState, setInitiativeViewState] = useState<'idle' | 'loading' | 'ready' | 'mutating' | 'error'>('idle');
  const [initiativeViewError, setInitiativeViewError] = useState<string | null>(null);
  const initiativeAutoKey = useRef('');
  const [relationshipSnapshot, setRelationshipSnapshot] = useState<RelationshipWorkspaceSnapshot | null>(null);
  const [relationshipViewState, setRelationshipViewState] = useState<'idle' | 'loading' | 'ready' | 'mutating' | 'error'>('idle');
  const [relationshipViewError, setRelationshipViewError] = useState<string | null>(null);
  const [perceptionSnapshot, setPerceptionSnapshot] = useState<PerceptionWorkspaceSnapshot | null>(null);
  const [perceptionViewState, setPerceptionViewState] = useState<'idle' | 'loading' | 'ready' | 'mutating' | 'error'>('idle');
  const [perceptionViewError, setPerceptionViewError] = useState<string | null>(null);
  const [expressionSnapshot, setExpressionSnapshot] = useState<AuthenticExpressionSnapshot | null>(null);
  const [expressionReview, setExpressionReview] = useState<AuthenticExpressionReview | null>(null);
  const [expressionViewState, setExpressionViewState] = useState<'idle' | 'loading' | 'ready' | 'reviewing' | 'error'>('idle');
  const [expressionViewError, setExpressionViewError] = useState<string | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<DraftWorkspaceSnapshot | null>(null);
  const [draftSources, setDraftSources] = useState<DraftSourceSnapshot | null>(null);
  const [draftViewState, setDraftViewState] = useState<'idle' | 'loading' | 'ready' | 'mutating' | 'error'>('idle');
  const [draftViewError, setDraftViewError] = useState<string | null>(null);
  const [feedbackSnapshot, setFeedbackSnapshot] = useState<FeedbackLearningSnapshot | null>(null);
  const [feedbackViewState, setFeedbackViewState] = useState<'idle' | 'loading' | 'ready' | 'mutating' | 'error'>('idle');
  const [feedbackViewError, setFeedbackViewError] = useState<string | null>(null);
  const [auditSnapshot, setAuditSnapshot] = useState<AuditTrailSnapshot | null>(null);
  const [dataViewState, setDataViewState] = useState<'idle' | 'loading' | 'ready' | 'exporting' | 'error'>('idle');
  const [dataViewError, setDataViewError] = useState<string | null>(null);
  const [onboardingSnapshot, setOnboardingSnapshot] = useState<OnboardingSnapshot | null>(null);
  const [onboardingState, setOnboardingState] = useState<'loading' | 'ready' | 'mutating' | 'error'>('loading');
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setState('loading');
    setError(null);
    try {
      const [next, onboarding, initiative] = await Promise.all([
        loadWorkbench(signal),
        loadOnboarding(signal),
        loadInitiative(signal),
      ]);
      setSnapshot(next);
      setOnboardingSnapshot(onboarding);
      setOnboardingState('ready');
      setInitiativeSnapshot(initiative);
      setInitiativeViewState('ready');
      setSelected((current) =>
        next.actions.some((action) => action.id === current)
          ? current
          : (next.workflow.approvedActionId ?? next.actions[0].id),
      );
      setState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setError(errorMessage(caught));
      setState('error');
    }
  }, []);

  const refreshOnboarding = useCallback(async (signal?: AbortSignal) => {
    setOnboardingState('loading');
    setOnboardingError(null);
    try {
      setOnboardingSnapshot(await loadOnboarding(signal));
      setOnboardingState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setOnboardingError(errorMessage(caught));
      setOnboardingState('error');
    }
  }, []);

  const addTextAsset = async (input: Readonly<{
    title: string;
    content: string;
    assertionText: string;
    occurredAt: string;
    brandUsage: boolean;
  }>) => {
    setOnboardingState('mutating');
    setOnboardingError(null);
    try {
      await importTextAsset({
        requestId: `asset_${crypto.randomUUID()}`,
        title: input.title,
        content: input.content,
        assertionText: input.assertionText,
        occurredAt: input.occurredAt,
        permissions: { personalUnderstanding: true, brandUsage: input.brandUsage },
      });
      await refresh();
      await refreshAudit();
    } catch (caught: unknown) {
      setOnboardingError(errorMessage(caught));
      setOnboardingState('error');
      throw caught;
    }
  };

  const controlTextAsset = async (
    assetId: string,
    operation: TextAssetRightOperation,
  ) => {
    setOnboardingState('mutating');
    setOnboardingError(null);
    try {
      await applyTextAssetRight({
        requestId: `asset_right_${crypto.randomUUID()}`,
        assetId,
        operation,
        reason: operation === 'delete'
          ? 'درخواست مالک برای حذف این منبع.'
          : 'درخواست مالک برای لغو استفاده این منبع در تحلیل برند.',
      });
      await refresh();
      await refreshAudit();
    } catch (caught: unknown) {
      setOnboardingError(errorMessage(caught));
      setOnboardingState('error');
      throw caught;
    }
  };

  const refreshMemory = useCallback(async (signal?: AbortSignal) => {
    setMemoryViewState('loading');
    setMemoryViewError(null);
    try {
      const next = await loadPersonalMemory(signal);
      setMemorySnapshot(next);
      setMemoryViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setMemoryViewError(errorMessage(caught));
      setMemoryViewState('error');
    }
  }, []);

  const refreshStrategy = useCallback(async (signal?: AbortSignal) => {
    setStrategyViewState('loading');
    setStrategyViewError(null);
    try {
      const next = await loadStrategyContext(signal);
      setStrategySnapshot(next);
      setStrategyViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setStrategyViewError(errorMessage(caught));
      setStrategyViewState('error');
    }
  }, []);

  const refreshResearch = useCallback(async (signal?: AbortSignal) => {
    setResearchViewState('loading');
    setResearchViewError(null);
    try {
      setResearchSnapshot(await loadResearch(signal));
      setResearchViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setResearchViewError(errorMessage(caught));
      setResearchViewState('error');
    }
  }, []);

  const refreshOpportunities = useCallback(async (signal?: AbortSignal) => {
    setOpportunityViewState('loading');
    setOpportunityViewError(null);
    try {
      setOpportunitySnapshot(await loadOpportunityRadar(signal));
      setOpportunityViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setOpportunityViewError(errorMessage(caught));
      setOpportunityViewState('error');
    }
  }, []);

  const addResearchSource = async (input: Readonly<{
    title: string;
    publisher: string;
    url: string;
    excerpt: string;
    statement: string;
    quality: ResearchSourceQuality;
    stance: ResearchSourceStance;
    publishedAt: string;
    maxAgeDays: number;
  }>) => {
    setResearchViewState('mutating');
    setResearchViewError(null);
    try {
      await importResearchSource({ requestId: `research_${crypto.randomUUID()}`, ...input });
      await Promise.all([refreshResearch(), refreshAudit()]);
    } catch (caught: unknown) {
      setResearchViewError(errorMessage(caught));
      setResearchViewState('error');
    }
  };

  const refreshClaims = useCallback(async (signal?: AbortSignal) => {
    setClaimViewState('loading');
    setClaimViewError(null);
    try {
      setClaimSnapshot(await loadClaims(signal));
      setClaimViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setClaimViewError(errorMessage(caught));
      setClaimViewState('error');
    }
  }, []);

  const submitClaimReview = async (input: Readonly<{
    claimId: string;
    expectedStatus: ClaimGovernanceSnapshot['claims'][number]['status'];
    decision: ClaimReviewDecision;
    rationale: string;
    humanAttestation: boolean;
  }>) => {
    setClaimViewState('mutating');
    setClaimViewError(null);
    try {
      await reviewClaim({ requestId: `claim_review_${crypto.randomUUID()}`, ...input });
      await Promise.all([refreshClaims(), refreshDraft(), refreshAudit()]);
    } catch (caught: unknown) {
      setClaimViewError(errorMessage(caught));
      setClaimViewState('error');
    }
  };

  const refreshRisk = useCallback(async (signal?: AbortSignal) => {
    setRiskViewState('loading');
    setRiskViewError(null);
    try {
      setRiskSnapshot(await loadRisk(signal));
      setRiskViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setRiskViewError(errorMessage(caught));
      setRiskViewState('error');
    }
  }, []);

  const submitRiskReview = async (input: Readonly<{
    actionId: string;
    expectedLevel: 'green' | 'yellow' | 'red';
    expectedAssessmentHash: string;
    decision: RiskReviewDecision;
    rationale: string;
    humanAttestation: boolean;
  }>) => {
    setRiskViewState('mutating');
    setRiskViewError(null);
    try {
      await reviewRisk({ requestId: `risk_review_${crypto.randomUUID()}`, ...input });
      await Promise.all([refreshRisk(), refreshArbitration(), refreshAudit()]);
    } catch (caught: unknown) {
      setRiskViewError(errorMessage(caught));
      setRiskViewState('error');
    }
  };

  const refreshArbitration = useCallback(async (signal?: AbortSignal) => {
    setArbitrationViewState('loading');
    setArbitrationViewError(null);
    try {
      const next = await loadArbitration(signal);
      setArbitrationSnapshot(next);
      setSelected((current) => next.availableActions.some((action) => action.id === current)
        ? current
        : (next.availableActions[0]?.id ?? ''));
      setArbitrationViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setArbitrationViewError(errorMessage(caught));
      setArbitrationViewState('error');
    }
  }, []);

  const submitArbitration = async (actionId: string, requestedAutonomyLevel: AutonomyLevel) => {
    if (arbitrationViewState === 'mutating') return;
    setArbitrationViewState('mutating');
    setArbitrationViewError(null);
    try {
      await assessArbitration({
        requestId: `arbitration_${crypto.randomUUID()}`,
        actionId,
        requestedAutonomyLevel,
      });
      await Promise.all([refreshArbitration(), refreshAudit()]);
    } catch (caught: unknown) {
      setArbitrationViewError(errorMessage(caught));
      setArbitrationViewState('error');
    }
  };

  const refreshInitiative = useCallback(async (signal?: AbortSignal) => {
    setInitiativeViewState('loading');
    setInitiativeViewError(null);
    try {
      setInitiativeSnapshot(await loadInitiative(signal));
      setInitiativeViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setInitiativeViewError(errorMessage(caught));
      setInitiativeViewState('error');
    }
  }, []);

  const saveInitiativeSettings = async (input: Readonly<{
    mode: InitiativeMode;
    maxPromptsPer24Hours: 1 | 2 | 3;
    minimumRelevance: number;
    pausedUntil: string | null;
  }>) => {
    if (!initiativeSnapshot || initiativeViewState === 'mutating') return;
    setInitiativeViewState('mutating');
    setInitiativeViewError(null);
    try {
      await updateInitiativeSettings({
        requestId: `initiative_settings_${crypto.randomUUID()}`,
        expectedRevision: initiativeSnapshot.settings.revision,
        ...input,
      });
      await Promise.all([refreshInitiative(), refreshAudit()]);
    } catch (caught: unknown) {
      setInitiativeViewError(errorMessage(caught));
      setInitiativeViewState('error');
    }
  };

  const runInitiativeEvaluation = useCallback(async () => {
    setInitiativeViewState('mutating');
    setInitiativeViewError(null);
    try {
      await evaluateInitiative({ requestId: `initiative_${crypto.randomUUID()}` });
      await refreshInitiative();
    } catch (caught: unknown) {
      setInitiativeViewError(errorMessage(caught));
      setInitiativeViewState('error');
    }
  }, [refreshInitiative]);

  const refreshRelationships = useCallback(async (signal?: AbortSignal) => {
    setRelationshipViewState('loading');
    setRelationshipViewError(null);
    try {
      setRelationshipSnapshot(await loadRelationships(signal));
      setRelationshipViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setRelationshipViewError(errorMessage(caught));
      setRelationshipViewState('error');
    }
  }, []);

  const addStakeholder = async (input: Readonly<{
    label: string;
    group: StakeholderGroup;
    outcome: string;
    priority: StakeholderPriority;
    strength: RelationshipStrength;
    boundary: RelationshipBoundary;
    contextNote: string;
    lastInteractionAt: string | null;
    consentConfirmed: boolean;
  }>) => {
    if (relationshipViewState === 'mutating') return;
    setRelationshipViewState('mutating');
    setRelationshipViewError(null);
    try {
      await createStakeholder({ requestId: `relationship_${crypto.randomUUID()}`, ...input });
      await Promise.all([refreshRelationships(), refreshAudit()]);
    } catch (caught: unknown) {
      setRelationshipViewError(errorMessage(caught));
      setRelationshipViewState('error');
    }
  };

  const removeStakeholder = async (stakeholderId: string) => {
    if (relationshipViewState === 'mutating') return;
    setRelationshipViewState('mutating');
    setRelationshipViewError(null);
    try {
      await deleteStakeholder({ requestId: `relationship_delete_${crypto.randomUUID()}`, stakeholderId });
      await Promise.all([refreshRelationships(), refreshAudit()]);
    } catch (caught: unknown) {
      setRelationshipViewError(errorMessage(caught));
      setRelationshipViewState('error');
    }
  };

  const refreshPerception = useCallback(async (signal?: AbortSignal) => {
    setPerceptionViewState('loading');
    setPerceptionViewError(null);
    try {
      setPerceptionSnapshot(await loadPerception(signal));
      setPerceptionViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setPerceptionViewError(errorMessage(caught));
      setPerceptionViewState('error');
    }
  }, []);

  const addPerceptionSignal = async (input: Readonly<{
    dimension: PerceptionDimension;
    perspective: PerceptionPerspective;
    stage: PerceptionStage;
    summary: string;
    evidenceNote: string;
    sourceKind: PerceptionSourceKind;
    confidence: PerceptionConfidence;
    observedAt: string;
    consentConfirmed: boolean;
  }>) => {
    if (perceptionViewState === 'mutating') return;
    setPerceptionViewState('mutating');
    setPerceptionViewError(null);
    try {
      await createPerceptionSignal({ requestId: `perception_${crypto.randomUUID()}`, ...input });
      await Promise.all([refreshPerception(), refreshAudit()]);
    } catch (caught: unknown) {
      setPerceptionViewError(errorMessage(caught));
      setPerceptionViewState('error');
    }
  };

  const removePerceptionSignal = async (signalId: string) => {
    if (perceptionViewState === 'mutating') return;
    setPerceptionViewState('mutating');
    setPerceptionViewError(null);
    try {
      await deletePerceptionSignal({ requestId: `perception_delete_${crypto.randomUUID()}`, signalId });
      await Promise.all([refreshPerception(), refreshAudit()]);
    } catch (caught: unknown) {
      setPerceptionViewError(errorMessage(caught));
      setPerceptionViewState('error');
    }
  };

  const refreshExpression = useCallback(async (signal?: AbortSignal) => {
    setExpressionViewState('loading');
    setExpressionViewError(null);
    try {
      setExpressionSnapshot(await loadAuthenticExpression(signal));
      setExpressionViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setExpressionViewError(errorMessage(caught));
      setExpressionViewState('error');
    }
  }, []);

  const analyzeExpression = async (input: Readonly<{ content: string; assetRefs: readonly string[] }>) => {
    if (expressionViewState === 'reviewing') return;
    setExpressionViewState('reviewing');
    setExpressionViewError(null);
    try {
      setExpressionReview(await reviewAuthenticExpression(input));
      setExpressionViewState('ready');
    } catch (caught: unknown) {
      setExpressionViewError(errorMessage(caught));
      setExpressionViewState('error');
    }
  };

  const saveStrategy = async (value: EditableStrategyContext) => {
    if (!strategySnapshot || strategyViewState === 'saving') return;
    setStrategyViewState('saving');
    setStrategyViewError(null);
    try {
      const next = await saveStrategyContext({
        requestId: `strategy_${crypto.randomUUID()}`,
        expectedRevision: strategySnapshot.revision,
        value,
      });
      setStrategySnapshot(next);
      setStrategyViewState('ready');
      await refresh();
    } catch (caught: unknown) {
      setStrategyViewError(errorMessage(caught));
      setStrategyViewState('error');
    }
  };

  const refreshDraft = useCallback(async (signal?: AbortSignal) => {
    setDraftViewState('loading');
    setDraftViewError(null);
    try {
      const [draft, sources] = await Promise.all([
        loadDraftWorkspace(signal),
        loadDraftSources(signal),
      ]);
      setDraftSnapshot(draft);
      setDraftSources(sources);
      setDraftViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setDraftViewError(errorMessage(caught));
      setDraftViewState('error');
    }
  }, []);

  const refreshFeedback = useCallback(async (signal?: AbortSignal) => {
    setFeedbackViewState('loading');
    setFeedbackViewError(null);
    try {
      setFeedbackSnapshot(await loadFeedbackLearning(signal));
      setFeedbackViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setFeedbackViewError(errorMessage(caught));
      setFeedbackViewState('error');
    }
  }, []);

  const refreshAudit = useCallback(async (signal?: AbortSignal) => {
    setDataViewState('loading');
    setDataViewError(null);
    try {
      setAuditSnapshot(await loadAuditTrail(signal));
      setDataViewState('ready');
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setDataViewError(errorMessage(caught));
      setDataViewState('error');
    }
  }, []);

  const exportMyData = async () => {
    if (dataViewState === 'exporting') return;
    setDataViewState('exporting');
    setDataViewError(null);
    try {
      const exported = await exportAccountData();
      downloadText(
        `pr-personal-data-${exported.exportedAt.slice(0, 10)}.json`,
        'application/json;charset=utf-8',
        JSON.stringify(exported, null, 2),
      );
      setAuditSnapshot(await loadAuditTrail());
      setDataViewState('ready');
    } catch (caught: unknown) {
      setDataViewError(errorMessage(caught));
      setDataViewState('error');
    }
  };

  const createDraftWorkspace = async (input: Readonly<{
    sourceKind: DraftSourceKind;
    sourceRef: string;
    channel: DraftChannel;
    narrativeAngle: string;
    takeaway: string;
    publicDraftingConsent: boolean;
  }>) => {
    setDraftViewState('mutating');
    setDraftViewError(null);
    try {
      const next = await createDraft({ requestId: `draft_${crypto.randomUUID()}`, ...input });
      setDraftSnapshot(next);
      setDraftViewState('ready');
      await refreshMemory();
    } catch (caught: unknown) {
      setDraftViewError(errorMessage(caught));
      setDraftViewState('error');
    }
  };

  const mutateDraft = async (operation: 'edit' | 'approve' | 'export', body?: string) => {
    if (!draftSnapshot) return;
    setDraftViewState('mutating');
    setDraftViewError(null);
    try {
      if (operation === 'edit') {
        const next = await editDraft({
          draftId: draftSnapshot.draftId,
          requestId: `draft_edit_${crypto.randomUUID()}`,
          expectedRevision: draftSnapshot.revision,
          body: body ?? draftSnapshot.body,
        });
        setDraftSnapshot(next);
        await refreshFeedback();
      } else if (operation === 'approve') {
        const next = await approveDraft({
          draftId: draftSnapshot.draftId,
          requestId: `draft_approve_${crypto.randomUUID()}`,
          expectedRevision: draftSnapshot.revision,
        });
        setDraftSnapshot(next);
      } else {
        const exported = await exportDraft({
          draftId: draftSnapshot.draftId,
          requestId: `draft_export_${crypto.randomUUID()}`,
          expectedRevision: draftSnapshot.revision,
        });
        setDraftSnapshot(exported.draft);
        downloadText(exported.filename, exported.mimeType, exported.content);
      }
      setDraftViewState('ready');
    } catch (caught: unknown) {
      setDraftViewError(errorMessage(caught));
      setDraftViewState('error');
    }
  };

  const rejectCurrentDraft = async (reason: string) => {
    if (!draftSnapshot || feedbackViewState === 'mutating') return;
    setFeedbackViewState('mutating');
    setDraftViewError(null);
    try {
      const next = await rejectDraftFeedback({
        draftId: draftSnapshot.draftId,
        requestId: `draft_reject_${crypto.randomUUID()}`,
        reason,
      });
      setFeedbackSnapshot(next);
      setFeedbackViewState('ready');
    } catch (caught: unknown) {
      setDraftViewError(errorMessage(caught));
      setFeedbackViewState('error');
    }
  };

  const decidePreference = async (proposalId: string, decision: 'applied' | 'rejected' | 'revoked') => {
    if (feedbackViewState === 'mutating') return;
    setFeedbackViewState('mutating');
    setFeedbackViewError(null);
    try {
      setFeedbackSnapshot(await decideLearnedPreference({
        proposalId,
        requestId: `preference_${crypto.randomUUID()}`,
        decision,
      }));
      setFeedbackViewState('ready');
    } catch (caught: unknown) {
      setFeedbackViewError(errorMessage(caught));
      setFeedbackViewState('error');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => {
      controller.abort();
    };
  }, [refresh]);

  useEffect(() => {
    const candidate = initiativeSnapshot?.preview.candidate;
    if (
      !candidate || initiativeSnapshot.preview.decision !== 'delivered' ||
      initiativeSnapshot.settings.mode === 'reactive' || initiativeViewState !== 'ready'
    ) return;
    const key = `${String(initiativeSnapshot.settings.revision)}:${candidate.candidateId}`;
    if (initiativeAutoKey.current === key) return;
    initiativeAutoKey.current = key;
    void runInitiativeEvaluation();
  }, [initiativeSnapshot, initiativeViewState, runInitiativeEvaluation]);

  const selectedAction = useMemo(
    () => snapshot?.actions.find((action) => action.id === selected),
    [selected, snapshot],
  );
  const selectedIsApproved =
    snapshot?.workflow.status === 'approved' &&
    snapshot.workflow.approvedActionId === selected;
  const activeInitiativeCue = initiativeSnapshot?.evaluations.find(
    (item) => item.decision === 'delivered' && !item.stale && item.candidate,
  )?.candidate ?? null;

  const navigateFromInitiative = (target: 'intake' | 'today' | 'arbitration') => {
    setActiveView(target);
    if (target === 'intake') void refreshOnboarding();
    if (target === 'arbitration') void refreshArbitration();
  };

  const approve = async () => {
    if (!selectedAction || state === 'approving' || !selectedAction.feasible) return;
    if (selectedAction.interaction === 'open_intake') {
      setActiveView('intake');
      await refreshOnboarding();
      return;
    }
    if (selectedAction.interaction === 'open_conversation') {
      setActiveView('today');
      setConversationOpen(true);
      return;
    }
    setState('approving');
    setError(null);
    try {
      const next = await approveWorkbenchAction(selectedAction.id);
      setSnapshot(next);
      setState('ready');
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setState('ready');
      if (caught instanceof WorkbenchApiError && (caught.code === 'risk_review_required' || caught.code === 'risk_blocked')) {
        setActiveView('risk');
        await refreshRisk();
      }
    }
  };

  const submitConversation = async () => {
    const text = conversationText.trim();
    if (text.length < 3 || conversationState !== 'idle') return;
    setConversationState('sending');
    setError(null);
    setMemoryConfirmed(false);
    setMemoryBrandUsage(false);
    setMemoryRightResult(null);
    try {
      const result = await submitConversationTurn({
        conversationId,
        turnId: `turn_${crypto.randomUUID()}`,
        text,
        proposeMemory,
      });
      setConversationResult(result);
      setCorrectedMemoryText(text);
      setConversationState('idle');
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setConversationState('idle');
    }
  };

  const confirmMemory = async () => {
    const proposalId = conversationResult?.memoryProposal?.id;
    if (!proposalId || conversationState !== 'idle') return;
    setConversationState('confirming');
    setError(null);
    try {
      const confirmed = await confirmMemoryProposal(proposalId, memoryBrandUsage);
      setMemoryPersistence(confirmed.persistence);
      setMemoryConfirmed(true);
      setConversationState('idle');
      await Promise.all([refresh(), refreshMemory()]);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setConversationState('idle');
    }
  };

  const exerciseMemoryRight = async () => {
    const proposalId = conversationResult?.memoryProposal?.id;
    const reason = memoryRightReason.trim();
    const correctedText = correctedMemoryText.trim();
    if (
      !proposalId ||
      conversationState !== 'idle' ||
      reason.length < 3 ||
      (memoryRightKind === 'correct' && correctedText.length < 3)
    ) {
      return;
    }
    const requestId = memoryRightRequestId ?? `right_${crypto.randomUUID()}`;
    setMemoryRightRequestId(requestId);
    setConversationState('applying_right');
    setError(null);
    try {
      const result = await applyMemoryRight(proposalId, {
        requestId,
        operation: memoryRightKind,
        reason,
        ...(memoryRightKind === 'correct' ? { correctedText } : {}),
      });
      setMemoryRightResult(result);
      setMemoryRightRequestId(null);
      setConversationState('idle');
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setConversationState('idle');
    }
  };

  if (!snapshot) {
    return (
      <main className="boot-state" aria-live="polite">
        {state === 'loading' ? (
          <><LoaderCircle className="spin" size={28} /><h1>در حال دریافت تصمیم امروز…</h1></>
        ) : (
          <>
            <TriangleAlert size={30} />
            <h1>Workbench به API متصل نشد</h1>
            <p>{error}</p>
            <button type="button" onClick={() => void refresh()}><RefreshCw size={17} /> تلاش دوباره</button>
          </>
        )}
      </main>
    );
  }

  const nav = [
    { label: 'امروز', icon: CircleGauge, view: 'today' as const },
    { label: 'شروع و منابع', icon: BookOpenText, view: 'intake' as const },
    { label: 'حافظه من', icon: Fingerprint, view: 'memory' as const },
    {
      label: 'تحقیق بیرونی',
      icon: BookOpenText,
      view: 'research' as const,
      badge: researchSnapshot?.summary.conflicts ? String(researchSnapshot.summary.conflicts) : undefined,
    },
    {
      label: 'رادار فرصت',
      icon: Radar,
      view: 'opportunities' as const,
      badge: opportunitySnapshot?.summary.consider || opportunitySnapshot?.summary.explore
        ? String(opportunitySnapshot.summary.consider + opportunitySnapshot.summary.explore)
        : undefined,
    },
    {
      label: 'دفتر ادعاها',
      icon: ShieldCheck,
      view: 'claims' as const,
      badge: claimSnapshot?.summary.traceBlocked ? String(claimSnapshot.summary.traceBlocked) : undefined,
    },
    {
      label: 'حفاظت برند',
      icon: LockKeyhole,
      view: 'risk' as const,
      badge: riskSnapshot?.summary.blocked || riskSnapshot?.summary.reviewRequired
        ? String(riskSnapshot.summary.blocked + riskSnapshot.summary.reviewRequired)
        : undefined,
    },
    {
      label: 'داوری تصمیم',
      icon: Scale,
      view: 'arbitration' as const,
      badge: arbitrationSnapshot?.cases.filter((item) => item.decision.outcome === 'held' && !item.stale).length
        ? String(arbitrationSnapshot.cases.filter((item) => item.decision.outcome === 'held' && !item.stale).length)
        : undefined,
    },
    {
      label: 'ابتکار عمل',
      icon: BellRing,
      view: 'initiative' as const,
      badge: activeInitiativeCue ? '۱' : undefined,
    },
    {
      label: 'روابط',
      icon: Network,
      view: 'relationships' as const,
      badge: relationshipSnapshot?.summary.reviewSuggested
        ? String(relationshipSnapshot.summary.reviewSuggested)
        : undefined,
    },
    {
      label: 'ادراک',
      icon: Eye,
      view: 'perception' as const,
      badge: perceptionSnapshot?.summary.potentialBlindSpots
        ? String(perceptionSnapshot.summary.potentialBlindSpots)
        : undefined,
    },
    {
      label: 'روایت و Voice',
      icon: Sparkles,
      view: 'expression' as const,
      badge: expressionReview?.outcome === 'block' ? '!' : expressionReview?.outcome === 'revise' ? '۱' : undefined,
    },
    { label: 'استراتژی', icon: Lightbulb, view: 'strategy' as const },
    { label: 'پیش‌نویس', icon: PencilLine, view: 'draft' as const },
    {
      label: 'یادگیری',
      icon: BrainCircuit,
      view: 'learning' as const,
      badge: feedbackSnapshot?.summary.proposed ? String(feedbackSnapshot.summary.proposed) : undefined,
    },
    { label: 'داده و شفافیت', icon: History, view: 'data' as const },
    {
      label: 'تأییدها',
      icon: FileCheck2,
      badge: snapshot.workflow.status === 'awaiting_approval' ? '۱' : undefined,
    },
  ];

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand-mark"><span>PR</span><i /></div>
        <nav aria-label="ناوبری اصلی">
          {nav.map(({ label, icon: Icon, view, badge }) => (
            <button
              className={view === activeView ? 'nav-item active' : 'nav-item'}
              key={label}
              onClick={() => {
                if (!view) return;
                setActiveView(view);
                if (view === 'intake') void refreshOnboarding();
                if (view === 'memory') void refreshMemory();
                if (view === 'research') void refreshResearch();
                if (view === 'opportunities') void refreshOpportunities();
                if (view === 'claims') void refreshClaims();
                if (view === 'risk') void refreshRisk();
                if (view === 'arbitration') void refreshArbitration();
                if (view === 'initiative') void refreshInitiative();
                if (view === 'relationships') void refreshRelationships();
                if (view === 'perception') void refreshPerception();
                if (view === 'expression') void refreshExpression();
                if (view === 'strategy') void refreshStrategy();
                if (view === 'draft') void refreshDraft();
                if (view === 'learning') void refreshFeedback();
                if (view === 'data') void refreshAudit();
              }}
              type="button"
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
              {badge ? <b>{badge}</b> : null}
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <div className="maturity"><span>بلوغ مدل شخصی</span><strong>{onboardingSnapshot?.modelMaturity.percent ?? 0}٪</strong></div>
          <div className="progress"><i style={{ width: `${String(onboardingSnapshot?.modelMaturity.percent ?? 0)}%` }} /></div>
          <small>{onboardingSnapshot?.modelMaturity.evidenceCount ?? 0} شاهد واقعی · محاسبه‌شده از داده شما</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <span className="date">{formatDate(snapshot.generatedAt)}</span>
            <h1>{activeView === 'memory'
              ? 'حافظه‌ای که شما کنترل می‌کنید.'
              : activeView === 'research'
                ? 'منبع بیرونی، جدا از حافظه شخصی.'
              : activeView === 'opportunities'
                ? 'ترند فقط زمانی فرصت است که با شما و زمان شما تناسب داشته باشد.'
              : activeView === 'claims'
                ? 'هیچ ادعایی بدون Trace عمومی نشود.'
              : activeView === 'risk'
                ? 'ریسک باید قبل از اقدام دیده و پذیرفته شود.'
              : activeView === 'arbitration'
                ? 'اختلاف ماژول‌ها باید دیده شود، نه حذف.'
              : activeView === 'initiative'
                ? 'سیستم فقط با اجازه و دلیل مزاحم می‌شود.'
              : activeView === 'relationships'
                ? 'رابطه سرمایه است؛ اما انسان امتیاز CRM نیست.'
              : activeView === 'perception'
                ? 'نظر دیگران Signal است، نه حقیقت.'
              : activeView === 'expression'
                ? 'روایت باید به شواهد و Voice واقعی شما متصل بماند.'
              : activeView === 'intake'
                ? 'اولین شاهد واقعی را وارد کنید.'
              : activeView === 'strategy'
                ? 'جهت را شما تعیین می‌کنید.'
                : activeView === 'draft'
                  ? 'از شاهد تا متن قابل‌دفاع.'
                  : activeView === 'learning'
                    ? 'سیستم پیشنهاد می‌دهد؛ شما تصمیم می‌گیرید.'
                    : activeView === 'data'
                      ? 'داده‌های شما، زیر کنترل شما.'
                : 'حرکت بعدی، نه پست بعدی.'}</h1>
          </div>
          <div className="top-actions">
            <span className="system-state">
              <i /> API متصل · {persistenceLabel(snapshot.runtime.persistence)}
            </span>
            <button className="avatar" type="button" aria-label="پروفایل کاربر">TP</button>
          </div>
        </header>

        {error ? <div className="inline-error" role="alert"><TriangleAlert size={16} />{error}</div> : null}

        {activeView === 'today' && activeInitiativeCue ? (
          <button
            className="initiative-inline-cue"
            onClick={() => { navigateFromInitiative(activeInitiativeCue.targetView); }}
            type="button"
          >
            <BellRing size={19} />
            <span><b>{activeInitiativeCue.title}</b><small>{activeInitiativeCue.prompt}</small></span>
            <ChevronLeft size={18} />
          </button>
        ) : null}

        {activeView === 'intake' ? (
          <AssetIntakePanel
            error={onboardingError}
            onImport={addTextAsset}
            onRight={controlTextAsset}
            onRefresh={() => refreshOnboarding()}
            snapshot={onboardingSnapshot}
            state={onboardingState}
          />
        ) : activeView === 'memory' ? (
          <PersonalMemoryPanel
            error={memoryViewError}
            onRefresh={() => refreshMemory()}
            snapshot={memorySnapshot}
            state={memoryViewState}
          />
        ) : activeView === 'research' ? (
          <ResearchWorkspacePanel
            error={researchViewError}
            onImport={addResearchSource}
            onRefresh={() => refreshResearch()}
            snapshot={researchSnapshot}
            state={researchViewState}
          />
        ) : activeView === 'opportunities' ? (
          <OpportunityRadarPanel
            error={opportunityViewError}
            onGoToResearch={() => { setActiveView('research'); void refreshResearch(); }}
            onRefresh={() => refreshOpportunities()}
            snapshot={opportunitySnapshot}
            state={opportunityViewState}
          />
        ) : activeView === 'claims' ? (
          <ClaimGovernancePanel
            error={claimViewError}
            onRefresh={() => refreshClaims()}
            onReview={submitClaimReview}
            snapshot={claimSnapshot}
            state={claimViewState}
          />
        ) : activeView === 'risk' ? (
          <BrandProtectionPanel
            error={riskViewError}
            onRefresh={() => refreshRisk()}
            onReview={submitRiskReview}
            snapshot={riskSnapshot}
            state={riskViewState}
          />
        ) : activeView === 'arbitration' ? (
          <DecisionArbitrationPanel
            error={arbitrationViewError}
            onAssess={submitArbitration}
            onRefresh={() => refreshArbitration()}
            onSelect={setSelected}
            selectedActionId={selected}
            snapshot={arbitrationSnapshot}
            state={arbitrationViewState}
          />
        ) : activeView === 'initiative' ? (
          <InitiativePolicyPanel
            error={initiativeViewError}
            key={initiativeSnapshot?.settings.revision ?? 'empty'}
            onEvaluate={runInitiativeEvaluation}
            onNavigate={navigateFromInitiative}
            onRefresh={() => refreshInitiative()}
            onSave={saveInitiativeSettings}
            snapshot={initiativeSnapshot}
            state={initiativeViewState}
          />
        ) : activeView === 'relationships' ? (
          <RelationshipWorkspacePanel
            error={relationshipViewError}
            onCreate={addStakeholder}
            onDelete={removeStakeholder}
            onRefresh={() => refreshRelationships()}
            snapshot={relationshipSnapshot}
            state={relationshipViewState}
          />
        ) : activeView === 'perception' ? (
          <PerceptionWorkspacePanel
            error={perceptionViewError}
            onCreate={addPerceptionSignal}
            onDelete={removePerceptionSignal}
            onRefresh={() => refreshPerception()}
            snapshot={perceptionSnapshot}
            state={perceptionViewState}
          />
        ) : activeView === 'expression' ? (
          <AuthenticExpressionPanel
            error={expressionViewError}
            onRefresh={() => refreshExpression()}
            onReview={analyzeExpression}
            review={expressionReview}
            snapshot={expressionSnapshot}
            state={expressionViewState}
          />
        ) : activeView === 'strategy' ? (
          <StrategyPanel
            error={strategyViewError}
            key={strategySnapshot?.revision ?? 'empty'}
            onRefresh={() => refreshStrategy()}
            onSave={saveStrategy}
            snapshot={strategySnapshot}
            state={strategyViewState}
          />
        ) : activeView === 'draft' ? (
          <DraftWorkspacePanel
            error={draftViewError}
            onApprove={() => mutateDraft('approve')}
            onCreate={createDraftWorkspace}
            onEdit={(body) => mutateDraft('edit', body)}
            onExport={() => mutateDraft('export')}
            onReject={rejectCurrentDraft}
            onGoToContentAction={() => {
              setSelected('essay');
              setActiveView('today');
            }}
            onRefresh={() => refreshDraft()}
            snapshot={draftSnapshot}
            sources={draftSources}
            state={draftViewState}
            workbench={snapshot}
          />
        ) : activeView === 'learning' ? (
          <FeedbackLearningPanel
            error={feedbackViewError}
            onDecide={decidePreference}
            onRefresh={() => refreshFeedback()}
            snapshot={feedbackSnapshot}
            state={feedbackViewState}
          />
        ) : activeView === 'data' ? (
          <DataRightsPanel
            error={dataViewError}
            onExport={exportMyData}
            onRefresh={() => refreshAudit()}
            snapshot={auditSnapshot}
            state={dataViewState}
          />
        ) : (
          <>
        <section className="conversation" aria-label="گفت‌وگوی روز">
          <div className="assistant-sign"><Sparkles size={18} /></div>
          <div>
            <p className="overline">گفت‌وگوی پیوسته</p>
            <h2>امروز چه چیزی ذهنت را درگیر کرده؟</h2>
            <p>می‌توانی یک اتفاق، تصمیم، رابطه یا حتی تردید را تعریف کنی. لازم نیست از قبل بدانی به محتوا تبدیل می‌شود یا نه.</p>
            {!conversationOpen ? (
              <button
                type="button"
                className="talk"
                onClick={() => {
                  setConversationOpen(true);
                }}
              >
                <MessageCircleMore size={18} /> شروع گفت‌وگو <ArrowUpLeft size={17} />
              </button>
            ) : (
              <form
                className="conversation-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitConversation();
                }}
              >
                <label htmlFor="daily-reflection">روایت یا فکر امروز</label>
                <textarea
                  id="daily-reflection"
                  maxLength={5000}
                  onChange={(event) => {
                    setConversationText(event.target.value);
                    setConversationResult(null);
                    setMemoryConfirmed(false);
                    setMemoryRightResult(null);
                  }}
                  placeholder="مثلاً: امروز در جلسه اتفاقی افتاد که ذهنم را درگیر کرد…"
                  rows={3}
                  value={conversationText}
                />
                <label className="memory-opt-in">
                  <input
                    checked={proposeMemory}
                    onChange={(event) => {
                      setProposeMemory(event.target.checked);
                    }}
                    type="checkbox"
                  />
                  بعد از تحلیل، فقط یک پیشنهاد برای حافظه بساز؛ چیزی خودکار ثبت نشود.
                </label>
                <small className="conversation-privacy">
                  بدون Opt-in حافظه، متن خام در Store ثبت نمی‌شود؛ داده حساس حتی با Opt-in هم ذخیره نخواهد شد.
                </small>
                <button className="talk" disabled={conversationState !== 'idle'} type="submit">
                  {conversationState === 'sending' ? <LoaderCircle className="spin" size={17} /> : <MessageCircleMore size={17} />}
                  {conversationState === 'sending' ? 'در حال بررسی…' : 'ارسال برای بررسی'}
                </button>
              </form>
            )}
            {conversationResult ? (
              <div className="conversation-result" aria-live="polite">
                <span>{conversationResult.assistantMessage}</span>
                <strong>{conversationResult.followUpQuestion}</strong>
                <div className="orchestration-card">
                  <div className="orchestration-heading">
                    <span>مسیر تصمیم · {conversationIntentLabel(conversationResult.orchestration.intent.kind)}</span>
                    <b>{Math.round(conversationResult.orchestration.intent.confidence * 100)}٪ اطمینان</b>
                  </div>
                  <p>{conversationResult.orchestration.intent.rationale}</p>
                  <div className="orchestration-meta">
                    <span>ماژول: {conversationModuleLabel(conversationResult.orchestration.route.module)}</span>
                    <span>اختیار نوشتن: {conversationResult.orchestration.route.writeAuthority === 'propose_only' ? 'فقط پیشنهاد' : 'ندارد'}</span>
                    <span>{conversationResult.orchestration.route.requiresUserApproval ? 'تأیید کاربر لازم است' : 'بدون اقدام حساس'}</span>
                    <span>{conversationResult.orchestration.retention.turn === 'not_persisted' ? 'متن خام ذخیره نشد' : 'فقط Proposal محرمانه'}</span>
                  </div>
                  <p className="orchestration-rationale">{conversationResult.orchestration.arbitration.rationale}</p>
                  {conversationResult.orchestration.recommendedAction.kind !== 'clarify' ||
                  conversationResult.orchestration.recommendedAction.targetView !== 'today' ? (
                    <button
                      onClick={() => {
                        setActiveView(conversationResult.orchestration.recommendedAction.targetView);
                      }}
                      type="button"
                    >
                      {conversationResult.orchestration.recommendedAction.label}
                    </button>
                  ) : null}
                </div>
                {conversationResult.memoryProposal && !memoryConfirmed ? (
                  <div className="memory-confirm-scope">
                    <label className="memory-opt-in">
                      <input
                        checked={memoryBrandUsage}
                        onChange={(event) => { setMemoryBrandUsage(event.target.checked); }}
                        type="checkbox"
                      />
                      اجازه استفاده داخلی در تحلیل برند؛ این مجوز انتشار عمومی نیست.
                    </label>
                    <button
                      disabled={conversationState !== 'idle'}
                      onClick={() => void confirmMemory()}
                      type="button"
                    >
                      {conversationState === 'confirming' ? 'در حال ثبت…' : 'تأیید حافظه با همین دامنه رضایت'}
                    </button>
                  </div>
                ) : null}
                {memoryConfirmed ? (
                  <>
                    <em>
                      <Check size={15} /> به‌عنوان Self-report محرمانه در
                      {memoryPersistence === 'postgres'
                        ? ' حافظه پایدار'
                        : memoryPersistence === 'ephemeral'
                          ? ' حافظه موقت نسخه نمایشی'
                          : ' حافظه موقت این اجرا'} ثبت شد؛
                      استفاده برند {memoryBrandUsage ? 'برای تحلیل داخلی روشن' : 'خاموش'} و استفاده عمومی خاموش است.
                    </em>
                    <div className="memory-rights">
                      <strong>کنترل این حافظه همیشه با شماست</strong>
                      <div className="memory-right-fields">
                        <label>
                          اقدام
                          <select
                            onChange={(event) => {
                              setMemoryRightKind(event.target.value as MemoryRightKind);
                              setMemoryRightRequestId(null);
                              setMemoryRightResult(null);
                            }}
                            value={memoryRightKind}
                          >
                            <option value="contest">اعتراض و توقف استفاده</option>
                            <option value="correct">اصلاح با حفظ تاریخچه</option>
                            <option value="revoke">لغو مجوز استفاده</option>
                            <option value="delete">حذف حافظه و مشتقات</option>
                          </select>
                        </label>
                        {memoryRightKind === 'correct' ? (
                          <label>
                            متن اصلاح‌شده
                            <textarea
                              maxLength={5000}
                              onChange={(event) => {
                                setCorrectedMemoryText(event.target.value);
                                setMemoryRightRequestId(null);
                              }}
                              rows={2}
                              value={correctedMemoryText}
                            />
                          </label>
                        ) : null}
                        <label>
                          دلیل این درخواست
                          <input
                            maxLength={500}
                            onChange={(event) => {
                              setMemoryRightReason(event.target.value);
                              setMemoryRightRequestId(null);
                            }}
                            placeholder="برای Audit خصوصی و قابل‌ردیابی"
                            value={memoryRightReason}
                          />
                        </label>
                      </div>
                      <button
                        disabled={conversationState !== 'idle'}
                        onClick={() => void exerciseMemoryRight()}
                        type="button"
                      >
                        {conversationState === 'applying_right'
                          ? 'در حال اعمال امن…'
                          : memoryRightActionLabel(memoryRightKind)}
                      </button>
                      {memoryRightResult ? (
                        <span className="memory-right-result">
                          <ShieldCheck size={15} /> {memoryRightResultLabel(memoryRightResult)}
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="decision-head">
          <div>
            <p className="overline">پیشنهاد استراتژیک امروز</p>
            <h2>برای {snapshot.goal.title}</h2>
          </div>
          <div className="decision-budget">
            <span><Clock3 size={15} /><small>زمان</small><strong>{formatMinutes(snapshot.attentionBudget.availableMinutes)}</strong></span>
            <span><CircleGauge size={15} /><small>انرژی</small><strong>{snapshot.attentionBudget.maximumEnergyCost}/۵</strong></span>
            <span><Eye size={15} /><small>تحمل دیده‌شدن</small><strong>{snapshot.attentionBudget.visibilityTolerance}/۵</strong></span>
            <span><BrainCircuit size={15} /><small>ظرفیت احساسی</small><strong>{snapshot.attentionBudget.emotionalBandwidth}/۵</strong></span>
          </div>
        </section>

        <section className="decision-frame-strip" aria-label="قاب تصمیم استراتژیک">
          <ShieldCheck size={18} />
          <div>
            <span><b>چرا:</b> {snapshot.decisionFrame.why.objective}</span>
            <span><b>برای چه کسی:</b> {snapshot.decisionFrame.forWhom}</span>
            <span><b>چه زمانی:</b> معتبر تا {formatTimestamp(snapshot.decisionFrame.decisionWindow.expiresAt)}</span>
          </div>
          <small>Platform هنوز انتخاب نشده · Score و Opportunity Cost قابل مشاهده‌اند · هیچ اقدام بیرونی مجاز نشده</small>
        </section>

        {snapshot.evidence.state === 'insufficient' ? (
          <div className="evidence-abstention" role="status">
            <ShieldCheck size={18} />
            <div>
              <strong>سیستم از توصیه بیرونی بدون شاهد مجاز خودداری کرده است.</strong>
              <span>
                {snapshot.evidence.withheldEvidenceCount > 0
                  ? `${String(snapshot.evidence.withheldEvidenceCount)} شاهد فقط برای فهم شخصی موجود است و در تحلیل برند مصرف نمی‌شود.`
                  : 'ابتدا یک منبع واقعی وارد کنید یا یک تجربه مشخص را با رضایت جداگانه ثبت کنید.'}
              </span>
            </div>
          </div>
        ) : null}

        <div className="workspace">
          <section className="options" aria-label="گزینه‌های اقدام">
            {snapshot.actions.map((action) => (
              <button
                className={selected === action.id ? 'option selected' : 'option'}
                disabled={!action.feasible}
                key={action.id}
                onClick={() => {
                  setSelected(action.id);
                }}
                type="button"
              >
                <span className="rank">{String(action.rank).padStart(2, '۰')}</span>
                <span className="option-main">
                  <span className="kind">{kindLabels[action.kind]}</span>
                  <strong>{action.title}</strong>
                  <small>{action.rationale}</small>
                  {!action.feasible ? <em>{action.feasibilityReasons.map(feasibilityReasonLabel).join(' · ')}</em> : null}
                </span>
                <span className="metrics">
                  <span><b>{action.utilityScore ?? '—'}</b> امتیاز</span>
                  <span>Opportunity Cost: <b>{action.opportunityCost ?? '—'}</b></span>
                  <span>{formatMinutes(action.attentionCostMinutes)}</span>
                  <span>دیده‌شدن {action.visibilityCost}/۵ · احساسی {action.emotionalCost}/۵</span>
                  <span className={action.riskLevel === 'low' ? 'risk low' : 'risk'}>ریسک {riskLabels[action.riskLevel]}</span>
                </span>
                <span className="radio">{selected === action.id ? <Check size={15} /> : null}</span>
              </button>
            ))}
          </section>

          <aside className="evidence-card">
            <div className="evidence-title"><ShieldCheck size={20} /><span>چرا این پیشنهاد؟</span></div>
            <p>{selectedAction?.rationale}</p>
            {selectedAction ? (
              <div className="decision-contract">
                <span><b>What</b>{kindLabels[selectedAction.kind]}</span>
                <span><b>For whom</b>{selectedAction.decision.stakeholder}</span>
                <span><b>When</b>{decisionPostureLabel(selectedAction.decision.posture)}</span>
                <span><b>Format</b>{decisionFormatLabel(selectedAction.decision.format)}</span>
                <p><b>فرض کلیدی:</b> {selectedAction.decision.assumptions[0]}</p>
                <p><b>عدم‌قطعیت:</b> {selectedAction.decision.uncertainty[0]}</p>
                <p><b>سنجش:</b> {selectedAction.decision.measurementPlan.signals.slice(0, 3).join('، ')}</p>
              </div>
            ) : null}
            <ul>
              <li><BookOpenText size={16} /><span><b>{selectedAction?.evidenceCount ?? 0} شاهد</b> مجاز و قابل‌ردیابی</span></li>
              <li><Fingerprint size={16} /><span><b>فایده:</b> {selectedAction?.benefits[0]}</span></li>
              <li><Network size={16} /><span><b>پیش‌نیاز:</b> {selectedAction?.prerequisites[0]}</span></li>
            </ul>
            <button className="trace" type="button">ریسک: {selectedAction?.risks[0]} <ChevronLeft size={16} /></button>
            <div className="approval-zone">
              <div><span>اطمینان سیستم</span><strong>{formatConfidence(selectedAction?.confidence)}</strong></div>
              <button
                className={selectedIsApproved ? 'approve done' : 'approve'}
                disabled={
                  state === 'approving' ||
                  !selectedAction?.feasible ||
                  (
                    selectedAction.interaction === 'approve' &&
                    snapshot.workflow.status === 'approved' && !selectedIsApproved
                  )
                }
                type="button"
                onClick={() => void approve()}
              >
                {approvalLabel(state, selectedAction, selectedIsApproved, snapshot.workflow.status)}
              </button>
              <small>
                {selectedAction?.interaction === 'approve'
                  ? `تأیید انسانی فقط Workflow را آماده می‌کند؛ اعتبار تصمیم تا ${formatTimestamp(selectedAction.decision.decisionWindowEndsAt)} است و هیچ اقدام بیرونی اجرا نمی‌شود.`
                  : 'این مسیر فقط شما را به جمع‌آوری Evidence می‌برد و اقدام بیرونی اجرا نمی‌کند.'}
              </small>
            </div>
          </aside>
        </div>
          </>
        )}
      </main>
    </div>
  );
}

function StrategyPanel({
  error,
  onRefresh,
  onSave,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onRefresh: () => Promise<void>;
  onSave: (value: EditableStrategyContext) => Promise<void>;
  snapshot: StrategyContextSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
}>) {
  const [goalTitle, setGoalTitle] = useState(snapshot?.goal.title ?? '');
  const [goalOutcome, setGoalOutcome] = useState(snapshot?.goal.outcome ?? '');
  const [priority, setPriority] = useState<1 | 2 | 3 | 4 | 5>(snapshot?.goal.priority ?? 3);
  const [goalHorizon, setGoalHorizon] = useState(snapshot?.goal.horizon ?? '');
  const [metrics, setMetrics] = useState(snapshot?.goal.successMetrics.join('\n') ?? '');
  const [audience, setAudience] = useState(snapshot?.desiredPositioning.audience ?? '');
  const [desiredPerception, setDesiredPerception] = useState(snapshot?.desiredPositioning.desiredPerception ?? '');
  const [differentiation, setDifferentiation] = useState(snapshot?.desiredPositioning.differentiation ?? '');
  const [proofPoints, setProofPoints] = useState(snapshot?.desiredPositioning.proofPoints.join('\n') ?? '');
  const [positioningHorizon, setPositioningHorizon] = useState(snapshot?.desiredPositioning.horizon ?? '');

  if ((state === 'loading' || state === 'idle') && !snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <LoaderCircle className="spin" size={24} />
        <h2>در حال بازیابی جهت استراتژیک…</h2>
        <p>Goal و Desired Positioning مالک از یک Snapshot نسخه‌دار خوانده می‌شوند.</p>
      </section>
    );
  }
  if (!snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <TriangleAlert size={25} />
        <h2>زمینه استراتژیک در دسترس نیست</h2>
        <p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p>
        <button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button>
      </section>
    );
  }

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const successMetrics = lineItems(metrics);
    const positioningProofPoints = lineItems(proofPoints);
    if (
      goalTitle.trim().length < 3 || goalOutcome.trim().length < 3 ||
      goalHorizon.trim().length < 3 || successMetrics.length === 0 ||
      audience.trim().length < 3 || desiredPerception.trim().length < 3 ||
      differentiation.trim().length < 3 || positioningProofPoints.length === 0 ||
      positioningHorizon.trim().length < 3
    ) return;
    void onSave({
      goal: {
        title: goalTitle.trim(),
        outcome: goalOutcome.trim(),
        priority,
        successMetrics,
        horizon: goalHorizon.trim(),
      },
      desiredPositioning: {
        audience: audience.trim(),
        desiredPerception: desiredPerception.trim(),
        differentiation: differentiation.trim(),
        proofPoints: positioningProofPoints,
        horizon: positioningHorizon.trim(),
      },
    });
  };

  return (
    <section className="strategy-view" aria-label="هدف و جایگاه مطلوب">
      <header className="strategy-head">
        <div>
          <p className="overline">Strategy Context · نسخه {snapshot.revision}</p>
          <h2>هدف و جایگاه مطلوب</h2>
          <p>این اطلاعات مستقیماً تصمیم‌های Workbench را جهت می‌دهند و هر ویرایش با نسخه جدید ثبت می‌شود.</p>
        </div>
        <span className="strategy-persistence"><History size={15} /> {persistenceLabel(snapshot.persistence)}</span>
      </header>

      <form className="strategy-form" onSubmit={submit}>
        <fieldset>
          <legend>۱ · هدف مالک</legend>
          <label className="strategy-wide">عنوان هدف
            <input maxLength={240} onChange={(event) => { setGoalTitle(event.target.value); }} value={goalTitle} />
          </label>
          <label className="strategy-wide">نتیجه قابل‌مشاهده
            <textarea maxLength={2000} onChange={(event) => { setGoalOutcome(event.target.value); }} rows={3} value={goalOutcome} />
          </label>
          <label>افق زمانی
            <input maxLength={120} onChange={(event) => { setGoalHorizon(event.target.value); }} value={goalHorizon} />
          </label>
          <label>اولویت
            <select onChange={(event) => { setPriority(Number(event.target.value) as 1 | 2 | 3 | 4 | 5); }} value={priority}>
              <option value={5}>۵ · حیاتی</option><option value={4}>۴ · بالا</option>
              <option value={3}>۳ · متوسط</option><option value={2}>۲ · پایین</option><option value={1}>۱ · حداقل</option>
            </select>
          </label>
          <label className="strategy-wide">معیارهای موفقیت · هر مورد در یک خط
            <textarea maxLength={2000} onChange={(event) => { setMetrics(event.target.value); }} rows={4} value={metrics} />
          </label>
        </fieldset>

        <fieldset>
          <legend>۲ · Desired Positioning</legend>
          <label>مخاطب یا ذی‌نفع اصلی
            <input maxLength={500} onChange={(event) => { setAudience(event.target.value); }} value={audience} />
          </label>
          <label>افق جایگاه
            <input maxLength={120} onChange={(event) => { setPositioningHorizon(event.target.value); }} value={positioningHorizon} />
          </label>
          <label className="strategy-wide">می‌خواهید چگونه درک شوید؟
            <textarea maxLength={1000} onChange={(event) => { setDesiredPerception(event.target.value); }} rows={3} value={desiredPerception} />
          </label>
          <label className="strategy-wide">تمایز معنادار
            <textarea maxLength={1000} onChange={(event) => { setDifferentiation(event.target.value); }} rows={3} value={differentiation} />
          </label>
          <label className="strategy-wide">نقاط اثبات · هر مورد در یک خط
            <textarea maxLength={2500} onChange={(event) => { setProofPoints(event.target.value); }} rows={4} value={proofPoints} />
          </label>
        </fieldset>

        <div className="strategy-savebar">
          <div>
            <ShieldCheck size={17} />
            <span>با ذخیره، تأیید اقدام قبلی منقضی می‌شود تا تصمیم تازه دوباره به‌صورت انسانی تأیید شود.</span>
          </div>
          <button disabled={state === 'saving'} type="submit">
            {state === 'saving' ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
            {state === 'saving' ? 'در حال ثبت نسخه…' : 'ثبت نسخه جدید'}
          </button>
        </div>
        {error ? <div className="strategy-error" role="alert"><TriangleAlert size={15} /> {error}</div> : null}
      </form>
      <small className="memory-footnote">آخرین تغییر: {formatDate(snapshot.updatedAt)} · هیچ انتشار یا اقدام بیرونی با این ذخیره انجام نمی‌شود.</small>
    </section>
  );
}

function DraftWorkspacePanel({
  error,
  onApprove,
  onCreate,
  onEdit,
  onExport,
  onGoToContentAction,
  onReject,
  onRefresh,
  snapshot,
  sources,
  state,
  workbench,
}: Readonly<{
  error: string | null;
  onApprove: () => Promise<void>;
  onCreate: (input: Readonly<{
    sourceKind: DraftSourceKind;
    sourceRef: string;
    channel: DraftChannel;
    narrativeAngle: string;
    takeaway: string;
    publicDraftingConsent: boolean;
  }>) => Promise<void>;
  onEdit: (body: string) => Promise<void>;
  onExport: () => Promise<void>;
  onGoToContentAction: () => void;
  onReject: (reason: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  snapshot: DraftWorkspaceSnapshot | null;
  sources: DraftSourceSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'mutating' | 'error';
  workbench: WorkbenchSnapshot;
}>) {
  const activeSources = sources?.records ?? [];
  const contentApproved = workbench.workflow.status === 'approved' &&
    workbench.workflow.approvedActionId === 'essay';
  const [sourceKey, setSourceKey] = useState(
    activeSources[0] ? draftSourceKey(activeSources[0].kind, activeSources[0].ref) : '',
  );
  const [channel, setChannel] = useState<DraftChannel>('linkedin');
  const [angle, setAngle] = useState('یک تجربه واقعی که نگاه من به تصمیم‌گیری را تغییر داد');
  const [takeaway, setTakeaway] = useState('اعتماد با صداقت درباره ابهام ساخته می‌شود، نه با نمایش قطعیت.');
  const [consent, setConsent] = useState(false);
  const [body, setBody] = useState(snapshot?.body ?? '');
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (snapshot) setBody(snapshot.body);
  }, [snapshot]);
  useEffect(() => {
    if (!sourceKey && activeSources[0]) {
      setSourceKey(draftSourceKey(activeSources[0].kind, activeSources[0].ref));
    }
  }, [activeSources, sourceKey]);

  if ((state === 'loading' || state === 'idle') && !sources && !snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <LoaderCircle className="spin" size={24} />
        <h2>در حال آماده‌سازی Draft Studio…</h2>
        <p>منبع حافظه، Evidence، Claim و وضعیت تأیید دوباره بررسی می‌شوند.</p>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="draft-view" aria-label="ساخت پیش‌نویس مبتنی بر شواهد">
        <header className="draft-head">
          <div>
            <p className="overline">Evidence → Claim → Draft</p>
            <h2>ساخت اولین پیش‌نویس قابل‌ردیابی</h2>
            <p>فقط منبعی با Evidence و مجوز تحلیل برند می‌تواند وارد متن شود؛ مجوز Public Drafting نیز در همین مرحله جداگانه گرفته می‌شود.</p>
          </div>
          <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button">
            <RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> به‌روزرسانی
          </button>
        </header>
        {!contentApproved ? (
          <div className="draft-gate">
            <FileCheck2 size={20} />
            <div><strong>ابتدا اقدام محتوایی را تأیید کنید</strong><span>ساخت Draft بدون انتخاب انسانیِ Action شروع نمی‌شود.</span></div>
            <button onClick={onGoToContentAction} type="button">انتخاب اقدام محتوایی</button>
          </div>
        ) : null}
        {activeSources.length === 0 ? (
          <div className="memory-empty">
            <Fingerprint size={28} />
            <h3>منبع قابل‌استفاده‌ای وجود ندارد</h3>
            <p>یک متن را با مجوز تحلیل برند وارد کنید یا یک حافظه را با همین دامنه رضایت تأیید کنید.</p>
          </div>
        ) : (
          <form
            className="draft-create"
            onSubmit={(event) => {
              event.preventDefault();
              const source = activeSources.find(
                (item) => draftSourceKey(item.kind, item.ref) === sourceKey,
              );
              if (!contentApproved || !source || !consent) return;
              void onCreate({
                sourceKind: source.kind,
                sourceRef: source.ref,
                channel,
                narrativeAngle: angle,
                takeaway,
                publicDraftingConsent: consent,
              });
            }}
          >
            <label className="draft-wide">منبع و شاهد مبنا
              <select onChange={(event) => { setSourceKey(event.target.value); }} value={sourceKey}>
                {activeSources.map((record) => (
                  <option key={draftSourceKey(record.kind, record.ref)} value={draftSourceKey(record.kind, record.ref)}>
                    {record.kind === 'text_asset' ? 'متن' : 'حافظه'} · {record.label.slice(0, 90)} · {record.evidenceIds.length} شاهد
                  </option>
                ))}
              </select>
            </label>
            <label>پلتفرم مقصد
              <select onChange={(event) => { setChannel(event.target.value as DraftChannel); }} value={channel}>
                {draftChannelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>زاویه روایت
              <input maxLength={500} onChange={(event) => { setAngle(event.target.value); }} value={angle} />
            </label>
            <label className="draft-wide">برداشت شخصی یا جمع‌بندی
              <textarea maxLength={2000} onChange={(event) => { setTakeaway(event.target.value); }} rows={3} value={takeaway} />
            </label>
            <label className="draft-consent draft-wide">
              <input checked={consent} onChange={(event) => { setConsent(event.target.checked); }} type="checkbox" />
              <span><strong>مجوز صریح برای Public Drafting</strong> فقط همین Assertion و همین کانال برای ساخت Draft قابل استفاده باشد؛ انتشار خودکار انجام نشود.</span>
            </label>
            <button className="draft-primary" disabled={!contentApproved || !consent || state === 'mutating'} type="submit">
              {state === 'mutating' ? <LoaderCircle className="spin" size={17} /> : <PencilLine size={17} />}
              {state === 'mutating' ? 'در حال ساخت…' : 'ساخت Draft و اجرای Claim Check'}
            </button>
          </form>
        )}
        {error ? <div className="strategy-error" role="alert"><TriangleAlert size={15} /> {error}</div> : null}
      </section>
    );
  }

  const canApprove = snapshot.status === 'awaiting_approval' && snapshot.guard.mayRequestApproval &&
    snapshot.sourceAvailable && !snapshot.staleStrategy;
  const canExport = snapshot.status === 'approved' && snapshot.sourceAvailable && !snapshot.staleStrategy;
  const adaptation = snapshot.adaptation;
  const currentCharacters = body.length;
  const withinRecommendedLength = currentCharacters >= adaptation.recommendedCharacters.min &&
    currentCharacters <= adaptation.recommendedCharacters.max;
  return (
    <section className="draft-view" aria-label="ویرایش و خروجی پیش‌نویس">
      <header className="draft-head">
        <div>
          <p className="overline">Draft Revision {snapshot.revision} · {draftChannelLabel(snapshot.channel)}</p>
          <h2>پیش‌نویس مبتنی بر شاهد</h2>
          <p>هر ویرایش دوباره Claim Check می‌شود و Approval نسخه قبلی را معتبر نگه نمی‌دارد.</p>
        </div>
        <span className={`guard-badge ${snapshot.guard.classification}`}>
          <ShieldCheck size={16} /> {guardLabel(snapshot.guard.classification)}
        </span>
      </header>
      {snapshot.staleStrategy || !snapshot.sourceAvailable ? (
        <div className="draft-gate danger">
          <TriangleAlert size={20} />
          <div>
            <strong>{snapshot.staleStrategy ? 'استراتژی پس از ساخت Draft تغییر کرده است' : 'منبع حافظه دیگر مجاز یا فعال نیست'}</strong>
            <span>Approval و Export تا ساخت نسخه تازه از منبع معتبر متوقف هستند.</span>
          </div>
        </div>
      ) : null}
      <div className="draft-workspace">
        <div className="draft-editor">
          <label htmlFor="draft-body">متن قابل‌ویرایش</label>
          <textarea
            id="draft-body"
            maxLength={adaptation.hardMaximumCharacters}
            onChange={(event) => { setBody(event.target.value); }}
            rows={18}
            value={body}
          />
          <div className="draft-editor-foot">
            <span className={currentCharacters > adaptation.hardMaximumCharacters ? 'draft-length-danger' : undefined}>
              {currentCharacters.toLocaleString('fa-IR')} / {adaptation.hardMaximumCharacters.toLocaleString('fa-IR')} نویسه
              {' · '}{withinRecommendedLength ? 'در بازه پیشنهادی' : `پیشنهاد ${adaptation.recommendedCharacters.min.toLocaleString('fa-IR')}–${adaptation.recommendedCharacters.max.toLocaleString('fa-IR')}`}
            </span>
            <button disabled={state === 'mutating' || body.trim() === snapshot.body} onClick={() => void onEdit(body)} type="button">
              <FileCheck2 size={16} /> ذخیره و بررسی دوباره
            </button>
          </div>
        </div>
        <aside className="draft-trace">
          <p className="overline">Platform Brief · {adaptation.version}</p>
          <h3>چرا این نسخه برای {draftChannelLabel(snapshot.channel)} متفاوت است؟</h3>
          <div className="platform-brief">
            <div><b>مخاطب</b><span>{adaptation.audienceContext}</span></div>
            <div><b>قالب</b><span>{adaptation.format}</span></div>
            <div><b>زبان بصری</b><span>{adaptation.visualLanguage}</span></div>
            <div><b>تعامل</b><span>{adaptation.interactionModel}</span></div>
          </div>
          <div className="platform-elements">
            {adaptation.requiredElements.map((element) => <span key={element}>{element}</span>)}
          </div>
          <div className="draft-trace-divider" />
          <p className="overline">Traceability</p>
          <h3>این متن به چه چیزی متصل است؟</h3>
          <blockquote>{snapshot.source.statement}</blockquote>
          <div className="trace-row"><BookOpenText size={15} /><span><b>{snapshot.source.evidenceIds.length}</b> Evidence متصل</span></div>
          <div className="trace-row"><Fingerprint size={15} /><span>Claim شخصیِ تأییدشده توسط مالک</span></div>
          <div className="trace-row"><LockKeyhole size={15} /><span>مجوز محدود به {draftChannelLabel(snapshot.channel)}</span></div>
          {snapshot.guard.violations.length > 0 ? (
            <ul className="guard-violations">
              {snapshot.guard.violations.map((violation) => (
                <li key={`${violation.code}:${violation.claimId}`}><TriangleAlert size={14} /> {guardViolationLabel(violation.code)}</li>
              ))}
            </ul>
          ) : <div className="guard-clean"><Check size={15} /> ادعای بی‌منبع شناسایی نشد.</div>}
          <div className="draft-actions">
            <button disabled={!canApprove || state === 'mutating'} onClick={() => void onApprove()} type="button">
              <Check size={16} /> {snapshot.status === 'approved' ? 'تأیید شده' : 'تأیید انسانی این نسخه'}
            </button>
            <button className="export" disabled={!canExport || state === 'mutating'} onClick={() => void onExport()} type="button">
              <Download size={16} /> {snapshot.status === 'exported' ? 'خروجی گرفته شد' : 'Export فایل متنی'}
            </button>
          </div>
          <div className="draft-rejection">
            <label htmlFor="draft-rejection-reason">اگر این نسخه مناسب نیست، دلیل رد را ثبت کنید</label>
            <textarea
              id="draft-rejection-reason"
              maxLength={1000}
              onChange={(event) => { setRejectionReason(event.target.value); }}
              placeholder="مثلاً: لحن بیش از حد رسمی است یا تیتر طولانی است…"
              rows={3}
              value={rejectionReason}
            />
            <button
              disabled={state === 'mutating' || rejectionReason.trim().length < 3}
              onClick={() => {
                void onReject(rejectionReason.trim()).then(() => { setRejectionReason(''); });
              }}
              type="button"
            >
              <ThumbsDown size={15} /> ثبت رد؛ بدون تغییر خودکار هویت
            </button>
          </div>
          <small>هیچ Publish یا ارسال بیرونی انجام نمی‌شود.</small>
        </aside>
      </div>
      {error ? <div className="strategy-error" role="alert"><TriangleAlert size={15} /> {error}</div> : null}
    </section>
  );
}

function FeedbackLearningPanel({
  error,
  onDecide,
  onRefresh,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onDecide: (proposalId: string, decision: 'applied' | 'rejected' | 'revoked') => Promise<void>;
  onRefresh: () => Promise<void>;
  snapshot: FeedbackLearningSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'mutating' | 'error';
}>) {
  if ((state === 'idle' || state === 'loading') && !snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <LoaderCircle className="spin" size={24} />
        <h2>در حال بازیابی سیگنال‌های یادگیری…</h2>
        <p>ویرایش‌ها و ردهای شما از Metricهای سطحی جدا نگه داشته می‌شوند.</p>
      </section>
    );
  }
  if (!snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <TriangleAlert size={25} />
        <h2>مدل ترجیح در دسترس نیست</h2>
        <p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p>
        <button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button>
      </section>
    );
  }
  return (
    <section className="learning-view" aria-label="یادگیری برگشت‌پذیر از بازخورد">
      <header className="draft-head">
        <div>
          <p className="overline">Feedback → Evidence → Preference Proposal</p>
          <h2>یادگیری تحت کنترل شما</h2>
          <p>یک ویرایش منفرد هویت یا Voice Model را تغییر نمی‌دهد؛ فقط الگوهای تکرارشده به پیشنهاد قابل‌رد و قابل‌لغو تبدیل می‌شوند.</p>
        </div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button">
          <RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> به‌روزرسانی
        </button>
      </header>
      <div className="learning-summary">
        <div><span>سیگنال‌های اخیر</span><strong>{snapshot.summary.recentEvents}</strong></div>
        <div><span>منتظر تصمیم شما</span><strong>{snapshot.summary.proposed}</strong></div>
        <div><span>ترجیحات اعمال‌شده</span><strong>{snapshot.summary.applied}</strong></div>
      </div>
      <div className="learning-grid">
        <div className="preference-list">
          <h3>پیشنهادهای Preference Model</h3>
          {snapshot.preferences.length === 0 ? (
            <div className="learning-empty"><BrainCircuit size={25} /><p>هنوز سه ویرایش هم‌جهت برای ساخت پیشنهاد وجود ندارد.</p></div>
          ) : snapshot.preferences.map((preference) => (
            <article className={`preference-card ${preference.status}`} key={preference.id}>
              <div className="preference-topline">
                <span>{preferenceLabel(preference.preferenceKey, preference.proposedValue)}</span>
                <b>{preferenceStatusLabel(preference.status)}</b>
              </div>
              <p>{preference.rationale}</p>
              <small>{preference.evidenceEventIds.length} سیگنال قابل‌ردیابی · اطمینان {formatConfidence(preference.confidence)}</small>
              <div className="preference-actions">
                {preference.status === 'proposed' ? (
                  <>
                    <button disabled={state === 'mutating'} onClick={() => void onDecide(preference.id, 'applied')} type="button"><Check size={15} /> اعمال</button>
                    <button className="secondary" disabled={state === 'mutating'} onClick={() => void onDecide(preference.id, 'rejected')} type="button"><ThumbsDown size={15} /> رد پیشنهاد</button>
                  </>
                ) : null}
                {preference.status === 'applied' ? (
                  <button className="secondary" disabled={state === 'mutating'} onClick={() => void onDecide(preference.id, 'revoked')} type="button"><RotateCcw size={15} /> لغو اثر</button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <aside className="feedback-events">
          <h3>چرا سیستم چنین برداشتی دارد؟</h3>
          {snapshot.recentEvents.length === 0 ? <p>هنوز Edit یا Reject ثبت نشده است.</p> : (
            <ol>
              {snapshot.recentEvents.slice(0, 12).map((event) => (
                <li key={event.id}>
                  <span>{event.eventType === 'rejected' ? 'رد Draft' : feedbackSignalLabel(event.signalKey, event.signalValue)}</span>
                  <time>{formatDate(event.occurredAt)}</time>
                </li>
              ))}
            </ol>
          )}
          <small><ShieldCheck size={14} /> هیچ ترجیحی از Like/View یا یک Edit منفرد به‌صورت خودکار اعمال نمی‌شود.</small>
        </aside>
      </div>
      {error ? <div className="strategy-error" role="alert"><TriangleAlert size={15} /> {error}</div> : null}
    </section>
  );
}

function ResearchWorkspacePanel({
  error,
  onImport,
  onRefresh,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onImport: (input: Readonly<{
    title: string;
    publisher: string;
    url: string;
    excerpt: string;
    statement: string;
    quality: ResearchSourceQuality;
    stance: ResearchSourceStance;
    publishedAt: string;
    maxAgeDays: number;
  }>) => Promise<void>;
  onRefresh: () => Promise<void>;
  snapshot: ResearchWorkspaceSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'mutating' | 'error';
}>) {
  const [title, setTitle] = useState('');
  const [publisher, setPublisher] = useState('');
  const [url, setUrl] = useState('https://');
  const [excerpt, setExcerpt] = useState('');
  const [statement, setStatement] = useState('');
  const [quality, setQuality] = useState<ResearchSourceQuality>('primary');
  const [stance, setStance] = useState<ResearchSourceStance>('supports');
  const [publishedAt, setPublishedAt] = useState('');
  const [maxAgeDays, setMaxAgeDays] = useState(90);

  if ((state === 'idle' || state === 'loading') && !snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <LoaderCircle className="spin" size={24} />
        <h2>در حال بازیابی Research Workspace…</h2>
        <p>منابع بیرونی جدا از Personal Memory خوانده می‌شوند.</p>
      </section>
    );
  }
  if (!snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <TriangleAlert size={25} />
        <h2>Research Workspace در دسترس نیست</h2>
        <p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p>
        <button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button>
      </section>
    );
  }

  return (
    <section className="research-view" aria-label="تحقیق بیرونی و مدیریت منبع">
      <header className="draft-head">
        <div>
          <p className="overline">External Research · Source Provenance</p>
          <h2>منبع بیرونی، نه حافظه شخصی</h2>
          <p>ثبت منبع به‌معنی تأیید Fact نیست. Quality، Freshness، Citation و تعارض منابع پیش از هر استفاده عمومی جداگانه بررسی می‌شوند.</p>
        </div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button">
          <RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> به‌روزرسانی
        </button>
      </header>
      <div className="research-summary">
        <div><span>کل منابع</span><strong>{snapshot.summary.totalSources}</strong></div>
        <div><span>Citation-ready</span><strong>{snapshot.summary.citationReady}</strong></div>
        <div><span>کهنه</span><strong>{snapshot.summary.stale}</strong></div>
        <div className={snapshot.summary.conflicts ? 'danger' : undefined}><span>تعارض باز</span><strong>{snapshot.summary.conflicts}</strong></div>
        <div><span>تأییدنشده</span><strong>{snapshot.summary.unverified}</strong></div>
      </div>
      <form
        className="research-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!publishedAt) return;
          void onImport({
            title, publisher, url, excerpt, statement, quality, stance,
            publishedAt: `${publishedAt}T00:00:00.000Z`, maxAgeDays,
          });
        }}
      >
        <div className="research-form-head">
          <div><BookOpenText size={20} /><span><strong>ثبت یک منبع قابل‌ردیابی</strong><small>در این نسخه منبع را خودتان وارد می‌کنید؛ Fetch خودکار وب انجام نمی‌شود.</small></span></div>
          <ShieldCheck size={20} />
        </div>
        <label>عنوان منبع<input maxLength={300} onChange={(event) => { setTitle(event.target.value); }} required value={title} /></label>
        <label>ناشر<input maxLength={200} onChange={(event) => { setPublisher(event.target.value); }} required value={publisher} /></label>
        <label className="research-wide">URL امن<input dir="ltr" maxLength={2048} onChange={(event) => { setUrl(event.target.value); }} pattern="https://.*" required type="url" value={url} /></label>
        <label>تاریخ انتشار<input onChange={(event) => { setPublishedAt(event.target.value); }} required type="date" value={publishedAt} /></label>
        <label>پنجره تازگی (روز)<input max={3650} min={1} onChange={(event) => { setMaxAgeDays(Number(event.target.value)); }} required type="number" value={maxAgeDays} /></label>
        <label>کیفیت منبع
          <select onChange={(event) => { setQuality(event.target.value as ResearchSourceQuality); }} value={quality}>
            <option value="primary">Primary / منبع اصلی</option>
            <option value="authoritative_secondary">Secondary معتبر</option>
            <option value="secondary">Secondary</option>
            <option value="unverified">تأییدنشده</option>
          </select>
        </label>
        <label>رابطه با Claim
          <select onChange={(event) => { setStance(event.target.value as ResearchSourceStance); }} value={stance}>
            <option value="supports">پشتیبانی می‌کند</option>
            <option value="contradicts">نقض می‌کند</option>
          </select>
        </label>
        <label className="research-wide">Claim مورد بررسی<textarea maxLength={4000} minLength={3} onChange={(event) => { setStatement(event.target.value); }} required rows={2} value={statement} /></label>
        <label className="research-wide">Excerpt دقیق<textarea maxLength={4000} minLength={20} onChange={(event) => { setExcerpt(event.target.value); }} required rows={3} value={excerpt} /></label>
        <button disabled={state === 'mutating'} type="submit">
          {state === 'mutating' ? <LoaderCircle className="spin" size={16} /> : <FileCheck2 size={16} />}
          {state === 'mutating' ? 'در حال ثبت…' : 'ثبت منبع؛ Claim همچنان Proposed بماند'}
        </button>
      </form>
      <div className="research-list">
        {snapshot.sources.length === 0 ? (
          <div className="learning-empty"><BookOpenText size={25} /><p>هنوز منبع بیرونی ثبت نشده است. Fact خارجی بدون Citation وارد Draft عمومی نمی‌شود.</p></div>
        ) : snapshot.sources.map((source) => (
          <article className={`research-card ${source.factCheckStatus}`} key={source.sourceId}>
            <div className="research-card-head">
              <span><b>{researchFactStatusLabel(source.factCheckStatus)}</b><small>{researchQualityLabel(source.quality)} · {researchFreshnessLabel(source.freshness)}</small></span>
              <a href={source.url} rel="noreferrer" target="_blank">مشاهده منبع <ArrowUpLeft size={14} /></a>
            </div>
            <h3>{source.title}</h3>
            <p>{source.publisher} · {formatDate(source.publishedAt)}</p>
            <blockquote>{source.statement}</blockquote>
            <p className="research-excerpt">{source.excerpt}</p>
            <code>{source.citation}</code>
            <div className="research-card-foot">
              <span>{source.stance === 'supports' ? 'Supports' : 'Contradicts'} · Quality {Math.round(source.qualityScore * 100)}٪</span>
              <strong>{source.usableForPublicClaim ? 'آماده Citation؛ نه Verified' : 'استفاده عمومی متوقف'}</strong>
            </div>
          </article>
        ))}
      </div>
      {error ? <div className="strategy-error" role="alert"><TriangleAlert size={15} /> {error}</div> : null}
    </section>
  );
}

function researchFactStatusLabel(status: ResearchWorkspaceSnapshot['sources'][number]['factCheckStatus']): string {
  return {
    citation_ready: 'Citation-ready',
    review_required: 'نیازمند بازبینی',
    contradicted: 'منبع نقض‌کننده',
    conflicted: 'تعارض منابع',
  }[status];
}

function OpportunityRadarPanel({
  error,
  onGoToResearch,
  onRefresh,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onGoToResearch: () => void;
  onRefresh: () => Promise<void>;
  snapshot: OpportunityRadarSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'error';
}>) {
  if (!snapshot && (state === 'idle' || state === 'loading')) {
    return <section className="memory-view-state" aria-live="polite"><LoaderCircle className="spin" size={24} /><h2>در حال سنجش Sourceها با Strategy…</h2><p>Goal، Audience، Timing، Quality و Conflict جداگانه بررسی می‌شوند.</p></section>;
  }
  if (!snapshot) {
    return <section className="memory-view-state" aria-live="polite"><Radar size={25} /><h2>رادار فرصت در دسترس نیست</h2><p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p><button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button></section>;
  }
  return (
    <section className="opportunity-center" aria-label="رادار فرصت خارجی">
      <header className="draft-head opportunity-head">
        <div><p className="overline">OPPORTUNITY RADAR v1 · TREND ≠ OPPORTUNITY</p><h2>هر موضوع داغ، حرکت مناسب شما نیست.</h2><p>فقط Sourceهای ثبت‌شده در Research با Strategy فعلی مقایسه می‌شوند. این Radar مانیتورینگ بیرونی یا Action Recommendation اجرا نمی‌کند.</p></div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button"><RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> ارزیابی دوباره</button>
      </header>
      {error ? <div className="inline-error" role="alert"><TriangleAlert size={16} />{error}</div> : null}
      <div className="opportunity-summary">
        <article><span>Source بررسی‌شده</span><strong>{snapshot.summary.sourcesAssessed}</strong></article>
        <article><span>Strategy Review</span><strong>{snapshot.summary.consider}</strong></article>
        <article><span>Monitor</span><strong>{snapshot.summary.monitor}</strong></article>
        <article><span>Exploration</span><strong>{snapshot.summary.explore}/{snapshot.summary.explorationBudget}</strong></article>
        <article><span>Ignore</span><strong>{snapshot.summary.ignored}</strong></article>
      </div>
      <div className="opportunity-boundary"><ShieldCheck size={18} /><span><b>بدون Score پنهان و بدون Side Effect</b><small>Trend خودکار Opportunity نیست · Action و Public Approval صادر نمی‌شود · Strategy revision: {snapshot.strategyRevision}</small></span></div>
      {snapshot.assessments.length === 0 ? (
        <section className="opportunity-empty"><Radar size={28} /><h3>هنوز Source بیرونی برای سنجش وجود ندارد</h3><p>ابتدا در Research یک منبع دارای Citation، Freshness و Quality ثبت کنید.</p><button onClick={onGoToResearch} type="button">رفتن به تحقیق بیرونی <ChevronLeft size={16} /></button></section>
      ) : (
        <div className="opportunity-list">
          {snapshot.assessments.map((assessment) => (
            <article className={`opportunity-card ${assessment.decision}`} key={assessment.sourceId}>
              <header><div><span className="overline">{opportunityAlignmentLabel(assessment.alignment)} · {assessment.publisher}</span><h3>{assessment.title}</h3></div><strong>{opportunityDecisionLabel(assessment.decision)}</strong></header>
              <p>{assessment.rationale}</p>
              <div className="opportunity-factors">
                {assessment.factors.map((factor) => <span className={factor.status} key={factor.factor}><b>{opportunityFactorLabel(factor.factor)}</b><small>{factor.rationale}</small></span>)}
              </div>
              {(assessment.matchedGoalTerms.length > 0 || assessment.matchedAudienceTerms.length > 0) ? (
                <div className="opportunity-terms"><span>Goal: {assessment.matchedGoalTerms.join('، ') || '—'}</span><span>Audience: {assessment.matchedAudienceTerms.join('، ') || '—'}</span></div>
              ) : null}
              <blockquote>{assessment.uncertainty}</blockquote>
              <footer><span>Next: {opportunityNextStepLabel(assessment.nextStep)}</span><code>{assessment.trace.factCheckStatus} · {assessment.trace.evidenceId.slice(0, 12)}…</code><b>External Action: ممنوع</b></footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function opportunityDecisionLabel(value: OpportunityRadarSnapshot['assessments'][number]['decision']): string {
  return { ignore: 'نادیده بگیر', monitor: 'فقط رصد', explore: 'تحقیق اکتشافی', consider: 'ورود به Strategy Review' }[value];
}

function opportunityAlignmentLabel(value: OpportunityRadarSnapshot['assessments'][number]['alignment']): string {
  return { none: 'بدون Alignment روشن', adjacent: 'حوزه مجاور', direct: 'Alignment مستقیم' }[value];
}

function opportunityFactorLabel(value: OpportunityRadarSnapshot['assessments'][number]['factors'][number]['factor']): string {
  return { goal: 'Goal', audience: 'Audience', timing: 'Timing', source_quality: 'Quality', source_conflict: 'Conflict' }[value];
}

function opportunityNextStepLabel(value: OpportunityRadarSnapshot['assessments'][number]['nextStep']): string {
  return { ignore: 'فعلاً کنار گذاشته شود', watch: 'در Watchlist بماند', research_more: 'تحقیق بیشتری انجام شود', bring_to_strategy_review: 'فقط در Strategy مرور شود' }[value];
}

function ClaimGovernancePanel({
  error,
  onRefresh,
  onReview,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onRefresh: () => Promise<void>;
  onReview: (input: Readonly<{
    claimId: string;
    expectedStatus: ClaimGovernanceSnapshot['claims'][number]['status'];
    decision: ClaimReviewDecision;
    rationale: string;
    humanAttestation: boolean;
  }>) => Promise<void>;
  snapshot: ClaimGovernanceSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'mutating' | 'error';
}>) {
  if ((state === 'idle' || state === 'loading') && !snapshot) {
    return <section className="memory-view-state" aria-live="polite"><LoaderCircle className="spin" size={24} /><h2>در حال بازیابی Claim Registry…</h2><p>Evidence، Source و Review انسانی کنار هم خوانده می‌شوند.</p></section>;
  }
  if (!snapshot) {
    return <section className="memory-view-state" aria-live="polite"><TriangleAlert size={25} /><h2>دفتر ادعاها در دسترس نیست</h2><p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p><button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button></section>;
  }
  return (
    <section className="claim-view" aria-label="مدیریت Fact و Claim">
      <header className="draft-head">
        <div>
          <p className="overline">Fact & Claim Management · Human Review</p>
          <h2>دفتر ادعاهای قابل‌ردیابی</h2>
          <p>Citation فقط Trace را کامل می‌کند؛ Verify نیازمند بازبینی و Attestation صریح شماست. Verify نیز به‌تنهایی مجوز انتشار ایجاد نمی‌کند.</p>
        </div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button"><RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> به‌روزرسانی</button>
      </header>
      <div className="claim-summary">
        <div><span>کل Claimها</span><strong>{snapshot.summary.totalClaims}</strong></div>
        <div><span>Verified</span><strong>{snapshot.summary.verified}</strong></div>
        <div><span>Proposed</span><strong>{snapshot.summary.proposed}</strong></div>
        <div className={snapshot.summary.traceBlocked ? 'danger' : undefined}><span>Trace مسدود</span><strong>{snapshot.summary.traceBlocked}</strong></div>
        <div><span>آماده استفاده عمومی</span><strong>{snapshot.summary.publicReady}</strong></div>
      </div>
      <div className="claim-list">
        {snapshot.claims.length === 0 ? (
          <div className="learning-empty"><ShieldCheck size={25} /><p>هنوز Claim ثبت نشده است. با ایجاد Draft مستند یا ثبت Research Source، Claim اینجا ظاهر می‌شود.</p></div>
        ) : snapshot.claims.map((claim) => (
          <ClaimReviewCard claim={claim} disabled={state === 'mutating'} key={claim.claimId} onReview={onReview} />
        ))}
      </div>
      {error ? <div className="strategy-error" role="alert"><TriangleAlert size={15} /> {error}</div> : null}
    </section>
  );
}

function ClaimReviewCard({
  claim,
  disabled,
  onReview,
}: Readonly<{
  claim: ClaimGovernanceSnapshot['claims'][number];
  disabled: boolean;
  onReview: (input: Readonly<{
    claimId: string;
    expectedStatus: ClaimGovernanceSnapshot['claims'][number]['status'];
    decision: ClaimReviewDecision;
    rationale: string;
    humanAttestation: boolean;
  }>) => Promise<void>;
}>) {
  const [decision, setDecision] = useState<ClaimReviewDecision>(claim.reviewableDecisions[0] ?? 'dispute');
  const [rationale, setRationale] = useState('');
  const [attested, setAttested] = useState(false);
  const activeDecision = claim.reviewableDecisions.includes(decision)
    ? decision
    : (claim.reviewableDecisions[0] ?? 'dispute');
  return (
    <article className={`claim-card risk-${claim.riskLevel}`}>
      <div className="claim-card-head">
        <span><b>{claimStatusLabel(claim.status)}</b><small>{claimKindLabel(claim.kind)} · {claimTraceLabel(claim.traceStatus)}</small></span>
        <strong>{claim.riskLevel.toUpperCase()}</strong>
      </div>
      <blockquote>{claim.statement}</blockquote>
      <div className="claim-tags">
        {claim.categories.map((category) => <span key={category}>{claimCategoryLabel(category)}</span>)}
      </div>
      <p className="claim-trace"><Network size={16} /> {claim.traceRationale}</p>
      <div className="claim-proof-grid">
        <span>Evidence <b>{claim.evidenceIds.length}</b></span>
        <span>Source Ref <b>{claim.sourceRefs.length}</b></span>
        <span>Purpose <b>{claim.allowedPurposes.length}</b></span>
        <span>Channel <b>{claim.allowedChannels.length}</b></span>
      </div>
      {claim.research ? <a className="claim-source" href={claim.research.url} rel="noreferrer" target="_blank">{claim.research.publisher} · {claim.research.title} <ArrowUpLeft size={14} /></a> : null}
      <div className="claim-public-state">
        {claim.canUsePublicly ? <><ShieldCheck size={16} /> Trace و مجوز استفاده عمومی حاضر است.</> : <><TriangleAlert size={16} /> استفاده عمومی هنوز مسدود است.</>}
      </div>
      {claim.lastReview ? <p className="claim-last-review">آخرین Review: {claimDecisionLabel(claim.lastReview.decision)} · {formatDate(claim.lastReview.reviewedAt)} — {claim.lastReview.rationale}</p> : null}
      {claim.reviewableDecisions.length > 0 ? (
        <form className="claim-review-form" onSubmit={(event) => {
          event.preventDefault();
          void onReview({ claimId: claim.claimId, expectedStatus: claim.status, decision: activeDecision, rationale, humanAttestation: activeDecision === 'verify' ? attested : false });
        }}>
          <label>تصمیم
            <select onChange={(event) => { setDecision(event.target.value as ClaimReviewDecision); setAttested(false); }} value={activeDecision}>
              {claim.reviewableDecisions.map((item) => <option key={item} value={item}>{claimDecisionLabel(item)}</option>)}
            </select>
          </label>
          <label className="claim-rationale">Rationale قابل Audit
            <textarea maxLength={2000} minLength={20} onChange={(event) => { setRationale(event.target.value); }} required rows={2} value={rationale} />
          </label>
          {activeDecision === 'verify' ? <label className="claim-attestation"><input checked={attested} onChange={(event) => { setAttested(event.target.checked); }} required type="checkbox" /> من Source، Evidence، Freshness و متن دقیق Claim را شخصاً بازبینی کرده‌ام.</label> : null}
          <button disabled={disabled} type="submit">{disabled ? <LoaderCircle className="spin" size={16} /> : <FileCheck2 size={16} />} ثبت Review</button>
        </form>
      ) : null}
    </article>
  );
}

function claimStatusLabel(status: ClaimGovernanceSnapshot['claims'][number]['status']): string {
  return { proposed: 'Proposed', verified: 'Verified', disputed: 'Disputed', expired: 'Expired', revoked: 'Revoked' }[status];
}

function claimKindLabel(kind: ClaimGovernanceSnapshot['claims'][number]['kind']): string {
  return { personal_fact: 'Fact شخصی', external_fact: 'Fact بیرونی', opinion: 'نظر', projection: 'پیش‌بینی' }[kind];
}

function claimTraceLabel(status: ClaimGovernanceSnapshot['claims'][number]['traceStatus']): string {
  return { complete: 'Trace کامل', incomplete: 'Trace ناقص', stale: 'منبع کهنه', unverified_source: 'منبع تأییدنشده', contradicted: 'نقض‌شده', conflicted: 'متعارض' }[status];
}

function claimCategoryLabel(category: ClaimGovernanceSnapshot['claims'][number]['categories'][number]): string {
  return { company: 'شرکت', revenue: 'درآمد', experience: 'سابقه', education: 'تحصیلات', numeric: 'عدد', award: 'جایزه', third_party: 'شخص ثالث', research: 'تحقیق', general: 'عمومی' }[category];
}

function claimDecisionLabel(decision: ClaimReviewDecision): string {
  return { verify: 'تأیید انسانی', dispute: 'اعتراض', revoke: 'ابطال' }[decision];
}

function researchQualityLabel(quality: ResearchSourceQuality): string {
  return {
    primary: 'منبع اصلی',
    authoritative_secondary: 'Secondary معتبر',
    secondary: 'Secondary',
    unverified: 'تأییدنشده',
  }[quality];
}

function researchFreshnessLabel(freshness: ResearchWorkspaceSnapshot['sources'][number]['freshness']): string {
  return { fresh: 'تازه', aging: 'نزدیک بازبینی', stale: 'کهنه' }[freshness];
}

function DecisionArbitrationPanel({
  error,
  onAssess,
  onRefresh,
  onSelect,
  selectedActionId,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onAssess: (actionId: string, level: AutonomyLevel) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelect: (actionId: string) => void;
  selectedActionId: string;
  snapshot: ArbitrationWorkspaceSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'mutating' | 'error';
}>) {
  const [level, setLevel] = useState<AutonomyLevel>(2);
  if ((state === 'idle' || state === 'loading') && !snapshot) {
    return <section className="memory-view-state" aria-live="polite"><LoaderCircle className="spin" size={24} /><h2>در حال جمع‌آوری رأی ماژول‌ها…</h2><p>Strategy، Permission، Claim، Risk و Authenticity مستقل بررسی می‌شوند.</p></section>;
  }
  if (!snapshot) {
    return <section className="memory-view-state" aria-live="polite"><TriangleAlert size={25} /><h2>مرکز داوری در دسترس نیست</h2><p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p><button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button></section>;
  }
  const selectedAction = snapshot.availableActions.find((action) => action.id === selectedActionId)
    ?? snapshot.availableActions[0];
  const cases = snapshot.cases.filter((item) => item.action.id === selectedAction.id);
  return (
    <section className="arbitration-center" aria-label="داوری تصمیم بین ماژول‌ها">
      <header className="draft-head">
        <div>
          <p className="overline">Inter-module Contract · Arbitration · Autonomy</p>
          <h2>هیچ ماژولی به‌تنهایی تصمیم نهایی نیست</h2>
          <p>هر رأی با Provenance، Confidence و Authority محدود ثبت می‌شود. مخالفت یا «نمی‌دانم» حذف نمی‌شود و سقف MVP فقط Level 5 است؛ Execution همیشه خاموش می‌ماند.</p>
        </div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button"><RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> تازه‌سازی Context</button>
      </header>

      <form className="arbitration-request" onSubmit={(event) => { event.preventDefault(); void onAssess(selectedAction.id, level); }}>
        <label>
          اقدام مورد بررسی
          <select onChange={(event) => { onSelect(event.target.value); }} value={selectedAction.id}>
            {snapshot.availableActions.map((action) => (
              <option key={action.id} value={action.id}>{action.title} · {action.evidenceCount} شاهد</option>
            ))}
          </select>
        </label>
        <label>
          سطح Autonomy درخواستی
          <select onChange={(event) => { setLevel(Number(event.target.value) as AutonomyLevel); }} value={level}>
            {snapshot.autonomy.map((item) => (
              <option key={item.level} value={item.level}>Level {item.level} — {item.label}</option>
            ))}
          </select>
        </label>
        <button disabled={state === 'mutating'} type="submit">
          {state === 'mutating' ? <LoaderCircle className="spin" size={16} /> : <Scale size={16} />}
          {state === 'mutating' ? 'در حال داوری…' : 'ثبت Snapshot داوری'}
        </button>
        <small><LockKeyhole size={14} /> اختیار این درخواست فقط `append_decision_only` است؛ هیچ ماژولی Write یا Execute نمی‌کند.</small>
      </form>

      {cases.length === 0 ? (
        <div className="arbitration-empty"><Scale size={24} /><h3>هنوز Snapshot داوری برای این اقدام ثبت نشده</h3><p>سطح موردنظر را انتخاب کنید تا رأی مستقل Gateها و سقف مؤثر Autonomy ثبت شود.</p></div>
      ) : (
        <div className="arbitration-cases">
          {cases.map((item) => (
            <article className={`arbitration-case outcome-${item.decision.outcome}`} key={item.caseId}>
              <header>
                <div>
                  <span className="overline">{item.stale ? 'STALE SNAPSHOT' : item.policyVersion}</span>
                  <h3>{item.action.title}</h3>
                </div>
                <strong>{arbitrationOutcomeLabel(item.decision.outcome)}</strong>
              </header>
              <p>{item.decision.rationale}</p>
              <div className="arbitration-summary">
                <span>درخواست: Level {item.request.requestedAutonomyLevel}</span>
                <span>سقف مؤثر: Level {item.decision.effectiveAutonomyLevel}</span>
                <span>{item.decision.requiresHumanApproval ? 'تأیید انسانی لازم' : 'فعلاً فقط Recommendation'}</span>
                <span className="execution-off">Execution: خاموش</span>
              </div>
              <div className="module-opinions">
                {item.opinions.map((opinion) => (
                  <div className={`module-opinion opinion-${opinion.position}`} key={opinion.module}>
                    <header><b>{arbitrationModuleLabel(opinion.module)}</b><span>{modulePositionLabel(opinion.position)}</span></header>
                    <p>{opinion.rationale}</p>
                    <small>از Level {opinion.appliesFromAutonomyLevel} · Confidence {Math.round(opinion.confidence * 100)}٪ · Write: none</small>
                  </div>
                ))}
              </div>
              <footer>
                <span>مخالفت حفظ شد: {item.decision.dissentPreserved ? 'بله' : 'خیر'}</span>
                <span>اعتبار تا {formatDate(item.validUntil)}</span>
                <code>{item.snapshotHash.slice(0, 12)}</code>
              </footer>
            </article>
          ))}
        </div>
      )}
      {error ? <div className="strategy-error" role="alert"><TriangleAlert size={15} /> {error}</div> : null}
    </section>
  );
}

function InitiativePolicyPanel({
  error,
  onEvaluate,
  onNavigate,
  onRefresh,
  onSave,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onEvaluate: () => Promise<void>;
  onNavigate: (target: 'intake' | 'today' | 'arbitration') => void;
  onRefresh: () => Promise<void>;
  onSave: (input: Readonly<{
    mode: InitiativeMode;
    maxPromptsPer24Hours: 1 | 2 | 3;
    minimumRelevance: number;
    pausedUntil: string | null;
  }>) => Promise<void>;
  snapshot: InitiativeWorkspaceSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'mutating' | 'error';
}>) {
  const [mode, setMode] = useState<InitiativeMode>(snapshot?.settings.mode ?? 'reactive');
  const [limit, setLimit] = useState<1 | 2 | 3>(snapshot?.settings.maxPromptsPer24Hours ?? 1);
  const [threshold, setThreshold] = useState(snapshot?.settings.minimumRelevance ?? 0.75);
  const [paused, setPaused] = useState(
    Boolean(snapshot?.settings.pausedUntil && new Date(snapshot.settings.pausedUntil).getTime() > Date.now()),
  );
  if ((state === 'idle' || state === 'loading') && !snapshot) {
    return <section className="memory-view-state" aria-live="polite"><LoaderCircle className="spin" size={24} /><h2>در حال بررسی سیاست مزاحمت…</h2><p>Mode، Relevance و سقف ۲۴ساعته قبل از هر Cue سنجیده می‌شوند.</p></section>;
  }
  if (!snapshot) {
    return <section className="memory-view-state" aria-live="polite"><TriangleAlert size={25} /><h2>مرکز ابتکار عمل در دسترس نیست</h2><p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p><button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button></section>;
  }
  const latestDelivered = snapshot.evaluations.find(
    (item) => item.decision === 'delivered' && !item.stale && item.candidate,
  );
  return (
    <section className="initiative-center" aria-label="سیاست ابتکار عمل کنترل‌شده">
      <header className="draft-head">
        <div>
          <p className="overline">Proactive / Reactive · Owner Controlled · Rate Limited</p>
          <h2>مزاحمت فقط با اجازه، ارتباط و سقف روشن</h2>
          <p>پیش‌فرض Reactive است. حتی در حالت Proactive، خروجی فقط یک Cue اختیاری است؛ پیام بیرونی، Publish یا اجرای Action وجود ندارد.</p>
        </div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button"><RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> تازه‌سازی Signal</button>
      </header>

      {error ? <div className="inline-error" role="alert"><TriangleAlert size={16} />{error}</div> : null}

      <form
        className="initiative-settings"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            mode,
            maxPromptsPer24Hours: limit,
            minimumRelevance: threshold,
            pausedUntil: paused ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
          });
        }}
      >
        <label>حالت ارتباط
          <select onChange={(event) => { setMode(event.target.value as InitiativeMode); }} value={mode}>
            <option value="reactive">Reactive — فقط در پاسخ به من</option>
            <option value="balanced">Balanced — فقط Signalهای مهم</option>
            <option value="proactive">Proactive — طبق سقف انتخابی</option>
          </select>
        </label>
        <label>سقف در ۲۴ ساعت
          <select onChange={(event) => { setLimit(Number(event.target.value) as 1 | 2 | 3); }} value={limit}>
            <option value={1}>۱ Cue</option><option value={2}>۲ Cue</option><option value={3}>۳ Cue</option>
          </select>
        </label>
        <label>حداقل ارتباط
          <select onChange={(event) => { setThreshold(Number(event.target.value)); }} value={threshold}>
            <option value={0.6}>۶۰٪</option><option value={0.75}>۷۵٪</option><option value={0.9}>۹۰٪</option><option value={0.95}>۹۵٪</option>
          </select>
        </label>
        <label className="initiative-pause"><input checked={paused} onChange={(event) => { setPaused(event.target.checked); }} type="checkbox" /> توقف برای ۲۴ ساعت</label>
        <button disabled={state === 'mutating'} type="submit">{state === 'mutating' ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} ذخیره کنترل‌ها</button>
      </form>

      <div className="initiative-meter">
        <span><Clock3 size={16} /> {snapshot.window.delivered} Cue نمایش‌داده‌شده</span>
        <strong>{snapshot.window.remaining} ظرفیت باقی‌مانده</strong>
        <small>پنجره شناور ۲۴ساعته · Revision {snapshot.settings.revision} · {snapshot.persistence === 'postgres' ? 'پایدار' : 'موقت'}</small>
      </div>

      {latestDelivered?.candidate ? (
        <article className="initiative-cue delivered">
          <header><BellRing size={21} /><div><span className="overline">CUE DELIVERED · {Math.round(latestDelivered.candidate.relevance * 100)}٪ مرتبط</span><h3>{latestDelivered.candidate.title}</h3></div></header>
          <p>{latestDelivered.candidate.prompt}</p>
          <small>{latestDelivered.candidate.rationale}</small>
          <button onClick={() => { onNavigate(latestDelivered.candidate?.targetView ?? 'today'); }} type="button">رفتن به بخش مرتبط <ChevronLeft size={16} /></button>
        </article>
      ) : snapshot.preview.candidate ? (
        <article className={`initiative-cue ${snapshot.preview.decision}`}>
          <header><BellRing size={21} /><div><span className="overline">PREVIEW · {Math.round(snapshot.preview.candidate.relevance * 100)}٪ مرتبط</span><h3>{snapshot.preview.candidate.title}</h3></div></header>
          <p>{snapshot.preview.candidate.prompt}</p>
          <small>{initiativeReasonLabel(snapshot.preview.reason)}</small>
          <button disabled={state === 'mutating' || snapshot.preview.decision !== 'delivered'} onClick={() => void onEvaluate()} type="button">ثبت و نمایش Cue</button>
        </article>
      ) : (
        <div className="arbitration-empty"><BellRing size={24} /><h3>Signal مادی برای مزاحمت وجود ندارد</h3><p>سیستم به‌جای ساختن موضوع، سکوت می‌کند.</p></div>
      )}

      {snapshot.evaluations.length > 0 ? (
        <div className="initiative-ledger">
          <h3>دفتر تصمیم‌های Proactivity</h3>
          {snapshot.evaluations.slice(0, 8).map((item) => (
            <div key={item.evaluationId}>
              <span className={item.decision}>{item.decision === 'delivered' ? 'نمایش داده شد' : 'متوقف شد'}</span>
              <b>{item.candidate?.title ?? 'بدون Signal مادی'}</b>
              <small>{initiativeReasonLabel(item.reason)}{item.stale ? ' · Context قدیمی' : ''}</small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function initiativeReasonLabel(reason: InitiativeWorkspaceSnapshot['preview']['reason']): string {
  return {
    delivered: 'از Mode، Relevance Gate و سقف ۲۴ساعته عبور کرده است.',
    reactive_mode: 'حالت Reactive فعال است؛ سیستم بدون درخواست شما Cue نشان نمی‌دهد.',
    paused: 'ابتکار عمل تا زمان انتخاب‌شده متوقف است.',
    rate_limited: 'سقف ۲۴ساعته پر شده و Cue جدید متوقف شد.',
    below_relevance: 'ارتباط Signal از حداقل انتخاب‌شده کمتر است.',
    no_material_signal: 'Signal مادی و قابل‌ردیابی وجود ندارد.',
  }[reason];
}

function RelationshipWorkspacePanel({
  error,
  onCreate,
  onDelete,
  onRefresh,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onCreate: (input: Readonly<{
    label: string;
    group: StakeholderGroup;
    outcome: string;
    priority: StakeholderPriority;
    strength: RelationshipStrength;
    boundary: RelationshipBoundary;
    contextNote: string;
    lastInteractionAt: string | null;
    consentConfirmed: boolean;
  }>) => Promise<void>;
  onDelete: (stakeholderId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  snapshot: RelationshipWorkspaceSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'mutating' | 'error';
}>) {
  const [label, setLabel] = useState('');
  const [group, setGroup] = useState<StakeholderGroup>('client');
  const [outcome, setOutcome] = useState('');
  const [priority, setPriority] = useState<StakeholderPriority>('medium');
  const [strength, setStrength] = useState<RelationshipStrength>('unknown');
  const [boundary, setBoundary] = useState<RelationshipBoundary>('normal');
  const [contextNote, setContextNote] = useState('');
  const [lastInteractionAt, setLastInteractionAt] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  if ((state === 'idle' || state === 'loading') && !snapshot) {
    return <section className="memory-view-state" aria-live="polite"><LoaderCircle className="spin" size={24} /><h2>در حال ساخت نقشه ذی‌نفعان…</h2><p>فقط Context خصوصی مالک خوانده می‌شود؛ هیچ Contact یا پیام بیرونی وجود ندارد.</p></section>;
  }
  if (!snapshot) {
    return <section className="memory-view-state" aria-live="polite"><TriangleAlert size={25} /><h2>فضای روابط در دسترس نیست</h2><p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p><button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button></section>;
  }
  return (
    <section className="relationship-center" aria-label="نقشه خصوصی ذی‌نفعان و روابط">
      <header className="draft-head">
        <div>
          <p className="overline">RELATIONSHIP INTELLIGENCE · PRIVATE CONTEXT · MANUAL ONLY</p>
          <h2>نقشه رابطه، بدون تبدیل انسان به CRM</h2>
          <p>نام یا برچسب خصوصی، Outcome و Boundary را ثبت کن. شماره تماس، ایمیل، پیام خودکار یا Public Use در این نسخه وجود ندارد.</p>
        </div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button"><RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> تازه‌سازی نقشه</button>
      </header>

      {error ? <div className="inline-error" role="alert"><TriangleAlert size={16} />{error}</div> : null}

      <div className="relationship-summary">
        <article><span>کل ذی‌نفعان</span><strong>{snapshot.summary.totalStakeholders}</strong></article>
        <article><span>اولویت بالا</span><strong>{snapshot.summary.highPriority}</strong></article>
        <article><span>Context ناقص</span><strong>{snapshot.summary.contextNeeded}</strong></article>
        <article><span>مرور پیشنهادی</span><strong>{snapshot.summary.reviewSuggested}</strong></article>
        <article><span>Boundary محافظت‌شده</span><strong>{snapshot.summary.boundaryProtected}</strong></article>
      </div>

      <form
        className="relationship-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate({
            label,
            group,
            outcome,
            priority,
            strength,
            boundary,
            contextNote,
            lastInteractionAt: lastInteractionAt
              ? new Date(`${lastInteractionAt}T00:00:00.000Z`).toISOString()
              : null,
            consentConfirmed,
          });
        }}
      >
        <div className="relationship-form-head">
          <div><p className="overline">ثبت دستی و حداقلی</p><h3>یک Stakeholder با Context انسانی اضافه کن</h3></div>
          <span><LockKeyhole size={15} /> confidential · relationship_planning</span>
        </div>
        <label>نام یا برچسب خصوصی
          <input maxLength={120} minLength={2} onChange={(event) => { setLabel(event.target.value); }} placeholder="مثلاً همکار قدیمی" required value={label} />
        </label>
        <label>گروه
          <select onChange={(event) => { setGroup(event.target.value as StakeholderGroup); }} value={group}>
            {relationshipGroupOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label className="wide">Outcome مرتبط
          <input maxLength={240} minLength={3} onChange={(event) => { setOutcome(event.target.value); }} placeholder="این رابطه برای کدام نتیجه مهم است؟" required value={outcome} />
        </label>
        <label>اولویت استراتژیک
          <select onChange={(event) => { setPriority(event.target.value as StakeholderPriority); }} value={priority}>
            <option value="low">کم</option><option value="medium">متوسط</option><option value="high">بالا</option>
          </select>
        </label>
        <label>Strength رابطه
          <select onChange={(event) => { setStrength(event.target.value as RelationshipStrength); }} value={strength}>
            <option value="unknown">نامشخص</option><option value="emerging">در حال شکل‌گیری</option><option value="active">فعال</option><option value="trusted">مورد اعتماد</option>
          </select>
        </label>
        <label>Boundary
          <select onChange={(event) => { setBoundary(event.target.value as RelationshipBoundary); }} value={boundary}>
            <option value="normal">عادی؛ فقط مرور Context</option>
            <option value="ask_before_prompt">قبل از هر Prompt از من بپرس</option>
            <option value="do_not_prompt">هیچ Promptی نده</option>
          </select>
        </label>
        <label>آخرین تعامل، اختیاری
          <input max={new Date().toISOString().slice(0, 10)} onChange={(event) => { setLastInteractionAt(event.target.value); }} type="date" value={lastInteractionAt} />
        </label>
        <label className="wide">Context خصوصی رابطه
          <textarea maxLength={1000} minLength={10} onChange={(event) => { setContextNote(event.target.value); }} placeholder="زمینه رابطه، حساسیت‌ها و چیزی که نباید فراموش شود…" required rows={3} value={contextNote} />
        </label>
        <label className="relationship-consent wide">
          <input checked={consentConfirmed} onChange={(event) => { setConsentConfirmed(event.target.checked); }} required type="checkbox" />
          <span>تأیید می‌کنم این اطلاعات را آگاهانه و فقط برای برنامه‌ریزی خصوصی رابطه ثبت می‌کنم؛ شامل Contact Detail یا مجوز تماس خودکار نیست.</span>
        </label>
        <button className="wide" disabled={state === 'mutating' || !consentConfirmed} type="submit">{state === 'mutating' ? <LoaderCircle className="spin" size={16} /> : <Network size={16} />} ثبت در نقشه خصوصی</button>
      </form>

      {snapshot.groups.length > 0 ? (
        <div className="relationship-groups">
          {snapshot.groups.map((item) => <span key={item.group}>{relationshipGroupLabel(item.group)} <b>{item.count}</b>{item.highPriority ? <small>{item.highPriority} مهم</small> : null}</span>)}
        </div>
      ) : null}

      {snapshot.stakeholders.length === 0 ? (
        <div className="arbitration-empty"><Network size={25} /><h3>هنوز رابطه‌ای ثبت نشده است</h3><p>با یک Stakeholder مهم شروع کن؛ داده‌ی حداقلی و Boundary روشن کافی است.</p></div>
      ) : (
        <div className="relationship-list">
          {snapshot.stakeholders.map((record) => (
            <article className={`relationship-card ${record.attention}`} key={record.stakeholderId}>
              <header>
                <div><span className="overline">{relationshipGroupLabel(record.group)} · {relationshipPriorityLabel(record.priority)}</span><h3>{record.label}</h3></div>
                <button
                  aria-label={`حذف ${record.label}`}
                  disabled={state === 'mutating'}
                  onClick={() => {
                    if (window.confirm('این Context رابطه به‌صورت کامل حذف شود؟')) void onDelete(record.stakeholderId);
                  }}
                  type="button"
                ><Trash2 size={16} /> حذف</button>
              </header>
              <p className="relationship-outcome"><b>Outcome:</b> {record.outcome}</p>
              <p>{record.contextNote}</p>
              <div className="relationship-meta">
                <span>Strength: {relationshipStrengthLabel(record.strength)}</span>
                <span>Recency: {relationshipRecencyLabel(record.recency)}</span>
                <span>Boundary: {relationshipBoundaryLabel(record.boundary)}</span>
                <span>آخرین تعامل: {record.lastInteractionAt ? formatDate(record.lastInteractionAt) : 'ثبت نشده'}</span>
              </div>
              <small className="relationship-rationale">{record.rationale}</small>
              <footer><LockKeyhole size={13} /> Contact ذخیره نشده · تماس و Automation مجاز نیست</footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const relationshipGroupOptions: readonly (readonly [StakeholderGroup, string])[] = [
  ['client', 'مشتری'], ['investor', 'سرمایه‌گذار'], ['peer', 'همکار'], ['manager', 'مدیر'],
  ['team', 'عضو تیم'], ['media', 'رسانه'], ['journalist', 'خبرنگار'], ['industry_leader', 'رهبر صنعت'],
  ['community', 'جامعه / Community'], ['potential_partner', 'همکار بالقوه'], ['critic', 'منتقد'],
  ['friend', 'دوست'], ['public', 'جامعه عمومی'], ['policymaker', 'سیاست‌گذار'], ['other', 'سایر'],
];

function relationshipGroupLabel(value: StakeholderGroup): string {
  return relationshipGroupOptions.find(([key]) => key === value)?.[1] ?? value;
}

function relationshipPriorityLabel(value: StakeholderPriority): string {
  return { low: 'اولویت کم', medium: 'اولویت متوسط', high: 'اولویت بالا' }[value];
}

function relationshipStrengthLabel(value: RelationshipStrength): string {
  return { unknown: 'نامشخص', emerging: 'در حال شکل‌گیری', active: 'فعال', trusted: 'مورد اعتماد' }[value];
}

function relationshipBoundaryLabel(value: RelationshipBoundary): string {
  return { normal: 'عادی', ask_before_prompt: 'تأیید قبل از Prompt', do_not_prompt: 'بدون Prompt' }[value];
}

function relationshipRecencyLabel(value: RelationshipWorkspaceSnapshot['stakeholders'][number]['recency']): string {
  return { unknown: 'نامشخص', recent: 'تازه', quiet: 'کم‌تعامل', dormant: 'طولانی بدون تعامل', protected: 'محافظت‌شده' }[value];
}

function PerceptionWorkspacePanel({
  error,
  onCreate,
  onDelete,
  onRefresh,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onCreate: (input: Readonly<{
    dimension: PerceptionDimension;
    perspective: PerceptionPerspective;
    stage: PerceptionStage;
    summary: string;
    evidenceNote: string;
    sourceKind: PerceptionSourceKind;
    confidence: PerceptionConfidence;
    observedAt: string;
    consentConfirmed: boolean;
  }>) => Promise<void>;
  onDelete: (signalId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  snapshot: PerceptionWorkspaceSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'mutating' | 'error';
}>) {
  const [dimension, setDimension] = useState<PerceptionDimension>('trust');
  const [perspective, setPerspective] = useState<PerceptionPerspective>('self_perception');
  const [stage, setStage] = useState<PerceptionStage>('visible');
  const [summary, setSummary] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [sourceKind, setSourceKind] = useState<PerceptionSourceKind>('owner_reflection');
  const [confidence, setConfidence] = useState<PerceptionConfidence>('medium');
  const [observedAt, setObservedAt] = useState(new Date().toISOString().slice(0, 10));
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  if ((state === 'idle' || state === 'loading') && !snapshot) {
    return <section className="memory-view-state" aria-live="polite"><LoaderCircle className="spin" size={24} /><h2>در حال ساخت نقشه ادراک…</h2><p>سه Perspective مستقل خوانده می‌شوند؛ هیچ Signal بیرونی Fact نمی‌شود.</p></section>;
  }
  if (!snapshot) {
    return <section className="memory-view-state" aria-live="polite"><TriangleAlert size={25} /><h2>فضای ادراک در دسترس نیست</h2><p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p><button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button></section>;
  }
  const sourceOptions = perspective === 'self_perception'
    ? [['owner_reflection', 'بازتاب و خوداظهاری مالک']] as const
    : perspective === 'desired_positioning'
      ? [['owner_goal', 'هدف جایگاه‌یابی مالک']] as const
      : perceptionExternalSourceOptions;
  return (
    <section className="relationship-center perception-center" aria-label="موتور خصوصی تحلیل ادراک">
      <header className="draft-head">
        <div>
          <p className="overline">PERCEPTION ENGINE · EPISTEMIC LANES · MANUAL ONLY</p>
          <h2>فاصله ادراک، بدون تبدیل Signal به حقیقت</h2>
          <p>Self Perception، جایگاه مطلوب و ادراک بیرونی جدا می‌مانند. تناقض حذف نمی‌شود و نبود داده با حدس پر نخواهد شد.</p>
        </div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button"><RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> تازه‌سازی تحلیل</button>
      </header>

      {error ? <div className="inline-error" role="alert"><TriangleAlert size={16} />{error}</div> : null}

      <div className="relationship-summary">
        <article><span>کل Signalها</span><strong>{snapshot.summary.totalSignals}</strong></article>
        <article><span>ابعاد پوشش‌داده‌شده</span><strong>{snapshot.summary.coveredDimensions}</strong></article>
        <article><span>External Perception</span><strong>{snapshot.summary.externalSignals}</strong></article>
        <article><span>Underrecognized</span><strong>{snapshot.summary.underrecognized}</strong></article>
        <article><span>Blind Spot احتمالی</span><strong>{snapshot.summary.potentialBlindSpots}</strong></article>
      </div>

      <form
        className="relationship-form perception-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate({
            dimension,
            perspective,
            stage,
            summary,
            evidenceNote,
            sourceKind,
            confidence,
            observedAt: new Date(`${observedAt}T00:00:00.000Z`).toISOString(),
            consentConfirmed,
          }).then(() => {
            setSummary('');
            setEvidenceNote('');
            setConsentConfirmed(false);
          });
        }}
      >
        <div className="relationship-form-head">
          <div><p className="overline">ثبت Signal کیفی</p><h3>یک مشاهده را در lane درست قرار بده</h3></div>
          <span><LockKeyhole size={15} /> confidential · perception_analysis</span>
        </div>
        <label>بُعد ادراک
          <select onChange={(event) => { setDimension(event.target.value as PerceptionDimension); }} value={dimension}>
            {perceptionDimensionOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label>Perspective
          <select
            onChange={(event) => {
              const next = event.target.value as PerceptionPerspective;
              setPerspective(next);
              setSourceKind(next === 'self_perception' ? 'owner_reflection' : next === 'desired_positioning' ? 'owner_goal' : 'direct_feedback');
            }}
            value={perspective}
          >
            <option value="self_perception">Self Perception · خوداظهاری</option>
            <option value="desired_positioning">Desired Positioning · هدف</option>
            <option value="external_perception">External Perception · نظر بیرونی</option>
          </select>
        </label>
        <label>Stage کیفی
          <select onChange={(event) => { setStage(event.target.value as PerceptionStage); }} value={stage}>
            {perceptionStageOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label>نوع منبع
          <select onChange={(event) => { setSourceKind(event.target.value as PerceptionSourceKind); }} value={sourceKind}>
            {sourceOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <label>Confidence
          <select onChange={(event) => { setConfidence(event.target.value as PerceptionConfidence); }} value={confidence}>
            <option value="low">کم · Signal محدود</option><option value="medium">متوسط</option><option value="high">بالا · چند شاهد مستقل</option>
          </select>
        </label>
        <label>تاریخ مشاهده
          <input max={new Date().toISOString().slice(0, 10)} onChange={(event) => { setObservedAt(event.target.value); }} required type="date" value={observedAt} />
        </label>
        <label className="wide">خلاصه‌ی Signal
          <input maxLength={400} minLength={5} onChange={(event) => { setSummary(event.target.value); }} placeholder="برداشت را کوتاه و بدون هویت منبع بنویس…" required value={summary} />
        </label>
        <label className="wide">Evidence Note
          <textarea maxLength={1000} minLength={10} onChange={(event) => { setEvidenceNote(event.target.value); }} placeholder="زمینه، محدودیت و دلیل Confidence؛ بدون نام، Contact یا نقل‌قول خصوصی…" required rows={3} value={evidenceNote} />
        </label>
        <label className="relationship-consent wide">
          <input checked={consentConfirmed} onChange={(event) => { setConsentConfirmed(event.target.checked); }} required type="checkbox" />
          <span>تأیید می‌کنم حق ثبت این خلاصه را دارم؛ هویت منبع، اطلاعات تماس و نقل‌قول خصوصی وارد نشده و این Signal مجوز Social Listening، تماس یا انتشار نیست.</span>
        </label>
        <button className="wide" disabled={state === 'mutating' || !consentConfirmed} type="submit">{state === 'mutating' ? <LoaderCircle className="spin" size={16} /> : <Eye size={16} />} ثبت Signal خصوصی</button>
      </form>

      {snapshot.dimensions.length === 0 ? (
        <div className="arbitration-empty"><Eye size={25} /><h3>هنوز Signal ادراکی ثبت نشده است</h3><p>با یک بُعد و یک Perspective شروع کن؛ برای نتیجه‌گیری عجله‌ای وجود ندارد.</p></div>
      ) : (
        <div className="perception-dimension-grid">
          {snapshot.dimensions.map((item) => (
            <article className={`perception-dimension ${item.gap}`} key={item.dimension}>
              <header><span className="overline">{perceptionDimensionLabel(item.dimension)}</span><b>{perceptionGapLabel(item.gap)}</b></header>
              <div className="perception-lanes">
                <span>Self <strong>{item.selfStage ? perceptionStageLabel(item.selfStage) : 'داده ناکافی'}</strong></span>
                <span>Desired <strong>{item.desiredStage ? perceptionStageLabel(item.desiredStage) : 'داده ناکافی'}</strong></span>
                <span>External <strong>{item.externalRange ? `${perceptionStageLabel(item.externalRange.lowest)} تا ${perceptionStageLabel(item.externalRange.highest)}` : 'داده ناکافی'}</strong></span>
              </div>
              <p>{item.rationale}</p>
              <footer>{perceptionBlindSpotLabel(item.blindSpot)}{item.externalRange?.conflictingStages ? ' · Signalهای متناقض حفظ شده‌اند' : ''}</footer>
            </article>
          ))}
        </div>
      )}

      {snapshot.signals.length > 0 ? (
        <div className="relationship-list perception-signal-list">
          {snapshot.signals.map((signal) => (
            <article className="relationship-card" key={signal.signalId}>
              <header>
                <div><span className="overline">{perceptionPerspectiveLabel(signal.perspective)} · {perceptionDimensionLabel(signal.dimension)}</span><h3>{perceptionStageLabel(signal.stage)}</h3></div>
                <button
                  aria-label="حذف Signal ادراکی"
                  disabled={state === 'mutating'}
                  onClick={() => { if (window.confirm('این Signal و متن خصوصی آن کاملاً حذف شود؟')) void onDelete(signal.signalId); }}
                  type="button"
                ><Trash2 size={16} /> حذف</button>
              </header>
              <p className="relationship-outcome">{signal.summary}</p>
              <p>{signal.evidenceNote}</p>
              <div className="relationship-meta"><span>Epistemic: {signal.epistemicType}</span><span>Confidence: {perceptionConfidenceLabel(signal.confidence)}</span><span>مشاهده: {formatDate(signal.observedAt)}</span></div>
              <footer><LockKeyhole size={13} /> هویت منبع و نقل‌قول خصوصی ذخیره نشده · جمع‌آوری و اقدام بیرونی مجاز نیست</footer>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

const perceptionDimensionOptions: readonly (readonly [PerceptionDimension, string])[] = [
  ['expertise', 'تخصص'], ['trust', 'اعتماد'], ['leadership', 'رهبری'], ['clarity', 'شفافیت'],
  ['innovation', 'نوآوری'], ['collaboration', 'همکاری'], ['visibility', 'دیده‌شدن'],
  ['authenticity', 'اصالت'], ['other', 'سایر'],
];
const perceptionStageOptions: readonly (readonly [PerceptionStage, string])[] = [
  ['not_visible', 'دیده نمی‌شود'], ['emerging', 'در حال شکل‌گیری'], ['visible', 'قابل مشاهده'],
  ['strong', 'قوی'], ['signature', 'ویژگی شاخص'],
];
const perceptionExternalSourceOptions: readonly (readonly [PerceptionSourceKind, string])[] = [
  ['direct_feedback', 'بازخورد مستقیمِ خلاصه‌شده'], ['survey_summary', 'خلاصه نظرسنجی'],
  ['public_signal', 'Signal عمومی'], ['media_signal', 'Signal رسانه‌ای'],
  ['network_feedback', 'بازخورد شبکه حرفه‌ای'], ['other', 'منبع دیگر بدون هویت'],
];

function perceptionDimensionLabel(value: PerceptionDimension): string { return perceptionDimensionOptions.find(([key]) => key === value)?.[1] ?? value; }
function perceptionStageLabel(value: PerceptionStage): string { return perceptionStageOptions.find(([key]) => key === value)?.[1] ?? value; }
function perceptionPerspectiveLabel(value: PerceptionPerspective): string { return { self_perception: 'Self Perception', desired_positioning: 'Desired Positioning', external_perception: 'External Perception' }[value]; }
function perceptionConfidenceLabel(value: PerceptionConfidence): string { return { low: 'کم', medium: 'متوسط', high: 'بالا' }[value]; }
function perceptionGapLabel(value: PerceptionWorkspaceSnapshot['dimensions'][number]['gap']): string { return { insufficient_evidence: 'داده ناکافی', aligned_range: 'در محدوده مشترک', underrecognized: 'کمتر از جایگاه مطلوب', exceeds_target: 'بالاتر از هدف ثبت‌شده' }[value]; }
function perceptionBlindSpotLabel(value: PerceptionWorkspaceSnapshot['dimensions'][number]['blindSpot']): string { return { insufficient_evidence: 'Blind Spot: داده ناکافی', within_external_range: 'Self در Range بیرونی', self_higher_than_external: 'Blind Spot احتمالی: Self بالاتر است', self_lower_than_external: 'تفاوت احتمالی: Self پایین‌تر است' }[value]; }

function AuthenticExpressionPanel({
  error,
  onRefresh,
  onReview,
  review,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onRefresh: () => Promise<void>;
  onReview: (input: Readonly<{ content: string; assetRefs: readonly string[] }>) => Promise<void>;
  review: AuthenticExpressionReview | null;
  snapshot: AuthenticExpressionSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'reviewing' | 'error';
}>) {
  const [content, setContent] = useState('');
  const [selectedRefs, setSelectedRefs] = useState<readonly string[]>([]);

  if (!snapshot && (state === 'idle' || state === 'loading')) {
    return <section className="memory-view-state" aria-live="polite"><LoaderCircle className="spin" size={24} /><h2>در حال ساخت نمای روایت و Voice…</h2><p>Assetهای مجاز و Preferenceهای قابل بازگشت خوانده می‌شوند.</p></section>;
  }
  if (!snapshot) {
    return <section className="memory-view-state" aria-live="polite"><Sparkles size={25} /><h2>Authentic Expression در دسترس نیست</h2><p>{error ?? 'پروفایل روایت و Voice دریافت نشد.'}</p><button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button></section>;
  }

  const toggleSource = (ref: string) => {
    setSelectedRefs((current) => current.includes(ref) ? current.filter((item) => item !== ref) : [...current, ref]);
  };

  return (
    <section className="expression-center" aria-label="دروازه اصالت روایت و Voice">
      <div className="relationship-hero expression-hero">
        <div><span className="overline">Authentic Expression Gate v1</span><h2>متن شما چقدر واقعاً متعلق به شماست؟</h2><p>Seed روایی از Asset مجاز می‌آید؛ Voice از ویرایش‌های تأییدشده. عبور از این Gate مجوز انتشار یا Fact Check نیست.</p></div>
        <div className="relationship-metrics expression-metrics">
          <span><b>{snapshot.summary.narrativeSeeds}</b> Narrative Seed</span>
          <span><b>{snapshot.summary.appliedVoiceSignals}</b> Voice تأییدشده</span>
          <span><b>{expressionVoiceMaturityLabel(snapshot.summary.voiceMaturity)}</b> بلوغ Voice</span>
          <button type="button" onClick={() => void onRefresh()}><RefreshCw size={16} /> بازخوانی</button>
        </div>
      </div>

      {error ? <div className="inline-error" role="alert"><TriangleAlert size={16} />{error}</div> : null}

      <div className="expression-layout">
        <form
          className="expression-review-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onReview({ content: content.trim(), assetRefs: selectedRefs });
          }}
        >
          <header><span className="overline">Quality Gate بدون Side Effect</span><h3>متن را قبل از Approval بررسی کنید</h3></header>
          <label className="field wide"><span>متن پیشنهادی</span><textarea minLength={20} maxLength={20000} onChange={(event) => { setContent(event.target.value); }} placeholder="متنی که می‌خواهید از نظر Grounding، Specificity، Generic Language و Voice بررسی شود…" rows={10} value={content} /></label>
          <fieldset className="expression-sources">
            <legend>Assetهای مجازِ متصل</legend>
            {snapshot.narrativeSeeds.length === 0 ? (
              <p>هنوز Asset دارای Brand Usage وجود ندارد؛ Review بدون منبع به‌درستی Block می‌شود.</p>
            ) : snapshot.narrativeSeeds.map((seed) => (
              <label key={seed.narrativeId}>
                <input checked={selectedRefs.includes(seed.source.ref)} onChange={() => { toggleSource(seed.source.ref); }} type="checkbox" />
                <span><b>{seed.title}</b><small>{seed.premise}</small></span>
              </label>
            ))}
          </fieldset>
          <div className="expression-boundary"><LockKeyhole size={15} /><span>Fact Check: خیر · Publish Approval: خیر · External Action: ممنوع</span></div>
          <button className="primary-action" disabled={state === 'reviewing' || content.trim().length < 20} type="submit">
            {state === 'reviewing' ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
            اجرای Authenticity Gate
          </button>
        </form>

        <div className="expression-results">
          <section className="expression-profile">
            <header><span className="overline">Narrative Architecture · Foundation</span><h3>Seedهای قابل‌ردیابی</h3></header>
            {snapshot.narrativeSeeds.length === 0 ? <p className="muted">پس از ورود Asset مجاز، Seedهای تک‌منبعی اینجا ظاهر می‌شوند.</p> : snapshot.narrativeSeeds.map((seed) => (
              <article key={seed.narrativeId}><b>{seed.title}</b><p>{seed.premise}</p><footer><span>single_source</span><span>candidate ≠ Brand Fact</span></footer></article>
            ))}
          </section>

          <section className="expression-profile">
            <header><span className="overline">Voice Model · Evidence from Edits</span><h3>Preferenceهای قابل بازگشت</h3></header>
            {snapshot.voiceSignals.length === 0 ? <p className="muted">Voice Model هنوز داده کافی ندارد؛ سیستم از حدس‌زدن لحن خودداری می‌کند.</p> : snapshot.voiceSignals.map((signal) => (
              <article key={signal.preferenceId}><b>{voicePreferenceLabel(signal.key, signal.value)}</b><p>{signal.rationale}</p><footer><span>{signal.status === 'applied' ? 'تأییدشده' : 'فقط پیشنهاد'}</span><span>{signal.evidenceCount} ویرایش</span></footer></article>
            ))}
          </section>

          {review ? (
            <section className={`expression-review-result ${review.outcome}`}>
              <header><div><span className="overline">Review Result</span><h3>{expressionOutcomeLabel(review.outcome)}</h3></div><strong>{review.outcome.toUpperCase()}</strong></header>
              <div className="expression-findings">
                {review.findings.map((finding) => (
                  <article className={finding.level} key={finding.dimension}><span>{expressionDimensionLabel(finding.dimension)}</span><b>{finding.rationale}</b>{finding.requiredChange ? <p>{finding.requiredChange}</p> : null}</article>
                ))}
              </div>
              <footer><span>{review.selectedSources.length} منبع متصل</span><span>{review.matchedPersonalTerms.length} نشانه شخصی</span><span>{review.genericPhrases.length} کلیشه شناخته‌شده</span></footer>
            </section>
          ) : (
            <section className="expression-review-placeholder"><ShieldCheck size={28} /><h3>هنوز متنی بررسی نشده است</h3><p>نتیجه چهار Finding مستقل می‌دهد و دلیل Block یا Revise را آشکار نگه می‌دارد.</p></section>
          )}
        </div>
      </div>
    </section>
  );
}

function expressionVoiceMaturityLabel(value: AuthenticExpressionSnapshot['summary']['voiceMaturity']): string {
  return { uninitialized: 'بدون داده', learning: 'در حال یادگیری', confirmed: 'تأییدشده' }[value];
}

function expressionOutcomeLabel(value: AuthenticExpressionReview['outcome']): string {
  return { pass: 'قابل ادامه به Gateهای بعدی', revise: 'پیش از ادامه بازنویسی شود', block: 'بدون Grounding متوقف است' }[value];
}

function expressionDimensionLabel(value: AuthenticExpressionReview['findings'][number]['dimension']): string {
  return { grounding: 'Grounding', specificity: 'Personal Specificity', generic_language: 'Anti-Generic AI', voice_alignment: 'Voice Alignment' }[value];
}

function voicePreferenceLabel(key: string, value: unknown): string {
  const known: Readonly<Record<string, string>> = {
    'voice.draft_length:shorter': 'متن کوتاه‌تر',
    'voice.draft_length:longer': 'متن مبسوط‌تر',
    'voice.headline_length:shorter': 'تیتر کوتاه‌تر',
    'voice.heading_density:lower': 'میان‌تیتر کمتر',
    'voice.question_cta:omit': 'بدون پرسش پایانی',
  };
  return known[`${key}:${String(value)}`] ?? `${key}: ${String(value)}`;
}

function arbitrationOutcomeLabel(outcome: ArbitrationWorkspaceSnapshot['cases'][number]['decision']['outcome']): string {
  return {
    recommendation_ready: 'پیشنهاد آماده',
    revision_required: 'نیازمند اصلاح',
    approval_required: 'نیازمند تأیید',
    held: 'متوقف',
  }[outcome];
}

function arbitrationModuleLabel(module: ArbitrationWorkspaceSnapshot['cases'][number]['opinions'][number]['module']): string {
  return {
    strategy: 'Strategy',
    permission: 'Permission',
    claims: 'Claims',
    risk: 'Risk',
    authenticity: 'Authenticity',
  }[module];
}

function modulePositionLabel(position: ArbitrationWorkspaceSnapshot['cases'][number]['opinions'][number]['position']): string {
  return { support: 'حمایت', revise: 'اصلاح', hold: 'وتو', abstain: 'امتناع' }[position];
}

function BrandProtectionPanel({
  error,
  onRefresh,
  onReview,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onRefresh: () => Promise<void>;
  onReview: (input: Readonly<{
    actionId: string;
    expectedLevel: 'green' | 'yellow' | 'red';
    expectedAssessmentHash: string;
    decision: RiskReviewDecision;
    rationale: string;
    humanAttestation: boolean;
  }>) => Promise<void>;
  snapshot: BrandProtectionSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'mutating' | 'error';
}>) {
  if ((state === 'idle' || state === 'loading') && !snapshot) {
    return <section className="memory-view-state" aria-live="polite"><LoaderCircle className="spin" size={24} /><h2>در حال اجرای Risk Check…</h2><p>۱۵ بُعد اخلاق، حریم خصوصی و حفاظت برند بررسی می‌شوند.</p></section>;
  }
  if (!snapshot) {
    return <section className="memory-view-state" aria-live="polite"><TriangleAlert size={25} /><h2>Risk Engine در دسترس نیست</h2><p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p><button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button></section>;
  }
  return (
    <section className="risk-center" aria-label="حفاظت اخلاقی و اعتباری برند">
      <header className="draft-head">
        <div>
          <p className="overline">Ethics · Privacy · Risk · Brand Protection</p>
          <h2>ریسک قبل از Utility حق وتو دارد</h2>
          <p>Green مجاز است؛ Yellow فقط با پذیرش آگاهانه مالک ادامه می‌یابد؛ Red در این نسخه قابل Override نیست و فقط Hold یا Escalate می‌شود.</p>
        </div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button"><RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> ارزیابی دوباره</button>
      </header>
      <div className="risk-summary">
        <div><span>کل اقدام‌ها</span><strong>{snapshot.summary.totalActions}</strong></div>
        <div className="green"><span>Green</span><strong>{snapshot.summary.green}</strong></div>
        <div className="yellow"><span>Yellow</span><strong>{snapshot.summary.yellow}</strong></div>
        <div className="red"><span>Red</span><strong>{snapshot.summary.red}</strong></div>
        <div><span>نیازمند Review</span><strong>{snapshot.summary.reviewRequired}</strong></div>
      </div>
      <div className="risk-claim-posture">
        <ShieldCheck size={20} />
        <span><b>Claim Gate مستقل:</b> {snapshot.claimPosture.publicReady} آماده عمومی از {snapshot.claimPosture.totalClaims} Claim · {snapshot.claimPosture.traceBlocked} Trace مسدود</span>
        <small>{snapshot.claimPosture.note}</small>
      </div>
      <div className="risk-assessments">
        {snapshot.assessments.map((assessment) => (
          <RiskAssessmentCard assessment={assessment} disabled={state === 'mutating'} key={assessment.actionId} onReview={onReview} />
        ))}
      </div>
      <p className="risk-crisis-note"><TriangleAlert size={17} /> Negative Signal Detection و مانیتورینگ بحران هنوز خودکار نیست؛ Signal حساس باید Hold و برای Human/Legal Review Escalate شود.</p>
      {error ? <div className="strategy-error" role="alert"><TriangleAlert size={15} /> {error}</div> : null}
    </section>
  );
}

function RiskAssessmentCard({
  assessment,
  disabled,
  onReview,
}: Readonly<{
  assessment: BrandProtectionSnapshot['assessments'][number];
  disabled: boolean;
  onReview: (input: Readonly<{
    actionId: string;
    expectedLevel: 'green' | 'yellow' | 'red';
    expectedAssessmentHash: string;
    decision: RiskReviewDecision;
    rationale: string;
    humanAttestation: boolean;
  }>) => Promise<void>;
}>) {
  const [decision, setDecision] = useState<RiskReviewDecision>(assessment.reviewableDecisions[0] ?? 'hold');
  const [rationale, setRationale] = useState('');
  const [attested, setAttested] = useState(false);
  const activeDecision = assessment.reviewableDecisions.includes(decision)
    ? decision
    : (assessment.reviewableDecisions[0] ?? 'hold');
  const material = assessment.findings.filter((finding) => finding.level !== 'green');
  return (
    <article className={`risk-assessment risk-${assessment.level}`}>
      <header><span><b>{assessment.actionTitle}</b><small>{kindLabels[assessment.actionKind]} · {riskGateLabel(assessment.gate)}</small></span><strong>{assessment.level.toUpperCase()}</strong></header>
      <p>{assessment.rationale}</p>
      <div className="risk-findings">
        {material.length === 0 ? <span className="risk-finding green"><ShieldCheck size={15} /> تمام ۱۵ بُعد بدون Signal مادی</span> : material.map((finding) => (
          <div className={`risk-finding ${finding.level}`} key={finding.dimension}>
            <b>{riskDimensionLabel(finding.dimension)}</b>
            <span>{finding.rationale}</span>
            <small>کنترل: {finding.mitigation}</small>
          </div>
        ))}
      </div>
      <details className="risk-all-checks"><summary>نمایش همه ۱۵ Risk Check</summary><div>{assessment.findings.map((finding) => <span className={finding.level} key={finding.dimension}>{riskDimensionLabel(finding.dimension)} · {finding.level}</span>)}</div></details>
      {assessment.lastReview ? <p className="claim-last-review">آخرین تصمیم: {riskDecisionLabel(assessment.lastReview.decision)} · {formatDate(assessment.lastReview.reviewedAt)} — {assessment.lastReview.rationale}</p> : null}
      {assessment.reviewableDecisions.length > 0 ? (
        <form className="risk-review-form" onSubmit={(event) => {
          event.preventDefault();
          void onReview({
            actionId: assessment.actionId,
            expectedLevel: assessment.level,
            expectedAssessmentHash: assessment.assessmentHash,
            decision: activeDecision,
            rationale,
            humanAttestation: attested,
          });
        }}>
          <label>تصمیم انسانی<select onChange={(event) => { setDecision(event.target.value as RiskReviewDecision); setAttested(false); }} value={activeDecision}>{assessment.reviewableDecisions.map((item) => <option key={item} value={item}>{riskDecisionLabel(item)}</option>)}</select></label>
          <label>Rationale قابل Audit<textarea maxLength={2000} minLength={20} onChange={(event) => { setRationale(event.target.value); }} required rows={2} value={rationale} /></label>
          <label className="claim-attestation"><input checked={attested} onChange={(event) => { setAttested(event.target.checked); }} required type="checkbox" /> همه Findingها، Context، حریم اشخاص ثالث و پیامد بلندمدت را شخصاً مرور کرده‌ام.</label>
          <button disabled={disabled} type="submit">{disabled ? <LoaderCircle className="spin" size={16} /> : <FileCheck2 size={16} />} ثبت تصمیم</button>
        </form>
      ) : null}
    </article>
  );
}

function riskGateLabel(gate: BrandProtectionSnapshot['assessments'][number]['gate']): string {
  return { allowed: 'مجاز', review_required: 'نیازمند پذیرش مالک', allowed_with_acknowledgement: 'پذیرفته‌شده با آگاهی', blocked: 'مسدود' }[gate];
}

function riskDecisionLabel(decision: RiskReviewDecision): string {
  return { acknowledge: 'پذیرش آگاهانه', hold: 'توقف', escalate: 'ارجاع برای بررسی بیشتر' }[decision];
}

function riskDimensionLabel(dimension: BrandProtectionSnapshot['assessments'][number]['findings'][number]['dimension']): string {
  return {
    consent: 'رضایت', privacy: 'حریم خصوصی', data_access: 'دسترسی داده', sensitive_data: 'داده حساس',
    third_party_privacy: 'حریم شخص ثالث', reputation_risk: 'ریسک اعتبار', misinterpretation: 'برداشت نادرست',
    manipulation: 'دستکاری', defamation: 'افترا', conflict_of_interest: 'تعارض منافع', disclosure: 'افشای رابطه',
    authenticity: 'اصالت', security: 'امنیت', public_exposure: 'مواجهه عمومی', long_term_consequences: 'پیامد بلندمدت',
  }[dimension];
}

function DataRightsPanel({
  error,
  onExport,
  onRefresh,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onExport: () => Promise<void>;
  onRefresh: () => Promise<void>;
  snapshot: AuditTrailSnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'exporting' | 'error';
}>) {
  if ((state === 'idle' || state === 'loading') && !snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <LoaderCircle className="spin" size={24} />
        <h2>در حال بازیابی ردپای خصوصی شما…</h2>
        <p>فقط رویدادهای همین مالک و همین فضای داده خوانده می‌شوند.</p>
      </section>
    );
  }
  if (!snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <TriangleAlert size={25} />
        <h2>مرکز شفافیت در دسترس نیست</h2>
        <p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p>
        <button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button>
      </section>
    );
  }
  return (
    <section className="data-rights-view" aria-label="داده‌ها و ردپای حساب">
      <header className="draft-head">
        <div>
          <p className="overline">Ownership · Portability · Audit</p>
          <h2>مرکز داده و شفافیت</h2>
          <p>می‌بینید چه تصمیم‌هایی ثبت شده‌اند و یک نسخه قابل‌حمل از داده‌های فعلی خودتان می‌گیرید. متن حافظه حذف‌شده دوباره در Export ظاهر نمی‌شود.</p>
        </div>
        <div className="data-rights-actions">
          <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button">
            <RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> به‌روزرسانی
          </button>
          <button className="export-data" disabled={state === 'exporting'} onClick={() => void onExport()} type="button">
            {state === 'exporting' ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
            {state === 'exporting' ? 'در حال ساخت خروجی…' : 'دریافت داده‌های من'}
          </button>
        </div>
      </header>
      <div className="audit-summary">
        <div><span>کل رویدادها</span><strong>{snapshot.summary.total}</strong></div>
        <div><span>تأییدهای انسانی</span><strong>{snapshot.summary.approvals}</strong></div>
        <div><span>حقوق حافظه</span><strong>{snapshot.summary.dataRights}</strong></div>
        <div><span>خروجی‌ها</span><strong>{snapshot.summary.exports}</strong></div>
      </div>
      <div className="audit-layout">
        <div className="audit-timeline">
          <h3>ردپای قابل‌توضیح</h3>
          {snapshot.events.length === 0 ? (
            <div className="learning-empty"><History size={25} /><p>هنوز اقدام قابل ثبت در این نشست انجام نشده است.</p></div>
          ) : (
            <ol>
              {snapshot.events.map((event) => (
                <li key={event.id}>
                  <i aria-hidden="true" />
                  <div>
                    <strong>{auditEventLabel(event.eventType)}</strong>
                    <span>{auditResourceLabel(event.resourceType)}{event.decision ? ` · ${auditDecisionLabel(event.decision)}` : ''}</span>
                    <time>{formatTimestamp(event.occurredAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <aside className="data-rights-note">
          <ShieldCheck size={25} />
          <h3>مرزهای این خروجی</h3>
          <p>فقط Snapshot فعلی مالک، Evidence مجاز، Research، Claim Review، Strategy، Draft، Preference و Audit نمایش‌داده‌شده صادر می‌شوند.</p>
          <ul>
            <li>هیچ انتشار یا ارسال خارجی انجام نمی‌شود.</li>
            <li>Secret و اطلاعات زیرساخت داخل فایل نیست.</li>
            <li>محتوای حذف‌شده با مقدار خالی و وضعیت حذف باقی می‌ماند.</li>
          </ul>
          <small>{persistenceLabel(snapshot.persistence === 'ephemeral' ? 'ephemeral' : snapshot.persistence)}</small>
        </aside>
      </div>
      {error ? <div className="strategy-error" role="alert"><TriangleAlert size={15} /> {error}</div> : null}
    </section>
  );
}

function auditEventLabel(eventType: string): string {
  const labels: Readonly<Record<string, string>> = {
    'account.data_exported': 'خروجی داده‌های شخصی دریافت شد',
    'workbench.action_approved': 'اقدام پیشنهادی تأیید شد',
    'strategy.context_saved': 'هدف و جایگاه مطلوب تغییر کرد',
    'memory.proposal_created': 'پیشنهاد حافظه ساخته شد',
    'research.source_recorded': 'منبع تحقیق بیرونی ثبت شد',
    'claim.reviewed': 'ادعا با Trace بازبینی شد',
    'memory.proposal_confirmed': 'حافظه با رضایت تأیید شد',
    'memory.correct': 'حافظه اصلاح شد',
    'memory.contest': 'به حافظه اعتراض شد',
    'memory.revoke': 'مجوز حافظه لغو شد',
    'memory.delete': 'حافظه حذف شد',
    'asset.revoke_brand_usage': 'مجوز تحلیل برند منبع لغو شد',
    'asset.delete': 'منبع متنی حذف شد',
    'draft.created': 'پیش‌نویس Evidence-bound ساخته شد',
    'draft.edited': 'پیش‌نویس ویرایش شد',
    'draft.approved': 'نسخه پیش‌نویس تأیید شد',
    'draft.exported': 'پیش‌نویس خروجی گرفته شد',
    'feedback.draft_rejected': 'پیش‌نویس رد شد',
    'feedback.preference_applied': 'ترجیح پیشنهادی اعمال شد',
    'feedback.preference_rejected': 'ترجیح پیشنهادی رد شد',
    'feedback.preference_revoked': 'اثر ترجیح لغو شد',
  };
  return labels[eventType] ?? eventType;
}

function auditResourceLabel(resourceType: string): string {
  const labels: Readonly<Record<string, string>> = {
    account: 'حساب شخصی',
    assertion: 'حافظه',
    asset: 'منبع متنی',
    draft: 'پیش‌نویس',
    memory_proposal: 'حافظه',
    preference_proposal: 'مدل ترجیح',
    strategy_context: 'استراتژی',
    workbench: 'تصمیم امروز',
  };
  return labels[resourceType] ?? resourceType;
}

function auditDecisionLabel(decision: string): string {
  const labels: Readonly<Record<string, string>> = {
    approved: 'تأییدشده', confirmed: 'ثبت‌شده', delete: 'حذف‌شده',
    exported: 'خروجی', rejected: 'ردشده', revoke: 'لغوشده', saved: 'ذخیره‌شده',
    green: 'سبز', red: 'متوقف', yellow: 'نیازمند بررسی',
  };
  return labels[decision] ?? decision;
}

function preferenceLabel(key: string, value: unknown): string {
  return feedbackSignalLabel(key, value);
}

function feedbackSignalLabel(key: string | undefined, value: unknown): string {
  const token = `${key ?? ''}:${typeof value === 'string' ? value : ''}`;
  const labels: Readonly<Record<string, string>> = {
    'voice.draft_length:shorter': 'متن‌های کوتاه‌تر',
    'voice.draft_length:longer': 'متن‌های مبسوط‌تر',
    'voice.headline_length:shorter': 'تیترهای کوتاه‌تر',
    'voice.heading_density:lower': 'میان‌تیترهای کمتر',
    'voice.question_cta:omit': 'بدون پرسش پایانی',
  };
  return labels[token] ?? (key ? 'ویرایش سبکی ثبت‌شده' : 'ویرایش بدون الگوی قطعی');
}

function preferenceStatusLabel(status: FeedbackLearningSnapshot['preferences'][number]['status']): string {
  const labels = { proposed: 'منتظر تصمیم', applied: 'اعمال‌شده', rejected: 'رد‌شده', revoked: 'لغوشده' } as const;
  return labels[status];
}

const draftChannelOptions: readonly Readonly<{ value: DraftChannel; label: string }>[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'blog', label: 'Blog' },
];

function draftChannelLabel(value: DraftChannel): string {
  return draftChannelOptions.find((item) => item.value === value)?.label ?? value;
}

function guardLabel(value: DraftWorkspaceSnapshot['guard']['classification']): string {
  if (value === 'green') return 'Green · قابل تأیید';
  if (value === 'yellow') return 'Yellow · نیازمند توجه';
  return 'Red · متوقف';
}

function guardViolationLabel(code: string): string {
  const labels: Readonly<Record<string, string>> = {
    claim_extraction_incomplete: 'یک ادعای احتمالی خارج از Claim Registry دیده شد.',
    missing_evidence_bound_claim: 'متن دیگر Claim متصل به Evidence را در خود ندارد.',
    channel_format_violation: 'طول یا قالب متن با پلتفرم مقصد سازگار نیست.',
    missing_claim: 'Claim متن در Registry ثبت نشده است.',
    unverified_fact: 'یک واقعیت هنوز تأیید نشده است.',
    disputed_claim: 'Claim مورد اعتراض است و قابل استفاده نیست.',
    purpose_not_allowed: 'مجوز این Claim برای Public Drafting وجود ندارد.',
    channel_not_allowed: 'مجوز Claim برای این کانال وجود ندارد.',
  };
  return labels[code] ?? 'Claim Check این بخش را نیازمند بررسی می‌داند.';
}

function downloadText(filename: string, mimeType: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function lineItems(value: string): readonly string[] {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function AssetIntakePanel({
  error,
  onImport,
  onRight,
  onRefresh,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onImport: (input: Readonly<{
    title: string;
    content: string;
    assertionText: string;
    occurredAt: string;
    brandUsage: boolean;
  }>) => Promise<void>;
  onRight: (assetId: string, operation: TextAssetRightOperation) => Promise<void>;
  onRefresh: () => Promise<void>;
  snapshot: OnboardingSnapshot | null;
  state: 'loading' | 'ready' | 'mutating' | 'error';
}>) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [assertionText, setAssertionText] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [personalConsent, setPersonalConsent] = useState(false);
  const [brandUsage, setBrandUsage] = useState(false);
  const [saved, setSaved] = useState(false);
  const valid = title.trim().length >= 3 && content.trim().length >= 20 &&
    assertionText.trim().length >= 10 && Boolean(occurredOn) && personalConsent;

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid || state === 'mutating') return;
    setSaved(false);
    try {
      await onImport({
        title: title.trim(),
        content: content.trim(),
        assertionText: assertionText.trim(),
        occurredAt: new Date(`${occurredOn}T00:00:00.000Z`).toISOString(),
        brandUsage,
      });
      setTitle('');
      setContent('');
      setAssertionText('');
      setPersonalConsent(false);
      setBrandUsage(false);
      setSaved(true);
    } catch {
      // The parent exposes the safe API error without leaking submitted content.
    }
  };

  if (state === 'loading' && !snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <LoaderCircle className="spin" size={24} />
        <h2>در حال بازیابی منابع شما…</h2>
        <p>فقط منابع محرمانه همین مالک خوانده می‌شوند.</p>
      </section>
    );
  }
  if (!snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <TriangleAlert size={25} />
        <h2>شروع اولیه در دسترس نیست</h2>
        <p>{error ?? 'برای دریافت دوباره تلاش کنید.'}</p>
        <button onClick={() => void onRefresh()} type="button"><RefreshCw size={16} /> تلاش دوباره</button>
      </section>
    );
  }

  return (
    <section className="asset-intake" aria-label="شروع اولیه و ورود منبع">
      <header className="memory-view-head">
        <div>
          <p className="overline">Cold Start شفاف</p>
          <h2>یک متن واقعی را به شاهد قابل‌ردیابی تبدیل کنید</h2>
          <p>سیستم متن را تفسیر پنهانی نمی‌کند؛ برداشت اولیه را خودتان می‌نویسید و دامنه استفاده را جداگانه تعیین می‌کنید.</p>
        </div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button">
          <RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> به‌روزرسانی
        </button>
      </header>

      <div className="maturity-board">
        <div className="maturity-ring" style={{ '--maturity': `${String(snapshot.modelMaturity.percent)}%` } as CSSProperties}>
          <strong>{snapshot.modelMaturity.percent}٪</strong><span>بلوغ فعلی</span>
        </div>
        <div>
          <h3>{snapshot.modelMaturity.nextStep}</h3>
          <p>{snapshot.modelMaturity.evidenceCount} شاهد واقعی از {snapshot.modelMaturity.sourceTypes.length} نوع منبع در محاسبه فعلی حضور دارد.</p>
          <div className={snapshot.strategyReadiness.ready ? 'strategy-ready' : 'strategy-not-ready'}>
            <ShieldCheck size={14} />
            {snapshot.strategyReadiness.ready
              ? `${String(snapshot.strategyReadiness.evidenceCount)} شاهد برای تحلیل برند مجاز است.`
              : snapshot.strategyReadiness.withheldEvidenceCount > 0
                ? `${String(snapshot.strategyReadiness.withheldEvidenceCount)} شاهد موجود است، اما مجوز تحلیل برند ندارد.`
                : 'هنوز شاهد مجازی برای تحلیل برند وجود ندارد.'}
          </div>
          <ul>
            <li>شواهد واردشده: {snapshot.modelMaturity.components.importedEvidence} امتیاز</li>
            <li>Self-report تأییدشده: {snapshot.modelMaturity.components.confirmedSelfReports} امتیاز</li>
            <li>تنوع منبع: {snapshot.modelMaturity.components.sourceDiversity} امتیاز</li>
            <li>اعمال حق کنترل داده: {snapshot.modelMaturity.components.exercisedDataControl} امتیاز</li>
          </ul>
        </div>
      </div>

      <form className="asset-form" onSubmit={(event) => void submit(event)}>
        <div className="asset-form-head">
          <div><BookOpenText size={20} /><span>ورود متن محدود</span></div>
          <small>حداکثر ۲۰٬۰۰۰ نویسه · محرمانه</small>
        </div>
        <label>عنوان منبع
          <input maxLength={160} onChange={(event) => { setTitle(event.target.value); }} placeholder="مثلاً: یادداشت جلسه تصمیم‌گیری" value={title} />
        </label>
        <label>تاریخ رخداد یا نگارش
          <input max={new Date().toISOString().slice(0, 10)} onChange={(event) => { setOccurredOn(event.target.value); }} type="date" value={occurredOn} />
        </label>
        <label className="asset-wide">متن منبع
          <textarea maxLength={20000} onChange={(event) => { setContent(event.target.value); }} placeholder="بخش واقعی و مرتبط متن را اینجا وارد کنید…" rows={6} value={content} />
        </label>
        <label className="asset-wide">برداشت پیشنهادی شما
          <textarea maxLength={1000} onChange={(event) => { setAssertionText(event.target.value); }} placeholder="این متن درباره شیوه تصمیم‌گیری، ارزش‌ها یا تجربه من چه چیزی نشان می‌دهد؟" rows={3} value={assertionText} />
        </label>
        <div className="asset-consents asset-wide">
          <label>
            <input checked={personalConsent} onChange={(event) => { setPersonalConsent(event.target.checked); }} type="checkbox" />
            اجازه می‌دهم این متن فقط برای فهم شخصی ذخیره، پردازش و به Assertion متصل شود.
          </label>
          <label>
            <input checked={brandUsage} onChange={(event) => { setBrandUsage(event.target.checked); }} type="checkbox" />
            استفاده داخلی در تحلیل برند نیز مجاز باشد؛ این گزینه مجوز انتشار عمومی نیست.
          </label>
        </div>
        <button className="asset-submit asset-wide" disabled={!valid || state === 'mutating'} type="submit">
          {state === 'mutating' ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
          {state === 'mutating' ? 'در حال ثبت اتمیک…' : 'ثبت منبع، Evidence و Assertion'}
        </button>
        {saved ? <p className="asset-success asset-wide"><Check size={16} /> منبع با منشأ و مجوز قابل‌ردیابی ثبت شد.</p> : null}
        {error ? <p className="asset-error asset-wide"><TriangleAlert size={16} /> {error}</p> : null}
      </form>

      <div className="asset-list">
        <h3>منابع ثبت‌شده</h3>
        {snapshot.assets.records.length === 0 ? (
          <div className="memory-empty"><BookOpenText size={27} /><h3>هنوز منبعی وارد نشده است</h3><p>اولین متن، مسیر MVP را از داده نمونه به شاهد واقعی شما منتقل می‌کند.</p></div>
        ) : snapshot.assets.records.map((record) => (
          <article key={record.assetId}>
            <header><strong>{record.title}</strong><span>{formatDate(record.importedAt)}</span></header>
            <p>{record.content.length > 240 ? `${record.content.slice(0, 240)}…` : record.content}</p>
            <blockquote>{record.assertionText}</blockquote>
            <footer>
              <span><Fingerprint size={14} /> SHA-256: {record.integritySha256.slice(0, 12)}…</span>
              <span><BookOpenText size={14} /> Evidence متصل</span>
              <span><LockKeyhole size={14} /> Public خاموش</span>
            </footer>
            <div className="asset-rights">
              {record.permissions.brandUsage ? (
                <button
                  disabled={state === 'mutating'}
                  onClick={() => void onRight(record.assetId, 'revoke_brand_usage')}
                  type="button"
                >
                  <RotateCcw size={14} /> لغو استفاده در تحلیل برند
                </button>
              ) : <small>استفاده در تحلیل برند غیرفعال است.</small>}
              <button
                className="danger"
                disabled={state === 'mutating'}
                onClick={() => {
                  if (window.confirm('این منبع، Evidence و Assertion متصل از نمای فعال حذف شوند؟')) {
                    void onRight(record.assetId, 'delete');
                  }
                }}
                type="button"
              >
                <Trash2 size={14} /> حذف منبع
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PersonalMemoryPanel({
  error,
  onRefresh,
  snapshot,
  state,
}: Readonly<{
  error: string | null;
  onRefresh: () => Promise<void>;
  snapshot: PersonalMemorySnapshot | null;
  state: 'idle' | 'loading' | 'ready' | 'error';
}>) {
  if (state === 'loading' && !snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <LoaderCircle className="spin" size={24} />
        <h2>در حال بازیابی مدل شخصی…</h2>
        <p>فقط داده‌های مجاز همین مالک خوانده می‌شوند.</p>
      </section>
    );
  }
  if ((state === 'error' || state === 'idle') && !snapshot) {
    return (
      <section className="memory-view-state" aria-live="polite">
        <TriangleAlert size={25} />
        <h2>حافظه شخصی در دسترس نیست</h2>
        <p>{error ?? 'برای دریافت حافظه دوباره تلاش کنید.'}</p>
        <button onClick={() => void onRefresh()} type="button">
          <RefreshCw size={16} /> تلاش دوباره
        </button>
      </section>
    );
  }
  if (!snapshot) return null;

  return (
    <section className="memory-view" aria-label="حافظه شخصی">
      <header className="memory-view-head">
        <div>
          <p className="overline">مدل شخصی قابل‌اصلاح</p>
          <h2>آنچه سیستم درباره شما نگه می‌دارد</h2>
          <p>هر مورد با منشأ، سطح اطمینان، مجوز و وضعیت چرخه عمر نمایش داده می‌شود.</p>
        </div>
        <button disabled={state === 'loading'} onClick={() => void onRefresh()} type="button">
          <RefreshCw className={state === 'loading' ? 'spin' : undefined} size={16} /> به‌روزرسانی
        </button>
      </header>

      <div className="memory-summary">
        <div><span>کل حافظه‌ها</span><strong>{snapshot.summary.total}</strong></div>
        <div><span>فعال و مجاز</span><strong>{snapshot.summary.active}</strong></div>
        <div><span>نیازمند توجه</span><strong>{snapshot.summary.attentionRequired}</strong></div>
        <div><span>حذف‌شده</span><strong>{snapshot.summary.deleted}</strong></div>
      </div>

      {snapshot.records.length === 0 ? (
        <div className="memory-empty">
          <Fingerprint size={28} />
          <h3>هنوز حافظه‌ای تأیید نشده است</h3>
          <p>در گفت‌وگوی امروز، Opt-in پیشنهاد حافظه را روشن و سپس ثبت را جداگانه تأیید کنید.</p>
        </div>
      ) : (
        <div className="memory-list">
          {snapshot.records.map((record) => (
            <article className={`memory-card ${record.lifecycle.status}`} key={record.proposalId}>
              <div className="memory-card-main">
                <div className="memory-card-topline">
                  <span className="memory-status">{memoryStatusLabel(record.lifecycle.status)}</span>
                  <span>Self-report · محرمانه</span>
                  <span>{formatDate(record.lifecycle.updatedAt)}</span>
                </div>
                <h3>{record.text ?? 'محتوای این حافظه حذف و از پاسخ API خارج شده است.'}</h3>
                <p>{record.confidenceRationale}</p>
                {record.lifecycle.contestReason ? (
                  <blockquote>دلیل اعتراض: {record.lifecycle.contestReason}</blockquote>
                ) : null}
                {record.lifecycle.deletionReason ? (
                  <blockquote>دلیل حذف: {record.lifecycle.deletionReason}</blockquote>
                ) : null}
              </div>
              <div className="memory-card-meta">
                <span><b>{Math.round(record.confidence * 100)}٪</b> اطمینان</span>
                <span><BookOpenText size={14} /> {record.provenance.evidenceCount} شاهد</span>
                <span><History size={14} /> {record.lifecycle.revisionCount} نسخه</span>
                <span><Fingerprint size={14} /> {record.provenance.sourceTypes.map(sourceTypeLabel).join('، ') || 'حذف‌شده'}</span>
                <span className={record.consent.personalUnderstanding ? 'consent-on' : 'consent-off'}>
                  <LockKeyhole size={14} />
                  {record.consent.personalUnderstanding ? 'شناخت داخلی مجاز' : 'مجوز استفاده لغو شده'}
                </span>
                <span className={record.consent.brandUsage || record.consent.publicUsage ? 'consent-on' : 'consent-off'}>
                  Brand: {record.consent.brandUsage ? 'روشن' : 'خاموش'} · Public: {record.consent.publicUsage ? 'روشن' : 'خاموش'}
                </span>
              </div>
              {record.lifecycle.status !== 'deleted' ? (
                <MemoryRecordControls record={record} onApplied={onRefresh} />
              ) : null}
            </article>
          ))}
        </div>
      )}
      <small className="memory-footnote">
        نسخه خصوصی Sites موقت است؛ در محیط واقعی این Snapshot از PostgreSQL و RLS خوانده می‌شود.
      </small>
    </section>
  );
}

function MemoryRecordControls({
  onApplied,
  record,
}: Readonly<{
  onApplied: () => Promise<void>;
  record: PersonalMemoryRecord;
}>) {
  const [kind, setKind] = useState<MemoryRightKind>('contest');
  const [reason, setReason] = useState('');
  const [correctedText, setCorrectedText] = useState(record.text ?? '');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'submitting'>('idle');
  const [result, setResult] = useState<AppliedMemoryRight | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    const trimmedReason = reason.trim();
    const trimmedCorrection = correctedText.trim();
    if (
      state !== 'idle' ||
      trimmedReason.length < 3 ||
      (kind === 'correct' && trimmedCorrection.length < 3)
    ) return;
    const stableRequestId = requestId ?? `right_${crypto.randomUUID()}`;
    setRequestId(stableRequestId);
    setState('submitting');
    setError(null);
    try {
      const applied = await applyMemoryRight(record.proposalId, {
        requestId: stableRequestId,
        operation: kind,
        reason: trimmedReason,
        ...(kind === 'correct' ? { correctedText: trimmedCorrection } : {}),
      });
      setResult(applied);
      setRequestId(null);
      setState('idle');
      await onApplied();
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setState('idle');
    }
  };

  const resetRequest = () => {
    setRequestId(null);
    setResult(null);
  };

  return (
    <details className="memory-card-controls">
      <summary>اصلاح یا محدودکردن این حافظه</summary>
      <div className="memory-control-grid">
        <label>
          اقدام
          <select
            onChange={(event) => {
              setKind(event.target.value as MemoryRightKind);
              resetRequest();
            }}
            value={kind}
          >
            <option value="contest">اعتراض و توقف استفاده</option>
            <option value="correct">اصلاح با حفظ تاریخچه</option>
            <option value="revoke">لغو مجوز استفاده</option>
            <option value="delete">حذف حافظه و مشتقات</option>
          </select>
        </label>
        {kind === 'correct' ? (
          <label className="memory-control-wide">
            متن اصلاح‌شده
            <textarea
              maxLength={5000}
              onChange={(event) => {
                setCorrectedText(event.target.value);
                resetRequest();
              }}
              rows={2}
              value={correctedText}
            />
          </label>
        ) : null}
        <label>
          دلیل
          <input
            maxLength={500}
            onChange={(event) => {
              setReason(event.target.value);
              resetRequest();
            }}
            placeholder="برای Audit خصوصی"
            value={reason}
          />
        </label>
      </div>
      <button
        className={kind === 'delete' ? 'danger' : undefined}
        disabled={state === 'submitting'}
        onClick={() => void apply()}
        type="button"
      >
        {state === 'submitting' ? 'در حال اعمال…' : memoryRightActionLabel(kind)}
      </button>
      {result ? <span className="memory-control-success">{memoryRightResultLabel(result)}</span> : null}
      {error ? <span className="memory-control-error">{error}</span> : null}
    </details>
  );
}

function memoryStatusLabel(status: PersonalMemoryRecord['lifecycle']['status']): string {
  if (status === 'active') return 'فعال';
  if (status === 'contested') return 'مورد اعتراض';
  if (status === 'consent_revoked') return 'مجوز لغوشده';
  return 'حذف‌شده';
}

function conversationIntentLabel(
  intent: ConversationTurnResult['orchestration']['intent']['kind'],
): string {
  const labels: Readonly<Record<typeof intent, string>> = {
    reflect: 'بازتاب شخصی',
    remember: 'پیشنهاد حافظه',
    correct_memory: 'اصلاح حافظه',
    set_strategy: 'زمینه استراتژی',
    assess_action: 'ارزیابی اقدام',
    research_external: 'تحقیق بیرونی',
    draft_content: 'پیش‌نویس محتوا',
    data_control: 'کنترل داده',
    unclear: 'نیازمند روشن‌سازی',
  };
  return labels[intent];
}

function conversationModuleLabel(
  module: ConversationTurnResult['orchestration']['route']['module'],
): string {
  const labels: Readonly<Record<typeof module, string>> = {
    conversation: 'گفت‌وگو',
    memory: 'حافظه',
    strategy: 'استراتژی',
    research: 'تحقیق',
    draft: 'پیش‌نویس',
    risk: 'حفاظت برند',
    data: 'داده و حقوق',
  };
  return labels[module];
}

function sourceTypeLabel(source: string): string {
  if (source === 'conversation_turn') return 'گفت‌وگو';
  if (source === 'user_correction') return 'اصلاح مستقیم';
  return source;
}

function formatMinutes(minutes: number): string {
  if (minutes === 0) return '۰ دقیقه';
  if (minutes % 60 === 0) return `${String(minutes / 60)} ساعت`;
  if (minutes > 60) return `${String(Math.floor(minutes / 60))} ساعت و ${String(minutes % 60)} دقیقه`;
  return `${String(minutes)} دقیقه`;
}

function decisionPostureLabel(value: WorkbenchAction['decision']['posture']): string {
  return { now: 'در پنجره فعلی', when_ready: 'پس از رفع محدودیت', delay: 'تعویق آگاهانه' }[value];
}

function decisionFormatLabel(value: WorkbenchAction['decision']['format']): string {
  return {
    none: 'عدم اقدام',
    private_conversation: 'گفت‌وگوی خصوصی',
    relationship_action: 'اقدام رابطه‌ای',
    mother_concept: 'Mother Concept؛ بدون انتخاب Platform',
    media_response: 'پاسخ رسانه‌ای',
    event_participation: 'مشارکت در رویداد',
    research_brief: 'Research Brief',
  }[value];
}

function feasibilityReasonLabel(value: WorkbenchAction['feasibilityReasons'][number]): string {
  return {
    within_budget: 'در بودجه فعلی',
    attention_time_exceeded: 'زمان کافی نیست',
    energy_exceeded: 'انرژی کافی نیست',
    visibility_tolerance_exceeded: 'تحمل دیده‌شدن کافی نیست',
    emotional_bandwidth_exceeded: 'ظرفیت احساسی کافی نیست',
  }[value];
}

function persistenceLabel(persistence: WorkbenchSnapshot['runtime']['persistence']): string {
  if (persistence === 'postgres') return 'ذخیره پایدار';
  if (persistence === 'ephemeral') return 'نسخه نمایشی';
  return 'حافظه موقت';
}

function formatConfidence(confidence: number | undefined): string {
  return confidence === undefined ? '—' : `${String(Math.round(confidence * 100))}٪`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'امروز';
  return new Intl.DateTimeFormat('fa-IR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'زمان نامشخص';
  return new Intl.DateTimeFormat('fa-IR', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function approvalLabel(
  state: 'loading' | 'ready' | 'approving' | 'error',
  action: WorkbenchAction | undefined,
  selectedIsApproved: boolean,
  workflowStatus: WorkbenchSnapshot['workflow']['status'],
) {
  if (action?.interaction === 'open_intake') return 'رفتن به شروع و منابع';
  if (action?.interaction === 'open_conversation') return 'شروع گفت‌وگوی Evidence-first';
  if (state === 'approving') return <><LoaderCircle className="spin" size={18} /> در حال ثبت تأیید…</>;
  if (selectedIsApproved) return <><Check size={18} /> برای اجرا تأیید شد</>;
  if (workflowStatus === 'approved') return 'اقدام دیگری قبلاً تأیید شده';
  return 'انتخاب و آماده‌سازی اقدام';
}

function draftSourceKey(kind: DraftSourceKind, ref: string): string {
  return `${kind}:${ref}`;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof WorkbenchApiError)) return 'خطای پیش‌بینی‌نشده رخ داد.';
  const messages: Readonly<Record<string, string>> = {
    network_unavailable: 'سرویس تصمیم در دسترس نیست. اتصال API را بررسی کنید.',
    authentication_required: 'برای ثبت تأیید باید دوباره وارد شوید.',
    different_action_approved: 'یک اقدام دیگر قبلاً تأیید شده و قابل جایگزینی خودکار نیست.',
    action_not_approvable: 'این گزینه یک مسیر جمع‌آوری شاهد است و به‌عنوان اقدام بیرونی تأیید نمی‌شود.',
    insufficient_evidence: 'برای تأیید این اقدام هنوز شاهد مجاز کافی وجود ندارد.',
    action_not_found: 'این اقدام دیگر در Snapshot فعلی وجود ندارد.',
    invalid_conversation_input: 'متن یا شناسه گفت‌وگو معتبر نیست.',
    memory_permission_denied: 'مجوز لازم برای ثبت این حافظه داده نشده است.',
    memory_proposal_conflict: 'این پیشنهاد حافظه قبلاً با وضعیت دیگری ثبت شده است.',
    memory_proposal_not_found: 'پیشنهاد حافظه دیگر در دسترس نیست.',
    invalid_memory_right: 'نوع درخواست، دلیل یا متن اصلاح حافظه معتبر نیست.',
    invalid_strategy_context: 'هدف یا جایگاه مطلوب ناقص است؛ فیلدها و موارد هر خط را بررسی کنید.',
    revision_changed: 'این استراتژی در جای دیگری تغییر کرده است؛ نسخه تازه را دریافت و دوباره ویرایش کنید.',
    idempotency_mismatch: 'شناسه این ذخیره قبلاً برای محتوای دیگری استفاده شده است.',
    status_changed: 'وضعیت Claim هم‌زمان تغییر کرده است؛ فهرست را به‌روزرسانی کنید.',
    strategy_permission_denied: 'فقط مالک می‌تواند هدف و جایگاه مطلوب را تغییر دهد.',
    strategy_unavailable: 'سرویس استراتژی در دسترس نیست.',
    research_unavailable: 'Research Workspace در دسترس نیست.',
    invalid_research_input: 'مشخصات منبع، URL امن، تاریخ یا پنجره تازگی معتبر نیست.',
    research_import_conflict: 'این درخواست یا رابطه منبع و Claim قبلاً با محتوای دیگری ثبت شده است.',
    research_permission_denied: 'فقط مالک می‌تواند منابع تحقیق بیرونی را مدیریت کند.',
    research_failed: 'ثبت یا بررسی منبع تحقیق کامل نشد.',
    claims_unavailable: 'Claim Registry در دسترس نیست.',
    invalid_claim_review: 'تصمیم، Rationale یا وضعیت مورد انتظار Review معتبر نیست.',
    claim_permission_denied: 'فقط مالک می‌تواند Claim را بازبینی کند.',
    claim_not_found: 'Claim موردنظر پیدا نشد.',
    trace_incomplete: 'Trace این Claim برای Verify کامل نیست.',
    attestation_required: 'Verify به Attestation صریح بازبین انسانی نیاز دارد.',
    invalid_transition: 'این تغییر وضعیت Claim مجاز نیست.',
    claim_review_failed: 'بازبینی Claim کامل نشد.',
    claim_not_verified: 'Claim فعال دیگر Verified نیست؛ Approval و Export متوقف شد.',
    risk_unavailable: 'Risk Engine در دسترس نیست و اقدام حساس به‌صورت Fail-closed متوقف شد.',
    risk_review_required: 'این اقدام Yellow است؛ ابتدا Risk Check را شخصاً مرور و ثبت کنید.',
    risk_blocked: 'این اقدام Red یا متوقف‌شده است و در MVP قابل Override نیست.',
    invalid_risk_review: 'تصمیم، Attestation، Rationale یا Snapshot ارزیابی معتبر نیست.',
    risk_permission_denied: 'فقط مالک می‌تواند Risk Review ثبت کند.',
    risk_action_not_found: 'اقدام مربوط به این Risk Review دیگر در Snapshot جاری نیست.',
    assessment_changed: 'ارزیابی ریسک تغییر کرده است؛ نسخه تازه را دوباره مرور کنید.',
    invalid_decision: 'این تصمیم برای سطح فعلی ریسک مجاز نیست.',
    risk_failed: 'ارزیابی یا ثبت تصمیم ریسک کامل نشد.',
    arbitration_unavailable: 'مرکز داوری در دسترس نیست و هیچ سطح Autonomy افزایش نیافت.',
    invalid_arbitration_request: 'اقدام، شناسه درخواست یا سطح Autonomy معتبر نیست.',
    arbitration_permission_denied: 'فقط مالک می‌تواند Snapshot داوری ثبت کند.',
    arbitration_action_not_found: 'اقدام در Context فعلی دیگر وجود ندارد؛ فهرست را تازه کنید.',
    arbitration_failed: 'جمع‌آوری رأی ماژول‌ها کامل نشد و هیچ اختیاری صادر نشد.',
    initiative_unavailable: 'مرکز ابتکار عمل در دسترس نیست و هیچ Cue خودکاری نمایش داده نشد.',
    invalid_initiative_settings: 'تنظیمات Mode، سقف یا حداقل ارتباط معتبر نیست.',
    invalid_initiative_evaluation: 'شناسه ارزیابی Initiative معتبر نیست.',
    invalid_initiative_request: 'درخواست Initiative معتبر نیست و هیچ Cue ثبت نشد.',
    initiative_permission_denied: 'فقط مالک می‌تواند Proactive Mode را تنظیم کند.',
    initiative_failed: 'ارزیابی Signal کامل نشد و سیستم سکوت کرد.',
    relationships_unavailable: 'نقشه روابط در دسترس نیست و هیچ Contextی ثبت نشد.',
    invalid_relationship_input: 'فیلدهای Stakeholder، تاریخ یا رضایت ثبت Context معتبر نیست.',
    invalid_relationship_request: 'درخواست رابطه معتبر نیست؛ تاریخ آینده و Context ناقص پذیرفته نمی‌شود.',
    invalid_relationship_delete: 'شناسه درخواست حذف رابطه معتبر نیست.',
    relationship_permission_denied: 'فقط مالک می‌تواند Context خصوصی روابط را مدیریت کند.',
    relationship_conflict: 'این Stakeholder یا شناسه درخواست قبلاً با Context دیگری ثبت شده است.',
    stakeholder_not_found: 'این Stakeholder دیگر در نقشه فعال وجود ندارد.',
    relationship_failed: 'ثبت یا حذف Context رابطه کامل نشد.',
    perception_unavailable: 'فضای ادراک در دسترس نیست و هیچ Signalی ثبت نشد.',
    invalid_perception_input: 'بُعد، Perspective، Stage، منبع یا رضایت Signal معتبر نیست.',
    invalid_perception_request: 'Signal ادراکی معتبر نیست؛ تاریخ آینده یا متن ناقص پذیرفته نمی‌شود.',
    invalid_perception_delete: 'شناسه درخواست حذف Signal معتبر نیست.',
    perception_permission_denied: 'فقط مالک می‌تواند Signalهای ادراکی خصوصی را مدیریت کند.',
    perception_conflict: 'این شناسه درخواست قبلاً با Signal دیگری استفاده شده یا Signal حذف شده است.',
    perception_signal_not_found: 'این Signal دیگر در نقشه فعال وجود ندارد.',
    perception_failed: 'ثبت یا حذف Signal ادراکی کامل نشد.',
    drafts_unavailable: 'Draft Studio در دسترس نیست.',
    invalid_draft_input: 'اطلاعات Draft ناقص یا خارج از محدودیت‌های پلتفرم است.',
    draft_permission_denied: 'مجوز صریح مالک برای استفاده از این حافظه در Draft وجود ندارد.',
    draft_not_found: 'این Draft دیگر در Workspace جاری وجود ندارد.',
    content_action_not_approved: 'ابتدا اقدام محتوایی را در Workbench تأیید کنید.',
    source_not_available: 'حافظه یا Evidence مبنا حذف، محدود یا مورد اعتراض قرار گرفته است.',
    source_not_authorized_for_action: 'منبع انتخاب‌شده همان Evidence مجازِ اقدام محتوایی نیست؛ پیشنهاد را با منبع مجاز دوباره بررسی کنید.',
    guard_failed: 'Claim Check قرمز است و این نسخه قابل تأیید نیست.',
    strategy_changed: 'استراتژی تغییر کرده است؛ Draft باید با جهت جدید دوباره ساخته شود.',
    draft_not_approved: 'قبل از Export باید همین Revision را تأیید کنید.',
    feedback_unavailable: 'سرویس یادگیری از بازخورد در دسترس نیست.',
    audit_trail_unavailable: 'ردپای حساب در دسترس نیست.',
    account_export_unavailable: 'خروجی کامل داده‌های حساب هنوز آماده نیست.',
    account_permission_denied: 'این ردپا فقط برای مالک حساب قابل مشاهده است.',
    account_data_failed: 'بازیابی یا خروجی داده‌های حساب کامل نشد.',
    invalid_feedback_input: 'دلیل رد یا تصمیم Preference معتبر نیست.',
    invalid_asset_right: 'نوع یا دلیل درخواست کنترل منبع معتبر نیست.',
    asset_not_found: 'این منبع دیگر در داده‌های فعال شما وجود ندارد.',
    asset_import_conflict: 'این درخواست منبع قبلاً با محتوای دیگری ثبت شده است.',
    asset_permission_denied: 'فقط مالک می‌تواند مجوز یا وضعیت این منبع را تغییر دهد.',
    feedback_permission_denied: 'فقط مالک می‌تواند Feedback و Preference Model را مدیریت کند.',
    preference_not_found: 'این پیشنهاد ترجیح دیگر در دسترس نیست.',
    invalid_status: 'وضعیت این پیشنهاد قبلاً تغییر کرده است؛ Snapshot تازه را دریافت کنید.',
    feedback_failed: 'ثبت بازخورد کامل نشد؛ دوباره تلاش کنید.',
    expression_unavailable: 'نمای روایت و Voice در دسترس نیست.',
    invalid_expression_input: 'متن یا فهرست Assetهای انتخاب‌شده معتبر نیست.',
    invalid_expression_request: 'متن باید حداقل ۲۰ نویسه داشته باشد و حداکثر پنج Asset یکتا انتخاب شود.',
    expression_permission_denied: 'فقط مالک می‌تواند این تحلیل را اجرا کند؛ Asset بدون Brand Usage پذیرفته نمی‌شود.',
    expression_failed: 'Authentic Expression Gate کامل نشد؛ دوباره تلاش کنید.',
    opportunity_radar_unavailable: 'رادار فرصت در دسترس نیست.',
    invalid_opportunity_radar_request: 'زمان یا Context ارزیابی فرصت معتبر نیست.',
    opportunity_radar_permission_denied: 'فقط مالک می‌تواند ارزیابی خصوصی فرصت‌ها را ببیند.',
    opportunity_radar_failed: 'ارزیابی Sourceهای بیرونی کامل نشد؛ دوباره تلاش کنید.',
    invalid_response: 'پاسخ API با قرارداد Workbench هم‌خوان نیست.',
  };
  return messages[error.code] ?? 'در پردازش درخواست خطایی رخ داد.';
}

function memoryRightActionLabel(kind: MemoryRightKind): string {
  if (kind === 'correct') return 'ثبت اصلاح و حفظ نسخه قبلی';
  if (kind === 'contest') return 'ثبت اعتراض و توقف استفاده';
  if (kind === 'revoke') return 'لغو مجوز استفاده';
  return 'حذف حافظه و لغو مجوزها';
}

function memoryRightResultLabel(result: AppliedMemoryRight): string {
  if (result.operation === 'correct') return 'اصلاح ثبت شد و تاریخچه قبلی حفظ شد.';
  if (result.operation === 'contest') return 'اعتراض ثبت شد؛ این برداشت قابل استفاده نیست.';
  if (result.operation === 'revoke') return 'مجوزهای استفاده از این حافظه لغو شدند.';
  return 'حافظه و مشتقات آن حذف نرم شدند و مجوزها لغو شدند.';
}
