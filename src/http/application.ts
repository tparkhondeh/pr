import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ArbitrationConflictError,
  ArbitrationNotFoundError,
  ArbitrationPermissionError,
  ArbitrationValidationError,
  type DecisionArbitrationService,
} from '../arbitration/decision-arbitration.js';
import {
  AuditTrailPermissionError,
  AuditTrailValidationError,
  type AuditTrailService,
  type AuditTrailSnapshot,
  type RecordAuditEvent,
} from '../account/audit-trail.js';
import {
  TextAssetConflictError,
  TextAssetNotFoundError,
  TextAssetPermissionError,
  TextAssetValidationError,
  type TextAssetIntakeService,
  type TextAssetRightOperation,
  type TextAssetSnapshot,
} from '../assets/text-asset-intake.js';
import {
  ClaimGovernanceBlockedError,
  ClaimGovernanceConflictError,
  ClaimGovernanceNotFoundError,
  ClaimGovernancePermissionError,
  ClaimGovernanceValidationError,
  type ClaimGovernanceService,
  type ClaimGovernanceSnapshot,
  type ClaimReviewDecision,
} from '../claims/governance.js';
import type { ClaimStatus } from '../claims/claim-registry.js';
import {
  DraftBlockedError,
  DraftConflictError,
  DraftNotFoundError,
  DraftPermissionError,
  DraftValidationError,
  draftChannels,
  type ContentDraftService,
  type DraftChannel,
  type DraftSourceKind,
  type DraftWorkspaceSnapshot,
} from '../claims/workspace.js';
import {
  ConversationValidationError,
  MemoryProposalConflictError,
  MemoryProposalNotFoundError,
  MemoryProposalPermissionError,
} from '../conversation/intake.js';
import type { ConversationIntakeService, PersonalMemorySnapshot } from '../conversation/intake.js';
import {
  FeedbackConflictError,
  FeedbackNotFoundError,
  FeedbackPermissionError,
  FeedbackValidationError,
  type FeedbackLearningService,
  type FeedbackLearningSnapshot,
  type PreferenceDecision,
} from '../feedback/workspace.js';
import {
  AuthenticExpressionPermissionError,
  AuthenticExpressionValidationError,
  type AuthenticExpressionReview,
  type AuthenticExpressionService,
  type AuthenticExpressionSnapshot,
} from '../expression/authentic-expression.js';
import {
  InitiativeConflictError,
  InitiativePermissionError,
  InitiativeValidationError,
  type EditableInitiativeSettings,
  type InitiativeMode,
  type InitiativePolicyService,
} from '../initiative/initiative-policy.js';
import type { TenantId, UserId } from '../kernel/identity.js';
import {
  PerceptionConflictError,
  PerceptionNotFoundError,
  PerceptionPermissionError,
  PerceptionValidationError,
  perceptionConfidences,
  perceptionDimensions,
  perceptionPerspectives,
  perceptionSourceKinds,
  perceptionStages,
  type PerceptionConfidence,
  type PerceptionDimension,
  type PerceptionPerspective,
  type PerceptionSignalRecord,
  type PerceptionSourceKind,
  type PerceptionStage,
  type PerceptionWorkspaceService,
  type PerceptionWorkspaceSnapshot,
} from '../perception/workspace.js';
import {
  OpportunityRadarPermissionError,
  OpportunityRadarValidationError,
  type OpportunityRadarService,
  type OpportunityRadarSnapshot,
} from '../opportunities/radar.js';
import {
  RelationshipConflictError,
  RelationshipNotFoundError,
  RelationshipPermissionError,
  RelationshipValidationError,
  relationshipBoundaries,
  relationshipStrengths,
  stakeholderGroups,
  stakeholderPriorities,
  type RelationshipBoundary,
  type RelationshipStrength,
  type RelationshipWorkspaceService,
  type RelationshipWorkspaceSnapshot,
  type StakeholderGroup,
  type StakeholderPriority,
  type StakeholderRecord,
} from '../relationships/workspace.js';
import {
  BrandProtectionBlockedError,
  BrandProtectionConflictError,
  BrandProtectionNotFoundError,
  BrandProtectionPermissionError,
  BrandProtectionValidationError,
  type BrandProtectionService,
  type BrandProtectionSnapshot,
  type RiskLevel,
  type RiskReviewDecision,
} from '../risk/brand-protection.js';
import {
  ResearchConflictError,
  ResearchPermissionError,
  ResearchValidationError,
  researchQualities,
  researchStances,
  type ResearchSourceQuality,
  type ResearchSourceRecord,
  type ResearchSourceStance,
  type ResearchWorkspaceService,
  type ResearchWorkspaceSnapshot,
} from '../research/workspace.js';
import {
  StrategyContextConflictError,
  StrategyContextPermissionError,
  StrategyContextValidationError,
  type EditableStrategyContext,
  type StrategyContextService,
  type StrategyContextSnapshot,
} from '../strategy/context.js';
import {
  WorkbenchActionNotFoundError,
  WorkbenchApprovalConflictError,
  type WorkbenchService,
} from '../workbench/workbench.js';
import { calculateOwnerEvidenceContext } from '../workbench/evidence-context.js';

export type ReadinessCheck = () =>
  | Promise<ReadinessStatus>
  | ReadinessStatus;

export type ReadinessStatus = Readonly<{
  ready: boolean;
  reason?: string;
  persistence?: 'memory' | 'postgres';
  durability?: 'ephemeral' | 'persistent';
}>;

export type ApplicationDependencies = Readonly<{
  workbench?: Pick<WorkbenchService, 'snapshot' | 'approve'>;
  strategy?: Pick<StrategyContextService, 'snapshot' | 'save'>;
  drafts?: Pick<
    ContentDraftService,
    'sources' | 'snapshot' | 'create' | 'edit' | 'approve' | 'export'
  >;
  learning?: Pick<FeedbackLearningService, 'snapshot' | 'rejectDraft' | 'decide'>;
  research?: Pick<ResearchWorkspaceService, 'snapshot' | 'importSource'>;
  claims?: Pick<ClaimGovernanceService, 'snapshot' | 'review'>;
  risk?: Pick<BrandProtectionService, 'snapshot' | 'review' | 'authorizeAction'>;
  arbitration?: Pick<DecisionArbitrationService, 'snapshot' | 'assess'>;
  initiative?: Pick<InitiativePolicyService, 'snapshot' | 'updateSettings' | 'evaluate'>;
  relationships?: Pick<RelationshipWorkspaceService, 'snapshot' | 'create' | 'delete'>;
  perception?: Pick<PerceptionWorkspaceService, 'snapshot' | 'create' | 'delete'>;
  expression?: Pick<AuthenticExpressionService, 'snapshot' | 'review'>;
  opportunities?: Pick<OpportunityRadarService, 'snapshot'>;
  auditTrail?: Pick<AuditTrailService, 'snapshot' | 'record'>;
  assets?: Pick<TextAssetIntakeService, 'snapshot' | 'importText' | 'applyRight'>;
  mutationAuditTrail?: Pick<AuditTrailService, 'record'>;
  resolveActor?: (request: IncomingMessage) => UserId | undefined;
  tenantId?: TenantId;
  conversation?: Pick<
    ConversationIntakeService,
    'submitTurn' | 'confirmMemory' | 'applyMemoryRight' | 'memorySnapshot'
  >;
  clock?: () => Date;
}>;

export function createRequestHandler(
  readinessCheck: ReadinessCheck,
  dependencies: ApplicationDependencies = {},
) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const path = request.url ? new URL(request.url, 'http://localhost').pathname : '/';

    if (request.method === 'GET' && path === '/health') {
      sendJson(response, 200, { status: 'alive' });
      return;
    }

    if (request.method === 'GET' && path === '/ready') {
      try {
        const readiness = await readinessCheck();
        sendJson(response, readiness.ready ? 200 : 503, {
          status: readiness.ready ? 'ready' : 'not_ready',
          ...(readiness.reason ? { reason: readiness.reason } : {}),
          ...(readiness.persistence ? { persistence: readiness.persistence } : {}),
          ...(readiness.durability ? { durability: readiness.durability } : {}),
        });
      } catch {
        sendJson(response, 503, {
          status: 'not_ready',
          reason: 'readiness_check_failed',
        });
      }
      return;
    }

    if (request.method === 'GET' && path === '/api/workbench') {
      if (!dependencies.workbench) {
        sendJson(response, 503, { error: 'workbench_unavailable' });
        return;
      }
      sendJson(response, 200, await dependencies.workbench.snapshot());
      return;
    }

    if (request.method === 'GET' && path === '/api/strategy') {
      await handleStrategySnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'PUT' && path === '/api/strategy') {
      await handleStrategySave(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/drafts/current') {
      await handleDraftSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/drafts/sources') {
      await handleDraftSources(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/feedback') {
      await handleFeedbackSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/research') {
      await handleResearchSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'POST' && path === '/api/research/sources') {
      await handleResearchImport(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/claims') {
      await handleClaimSnapshot(request, response, dependencies);
      return;
    }

    const claimReview = path.match(/^\/api\/claims\/([0-9a-f-]{36})\/reviews$/iu);
    if (request.method === 'POST' && claimReview?.[1]) {
      await handleClaimReview(request, response, dependencies, claimReview[1]);
      return;
    }

    if (request.method === 'GET' && path === '/api/risk') {
      await handleRiskSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/arbitration') {
      await handleArbitrationSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'POST' && path === '/api/arbitration/cases') {
      await handleArbitrationAssessment(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/initiative') {
      await handleInitiativeSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'PUT' && path === '/api/initiative/settings') {
      await handleInitiativeSettings(request, response, dependencies);
      return;
    }

    if (request.method === 'POST' && path === '/api/initiative/evaluations') {
      await handleInitiativeEvaluation(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/relationships') {
      await handleRelationshipSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'POST' && path === '/api/relationships/stakeholders') {
      await handleStakeholderCreate(request, response, dependencies);
      return;
    }

    const stakeholderDelete = path.match(/^\/api\/relationships\/stakeholders\/([0-9a-f-]{36})\/delete$/iu);
    if (request.method === 'POST' && stakeholderDelete?.[1]) {
      await handleStakeholderDelete(request, response, dependencies, stakeholderDelete[1]);
      return;
    }

    if (request.method === 'GET' && path === '/api/perception') {
      await handlePerceptionSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'POST' && path === '/api/perception/signals') {
      await handlePerceptionSignalCreate(request, response, dependencies);
      return;
    }

    const perceptionDelete = path.match(/^\/api\/perception\/signals\/([0-9a-f-]{36})\/delete$/iu);
    if (request.method === 'POST' && perceptionDelete?.[1]) {
      await handlePerceptionSignalDelete(request, response, dependencies, perceptionDelete[1]);
      return;
    }

    if (request.method === 'GET' && path === '/api/expression') {
      await handleExpressionSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'POST' && path === '/api/expression/review') {
      await handleExpressionReview(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/opportunities') {
      await handleOpportunityRadar(request, response, dependencies);
      return;
    }

    const riskReview = path.match(/^\/api\/risk\/actions\/([^/]+)\/reviews$/u);
    if (request.method === 'POST' && riskReview?.[1]) {
      await handleRiskReview(request, response, dependencies, decodeURIComponent(riskReview[1]));
      return;
    }

    if (request.method === 'GET' && path === '/api/account/activity') {
      await handleAuditTrail(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/onboarding') {
      await handleOnboardingSnapshot(request, response, dependencies);
      return;
    }

    if (request.method === 'POST' && path === '/api/assets/text') {
      await handleTextAssetImport(request, response, dependencies);
      return;
    }

    const assetRight = path.match(/^\/api\/assets\/text\/([^/]+)\/rights$/u);
    if (request.method === 'POST' && assetRight?.[1]) {
      await handleTextAssetRight(request, response, dependencies, decodeURIComponent(assetRight[1]));
      return;
    }

    if (request.method === 'GET' && path === '/api/account/export') {
      await handleAccountExport(request, response, dependencies);
      return;
    }

    const draftRejection = path.match(/^\/api\/feedback\/drafts\/([0-9a-f-]{36})\/reject$/iu);
    if (request.method === 'POST' && draftRejection?.[1]) {
      await handleDraftRejection(request, response, dependencies, draftRejection[1]);
      return;
    }

    const preferenceDecision = path.match(/^\/api\/feedback\/preferences\/([0-9a-f-]{36})\/decision$/iu);
    if (request.method === 'POST' && preferenceDecision?.[1]) {
      await handlePreferenceDecision(request, response, dependencies, preferenceDecision[1]);
      return;
    }

    if (request.method === 'POST' && path === '/api/drafts') {
      await handleDraftCreate(request, response, dependencies);
      return;
    }

    const draftEdit = path.match(/^\/api\/drafts\/([0-9a-f-]{36})$/iu);
    if (request.method === 'PUT' && draftEdit?.[1]) {
      await handleDraftEdit(request, response, dependencies, draftEdit[1]);
      return;
    }

    const draftTransition = path.match(
      /^\/api\/drafts\/([0-9a-f-]{36})\/(approve|export)$/iu,
    );
    if (request.method === 'POST' && draftTransition?.[1] && draftTransition[2]) {
      await handleDraftTransition(
        request,
        response,
        dependencies,
        draftTransition[1],
        draftTransition[2] as 'approve' | 'export',
      );
      return;
    }

    if (request.method === 'POST' && path === '/api/workbench/approval') {
      await handleApproval(request, response, dependencies);
      return;
    }

    if (request.method === 'POST' && path === '/api/conversations/turns') {
      await handleConversationTurn(request, response, dependencies);
      return;
    }

    if (request.method === 'GET' && path === '/api/memory') {
      await handleMemorySnapshot(request, response, dependencies);
      return;
    }

    const proposalConfirmation = path.match(
      /^\/api\/memory\/proposals\/([a-zA-Z0-9][a-zA-Z0-9_-]{2,63})\/confirm$/u,
    );
    if (request.method === 'POST' && proposalConfirmation?.[1]) {
      await handleMemoryConfirmation(
        request,
        response,
        dependencies,
        proposalConfirmation[1],
      );
      return;
    }

    const memoryRight = path.match(
      /^\/api\/memory\/proposals\/([a-zA-Z0-9][a-zA-Z0-9_-]{2,63})\/rights$/u,
    );
    if (request.method === 'POST' && memoryRight?.[1]) {
      await handleMemoryRight(request, response, dependencies, memoryRight[1]);
      return;
    }

    sendJson(response, 404, { error: 'not_found' });
  };
}

async function handleFeedbackSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = feedbackActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.learning?.snapshot(actorId, now(dependencies));
    if (!snapshot) throw new Error('Learning service disappeared.');
    sendJson(response, 200, serializeFeedback(snapshot));
  } catch (error: unknown) {
    sendFeedbackError(response, error);
  }
}

async function handleDraftRejection(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  draftId: string,
): Promise<void> {
  const actorId = feedbackActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const reason = body['reason'];
    if (typeof requestId !== 'string' || typeof reason !== 'string') {
      sendJson(response, 400, { error: 'invalid_feedback_input' });
      return;
    }
    const draft = await dependencies.drafts?.snapshot(actorId, now(dependencies));
    if (!draft || draft.draftId !== draftId) {
      sendJson(response, 404, { error: 'draft_not_found' });
      return;
    }
    const occurredAt = now(dependencies);
    const snapshot = await dependencies.learning?.rejectDraft({
      actorId,
      requestId,
      draftId,
      reason,
      occurredAt,
    });
    if (!snapshot) throw new Error('Learning service disappeared.');
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `feedback.reject:${requestId}`,
      eventType: 'feedback.draft_rejected',
      resourceType: 'draft',
      resourceId: draftId,
      purpose: 'brand_usage',
      decision: 'rejected',
      metadata: { requestId },
      occurredAt,
    });
    sendJson(response, 200, serializeFeedback(snapshot));
  } catch (error: unknown) {
    sendFeedbackError(response, error);
  }
}

async function handlePreferenceDecision(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  proposalId: string,
): Promise<void> {
  const actorId = feedbackActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const decision = body['decision'];
    if (typeof requestId !== 'string' || !isPreferenceDecision(decision)) {
      sendJson(response, 400, { error: 'invalid_feedback_input' });
      return;
    }
    const occurredAt = now(dependencies);
    const snapshot = await dependencies.learning?.decide({
      actorId,
      requestId,
      proposalId,
      decision,
      occurredAt,
    });
    if (!snapshot) throw new Error('Learning service disappeared.');
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `feedback.preference:${requestId}`,
      eventType: `feedback.preference_${decision}`,
      resourceType: 'preference_proposal',
      resourceId: proposalId,
      purpose: 'brand_usage',
      decision,
      metadata: { requestId },
      occurredAt,
    });
    sendJson(response, 200, serializeFeedback(snapshot));
  } catch (error: unknown) {
    sendFeedbackError(response, error);
  }
}

function feedbackActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.learning) {
    sendJson(response, 503, { error: 'feedback_unavailable' });
    return undefined;
  }
  return actorId;
}

function serializeFeedback(snapshot: FeedbackLearningSnapshot): Record<string, unknown> {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    persistence: snapshot.persistence,
    summary: snapshot.summary,
    recentEvents: snapshot.recentEvents.map((event) => ({
      id: event.id,
      artifactType: event.artifactType,
      artifactId: event.artifactId,
      eventType: event.eventType,
      ...(event.signalKey ? { signalKey: event.signalKey, signalValue: event.signalValue } : {}),
      occurredAt: event.occurredAt.toISOString(),
    })),
    preferences: snapshot.preferences.map((preference) => ({
      id: preference.id,
      preferenceKey: preference.preferenceKey,
      proposedValue: preference.proposedValue,
      evidenceEventIds: preference.evidenceEventIds,
      rationale: preference.rationale,
      confidence: preference.confidence,
      status: preference.status,
      proposedAt: preference.proposedAt.toISOString(),
      ...(preference.decidedAt ? { decidedAt: preference.decidedAt.toISOString() } : {}),
    })),
  };
}

async function handleResearchSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = researchActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.research?.snapshot(actorId, now(dependencies));
    if (!snapshot) throw new Error('Research workspace disappeared.');
    sendJson(response, 200, serializeResearchSnapshot(snapshot));
  } catch (error: unknown) {
    sendResearchError(response, error);
  }
}

async function handleResearchImport(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = researchActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const title = body['title'];
    const publisher = body['publisher'];
    const url = body['url'];
    const excerpt = body['excerpt'];
    const statement = body['statement'];
    const quality = body['quality'];
    const stance = body['stance'];
    const publishedAt = body['publishedAt'];
    const maxAgeDays = body['maxAgeDays'];
    if (
      typeof requestId !== 'string' || typeof title !== 'string' ||
      typeof publisher !== 'string' || typeof url !== 'string' ||
      typeof excerpt !== 'string' || typeof statement !== 'string' ||
      !isResearchQuality(quality) || !isResearchStance(stance) ||
      typeof publishedAt !== 'string' || typeof maxAgeDays !== 'number'
    ) {
      sendJson(response, 400, { error: 'invalid_research_input' });
      return;
    }
    const result = await dependencies.research?.importSource({
      actorId,
      requestId,
      title,
      publisher,
      url,
      excerpt,
      statement,
      quality,
      stance,
      publishedAt: new Date(publishedAt),
      maxAgeDays,
      accessedAt: now(dependencies),
    });
    if (!result) throw new Error('Research workspace disappeared.');
    if (result.outcome === 'applied') {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `research.source:${requestId}`,
        eventType: 'research.source_recorded',
        resourceType: 'research_source',
        resourceId: result.record.sourceId,
        purpose: 'external_research',
        decision: 'claim_proposed',
        metadata: { requestId, quality, stance },
        occurredAt: result.record.accessedAt,
      });
    }
    sendJson(response, result.outcome === 'applied' ? 201 : 200, {
      outcome: result.outcome,
      persistence: result.persistence,
      record: serializeResearchRecord(result.record),
    });
  } catch (error: unknown) {
    sendResearchError(response, error);
  }
}

function researchActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.research) {
    sendJson(response, 503, { error: 'research_unavailable' });
    return undefined;
  }
  return actorId;
}

function serializeResearchSnapshot(snapshot: ResearchWorkspaceSnapshot): Record<string, unknown> {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    persistence: snapshot.persistence,
    summary: snapshot.summary,
    sources: snapshot.sources.map((source) => ({
      ...serializeResearchRecord(source),
      qualityScore: source.qualityScore,
      freshness: source.freshness,
      ageDays: source.ageDays,
      factCheckStatus: source.factCheckStatus,
      conflictDetected: source.conflictDetected,
      citation: source.citation,
      usableForPublicClaim: source.usableForPublicClaim,
    })),
  };
}

function serializeResearchRecord(record: ResearchSourceRecord): Record<string, unknown> {
  return {
    sourceId: record.sourceId,
    claimId: record.claimId,
    evidenceId: record.evidenceId,
    requestId: record.requestId,
    title: record.title,
    publisher: record.publisher,
    url: record.url,
    excerpt: record.excerpt,
    statement: record.statement,
    quality: record.quality,
    stance: record.stance,
    publishedAt: record.publishedAt.toISOString(),
    accessedAt: record.accessedAt.toISOString(),
    maxAgeDays: record.maxAgeDays,
  };
}

function sendResearchError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof ResearchValidationError) {
    sendJson(response, 400, { error: 'invalid_research_input' });
    return;
  }
  if (error instanceof ResearchPermissionError) {
    sendJson(response, 403, { error: 'research_permission_denied' });
    return;
  }
  if (error instanceof ResearchConflictError) {
    sendJson(response, 409, { error: 'research_import_conflict' });
    return;
  }
  sendJson(response, 500, { error: 'research_failed' });
}

function isResearchQuality(value: unknown): value is ResearchSourceQuality {
  return typeof value === 'string' && researchQualities.includes(value as ResearchSourceQuality);
}

function isResearchStance(value: unknown): value is ResearchSourceStance {
  return typeof value === 'string' && researchStances.includes(value as ResearchSourceStance);
}

async function handleClaimSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = claimActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.claims?.snapshot(actorId, now(dependencies));
    if (!snapshot) throw new Error('Claim governance disappeared.');
    sendJson(response, 200, serializeClaimSnapshot(snapshot));
  } catch (error: unknown) {
    sendClaimError(response, error);
  }
}

async function handleClaimReview(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  claimId: string,
): Promise<void> {
  const actorId = claimActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const expectedStatus = body['expectedStatus'];
    const decision = body['decision'];
    const rationale = body['rationale'];
    const humanAttestation = body['humanAttestation'];
    if (
      typeof requestId !== 'string' || !isClaimStatus(expectedStatus) ||
      !isClaimDecision(decision) || typeof rationale !== 'string' ||
      typeof humanAttestation !== 'boolean'
    ) {
      sendJson(response, 400, { error: 'invalid_claim_review' });
      return;
    }
    const reviewedAt = now(dependencies);
    const result = await dependencies.claims?.review({
      actorId,
      requestId,
      claimId,
      expectedStatus,
      decision,
      rationale,
      humanAttestation,
      reviewedAt,
    });
    if (!result) throw new Error('Claim governance disappeared.');
    if (result.outcome === 'applied') {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `claim.review:${requestId}`,
        eventType: 'claim.reviewed',
        resourceType: 'claim',
        resourceId: claimId,
        purpose: 'public_drafting',
        decision,
        metadata: { requestId, previousStatus: result.review.previousStatus, resultingStatus: result.review.resultingStatus },
        occurredAt: result.review.reviewedAt,
      });
    }
    sendJson(response, result.outcome === 'applied' ? 201 : 200, {
      outcome: result.outcome,
      persistence: result.persistence,
      review: serializeClaimReview(result.review),
    });
  } catch (error: unknown) {
    sendClaimError(response, error);
  }
}

function claimActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.claims) {
    sendJson(response, 503, { error: 'claims_unavailable' });
    return undefined;
  }
  return actorId;
}

function serializeClaimSnapshot(snapshot: ClaimGovernanceSnapshot): Record<string, unknown> {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    persistence: snapshot.persistence,
    summary: snapshot.summary,
    claims: snapshot.claims.map((claim) => ({
      claimId: claim.claimId,
      statement: claim.statement,
      kind: claim.kind,
      status: claim.status,
      dataClass: claim.dataClass,
      evidenceIds: claim.evidenceIds,
      sourceRefs: claim.sourceRefs,
      allowedPurposes: claim.allowedPurposes,
      allowedChannels: claim.allowedChannels,
      validFrom: claim.validFrom.toISOString(),
      ...(claim.validUntil ? { validUntil: claim.validUntil.toISOString() } : {}),
      createdAt: claim.createdAt.toISOString(),
      categories: claim.categories,
      traceStatus: claim.traceStatus,
      traceRationale: claim.traceRationale,
      riskLevel: claim.riskLevel,
      canUsePublicly: claim.canUsePublicly,
      reviewableDecisions: claim.reviewableDecisions,
      ...(claim.research ? {
        research: {
          ...claim.research,
          publishedAt: claim.research.publishedAt.toISOString(),
          accessedAt: claim.research.accessedAt.toISOString(),
        },
      } : {}),
      ...(claim.lastReview ? { lastReview: serializeClaimReview(claim.lastReview) } : {}),
    })),
  };
}

function serializeClaimReview(review: Readonly<{
  reviewId: string;
  requestId: string;
  claimId: string;
  decision: ClaimReviewDecision;
  previousStatus: ClaimStatus;
  resultingStatus: ClaimStatus;
  rationale: string;
  traceSnapshot: Readonly<Record<string, unknown>>;
  reviewedBy: UserId;
  reviewedAt: Date;
}>): Record<string, unknown> {
  return {
    reviewId: review.reviewId,
    requestId: review.requestId,
    claimId: review.claimId,
    decision: review.decision,
    previousStatus: review.previousStatus,
    resultingStatus: review.resultingStatus,
    rationale: review.rationale,
    traceSnapshot: review.traceSnapshot,
    reviewedAt: review.reviewedAt.toISOString(),
  };
}

function sendClaimError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof ClaimGovernanceValidationError) {
    sendJson(response, 400, { error: 'invalid_claim_review' });
    return;
  }
  if (error instanceof ClaimGovernancePermissionError) {
    sendJson(response, 403, { error: 'claim_permission_denied' });
    return;
  }
  if (error instanceof ClaimGovernanceNotFoundError) {
    sendJson(response, 404, { error: 'claim_not_found' });
    return;
  }
  if (error instanceof ClaimGovernanceConflictError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  if (error instanceof ClaimGovernanceBlockedError) {
    sendJson(response, 422, { error: error.reason });
    return;
  }
  sendJson(response, 500, { error: 'claim_review_failed' });
}

function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === 'string' && ['proposed', 'verified', 'disputed', 'expired', 'revoked'].includes(value);
}

function isClaimDecision(value: unknown): value is ClaimReviewDecision {
  return typeof value === 'string' && ['verify', 'dispute', 'revoke'].includes(value);
}

async function handleArbitrationSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = arbitrationActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.arbitration?.snapshot(actorId, now(dependencies));
    if (!snapshot) throw new Error('Arbitration service disappeared.');
    sendJson(response, 200, snapshot);
  } catch (error: unknown) {
    sendArbitrationError(response, error);
  }
}

async function handleArbitrationAssessment(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = arbitrationActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const actionId = body['actionId'];
    const requestedAutonomyLevel = body['requestedAutonomyLevel'];
    if (
      typeof requestId !== 'string' || typeof actionId !== 'string' ||
      typeof requestedAutonomyLevel !== 'number'
    ) {
      sendJson(response, 400, { error: 'invalid_arbitration_request' });
      return;
    }
    const occurredAt = now(dependencies);
    const result = await dependencies.arbitration?.assess({
      actorId,
      requestId,
      actionId,
      requestedAutonomyLevel,
      occurredAt,
    });
    if (!result) throw new Error('Arbitration service disappeared.');
    if (result.outcome === 'applied') {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `decision.arbitrated:${requestId}`,
        eventType: 'decision.arbitrated',
        resourceType: 'arbitration_case',
        resourceId: result.snapshot.caseId,
        purpose: 'strategy_reasoning',
        decision: result.snapshot.decision.outcome,
        metadata: {
          actionId: result.snapshot.action.id,
          requestedAutonomyLevel: result.snapshot.request.requestedAutonomyLevel,
          effectiveAutonomyLevel: result.snapshot.decision.effectiveAutonomyLevel,
          policyVersion: result.snapshot.policyVersion,
          snapshotHash: result.snapshot.snapshotHash,
        },
        occurredAt,
      });
    }
    sendJson(response, result.outcome === 'applied' ? 201 : 200, {
      outcome: result.outcome,
      persistence: result.persistence,
      case: result.snapshot,
    });
  } catch (error: unknown) {
    sendArbitrationError(response, error);
  }
}

function arbitrationActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.arbitration) {
    sendJson(response, 503, { error: 'arbitration_unavailable' });
    return undefined;
  }
  return actorId;
}

function sendArbitrationError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof ArbitrationValidationError) {
    sendJson(response, 400, { error: 'invalid_arbitration_request' });
    return;
  }
  if (error instanceof ArbitrationPermissionError) {
    sendJson(response, 403, { error: 'arbitration_permission_denied' });
    return;
  }
  if (error instanceof ArbitrationNotFoundError) {
    sendJson(response, 404, { error: 'arbitration_action_not_found' });
    return;
  }
  if (error instanceof ArbitrationConflictError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  sendJson(response, 500, { error: 'arbitration_failed' });
}

async function handleInitiativeSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = initiativeActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.initiative?.snapshot(actorId, now(dependencies));
    if (!snapshot) throw new Error('Initiative service disappeared.');
    sendJson(response, 200, snapshot);
  } catch (error: unknown) {
    sendInitiativeError(response, error);
  }
}

async function handleInitiativeSettings(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = initiativeActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const expectedRevision = body['expectedRevision'];
    const mode = body['mode'];
    const maxPromptsPer24Hours = body['maxPromptsPer24Hours'];
    const minimumRelevance = body['minimumRelevance'];
    const pausedUntil = body['pausedUntil'];
    if (
      typeof requestId !== 'string' || typeof expectedRevision !== 'number' ||
      !isInitiativeMode(mode) || typeof maxPromptsPer24Hours !== 'number' ||
      typeof minimumRelevance !== 'number' ||
      (pausedUntil !== null && typeof pausedUntil !== 'string')
    ) {
      sendJson(response, 400, { error: 'invalid_initiative_settings' });
      return;
    }
    const occurredAt = now(dependencies);
    const value: EditableInitiativeSettings = {
      mode,
      maxPromptsPer24Hours: maxPromptsPer24Hours as 1 | 2 | 3,
      minimumRelevance,
      pausedUntil,
    };
    const result = await dependencies.initiative?.updateSettings({
      actorId,
      requestId,
      expectedRevision,
      value,
      occurredAt,
    });
    if (!result) throw new Error('Initiative service disappeared.');
    if (result.outcome === 'saved') {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `initiative.settings_updated:${requestId}`,
        eventType: 'initiative.settings_updated',
        resourceType: 'initiative_settings',
        resourceId: String(actorId),
        purpose: 'strategy_reasoning',
        decision: result.settings.mode,
        metadata: { revision: result.settings.revision, policyVersion: 'initiative-policy-v1' },
        occurredAt,
      });
    }
    sendJson(response, 200, result);
  } catch (error: unknown) {
    sendInitiativeError(response, error);
  }
}

async function handleInitiativeEvaluation(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = initiativeActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    if (typeof requestId !== 'string') {
      sendJson(response, 400, { error: 'invalid_initiative_evaluation' });
      return;
    }
    const occurredAt = now(dependencies);
    const result = await dependencies.initiative?.evaluate({ actorId, requestId, occurredAt });
    if (!result) throw new Error('Initiative service disappeared.');
    if (result.outcome === 'evaluated') {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `initiative.evaluated:${requestId}`,
        eventType: 'initiative.evaluated',
        resourceType: 'initiative_evaluation',
        resourceId: result.evaluation.evaluationId,
        purpose: 'strategy_reasoning',
        decision: result.evaluation.decision,
        metadata: {
          reason: result.evaluation.reason,
          candidateId: result.evaluation.candidate?.candidateId ?? null,
          relevance: result.evaluation.candidate?.relevance ?? null,
          policyVersion: result.evaluation.policyVersion,
        },
        occurredAt,
      });
    }
    sendJson(response, result.outcome === 'evaluated' ? 201 : 200, result);
  } catch (error: unknown) {
    sendInitiativeError(response, error);
  }
}

function initiativeActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.initiative) {
    sendJson(response, 503, { error: 'initiative_unavailable' });
    return undefined;
  }
  return actorId;
}

function sendInitiativeError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof InitiativeValidationError) {
    sendJson(response, 400, { error: 'invalid_initiative_request' });
    return;
  }
  if (error instanceof InitiativePermissionError) {
    sendJson(response, 403, { error: 'initiative_permission_denied' });
    return;
  }
  if (error instanceof InitiativeConflictError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  sendJson(response, 500, { error: 'initiative_failed' });
}

function isInitiativeMode(value: unknown): value is InitiativeMode {
  return value === 'reactive' || value === 'balanced' || value === 'proactive';
}

async function handleRelationshipSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = relationshipActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.relationships?.snapshot(actorId, now(dependencies));
    if (!snapshot) throw new Error('Relationship workspace disappeared.');
    sendJson(response, 200, serializeRelationshipSnapshot(snapshot));
  } catch (error: unknown) {
    sendRelationshipError(response, error);
  }
}

async function handleStakeholderCreate(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = relationshipActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const label = body['label'];
    const group = body['group'];
    const outcome = body['outcome'];
    const priority = body['priority'];
    const strength = body['strength'];
    const boundary = body['boundary'];
    const contextNote = body['contextNote'];
    const lastInteractionAt = body['lastInteractionAt'];
    const consentConfirmed = body['consentConfirmed'];
    if (
      typeof requestId !== 'string' || typeof label !== 'string' ||
      !isStakeholderGroup(group) || typeof outcome !== 'string' ||
      !isStakeholderPriority(priority) || !isRelationshipStrength(strength) ||
      !isRelationshipBoundary(boundary) || typeof contextNote !== 'string' ||
      (lastInteractionAt !== null && typeof lastInteractionAt !== 'string') ||
      typeof consentConfirmed !== 'boolean'
    ) {
      sendJson(response, 400, { error: 'invalid_relationship_input' });
      return;
    }
    const result = await dependencies.relationships?.create({
      actorId,
      requestId,
      label,
      group,
      outcome,
      priority,
      strength,
      boundary,
      contextNote,
      lastInteractionAt: lastInteractionAt === null ? null : new Date(lastInteractionAt),
      consentConfirmed,
      occurredAt: now(dependencies),
    });
    if (!result) throw new Error('Relationship workspace disappeared.');
    if (result.outcome === 'applied') {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `relationship.record:${requestId}`,
        eventType: 'relationship.stakeholder_recorded',
        resourceType: 'stakeholder',
        resourceId: result.record.stakeholderId,
        purpose: 'relationship_planning',
        decision: 'recorded',
        metadata: { policyVersion: 'relationship-intelligence-v1', contactDetailsStored: false },
        occurredAt: result.record.createdAt,
      });
    }
    sendJson(response, result.outcome === 'applied' ? 201 : 200, {
      outcome: result.outcome,
      persistence: result.persistence,
      record: serializeStakeholderRecord(result.record),
    });
  } catch (error: unknown) {
    sendRelationshipError(response, error);
  }
}

async function handleStakeholderDelete(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  stakeholderId: string,
): Promise<void> {
  const actorId = relationshipActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    if (typeof requestId !== 'string') {
      sendJson(response, 400, { error: 'invalid_relationship_delete' });
      return;
    }
    const occurredAt = now(dependencies);
    const result = await dependencies.relationships?.delete({ actorId, requestId, stakeholderId, occurredAt });
    if (!result) throw new Error('Relationship workspace disappeared.');
    if (result.outcome === 'deleted') {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `relationship.delete:${requestId}`,
        eventType: 'relationship.stakeholder_deleted',
        resourceType: 'stakeholder',
        resourceId: stakeholderId,
        purpose: 'relationship_planning',
        decision: 'deleted',
        metadata: { hardDelete: true },
        occurredAt,
      });
    }
    sendJson(response, 200, result);
  } catch (error: unknown) {
    sendRelationshipError(response, error);
  }
}

function relationshipActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.relationships) {
    sendJson(response, 503, { error: 'relationships_unavailable' });
    return undefined;
  }
  return actorId;
}

function serializeRelationshipSnapshot(snapshot: RelationshipWorkspaceSnapshot): Record<string, unknown> {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    persistence: snapshot.persistence,
    policyVersion: snapshot.policyVersion,
    summary: snapshot.summary,
    groups: snapshot.groups,
    stakeholders: snapshot.stakeholders.map((record) => ({
      ...serializeStakeholderRecord(record),
      recency: record.recency,
      attention: record.attention,
      rationale: record.rationale,
      privacy: record.privacy,
    })),
  };
}

function serializeStakeholderRecord(record: StakeholderRecord): Record<string, unknown> {
  return {
    stakeholderId: record.stakeholderId,
    requestId: record.requestId,
    label: record.label,
    group: record.group,
    outcome: record.outcome,
    priority: record.priority,
    strength: record.strength,
    boundary: record.boundary,
    contextNote: record.contextNote,
    lastInteractionAt: record.lastInteractionAt?.toISOString() ?? null,
    consentConfirmedAt: record.consentConfirmedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

function sendRelationshipError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof RelationshipValidationError) {
    sendJson(response, 400, { error: 'invalid_relationship_request' });
    return;
  }
  if (error instanceof RelationshipPermissionError) {
    sendJson(response, 403, { error: 'relationship_permission_denied' });
    return;
  }
  if (error instanceof RelationshipNotFoundError) {
    sendJson(response, 404, { error: 'stakeholder_not_found' });
    return;
  }
  if (error instanceof RelationshipConflictError) {
    sendJson(response, 409, { error: 'relationship_conflict' });
    return;
  }
  sendJson(response, 500, { error: 'relationship_failed' });
}

function isStakeholderGroup(value: unknown): value is StakeholderGroup {
  return stakeholderGroups.includes(value as StakeholderGroup);
}

function isStakeholderPriority(value: unknown): value is StakeholderPriority {
  return stakeholderPriorities.includes(value as StakeholderPriority);
}

function isRelationshipStrength(value: unknown): value is RelationshipStrength {
  return relationshipStrengths.includes(value as RelationshipStrength);
}

function isRelationshipBoundary(value: unknown): value is RelationshipBoundary {
  return relationshipBoundaries.includes(value as RelationshipBoundary);
}

async function handlePerceptionSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = perceptionActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.perception?.snapshot(actorId, now(dependencies));
    if (!snapshot) throw new Error('Perception workspace disappeared.');
    sendJson(response, 200, serializePerceptionSnapshot(snapshot));
  } catch (error: unknown) {
    sendPerceptionError(response, error);
  }
}

async function handlePerceptionSignalCreate(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = perceptionActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const dimension = body['dimension'];
    const perspective = body['perspective'];
    const stage = body['stage'];
    const summary = body['summary'];
    const evidenceNote = body['evidenceNote'];
    const sourceKind = body['sourceKind'];
    const confidence = body['confidence'];
    const observedAt = body['observedAt'];
    const consentConfirmed = body['consentConfirmed'];
    if (
      typeof requestId !== 'string' || !isPerceptionDimension(dimension) ||
      !isPerceptionPerspective(perspective) || !isPerceptionStage(stage) ||
      typeof summary !== 'string' || typeof evidenceNote !== 'string' ||
      !isPerceptionSourceKind(sourceKind) || !isPerceptionConfidence(confidence) ||
      typeof observedAt !== 'string' || typeof consentConfirmed !== 'boolean'
    ) {
      sendJson(response, 400, { error: 'invalid_perception_input' });
      return;
    }
    const result = await dependencies.perception?.create({
      actorId,
      requestId,
      dimension,
      perspective,
      stage,
      summary,
      evidenceNote,
      sourceKind,
      confidence,
      observedAt: new Date(observedAt),
      consentConfirmed,
      occurredAt: now(dependencies),
    });
    if (!result) throw new Error('Perception workspace disappeared.');
    if (result.outcome === 'applied') {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `perception.record:${requestId}`,
        eventType: 'perception.signal_recorded',
        resourceType: 'perception_signal',
        resourceId: result.record.signalId,
        purpose: 'perception_analysis',
        decision: 'recorded',
        metadata: { policyVersion: 'perception-engine-v1', sourceIdentityStored: false },
        occurredAt: result.record.createdAt,
      });
    }
    sendJson(response, result.outcome === 'applied' ? 201 : 200, {
      outcome: result.outcome,
      persistence: result.persistence,
      record: serializePerceptionSignal(result.record),
    });
  } catch (error: unknown) {
    sendPerceptionError(response, error);
  }
}

async function handlePerceptionSignalDelete(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  signalId: string,
): Promise<void> {
  const actorId = perceptionActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    if (typeof requestId !== 'string') {
      sendJson(response, 400, { error: 'invalid_perception_delete' });
      return;
    }
    const occurredAt = now(dependencies);
    const result = await dependencies.perception?.delete({ actorId, requestId, signalId, occurredAt });
    if (!result) throw new Error('Perception workspace disappeared.');
    if (result.outcome === 'deleted') {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `perception.delete:${requestId}`,
        eventType: 'perception.signal_deleted',
        resourceType: 'perception_signal',
        resourceId: signalId,
        purpose: 'perception_analysis',
        decision: 'deleted',
        metadata: { hardDelete: true },
        occurredAt,
      });
    }
    sendJson(response, 200, result);
  } catch (error: unknown) {
    sendPerceptionError(response, error);
  }
}

function perceptionActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.perception) {
    sendJson(response, 503, { error: 'perception_unavailable' });
    return undefined;
  }
  return actorId;
}

function serializePerceptionSnapshot(snapshot: PerceptionWorkspaceSnapshot): Record<string, unknown> {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    persistence: snapshot.persistence,
    policyVersion: snapshot.policyVersion,
    summary: snapshot.summary,
    dimensions: snapshot.dimensions,
    signals: snapshot.signals.map((signal) => ({
      ...serializePerceptionSignal(signal),
      epistemicType: signal.epistemicType,
      privacy: signal.privacy,
    })),
  };
}

function serializePerceptionSignal(record: PerceptionSignalRecord): Record<string, unknown> {
  return {
    signalId: record.signalId,
    requestId: record.requestId,
    dimension: record.dimension,
    perspective: record.perspective,
    stage: record.stage,
    summary: record.summary,
    evidenceNote: record.evidenceNote,
    sourceKind: record.sourceKind,
    confidence: record.confidence,
    observedAt: record.observedAt.toISOString(),
    consentConfirmedAt: record.consentConfirmedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

function sendPerceptionError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof PerceptionValidationError) {
    sendJson(response, 400, { error: 'invalid_perception_request' });
    return;
  }
  if (error instanceof PerceptionPermissionError) {
    sendJson(response, 403, { error: 'perception_permission_denied' });
    return;
  }
  if (error instanceof PerceptionNotFoundError) {
    sendJson(response, 404, { error: 'perception_signal_not_found' });
    return;
  }
  if (error instanceof PerceptionConflictError) {
    sendJson(response, 409, { error: 'perception_conflict' });
    return;
  }
  sendJson(response, 500, { error: 'perception_failed' });
}

function isPerceptionDimension(value: unknown): value is PerceptionDimension {
  return perceptionDimensions.includes(value as PerceptionDimension);
}

function isPerceptionPerspective(value: unknown): value is PerceptionPerspective {
  return perceptionPerspectives.includes(value as PerceptionPerspective);
}

function isPerceptionStage(value: unknown): value is PerceptionStage {
  return perceptionStages.includes(value as PerceptionStage);
}

function isPerceptionSourceKind(value: unknown): value is PerceptionSourceKind {
  return perceptionSourceKinds.includes(value as PerceptionSourceKind);
}

function isPerceptionConfidence(value: unknown): value is PerceptionConfidence {
  return perceptionConfidences.includes(value as PerceptionConfidence);
}

async function handleExpressionSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = expressionActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.expression?.snapshot(actorId, now(dependencies));
    if (!snapshot) throw new Error('Expression service disappeared.');
    sendJson(response, 200, serializeExpressionSnapshot(snapshot));
  } catch (error: unknown) {
    sendExpressionError(response, error);
  }
}

async function handleExpressionReview(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = expressionActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const content = body['content'];
    const assetRefs = body['assetRefs'];
    if (typeof content !== 'string' || !Array.isArray(assetRefs) || assetRefs.some((ref) => typeof ref !== 'string')) {
      sendJson(response, 400, { error: 'invalid_expression_input' });
      return;
    }
    const review = await dependencies.expression?.review({
      actorId,
      content,
      assetRefs,
      reviewedAt: now(dependencies),
    });
    if (!review) throw new Error('Expression service disappeared.');
    sendJson(response, 200, serializeExpressionReview(review));
  } catch (error: unknown) {
    sendExpressionError(response, error);
  }
}

function expressionActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.expression) {
    sendJson(response, 503, { error: 'expression_unavailable' });
    return undefined;
  }
  return actorId;
}

function serializeExpressionSnapshot(snapshot: AuthenticExpressionSnapshot): Record<string, unknown> {
  return { ...snapshot, generatedAt: snapshot.generatedAt.toISOString() };
}

function serializeExpressionReview(review: AuthenticExpressionReview): Record<string, unknown> {
  return { ...review, reviewedAt: review.reviewedAt.toISOString() };
}

function sendExpressionError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof AuthenticExpressionValidationError) {
    sendJson(response, 400, { error: 'invalid_expression_request' });
    return;
  }
  if (error instanceof AuthenticExpressionPermissionError) {
    sendJson(response, 403, { error: 'expression_permission_denied' });
    return;
  }
  sendJson(response, 500, { error: 'expression_failed' });
}

async function handleOpportunityRadar(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.opportunities) {
    sendJson(response, 503, { error: 'opportunity_radar_unavailable' });
    return;
  }
  try {
    const snapshot = await dependencies.opportunities.snapshot(actorId, now(dependencies));
    sendJson(response, 200, serializeOpportunityRadar(snapshot));
  } catch (error: unknown) {
    if (error instanceof OpportunityRadarValidationError) {
      sendJson(response, 400, { error: 'invalid_opportunity_radar_request' });
      return;
    }
    if (error instanceof OpportunityRadarPermissionError) {
      sendJson(response, 403, { error: 'opportunity_radar_permission_denied' });
      return;
    }
    sendJson(response, 500, { error: 'opportunity_radar_failed' });
  }
}

function serializeOpportunityRadar(snapshot: OpportunityRadarSnapshot): Record<string, unknown> {
  return { ...snapshot, generatedAt: snapshot.generatedAt.toISOString() };
}

async function handleRiskSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = riskActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const generatedAt = now(dependencies);
    const workbench = await dependencies.workbench?.snapshot();
    if (!workbench) throw new Error('Workbench disappeared during risk assessment.');
    const claims = dependencies.claims
      ? await dependencies.claims.snapshot(actorId, generatedAt)
      : null;
    const snapshot = await dependencies.risk?.snapshot(actorId, workbench.actions, claims, generatedAt);
    if (!snapshot) throw new Error('Brand protection disappeared.');
    sendJson(response, 200, serializeRiskSnapshot(snapshot));
  } catch (error: unknown) {
    sendRiskError(response, error);
  }
}

async function handleRiskReview(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  actionId: string,
): Promise<void> {
  const actorId = riskActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const expectedLevel = body['expectedLevel'];
    const expectedAssessmentHash = body['expectedAssessmentHash'];
    const decision = body['decision'];
    const rationale = body['rationale'];
    const humanAttestation = body['humanAttestation'];
    if (
      typeof requestId !== 'string' || !isRiskLevel(expectedLevel) ||
      typeof expectedAssessmentHash !== 'string' || !/^[0-9a-f]{64}$/u.test(expectedAssessmentHash) ||
      !isRiskDecision(decision) || typeof rationale !== 'string' ||
      typeof humanAttestation !== 'boolean'
    ) {
      sendJson(response, 400, { error: 'invalid_risk_review' });
      return;
    }
    const workbench = await dependencies.workbench?.snapshot();
    const action = workbench?.actions.find((candidate) => candidate.id === actionId);
    if (!action) throw new BrandProtectionNotFoundError('Action not found for risk review.');
    const result = await dependencies.risk?.review({
      actorId,
      action,
      requestId,
      expectedLevel,
      expectedAssessmentHash,
      decision,
      rationale,
      humanAttestation,
      reviewedAt: now(dependencies),
    });
    if (!result) throw new Error('Brand protection disappeared.');
    if (result.outcome === 'applied') {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `risk.review:${requestId}`,
        eventType: 'risk.reviewed',
        resourceType: 'action',
        resourceId: actionId,
        purpose: 'strategy_reasoning',
        decision,
        metadata: {
          assessmentHash: result.review.assessmentHash,
          expectedLevel: result.review.expectedLevel,
          policyVersion: 'brand-protection-v1',
        },
        occurredAt: result.review.reviewedAt,
      });
    }
    sendJson(response, result.outcome === 'applied' ? 201 : 200, {
      outcome: result.outcome,
      persistence: result.persistence,
      review: {
        reviewId: result.review.reviewId,
        requestId: result.review.requestId,
        actionId: result.review.actionId,
        assessmentHash: result.review.assessmentHash,
        expectedLevel: result.review.expectedLevel,
        decision: result.review.decision,
        rationale: result.review.rationale,
        reviewedAt: result.review.reviewedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    sendRiskError(response, error);
  }
}

function riskActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.risk || !dependencies.workbench) {
    sendJson(response, 503, { error: 'risk_unavailable' });
    return undefined;
  }
  return actorId;
}

function serializeRiskSnapshot(snapshot: BrandProtectionSnapshot): Record<string, unknown> {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    persistence: snapshot.persistence,
    policyVersion: snapshot.policyVersion,
    summary: snapshot.summary,
    claimPosture: snapshot.claimPosture,
    assessments: snapshot.assessments.map((assessment) => ({
      ...assessment,
      ...(assessment.lastReview ? {
        lastReview: {
          ...assessment.lastReview,
          reviewedAt: assessment.lastReview.reviewedAt.toISOString(),
        },
      } : {}),
    })),
  };
}

function sendRiskError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof BrandProtectionValidationError) {
    sendJson(response, 400, { error: 'invalid_risk_review' });
    return;
  }
  if (error instanceof BrandProtectionPermissionError) {
    sendJson(response, 403, { error: 'risk_permission_denied' });
    return;
  }
  if (error instanceof BrandProtectionNotFoundError) {
    sendJson(response, 404, { error: 'risk_action_not_found' });
    return;
  }
  if (error instanceof BrandProtectionConflictError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  if (error instanceof BrandProtectionBlockedError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  sendJson(response, 500, { error: 'risk_failed' });
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === 'green' || value === 'yellow' || value === 'red';
}

function isRiskDecision(value: unknown): value is RiskReviewDecision {
  return value === 'acknowledge' || value === 'hold' || value === 'escalate';
}

async function handleAuditTrail(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = accountActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.auditTrail?.snapshot(actorId, now(dependencies));
    if (!snapshot) throw new Error('Audit trail disappeared.');
    sendJson(response, 200, serializeAuditTrail(snapshot));
  } catch (error: unknown) {
    sendAccountError(response, error);
  }
}

async function handleAccountExport(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = accountActor(request, response, dependencies);
  if (!actorId) return;
  if (
    !dependencies.workbench || !dependencies.strategy || !dependencies.drafts ||
    !dependencies.learning || !dependencies.conversation || !dependencies.assets ||
    !dependencies.tenantId
  ) {
    sendJson(response, 503, { error: 'account_export_unavailable' });
    return;
  }
  const exportedAt = now(dependencies);
  try {
    const [workbench, strategy, draft, feedback, memory, assets, research, claims, arbitration, initiative, relationships, perception, activity] = await Promise.all([
      dependencies.workbench.snapshot(),
      dependencies.strategy.snapshot(actorId),
      dependencies.drafts.snapshot(actorId, exportedAt),
      dependencies.learning.snapshot(actorId, exportedAt),
      dependencies.conversation.memorySnapshot({
        tenantId: dependencies.tenantId,
        actorId,
        generatedAt: exportedAt,
      }),
      dependencies.assets.snapshot(actorId, exportedAt),
      dependencies.research?.snapshot(actorId, exportedAt) ?? Promise.resolve(null),
      dependencies.claims?.snapshot(actorId, exportedAt) ?? Promise.resolve(null),
      dependencies.arbitration?.snapshot(actorId, exportedAt) ?? Promise.resolve(null),
      dependencies.initiative?.snapshot(actorId, exportedAt) ?? Promise.resolve(null),
      dependencies.relationships?.snapshot(actorId, exportedAt) ?? Promise.resolve(null),
      dependencies.perception?.snapshot(actorId, exportedAt) ?? Promise.resolve(null),
      dependencies.auditTrail?.snapshot(actorId, exportedAt),
    ]);
    if (!activity) throw new Error('Audit trail disappeared.');
    const risk = dependencies.risk
      ? await dependencies.risk.snapshot(actorId, workbench.actions, claims, exportedAt)
      : null;
    await dependencies.auditTrail?.record({
      actorId,
      requestId: `account.export:${crypto.randomUUID()}`,
      eventType: 'account.data_exported',
      resourceType: 'account',
      resourceId: 'owner_portable_data',
      purpose: 'personal_understanding',
      decision: 'exported',
      metadata: { schemaVersion: 1, consistency: 'best_effort_snapshot' },
      occurredAt: exportedAt,
    });
    sendJsonDownload(
      response,
      `pr-personal-data-${exportedAt.toISOString().slice(0, 10)}.json`,
      {
        schemaVersion: 1,
        exportedAt: exportedAt.toISOString(),
        scope: 'owner_portable_data',
        consistency: 'best_effort_snapshot',
        data: {
          workbench,
          strategy: serializeStrategy(strategy),
          memory: serializeMemorySnapshot(memory),
          assets: serializeTextAssetSnapshot(assets),
          research: research ? serializeResearchSnapshot(research) : null,
          claims: claims ? serializeClaimSnapshot(claims) : null,
          risk: risk ? serializeRiskSnapshot(risk) : null,
          arbitration,
          initiative,
          relationships: relationships ? serializeRelationshipSnapshot(relationships) : null,
          perception: perception ? serializePerceptionSnapshot(perception) : null,
          draft: draft ? serializeDraft(draft) : null,
          feedback: serializeFeedback(feedback),
          activity: serializeAuditTrail(activity),
        },
      },
    );
  } catch (error: unknown) {
    sendAccountError(response, error);
  }
}

async function handleOnboardingSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.assets || !dependencies.conversation || !dependencies.tenantId) {
    sendJson(response, 503, { error: 'onboarding_unavailable' });
    return;
  }
  const generatedAt = now(dependencies);
  try {
    const [assets, memory] = await Promise.all([
      dependencies.assets.snapshot(actorId, generatedAt),
      dependencies.conversation.memorySnapshot({
        tenantId: dependencies.tenantId,
        actorId,
        generatedAt,
      }),
    ]);
    const context = calculateOwnerEvidenceContext(assets, memory, generatedAt);
    sendJson(response, 200, {
      generatedAt: generatedAt.toISOString(),
      persistence: assets.persistence === memory.persistence ? assets.persistence : 'mixed',
      modelMaturity: context.maturity,
      strategyReadiness: {
        ready: context.strategy.evidenceIds.length > 0,
        evidenceCount: context.strategy.evidenceIds.length,
        withheldEvidenceCount: context.strategy.withheldEvidenceCount,
        sourceTypes: context.strategy.sourceTypes,
      },
      assets: serializeTextAssetSnapshot(assets),
    });
  } catch (error: unknown) {
    sendTextAssetError(response, error);
  }
}

async function handleTextAssetImport(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.assets) {
    sendJson(response, 503, { error: 'asset_intake_unavailable' });
    return;
  }
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const title = body['title'];
    const content = body['content'];
    const assertionText = body['assertionText'];
    const occurredAtValue = body['occurredAt'];
    const permissions = body['permissions'];
    if (
      typeof requestId !== 'string' || typeof title !== 'string' ||
      typeof content !== 'string' || typeof assertionText !== 'string' ||
      typeof occurredAtValue !== 'string' || !isTextAssetPermissions(permissions)
    ) {
      sendJson(response, 400, { error: 'invalid_text_asset' });
      return;
    }
    const importedAt = now(dependencies);
    const result = await dependencies.assets.importText({
      actorId,
      requestId,
      title,
      content,
      assertionText,
      occurredAt: new Date(occurredAtValue),
      importedAt,
      permissions,
    });
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `asset.import:${requestId}`,
      eventType: 'asset.text_imported',
      resourceType: 'asset',
      resourceId: result.record.assetId,
      purpose: 'personal_understanding',
      decision: 'approved',
      metadata: {
        requestId,
        evidenceId: result.record.evidenceId,
        assertionId: result.record.assertionId,
        sourceType: result.record.sourceType,
        brandUsage: result.record.permissions.brandUsage,
      },
      occurredAt: importedAt,
    });
    sendJson(response, result.outcome === 'applied' ? 201 : 200, {
      outcome: result.outcome,
      persistence: result.persistence,
      record: serializeTextAssetRecord(result.record),
    });
  } catch (error: unknown) {
    sendTextAssetError(response, error);
  }
}

async function handleTextAssetRight(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  assetId: string,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.assets) {
    sendJson(response, 503, { error: 'asset_intake_unavailable' });
    return;
  }
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const operation = body['operation'];
    const reason = body['reason'];
    if (
      typeof requestId !== 'string' || !isTextAssetRightOperation(operation) ||
      typeof reason !== 'string'
    ) {
      sendJson(response, 400, { error: 'invalid_asset_right' });
      return;
    }
    const occurredAt = now(dependencies);
    const result = await dependencies.assets.applyRight({
      actorId,
      requestId,
      assetId,
      operation,
      reason,
      occurredAt,
    });
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `asset.right:${requestId}`,
      eventType: `asset.${operation}`,
      resourceType: 'asset',
      resourceId: assetId,
      purpose: 'personal_understanding',
      decision: operation,
      metadata: { requestId, operation, reason, deleted: result.deleted },
      occurredAt,
    });
    sendJson(response, 200, {
      ...result,
      occurredAt: result.occurredAt.toISOString(),
    });
  } catch (error: unknown) {
    sendTextAssetError(response, error);
  }
}

function serializeTextAssetSnapshot(snapshot: TextAssetSnapshot): Record<string, unknown> {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    persistence: snapshot.persistence,
    summary: snapshot.summary,
    records: snapshot.records.map(serializeTextAssetRecord),
  };
}

function serializeTextAssetRecord(record: TextAssetSnapshot['records'][number]): Record<string, unknown> {
  return {
    ...record,
    occurredAt: record.occurredAt.toISOString(),
    importedAt: record.importedAt.toISOString(),
  };
}

function isTextAssetPermissions(value: unknown): value is Readonly<{
  personalUnderstanding: true;
  brandUsage: boolean;
}> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record['personalUnderstanding'] === true && typeof record['brandUsage'] === 'boolean';
}

function isTextAssetRightOperation(value: unknown): value is TextAssetRightOperation {
  return value === 'revoke_brand_usage' || value === 'delete';
}

function sendTextAssetError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof TextAssetValidationError) {
    sendJson(response, 400, {
      error: error instanceof InvalidJsonBodyError ? error.code : 'invalid_text_asset',
    });
    return;
  }
  if (error instanceof TextAssetPermissionError) {
    sendJson(response, 403, { error: 'asset_permission_denied' });
    return;
  }
  if (error instanceof TextAssetConflictError) {
    sendJson(response, 409, { error: 'asset_import_conflict' });
    return;
  }
  if (error instanceof TextAssetNotFoundError) {
    sendJson(response, 404, { error: 'asset_not_found' });
    return;
  }
  if (
    error instanceof MemoryProposalPermissionError ||
    error instanceof ConversationValidationError
  ) {
    sendConversationError(response, error);
    return;
  }
  sendJson(response, 500, { error: 'asset_intake_failed' });
}

function accountActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.auditTrail) {
    sendJson(response, 503, { error: 'audit_trail_unavailable' });
    return undefined;
  }
  return actorId;
}

function serializeAuditTrail(snapshot: AuditTrailSnapshot): Record<string, unknown> {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    persistence: snapshot.persistence,
    summary: snapshot.summary,
    events: snapshot.events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      resourceType: event.resourceType,
      ...(event.resourceId ? { resourceId: event.resourceId } : {}),
      ...(event.purpose ? { purpose: event.purpose } : {}),
      ...(event.decision ? { decision: event.decision } : {}),
      metadata: event.metadata,
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}

function sendAccountError(response: ServerResponse, error: unknown): void {
  if (error instanceof AuditTrailPermissionError) {
    sendJson(response, 403, { error: 'account_permission_denied' });
    return;
  }
  if (error instanceof AuditTrailValidationError) {
    sendJson(response, 400, { error: 'invalid_audit_event' });
    return;
  }
  sendJson(response, 500, { error: 'account_data_failed' });
}

function sendFeedbackError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof FeedbackValidationError) {
    sendJson(response, 400, { error: error instanceof InvalidJsonBodyError ? error.code : 'invalid_feedback_input' });
    return;
  }
  if (error instanceof FeedbackPermissionError) {
    sendJson(response, 403, { error: 'feedback_permission_denied' });
    return;
  }
  if (error instanceof FeedbackNotFoundError) {
    sendJson(response, 404, { error: 'preference_not_found' });
    return;
  }
  if (error instanceof FeedbackConflictError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  sendJson(response, 500, { error: 'feedback_failed' });
}

function isPreferenceDecision(value: unknown): value is PreferenceDecision {
  return value === 'applied' || value === 'rejected' || value === 'revoked';
}

function now(dependencies: ApplicationDependencies): Date {
  return (dependencies.clock ?? (() => new Date()))();
}

async function recordMutationAudit(
  dependencies: ApplicationDependencies,
  event: Omit<RecordAuditEvent, 'tenantId'>,
): Promise<void> {
  await dependencies.mutationAuditTrail?.record(event);
}

async function handleDraftSnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = draftActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.drafts?.snapshot(
      actorId,
      (dependencies.clock ?? (() => new Date()))(),
    );
    sendJson(response, 200, snapshot ? serializeDraft(snapshot) : null);
  } catch (error: unknown) {
    sendDraftError(response, error);
  }
}

async function handleDraftSources(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = draftActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const snapshot = await dependencies.drafts?.sources(actorId, now(dependencies));
    if (!snapshot) throw new Error('Draft service disappeared.');
    sendJson(response, 200, {
      ...snapshot,
      generatedAt: snapshot.generatedAt.toISOString(),
    });
  } catch (error: unknown) {
    sendDraftError(response, error);
  }
}

async function handleDraftCreate(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = draftActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const sourceKind = body['sourceKind'];
    const sourceRef = body['sourceRef'];
    const channel = body['channel'];
    const narrativeAngle = body['narrativeAngle'];
    const takeaway = body['takeaway'];
    const publicDraftingConsent = body['publicDraftingConsent'];
    if (
      typeof requestId !== 'string' || !isDraftSourceKind(sourceKind) ||
      typeof sourceRef !== 'string' ||
      !isDraftChannel(channel) || typeof narrativeAngle !== 'string' ||
      typeof takeaway !== 'string' || typeof publicDraftingConsent !== 'boolean'
    ) {
      sendJson(response, 400, { error: 'invalid_draft_input' });
      return;
    }
    const occurredAt = now(dependencies);
    const result = await dependencies.drafts?.create({
      actorId,
      requestId,
      sourceKind,
      sourceRef,
      channel,
      narrativeAngle,
      takeaway,
      publicDraftingConsent,
      occurredAt,
    });
    if (!result) throw new Error('Draft service disappeared.');
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `draft.create:${requestId}`,
      eventType: 'draft.created',
      resourceType: 'draft',
      resourceId: result.snapshot.draftId,
      purpose: 'public_drafting',
      decision: result.snapshot.guard.classification,
      metadata: { requestId, revision: result.snapshot.revision, channel: result.snapshot.channel },
      occurredAt,
    });
    sendJson(response, 200, { outcome: result.outcome, ...serializeDraft(result.snapshot) });
  } catch (error: unknown) {
    sendDraftError(response, error);
  }
}

async function handleDraftEdit(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  draftId: string,
): Promise<void> {
  const actorId = draftActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const expectedRevision = body['expectedRevision'];
    const draftBody = body['body'];
    if (typeof requestId !== 'string' || typeof expectedRevision !== 'number' || typeof draftBody !== 'string') {
      sendJson(response, 400, { error: 'invalid_draft_input' });
      return;
    }
    const occurredAt = now(dependencies);
    const result = await dependencies.drafts?.edit({
      actorId,
      requestId,
      draftId,
      expectedRevision,
      body: draftBody,
      occurredAt,
    });
    if (!result) throw new Error('Draft service disappeared.');
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `draft.edit:${requestId}`,
      eventType: 'draft.edited',
      resourceType: 'draft',
      resourceId: draftId,
      purpose: 'public_drafting',
      decision: result.snapshot.guard.classification,
      metadata: { requestId, revision: result.snapshot.revision },
      occurredAt,
    });
    sendJson(response, 200, { outcome: result.outcome, ...serializeDraft(result.snapshot) });
  } catch (error: unknown) {
    sendDraftError(response, error);
  }
}

async function handleDraftTransition(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  draftId: string,
  operation: 'approve' | 'export',
): Promise<void> {
  const actorId = draftActor(request, response, dependencies);
  if (!actorId) return;
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const expectedRevision = body['expectedRevision'];
    if (typeof requestId !== 'string' || typeof expectedRevision !== 'number') {
      sendJson(response, 400, { error: 'invalid_draft_input' });
      return;
    }
    const command = {
      actorId,
      requestId,
      draftId,
      expectedRevision,
      occurredAt: (dependencies.clock ?? (() => new Date()))(),
    };
    if (operation === 'approve') {
      const result = await dependencies.drafts?.approve(command);
      if (!result) throw new Error('Draft service disappeared.');
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `draft.approve:${requestId}`,
        eventType: 'draft.approved',
        resourceType: 'draft',
        resourceId: draftId,
        purpose: 'public_drafting',
        decision: 'approved',
        metadata: { requestId, revision: result.snapshot.revision },
        occurredAt: command.occurredAt,
      });
      sendJson(response, 200, { outcome: result.outcome, ...serializeDraft(result.snapshot) });
      return;
    }
    const result = await dependencies.drafts?.export(command);
    if (!result) throw new Error('Draft service disappeared.');
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `draft.export:${requestId}`,
      eventType: 'draft.exported',
      resourceType: 'draft',
      resourceId: draftId,
      purpose: 'public_drafting',
      decision: 'exported',
      metadata: { requestId, revision: result.snapshot.revision, channel: result.snapshot.channel },
      occurredAt: command.occurredAt,
    });
    sendJson(response, 200, {
      outcome: result.outcome,
      filename: result.filename,
      mimeType: result.mimeType,
      content: result.content,
      draft: serializeDraft(result.snapshot),
    });
  } catch (error: unknown) {
    sendDraftError(response, error);
  }
}

function draftActor(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): UserId | undefined {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return undefined;
  }
  if (!dependencies.drafts) {
    sendJson(response, 503, { error: 'drafts_unavailable' });
    return undefined;
  }
  return actorId;
}

function isDraftChannel(value: unknown): value is DraftChannel {
  return typeof value === 'string' && draftChannels.includes(value as DraftChannel);
}

function isDraftSourceKind(value: unknown): value is DraftSourceKind {
  return value === 'memory' || value === 'text_asset';
}

function serializeDraft(snapshot: DraftWorkspaceSnapshot): Record<string, unknown> {
  return {
    draftId: snapshot.draftId,
    claimId: snapshot.claimId,
    revision: snapshot.revision,
    strategyRevision: snapshot.strategyRevision,
    channel: snapshot.channel,
    body: snapshot.body,
    adaptation: snapshot.adaptation,
    status: snapshot.status,
    guard: snapshot.guard,
    source: snapshot.source,
    publicDraftingConsent: snapshot.publicDraftingConsent,
    sourceAvailable: snapshot.sourceAvailable,
    staleStrategy: snapshot.staleStrategy,
    ...(snapshot.approvedAt ? { approvedAt: snapshot.approvedAt.toISOString() } : {}),
    ...(snapshot.exportedAt ? { exportedAt: snapshot.exportedAt.toISOString() } : {}),
    updatedAt: snapshot.updatedAt.toISOString(),
    persistence: snapshot.persistence,
  };
}

function sendDraftError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof DraftValidationError) {
    sendJson(response, 400, {
      error: error instanceof InvalidJsonBodyError ? error.code : 'invalid_draft_input',
    });
    return;
  }
  if (error instanceof DraftPermissionError) {
    sendJson(response, 403, { error: 'draft_permission_denied' });
    return;
  }
  if (error instanceof DraftNotFoundError) {
    sendJson(response, 404, { error: 'draft_not_found' });
    return;
  }
  if (error instanceof DraftConflictError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  if (error instanceof DraftBlockedError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  sendJson(response, 500, { error: 'draft_failed' });
}

async function handleStrategySnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.strategy) {
    sendJson(response, 503, { error: 'strategy_unavailable' });
    return;
  }
  try {
    sendJson(response, 200, serializeStrategy(await dependencies.strategy.snapshot(actorId)));
  } catch (error: unknown) {
    sendStrategyError(response, error);
  }
}

async function handleStrategySave(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.strategy) {
    sendJson(response, 503, { error: 'strategy_unavailable' });
    return;
  }
  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const expectedRevision = body['expectedRevision'];
    const value = parseEditableStrategy(body['value']);
    if (typeof requestId !== 'string' || typeof expectedRevision !== 'number' || !value) {
      sendJson(response, 400, { error: 'invalid_strategy_context' });
      return;
    }
    const occurredAt = now(dependencies);
    const result = await dependencies.strategy.save({
      actorId,
      requestId,
      expectedRevision,
      value,
      occurredAt,
    });
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `strategy.save:${requestId}`,
      eventType: 'strategy.context_saved',
      resourceType: 'strategy_context',
      resourceId: result.snapshot.goalId,
      purpose: 'strategy_reasoning',
      decision: 'saved',
      metadata: { requestId, revision: result.snapshot.revision },
      occurredAt,
    });
    sendJson(response, 200, { outcome: result.outcome, ...serializeStrategy(result.snapshot) });
  } catch (error: unknown) {
    sendStrategyError(response, error);
  }
}

function parseEditableStrategy(value: unknown): EditableStrategyContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const goalValue = record['goal'];
  const positioningValue = record['desiredPositioning'];
  if (!goalValue || typeof goalValue !== 'object' || Array.isArray(goalValue)) return null;
  if (!positioningValue || typeof positioningValue !== 'object' || Array.isArray(positioningValue)) return null;
  const goal = goalValue as Record<string, unknown>;
  const positioning = positioningValue as Record<string, unknown>;
  if (
    typeof goal['title'] !== 'string' ||
    typeof goal['outcome'] !== 'string' ||
    typeof goal['priority'] !== 'number' ||
    ![1, 2, 3, 4, 5].includes(goal['priority']) ||
    !isStringArray(goal['successMetrics']) ||
    typeof goal['horizon'] !== 'string' ||
    typeof positioning['audience'] !== 'string' ||
    typeof positioning['desiredPerception'] !== 'string' ||
    typeof positioning['differentiation'] !== 'string' ||
    !isStringArray(positioning['proofPoints']) ||
    typeof positioning['horizon'] !== 'string'
  ) return null;
  return {
    goal: {
      title: goal['title'],
      outcome: goal['outcome'],
      priority: goal['priority'] as 1 | 2 | 3 | 4 | 5,
      successMetrics: goal['successMetrics'],
      horizon: goal['horizon'],
    },
    desiredPositioning: {
      audience: positioning['audience'],
      desiredPerception: positioning['desiredPerception'],
      differentiation: positioning['differentiation'],
      proofPoints: positioning['proofPoints'],
      horizon: positioning['horizon'],
    },
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function serializeStrategy(snapshot: StrategyContextSnapshot): Record<string, unknown> {
  return {
    revision: snapshot.revision,
    updatedAt: snapshot.updatedAt.toISOString(),
    persistence: snapshot.persistence,
    goalId: snapshot.goalId,
    positioningId: snapshot.positioningId,
    goal: snapshot.goal,
    desiredPositioning: snapshot.desiredPositioning,
  };
}

function sendStrategyError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof StrategyContextValidationError) {
    sendJson(response, 400, {
      error: error instanceof InvalidJsonBodyError ? error.code : 'invalid_strategy_context',
    });
    return;
  }
  if (error instanceof StrategyContextPermissionError) {
    sendJson(response, 403, { error: 'strategy_permission_denied' });
    return;
  }
  if (error instanceof StrategyContextConflictError) {
    sendJson(response, 409, { error: error.reason });
    return;
  }
  sendJson(response, 500, { error: 'strategy_failed' });
}

async function handleMemorySnapshot(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.conversation || !dependencies.tenantId) {
    sendJson(response, 503, { error: 'conversation_unavailable' });
    return;
  }
  try {
    const snapshot = await dependencies.conversation.memorySnapshot({
      tenantId: dependencies.tenantId,
      actorId,
      generatedAt: (dependencies.clock ?? (() => new Date()))(),
    });
    sendJson(response, 200, serializeMemorySnapshot(snapshot));
  } catch (error: unknown) {
    sendConversationError(response, error);
  }
}

function serializeMemorySnapshot(snapshot: PersonalMemorySnapshot): Record<string, unknown> {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    persistence: snapshot.persistence,
    summary: snapshot.summary,
    records: snapshot.records.map((record) => ({
        proposalId: record.proposalId,
        assertionId: record.assertionId,
        text: record.text,
        epistemicType: record.epistemicType,
        dataClass: record.dataClass,
        confidence: record.confidence,
        confidenceRationale: record.confidenceRationale,
        provenance: record.provenance,
        consent: record.consent,
        lifecycle: {
          status: record.lifecycle.status,
          revisionCount: record.lifecycle.revisionCount,
          confirmedAt: record.lifecycle.confirmedAt.toISOString(),
          updatedAt: record.lifecycle.updatedAt.toISOString(),
          ...(record.lifecycle.contestedAt
            ? { contestedAt: record.lifecycle.contestedAt.toISOString() }
            : {}),
          ...(record.lifecycle.contestReason
            ? { contestReason: record.lifecycle.contestReason }
            : {}),
          ...(record.lifecycle.revokedAt
            ? { revokedAt: record.lifecycle.revokedAt.toISOString() }
            : {}),
          ...(record.lifecycle.deletedAt
            ? { deletedAt: record.lifecycle.deletedAt.toISOString() }
            : {}),
          ...(record.lifecycle.deletionReason
            ? { deletionReason: record.lifecycle.deletionReason }
            : {}),
        },
      })),
  };
}

async function handleMemoryRight(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  proposalId: string,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.conversation || !dependencies.tenantId) {
    sendJson(response, 503, { error: 'conversation_unavailable' });
    return;
  }

  try {
    const body = await readJsonObject(request);
    const requestId = body['requestId'];
    const operation = body['operation'];
    const reason = body['reason'];
    const correctedText = body['correctedText'];
    if (
      typeof requestId !== 'string' ||
      !isMemoryRightKind(operation) ||
      typeof reason !== 'string' ||
      (operation === 'correct' && typeof correctedText !== 'string')
    ) {
      sendJson(response, 400, { error: 'invalid_memory_right' });
      return;
    }
    const occurredAt = now(dependencies);
    const applied = await dependencies.conversation.applyMemoryRight({
      tenantId: dependencies.tenantId,
      actorId,
      proposalId,
      requestId,
      operation: operation === 'correct'
        ? {
            kind: operation,
            reason,
            correctedText: typeof correctedText === 'string' ? correctedText : '',
          }
        : { kind: operation, reason },
      occurredAt,
    });
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `memory.right:${requestId}`,
      eventType: `memory.${operation}`,
      resourceType: 'memory_proposal',
      resourceId: proposalId,
      purpose: 'personal_understanding',
      decision: operation,
      metadata: { requestId, permissionsRevoked: applied.permissionsRevoked },
      occurredAt,
    });
    sendJson(response, 200, {
      outcome: applied.outcome,
      operation: applied.operation,
      proposalId: applied.proposalId,
      requestId: applied.requestId,
      ...(applied.activeAssertionId
        ? { activeAssertionId: applied.activeAssertionId }
        : {}),
      permissionsRevoked: applied.permissionsRevoked,
      occurredAt: applied.occurredAt.toISOString(),
      persistence: applied.persistence,
    });
  } catch (error: unknown) {
    sendConversationError(response, error);
  }
}

function isMemoryRightKind(
  value: unknown,
): value is 'correct' | 'contest' | 'delete' | 'revoke' {
  return value === 'correct' || value === 'contest' || value === 'delete' || value === 'revoke';
}

async function handleConversationTurn(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.conversation || !dependencies.tenantId) {
    sendJson(response, 503, { error: 'conversation_unavailable' });
    return;
  }

  try {
    const body = await readJsonObject(request);
    const conversationId = body['conversationId'];
    const turnId = body['turnId'];
    const text = body['text'];
    const proposeMemory = body['proposeMemory'];
    if (
      typeof conversationId !== 'string' ||
      typeof turnId !== 'string' ||
      typeof text !== 'string' ||
      typeof proposeMemory !== 'boolean'
    ) {
      sendJson(response, 400, { error: 'invalid_conversation_turn' });
      return;
    }
    const occurredAt = now(dependencies);
    const result = await dependencies.conversation.submitTurn({
      tenantId: dependencies.tenantId,
      actorId,
      conversationId,
      turnId,
      text,
      proposeMemory,
      occurredAt,
    });
    if (result.memoryProposal) {
      await recordMutationAudit(dependencies, {
        actorId,
        requestId: `memory.proposal:${turnId}`,
        eventType: 'memory.proposal_created',
        resourceType: 'memory_proposal',
        resourceId: result.memoryProposal.id,
        purpose: 'personal_understanding',
        decision: 'awaiting_confirmation',
        metadata: { conversationId, turnId },
        occurredAt,
      });
    }
    sendJson(response, 200, {
      assistantMessage: result.assistantMessage,
      followUpQuestion: result.followUpQuestion,
      orchestration: result.orchestration,
      ...(result.memoryProposal
        ? {
            memoryProposal: {
              id: result.memoryProposal.id,
              epistemicType: result.memoryProposal.epistemicType,
              dataClass: result.memoryProposal.dataClass,
              status: result.memoryProposal.status,
              occurredAt: result.memoryProposal.occurredAt.toISOString(),
            },
          }
        : {}),
    });
  } catch (error: unknown) {
    sendConversationError(response, error);
  }
}

async function handleMemoryConfirmation(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
  proposalId: string,
): Promise<void> {
  const actorId = dependencies.resolveActor?.(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }
  if (!dependencies.conversation || !dependencies.tenantId) {
    sendJson(response, 503, { error: 'conversation_unavailable' });
    return;
  }

  try {
    const body = await readJsonObject(request);
    const permissions = body['permissions'];
    if (!isBooleanPermissionObject(permissions)) {
      sendJson(response, 400, { error: 'invalid_memory_permissions' });
      return;
    }
    const confirmedAt = now(dependencies);
    const confirmed = await dependencies.conversation.confirmMemory({
      tenantId: dependencies.tenantId,
      actorId,
      proposalId,
      permissions,
      confirmedAt,
    });
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `memory.confirm:${proposalId}`,
      eventType: 'memory.proposal_confirmed',
      resourceType: 'assertion',
      resourceId: confirmed.assertion.id,
      purpose: 'personal_understanding',
      decision: 'confirmed',
      metadata: { proposalId, permissions: confirmed.permissions },
      occurredAt: confirmedAt,
    });
    sendJson(response, 200, {
      assertion: {
        id: confirmed.assertion.id,
        epistemicType: confirmed.assertion.epistemicType,
        dataClass: confirmed.assertion.dataClass,
      },
      permissions: confirmed.permissions,
      confirmedAt: confirmed.confirmedAt.toISOString(),
      persistence: confirmed.persistence,
    });
  } catch (error: unknown) {
    sendConversationError(response, error);
  }
}

function sendConversationError(response: ServerResponse, error: unknown): void {
  if (error instanceof InvalidJsonBodyError || error instanceof ConversationValidationError) {
    sendJson(response, 400, {
      error: error instanceof InvalidJsonBodyError ? error.code : 'invalid_conversation_input',
    });
    return;
  }
  if (error instanceof MemoryProposalNotFoundError) {
    sendJson(response, 404, { error: 'memory_proposal_not_found' });
    return;
  }
  if (error instanceof MemoryProposalPermissionError) {
    sendJson(response, 403, { error: 'memory_permission_denied' });
    return;
  }
  if (error instanceof MemoryProposalConflictError) {
    sendJson(response, 409, { error: 'memory_proposal_conflict' });
    return;
  }
  sendJson(response, 500, { error: 'conversation_failed' });
}

function isBooleanPermissionObject(value: unknown): value is Readonly<{
  personalUnderstanding: boolean;
  brandUsage: boolean;
  publicUsage: boolean;
}> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['personalUnderstanding'] === 'boolean' &&
    typeof record['brandUsage'] === 'boolean' &&
    typeof record['publicUsage'] === 'boolean'
  );
}

async function handleApproval(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApplicationDependencies,
): Promise<void> {
  if (!dependencies.workbench || !dependencies.resolveActor) {
    sendJson(response, 503, { error: 'workbench_unavailable' });
    return;
  }

  const actorId = dependencies.resolveActor(request);
  if (!actorId) {
    sendJson(response, 401, { error: 'authentication_required' });
    return;
  }

  try {
    const body = await readJsonObject(request);
    const actionId = body['actionId'];
    if (typeof actionId !== 'string' || actionId.trim().length === 0) {
      sendJson(response, 400, { error: 'invalid_action_id' });
      return;
    }
    const occurredAt = now(dependencies);
    if (dependencies.risk) {
      const current = await dependencies.workbench.snapshot();
      const action = current.actions.find((candidate) => candidate.id === actionId);
      if (!action) throw new WorkbenchActionNotFoundError(actionId);
      await dependencies.risk.authorizeAction(actorId, action);
    }
    const snapshot = await dependencies.workbench.approve(
      actionId,
      actorId,
      occurredAt,
    );
    await recordMutationAudit(dependencies, {
      actorId,
      requestId: `workbench.approve:${snapshot.workflow.id}:${actionId}`,
      eventType: 'workbench.action_approved',
      resourceType: 'workbench',
      resourceId: snapshot.workflow.id,
      purpose: 'strategy_reasoning',
      decision: 'approved',
      metadata: { actionId, revision: snapshot.workflow.revision },
      occurredAt,
    });
    sendJson(response, 200, snapshot);
  } catch (error: unknown) {
    if (error instanceof InvalidJsonBodyError) {
      sendJson(response, 400, { error: error.code });
      return;
    }
    if (error instanceof WorkbenchActionNotFoundError) {
      sendJson(response, 404, { error: 'action_not_found' });
      return;
    }
    if (error instanceof WorkbenchApprovalConflictError) {
      sendJson(response, 409, { error: error.reason });
      return;
    }
    if (error instanceof BrandProtectionBlockedError) {
      sendJson(response, 409, { error: error.reason });
      return;
    }
    if (error instanceof BrandProtectionPermissionError) {
      sendJson(response, 403, { error: 'risk_permission_denied' });
      return;
    }
    sendJson(response, 500, { error: 'approval_failed' });
  }
}

class InvalidJsonBodyError extends Error {
  public constructor(public readonly code: 'invalid_json' | 'request_too_large') {
    super(code);
  }
}

async function readJsonObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    // A 20k-character UTF-8 asset can approach 80 KiB before JSON overhead.
    if (size > 98_304) throw new InvalidJsonBodyError('request_too_large');
    chunks.push(buffer);
  }

  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidJsonBodyError('invalid_json');
    }
    return value as Record<string, unknown>;
  } catch (error: unknown) {
    if (error instanceof InvalidJsonBodyError) throw error;
    throw new InvalidJsonBodyError('invalid_json');
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function sendJsonDownload(
  response: ServerResponse,
  filename: string,
  payload: unknown,
): void {
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-disposition': `attachment; filename="${filename}"`,
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload, null, 2));
}
