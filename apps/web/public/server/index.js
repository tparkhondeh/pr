let approval = null;
let strategy = {
  revision: 1,
  updatedAt: new Date(0).toISOString(),
  persistence: 'ephemeral',
  goalId: '00000000-0000-4000-8000-000000000301',
  positioningId: '00000000-0000-4000-8000-000000000302',
  goal: {
    title: 'تقویت جایگاه «مشاور قابل‌اعتماد»',
    outcome: 'ایجاد تعامل‌های عمیق و قابل‌ردیابی با ذی‌نفعان اصلی',
    priority: 5,
    successMetrics: ['کیفیت تعامل', 'فرصت‌های ایجادشده', 'تغییر ادراک'],
    horizon: 'سه ماه آینده',
  },
  desiredPositioning: {
    audience: 'بنیان‌گذاران و تصمیم‌گیران کسب‌وکار',
    desiredPerception: 'مشاوری قابل‌اعتماد، عمیق و صادق در شرایط ابهام',
    differentiation: 'ترکیب قضاوت انسانی، شواهد قابل‌ردیابی و پرهیز از نمایش‌گری',
    proofPoints: ['کیفیت گفت‌وگوهای خصوصی', 'تصمیم‌های مستند', 'روایت‌های مبتنی بر تجربه واقعی'],
    horizon: 'سه ماه آینده',
  },
};
const strategyRequests = new Map();
const decisionContextRequests = new Map();
let currentDraft = null;
const draftRequests = new Map();
const feedbackEvents = new Map();
const preferenceProposals = new Map();
const feedbackRequests = new Map();
const strategicRecommendationReviews = new Map();
const strategicReviewRequests = new Map();
const strategicActionOutcomes = new Map();
const strategicOutcomeRequests = new Map();
const workflowCostReservations = new Map();
const workflowCostCharges = new Map();
const workflowCostPolicy = {
  version: 'workflow-cost-budget-v1', currency: 'USD',
  perInvocationBudgetMinorUnits: 100, perWorkflowBudgetMinorUnits: 500,
  dailyBudgetMinorUnits: 2000, maxInvocationsPerWorkflow: 12,
  maxStepsPerWorkflow: 16, warningRatio: 0.8,
};
const modelGovernanceRoutes = [
  modelRoute('extract-evidence-v1', 'extract_evidence', 'evidence-extraction-v1', 'balanced', 'high'),
  modelRoute('synthesize-hypothesis-v1', 'synthesize_hypothesis', 'hypothesis-synthesis-v1', 'reasoning', 'high'),
  modelRoute('strategy-options-v1', 'strategy_options', 'strategic-options-v1', 'reasoning', 'high'),
  modelRoute('draft-content-v1', 'draft_content', 'evidence-bound-draft-v1', 'balanced', 'high'),
  modelRoute('evaluate-output-v1', 'evaluate_output', 'evaluation-v1', 'economy', 'medium'),
];
const conversationTurns = new Map();
const memoryProposals = new Map();
const memoryRightRequests = new Map();
const auditEvents = new Map();
const assetRequests = new Map();
const assetRightRequests = new Map();
const retiredAssetRequests = new Set();
const retiredAssetContentHashes = new Set();
const textAssets = new Map();
const researchSources = new Map();
const researchRequests = new Map();
const claimReviews = new Map();
const claimReviewRequests = new Map();
const riskReviews = new Map();
const riskReviewRequests = new Map();
const arbitrationCases = new Map();
const arbitrationRequests = new Map();
let initiativeSettings = {
  mode: 'reactive', maxPromptsPer24Hours: 1, minimumRelevance: 0.75,
  pausedUntil: null, revision: 1, updatedAt: new Date(0).toISOString(), persistence: 'ephemeral',
};
const initiativeEvaluations = new Map();
const initiativeEvaluationRequests = new Map();
const initiativeSettingRequests = new Map();
const stakeholderRecords = new Map();
const stakeholderCreateRequests = new Map();
const stakeholderDeleteRequests = new Map();
const perceptionSignals = new Map();
const perceptionCreateRequests = new Map();
const perceptionDeleteRequests = new Map();

const groundedActions = [
  {
    id: 'conversation',
    kind: 'private_conversation',
    title: 'گفت‌وگوی خصوصی با یک همکار قدیمی',
    rationale: 'برای هدف اعتمادسازی، یک تعامل عمیق از چند انتشار عمومی ارزشمندتر است.',
    benefits: ['تقویت رابطه با یک ذی‌نفع کلیدی'],
    risks: ['زمان‌بندی نامناسب گفت‌وگو'],
    prerequisites: ['مرور آخرین تعامل ثبت‌شده'],
    evidenceCount: 2,
    confidence: 0.84,
    riskLevel: 'low',
    attentionCostMinutes: 30,
    energyCost: 2,
    attentionDemand: 2,
    visibilityCost: 1,
    emotionalCost: 2,
    feasible: true,
    feasibilityReasons: ['within_budget'],
    utilityScore: 67.6,
    opportunityCost: 0,
    rank: 1,
  },
  {
    id: 'essay',
    kind: 'content',
    title: 'یادداشت تحلیلی درباره تصمیم‌گیری در ابهام',
    rationale: 'یک تجربه ثبت‌شده، پایه روایتی اصیل و قابل‌ردیابی را فراهم می‌کند.',
    benefits: ['نمایش عمق فکری با تکیه بر تجربه واقعی'],
    risks: ['برداشت اغراق‌آمیز از تجربه'],
    prerequisites: ['بررسی ادعاها پیش از Draft'],
    evidenceCount: 2,
    confidence: 0.78,
    riskLevel: 'medium',
    attentionCostMinutes: 120,
    energyCost: 3,
    attentionDemand: 3,
    visibilityCost: 4,
    emotionalCost: 3,
    feasible: true,
    feasibilityReasons: ['within_budget'],
    utilityScore: 54.2,
    opportunityCost: 13.4,
    rank: 2,
  },
  {
    id: 'wait',
    kind: 'no_action',
    title: 'فعلاً اقدام نکن',
    rationale: 'اگر انرژی امروز پایین است، حفظ کیفیت برند از پرکردن تقویم مهم‌تر است.',
    benefits: ['حفظ کیفیت و بودجه توجه'],
    risks: ['از دست‌رفتن یک پنجره زمانی کوتاه'],
    prerequisites: ['بازبینی دوباره در چرخه بعد'],
    evidenceCount: 1,
    confidence: 0.71,
    riskLevel: 'low',
    attentionCostMinutes: 0,
    energyCost: 1,
    attentionDemand: 1,
    visibilityCost: 1,
    emotionalCost: 1,
    feasible: true,
    feasibilityReasons: ['within_budget'],
    utilityScore: 53.9,
    opportunityCost: 13.7,
    rank: 3,
  },
];

let decisionContext = {
  policyVersion: 'decision-context-v1',
  revision: 1,
  contextHash: '3202024badf63007236919b1d36dbc5ca2f7e733307ca0832e7f969b84a62910',
  updatedAt: new Date(0).toISOString(),
  persistence: 'ephemeral',
  attentionBudget: {
    availableMinutes: 150,
    maximumEnergyCost: 3,
    attentionCapacity: 3,
    visibilityTolerance: 4,
    emotionalBandwidth: 3,
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/workbench') {
      return json(snapshot());
    }

    if (request.method === 'GET' && url.pathname === '/api/strategy') {
      return json(strategy);
    }

    if (request.method === 'GET' && url.pathname === '/api/decision-context') {
      return json(decisionContext);
    }

    if (request.method === 'GET' && url.pathname === '/api/drafts/current') {
      return json(currentDraft ? draftSnapshot() : null);
    }

    if (request.method === 'GET' && url.pathname === '/api/drafts/sources') {
      return json(draftSourceSnapshot());
    }

    if (request.method === 'GET' && url.pathname === '/api/feedback') {
      return json(feedbackSnapshot());
    }

    if (request.method === 'GET' && url.pathname === '/api/strategic-quality') {
      return json(strategicQualitySnapshot());
    }

    if (request.method === 'GET' && url.pathname === '/api/workflow-cost') {
      return json(workflowCostSnapshot());
    }

    if (request.method === 'GET' && url.pathname === '/api/model-governance') {
      return json(modelGovernanceSnapshot());
    }

    if (request.method === 'POST' && url.pathname === '/api/workflow-cost/reservations') {
      const body = await readJson(request);
      if (!validWorkflowCostReservation(body)) {
        return json({ error: 'invalid_workflow_cost_reservation' }, 400);
      }
      const fingerprint = JSON.stringify({
        workflowId: body.workflowId, invocationId: body.invocationId, kind: body.kind,
        estimatedCostMinorUnits: body.estimatedCostMinorUnits, plannedSteps: body.plannedSteps,
      });
      const repeated = workflowCostReservations.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json(repeated.reservation, repeated.reservation.decision === 'allowed' ? 201 : 409)
          : json({ error: 'idempotency_mismatch' }, 409);
      }
      if ([...workflowCostReservations.values()].some((entry) =>
        entry.reservation.workflowId === body.workflowId &&
        entry.reservation.invocationId === body.invocationId)) {
        return json({ error: 'invocation_already_reserved' }, 409);
      }
      const reservedAt = new Date().toISOString();
      const reason = workflowCostReservationReason(body, reservedAt);
      const reservation = {
        id: crypto.randomUUID(), requestId: body.requestId,
        workflowId: body.workflowId, invocationId: body.invocationId, kind: body.kind,
        estimatedCostMinorUnits: body.estimatedCostMinorUnits, plannedSteps: body.plannedSteps,
        decision: reason ? 'blocked' : 'allowed', ...(reason ? { reason } : {}), reservedAt,
      };
      workflowCostReservations.set(body.requestId, { fingerprint, reservation });
      recordAudit(`workflow-cost.reserve:${body.requestId}`, {
        eventType: `workflow_cost.reservation_${reservation.decision}`,
        resourceType: 'workflow_cost', resourceId: reservation.id,
        purpose: 'strategy_reasoning', decision: reservation.decision,
        metadata: {
          requestId: body.requestId, workflowId: body.workflowId, kind: body.kind,
          estimatedCostMinorUnits: body.estimatedCostMinorUnits,
          plannedSteps: body.plannedSteps, reason: reason ?? null,
          policyVersion: workflowCostPolicy.version,
        },
        occurredAt: reservedAt,
      });
      return json(reservation, reservation.decision === 'allowed' ? 201 : 409);
    }

    if (request.method === 'POST' && url.pathname === '/api/workflow-cost/charges') {
      const body = await readJson(request);
      if (!validWorkflowCostCharge(body)) return json({ error: 'invalid_workflow_cost_charge' }, 400);
      const fingerprint = JSON.stringify({
        reservationId: body.reservationId, provider: body.provider, model: body.model,
        inputTokens: body.inputTokens, outputTokens: body.outputTokens,
        cachedInputTokens: body.cachedInputTokens, components: body.components,
        actualSteps: body.actualSteps, humanReviewSeconds: body.humanReviewSeconds,
        costEvidence: body.costEvidence,
      });
      const repeated = workflowCostCharges.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json(repeated.charge, 201)
          : json({ error: 'idempotency_mismatch' }, 409);
      }
      if ([...workflowCostCharges.values()].some(
        (entry) => entry.charge.reservationId === body.reservationId,
      )) return json({ error: 'reservation_already_charged' }, 409);
      const reservationEntry = [...workflowCostReservations.values()]
        .find((entry) => entry.reservation.id === body.reservationId);
      if (!reservationEntry) return json({ error: 'reservation_not_found' }, 409);
      if (reservationEntry.reservation.decision !== 'allowed') {
        return json({ error: 'reservation_blocked' }, 409);
      }
      const actualCostMinorUnits = Object.values(body.components)
        .reduce((total, value) => total + value, 0);
      const circuitReason = workflowCostSettlementReason(
        reservationEntry.reservation, body, actualCostMinorUnits,
      );
      const chargedAt = new Date().toISOString();
      const charge = {
        id: crypto.randomUUID(), requestId: body.requestId,
        reservationId: body.reservationId, provider: body.provider, model: body.model,
        inputTokens: body.inputTokens, outputTokens: body.outputTokens,
        cachedInputTokens: body.cachedInputTokens, components: body.components,
        actualCostMinorUnits, actualSteps: body.actualSteps,
        humanReviewSeconds: body.humanReviewSeconds, costEvidence: body.costEvidence,
        circuitOpened: Boolean(circuitReason),
        ...(circuitReason ? { circuitReason } : {}), chargedAt,
      };
      workflowCostCharges.set(body.requestId, { fingerprint, charge });
      recordAudit(`workflow-cost.charge:${body.requestId}`, {
        eventType: circuitReason ? 'workflow_cost.charged_circuit_opened' : 'workflow_cost.charged',
        resourceType: 'workflow_cost', resourceId: charge.id,
        purpose: 'strategy_reasoning', decision: circuitReason ? 'circuit_opened' : 'recorded',
        metadata: {
          requestId: body.requestId, reservationId: body.reservationId,
          actualCostMinorUnits, actualSteps: body.actualSteps,
          costEvidence: body.costEvidence, circuitReason: circuitReason ?? null,
          policyVersion: workflowCostPolicy.version,
        },
        occurredAt: chargedAt,
      });
      return json(charge, 201);
    }

    if (request.method === 'POST' && url.pathname === '/api/strategic-quality/reviews') {
      const body = await readJson(request);
      if (!validStrategicReview(body)) {
        return json({ error: 'invalid_strategic_review_input' }, 400);
      }
      const reviewedAt = new Date();
      if (body.expectedStrategyRevision !== strategy.revision) {
        return json({ error: 'strategy_changed' }, 409);
      }
      if (
        body.expectedDecisionContextRevision !== decisionContext.revision ||
        body.expectedDecisionContextHash !== decisionContext.contextHash
      ) return json({ error: 'decision_context_changed' }, 409);
      const decisionWindowEndsAt = new Date(body.expectedDecisionWindowEndsAt);
      if (Number.isNaN(decisionWindowEndsAt.getTime()) || decisionWindowEndsAt <= reviewedAt) {
        return json({ error: 'decision_expired' }, 409);
      }
      const workbench = snapshot();
      const action = workbench.actions.find((candidate) => candidate.id === body.actionId);
      if (!action) return json({ error: 'strategic_recommendation_not_found' }, 404);
      if (
        action.decision.strategyRevision !== body.expectedStrategyRevision ||
        action.decision.decisionContextRevision !== body.expectedDecisionContextRevision ||
        action.decision.decisionContextHash !== body.expectedDecisionContextHash
      ) return json({ error: 'decision_context_changed' }, 409);
      if (body.decision === 'accepted' && workbench.workflow.approvedActionId !== action.id) {
        return json({ error: 'acceptance_not_approved' }, 409);
      }
      const normalized = {
        actionId: body.actionId,
        decision: body.decision,
        usefulness: body.usefulness,
        trust: body.trust,
        friction: body.friction,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
        strategyRevision: body.expectedStrategyRevision,
        decisionContextRevision: body.expectedDecisionContextRevision,
        decisionContextHash: body.expectedDecisionContextHash,
        decisionWindowEndsAt: decisionWindowEndsAt.toISOString(),
      };
      const fingerprint = JSON.stringify(normalized);
      const repeated = strategicReviewRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json(strategicQualitySnapshot(reviewedAt))
          : json({ error: 'idempotency_mismatch' }, 409);
      }
      const prior = currentStrategicReviews().find((review) =>
        review.actionId === action.id && review.strategyRevision === strategy.revision &&
        review.decisionContextRevision === decisionContext.revision &&
        review.decisionContextHash === decisionContext.contextHash,
      );
      const review = {
        id: crypto.randomUUID(),
        actionId: action.id,
        actionTitle: action.title,
        actionKind: action.kind,
        actionRank: action.rank,
        decision: body.decision,
        usefulness: body.usefulness,
        trust: body.trust,
        friction: body.friction,
        ...(normalized.note ? { note: normalized.note } : {}),
        strategyRevision: strategy.revision,
        decisionContextRevision: decisionContext.revision,
        decisionContextHash: decisionContext.contextHash,
        decisionWindowEndsAt: normalized.decisionWindowEndsAt,
        reviewedAt: reviewedAt.toISOString(),
        ...(prior ? { supersedesReviewId: prior.id } : {}),
      };
      strategicRecommendationReviews.set(review.id, review);
      strategicReviewRequests.set(body.requestId, { fingerprint, reviewId: review.id });
      recordAudit(`strategic-quality.review:${body.requestId}`, {
        eventType: `strategic_recommendation.${body.decision}`,
        resourceType: 'strategic_recommendation_review', resourceId: review.id,
        purpose: 'personal_understanding', decision: body.decision,
        metadata: {
          requestId: body.requestId, actionId: action.id,
          strategyRevision: strategy.revision, decisionContextRevision: decisionContext.revision,
          decisionContextHash: decisionContext.contextHash,
          usefulness: body.usefulness, trust: body.trust, friction: body.friction,
        },
        occurredAt: review.reviewedAt,
      });
      return json(strategicQualitySnapshot(reviewedAt));
    }

    if (request.method === 'POST' && url.pathname === '/api/strategic-quality/outcomes') {
      const body = await readJson(request);
      if (!validStrategicOutcome(body)) {
        return json({ error: 'invalid_strategic_outcome_input' }, 400);
      }
      const recordedAt = new Date();
      const outcomeOccurredAt = new Date(body.outcomeOccurredAt);
      if (
        Number.isNaN(outcomeOccurredAt.getTime()) ||
        outcomeOccurredAt.getTime() > recordedAt.getTime() + 5 * 60 * 1000
      ) return json({ error: 'invalid_strategic_outcome_input' }, 400);
      const review = strategicRecommendationReviews.get(body.reviewId);
      if (!review) return json({ error: 'strategic_recommendation_not_found' }, 404);
      if (!currentStrategicReviews().some((candidate) => candidate.id === review.id)) {
        return json({ error: 'review_superseded' }, 409);
      }
      if (review.decision !== 'accepted') return json({ error: 'review_not_accepted' }, 409);
      if (outcomeOccurredAt.getTime() < new Date(review.reviewedAt).getTime()) {
        return json({ error: 'outcome_before_review' }, 409);
      }
      const normalized = {
        reviewId: review.id,
        executionStatus: body.executionStatus,
        satisfaction: body.satisfaction,
        regret: body.regret,
        energy: body.energy,
        engagementQuality: body.engagementQuality ?? null,
        interactionDepth: body.interactionDepth ?? null,
        privateMessages: body.privateMessages,
        opportunitiesCreated: body.opportunitiesCreated,
        relationshipChange: body.relationshipChange,
        mediaOpportunities: body.mediaOpportunities,
        perceptionShift: body.perceptionShift,
        businessOutcome: body.businessOutcome,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
        outcomeOccurredAt: outcomeOccurredAt.toISOString(),
      };
      const fingerprint = JSON.stringify(normalized);
      const repeated = strategicOutcomeRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json(strategicQualitySnapshot(recordedAt))
          : json({ error: 'idempotency_mismatch' }, 409);
      }
      const prior = currentStrategicOutcomes().find((outcome) => outcome.reviewId === review.id);
      const outcome = {
        id: crypto.randomUUID(),
        reviewId: review.id,
        actionId: review.actionId,
        actionTitle: review.actionTitle,
        executionStatus: normalized.executionStatus,
        satisfaction: normalized.satisfaction,
        regret: normalized.regret,
        energy: normalized.energy,
        ...(normalized.engagementQuality !== null ? { engagementQuality: normalized.engagementQuality } : {}),
        ...(normalized.interactionDepth !== null ? { interactionDepth: normalized.interactionDepth } : {}),
        privateMessages: normalized.privateMessages,
        opportunitiesCreated: normalized.opportunitiesCreated,
        relationshipChange: normalized.relationshipChange,
        mediaOpportunities: normalized.mediaOpportunities,
        perceptionShift: normalized.perceptionShift,
        businessOutcome: normalized.businessOutcome,
        ...(normalized.note ? { note: normalized.note } : {}),
        outcomeOccurredAt: normalized.outcomeOccurredAt,
        recordedAt: recordedAt.toISOString(),
        ...(prior ? { supersedesOutcomeId: prior.id } : {}),
      };
      strategicActionOutcomes.set(outcome.id, outcome);
      strategicOutcomeRequests.set(body.requestId, { fingerprint, outcomeId: outcome.id });
      recordAudit(`strategic-quality.outcome:${body.requestId}`, {
        eventType: 'strategic_action.outcome_recorded',
        resourceType: 'strategic_action_outcome', resourceId: outcome.id,
        purpose: 'personal_understanding', decision: 'recorded',
        metadata: {
          requestId: body.requestId, reviewId: review.id, actionId: review.actionId,
          executionStatus: body.executionStatus, satisfaction: body.satisfaction,
          regret: body.regret, energy: body.energy,
        },
        occurredAt: outcome.recordedAt,
      });
      return json(strategicQualitySnapshot(recordedAt));
    }

    if (request.method === 'GET' && url.pathname === '/api/research') {
      return json(researchSnapshot());
    }

    if (request.method === 'GET' && url.pathname === '/api/opportunities') {
      return json(opportunityRadarSnapshot());
    }

    if (request.method === 'POST' && url.pathname === '/api/research/sources') {
      const body = await readJson(request);
      if (!validResearchSource(body)) return json({ error: 'invalid_research_input' }, 400);
      const fingerprint = JSON.stringify(body);
      const repeated = researchRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json({ outcome: 'already_applied', persistence: 'ephemeral', record: repeated.record })
          : json({ error: 'research_import_conflict' }, 409);
      }
      const normalizedUrl = normalizeResearchUrl(body.url);
      const statementKey = normalizeResearchStatement(body.statement);
      const duplicate = [...researchSources.values()].some((source) => (
        source.url === normalizedUrl && normalizeResearchStatement(source.statement) === statementKey &&
        source.stance === body.stance
      ));
      if (duplicate) return json({ error: 'research_import_conflict' }, 409);
      const record = {
        sourceId: crypto.randomUUID(), claimId: crypto.randomUUID(), evidenceId: crypto.randomUUID(),
        requestId: body.requestId, title: body.title.trim(), publisher: body.publisher.trim(),
        url: normalizedUrl, excerpt: body.excerpt.trim(), statement: body.statement.trim(),
        quality: body.quality, stance: body.stance,
        publishedAt: new Date(body.publishedAt).toISOString(), accessedAt: new Date().toISOString(),
        maxAgeDays: body.maxAgeDays,
      };
      researchSources.set(record.sourceId, record);
      researchRequests.set(body.requestId, { fingerprint, record });
      recordAudit(`research.import:${body.requestId}`, {
        eventType: 'research.source_recorded', resourceType: 'research_source', resourceId: record.sourceId,
        purpose: 'external_research', decision: 'claim_proposed',
        metadata: { requestId: body.requestId, quality: body.quality, stance: body.stance },
        occurredAt: record.accessedAt,
      });
      return json({ outcome: 'applied', persistence: 'ephemeral', record }, 201);
    }

    if (request.method === 'GET' && url.pathname === '/api/claims') {
      return json(claimGovernanceSnapshot());
    }

    const claimReview = url.pathname.match(/^\/api\/claims\/([0-9a-f-]{36})\/reviews$/i);
    if (request.method === 'POST' && claimReview?.[1]) {
      const body = await readJson(request);
      if (!validClaimReview(body)) return json({ error: 'invalid_claim_review' }, 400);
      const fingerprint = JSON.stringify({ ...body, claimId: claimReview[1] });
      const repeated = claimReviewRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json({ outcome: 'already_applied', persistence: 'ephemeral', review: repeated.review })
          : json({ error: 'idempotency_mismatch' }, 409);
      }
      const claim = claimGovernanceSnapshot().claims.find((candidate) => candidate.claimId === claimReview[1]);
      if (!claim) return json({ error: 'claim_not_found' }, 404);
      if (claim.status !== body.expectedStatus) return json({ error: 'status_changed' }, 409);
      const resultingStatus = claimTransition(body.expectedStatus, body.decision);
      if (!resultingStatus) return json({ error: 'invalid_transition' }, 422);
      if (body.decision === 'verify' && !body.humanAttestation) {
        return json({ error: 'attestation_required' }, 422);
      }
      if (body.decision === 'verify' && claim.traceStatus !== 'complete') {
        return json({ error: 'trace_incomplete' }, 422);
      }
      const reviewedAt = new Date().toISOString();
      const review = {
        reviewId: crypto.randomUUID(), requestId: body.requestId, claimId: claim.claimId,
        decision: body.decision, previousStatus: body.expectedStatus, resultingStatus,
        rationale: body.rationale.trim(),
        traceSnapshot: {
          categories: claim.categories, traceStatus: claim.traceStatus,
          traceRationale: claim.traceRationale, evidenceIds: claim.evidenceIds,
          sourceRefs: claim.sourceRefs, humanAttestation: body.humanAttestation,
        },
        reviewedAt,
      };
      claimReviews.set(claim.claimId, review);
      claimReviewRequests.set(body.requestId, { fingerprint, review });
      recordAudit(`claim.review:${body.requestId}`, {
        eventType: 'claim.reviewed', resourceType: 'claim', resourceId: claim.claimId,
        purpose: 'public_drafting', decision: body.decision,
        metadata: { requestId: body.requestId, previousStatus: body.expectedStatus, resultingStatus },
        occurredAt: reviewedAt,
      });
      return json({ outcome: 'applied', persistence: 'ephemeral', review }, 201);
    }

    if (request.method === 'GET' && url.pathname === '/api/risk') {
      return json(await riskSnapshot());
    }

    if (request.method === 'GET' && url.pathname === '/api/arbitration') {
      return json(await arbitrationWorkspaceSnapshot());
    }

    if (request.method === 'POST' && url.pathname === '/api/arbitration/cases') {
      const body = await readJson(request);
      if (!validArbitrationRequest(body)) return json({ error: 'invalid_arbitration_request' }, 400);
      const action = snapshot().actions.find((candidate) => candidate.id === body.actionId);
      if (!action) return json({ error: 'arbitration_action_not_found' }, 404);
      const context = await arbitrationContext();
      const assessment = context.risk.assessments.find((candidate) => candidate.actionId === action.id);
      if (!assessment) return json({ error: 'arbitration_action_not_found' }, 404);
      const currentContextHash = await arbitrationContextHash(action, context);
      const fingerprint = await sha256Hex(JSON.stringify({
        policyVersion: 'intermodule-arbitration-v1', actionId: action.id,
        requestedAutonomyLevel: body.requestedAutonomyLevel, contextHash: currentContextHash,
      }));
      const repeated = arbitrationRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json({ outcome: 'already_applied', persistence: 'ephemeral', case: repeated.case })
          : json({ error: 'idempotency_mismatch' }, 409);
      }
      const arbitrationCase = await buildArbitrationCase(
        body.requestId,
        action,
        body.requestedAutonomyLevel,
        context,
        assessment,
      );
      arbitrationCases.set(arbitrationCase.caseId, arbitrationCase);
      arbitrationRequests.set(body.requestId, { fingerprint, case: arbitrationCase });
      recordAudit(`decision.arbitrated:${body.requestId}`, {
        eventType: 'decision.arbitrated', resourceType: 'arbitration_case',
        resourceId: arbitrationCase.caseId, purpose: 'strategy_reasoning',
        decision: arbitrationCase.decision.outcome,
        metadata: {
          actionId: action.id, requestedAutonomyLevel: body.requestedAutonomyLevel,
          effectiveAutonomyLevel: arbitrationCase.decision.effectiveAutonomyLevel,
          policyVersion: arbitrationCase.policyVersion, snapshotHash: arbitrationCase.snapshotHash,
        },
        occurredAt: arbitrationCase.createdAt,
      });
      return json({ outcome: 'applied', persistence: 'ephemeral', case: arbitrationCase }, 201);
    }

    if (request.method === 'GET' && url.pathname === '/api/initiative') {
      return json(await initiativeWorkspaceSnapshot());
    }

    if (request.method === 'PUT' && url.pathname === '/api/initiative/settings') {
      const body = await readJson(request);
      if (!validInitiativeSettingsRequest(body)) return json({ error: 'invalid_initiative_settings' }, 400);
      const fingerprint = await sha256Hex(JSON.stringify({
        policyVersion: 'initiative-policy-v1', expectedRevision: body.expectedRevision,
        value: {
          mode: body.mode, maxPromptsPer24Hours: body.maxPromptsPer24Hours,
          minimumRelevance: body.minimumRelevance, pausedUntil: body.pausedUntil,
        },
      }));
      const repeated = initiativeSettingRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json({ outcome: 'already_saved', settings: repeated.settings })
          : json({ error: 'idempotency_mismatch' }, 409);
      }
      if (body.expectedRevision !== initiativeSettings.revision) {
        return json({ error: 'revision_changed' }, 409);
      }
      initiativeSettings = {
        mode: body.mode,
        maxPromptsPer24Hours: body.maxPromptsPer24Hours,
        minimumRelevance: body.minimumRelevance,
        pausedUntil: body.pausedUntil,
        revision: body.expectedRevision + 1,
        updatedAt: new Date().toISOString(),
        persistence: 'ephemeral',
      };
      initiativeSettingRequests.set(body.requestId, { fingerprint, settings: initiativeSettings });
      recordAudit(`initiative.settings_updated:${body.requestId}`, {
        eventType: 'initiative.settings_updated', resourceType: 'initiative_settings',
        resourceId: 'owner_primary', purpose: 'strategy_reasoning', decision: body.mode,
        metadata: { revision: initiativeSettings.revision, policyVersion: 'initiative-policy-v1' },
        occurredAt: initiativeSettings.updatedAt,
      });
      return json({ outcome: 'saved', settings: initiativeSettings });
    }

    if (request.method === 'POST' && url.pathname === '/api/initiative/evaluations') {
      const body = await readJson(request);
      if (!validInitiativeEvaluationRequest(body)) return json({ error: 'invalid_initiative_evaluation' }, 400);
      const context = await initiativeContext();
      const candidate = await initiativeCandidate(context);
      const fingerprint = await sha256Hex(JSON.stringify({
        policyVersion: 'initiative-policy-v1', contextHash: context.contextHash,
        candidateId: candidate?.candidateId ?? null,
      }));
      const repeated = initiativeEvaluationRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json({ outcome: 'already_evaluated', persistence: 'ephemeral', evaluation: repeated.evaluation })
          : json({ error: 'idempotency_mismatch' }, 409);
      }
      const createdAt = new Date();
      const decision = initiativeDecision(initiativeSettings, [...initiativeEvaluations.values()], candidate, createdAt);
      const evaluation = {
        evaluationId: crypto.randomUUID(), requestId: body.requestId,
        policyVersion: 'initiative-policy-v1', settingsRevision: initiativeSettings.revision,
        contextHash: context.contextHash, candidate, ...decision, createdAt: createdAt.toISOString(),
      };
      initiativeEvaluations.set(evaluation.evaluationId, evaluation);
      initiativeEvaluationRequests.set(body.requestId, { fingerprint, evaluation });
      recordAudit(`initiative.evaluated:${body.requestId}`, {
        eventType: 'initiative.evaluated', resourceType: 'initiative_evaluation',
        resourceId: evaluation.evaluationId, purpose: 'strategy_reasoning', decision: evaluation.decision,
        metadata: {
          reason: evaluation.reason, candidateId: candidate?.candidateId ?? null,
          relevance: candidate?.relevance ?? null, policyVersion: evaluation.policyVersion,
        },
        occurredAt: evaluation.createdAt,
      });
      return json({ outcome: 'evaluated', persistence: 'ephemeral', evaluation }, 201);
    }

    if (request.method === 'GET' && url.pathname === '/api/relationships') {
      return json(relationshipWorkspaceSnapshot());
    }

    if (request.method === 'POST' && url.pathname === '/api/relationships/stakeholders') {
      const body = await readJson(request);
      if (!validStakeholderRequest(body)) return json({ error: 'invalid_relationship_input' }, 400);
      const occurredAt = new Date();
      const lastInteractionAt = body.lastInteractionAt === null ? null : new Date(body.lastInteractionAt);
      if (lastInteractionAt && (Number.isNaN(lastInteractionAt.getTime()) || lastInteractionAt > occurredAt)) {
        return json({ error: 'invalid_relationship_request' }, 400);
      }
      const normalized = {
        label: body.label.trim(), group: body.group, outcome: body.outcome.trim(),
        priority: body.priority, strength: body.strength, boundary: body.boundary,
        contextNote: body.contextNote.trim(),
        lastInteractionAt: lastInteractionAt?.toISOString() ?? null,
      };
      const fingerprint = await sha256Hex(JSON.stringify({ operation: 'create', ...normalized }));
      const repeated = stakeholderCreateRequests.get(body.requestId);
      if (repeated) {
        if (repeated.fingerprint !== fingerprint) return json({ error: 'relationship_conflict' }, 409);
        const activeRecord = stakeholderRecords.get(repeated.stakeholderId);
        return activeRecord
          ? json({ outcome: 'already_applied', persistence: 'ephemeral', record: activeRecord })
          : json({ error: 'relationship_conflict' }, 409);
      }
      const duplicate = [...stakeholderRecords.values()].find((record) => (
        normalizeRelationshipText(record.label) === normalizeRelationshipText(normalized.label) &&
        record.group === normalized.group
      ));
      if (duplicate) return json({ error: 'relationship_conflict' }, 409);
      const stakeholderId = uuidFromHash(await sha256Hex(`stakeholder:ephemeral:${body.requestId}`));
      const record = {
        stakeholderId, requestId: body.requestId, ...normalized,
        consentConfirmedAt: occurredAt.toISOString(), createdAt: occurredAt.toISOString(),
      };
      stakeholderRecords.set(stakeholderId, record);
      stakeholderCreateRequests.set(body.requestId, { fingerprint, stakeholderId });
      recordAudit(`relationship.record:${body.requestId}`, {
        eventType: 'relationship.stakeholder_recorded', resourceType: 'stakeholder',
        resourceId: stakeholderId, purpose: 'relationship_planning', decision: 'recorded',
        metadata: {
          policyVersion: 'relationship-intelligence-v1', contactDetailsStored: false,
        },
        occurredAt: record.createdAt,
      });
      return json({ outcome: 'applied', persistence: 'ephemeral', record }, 201);
    }

    const stakeholderDelete = url.pathname.match(/^\/api\/relationships\/stakeholders\/([0-9a-f-]{36})\/delete$/);
    if (request.method === 'POST' && stakeholderDelete?.[1]) {
      const body = await readJson(request);
      if (!validRequestId(body?.requestId)) return json({ error: 'invalid_relationship_delete' }, 400);
      const stakeholderId = stakeholderDelete[1];
      const fingerprint = await sha256Hex(JSON.stringify({ operation: 'delete', stakeholderId }));
      const repeated = stakeholderDeleteRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json({ outcome: 'already_applied', persistence: 'ephemeral', stakeholderId: repeated.stakeholderId })
          : json({ error: 'relationship_conflict' }, 409);
      }
      if (!stakeholderRecords.has(stakeholderId)) return json({ error: 'stakeholder_not_found' }, 404);
      stakeholderRecords.delete(stakeholderId);
      stakeholderDeleteRequests.set(body.requestId, { fingerprint, stakeholderId });
      recordAudit(`relationship.delete:${body.requestId}`, {
        eventType: 'relationship.stakeholder_deleted', resourceType: 'stakeholder',
        resourceId: stakeholderId, purpose: 'relationship_planning', decision: 'deleted',
        metadata: { hardDelete: true }, occurredAt: new Date().toISOString(),
      });
      return json({ outcome: 'deleted', persistence: 'ephemeral', stakeholderId });
    }

    if (request.method === 'GET' && url.pathname === '/api/perception') {
      return json(perceptionWorkspaceSnapshot());
    }

    if (request.method === 'POST' && url.pathname === '/api/perception/signals') {
      const body = await readJson(request);
      if (!validPerceptionSignalRequest(body)) return json({ error: 'invalid_perception_input' }, 400);
      const occurredAt = new Date();
      const observedAt = new Date(body.observedAt);
      if (Number.isNaN(observedAt.getTime()) || observedAt > occurredAt) {
        return json({ error: 'invalid_perception_request' }, 400);
      }
      const normalized = {
        dimension: body.dimension, perspective: body.perspective, stage: body.stage,
        summary: body.summary.trim(), evidenceNote: body.evidenceNote.trim(),
        sourceKind: body.sourceKind, confidence: body.confidence,
        observedAt: observedAt.toISOString(),
      };
      const fingerprint = await sha256Hex(JSON.stringify({ operation: 'create', ...normalized }));
      const repeated = perceptionCreateRequests.get(body.requestId);
      if (repeated) {
        if (repeated.fingerprint !== fingerprint) return json({ error: 'perception_conflict' }, 409);
        const activeRecord = perceptionSignals.get(repeated.signalId);
        return activeRecord
          ? json({ outcome: 'already_applied', persistence: 'ephemeral', record: activeRecord })
          : json({ error: 'perception_conflict' }, 409);
      }
      const signalId = uuidFromHash(await sha256Hex(`perception:ephemeral:${body.requestId}`));
      const record = {
        signalId, requestId: body.requestId, ...normalized,
        consentConfirmedAt: occurredAt.toISOString(), createdAt: occurredAt.toISOString(),
      };
      perceptionSignals.set(signalId, record);
      perceptionCreateRequests.set(body.requestId, { fingerprint, signalId });
      recordAudit(`perception.record:${body.requestId}`, {
        eventType: 'perception.signal_recorded', resourceType: 'perception_signal',
        resourceId: signalId, purpose: 'perception_analysis', decision: 'recorded',
        metadata: { policyVersion: 'perception-engine-v1', sourceIdentityStored: false },
        occurredAt: record.createdAt,
      });
      return json({ outcome: 'applied', persistence: 'ephemeral', record }, 201);
    }

    const perceptionDelete = url.pathname.match(/^\/api\/perception\/signals\/([0-9a-f-]{36})\/delete$/);
    if (request.method === 'POST' && perceptionDelete?.[1]) {
      const body = await readJson(request);
      if (!validRequestId(body?.requestId)) return json({ error: 'invalid_perception_delete' }, 400);
      const signalId = perceptionDelete[1];
      const fingerprint = await sha256Hex(JSON.stringify({ operation: 'delete', signalId }));
      const repeated = perceptionDeleteRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json({ outcome: 'already_applied', persistence: 'ephemeral', signalId: repeated.signalId })
          : json({ error: 'perception_conflict' }, 409);
      }
      if (!perceptionSignals.has(signalId)) return json({ error: 'perception_signal_not_found' }, 404);
      perceptionSignals.delete(signalId);
      perceptionDeleteRequests.set(body.requestId, { fingerprint, signalId });
      recordAudit(`perception.delete:${body.requestId}`, {
        eventType: 'perception.signal_deleted', resourceType: 'perception_signal',
        resourceId: signalId, purpose: 'perception_analysis', decision: 'deleted',
        metadata: { hardDelete: true }, occurredAt: new Date().toISOString(),
      });
      return json({ outcome: 'deleted', persistence: 'ephemeral', signalId });
    }

    if (request.method === 'GET' && url.pathname === '/api/expression') {
      return json(authenticExpressionSnapshot());
    }

    if (request.method === 'POST' && url.pathname === '/api/expression/review') {
      const body = await readJson(request);
      if (!validExpressionReview(body)) return json({ error: 'invalid_expression_input' }, 400);
      const selected = body.assetRefs.map((ref) => textAssets.get(ref));
      if (selected.some((asset) => !asset || !asset.permissions.brandUsage)) {
        return json({ error: 'expression_permission_denied' }, 403);
      }
      return json(reviewAuthenticExpression(body.content.trim(), selected.filter(Boolean)));
    }

    const riskReview = url.pathname.match(/^\/api\/risk\/actions\/([^/]+)\/reviews$/);
    if (request.method === 'POST' && riskReview?.[1]) {
      const body = await readJson(request);
      if (!validRiskReview(body)) return json({ error: 'invalid_risk_review' }, 400);
      const actionId = decodeURIComponent(riskReview[1]);
      const action = snapshot().actions.find((candidate) => candidate.id === actionId);
      if (!action) return json({ error: 'risk_action_not_found' }, 404);
      const assessment = await assessRiskAction(action);
      if (assessment.level !== body.expectedLevel || assessment.assessmentHash !== body.expectedAssessmentHash) {
        return json({ error: 'assessment_changed' }, 409);
      }
      if (!assessment.reviewableDecisions.includes(body.decision)) {
        return json({ error: 'invalid_decision' }, 409);
      }
      const fingerprint = JSON.stringify({ ...body, actionId });
      const repeated = riskReviewRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json({ outcome: 'already_applied', persistence: 'ephemeral', review: repeated.review })
          : json({ error: 'idempotency_mismatch' }, 409);
      }
      const review = {
        reviewId: crypto.randomUUID(), requestId: body.requestId, actionId,
        assessmentHash: assessment.assessmentHash, expectedLevel: assessment.level,
        decision: body.decision, rationale: body.rationale.trim(), reviewedAt: new Date().toISOString(),
      };
      riskReviews.set(actionId, review);
      riskReviewRequests.set(body.requestId, { fingerprint, review });
      recordAudit(`risk.review:${body.requestId}`, {
        eventType: 'risk.reviewed', resourceType: 'action', resourceId: actionId,
        purpose: 'strategy_reasoning', decision: body.decision,
        metadata: { assessmentHash: assessment.assessmentHash, expectedLevel: assessment.level, policyVersion: 'brand-protection-v1' },
        occurredAt: review.reviewedAt,
      });
      return json({ outcome: 'applied', persistence: 'ephemeral', review }, 201);
    }

    if (request.method === 'GET' && url.pathname === '/api/account/activity') {
      return json(auditSnapshot());
    }

    if (request.method === 'GET' && url.pathname === '/api/onboarding') {
      return json(onboardingSnapshot());
    }

    if (request.method === 'GET' && url.pathname === '/api/account/export') {
      const exportedAt = new Date().toISOString();
      const activity = auditSnapshot();
      recordAudit(`account.export:${crypto.randomUUID()}`, {
        eventType: 'account.data_exported',
        resourceType: 'account',
        resourceId: 'owner_portable_data',
        purpose: 'personal_understanding',
        decision: 'exported',
        metadata: { schemaVersion: 1, consistency: 'best_effort_snapshot' },
        occurredAt: exportedAt,
      });
      return json({
        schemaVersion: 1,
        exportedAt,
        scope: 'owner_portable_data',
        consistency: 'best_effort_snapshot',
        data: {
          workbench: snapshot(),
          strategy,
          memory: memorySnapshot(),
          assets: assetSnapshot(),
          draft: currentDraft ? draftSnapshot() : null,
          research: researchSnapshot(),
          claims: claimGovernanceSnapshot(),
          risk: await riskSnapshot(),
          arbitration: await arbitrationWorkspaceSnapshot(),
          initiative: await initiativeWorkspaceSnapshot(),
          relationships: relationshipWorkspaceSnapshot(),
          perception: perceptionWorkspaceSnapshot(),
          feedback: feedbackSnapshot(),
          strategicQuality: strategicQualitySnapshot(),
          workflowCosts: workflowCostSnapshot(),
          modelGovernance: modelGovernanceSnapshot(),
          activity,
        },
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/assets/text') {
      const body = await readJson(request);
      if (!validTextAsset(body)) return json({ error: 'invalid_text_asset' }, 400);
      const importedAt = new Date();
      const occurredAt = new Date(body.occurredAt);
      if (Number.isNaN(occurredAt.getTime()) || occurredAt > importedAt) {
        return json({ error: 'invalid_text_asset' }, 400);
      }
      const normalized = {
        title: body.title.trim(),
        content: body.content.trim(),
        assertionText: body.assertionText.trim(),
        occurredAt: occurredAt.toISOString(),
        permissions: body.permissions,
      };
      const fingerprint = await sha256(JSON.stringify(normalized));
      const repeated = assetRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json({ outcome: 'already_applied', persistence: 'ephemeral', record: repeated.record })
          : json({ error: 'asset_import_conflict' }, 409);
      }
      if (retiredAssetRequests.has(body.requestId)) {
        return json({ error: 'asset_import_conflict' }, 409);
      }
      const integritySha256 = await sha256(normalized.content);
      if (
        retiredAssetContentHashes.has(integritySha256) ||
        [...textAssets.values()].some((asset) => asset.integritySha256 === integritySha256)
      ) {
        return json({ error: 'asset_import_conflict' }, 409);
      }
      const record = {
        requestId: body.requestId,
        assetId: crypto.randomUUID(),
        evidenceId: crypto.randomUUID(),
        assertionId: crypto.randomUUID(),
        title: normalized.title,
        content: normalized.content,
        assertionText: normalized.assertionText,
        sourceType: 'text_asset',
        dataClass: 'confidential',
        integritySha256,
        occurredAt: normalized.occurredAt,
        importedAt: importedAt.toISOString(),
        permissions: normalized.permissions,
      };
      textAssets.set(record.assetId, record);
      assetRequests.set(body.requestId, { fingerprint, record });
      recordAudit(`asset.import:${body.requestId}`, {
        eventType: 'asset.text_imported', resourceType: 'asset', resourceId: record.assetId,
        purpose: 'personal_understanding', decision: 'approved',
        metadata: {
          requestId: body.requestId, evidenceId: record.evidenceId,
          assertionId: record.assertionId, sourceType: record.sourceType,
          brandUsage: record.permissions.brandUsage,
        },
        occurredAt: record.importedAt,
      });
      return json({ outcome: 'applied', persistence: 'ephemeral', record }, 201);
    }

    const assetRightMatch = url.pathname.match(/^\/api\/assets\/text\/([0-9a-f-]{36})\/rights$/i);
    if (request.method === 'POST' && assetRightMatch?.[1]) {
      const body = await readJson(request);
      if (
        typeof body?.requestId !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) ||
        (body.operation !== 'revoke_brand_usage' && body.operation !== 'delete') ||
        !validText(body.reason, 3, 500)
      ) return json({ error: 'invalid_asset_right' }, 400);
      const fingerprint = await sha256(JSON.stringify({
        assetId: assetRightMatch[1], operation: body.operation, reason: body.reason.trim(),
      }));
      const repeated = assetRightRequests.get(body.requestId);
      if (repeated) {
        return repeated.fingerprint === fingerprint
          ? json({ ...repeated.result, outcome: 'already_applied' })
          : json({ error: 'asset_import_conflict' }, 409);
      }
      const asset = textAssets.get(assetRightMatch[1]);
      if (!asset) return json({ error: 'asset_not_found' }, 404);
      if (body.operation === 'revoke_brand_usage') {
        asset.permissions = { personalUnderstanding: true, brandUsage: false };
      } else {
        textAssets.delete(asset.assetId);
        for (const [requestId, request] of assetRequests.entries()) {
          if (request.record.assetId === asset.assetId) {
            retiredAssetRequests.add(requestId);
            assetRequests.delete(requestId);
          }
        }
        retiredAssetContentHashes.add(asset.integritySha256);
      }
      const result = {
        outcome: 'applied', persistence: 'ephemeral', assetId: asset.assetId,
        operation: body.operation, brandUsage: false, deleted: body.operation === 'delete',
        occurredAt: new Date().toISOString(),
      };
      assetRightRequests.set(body.requestId, { fingerprint, result });
      recordAudit(`asset.right:${body.requestId}`, {
        eventType: `asset.${body.operation}`, resourceType: 'asset', resourceId: asset.assetId,
        purpose: 'personal_understanding', decision: body.operation,
        metadata: { requestId: body.requestId, operation: body.operation, reason: body.reason.trim() },
        occurredAt: result.occurredAt,
      });
      return json(result);
    }

    const draftRejection = url.pathname.match(/^\/api\/feedback\/drafts\/([0-9a-f-]{36})\/reject$/i);
    if (request.method === 'POST' && draftRejection?.[1]) {
      const body = await readJson(request);
      if (!validFeedbackRequest(body) || !validText(body.reason, 3, 1000)) {
        return json({ error: 'invalid_feedback_input' }, 400);
      }
      if (!currentDraft || currentDraft.draftId !== draftRejection[1]) {
        return json({ error: 'draft_not_found' }, 404);
      }
      const fingerprint = JSON.stringify({ operation: 'rejected', draftId: draftRejection[1], reason: body.reason.trim() });
      const repeated = reserveFeedbackRequest(body.requestId, fingerprint);
      if (repeated === 'mismatch') return json({ error: 'idempotency_mismatch' }, 409);
      if (!repeated) {
        const occurredAt = new Date().toISOString();
        feedbackEvents.set(`feedback_${body.requestId}`, {
          id: `feedback_${body.requestId}`,
          artifactType: 'draft',
          artifactId: draftRejection[1],
          eventType: 'rejected',
          signalKey: 'draft.rejection_reason',
          signalValue: body.reason.trim(),
          occurredAt,
        });
        recordAudit(`feedback.reject:${body.requestId}`, {
          eventType: 'feedback.draft_rejected', resourceType: 'draft', resourceId: draftRejection[1],
          purpose: 'brand_usage', decision: 'rejected', metadata: { requestId: body.requestId }, occurredAt,
        });
      }
      return json(feedbackSnapshot());
    }

    const preferenceDecision = url.pathname.match(/^\/api\/feedback\/preferences\/([0-9a-f-]{36})\/decision$/i);
    if (request.method === 'POST' && preferenceDecision?.[1]) {
      const body = await readJson(request);
      if (!validFeedbackRequest(body) || !['applied', 'rejected', 'revoked'].includes(body.decision)) {
        return json({ error: 'invalid_feedback_input' }, 400);
      }
      const preference = preferenceProposals.get(preferenceDecision[1]);
      if (!preference) return json({ error: 'preference_not_found' }, 404);
      const fingerprint = JSON.stringify({ operation: 'decide', proposalId: preference.id, decision: body.decision });
      const existingRequest = feedbackRequests.get(body.requestId);
      if (existingRequest) {
        return existingRequest === fingerprint
          ? json(feedbackSnapshot())
          : json({ error: 'idempotency_mismatch' }, 409);
      }
      if (body.decision === 'revoked' ? preference.status !== 'applied' : preference.status !== 'proposed') {
        return json({ error: 'invalid_status' }, 409);
      }
      feedbackRequests.set(body.requestId, fingerprint);
      if (body.decision === 'applied') {
        for (const existing of preferenceProposals.values()) {
          if (existing.id !== preference.id && existing.preferenceKey === preference.preferenceKey && existing.status === 'applied') {
            existing.status = 'revoked';
            existing.decidedAt = new Date().toISOString();
          }
        }
      }
      preference.status = body.decision;
      preference.decidedAt = new Date().toISOString();
      recordAudit(`feedback.preference:${body.requestId}`, {
        eventType: `feedback.preference_${body.decision}`, resourceType: 'preference_proposal',
        resourceId: preference.id, purpose: 'brand_usage', decision: body.decision,
        metadata: { requestId: body.requestId }, occurredAt: preference.decidedAt,
      });
      return json(feedbackSnapshot());
    }

    if (request.method === 'POST' && url.pathname === '/api/drafts') {
      const body = await readJson(request);
      if (!validDraftCreate(body)) return json({ error: 'invalid_draft_input' }, 400);
      const repeated = repeatedDraftRequest(body.requestId, 'create', body);
      if (repeated?.error) return json({ error: repeated.error }, 409);
      if (repeated?.snapshot) {
        if (!currentContentApproval()) {
          return json({ error: 'content_action_not_approved' }, 409);
        }
        if (repeated.snapshot.strategyRevision !== strategy.revision) {
          return json({ error: 'strategy_changed' }, 409);
        }
        const repeatedSource = resolveDraftSource(
          repeated.snapshot.source.kind,
          repeated.snapshot.source.ref,
        );
        if (!repeatedSource) {
          return json({ error: 'source_not_available' }, 409);
        }
        if (!sourceAuthorizedForContentAction(repeatedSource)) {
          return json({ error: 'source_not_authorized_for_action' }, 409);
        }
        return json({ outcome: 'already_applied', ...repeated.snapshot });
      }
      if (!currentContentApproval()) {
        return json({ error: 'content_action_not_approved' }, 409);
      }
      const source = resolveDraftSource(body.sourceKind, body.sourceRef);
      if (!source) return json({ error: 'source_not_available' }, 409);
      if (!sourceAuthorizedForContentAction(source)) {
        return json({ error: 'source_not_authorized_for_action' }, 409);
      }
      const draftId = crypto.randomUUID();
      const claimId = crypto.randomUUID();
      const draftBody = composePlatformDraft(
        body.channel,
        body.narrativeAngle.trim(),
        source.statement,
        body.takeaway.trim(),
        appliedPreferences(),
      );
      const guard = reviewDraftBody(draftBody, body.channel, source.statement, claimId);
      currentDraft = {
        draftId,
        claimId,
        revision: 1,
        strategyRevision: strategy.revision,
        channel: body.channel,
        body: draftBody,
        adaptation: platformAdaptationFor(body.channel, draftBody),
        status: guard.mayRequestApproval ? 'awaiting_approval' : 'guard_failed',
        guard,
        source,
        publicDraftingConsent: true,
        updatedAt: new Date().toISOString(),
      };
      rememberDraftRequest(body.requestId, 'create', body, currentDraft);
      recordAudit(`draft.create:${body.requestId}`, {
        eventType: 'draft.created', resourceType: 'draft', resourceId: draftId,
        purpose: 'public_drafting', decision: guard.classification,
        metadata: { requestId: body.requestId, revision: 1, channel: body.channel }, occurredAt: currentDraft.updatedAt,
      });
      return json({ outcome: 'applied', ...draftSnapshot() });
    }

    const draftEdit = url.pathname.match(/^\/api\/drafts\/([0-9a-f-]{36})$/i);
    if (request.method === 'PUT' && draftEdit?.[1]) {
      const body = await readJson(request);
      if (!validDraftMutation(body) || typeof body.body !== 'string' || body.body.trim().length < 20) {
        return json({ error: 'invalid_draft_input' }, 400);
      }
      const repeated = repeatedDraftRequest(body.requestId, 'edit', { ...body, draftId: draftEdit[1] });
      if (repeated?.error) return json({ error: repeated.error }, 409);
      if (repeated?.snapshot) return json({ outcome: 'already_applied', ...repeated.snapshot });
      const gate = draftMutationGate(draftEdit[1], body.expectedRevision);
      if (gate) return json({ error: gate }, gate === 'draft_not_found' ? 404 : 409);
      const previousBody = currentDraft.body;
      const guard = reviewDraftBody(body.body.trim(), currentDraft.channel, currentDraft.source.statement, currentDraft.claimId);
      currentDraft = {
        ...currentDraft,
        revision: currentDraft.revision + 1,
        body: body.body.trim(),
        adaptation: platformAdaptationFor(currentDraft.channel, body.body.trim()),
        status: guard.mayRequestApproval ? 'awaiting_approval' : 'guard_failed',
        guard,
        approvedAt: undefined,
        exportedAt: undefined,
        updatedAt: new Date().toISOString(),
      };
      rememberDraftRequest(body.requestId, 'edit', { ...body, draftId: draftEdit[1] }, currentDraft);
      recordEditFeedback(body.requestId, currentDraft.draftId, previousBody, currentDraft.body);
      recordAudit(`draft.edit:${body.requestId}`, {
        eventType: 'draft.edited', resourceType: 'draft', resourceId: currentDraft.draftId,
        purpose: 'public_drafting', decision: guard.classification,
        metadata: { requestId: body.requestId, revision: currentDraft.revision }, occurredAt: currentDraft.updatedAt,
      });
      return json({ outcome: 'applied', ...draftSnapshot() });
    }

    const draftTransition = url.pathname.match(/^\/api\/drafts\/([0-9a-f-]{36})\/(approve|export)$/i);
    if (request.method === 'POST' && draftTransition?.[1] && draftTransition[2]) {
      const body = await readJson(request);
      if (!validDraftMutation(body)) return json({ error: 'invalid_draft_input' }, 400);
      const operation = draftTransition[2];
      const requestValue = { ...body, draftId: draftTransition[1] };
      const repeated = repeatedDraftRequest(body.requestId, operation, requestValue);
      if (repeated?.error) return json({ error: repeated.error }, 409);
      if (repeated?.snapshot) {
        if (currentDraft?.strategyRevision !== strategy.revision) return json({ error: 'strategy_changed' }, 409);
        if (currentDraft && governedClaimStatus(currentDraft.claimId, 'verified') !== 'verified') {
          return json({ error: 'claim_not_verified' }, 409);
        }
        const repeatedSource = resolveDraftSource(currentDraft.source.kind, currentDraft.source.ref);
        if (!repeatedSource) {
          return json({ error: 'source_not_available' }, 409);
        }
        if (!sourceAuthorizedForContentAction(repeatedSource)) {
          return json({ error: 'source_not_authorized_for_action' }, 409);
        }
        return operation === 'export'
          ? json(exportPayload('already_applied', repeated.snapshot))
          : json({ outcome: 'already_applied', ...repeated.snapshot });
      }
      const gate = draftMutationGate(draftTransition[1], body.expectedRevision);
      if (gate) return json({ error: gate }, gate === 'draft_not_found' ? 404 : 409);
      if (operation === 'approve') {
        if (!currentDraft.guard.mayRequestApproval) return json({ error: 'guard_failed' }, 409);
        currentDraft = {
          ...currentDraft,
          revision: currentDraft.revision + 1,
          status: 'approved',
          approvedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        rememberDraftRequest(body.requestId, operation, requestValue, currentDraft);
        recordAudit(`draft.approve:${body.requestId}`, {
          eventType: 'draft.approved', resourceType: 'draft', resourceId: currentDraft.draftId,
          purpose: 'public_drafting', decision: 'approved',
          metadata: { requestId: body.requestId, revision: currentDraft.revision }, occurredAt: currentDraft.updatedAt,
        });
        return json({ outcome: 'applied', ...draftSnapshot() });
      }
      if (currentDraft.status !== 'approved') return json({ error: 'draft_not_approved' }, 409);
      currentDraft = {
        ...currentDraft,
        revision: currentDraft.revision + 1,
        status: 'exported',
        exportedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      rememberDraftRequest(body.requestId, operation, requestValue, currentDraft);
      recordAudit(`draft.export:${body.requestId}`, {
        eventType: 'draft.exported', resourceType: 'draft', resourceId: currentDraft.draftId,
        purpose: 'public_drafting', decision: 'exported',
        metadata: { requestId: body.requestId, revision: currentDraft.revision, channel: currentDraft.channel }, occurredAt: currentDraft.updatedAt,
      });
      return json(exportPayload('applied', draftSnapshot()));
    }

    if (request.method === 'PUT' && url.pathname === '/api/strategy') {
      const body = await readJson(request);
      if (!validStrategyRequest(body)) return json({ error: 'invalid_strategy_context' }, 400);
      const fingerprint = JSON.stringify({
        expectedRevision: body.expectedRevision,
        value: body.value,
      });
      const existing = strategyRequests.get(body.requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return json({ error: 'idempotency_mismatch' }, 409);
        return json({ outcome: 'already_saved', ...existing.snapshot });
      }
      if (body.expectedRevision !== strategy.revision) {
        return json({ error: 'revision_changed' }, 409);
      }
      const revision = strategy.revision + 1;
      strategy = {
        ...body.value,
        revision,
        updatedAt: new Date().toISOString(),
        persistence: 'ephemeral',
        goalId: `goal_revision_${revision}`,
        positioningId: `positioning_revision_${revision}`,
      };
      approval = null;
      strategyRequests.set(body.requestId, { fingerprint, snapshot: strategy });
      recordAudit(`strategy.save:${body.requestId}`, {
        eventType: 'strategy.context_saved', resourceType: 'strategy_context', resourceId: strategy.goalId,
        purpose: 'strategy_reasoning', decision: 'saved',
        metadata: { requestId: body.requestId, revision }, occurredAt: strategy.updatedAt,
      });
      return json({ outcome: 'saved', ...strategy });
    }

    if (request.method === 'PUT' && url.pathname === '/api/decision-context') {
      const body = await readJson(request);
      if (!validDecisionContextRequest(body)) return json({ error: 'invalid_decision_context' }, 400);
      const normalizedBudget = canonicalDecisionContextBudget(body.value.attentionBudget);
      const fingerprint = JSON.stringify({
        expectedRevision: body.expectedRevision,
        value: { attentionBudget: normalizedBudget },
      });
      const existing = decisionContextRequests.get(body.requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return json({ error: 'idempotency_mismatch' }, 409);
        return json({ outcome: 'already_saved', ...existing.snapshot });
      }
      if (body.expectedRevision !== decisionContext.revision) {
        return json({ error: 'revision_changed' }, 409);
      }
      const revision = decisionContext.revision + 1;
      const contextHash = await sha256Hex(JSON.stringify({
        policyVersion: 'decision-context-v1',
        revision,
        attentionBudget: normalizedBudget,
      }));
      decisionContext = {
        policyVersion: 'decision-context-v1', revision, contextHash,
        updatedAt: new Date().toISOString(), persistence: 'ephemeral',
        attentionBudget: normalizedBudget,
      };
      approval = null;
      decisionContextRequests.set(body.requestId, { fingerprint, snapshot: decisionContext });
      recordAudit(`decision-context.save:${body.requestId}`, {
        eventType: 'decision.context_saved', resourceType: 'decision_context', resourceId: 'owner_primary',
        purpose: 'strategy_reasoning', decision: 'saved',
        metadata: { requestId: body.requestId, revision, contextHash }, occurredAt: decisionContext.updatedAt,
      });
      return json({ outcome: 'saved', ...decisionContext });
    }

    if (request.method === 'GET' && url.pathname === '/api/memory') {
      return json(memorySnapshot());
    }

    if (request.method === 'POST' && url.pathname === '/api/workbench/approval') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid_json' }, 400);
      }
      if (
        typeof body?.actionId !== 'string' || !Number.isSafeInteger(body.expectedStrategyRevision) ||
        !Number.isSafeInteger(body.expectedDecisionContextRevision) ||
        typeof body.expectedDecisionContextHash !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(body.expectedDecisionContextHash) ||
        typeof body.expectedDecisionWindowEndsAt !== 'string'
      ) return json({ error: 'invalid_approval_context' }, 400);
      const decisionWindowEndsAt = new Date(body.expectedDecisionWindowEndsAt);
      const approvedAt = new Date();
      if (body.expectedStrategyRevision !== strategy.revision) {
        return json({ error: 'strategy_changed' }, 409);
      }
      if (
        body.expectedDecisionContextRevision !== decisionContext.revision ||
        body.expectedDecisionContextHash !== decisionContext.contextHash
      ) return json({ error: 'decision_context_changed' }, 409);
      if (Number.isNaN(decisionWindowEndsAt.getTime()) || decisionWindowEndsAt <= approvedAt) {
        return json({ error: 'decision_expired' }, 409);
      }
      const context = ownerEvidenceContext();
      const action = workbenchActions(context, approvedAt).find((candidate) => candidate.id === body.actionId);
      if (!action) return json({ error: 'action_not_found' }, 404);
      if (action.interaction !== 'approve') {
        return json({ error: 'action_not_approvable' }, 409);
      }
      if (context.strategy.evidenceIds.length === 0 && action.id !== 'wait') {
        return json({ error: 'insufficient_evidence' }, 409);
      }
      const risk = await assessRiskAction(action);
      const riskReview = riskReviews.get(action.id);
      if (risk.level === 'red' || (riskReview && riskReview.assessmentHash === risk.assessmentHash && riskReview.decision !== 'acknowledge')) {
        return json({ error: 'risk_blocked' }, 409);
      }
      if (risk.level === 'yellow' && (!riskReview || riskReview.assessmentHash !== risk.assessmentHash || riskReview.decision !== 'acknowledge')) {
        return json({ error: 'risk_review_required' }, 409);
      }
      if (approval && (
        approval.strategyRevision !== strategy.revision ||
        approval.decisionContextRevision !== decisionContext.revision ||
        approval.decisionContextHash !== decisionContext.contextHash ||
        new Date(approval.decisionWindowEndsAt) <= approvedAt
      )) approval = null;
      if (approval && approval.actionId !== action.id) {
        return json({ error: 'different_action_approved' }, 409);
      }
      approval ??= {
        actionId: action.id,
        evidenceIds: [...action.evidenceIds],
        approvedAt: approvedAt.toISOString(),
        strategyRevision: strategy.revision,
        decisionContextRevision: decisionContext.revision,
        decisionContextHash: decisionContext.contextHash,
        decisionWindowEndsAt: body.expectedDecisionWindowEndsAt,
      };
      recordAudit(`workbench.approve:workbench_today:${action.id}`, {
        eventType: 'workbench.action_approved', resourceType: 'workbench', resourceId: 'workbench_today',
        purpose: 'strategy_reasoning', decision: 'approved',
        metadata: {
          actionId: action.id, revision: 2, strategyRevision: strategy.revision,
          decisionContextRevision: decisionContext.revision,
          decisionContextHash: decisionContext.contextHash,
        }, occurredAt: approval.approvedAt,
      });
      return json(snapshot());
    }

    if (request.method === 'POST' && url.pathname === '/api/conversations/turns') {
      const body = await readJson(request);
      if (!body) return json({ error: 'invalid_json' }, 400);
      if (
        typeof body.conversationId !== 'string' ||
        typeof body.turnId !== 'string' ||
        typeof body.text !== 'string' ||
        typeof body.proposeMemory !== 'boolean' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/u.test(body.conversationId) ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,47}$/u.test(body.turnId) ||
        body.text.trim().length < 3 ||
        body.text.trim().length > 5000
      ) {
        return json({ error: 'invalid_conversation_input' }, 400);
      }
      const text = body.text.trim();
      const orchestrated = orchestrateConversationTurn(body.turnId, text, body.proposeMemory);
      const shouldProposeMemory = body.proposeMemory && orchestrated.orchestration.safety.memoryProposalAllowed;
      if (orchestrated.orchestration.retention.turn === 'confidential') {
        const turnKey = `${body.conversationId}:${body.turnId}`;
        const fingerprint = await sha256(JSON.stringify({
          conversationId: body.conversationId,
          text,
          proposeMemory: shouldProposeMemory,
          orchestration: orchestrated.orchestration,
        }));
        const existingTurn = conversationTurns.get(turnKey);
        if (existingTurn && existingTurn !== fingerprint) {
          return json({ error: 'memory_proposal_conflict' }, 409);
        }
        conversationTurns.set(turnKey, fingerprint);
      }
      if (!shouldProposeMemory) {
        return json({
          ...orchestrated,
        });
      }
      const id = `memory_${body.turnId}`;
      const existing = memoryProposals.get(id);
      if (existing && existing.text !== text) {
        return json({ error: 'memory_proposal_conflict' }, 409);
      }
      const proposal = existing ?? {
        id,
        text,
        epistemicType: 'self_report',
        dataClass: 'confidential',
        status: 'awaiting_user_confirmation',
        occurredAt: new Date().toISOString(),
      };
      memoryProposals.set(id, proposal);
      recordAudit(`memory.proposal:${body.turnId}`, {
        eventType: 'memory.proposal_created', resourceType: 'memory_proposal', resourceId: id,
        purpose: 'personal_understanding', decision: 'awaiting_confirmation',
        metadata: { conversationId: body.conversationId, turnId: body.turnId }, occurredAt: proposal.occurredAt,
      });
      return json({
        ...orchestrated,
        memoryProposal: withoutText(proposal),
      });
    }

    const confirmation = url.pathname.match(
      /^\/api\/memory\/proposals\/([a-zA-Z0-9][a-zA-Z0-9_-]{2,63})\/confirm$/,
    );
    if (request.method === 'POST' && confirmation?.[1]) {
      const proposal = memoryProposals.get(confirmation[1]);
      if (!proposal) return json({ error: 'memory_proposal_not_found' }, 404);
      const body = await readJson(request);
      const permissions = body?.permissions;
      if (
        permissions?.personalUnderstanding !== true ||
        typeof permissions?.brandUsage !== 'boolean' ||
        permissions?.publicUsage !== false
      ) {
        return json({ error: 'memory_permission_denied' }, 403);
      }
      proposal.confirmedAt ??= new Date().toISOString();
      proposal.activeAssertionId ??= `assertion_${proposal.id.slice('memory_'.length)}`;
      proposal.revisionCount ??= 1;
      proposal.updatedAt ??= proposal.confirmedAt;
      proposal.permissions ??= permissions;
      recordAudit(`memory.confirm:${proposal.id}`, {
        eventType: 'memory.proposal_confirmed', resourceType: 'assertion', resourceId: proposal.activeAssertionId,
        purpose: 'personal_understanding', decision: 'confirmed',
        metadata: { proposalId: proposal.id, permissions }, occurredAt: proposal.confirmedAt,
      });
      return json({
        assertion: {
          id: proposal.activeAssertionId,
          epistemicType: 'self_report',
          dataClass: 'confidential',
        },
        permissions,
        confirmedAt: proposal.confirmedAt,
        persistence: 'ephemeral',
      });
    }

    const memoryRight = url.pathname.match(
      /^\/api\/memory\/proposals\/([a-zA-Z0-9][a-zA-Z0-9_-]{2,63})\/rights$/,
    );
    if (request.method === 'POST' && memoryRight?.[1]) {
      const proposal = memoryProposals.get(memoryRight[1]);
      if (!proposal?.confirmedAt) return json({ error: 'memory_proposal_not_found' }, 404);
      const body = await readJson(request);
      if (!body) return json({ error: 'invalid_json' }, 400);
      if (
        typeof body.requestId !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) ||
        !['correct', 'contest', 'delete', 'revoke'].includes(body.operation) ||
        typeof body.reason !== 'string' ||
        body.reason.trim().length < 3 ||
        (body.operation === 'correct' && (
          typeof body.correctedText !== 'string' || body.correctedText.trim().length < 3
        ))
      ) {
        return json({ error: 'invalid_memory_right' }, 400);
      }
      const fingerprint = JSON.stringify({
        proposalId: proposal.id,
        operation: body.operation,
        reason: body.reason.trim(),
        ...(body.operation === 'correct'
          ? { correctedText: body.correctedText.trim() }
          : {}),
      });
      const existing = memoryRightRequests.get(body.requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return json({ error: 'memory_proposal_conflict' }, 409);
        }
        return json({ ...existing.result, outcome: 'already_applied' });
      }
      if (proposal.deleted && body.operation !== 'delete' && body.operation !== 'revoke') {
        return json({ error: 'memory_proposal_conflict' }, 409);
      }
      if (body.operation === 'correct') {
        proposal.text = body.correctedText.trim();
        proposal.activeAssertionId = `assertion_${body.requestId}`;
        proposal.activeEvidenceId = `evidence_${body.requestId}`;
        proposal.contestedReason = undefined;
        proposal.contestedAt = undefined;
        proposal.revisionCount = (proposal.revisionCount ?? 1) + 1;
      } else if (body.operation === 'contest') {
        if (proposal.contestedReason && proposal.contestedReason !== body.reason.trim()) {
          return json({ error: 'memory_proposal_conflict' }, 409);
        }
        proposal.contestedReason = body.reason.trim();
        proposal.contestedAt = new Date().toISOString();
      } else if (body.operation === 'revoke') {
        proposal.permissionsRevoked = true;
        proposal.revokedAt = new Date().toISOString();
      } else {
        proposal.deleted = true;
        proposal.deletedAt = new Date().toISOString();
        proposal.deletionReason = body.reason.trim();
        proposal.permissionsRevoked = true;
        proposal.revokedAt = proposal.deletedAt;
      }
      proposal.updatedAt = new Date().toISOString();
      const result = {
        outcome: 'applied',
        operation: body.operation,
        proposalId: proposal.id,
        requestId: body.requestId,
        activeAssertionId: proposal.activeAssertionId,
        permissionsRevoked: body.operation === 'revoke' || body.operation === 'delete',
        occurredAt: new Date().toISOString(),
        persistence: 'ephemeral',
      };
      memoryRightRequests.set(body.requestId, { fingerprint, result });
      recordAudit(`memory.right:${body.requestId}`, {
        eventType: `memory.${body.operation}`, resourceType: 'memory_proposal', resourceId: proposal.id,
        purpose: 'personal_understanding', decision: body.operation,
        metadata: { requestId: body.requestId, permissionsRevoked: result.permissionsRevoked }, occurredAt: result.occurredAt,
      });
      return json(result);
    }

    return env.ASSETS.fetch(request);
  },
};

function snapshot() {
  const generatedAt = new Date();
  const context = ownerEvidenceContext();
  const currentApproval = approval &&
    approval.strategyRevision === strategy.revision &&
    approval.decisionContextRevision === decisionContext.revision &&
    approval.decisionContextHash === decisionContext.contextHash &&
    new Date(approval.decisionWindowEndsAt) > generatedAt
    ? approval
    : null;
  const effectiveApproval = context.strategy.evidenceIds.length > 0 || currentApproval?.actionId === 'wait'
    ? currentApproval
    : null;
  return {
    policyVersion: 'strategic-decision-v1',
    generatedAt: generatedAt.toISOString(),
    runtime: { source: 'preview_worker', persistence: 'ephemeral' },
    profile: {
      maturityPercent: context.maturity.percent,
      evidenceCount: context.maturity.evidenceCount,
      openContradictions: context.openContradictions,
    },
    goal: {
      id: strategy.goalId,
      revision: strategy.revision,
      title: strategy.goal.title,
      outcome: strategy.goal.outcome,
      successMetrics: strategy.goal.successMetrics,
    },
    attentionBudget: decisionContext.attentionBudget,
    decisionContext,
    decisionFrame: strategicDecisionFrame(generatedAt),
    evidence: {
      state: context.strategy.evidenceIds.length > 0 ? 'grounded' : 'insufficient',
      strategyEvidenceCount: context.strategy.evidenceIds.length,
      withheldEvidenceCount: context.strategy.withheldEvidenceCount,
      sourceTypes: context.strategy.sourceTypes,
    },
    actions: workbenchActions(context, generatedAt),
    workflow: {
      id: 'workbench_today',
      status: effectiveApproval ? 'approved' : 'awaiting_approval',
      revision: effectiveApproval ? 2 : 1,
      ...(effectiveApproval
        ? {
            approvedActionId: effectiveApproval.actionId,
            approvedEvidenceIds: effectiveApproval.evidenceIds,
            approvedAt: effectiveApproval.approvedAt,
          }
        : {}),
    },
  };
}

function assetSnapshot() {
  const records = [...textAssets.values()]
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
  return {
    generatedAt: new Date().toISOString(),
    persistence: 'ephemeral',
    summary: {
      assets: records.length, evidenceItems: records.length, assertions: records.length,
      dataRights: assetRightRequests.size,
    },
    records,
  };
}

function modelMaturity() {
  const assets = assetSnapshot();
  const memory = memorySnapshot();
  const activeMemory = memory.records.filter((record) => record.lifecycle.status === 'active');
  const controlledMemory = memory.records.some((record) => record.lifecycle.status !== 'active');
  const exercisedDataControl = controlledMemory || assetRightRequests.size > 0;
  const sourceTypes = new Set([
    ...assets.records.map((record) => record.sourceType),
    ...activeMemory.flatMap((record) => record.provenance.sourceTypes),
  ]);
  const components = {
    importedEvidence: Math.min(45, assets.summary.evidenceItems * 15),
    confirmedSelfReports: Math.min(30, activeMemory.length * 10),
    sourceDiversity: Math.min(15, sourceTypes.size * 8),
    exercisedDataControl: exercisedDataControl ? 10 : 0,
  };
  return {
    percent: Math.min(100, Object.values(components).reduce((total, value) => total + value, 0)),
    evidenceCount: assets.summary.evidenceItems + activeMemory.reduce(
      (total, record) => total + record.provenance.evidenceCount, 0,
    ),
    sourceTypes: [...sourceTypes].sort(),
    components,
    nextStep: assets.summary.assets === 0
      ? 'یک یادداشت یا متن واقعی وارد کنید.'
      : activeMemory.length === 0
        ? 'یک برداشت گفت‌وگویی را تأیید یا اصلاح کنید.'
        : sourceTypes.size < 2
          ? 'یک شاهد از نوع متفاوت اضافه کنید.'
          : 'مدل را با اصلاح‌ها و شواهد مستقل دقیق‌تر کنید.',
  };
}

function onboardingSnapshot() {
  const context = ownerEvidenceContext();
  return {
    generatedAt: new Date().toISOString(),
    persistence: 'ephemeral',
    modelMaturity: context.maturity,
    strategyReadiness: {
      ready: context.strategy.evidenceIds.length > 0,
      evidenceCount: context.strategy.evidenceIds.length,
      withheldEvidenceCount: context.strategy.withheldEvidenceCount,
      sourceTypes: context.strategy.sourceTypes,
    },
    assets: assetSnapshot(),
  };
}

function ownerEvidenceContext() {
  const assets = assetSnapshot();
  const memory = memorySnapshot();
  const activeMemory = memory.records.filter((record) => record.lifecycle.status === 'active');
  const strategyAssets = assets.records.filter((record) => record.permissions.brandUsage);
  const strategyMemory = activeMemory.filter((record) => record.consent.brandUsage);
  const evidenceIds = distinct([
    ...strategyAssets.map((record) => record.evidenceId),
    ...strategyMemory.flatMap((record) => record.provenance.evidenceIds),
  ]);
  const assertionIds = distinct([
    ...strategyAssets.map((record) => record.assertionId),
    ...strategyMemory.map((record) => record.assertionId),
  ]);
  const sourceTypes = distinct([
    ...strategyAssets.map((record) => record.sourceType),
    ...strategyMemory.flatMap((record) => record.provenance.sourceTypes),
  ]);
  const maturity = modelMaturity();
  return {
    maturity,
    strategy: {
      evidenceIds,
      assertionIds,
      sourceTypes,
      withheldEvidenceCount: Math.max(0, maturity.evidenceCount - evidenceIds.length),
    },
    openContradictions: memory.records.filter((record) => record.lifecycle.status === 'contested').length,
  };
}

function workbenchActions(context, generatedAt) {
  if (context.strategy.evidenceIds.length === 0) return coldStartActions(context, generatedAt);
  return rankGroundedActions().map((action) => {
    const evidenceIds = action.kind === 'content'
      ? context.strategy.evidenceIds
      : context.strategy.evidenceIds.slice(0, action.kind === 'no_action' ? 1 : 2);
    const evidenceCount = evidenceIds.length;
    return {
      ...action,
      rationale: contextualRationale(action, evidenceCount),
      evidenceIds,
      evidenceCount,
      confidence: Math.min(action.confidence, 0.5 + Math.min(0.3, evidenceCount * 0.1)),
      evidenceState: 'grounded',
      evidenceSourceTypes: context.strategy.sourceTypes,
      interaction: 'approve',
      decision: strategicActionDecision(action, generatedAt, evidenceCount, false),
    };
  });
}

function rankGroundedActions() {
  const budget = decisionContext.attentionBudget;
  const evaluated = groundedActions.map((action) => {
    const reasons = [];
    if (action.attentionCostMinutes > budget.availableMinutes) reasons.push('attention_time_exceeded');
    if (action.energyCost > budget.maximumEnergyCost) reasons.push('energy_exceeded');
    if (action.attentionDemand > budget.attentionCapacity) reasons.push('attention_capacity_exceeded');
    if (action.visibilityCost > budget.visibilityTolerance) reasons.push('visibility_tolerance_exceeded');
    if (action.emotionalCost > budget.emotionalBandwidth) reasons.push('emotional_bandwidth_exceeded');
    const feasible = reasons.length === 0;
    return {
      ...action,
      feasible,
      feasibilityReasons: feasible ? ['within_budget'] : reasons,
      utilityScore: feasible ? action.utilityScore : Number.NEGATIVE_INFINITY,
    };
  });
  const best = Math.max(...evaluated.map((action) => action.utilityScore));
  return evaluated
    .sort((left, right) => right.utilityScore - left.utilityScore)
    .map((action, index) => ({
      ...action,
      utilityScore: action.feasible ? action.utilityScore : null,
      opportunityCost: action.feasible ? Math.round((best - action.utilityScore) * 10) / 10 : null,
      rank: index + 1,
    }));
}

function coldStartActions(context, generatedAt) {
  const withheld = context.strategy.withheldEvidenceCount;
  return [
    {
      id: 'collect_evidence', kind: 'research', title: 'یک منبع واقعی برای تحلیل برند وارد کن',
      rationale: withheld > 0
        ? `${String(withheld)} شاهد فقط برای فهم شخصی ثبت شده، اما برای تحلیل برند مجوز ندارد.`
        : 'هنوز هیچ شاهد مالک‌محور و مجازی برای تحلیل برند وجود ندارد؛ قبل از پیشنهاد حرکت بیرونی، یک منبع واقعی ثبت کنید.',
      benefits: ['ساخت پایه قابل‌ردیابی برای تصمیم بعدی'], risks: ['ورود متن نامرتبط یا بیش‌ازحد حساس'],
      prerequisites: ['انتخاب یک متن واقعی', 'تعیین صریح مجوز تحلیل برند'], evidenceIds: [], evidenceCount: 0,
      confidence: 1, riskLevel: 'low', attentionCostMinutes: 10, energyCost: 1,
      attentionDemand: 2, visibilityCost: 1, emotionalCost: 1,
      feasible: true, feasibilityReasons: ['within_budget'],
      utilityScore: null, opportunityCost: null, rank: 1, evidenceState: 'insufficient',
      evidenceSourceTypes: [], interaction: 'open_intake',
      decision: strategicActionDecision({ kind: 'research', feasible: true, feasibilityReasons: ['within_budget'] }, generatedAt, 0, true),
    },
    {
      id: 'reflect_first', kind: 'private_conversation', title: 'یک تجربه واقعی را در گفت‌وگو ثبت کن',
      rationale: 'اگر منبع آماده‌ای ندارید، یک تجربه مشخص را تعریف کنید؛ سیستم فقط با تأیید جداگانه آن را به حافظه تبدیل می‌کند.',
      benefits: ['شروع کم‌اصطکاک مدل شخصی'], risks: ['یک Self-report منفرد هنوز شاهد مستقل نیست'],
      prerequisites: ['تعریف یک موقعیت مشخص', 'تأیید جداگانه حافظه'], evidenceIds: [], evidenceCount: 0,
      confidence: 1, riskLevel: 'low', attentionCostMinutes: 8, energyCost: 1,
      attentionDemand: 2, visibilityCost: 1, emotionalCost: 2,
      feasible: true, feasibilityReasons: ['within_budget'],
      utilityScore: null, opportunityCost: null, rank: 2, evidenceState: 'insufficient',
      evidenceSourceTypes: [], interaction: 'open_conversation',
      decision: strategicActionDecision({ kind: 'private_conversation', feasible: true, feasibilityReasons: ['within_budget'] }, generatedAt, 0, true),
    },
    {
      id: 'wait', kind: 'no_action', title: 'تا رسیدن شاهد، اقدام عمومی نکن',
      rationale: `برای هدف «${strategy.goal.title}» هنوز Evidence مجاز کافی وجود ندارد؛ خودداری از توصیه عمومی از ساختن قطعیت کاذب معتبرتر است.`,
      benefits: ['پرهیز از توصیه و ادعای بدون پشتوانه'], risks: ['عقب‌افتادن یک پنجره زمانی کوتاه'],
      prerequisites: ['بازبینی پس از ورود اولین منبع مجاز'], evidenceIds: [], evidenceCount: 0,
      confidence: 1, riskLevel: 'low', attentionCostMinutes: 0, energyCost: 1,
      attentionDemand: 1, visibilityCost: 1, emotionalCost: 1,
      feasible: true, feasibilityReasons: ['within_budget'],
      utilityScore: null, opportunityCost: null, rank: 3, evidenceState: 'insufficient',
      evidenceSourceTypes: [], interaction: 'approve',
      decision: strategicActionDecision({ kind: 'no_action', feasible: true, feasibilityReasons: ['within_budget'] }, generatedAt, 0, true),
    },
  ];
}

function strategicDecisionFrame(generatedAt) {
  const expiresAt = new Date(generatedAt.getTime() + 86400000).toISOString();
  return {
    policyVersion: 'strategic-decision-v1',
    why: { goalId: strategy.goalId, objective: strategy.goal.outcome },
    forWhom: strategy.desiredPositioning.audience,
    currentContext: { ...decisionContext.attentionBudget },
    contextBinding: {
      strategyRevision: strategy.revision,
      decisionContextRevision: decisionContext.revision,
      decisionContextHash: decisionContext.contextHash,
      decisionContextUpdatedAt: decisionContext.updatedAt,
    },
    decisionWindow: { generatedAt: generatedAt.toISOString(), expiresAt, durationHours: 24 },
    rankingTransparency: {
      method: 'declared_weighted_policy',
      dimensions: ['benefit', 'strategic_fit', 'risk', 'reversibility', 'confidence', 'attention'],
      utilityScoreVisible: true, opportunityCostVisible: true, hiddenScoreUsed: false,
    },
    boundaries: { platformConstrained: false, publicApprovalGranted: false, externalActionPermitted: false },
  };
}

function strategicActionDecision(action, generatedAt, evidenceCount, coldStart) {
  const expiresAt = new Date(generatedAt.getTime() + 86400000).toISOString();
  const posture = action.kind === 'no_action' ? 'delay' : (!action.feasible || coldStart) ? 'when_ready' : 'now';
  const timingRationale = coldStart
    ? 'این مسیر فقط پس از ورود Evidence مجاز دوباره سنجیده می‌شود.'
    : action.kind === 'no_action'
      ? 'عدم اقدام تا Snapshot بعدی یک انتخاب آگاهانه و قابل بازگشت است.'
      : posture === 'when_ready'
        ? 'حداقل یکی از محدودیت‌های Attention Budget فعلی رعایت نشده است.'
        : 'Action در بودجه فعلی جا می‌گیرد، اما اجرا همچنان به تصمیم انسانی نیاز دارد.';
  return {
    policyVersion: 'strategic-decision-v1',
    strategyRevision: strategy.revision,
    decisionContextRevision: decisionContext.revision,
    decisionContextHash: decisionContext.contextHash,
    objective: strategy.goal.outcome,
    stakeholder: strategy.desiredPositioning.audience,
    posture,
    timingRationale,
    decisionWindowEndsAt: expiresAt,
    format: strategicDecisionFormat(action.kind),
    platformSelected: false,
    assumptions: coldStart
      ? ['Evidence مجاز کافی برای توصیه بیرونی هنوز وجود ندارد.', 'عدم اقدام از ساختن قطعیت یا تجربه جعلی معتبرتر است.']
      : [`${String(evidenceCount)} Evidence مجاز، Context فعلی این پیشنهاد را پشتیبانی می‌کند.`, 'Attention Budget فعلی خوداظهاری و فقط برای این پنجره تصمیم معتبر است.'],
    uncertainty: strategicDecisionUncertainty(action.kind, coldStart),
    feasibilityReasons: action.feasibilityReasons,
    requiredApproval: 'human',
    measurementPlan: { signals: strategicMeasurementSignals(action.kind), reviewAfter: expiresAt },
    boundaries: { recommendationIsExecution: false, publicApprovalGranted: false, externalActionPermitted: false },
  };
}

function strategicDecisionFormat(kind) {
  return {
    no_action: 'none', private_conversation: 'private_conversation', relationship: 'relationship_action',
    content: 'mother_concept', media: 'media_response', event: 'event_participation', research: 'research_brief',
  }[kind];
}

function strategicDecisionUncertainty(kind, coldStart) {
  if (coldStart) return ['تناسب Action با هویت، مخاطب و زمان بدون Evidence کافی معلوم نیست.'];
  if (kind === 'content') return ['واکنش واقعی Stakeholder و نتیجه بیرونی هنوز مشاهده نشده است.', 'Platform، Claim، Voice و Risk Gate پس از انتخاب Mother Concept جداگانه بررسی می‌شوند.'];
  if (kind === 'no_action') return ['ممکن است یک پنجره زمانی کوتاه پیش از Snapshot بعدی بسته شود.'];
  return ['واکنش واقعی Stakeholder و نتیجه بیرونی هنوز مشاهده نشده است.', 'زمان‌بندی انسانی و آمادگی طرف مقابل باید پیش از اجرا دوباره بررسی شود.'];
}

function strategicMeasurementSignals(kind) {
  const signals = {
    no_action: ['رضایت کاربر از سکوت', 'پشیمانی کاربر', 'انرژی حفظ‌شده'],
    private_conversation: ['عمق تعامل', 'تغییر رابطه', 'فرصت ایجادشده'],
    relationship: ['تغییر رابطه', 'کیفیت تعامل', 'رضایت کاربر'],
    content: ['کیفیت تعامل', 'تغییر ادراک', 'پیام خصوصی', 'پشیمانی کاربر'],
    media: ['کیفیت پوشش', 'تغییر ادراک', 'فرصت رسانه‌ای'],
    event: ['کیفیت ارتباط', 'رابطه ایجادشده', 'فرصت بعدی'],
    research: ['کیفیت Source', 'رفع عدم‌قطعیت', 'تصمیم قابل‌ردیابی'],
  }[kind] ?? [];
  return [...new Set([...strategy.goal.successMetrics, ...signals])].slice(0, 8);
}

function stableStrategicDecision(action) {
  return {
    policyVersion: action.decision.policyVersion,
    strategyRevision: action.decision.strategyRevision,
    decisionContextRevision: action.decision.decisionContextRevision,
    decisionContextHash: action.decision.decisionContextHash,
    objective: action.decision.objective,
    stakeholder: action.decision.stakeholder,
    posture: action.decision.posture,
    format: action.decision.format,
    platformSelected: action.decision.platformSelected,
    assumptions: action.decision.assumptions,
    uncertainty: action.decision.uncertainty,
    feasibilityReasons: action.decision.feasibilityReasons,
    requiredApproval: action.decision.requiredApproval,
    measurementSignals: action.decision.measurementPlan.signals,
    boundaries: action.decision.boundaries,
  };
}

function contextualRationale(action, evidenceCount) {
  if (action.kind === 'private_conversation') {
    return `با اتکا به ${String(evidenceCount)} شاهد مجاز و برای هدف «${strategy.goal.title}»، یک تعامل عمیق با ${strategy.desiredPositioning.audience} از چند انتشار عمومی ارزشمندتر است.`;
  }
  if (action.kind === 'content') {
    return `${String(evidenceCount)} شاهد مجاز در دسترس است؛ این اقدام باید ادراک «${strategy.desiredPositioning.desiredPerception}» را فقط با ادعاهای قابل‌ردیابی پشتیبانی کند.`;
  }
  return `با وجود ${String(evidenceCount)} شاهد مجاز، عدم اقدام نیز نسبت به هدف «${strategy.goal.title}» یک گزینه آگاهانه است؛ کیفیت برند نباید قربانی پرکردن تقویم شود.`;
}

const riskDimensions = [
  'consent', 'privacy', 'data_access', 'sensitive_data', 'third_party_privacy',
  'reputation_risk', 'misinterpretation', 'manipulation', 'defamation',
  'conflict_of_interest', 'disclosure', 'authenticity', 'security',
  'public_exposure', 'long_term_consequences',
];

async function riskSnapshot() {
  const assessments = await Promise.all(snapshot().actions.map(async (action) => {
    const assessment = await assessRiskAction(action);
    return applyRiskReview(assessment, riskReviews.get(action.id));
  }));
  const claims = claimGovernanceSnapshot();
  return {
    generatedAt: new Date().toISOString(), persistence: 'ephemeral', policyVersion: 'brand-protection-v1',
    summary: {
      totalActions: assessments.length,
      green: assessments.filter((item) => item.level === 'green').length,
      yellow: assessments.filter((item) => item.level === 'yellow').length,
      red: assessments.filter((item) => item.level === 'red').length,
      reviewRequired: assessments.filter((item) => item.gate === 'review_required').length,
      blocked: assessments.filter((item) => item.gate === 'blocked').length,
    },
    claimPosture: {
      totalClaims: claims.summary.totalClaims, verified: claims.summary.verified,
      traceBlocked: claims.summary.traceBlocked, publicReady: claims.summary.publicReady,
      note: 'Claim Governance یک Gate مستقل است؛ Risk acknowledgement هرگز Claim را Verify نمی‌کند.',
    },
    assessments,
  };
}

async function assessRiskAction(action) {
  const findings = new Map(riskDimensions.map((dimension) => [dimension, {
    dimension, level: 'green', code: 'no_material_signal',
    rationale: 'در داده فعلی نشانه مادی برای این بُعد دیده نشد؛ این نتیجه جایگزین بررسی انسانی نیست.',
    mitigation: 'در صورت تغییر Context، ارزیابی را دوباره اجرا کنید.',
  }]));
  const rank = { green: 0, yellow: 1, red: 2 };
  const set = (dimension, level, code, rationale, mitigation) => {
    const current = findings.get(dimension);
    if (!current || rank[level] >= rank[current.level]) findings.set(dimension, { dimension, level, code, rationale, mitigation });
  };
  const text = [action.title, action.rationale, ...(action.risks ?? []), ...(action.prerequisites ?? [])].join(' ');
  const publicAction = ['content', 'media', 'event'].includes(action.kind);
  if (publicAction) {
    set('public_exposure', 'yellow', 'public_action', 'این اقدام برای مخاطب بیرونی قابل مشاهده و بازتفسیر است.', 'دامنه انتشار و مخاطب را محدود و خروجی نهایی را دوباره بازبینی کنید.');
    set('disclosure', 'yellow', 'disclosure_check', 'منافع، همکاری تجاری یا نقش اشخاص باید پیش از انتشار آشکار شوند.', 'Disclosure لازم را صریح و نزدیک به ادعای مربوط درج کنید.');
    set('long_term_consequences', 'yellow', 'durable_public_record', 'اثر عمومی می‌تواند خارج از زمینه اولیه باقی بماند.', 'سناریوی بازنشر و برداشت پنج‌ساله را پیش از تأیید مرور کنید.');
  }
  if (['private_conversation', 'relationship'].includes(action.kind)) {
    set('third_party_privacy', 'yellow', 'third_party_context', 'تعامل با فرد دیگر شامل حریم و زمینه انسانی اوست.', 'فقط اطلاعات لازم را استفاده کنید و از افشای گفت‌وگو بدون رضایت بپرهیزید.');
  }
  if (action.kind === 'research') {
    set('data_access', 'yellow', 'external_source_boundary', 'Research ممکن است داده بیرونی یا متعلق به شخص ثالث را وارد کند.', 'منبع، مجوز استفاده و داده حساس را قبل از Import بررسی کنید.');
  }
  if (publicAction && action.evidenceState !== 'grounded') {
    set('consent', 'red', 'missing_evidence_consent', 'اقدام عمومی بدون Evidence مجاز و رضایت قابل‌ردیابی پیشنهاد شده است.', 'ابتدا Evidence را با Purpose و Consent روشن ثبت کنید.');
    set('authenticity', 'red', 'ungrounded_public_action', 'بدون Evidence، اصالت و نسبت‌دادن تجربه قابل اثبات نیست.', 'اقدام را متوقف و منبع واقعی را متصل کنید.');
  }
  if (action.riskLevel === 'high') {
    set('reputation_risk', 'red', 'high_reputation_risk', 'Risk پایه اقدام در سطح High است و Utility اجازه Override آن را ندارد.', 'اقدام را Hold و برای بررسی انسانی/حقوقی Escalate کنید.');
  } else if (action.riskLevel === 'medium') {
    set('reputation_risk', 'yellow', 'material_reputation_risk', 'ریسک اعتباری اقدام مادی است و نیاز به پذیرش آگاهانه دارد.', 'Rationale و پیامد احتمالی را پیش از تأیید ثبت کنید.');
  }
  if (/برداشت|ابهام|misinterpret|out of context/i.test(text)) set('misinterpretation', 'yellow', 'misinterpretation_signal', 'شرح اقدام احتمال برداشت نادرست را نشان می‌دهد.', 'زمینه، محدودیت و منظور اصلی را در خروجی روشن کنید.');
  if (/داده حساس|محرمانه|private|confidential|شماره تماس|آدرس/i.test(text)) set('sensitive_data', 'red', 'sensitive_data_signal', 'اقدام احتمال استفاده از داده حساس یا محرمانه دارد.', 'داده را حذف/ناشناس‌سازی و مجوز دسترسی را جداگانه اثبات کنید.');
  if (/تهمت|افترا|اتهام|defam|allegation|accus/i.test(text)) set('defamation', 'red', 'defamation_signal', 'محتوا می‌تواند به‌عنوان اتهام یا افترا علیه شخص ثالث فهمیده شود.', 'انتشار را متوقف و بررسی حقوقی و شواهد مستقل انجام دهید.');
  if (/دستکاری|فریب|manipulat|deceiv/i.test(text)) set('manipulation', 'red', 'manipulation_signal', 'روش اقدام می‌تواند متکی بر فریب یا دستکاری مخاطب باشد.', 'هدف و روش را به تعامل شفاف و غیرتحمیلی بازطراحی کنید.');
  if (/تعارض منافع|اسپانسر|هدیه|conflict of interest|sponsor/i.test(text)) set('conflict_of_interest', 'yellow', 'conflict_signal', 'احتمال تعارض منافع یا رابطه مادی وجود دارد.', 'رابطه و منفعت مرتبط را پیش از اقدام Disclosure کنید.');
  if (/رمز|گذرواژه|توکن|secret|password|api.?key/i.test(text)) set('security', 'red', 'secret_exposure_signal', 'شرح اقدام نشانه‌ای از Secret یا credential دارد.', 'Secret را حذف و در صورت افشا فوراً Rotate کنید.');
  if (/اغراق|exaggerat/i.test(text)) set('authenticity', 'yellow', 'exaggeration_signal', 'شرح اقدام احتمال اغراق یا برداشت بزرگ‌نمایانه را نشان می‌دهد.', 'ادعا را با Trace، محدودیت و زبان دقیق بازنویسی کنید.');
  if (/ساختگی|جعلی|fake|fabricat/i.test(text)) set('authenticity', 'red', 'fabrication_signal', 'شرح اقدام احتمال جعل هویتی یا تجربه ساختگی را نشان می‌دهد.', 'ادعا را حذف یا فقط با Trace و تأیید انسانی بازنویسی کنید.');
  const ordered = riskDimensions.map((dimension) => findings.get(dimension));
  const level = ordered.reduce((highest, finding) => rank[finding.level] > rank[highest] ? finding.level : highest, 'green');
  const assessmentHash = await sha256Hex(JSON.stringify({
    policyVersion: 'brand-protection-v1',
    action: {
      id: action.id, kind: action.kind, title: action.title, rationale: action.rationale,
      risks: action.risks, prerequisites: action.prerequisites, evidenceIds: action.evidenceIds,
      evidenceState: action.evidenceState, riskLevel: action.riskLevel,
      attentionCostMinutes: action.attentionCostMinutes, energyCost: action.energyCost,
      attentionDemand: action.attentionDemand, visibilityCost: action.visibilityCost,
      emotionalCost: action.emotionalCost,
      feasibilityReasons: action.feasibilityReasons, decision: stableStrategicDecision(action),
    }, findings: ordered,
  }));
  const material = ordered.filter((finding) => finding.level !== 'green').map((finding) => finding.dimension).join('، ');
  return {
    actionId: action.id, actionTitle: action.title, actionKind: action.kind,
    policyVersion: 'brand-protection-v1', assessmentHash, level,
    gate: level === 'green' ? 'allowed' : level === 'yellow' ? 'review_required' : 'blocked',
    rationale: level === 'green'
      ? 'هیچ Signal مادی در قواعد فعلی پیدا نشد؛ اقدام در محدوده فعلی مجاز است.'
      : level === 'red'
        ? `حداقل یک مانع Red در ${material} وجود دارد؛ Strategy یا Engagement نمی‌تواند آن را Override کند.`
        : `ریسک‌های مادی در ${material} وجود دارد و پذیرش آگاهانه مالک پیش از اقدام لازم است.`,
    findings: ordered,
    reviewableDecisions: level === 'yellow' ? ['acknowledge', 'hold', 'escalate'] : level === 'red' ? ['hold', 'escalate'] : [],
  };
}

function applyRiskReview(assessment, review) {
  if (!review || review.assessmentHash !== assessment.assessmentHash || review.expectedLevel !== assessment.level) return assessment;
  return {
    ...assessment,
    gate: review.decision === 'acknowledge' && assessment.level === 'yellow' ? 'allowed_with_acknowledgement' : 'blocked',
    lastReview: review,
  };
}

const arbitrationAutonomy = [
  { level: 0, key: 'observe', label: 'مشاهده' },
  { level: 1, key: 'analyze', label: 'تحلیل' },
  { level: 2, key: 'recommend', label: 'پیشنهاد' },
  { level: 3, key: 'draft', label: 'پیش‌نویس' },
  { level: 4, key: 'prepare_action', label: 'آماده‌سازی اقدام' },
  { level: 5, key: 'ask_approval', label: 'درخواست تأیید' },
  { level: 6, key: 'execute_delegated', label: 'اجرای واگذارشده' },
  { level: 7, key: 'bounded_automation', label: 'اتوماسیون محدود' },
];

async function arbitrationContext() {
  const workbench = snapshot();
  const risk = await riskSnapshot();
  return { workbench, risk };
}

async function arbitrationWorkspaceSnapshot() {
  const generatedAt = new Date();
  const context = await arbitrationContext();
  const availableActions = await Promise.all(context.workbench.actions.map(async (action) => ({
    id: action.id, title: action.title, kind: action.kind,
    evidenceCount: action.evidenceCount, confidence: action.confidence,
    currentContextHash: await arbitrationContextHash(action, context),
  })));
  const hashes = new Map(availableActions.map((action) => [action.id, action.currentContextHash]));
  return {
    generatedAt: generatedAt.toISOString(), persistence: 'ephemeral',
    policyVersion: 'intermodule-arbitration-v1', contractVersion: 'module-opinion-v1',
    autonomy: arbitrationAutonomy, mvpExecutionEnabled: false,
    availableActions,
    cases: [...arbitrationCases.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => ({
        ...item,
        stale: hashes.get(item.action.id) !== item.contextHash ||
          new Date(item.validUntil).getTime() <= generatedAt.getTime(),
      })),
  };
}

async function buildArbitrationCase(requestId, action, requestedAutonomyLevel, context, assessment) {
  const created = new Date();
  const opinions = arbitrationOpinions(action, assessment, context);
  const decision = arbitrationDecision(action, requestedAutonomyLevel, opinions);
  const unsigned = {
    caseId: crypto.randomUUID(), requestId, policyVersion: 'intermodule-arbitration-v1',
    createdAt: created.toISOString(),
    validUntil: new Date(created.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    contextHash: await arbitrationContextHash(action, context),
    action: { id: action.id, title: action.title, kind: action.kind, hash: await arbitrationActionHash(action) },
    request: {
      sourceModule: 'workbench', operation: 'evaluate_action', purpose: 'strategy_reasoning',
      requestedAutonomyLevel, readAuthority: 'owner_scoped_snapshot',
      writeAuthority: 'append_decision_only',
    },
    opinions,
    decision,
  };
  return { ...unsigned, snapshotHash: await sha256Hex(JSON.stringify(unsigned)) };
}

function arbitrationOpinions(action, assessment, context) {
  const evidenceRefs = action.evidenceIds.map((id) => `evidence:${id}`);
  const hasEvidence = action.kind === 'no_action' ||
    (action.evidenceState === 'grounded' && action.evidenceIds.length > 0);
  const publicFacing = ['content', 'media', 'event'].includes(action.kind);
  const claimsReady = context.risk.claimPosture.publicReady > 0;
  const authenticity = assessment.findings.find((finding) => finding.dimension === 'authenticity');
  const acknowledged = assessment.lastReview?.decision === 'acknowledge';
  const authenticityPosition = authenticity?.level === 'red'
    ? 'hold'
    : authenticity?.level === 'yellow' && !acknowledged
      ? 'revise'
      : action.evidenceState === 'grounded' && action.evidenceCount > 0
        ? 'support'
        : 'abstain';
  const riskPosition = assessment.level === 'red'
    ? 'hold'
    : assessment.level === 'yellow' && assessment.gate === 'review_required'
      ? 'revise'
      : 'support';
  return [
    arbitrationOpinion('strategy', 'strategy-ranking-v1', action.feasible ? 'support' : 'hold', action.confidence, 2,
      action.feasible
        ? `اقدام با Confidence ${String(Math.round(action.confidence * 100))}٪ در بودجه فعلی قابل‌بررسی است؛ Utility به‌تنهایی تصمیم نهایی نیست.`
        : 'اقدام از بودجه زمان یا انرژی عبور می‌کند و در Context فعلی قابل توصیه نیست.',
      [`strategy_revision:${String(context.workbench.goal.revision)}`]),
    arbitrationOpinion('permission', 'evidence-permission-filter-v1', hasEvidence ? 'support' : 'hold', 1, 2,
      hasEvidence
        ? 'فقط Evidence مالک‌محور و مجاز برای تحلیل برند در Context اقدام حاضر است.'
        : 'برای این اقدام Evidence مجاز وجود ندارد؛ Retrieval یا Utility مجوز ایجاد نمی‌کند.',
      evidenceRefs.length > 0 ? evidenceRefs : ['evidence:none_authorized']),
    arbitrationOpinion('claims', 'claim-governance-v1', publicFacing ? (claimsReady ? 'support' : 'revise') : 'abstain', 1, 4,
      publicFacing
        ? claimsReady
          ? `${String(context.risk.claimPosture.publicReady)} Claim با Trace کامل برای استفاده عمومی آماده است.`
          : 'هیچ Claim عمومی با Trace کامل آماده نیست؛ آماده‌سازی اقدام باید به Draft/Claim Review برگردد.'
        : 'اقدام بیرونیِ Claim-bearing نیست؛ Claim Registry در این تصمیم رأی نمی‌دهد.',
      ['claim_policy:claim-governance-v1', `public_ready:${String(context.risk.claimPosture.publicReady)}`]),
    arbitrationOpinion('risk', assessment.policyVersion, riskPosition, 1, 4, assessment.rationale,
      [`risk_assessment:${assessment.assessmentHash}`, ...(assessment.lastReview ? [`risk_review:${assessment.lastReview.reviewId}`] : [])]),
    arbitrationOpinion('authenticity', 'authenticity-grounding-v1', authenticityPosition,
      authenticityPosition === 'support' ? 0.65 : 1, 3,
      authenticityPosition === 'hold' || authenticityPosition === 'revise'
        ? (authenticity?.rationale ?? 'Authenticity requires review.')
        : authenticityPosition === 'support'
          ? `${String(action.evidenceCount)} Evidence مجاز Grounding حداقلی می‌دهد؛ این رأی ادعای Voice Match کامل نیست.`
          : 'Evidence کافی برای قضاوت اصالت وجود ندارد؛ ماژول به‌جای ساختن قطعیت رأی ممتنع می‌دهد.',
      [`risk_assessment:${assessment.assessmentHash}`, ...evidenceRefs]),
  ];
}

function arbitrationOpinion(module, moduleVersion, position, confidence, appliesFromAutonomyLevel, rationale, provenanceRefs) {
  return {
    contractVersion: 'module-opinion-v1', module, moduleVersion, position, confidence,
    appliesFromAutonomyLevel, rationale, provenanceRefs,
    authority: { read: 'owner_scoped_snapshot', write: 'none' },
  };
}

function arbitrationDecision(action, requestedAutonomyLevel, opinions) {
  const active = opinions.filter((item) => item.appliesFromAutonomyLevel <= requestedAutonomyLevel);
  const holds = active.filter((item) => item.position === 'hold');
  const revisions = active.filter((item) => item.position === 'revise');
  const unknown = active.filter((item) => item.position === 'abstain');
  const mvpDowngrade = requestedAutonomyLevel > 5;
  const effectiveAutonomyLevel = holds.length > 0
    ? Math.min(requestedAutonomyLevel, 1)
    : revisions.length > 0
      ? Math.min(requestedAutonomyLevel, 3)
      : Math.min(requestedAutonomyLevel, 5);
  const outcome = holds.length > 0
    ? 'held'
    : revisions.length > 0
      ? 'revision_required'
      : requestedAutonomyLevel >= 5
        ? 'approval_required'
        : 'recommendation_ready';
  const externalAction = !['no_action', 'research'].includes(action.kind);
  const rationale = outcome === 'held'
    ? `حداقل یک Gate الزام‌آور (${holds.map((item) => item.module).join('، ')}) اقدام را متوقف کرد؛ رأی‌های Utility قادر به Override نیستند.`
    : outcome === 'revision_required'
      ? `پیش از ادامه، اصلاح الزام‌آور از ${revisions.map((item) => item.module).join('، ')} لازم است و مخالفت در Snapshot حفظ شد.`
      : outcome === 'approval_required'
        ? mvpDowngrade
          ? 'درخواست اجرای خودکار به سقف Level 5 کاهش یافت؛ MVP هیچ Side Effect بیرونی اجرا نمی‌کند و تأیید انسانی لازم است.'
          : 'همه Gateهای فعال عبور کرده‌اند، اما مرحله فعلی فقط درخواست تأیید انسانی است و اجرا مجاز نیست.'
        : 'Gateهای فعال برای این سطح عبور کرده‌اند؛ نتیجه فقط Recommendation است و هیچ Side Effect ایجاد نمی‌کند.';
  return {
    outcome, effectiveAutonomyLevel,
    requiresHumanApproval: requestedAutonomyLevel >= 5 || (externalAction && requestedAutonomyLevel >= 4),
    executionPermitted: false,
    dissentPreserved: active.some((item) => item.position !== 'support'),
    blockingModules: [...new Set(holds.map((item) => item.module))],
    unknownModules: [...new Set(unknown.map((item) => item.module))],
    downgradeReasons: [
      ...(mvpDowngrade ? ['mvp_execution_disabled'] : []),
      ...(holds.length > 0 ? ['blocking_module_present'] : []),
      ...(revisions.length > 0 ? ['mandatory_revision_present'] : []),
    ],
    appliedRules: [
      'privacy_security_before_utility', 'permission_before_retrieval_utility',
      'claim_and_risk_gates_are_independent', 'single_module_cannot_override_blocker',
      'dissent_and_abstention_are_preserved', 'public_side_effect_requires_human_approval',
      'mvp_execution_ceiling_is_level_5',
    ],
    rationale,
  };
}

async function arbitrationContextHash(action, context) {
  const assessment = context.risk.assessments.find((candidate) => candidate.actionId === action.id);
  return sha256Hex(JSON.stringify({
    policyVersion: 'intermodule-arbitration-v1', actionHash: await arbitrationActionHash(action),
    strategyRevision: context.workbench.goal.revision,
    decisionContextRevision: context.workbench.decisionContext.revision,
    decisionContextHash: context.workbench.decisionContext.contextHash,
    risk: assessment ? {
      assessmentHash: assessment.assessmentHash, gate: assessment.gate,
      reviewId: assessment.lastReview?.reviewId ?? null,
    } : null,
    claims: context.risk.claimPosture,
  }));
}

async function arbitrationActionHash(action) {
  return sha256Hex(JSON.stringify({
    id: action.id, kind: action.kind, title: action.title, rationale: action.rationale,
    risks: action.risks, prerequisites: action.prerequisites, evidenceIds: action.evidenceIds,
    evidenceState: action.evidenceState, confidence: action.confidence, riskLevel: action.riskLevel,
    utilityScore: action.utilityScore, opportunityCost: action.opportunityCost, feasible: action.feasible,
    feasibilityReasons: action.feasibilityReasons, attentionCostMinutes: action.attentionCostMinutes,
    energyCost: action.energyCost, attentionDemand: action.attentionDemand,
    visibilityCost: action.visibilityCost, emotionalCost: action.emotionalCost,
    decision: stableStrategicDecision(action),
  }));
}

const initiativeWindowMilliseconds = 24 * 60 * 60 * 1000;

async function initiativeContext() {
  const workbench = snapshot();
  const arbitration = await arbitrationWorkspaceSnapshot();
  const contextHash = await sha256Hex(JSON.stringify({
    policyVersion: 'initiative-policy-v1',
    goalRevision: workbench.goal.revision,
    decisionContextRevision: workbench.decisionContext.revision,
    decisionContextHash: workbench.decisionContext.contextHash,
    evidence: workbench.evidence,
    actions: workbench.actions.map((action) => ({
      id: action.id, kind: action.kind, rank: action.rank, feasible: action.feasible,
      evidenceIds: action.evidenceIds, evidenceState: action.evidenceState,
      confidence: action.confidence, attentionCostMinutes: action.attentionCostMinutes,
      energyCost: action.energyCost, attentionDemand: action.attentionDemand,
      visibilityCost: action.visibilityCost,
      emotionalCost: action.emotionalCost, feasibilityReasons: action.feasibilityReasons,
      riskLevel: action.riskLevel, decision: stableStrategicDecision(action),
    })),
    arbitration: arbitration.cases.map((item) => ({
      caseId: item.caseId, snapshotHash: item.snapshotHash,
      contextHash: item.contextHash, stale: item.stale,
    })),
  }));
  return { workbench, arbitration, contextHash };
}

async function initiativeWorkspaceSnapshot() {
  const generatedAt = new Date();
  const context = await initiativeContext();
  const candidate = await initiativeCandidate(context, generatedAt);
  const evaluations = [...initiativeEvaluations.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const preview = initiativeDecision(initiativeSettings, evaluations, candidate, generatedAt);
  const delivered = initiativeDeliveredWithinWindow(evaluations, generatedAt);
  return {
    generatedAt: generatedAt.toISOString(), persistence: 'ephemeral',
    policyVersion: 'initiative-policy-v1', settings: initiativeSettings,
    window: {
      startsAt: new Date(generatedAt.getTime() - initiativeWindowMilliseconds).toISOString(),
      delivered, remaining: Math.max(0, initiativeSettings.maxPromptsPer24Hours - delivered),
    },
    preview: { candidate, ...preview },
    evaluations: evaluations.map((evaluation) => ({
      ...evaluation,
      stale: evaluation.contextHash !== context.contextHash ||
        (evaluation.candidate !== null && new Date(evaluation.candidate.expiresAt).getTime() <= generatedAt.getTime()),
    })),
  };
}

async function initiativeCandidate(context, at = new Date()) {
  const staleDecision = context.arbitration.cases.find((item) => item.stale);
  if (staleDecision) {
    return makeInitiativeCandidate({
      kind: 'decision_refresh', title: 'این تصمیم به Context قدیمی متکی است',
      prompt: 'مایلی رأی ماژول‌ها را با Strategy، Risk و Claim فعلی دوباره جمع‌آوری کنیم؟',
      rationale: 'Snapshot داوری پس از تغییر Context یا پایان پنجره اعتبار stale شده است.',
      relevance: 0.95, confidence: 1, targetView: 'arbitration',
      sourceRefs: [`arbitration_case:${staleDecision.caseId}`, `snapshot:${staleDecision.snapshotHash}`],
      contextHash: context.contextHash, at,
    });
  }
  if (context.workbench.evidence.state === 'insufficient') {
    return makeInitiativeCandidate({
      kind: 'evidence_question', title: 'یک سؤال کوتاه برای کم‌کردن حدس',
      prompt: 'درباره یک موقعیت واقعی که شیوه تصمیم‌گیری تو را نشان می‌دهد، چه تجربه‌ای ارزش ثبت‌کردن دارد؟',
      rationale: 'Evidence کافی برای توصیه استراتژیک وجود ندارد؛ یک پاسخ اختیاری Information Gain بالاتری از تولید محتوای حدسی دارد.',
      relevance: 0.9, confidence: 0.9, targetView: 'intake',
      sourceRefs: [
        `strategy_revision:${String(context.workbench.goal.revision)}`,
        `evidence_count:${String(context.workbench.evidence.strategyEvidenceCount)}`,
      ],
      contextHash: context.contextHash, at,
    });
  }
  const action = [...context.workbench.actions]
    .filter((item) => item.kind !== 'no_action' && item.feasible && item.evidenceState === 'grounded')
    .sort((left, right) => left.rank - right.rank)[0];
  if (!action) return null;
  const relevance = Math.round(Math.min(
    0.95,
    Math.max(0.5, 0.52 + action.confidence * 0.4 - Math.min(action.attentionCostMinutes / 1000, 0.12)),
  ) * 100) / 100;
  return makeInitiativeCandidate({
    kind: 'action_window', title: 'یک حرکت مرتبط با مسیر فعلی آماده بررسی است',
    prompt: `مایلی «${action.title}» را باز کنیم و قبل از هر اقدام، Evidence و Risk آن را ببینی؟`,
    rationale: 'این Cue از Action رتبه‌دار، Evidence مجاز، امکان‌پذیری و Attention Cost ساخته شده و به معنی الزام به اقدام نیست.',
    relevance, confidence: action.confidence, targetView: 'today',
    sourceRefs: [`action:${action.id}`, ...action.evidenceIds.map((id) => `evidence:${id}`)],
    contextHash: context.contextHash, at,
  });
}

async function makeInitiativeCandidate(input) {
  const hash = await sha256Hex(`initiative:${input.kind}:${input.contextHash}`);
  return {
    candidateId: uuidFromHash(hash), kind: input.kind, title: input.title,
    prompt: input.prompt, rationale: input.rationale, relevance: input.relevance,
    confidence: input.confidence, targetView: input.targetView,
    sourceRefs: input.sourceRefs, contextHash: input.contextHash,
    expiresAt: new Date(input.at.getTime() + initiativeWindowMilliseconds).toISOString(),
  };
}

function initiativeDecision(settings, evaluations, candidate, at) {
  if (settings.mode === 'reactive') return { decision: 'suppressed', reason: 'reactive_mode' };
  if (settings.pausedUntil && new Date(settings.pausedUntil).getTime() > at.getTime()) {
    return { decision: 'suppressed', reason: 'paused' };
  }
  if (!candidate) return { decision: 'suppressed', reason: 'no_material_signal' };
  if (candidate.relevance < settings.minimumRelevance) {
    return { decision: 'suppressed', reason: 'below_relevance' };
  }
  if (initiativeDeliveredWithinWindow(evaluations, at) >= settings.maxPromptsPer24Hours) {
    return { decision: 'suppressed', reason: 'rate_limited' };
  }
  return { decision: 'delivered', reason: 'delivered' };
}

function initiativeDeliveredWithinWindow(evaluations, at) {
  const startsAt = at.getTime() - initiativeWindowMilliseconds;
  return evaluations.filter((item) => {
    const createdAt = new Date(item.createdAt).getTime();
    return item.decision === 'delivered' && createdAt >= startsAt && createdAt <= at.getTime();
  }).length;
}

function validInitiativeSettingsRequest(body) {
  const paused = body?.pausedUntil;
  const pausedTime = typeof paused === 'string' ? new Date(paused).getTime() : null;
  const now = Date.now();
  return typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 1 &&
    ['reactive', 'balanced', 'proactive'].includes(body.mode) &&
    [1, 2, 3].includes(body.maxPromptsPer24Hours) &&
    typeof body.minimumRelevance === 'number' && Number.isFinite(body.minimumRelevance) &&
    body.minimumRelevance >= 0.5 && body.minimumRelevance <= 0.95 &&
    (paused === null || (typeof paused === 'string' && Number.isFinite(pausedTime) &&
      pausedTime > now && pausedTime <= now + 30 * initiativeWindowMilliseconds));
}

function validInitiativeEvaluationRequest(body) {
  return typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId);
}

const relationshipGroups = [
  'client', 'investor', 'peer', 'manager', 'team', 'media', 'journalist',
  'industry_leader', 'community', 'potential_partner', 'critic', 'friend',
  'public', 'policymaker', 'other',
];

function validStakeholderRequest(body) {
  return validRequestId(body?.requestId) && validText(body?.label, 2, 120) &&
    relationshipGroups.includes(body?.group) && validText(body?.outcome, 3, 240) &&
    ['low', 'medium', 'high'].includes(body?.priority) &&
    ['unknown', 'emerging', 'active', 'trusted'].includes(body?.strength) &&
    ['normal', 'ask_before_prompt', 'do_not_prompt'].includes(body?.boundary) &&
    validText(body?.contextNote, 10, 1000) &&
    (body?.lastInteractionAt === null || typeof body?.lastInteractionAt === 'string') &&
    body?.consentConfirmed === true;
}

function validRequestId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(value);
}

function relationshipWorkspaceSnapshot() {
  const generatedAt = new Date();
  const stakeholders = [...stakeholderRecords.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((record) => relationshipStakeholderSnapshot(record, generatedAt));
  const groups = relationshipGroups.flatMap((group) => {
    const records = stakeholders.filter((record) => record.group === group);
    return records.length === 0 ? [] : [{
      group, count: records.length,
      highPriority: records.filter((record) => record.priority === 'high').length,
    }];
  });
  return {
    generatedAt: generatedAt.toISOString(), persistence: 'ephemeral',
    policyVersion: 'relationship-intelligence-v1',
    summary: {
      totalStakeholders: stakeholders.length,
      highPriority: stakeholders.filter((record) => record.priority === 'high').length,
      contextNeeded: stakeholders.filter((record) => record.attention === 'context_needed').length,
      reviewSuggested: stakeholders.filter((record) => record.attention === 'review_context').length,
      boundaryProtected: stakeholders.filter((record) => record.recency === 'protected').length,
      outcomeCount: new Set(stakeholders.map((record) => normalizeRelationshipText(record.outcome))).size,
    },
    groups,
    stakeholders,
  };
}

function relationshipStakeholderSnapshot(record, at) {
  const recency = relationshipRecency(record, at);
  const attention = relationshipAttention(record, recency);
  return {
    ...record, recency, attention, rationale: relationshipRationale(attention),
    privacy: {
      dataClass: 'confidential', allowedPurpose: 'relationship_planning',
      contactDetailsStored: false, automationPermitted: false,
      outboundContactPermitted: false,
    },
  };
}

function relationshipRecency(record, at) {
  if (record.boundary === 'do_not_prompt') return 'protected';
  if (!record.lastInteractionAt) return 'unknown';
  const ageDays = Math.max(0, Math.floor((at.getTime() - new Date(record.lastInteractionAt).getTime()) / 86400000));
  if (ageDays <= 30) return 'recent';
  if (ageDays <= 90) return 'quiet';
  return 'dormant';
}

function relationshipAttention(record, recency) {
  if (recency === 'protected' || record.priority !== 'high') return 'none';
  if (record.boundary === 'ask_before_prompt' && ['unknown', 'dormant'].includes(recency)) return 'approval_required';
  if (recency === 'unknown') return 'context_needed';
  if (recency === 'dormant') return 'review_context';
  return 'none';
}

function relationshipRationale(attention) {
  if (attention === 'context_needed') return 'برای این رابطه مهم، تاریخ آخرین تعامل ثبت نشده است؛ فقط Context را کامل کن.';
  if (attention === 'review_context') return 'رابطه مهم مدتی بدون تعامل ثبت‌شده بوده است؛ Context را مرور کن، بدون توصیه خودکار به تماس.';
  if (attention === 'approval_required') return 'Boundary این رابطه ایجاب می‌کند پیش از هر Prompt یا پیشنهاد، تأیید صریح گرفته شود.';
  return 'هیچ اقدام خودکاری پیشنهاد نمی‌شود.';
}

const perceptionDimensions = [
  'expertise', 'trust', 'leadership', 'clarity', 'innovation',
  'collaboration', 'visibility', 'authenticity', 'other',
];
const perceptionPerspectives = ['self_perception', 'desired_positioning', 'external_perception'];
const perceptionStages = ['not_visible', 'emerging', 'visible', 'strong', 'signature'];
const perceptionSources = [
  'owner_reflection', 'owner_goal', 'direct_feedback', 'survey_summary',
  'public_signal', 'media_signal', 'network_feedback', 'other',
];

function validPerceptionSignalRequest(body) {
  if (!validRequestId(body?.requestId) || !perceptionDimensions.includes(body?.dimension) ||
      !perceptionPerspectives.includes(body?.perspective) || !perceptionStages.includes(body?.stage) ||
      !validText(body?.summary, 5, 400) || !validText(body?.evidenceNote, 10, 1000) ||
      !perceptionSources.includes(body?.sourceKind) || !['low', 'medium', 'high'].includes(body?.confidence) ||
      typeof body?.observedAt !== 'string' || body?.consentConfirmed !== true) return false;
  if (body.perspective === 'self_perception') return body.sourceKind === 'owner_reflection';
  if (body.perspective === 'desired_positioning') return body.sourceKind === 'owner_goal';
  return !['owner_reflection', 'owner_goal'].includes(body.sourceKind);
}

function perceptionWorkspaceSnapshot() {
  const signals = [...perceptionSignals.values()]
    .sort(comparePerceptionSignals)
    .map((record) => ({
      ...record,
      epistemicType: record.perspective === 'self_perception'
        ? 'self_report'
        : record.perspective === 'desired_positioning' ? 'goal' : 'external_perception',
      privacy: {
        dataClass: 'confidential', allowedPurpose: 'perception_analysis',
        sourceIdentityStored: false, verbatimPrivateQuoteStored: false,
        automatedCollectionPermitted: false, externalActionPermitted: false,
      },
    }));
  const dimensions = perceptionDimensions.flatMap((dimension) => {
    const records = [...perceptionSignals.values()].filter((record) => record.dimension === dimension);
    return records.length === 0 ? [] : [perceptionDimensionSnapshot(dimension, records)];
  });
  return {
    generatedAt: new Date().toISOString(), persistence: 'ephemeral', policyVersion: 'perception-engine-v1',
    summary: {
      totalSignals: signals.length,
      coveredDimensions: dimensions.length,
      externalSignals: signals.filter((signal) => signal.perspective === 'external_perception').length,
      underrecognized: dimensions.filter((dimension) => dimension.gap === 'underrecognized').length,
      potentialBlindSpots: dimensions.filter((dimension) => (
        dimension.blindSpot === 'self_higher_than_external' ||
        dimension.blindSpot === 'self_lower_than_external'
      )).length,
      insufficientEvidence: dimensions.filter((dimension) => (
        dimension.gap === 'insufficient_evidence' || dimension.blindSpot === 'insufficient_evidence'
      )).length,
    },
    dimensions,
    signals,
  };
}

function perceptionDimensionSnapshot(dimension, records) {
  const self = records.filter((record) => record.perspective === 'self_perception').sort(comparePerceptionSignals)[0];
  const desired = records.filter((record) => record.perspective === 'desired_positioning').sort(comparePerceptionSignals)[0];
  const external = records.filter((record) => record.perspective === 'external_perception');
  const indexes = external.map((record) => perceptionStages.indexOf(record.stage));
  const lowest = indexes.length === 0 ? null : Math.min(...indexes);
  const highest = indexes.length === 0 ? null : Math.max(...indexes);
  const externalRange = lowest === null || highest === null ? null : {
    lowest: perceptionStages[lowest], highest: perceptionStages[highest],
    signalCount: external.length, conflictingStages: lowest !== highest,
  };
  const gap = perceptionGap(desired?.stage ?? null, lowest, highest);
  const blindSpot = perceptionBlindSpot(self?.stage ?? null, lowest, highest);
  return {
    dimension, selfStage: self?.stage ?? null, desiredStage: desired?.stage ?? null,
    externalRange, gap, blindSpot,
    rationale: perceptionRationale(gap, blindSpot, externalRange?.conflictingStages ?? false),
  };
}

function perceptionGap(desired, lowest, highest) {
  if (!desired || lowest === null || highest === null) return 'insufficient_evidence';
  const target = perceptionStages.indexOf(desired);
  if (highest < target) return 'underrecognized';
  if (lowest > target) return 'exceeds_target';
  return 'aligned_range';
}

function perceptionBlindSpot(self, lowest, highest) {
  if (!self || lowest === null || highest === null) return 'insufficient_evidence';
  const current = perceptionStages.indexOf(self);
  if (current > highest) return 'self_higher_than_external';
  if (current < lowest) return 'self_lower_than_external';
  return 'within_external_range';
}

function perceptionRationale(gap, blindSpot, conflict) {
  if (conflict && gap !== 'insufficient_evidence') {
    return 'External Perceptionها هم‌سطح نیستند؛ اختلاف Signalها حفظ شده و نیازمند مرور زمینه است.';
  }
  if (gap === 'insufficient_evidence' || blindSpot === 'insufficient_evidence') {
    return 'برای مقایسه کامل داده کافی نیست؛ هیچ نتیجه‌ای به‌عنوان حقیقت اعلام نمی‌شود.';
  }
  if (gap === 'underrecognized') return 'Stage ادراک بیرونی پایین‌تر از جایگاه مطلوب ثبت شده است؛ این فقط یک Gap کیفی است.';
  if (gap === 'exceeds_target') return 'Stage ادراک بیرونی بالاتر از جایگاه مطلوب ثبت شده است؛ نیاز به قضاوت مالک دارد.';
  if (blindSpot === 'self_higher_than_external') return 'Self Perception بالاتر از Signal بیرونی است؛ یک Blind Spot احتمالی، نه Fact.';
  if (blindSpot === 'self_lower_than_external') return 'Self Perception پایین‌تر از Signal بیرونی است؛ یک تفاوت قابل بررسی، نه Fact.';
  return 'Stage مطلوب، Self Perception و Range بیرونی در محدوده مشترک قرار دارند.';
}

function authenticExpressionSnapshot() {
  const narrativeSeeds = [...textAssets.values()]
    .filter((asset) => asset.permissions.brandUsage)
    .sort((left, right) => right.importedAt.localeCompare(left.importedAt))
    .map((asset) => ({
      narrativeId: `narrative_${asset.assetId}`,
      title: asset.title,
      premise: asset.assertionText,
      maturity: 'single_source',
      source: { kind: 'text_asset', ref: asset.assetId, assertionId: asset.assertionId, evidenceId: asset.evidenceId },
      epistemicType: 'evidence_backed_candidate',
      privacy: { dataClass: 'confidential', allowedPurpose: 'brand_strategy', externalActionPermitted: false },
    }));
  const voiceSignals = [...preferenceProposals.values()]
    .filter((preference) => ['proposed', 'applied'].includes(preference.status))
    .map((preference) => ({
      preferenceId: preference.id, key: preference.preferenceKey, value: preference.proposedValue,
      status: preference.status, evidenceCount: preference.evidenceEventIds.length,
      confidence: preference.confidence, rationale: preference.rationale,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const appliedVoiceSignals = voiceSignals.filter((signal) => signal.status === 'applied').length;
  const proposedVoiceSignals = voiceSignals.filter((signal) => signal.status === 'proposed').length;
  return {
    generatedAt: new Date().toISOString(), persistence: 'ephemeral', policyVersion: 'authentic-expression-v1',
    summary: {
      narrativeSeeds: narrativeSeeds.length, evidenceBoundSeeds: narrativeSeeds.length,
      proposedVoiceSignals, appliedVoiceSignals,
      voiceMaturity: appliedVoiceSignals > 0 ? 'confirmed' : proposedVoiceSignals > 0 ? 'learning' : 'uninitialized',
    },
    narrativeSeeds,
    voiceSignals,
    boundaries: {
      narrativeSeedIsBrandFact: false, voiceProposalAppliesAutomatically: false,
      factCheckIncluded: false, externalActionPermitted: false,
    },
  };
}

function validExpressionReview(body) {
  return validText(body?.content, 20, 20000) && Array.isArray(body?.assetRefs) && body.assetRefs.length <= 5 &&
    body.assetRefs.every((ref) => typeof ref === 'string' && ref.trim().length >= 3 && ref.length <= 200) &&
    new Set(body.assetRefs).size === body.assetRefs.length;
}

function reviewAuthenticExpression(content, selectedAssets) {
  const applied = [...preferenceProposals.values()].filter((preference) => preference.status === 'applied');
  const matchedPersonalTerms = expressionPersonalTermMatches(content, selectedAssets);
  const genericPhrases = expressionGenericPhrases(content);
  const findings = [
    selectedAssets.length > 0
      ? expressionFinding('grounding', 'green', 'authorized_evidence_attached', 'حداقل یک Asset مجاز و قابل‌ردیابی به متن متصل است.', null)
      : expressionFinding('grounding', 'red', 'missing_personal_evidence', 'متن به هیچ Asset شخصی مجاز متصل نیست و نسبت‌دادن آن به فرد قابل دفاع نیست.', 'حداقل یک Asset دارای اجازه Brand Usage انتخاب کنید.'),
    expressionSpecificityFinding(selectedAssets, matchedPersonalTerms),
    genericPhrases.length === 0
      ? expressionFinding('generic_language', 'green', 'no_known_generic_phrase', 'هیچ‌یک از الگوهای کلیشه‌ای شناخته‌شده در متن پیدا نشد.', null)
      : expressionFinding('generic_language', 'yellow', 'generic_ai_language_detected', `عبارت‌های کلیشه‌ای شناسایی شد: ${genericPhrases.join('، ')}`, 'عبارت‌های کلی را با مشاهده و زبان مشخص خود فرد جایگزین کنید.'),
    expressionVoiceFinding(content, applied),
  ];
  return {
    reviewedAt: new Date().toISOString(), policyVersion: 'authentic-expression-v1',
    outcome: findings.some((finding) => finding.level === 'red')
      ? 'block' : findings.some((finding) => finding.level === 'yellow') ? 'revise' : 'pass',
    findings,
    selectedSources: selectedAssets.map((asset) => ({
      ref: asset.assetId, title: asset.title, assertionId: asset.assertionId, evidenceId: asset.evidenceId,
    })),
    matchedPersonalTerms, genericPhrases, appliedVoicePreferences: applied.length,
    boundaries: {
      factCheckIncluded: false, claimApprovalGranted: false, publicApprovalGranted: false,
      externalActionPermitted: false,
    },
  };
}

function expressionSpecificityFinding(selectedAssets, matches) {
  if (selectedAssets.length === 0) {
    return expressionFinding('specificity', 'red', 'specificity_not_testable', 'بدون منبع شخصی، اختصاصی‌بودن متن قابل سنجش نیست.', 'ابتدا یک منبع شخصی مجاز متصل کنید.');
  }
  return matches.length >= 2
    ? expressionFinding('specificity', 'green', 'personal_detail_present', 'متن حداقل دو نشانه متمایز از منابع انتخاب‌شده را حفظ کرده است.', null)
    : expressionFinding('specificity', 'yellow', 'weak_personal_specificity', 'اتصال منبع ثبت شده اما نشانه‌های متمایز آن در متن کم‌رنگ است.', 'یک جزئیات، تصمیم، مشاهده یا عبارت مشخص از منبع را با حفظ صحت وارد متن کنید.');
}

function expressionVoiceFinding(content, preferences) {
  if (preferences.length === 0) {
    return expressionFinding('voice_alignment', 'green', 'voice_model_uninitialized', 'هنوز Preference تأییدشده کافی برای رد یا تأیید Voice Alignment وجود ندارد.', null);
  }
  const conflicts = preferences.flatMap((preference) => expressionVoiceConflict(content, preference));
  return conflicts.length === 0
    ? expressionFinding('voice_alignment', 'green', 'approved_voice_preferences_respected', 'متن با Preferenceهای Voice تأییدشده تعارض شناخته‌شده ندارد.', null)
    : expressionFinding('voice_alignment', 'yellow', 'approved_voice_preference_conflict', conflicts.join(' '), 'متن را با Preferenceهای تأییدشده بازتنظیم کنید یا خود Preference را در بخش یادگیری بازبینی کنید.');
}

function expressionVoiceConflict(content, preference) {
  const value = String(preference.proposedValue);
  if (preference.preferenceKey === 'voice.draft_length' && value === 'shorter' && content.length > 1200) return ['متن از الگوی تأییدشده «کوتاه‌تر» بلندتر است.'];
  if (preference.preferenceKey === 'voice.draft_length' && value === 'longer' && content.length < 300) return ['متن از الگوی تأییدشده «مبسوط‌تر» کوتاه‌تر است.'];
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? '';
  if (preference.preferenceKey === 'voice.headline_length' && value === 'shorter' && firstLine.length > 72) return ['تیتر نخست از ترجیح تأییدشده برای تیتر کوتاه عبور کرده است.'];
  const headings = content.split(/\r?\n/).filter((line) => /^#{1,6}\s|^[^.!؟?]{3,60}:\s*$/.test(line.trim())).length;
  if (preference.preferenceKey === 'voice.heading_density' && value === 'lower' && headings > 2) return ['تعداد میان‌تیترها با ترجیح تأییدشده برای تراکم کمتر هم‌راستا نیست.'];
  if (preference.preferenceKey === 'voice.question_cta' && value === 'omit' && /[؟?]\s*$/.test(content.trim())) return ['متن با پرسش پایانی تمام می‌شود، درحالی‌که حذف Question CTA تأیید شده است.'];
  return [];
}

const expressionGenericPatterns = [
  ['در دنیای امروز', /در دنیای امروز/i], ['در مسیر موفقیت', /در مسیر موفقیت/i],
  ['همه ما می‌دانیم', /همه(?:‌| )ما می(?:‌| )دانیم/i], ['بازی را تغییر می‌دهد', /بازی را تغییر می(?:‌| )دهد/i],
  ["in today's fast-paced world", /in today['’]s fast[- ]paced world/i], ['unlock your potential', /unlock (?:your|the) potential/i],
  ['game changer', /game[- ]changer/i], ["it's not about", /it['’]s not about .{0,80}it['’]s about/i],
];

function expressionGenericPhrases(content) {
  return expressionGenericPatterns.filter(([, pattern]) => pattern.test(content)).map(([label]) => label);
}

const expressionStopTerms = new Set(['برای', 'اینکه', 'است', 'هست', 'شود', 'شده', 'کردن', 'درباره', 'یعنی', 'اما', 'اگر', 'یک', 'that', 'this', 'with', 'from', 'have', 'about', 'were', 'been', 'into', 'your', 'their']);

function expressionPersonalTermMatches(content, assets) {
  const contentTerms = new Set(expressionTerms(content));
  return [...new Set(assets.flatMap((asset) => expressionTerms(`${asset.title} ${asset.assertionText}`)))]
    .filter((term) => contentTerms.has(term)).sort().slice(0, 20);
}

function expressionTerms(value) {
  return value.toLocaleLowerCase('fa-IR').split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim()).filter((term) => term.length >= 4 && !expressionStopTerms.has(term));
}

function expressionFinding(dimension, level, code, rationale, requiredChange) {
  return { dimension, level, code, rationale, requiredChange };
}

function comparePerceptionSignals(left, right) {
  return right.observedAt.localeCompare(left.observedAt) || right.createdAt.localeCompare(left.createdAt);
}

function normalizeRelationshipText(value) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fa-IR');
}

function uuidFromHash(hash) {
  const value = `${hash.slice(0, 12)}4${hash.slice(13, 16)}8${hash.slice(17, 32)}`;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function validArbitrationRequest(body) {
  return typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    typeof body.actionId === 'string' && body.actionId.length > 0 && body.actionId.length <= 200 &&
    Number.isInteger(body.requestedAutonomyLevel) && body.requestedAutonomyLevel >= 0 && body.requestedAutonomyLevel <= 7;
}

function validRiskReview(body) {
  return typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    ['yellow', 'red'].includes(body.expectedLevel) && typeof body.expectedAssessmentHash === 'string' &&
    /^[0-9a-f]{64}$/.test(body.expectedAssessmentHash) && ['acknowledge', 'hold', 'escalate'].includes(body.decision) &&
    validText(body.rationale, 20, 2000) && body.humanAttestation === true;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function distinct(values) {
  return [...new Set(values)].sort();
}

function validStrategyRequest(body) {
  const goal = body?.value?.goal;
  const positioning = body?.value?.desiredPositioning;
  return (
    typeof body?.requestId === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 1 &&
    validText(goal?.title, 3, 240) &&
    validText(goal?.outcome, 3, 2000) &&
    [1, 2, 3, 4, 5].includes(goal?.priority) &&
    validStringList(goal?.successMetrics, 1, 8, 3, 240) &&
    validText(goal?.horizon, 3, 120) &&
    validText(positioning?.audience, 3, 500) &&
    validText(positioning?.desiredPerception, 3, 1000) &&
    validText(positioning?.differentiation, 3, 1000) &&
    validStringList(positioning?.proofPoints, 1, 8, 3, 500) &&
    validText(positioning?.horizon, 3, 120)
  );
}

function validDecisionContextRequest(body) {
  const budget = body?.value?.attentionBudget;
  return typeof body?.requestId === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 1 &&
    Number.isSafeInteger(budget?.availableMinutes) &&
    budget.availableMinutes >= 0 && budget.availableMinutes <= 10080 &&
    [
      budget.maximumEnergyCost,
      budget.attentionCapacity,
      budget.visibilityTolerance,
      budget.emotionalBandwidth,
    ].every((value) => [1, 2, 3, 4, 5].includes(value));
}

function canonicalDecisionContextBudget(budget) {
  return {
    availableMinutes: budget.availableMinutes,
    maximumEnergyCost: budget.maximumEnergyCost,
    attentionCapacity: budget.attentionCapacity,
    visibilityTolerance: budget.visibilityTolerance,
    emotionalBandwidth: budget.emotionalBandwidth,
  };
}

const researchQualities = ['primary', 'authoritative_secondary', 'secondary', 'unverified'];
const researchStances = ['supports', 'contradicts'];
const researchQualityScores = {
  primary: 1, authoritative_secondary: .85, secondary: .65, unverified: .25,
};

function validResearchSource(body) {
  if (
    typeof body?.requestId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) ||
    !validText(body.title, 3, 300) || !validText(body.publisher, 2, 200) ||
    !validText(body.excerpt, 20, 4000) || !validText(body.statement, 3, 4000) ||
    !researchQualities.includes(body.quality) || !researchStances.includes(body.stance) ||
    typeof body.publishedAt !== 'string' || !Number.isSafeInteger(body.maxAgeDays) ||
    body.maxAgeDays < 1 || body.maxAgeDays > 3650
  ) return false;
  const publishedAt = new Date(body.publishedAt);
  if (Number.isNaN(publishedAt.getTime()) || publishedAt > new Date()) return false;
  try {
    const sourceUrl = new URL(body.url);
    return body.url.length <= 2048 && sourceUrl.protocol === 'https:' && !sourceUrl.username && !sourceUrl.password;
  } catch {
    return false;
  }
}

function normalizeResearchUrl(value) {
  const sourceUrl = new URL(value.trim());
  sourceUrl.hash = '';
  return sourceUrl.toString();
}

function normalizeResearchStatement(value) {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('fa-IR');
}

function researchSnapshot() {
  const now = new Date();
  const records = [...researchSources.values()];
  const stanceMap = new Map();
  for (const source of records) {
    const key = normalizeResearchStatement(source.statement);
    const values = stanceMap.get(key) ?? new Set();
    values.add(source.stance);
    stanceMap.set(key, values);
  }
  const conflictKeys = new Set(
    [...stanceMap.entries()].filter(([, values]) => values.size > 1).map(([key]) => key),
  );
  const sources = records.map((source) => {
    const ageDays = Math.max(0, Math.floor((now.getTime() - new Date(source.publishedAt).getTime()) / 86400000));
    const freshness = ageDays > source.maxAgeDays
      ? 'stale'
      : ageDays >= Math.ceil(source.maxAgeDays * .75) ? 'aging' : 'fresh';
    const conflictDetected = conflictKeys.has(normalizeResearchStatement(source.statement));
    const factCheckStatus = conflictDetected
      ? 'conflicted'
      : source.stance === 'contradicts'
        ? 'contradicted'
        : source.quality === 'unverified' || freshness === 'stale'
          ? 'review_required'
          : 'citation_ready';
    return {
      ...source,
      qualityScore: researchQualityScores[source.quality], freshness, ageDays,
      factCheckStatus, conflictDetected,
      citation: `${source.publisher}. «${source.title}». ${source.publishedAt.slice(0, 10)}. ${source.url} (accessed ${source.accessedAt.slice(0, 10)}).`,
      usableForPublicClaim: factCheckStatus === 'citation_ready',
    };
  }).sort((left, right) => right.accessedAt.localeCompare(left.accessedAt));
  return {
    generatedAt: now.toISOString(), persistence: 'ephemeral',
    summary: {
      totalSources: sources.length,
      citationReady: sources.filter((source) => source.factCheckStatus === 'citation_ready').length,
      stale: sources.filter((source) => source.freshness === 'stale').length,
      conflicts: conflictKeys.size,
      unverified: sources.filter((source) => source.quality === 'unverified').length,
    },
    sources,
  };
}

function opportunityRadarSnapshot() {
  const research = researchSnapshot();
  let explorationUsed = false;
  const assessments = research.sources.map((source) => {
    const base = assessOpportunitySource(source);
    if (base.explorationEligible && !explorationUsed) {
      explorationUsed = true;
      return finalizeOpportunityAssessment(
        base, 'explore', true, 'research_more',
        'این Source تازه و معتبر با یک حوزه مجاور تماس دارد؛ در سقف Exploration این Snapshot فقط برای تحقیق بیشتر نگه داشته می‌شود.',
      );
    }
    if (base.explorationEligible) {
      return finalizeOpportunityAssessment(
        base, 'monitor', false, 'watch',
        'Source مجاور است، اما بودجه Exploration این Snapshot مصرف شده؛ فقط در Watchlist می‌ماند.',
      );
    }
    return finalizeOpportunityAssessment(base, base.decision, false, base.nextStep, base.rationale);
  });
  return {
    generatedAt: research.generatedAt,
    persistence: 'ephemeral',
    policyVersion: 'opportunity-radar-v1',
    strategyRevision: strategy.revision,
    summary: {
      sourcesAssessed: assessments.length,
      consider: assessments.filter((item) => item.decision === 'consider').length,
      monitor: assessments.filter((item) => item.decision === 'monitor').length,
      explore: assessments.filter((item) => item.decision === 'explore').length,
      ignored: assessments.filter((item) => item.decision === 'ignore').length,
      explorationBudget: 1,
      explorationUsed: assessments.filter((item) => item.exploration).length,
    },
    assessments,
    boundaries: {
      externalMonitoringIncluded: false,
      trendIsOpportunity: false,
      hiddenOpportunityScoreUsed: false,
      actionRecommended: false,
      externalActionPermitted: false,
    },
  };
}

function assessOpportunitySource(source) {
  const sourceTerms = new Set(opportunityTerms(`${source.title} ${source.statement} ${source.excerpt} ${source.publisher}`));
  const goalTerms = opportunityTerms(`${strategy.goal.title} ${strategy.goal.outcome} ${strategy.goal.successMetrics.join(' ')}`);
  const audienceTerms = opportunityTerms(`${strategy.desiredPositioning.audience} ${strategy.desiredPositioning.desiredPerception} ${strategy.desiredPositioning.differentiation} ${strategy.desiredPositioning.proofPoints.join(' ')}`);
  const matchedGoalTerms = distinct(goalTerms.filter((term) => sourceTerms.has(term))).slice(0, 12);
  const matchedAudienceTerms = distinct(audienceTerms.filter((term) => sourceTerms.has(term))).slice(0, 12);
  const totalMatches = new Set([...matchedGoalTerms, ...matchedAudienceTerms]).size;
  const alignment = (matchedGoalTerms.length > 0 && matchedAudienceTerms.length > 0) || totalMatches >= 3
    ? 'direct' : totalMatches > 0 ? 'adjacent' : 'none';
  const qualityFavorable = source.quality === 'primary' || source.quality === 'authoritative_secondary';
  const timingFavorable = source.freshness === 'fresh';
  const conflict = source.conflictDetected || source.factCheckStatus === 'conflicted' || source.factCheckStatus === 'contradicted';
  const factors = [
    opportunityFactor('goal', matchedGoalTerms.length ? 'favorable' : 'unknown', matchedGoalTerms.length ? `هم‌پوشانی با Goal: ${matchedGoalTerms.join('، ')}` : 'هم‌پوشانی واژگانی روشن با Goal ثبت‌شده پیدا نشد.'),
    opportunityFactor('audience', matchedAudienceTerms.length ? 'favorable' : 'unknown', matchedAudienceTerms.length ? `هم‌پوشانی با Audience/Positioning: ${matchedAudienceTerms.join('، ')}` : 'تناسب روشن با Audience یا Positioning ثبت‌شده پیدا نشد.'),
    opportunityFactor('timing', timingFavorable ? 'favorable' : 'caution', `Freshness منبع: ${source.freshness} (${String(source.ageDays)} روز).`),
    opportunityFactor('source_quality', qualityFavorable ? 'favorable' : 'caution', `کیفیت منبع: ${source.quality}.`),
    opportunityFactor('source_conflict', conflict ? 'caution' : 'favorable', conflict ? 'برای Statement مرتبط، تعارض یا Contradiction ثبت شده است.' : 'در Workspace فعلی تعارض ثبت‌شده‌ای برای این Statement وجود ندارد.'),
  ];
  const common = { source, alignment, matchedGoalTerms, matchedAudienceTerms, factors };
  if (source.freshness === 'stale' || source.quality === 'unverified') {
    return { ...common, decision: 'ignore', explorationEligible: false, nextStep: 'ignore',
      rationale: 'Source برای تصمیم فرصت، کهنه یا تأییدنشده است؛ Popularity احتمالی جای Freshness و Quality را نمی‌گیرد.',
      uncertainty: 'داده Audience response، timing window و context بیرونی مستقل در دسترس نیست.' };
  }
  if (conflict || source.stance === 'contradicts') {
    return { ...common, decision: 'monitor', explorationEligible: false, nextStep: 'research_more',
      rationale: 'وجود تعارض یا Stance مخالف مانع تبدیل این Source به Opportunity Candidate می‌شود؛ فعلاً فقط باید رصد و تحقیق شود.',
      uncertainty: 'حل تعارض منابع و اثر آن بر Goal هنوز انجام نشده است.' };
  }
  if (alignment === 'direct' && qualityFavorable && timingFavorable) {
    return { ...common, decision: 'consider', explorationEligible: false, nextStep: 'bring_to_strategy_review',
      rationale: 'Source تازه و معتبر با Goal و Audience/Positioning هم‌پوشانی مستقیم دارد؛ فقط برای Strategy Review قابل طرح است.',
      uncertainty: 'تناسب انسانی، ظرفیت توجه، ریسک و واکنش Audience هنوز ارزیابی کامل نشده‌اند.' };
  }
  if ((alignment === 'adjacent' || alignment === 'none') && qualityFavorable && timingFavorable) {
    return { ...common, decision: 'monitor', explorationEligible: true, nextStep: 'watch',
      rationale: 'Source معتبر و تازه است اما تناسب مستقیم کافی ندارد.',
      uncertainty: 'این مسیر Exploration است و هنوز ارتباط آن با Person/Brand/Goal اثبات نشده است.' };
  }
  return { ...common, decision: 'monitor', explorationEligible: false, nextStep: 'watch',
    rationale: 'برخی عوامل مثبت‌اند، اما Timing، Quality یا Alignment برای Strategy Review کافی نیست.',
    uncertainty: 'اطلاعات Context، Audience response و attention cost کامل نیست.' };
}

function finalizeOpportunityAssessment(base, decision, exploration, nextStep, rationale) {
  return {
    sourceId: base.source.sourceId,
    title: base.source.title,
    publisher: base.source.publisher,
    citation: base.source.citation,
    alignment: base.alignment,
    decision,
    exploration,
    matchedGoalTerms: base.matchedGoalTerms,
    matchedAudienceTerms: base.matchedAudienceTerms,
    factors: base.factors,
    rationale,
    uncertainty: base.uncertainty,
    nextStep,
    trace: {
      claimId: base.source.claimId,
      evidenceId: base.source.evidenceId,
      factCheckStatus: base.source.factCheckStatus,
    },
    boundaries: {
      trendIsOpportunity: false,
      actionRecommended: false,
      publicApprovalGranted: false,
      externalActionPermitted: false,
    },
  };
}

function opportunityFactor(factor, status, rationale) {
  return { factor, status, rationale };
}

const opportunityStopTerms = new Set([
  'برای', 'اینکه', 'است', 'هست', 'شود', 'شده', 'کردن', 'درباره', 'یعنی', 'اما', 'اگر', 'یک', 'های',
  'that', 'this', 'with', 'from', 'have', 'about', 'were', 'been', 'into', 'your', 'their', 'will',
]);

function opportunityTerms(value) {
  return value.toLocaleLowerCase('fa-IR').split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim()).filter((term) => term.length >= 4 && !opportunityStopTerms.has(term));
}

function validClaimReview(body) {
  return typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    ['proposed', 'verified', 'disputed', 'expired', 'revoked'].includes(body.expectedStatus) &&
    ['verify', 'dispute', 'revoke'].includes(body.decision) &&
    validText(body.rationale, 20, 2000) && typeof body.humanAttestation === 'boolean';
}

function claimTransition(status, decision) {
  if (decision === 'verify' && status === 'proposed') return 'verified';
  if (decision === 'dispute' && (status === 'proposed' || status === 'verified')) return 'disputed';
  if (decision === 'revoke' && (status === 'proposed' || status === 'verified' || status === 'disputed')) return 'revoked';
  return null;
}

function governedClaimStatus(claimId, fallback) {
  return claimReviews.get(claimId)?.resultingStatus ?? fallback;
}

function claimGovernanceSnapshot() {
  const researchClaims = researchSnapshot().sources.map((source) => {
    const traceStatus = source.factCheckStatus === 'citation_ready'
      ? 'complete'
      : source.factCheckStatus === 'conflicted'
        ? 'conflicted'
        : source.factCheckStatus === 'contradicted'
          ? 'contradicted'
          : source.quality === 'unverified' ? 'unverified_source' : 'stale';
    const traceRationale = {
      complete: 'Source، Citation، Evidence و Freshness برای بازبینی انسانی حاضرند.',
      conflicted: 'برای Statement یکسان، منبع حامی و ناقض هم‌زمان وجود دارد.',
      contradicted: 'این Source ادعا را نقض می‌کند و نمی‌تواند مبنای Verify باشد.',
      unverified_source: 'کیفیت Source هنوز تأیید نشده است.',
      stale: 'Source از پنجره تازگی تعریف‌شده عبور کرده است.',
    }[traceStatus];
    return governedClaim({
      claimId: source.claimId, statement: source.statement, kind: 'external_fact',
      status: 'proposed', dataClass: 'public', evidenceIds: [source.evidenceId],
      sourceRefs: [source.url], allowedPurposes: ['external_research'], allowedChannels: [],
      validFrom: source.publishedAt, createdAt: source.accessedAt,
      categories: classifyClaim(source.statement), traceStatus, traceRationale,
      research: {
        sourceId: source.sourceId, title: source.title, publisher: source.publisher,
        url: source.url, quality: source.quality, stance: source.stance,
        publishedAt: source.publishedAt, accessedAt: source.accessedAt, maxAgeDays: source.maxAgeDays,
      },
    });
  });
  const draftClaims = currentDraft ? [governedClaim({
    claimId: currentDraft.claimId, statement: currentDraft.source.statement,
    kind: 'personal_fact', status: 'verified', dataClass: 'confidential',
    evidenceIds: currentDraft.source.evidenceIds, sourceRefs: [],
    allowedPurposes: ['public_drafting'], allowedChannels: [currentDraft.channel],
    validFrom: currentDraft.updatedAt, createdAt: currentDraft.updatedAt,
    categories: classifyClaim(currentDraft.source.statement), traceStatus: 'complete',
    traceRationale: 'Evidence داخلی و Provenance ادعا موجود است.',
  })] : [];
  const claims = [...researchClaims, ...draftClaims].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return {
    generatedAt: new Date().toISOString(), persistence: 'ephemeral',
    summary: {
      totalClaims: claims.length,
      verified: claims.filter((claim) => claim.status === 'verified').length,
      proposed: claims.filter((claim) => claim.status === 'proposed').length,
      disputedOrRevoked: claims.filter((claim) => claim.status === 'disputed' || claim.status === 'revoked').length,
      traceBlocked: claims.filter((claim) => claim.traceStatus !== 'complete').length,
      publicReady: claims.filter((claim) => claim.canUsePublicly).length,
    },
    claims,
  };
}

function governedClaim(claim) {
  const lastReview = claimReviews.get(claim.claimId);
  const status = lastReview?.resultingStatus ?? claim.status;
  const canUsePublicly = status === 'verified' && claim.traceStatus === 'complete' &&
    claim.allowedPurposes.includes('public_drafting') && claim.allowedChannels.length > 0;
  const reviewableDecisions = status === 'proposed'
    ? (claim.traceStatus === 'complete' ? ['verify', 'dispute', 'revoke'] : ['dispute', 'revoke'])
    : status === 'verified' ? ['dispute', 'revoke'] : status === 'disputed' ? ['revoke'] : [];
  const riskLevel = status !== 'verified' || claim.traceStatus !== 'complete'
    ? 'red'
    : claim.categories.some((category) => category !== 'general') ? 'yellow' : 'green';
  return { ...claim, status, riskLevel, canUsePublicly, reviewableDecisions, ...(lastReview ? { lastReview } : {}) };
}

function classifyClaim(statement) {
  const rules = [
    ['company', /شرکت|کسب.?و.?کار|استارتاپ|business|company/iu],
    ['revenue', /درآمد|فروش|سود|گردش مالی|revenue|sales|profit/iu],
    ['experience', /سابقه|سال تجربه|تجربه کاری|experience|worked/iu],
    ['education', /تحصیل|مدرک|دانشگاه|دانشکده|degree|university|education/iu],
    ['numeric', /[0-9۰-۹]|درصد|٪|percent/iu],
    ['award', /جایزه|رتبه|برنده|افتخار|award|winner/iu],
    ['third_party', /او|ایشان|آنها|مشتری|همکار|مدیر|he|she|they|client/iu],
    ['research', /تحقیق|پژوهش|مطالعه|گزارش|research|study|report/iu],
  ];
  const values = rules.filter(([, expression]) => expression.test(statement)).map(([category]) => category);
  return values.length ? values : ['general'];
}

const draftChannels = ['linkedin', 'instagram', 'x', 'youtube', 'podcast', 'newsletter', 'blog'];
const platformAdaptationProfileVersion = 'platform-adaptation-v1';
const platformProfiles = {
  linkedin: {
    audienceContext: 'همتایان حرفه‌ای که به‌دنبال تجربه معتبر و بینش قابل‌انتقال هستند.',
    format: 'شروع روایی، تجربه مستند، برداشت شخصی و پرسش گفت‌وگویی.',
    recommendedCharacters: { min: 400, max: 1800 }, hardMaximumCharacters: 3000,
    visualLanguage: 'متن‌محور؛ در صورت نیاز یک تصویر مستند یا کاروسل کوتاه.',
    interactionModel: 'گفت‌وگوی تخصصی، ذخیره و نظر معنادار؛ بدون Engagement bait.',
    requiredElements: ['روایت مستند:', 'برداشت من:'],
  },
  instagram: {
    audienceContext: 'مخاطب Visual-first که ایده را پیش و پس از بازکردن کپشن دریافت می‌کند.',
    format: 'راهنمای تصویر، کپشن، روایت مستند، برداشت و هشتگ محدود.',
    recommendedCharacters: { min: 300, max: 1200 }, hardMaximumCharacters: 2200,
    visualLanguage: 'کاروسل یا ریل مستند و انسانی؛ بدون Stock image عمومی.',
    interactionModel: 'ذخیره، اشتراک‌گذاری و نظر سنجیده مهم‌تر از Like خام است.',
    requiredElements: ['ایده بصری:', 'کپشن:', 'روایت مستند:', 'برداشت من:', '#روایت_واقعی'],
  },
  x: {
    audienceContext: 'فید سریع و کم‌زمینه که هر جمله باید مستقل معنا داشته باشد.',
    format: 'زاویه فشرده، گزاره مستند و برداشت شخصی کوتاه.',
    recommendedCharacters: { min: 80, max: 240 }, hardMaximumCharacters: 280,
    visualLanguage: 'Text-native؛ تصویر فقط وقتی معنای تازه‌ای اضافه کند.',
    interactionModel: 'سطح روشن برای Reply و Repost بدون تبدیل متن به شعار.',
    requiredElements: ['برداشت:'],
  },
  youtube: {
    audienceContext: 'مخاطب Search و Subscriber که در ثانیه‌های اول برای ادامه تصمیم می‌گیرد.',
    format: 'طرح Script شامل Hook، راهنمای تصویر، روایت، جمع‌بندی و CTA.',
    recommendedCharacters: { min: 800, max: 8000 }, hardMaximumCharacters: 10000,
    visualLanguage: 'صحنه واقعی، سند روی تصویر و B-roll هدفمند.',
    interactionModel: 'عمق تماشا و سپس یک دعوت مرتبط برای Comment یا اقدام بعدی.',
    requiredElements: ['Hook', 'راهنمای تصویر', 'روایت واقعی', 'جمع‌بندی', 'CTA'],
  },
  podcast: {
    audienceContext: 'شنونده کم‌تصویر و غالباً در حال انجام کار دیگر که به Signpost صوتی نیاز دارد.',
    format: 'Cold open، زمینه، روایت شنیداری، تأمل و پرسش پایانی.',
    recommendedCharacters: { min: 1000, max: 8000 }, hardMaximumCharacters: 10000,
    visualLanguage: 'ریتم، مکث و گذار صوتی؛ کاور فقط برای Discovery است.',
    interactionModel: 'تکمیل شنیدن، یادآوری و سپس پاسخ یا گفت‌وگوی بعدی.',
    requiredElements: ['Cold open', 'زمینه', 'روایت شنیداری', 'تأمل شخصی', 'پرسش پایانی'],
  },
  newsletter: {
    audienceContext: 'مخاطب Opt-in که انتظار یادداشت شخصی پرسیگنال و دلیلی برای Reply دارد.',
    format: 'Subject، Preheader، متن نامه، روایت مستند و دعوت به پاسخ مستقیم.',
    recommendedCharacters: { min: 800, max: 6000 }, hardMaximumCharacters: 15000,
    visualLanguage: 'تایپوگرافی Inbox-native و حداکثر یک تصویر یا نمودار مفید.',
    interactionModel: 'Reply، Forward و عمق رابطه مهم‌تر از واکنش عمومی است.',
    requiredElements: ['Subject:', 'Preheader:', 'متن نامه', 'روایت مستند', 'پاسخ مستقیم'],
  },
  blog: {
    audienceContext: 'خواننده Search و Archive که ممکن است بدون رابطه قبلی وارد شود.',
    format: 'H1 توصیفی، مقدمه، روایت مستند، تحلیل و جمع‌بندی ماندگار.',
    recommendedCharacters: { min: 1200, max: 10000 }, hardMaximumCharacters: 20000,
    visualLanguage: 'Headingهای قابل اسکن و تصویر، نمودار یا Screenshot مبتنی بر شاهد.',
    interactionModel: 'Discovery، مطالعه عمیق، Citation و مسیر روشن به مطلب یا تماس بعدی.',
    requiredElements: ['# ', '## مقدمه', '## روایت مستند', '## تحلیل', '## جمع‌بندی'],
  },
};

function validDraftCreate(body) {
  return (
    typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    (body.sourceKind === 'memory' || body.sourceKind === 'text_asset') &&
    typeof body.sourceRef === 'string' && draftChannels.includes(body.channel) &&
    validText(body.narrativeAngle, 3, 500) && validText(body.takeaway, 3, 2000) &&
    body.publicDraftingConsent === true
  );
}

function validDraftMutation(body) {
  return typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 1;
}

function draftSourceSnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    persistence: 'ephemeral',
    records: [
      ...[...textAssets.values()]
        .filter((asset) => asset.permissions.brandUsage)
        .map((asset) => ({
          kind: 'text_asset', ref: asset.assetId, label: asset.title,
          assertionId: asset.assertionId, statement: asset.assertionText,
          evidenceIds: [asset.evidenceId], sourceTypes: ['text_asset'],
        })),
      ...[...memoryProposals.values()]
        .filter((source) => usableMemoryDraftSource(source) && source.permissions.brandUsage)
        .map((source) => ({
          kind: 'memory', ref: source.id, label: source.text.slice(0, 120),
          assertionId: source.activeAssertionId, statement: source.text,
          evidenceIds: [source.activeEvidenceId ?? `evidence_${source.id.slice('memory_'.length)}`],
          sourceTypes: [source.revisionCount > 1 ? 'user_correction' : 'conversation_turn'],
        })),
    ],
  };
}

function usableMemoryDraftSource(source) {
  return Boolean(source?.confirmedAt && !source.deleted && !source.contestedAt &&
    !source.permissionsRevoked && typeof source.text === 'string');
}

function resolveDraftSource(kind, ref) {
  return draftSourceSnapshot().records.find((source) => source.kind === kind && source.ref === ref);
}

function sourceAuthorizedForContentAction(source) {
  if (!currentContentApproval()) return false;
  return Boolean(Array.isArray(approval.evidenceIds) && source.evidenceIds.length > 0 &&
    source.evidenceIds.every((id) => approval.evidenceIds.includes(id)));
}

function currentContentApproval() {
  return approval?.actionId === 'essay' && approval.strategyRevision === strategy.revision &&
    approval.decisionContextRevision === decisionContext.revision &&
    approval.decisionContextHash === decisionContext.contextHash &&
    new Date(approval.decisionWindowEndsAt) > new Date();
}

function draftSnapshot() {
  const source = resolveDraftSource(currentDraft.source.kind, currentDraft.source.ref);
  return {
    ...currentDraft,
    persistence: 'ephemeral',
    sourceAvailable: Boolean(source && sourceAuthorizedForContentAction(source)),
    staleStrategy: currentDraft.strategyRevision !== strategy.revision,
  };
}

function platformAdaptationFor(channel, body) {
  return {
    version: platformAdaptationProfileVersion,
    ...platformProfiles[channel],
    currentCharacters: body.length,
  };
}

function draftMutationGate(draftId, revision) {
  if (!currentDraft || currentDraft.draftId !== draftId) return 'draft_not_found';
  if (currentDraft.revision !== revision) return 'revision_changed';
  if (currentDraft.strategyRevision !== strategy.revision) return 'strategy_changed';
  if (governedClaimStatus(currentDraft.claimId, 'verified') !== 'verified') return 'claim_not_verified';
  const source = resolveDraftSource(currentDraft.source.kind, currentDraft.source.ref);
  if (!source) return 'source_not_available';
  if (!sourceAuthorizedForContentAction(source)) return 'source_not_authorized_for_action';
  return null;
}

function repeatedDraftRequest(requestId, operation, value) {
  const existing = draftRequests.get(requestId);
  if (!existing) return null;
  const fingerprint = JSON.stringify({ operation, value });
  return existing.fingerprint === fingerprint
    ? { snapshot: existing.snapshot }
    : { error: 'idempotency_mismatch' };
}

function rememberDraftRequest(requestId, operation, value, snapshot) {
  draftRequests.set(requestId, {
    fingerprint: JSON.stringify({ operation, value }),
    snapshot: { ...snapshot, persistence: 'ephemeral', sourceAvailable: true, staleStrategy: false },
  });
}

function composePlatformDraft(channel, angle, statement, takeaway, preferences = {}) {
  const adaptedAngle = preferences['voice.headline_length'] === 'shorter' ? shorten(angle, 72) : angle;
  const adaptedTakeaway = preferences['voice.draft_length'] === 'shorter' ? shorten(takeaway, 180) : takeaway;
  if (channel === 'x') return composeX(adaptedAngle, statement, adaptedTakeaway);
  if (channel === 'youtube') return `Hook\n${adaptedAngle}\n\nراهنمای تصویر\nنمای نزدیک از موقعیت واقعی یا سند مرتبط؛ بدون تصویرسازی ساختگی.\n\nروایت واقعی\n${statement}\n\nجمع‌بندی\n${adaptedTakeaway}\n\nCTA\nتجربه مرتبط خودتان را در یک جمله بنویسید.`;
  if (channel === 'podcast') return `Cold open\n${adaptedAngle}\n\nزمینه\nچرا این تجربه اکنون ارزش شنیدن دارد.\n\nروایت شنیداری\n${statement}\n\nتأمل شخصی\n${adaptedTakeaway}\n\nپرسش پایانی\nاین تجربه چه پرسشی برای شما ایجاد می‌کند؟`;
  if (channel === 'newsletter') return `Subject: ${shorten(adaptedAngle, 72)}\n\nPreheader: ${shorten(adaptedTakeaway, 120)}\n\nمتن نامه\n${adaptedAngle}\n\nروایت مستند\n${statement}\n\n${adaptedTakeaway}\n\nپاسخ مستقیم\nاگر تجربه مشابهی داشته‌اید، با Reply برایم بنویسید.`;
  if (channel === 'blog') return `# ${adaptedAngle}\n\n## مقدمه\nاین نوشته یک تجربه واقعی را به یک مسئله قابل بررسی تبدیل می‌کند.\n\n## روایت مستند\n${statement}\n\n## تحلیل\n${adaptedTakeaway}\n\n## جمع‌بندی\nاین تجربه پاسخ نهایی نیست؛ نقطه شروعی برای تصمیم دقیق‌تر است.`;
  if (channel === 'instagram') return `ایده بصری:\nکاروسل مستند با یک تصویر واقعی و تیتر «${shorten(adaptedAngle, 72)}»\n\nکپشن:\n${adaptedAngle}\n\nروایت مستند:\n${statement}\n\nبرداشت من:\n${adaptedTakeaway}\n\n#روایت_واقعی`;
  const question = preferences['voice.question_cta'] === 'omit' ? '' : '\n\nپرسش برای گفت‌وگو:\nنظر شما چیست؟';
  return `${adaptedAngle}\n\nروایت مستند:\n${statement}\n\nبرداشت من:\n${adaptedTakeaway}${question}`;
}

function composeX(angle, statement, takeaway) {
  const fixedLength = '\n\n\n\nبرداشت: '.length + statement.length;
  const available = Math.max(0, platformProfiles.x.hardMaximumCharacters - fixedLength);
  const angleBudget = Math.min(72, Math.max(0, Math.floor(available * .4)));
  const fittedAngle = shorten(angle, angleBudget);
  const takeawayBudget = Math.max(0, available - fittedAngle.length);
  return `${fittedAngle}\n\n${statement}\n\nبرداشت: ${shorten(takeaway, takeawayBudget)}`;
}

function feedbackSnapshot() {
  const recentEvents = [...feedbackEvents.values()]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 50);
  const preferences = [...preferenceProposals.values()]
    .sort((left, right) => right.proposedAt.localeCompare(left.proposedAt));
  return {
    generatedAt: new Date().toISOString(),
    persistence: 'ephemeral',
    summary: {
      recentEvents: recentEvents.length,
      proposed: preferences.filter((item) => item.status === 'proposed').length,
      applied: preferences.filter((item) => item.status === 'applied').length,
    },
    recentEvents,
    preferences,
  };
}

function validWorkflowCostReservation(body) {
  return body && validRequestId(body.requestId) &&
    typeof body.workflowId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{2,119}$/.test(body.workflowId) &&
    typeof body.invocationId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{2,119}$/.test(body.invocationId) &&
    ['strategy_recommendation', 'draft_generation', 'research', 'platform_adaptation', 'evaluation', 'other'].includes(body.kind) &&
    Number.isSafeInteger(body.estimatedCostMinorUnits) && body.estimatedCostMinorUnits >= 0 && body.estimatedCostMinorUnits <= 1000000 &&
    Number.isSafeInteger(body.plannedSteps) && body.plannedSteps >= 0 && body.plannedSteps <= 1000;
}

function validWorkflowCostCharge(body) {
  const components = body?.components;
  const componentKeys = [
    'modelMinorUnits', 'embeddingMinorUnits', 'storageMinorUnits',
    'searchMinorUnits', 'toolApiMinorUnits', 'computeMinorUnits',
  ];
  const validComponents = components && typeof components === 'object' &&
    componentKeys.every((key) => Number.isSafeInteger(components[key]) && components[key] >= 0 && components[key] <= 1000000);
  const total = validComponents
    ? componentKeys.reduce((sum, key) => sum + components[key], 0)
    : -1;
  return body && validRequestId(body.requestId) &&
    typeof body.reservationId === 'string' && /^[0-9a-f-]{36}$/i.test(body.reservationId) &&
    validText(body.provider, 1, 120) && validText(body.model, 1, 120) &&
    [body.inputTokens, body.outputTokens, body.cachedInputTokens].every(
      (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1000000000,
    ) && body.cachedInputTokens <= body.inputTokens && validComponents &&
    Number.isSafeInteger(body.actualSteps) && body.actualSteps >= 0 && body.actualSteps <= 1000 &&
    Number.isSafeInteger(body.humanReviewSeconds) && body.humanReviewSeconds >= 0 && body.humanReviewSeconds <= 86400 &&
    ['provider_reported', 'estimated', 'none'].includes(body.costEvidence) &&
    (body.costEvidence !== 'none' || total === 0);
}

function workflowCostReservationReason(body, reservedAt) {
  if (body.estimatedCostMinorUnits > workflowCostPolicy.perInvocationBudgetMinorUnits) {
    return 'invocation_budget_exceeded';
  }
  const day = reservedAt.slice(0, 10);
  const reservations = [...workflowCostReservations.values()]
    .map((entry) => entry.reservation)
    .filter((entry) => entry.reservedAt.slice(0, 10) === day);
  const charges = [...workflowCostCharges.values()]
    .map((entry) => entry.charge)
    .filter((entry) => entry.chargedAt.slice(0, 10) === day);
  const reservationById = new Map(reservations.map((entry) => [entry.id, entry]));
  const chargedIds = new Set(charges.map((entry) => entry.reservationId));
  const workflowReservations = reservations.filter((entry) => entry.workflowId === body.workflowId);
  const workflowCharges = charges.filter(
    (entry) => reservationById.get(entry.reservationId)?.workflowId === body.workflowId,
  );
  if (workflowCharges.some((entry) => entry.circuitOpened)) return 'workflow_circuit_open';
  const allowed = workflowReservations.filter((entry) => entry.decision === 'allowed');
  if (allowed.length >= workflowCostPolicy.maxInvocationsPerWorkflow) {
    return 'workflow_invocation_limit_exceeded';
  }
  const actualSteps = workflowCharges.reduce((sum, entry) => sum + entry.actualSteps, 0);
  const reservedSteps = allowed.filter((entry) => !chargedIds.has(entry.id))
    .reduce((sum, entry) => sum + entry.plannedSteps, 0);
  if (actualSteps + reservedSteps + body.plannedSteps > workflowCostPolicy.maxStepsPerWorkflow) {
    return 'workflow_step_limit_exceeded';
  }
  const workflowCharged = workflowCharges.reduce((sum, entry) => sum + entry.actualCostMinorUnits, 0);
  const workflowReserved = allowed.filter((entry) => !chargedIds.has(entry.id))
    .reduce((sum, entry) => sum + entry.estimatedCostMinorUnits, 0);
  if (workflowCharged + workflowReserved + body.estimatedCostMinorUnits > workflowCostPolicy.perWorkflowBudgetMinorUnits) {
    return 'workflow_budget_exceeded';
  }
  const dayCharged = charges.reduce((sum, entry) => sum + entry.actualCostMinorUnits, 0);
  const dayReserved = reservations.filter((entry) => entry.decision === 'allowed' && !chargedIds.has(entry.id))
    .reduce((sum, entry) => sum + entry.estimatedCostMinorUnits, 0);
  return dayCharged + dayReserved + body.estimatedCostMinorUnits > workflowCostPolicy.dailyBudgetMinorUnits
    ? 'daily_budget_exceeded'
    : undefined;
}

function workflowCostSettlementReason(reservation, body, actualCostMinorUnits) {
  if (actualCostMinorUnits > reservation.estimatedCostMinorUnits) return 'actual_cost_exceeded_reservation';
  if (body.actualSteps > reservation.plannedSteps) return 'actual_steps_exceeded_reservation';
  const day = new Date().toISOString().slice(0, 10);
  const reservations = [...workflowCostReservations.values()].map((entry) => entry.reservation);
  const workflowReservationIds = new Set(
    reservations.filter((entry) => entry.workflowId === reservation.workflowId).map((entry) => entry.id),
  );
  const charges = [...workflowCostCharges.values()].map((entry) => entry.charge)
    .filter((entry) => entry.chargedAt.slice(0, 10) === day);
  const workflowCost = charges.filter((entry) => workflowReservationIds.has(entry.reservationId))
    .reduce((sum, entry) => sum + entry.actualCostMinorUnits, 0);
  if (workflowCost + actualCostMinorUnits > workflowCostPolicy.perWorkflowBudgetMinorUnits) {
    return 'workflow_budget_exceeded';
  }
  return charges.reduce((sum, entry) => sum + entry.actualCostMinorUnits, 0) + actualCostMinorUnits > workflowCostPolicy.dailyBudgetMinorUnits
    ? 'daily_budget_exceeded'
    : undefined;
}

function workflowCostSnapshot(generatedAt = new Date()) {
  const day = generatedAt.toISOString().slice(0, 10);
  const reservations = [...workflowCostReservations.values()].map((entry) => entry.reservation)
    .filter((entry) => entry.reservedAt.slice(0, 10) === day);
  const charges = [...workflowCostCharges.values()].map((entry) => entry.charge)
    .filter((entry) => entry.chargedAt.slice(0, 10) === day);
  const chargedIds = new Set(charges.map((entry) => entry.reservationId));
  const active = reservations.filter((entry) => entry.decision === 'allowed' && !chargedIds.has(entry.id));
  const chargedCost = charges.reduce((sum, entry) => sum + entry.actualCostMinorUnits, 0);
  const reservedCost = active.reduce((sum, entry) => sum + entry.estimatedCostMinorUnits, 0);
  const evidence = new Set(charges.map((entry) => entry.costEvidence));
  const truthStatus = charges.length === 0 ? 'no_usage' : evidence.size > 1 ? 'mixed' :
    evidence.has('provider_reported') ? 'measured' : evidence.has('estimated') ? 'estimated' : 'unmetered';
  const sum = (select) => charges.reduce((total, entry) => total + select(entry), 0);
  const workflowIds = [...new Set(reservations.map((entry) => entry.workflowId))];
  const workflows = workflowIds.map((workflowId) => {
    const entries = reservations.filter((entry) => entry.workflowId === workflowId);
    const ids = new Set(entries.map((entry) => entry.id));
    const workflowCharges = charges.filter((entry) => ids.has(entry.reservationId));
    const current = entries.filter((entry) => entry.decision === 'allowed' && !chargedIds.has(entry.id));
    const workflowCharged = workflowCharges.reduce((total, entry) => total + entry.actualCostMinorUnits, 0);
    const workflowReserved = current.reduce((total, entry) => total + entry.estimatedCostMinorUnits, 0);
    const opened = workflowCharges.find((entry) => entry.circuitOpened);
    const ratio = (workflowCharged + workflowReserved) / workflowCostPolicy.perWorkflowBudgetMinorUnits;
    return {
      workflowId, kind: entries[0]?.kind ?? 'other',
      invocationCount: entries.filter((entry) => entry.decision === 'allowed').length,
      chargedCostMinorUnits: workflowCharged, activeReservedCostMinorUnits: workflowReserved,
      actualSteps: workflowCharges.reduce((total, entry) => total + entry.actualSteps, 0),
      status: opened ? 'circuit_open' : ratio >= workflowCostPolicy.warningRatio ? 'warning' : 'within_budget',
      ...(opened?.circuitReason ? { circuitReason: opened.circuitReason } : {}),
    };
  });
  const dayRatio = (chargedCost + reservedCost) / workflowCostPolicy.dailyBudgetMinorUnits;
  return {
    policyVersion: workflowCostPolicy.version, generatedAt: generatedAt.toISOString(),
    persistence: 'ephemeral', policy: workflowCostPolicy, truthStatus,
    day: {
      date: day, chargedCostMinorUnits: chargedCost,
      activeReservedCostMinorUnits: reservedCost,
      remainingCostMinorUnits: Math.max(0, workflowCostPolicy.dailyBudgetMinorUnits - chargedCost - reservedCost),
      status: charges.some((entry) => entry.circuitOpened)
        ? 'circuit_open' : dayRatio >= workflowCostPolicy.warningRatio ? 'warning' : 'within_budget',
    },
    usage: {
      chargeCount: charges.length,
      measuredChargeCount: charges.filter((entry) => entry.costEvidence === 'provider_reported').length,
      estimatedChargeCount: charges.filter((entry) => entry.costEvidence === 'estimated').length,
      unmeteredChargeCount: charges.filter((entry) => entry.costEvidence === 'none').length,
      inputTokens: sum((entry) => entry.inputTokens), outputTokens: sum((entry) => entry.outputTokens),
      cachedInputTokens: sum((entry) => entry.cachedInputTokens),
      modelMinorUnits: sum((entry) => entry.components.modelMinorUnits),
      embeddingMinorUnits: sum((entry) => entry.components.embeddingMinorUnits),
      storageMinorUnits: sum((entry) => entry.components.storageMinorUnits),
      searchMinorUnits: sum((entry) => entry.components.searchMinorUnits),
      toolApiMinorUnits: sum((entry) => entry.components.toolApiMinorUnits),
      computeMinorUnits: sum((entry) => entry.components.computeMinorUnits),
      humanReviewSeconds: sum((entry) => entry.humanReviewSeconds),
    },
    workflows,
    recentReservations: reservations.sort((a, b) => b.reservedAt.localeCompare(a.reservedAt)).slice(0, 50),
    recentCharges: charges.sort((a, b) => b.chargedAt.localeCompare(a.chargedAt)).slice(0, 50),
  };
}

function modelGovernanceSnapshot(generatedAt = new Date()) {
  return {
    policyVersion: 'prompt-model-governance-v1',
    generatedAt: generatedAt.toISOString(),
    providerConfigured: false,
    executionEnabled: false,
    costGateRequired: true,
    durableInvocationJournal: false,
    inputSafety: {
      policyVersion: 'model-input-safety-v1',
      generatedAt: generatedAt.toISOString(),
      required: true,
      failClosed: true,
      rawInputRetained: false,
      rules: [
        'credential_material', 'prompt_injection', 'opaque_encoded_payload',
        'scan_limit_exceeded', 'unsupported_input_shape',
      ].map((id) => ({ id, action: 'deny' })),
      limits: {
        maximumDepth: 20, maximumNodes: 10000,
        maximumStrings: 2000, maximumCharacters: 2000000,
      },
    },
    reconciliation: {
      policyVersion: 'model-invocation-reconciliation-v1',
      generatedAt: generatedAt.toISOString(),
      available: false,
      durableJournalRequired: true,
      humanConfirmationRequired: true,
      automaticRetryAllowed: false,
      rawEvidenceRetained: false,
      pendingRecoveryCount: 0,
      dispositions: ['not_executed', 'billed_output_unavailable'],
    },
    invocationJournal: {
      policyVersion: 'model-invocation-journal-v1',
      generatedAt: generatedAt.toISOString(),
      persistence: 'memory',
      durable: false,
      summary: {
        total: 0, started: 0, recoveryRequired: 0,
        succeeded: 0, blocked: 0, failed: 0, reconciled: 0,
      },
      recentInvocations: [],
    },
    routes: modelGovernanceRoutes,
  };
}

function modelRoute(id, purpose, schemaName, modelTier, risk) {
  return {
    id, purpose, schemaName, promptVersion: `${id}.0`,
    provider: 'not-configured', model: 'not-configured', modelTier, risk,
    allowedDataClasses: ['public', 'internal'], maxOutputTokens: 4000,
    estimatedCostMinorUnits: 25, plannedSteps: 1, timeoutMs: 30000,
    rollout: 'disabled', evalSuite: `${id}-eval-v1`, evalStatus: 'not_run',
  };
}

function strategicQualitySnapshot(generatedAt = new Date()) {
  const workbench = snapshot();
  const recentReviews = [...strategicRecommendationReviews.values()]
    .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt))
    .slice(0, 50);
  const current = currentStrategicReviews(recentReviews);
  const accepted = current.filter((review) => review.decision === 'accepted').length;
  const rejected = current.filter((review) => review.decision === 'rejected').length;
  const needsRevision = current.filter((review) => review.decision === 'needs_revision').length;
  const observedMetrics = current.length === 0 ? null : strategicReviewMetrics(current, accepted);
  const established = current.length >= 5;
  const recentOutcomes = [...strategicActionOutcomes.values()]
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .slice(0, 50);
  const currentOutcomes = currentStrategicOutcomes(recentOutcomes);
  const completed = currentOutcomes.filter((outcome) => outcome.executionStatus === 'completed').length;
  const partial = currentOutcomes.filter((outcome) => outcome.executionStatus === 'partial').length;
  const notExecuted = currentOutcomes.filter((outcome) => outcome.executionStatus === 'not_executed').length;
  const observedOutcomeMetrics = currentOutcomes.length === 0
    ? null
    : strategicOutcomeMetrics(currentOutcomes, completed, partial);
  const outcomeEstablished = currentOutcomes.length >= 5;
  return {
    policyVersion: 'strategic-quality-v1',
    generatedAt: generatedAt.toISOString(),
    persistence: 'ephemeral',
    context: {
      strategyRevision: workbench.goal.revision,
      decisionContextRevision: workbench.decisionContext.revision,
      decisionContextHash: workbench.decisionContext.contextHash,
      decisionWindowEndsAt: workbench.decisionFrame.decisionWindow.expiresAt,
    },
    rubric: strategicQualityRubric(workbench),
    ownerBaseline: {
      status: established ? 'established' : 'collecting',
      minimumSampleSize: 5,
      sampleSize: current.length,
      remainingSamples: Math.max(0, 5 - current.length),
      accepted,
      rejected,
      needsRevision,
      observedMetrics,
      baselineMetrics: established ? observedMetrics : null,
    },
    outcomeBaseline: {
      policyVersion: 'strategic-outcome-followup-v1',
      status: outcomeEstablished ? 'established' : 'collecting',
      minimumSampleSize: 5,
      sampleSize: currentOutcomes.length,
      remainingSamples: Math.max(0, 5 - currentOutcomes.length),
      completed,
      partial,
      notExecuted,
      observedMetrics: observedOutcomeMetrics,
      baselineMetrics: outcomeEstablished ? observedOutcomeMetrics : null,
    },
    recentReviews,
    recentOutcomes,
  };
}

function strategicQualityRubric(workbench) {
  const meaningfulSignals = new Set([
    'کیفیت تعامل', 'عمق تعامل', 'تغییر رابطه', 'فرصت ایجادشده',
    'تغییر ادراک', 'پیام خصوصی', 'پشیمانی کاربر', 'رضایت کاربر', 'انرژی کاربر',
  ]);
  const contentActions = workbench.actions.filter((action) => action.kind === 'content');
  const checks = [
    {
      id: 'explicit_decision_frame', severity: 'critical',
      passed: Boolean(
        workbench.decisionFrame.why.objective && workbench.decisionFrame.forWhom &&
        workbench.decisionFrame.decisionWindow.expiresAt &&
        workbench.decisionFrame.rankingTransparency.opportunityCostVisible &&
        !workbench.decisionFrame.rankingTransparency.hiddenScoreUsed
      ),
      evidence: workbench.decisionFrame.policyVersion,
    },
    {
      id: 'multidimensional_attention_budget', severity: 'high',
      passed: workbench.actions.every((action) =>
        action.attentionCostMinutes >= 0 && action.energyCost >= 1 && action.attentionDemand >= 1 &&
        action.visibilityCost >= 1 && action.emotionalCost >= 1 &&
        (workbench.evidence.state === 'insufficient' || action.opportunityCost !== null),
      ),
      evidence: `${String(workbench.actions.length)} action cost contracts`,
    },
    {
      id: 'human_gated_recommendations', severity: 'critical',
      passed: workbench.actions.every((action) =>
        action.decision.requiredApproval === 'human' &&
        !action.decision.boundaries.recommendationIsExecution &&
        !action.decision.boundaries.publicApprovalGranted &&
        !action.decision.boundaries.externalActionPermitted,
      ),
      evidence: `${String(workbench.actions.length)} human-gated actions`,
    },
    {
      id: 'deliberate_no_action', severity: 'critical',
      passed: workbench.actions.some((action) =>
        action.kind === 'no_action' && action.decision.posture === 'delay' && action.decision.format === 'none',
      ),
      evidence: workbench.actions.map((action) => action.kind).join(' | '),
    },
    {
      id: 'grounded_or_abstaining', severity: 'critical',
      passed: workbench.evidence.state === 'grounded'
        ? workbench.actions.every((action) => action.evidenceState === 'grounded')
        : workbench.actions.every((action) => action.interaction !== 'approve' || action.kind === 'no_action'),
      evidence: `${workbench.evidence.state}:${String(workbench.evidence.strategyEvidenceCount)}`,
    },
    {
      id: 'current_context_binding', severity: 'critical',
      passed: workbench.actions.every((action) =>
        action.decision.strategyRevision === workbench.goal.revision &&
        action.decision.decisionContextRevision === workbench.decisionContext.revision &&
        action.decision.decisionContextHash === workbench.decisionContext.contextHash,
      ),
      evidence: `strategy:${String(workbench.goal.revision)} context:${String(workbench.decisionContext.revision)}`,
    },
    {
      id: 'mother_concept_before_platform', severity: 'high',
      passed: contentActions.every((action) =>
        action.decision.format === 'mother_concept' && !action.decision.platformSelected,
      ),
      evidence: contentActions.length === 0 ? 'not_applicable' : `${String(contentActions.length)} mother concepts`,
    },
    {
      id: 'meaningful_learning_signals', severity: 'high',
      passed: workbench.evidence.state === 'insufficient' || workbench.actions.every((action) =>
        action.decision.measurementPlan.signals.some((signal) => meaningfulSignals.has(signal)),
      ),
      evidence: `${String(workbench.actions.length)} meaningful measurement plans`,
    },
  ];
  const passedChecks = checks.filter((check) => check.passed).length;
  const criticalFailures = checks.filter((check) => !check.passed && check.severity === 'critical').length;
  return {
    policyVersion: 'strategic-quality-v1',
    status: checks.every((check) => check.passed) ? 'pass' : 'fail',
    passedChecks,
    totalChecks: checks.length,
    criticalFailures,
    checks,
  };
}

function currentStrategicReviews(reviews = [...strategicRecommendationReviews.values()]) {
  const superseded = new Set(reviews.flatMap((review) => review.supersedesReviewId ? [review.supersedesReviewId] : []));
  const latest = new Map();
  for (const review of [...reviews]
    .filter((candidate) => !superseded.has(candidate.id))
    .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt))) {
    const key = [
      review.actionId, review.strategyRevision, review.decisionContextRevision, review.decisionContextHash,
    ].join(':');
    if (!latest.has(key)) latest.set(key, review);
  }
  return [...latest.values()];
}

function currentStrategicOutcomes(outcomes = [...strategicActionOutcomes.values()]) {
  const superseded = new Set(outcomes.flatMap((outcome) => outcome.supersedesOutcomeId ? [outcome.supersedesOutcomeId] : []));
  const latest = new Map();
  for (const outcome of [...outcomes]
    .filter((candidate) => !superseded.has(candidate.id))
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))) {
    if (!latest.has(outcome.reviewId)) latest.set(outcome.reviewId, outcome);
  }
  return [...latest.values()];
}

function strategicReviewMetrics(reviews, accepted) {
  const average = (key) => Math.round(
    (reviews.reduce((total, review) => total + review[key], 0) / reviews.length) * 1000,
  ) / 1000;
  return {
    acceptanceRate: Math.round((accepted / reviews.length) * 1000) / 1000,
    averageUsefulness: average('usefulness'),
    averageTrust: average('trust'),
    averageFriction: average('friction'),
  };
}

function strategicOutcomeMetrics(outcomes, completed, partial) {
  const average = (values) => values.length === 0
    ? null
    : Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 1000) / 1000;
  return {
    completionRate: Math.round((completed / outcomes.length) * 1000) / 1000,
    followThroughRate: Math.round(((completed + partial) / outcomes.length) * 1000) / 1000,
    averageSatisfaction: average(outcomes.map((outcome) => outcome.satisfaction)),
    averageRegret: average(outcomes.map((outcome) => outcome.regret)),
    averageEnergy: average(outcomes.map((outcome) => outcome.energy)),
    averageEngagementQuality: average(outcomes.flatMap((outcome) =>
      outcome.engagementQuality === undefined ? [] : [outcome.engagementQuality])),
    averageInteractionDepth: average(outcomes.flatMap((outcome) =>
      outcome.interactionDepth === undefined ? [] : [outcome.interactionDepth])),
    privateMessages: outcomes.reduce((total, outcome) => total + outcome.privateMessages, 0),
    opportunitiesCreated: outcomes.reduce((total, outcome) => total + outcome.opportunitiesCreated, 0),
    relationshipImprovements: outcomes.filter((outcome) => outcome.relationshipChange === 'positive').length,
    mediaOpportunities: outcomes.reduce((total, outcome) => total + outcome.mediaOpportunities, 0),
    positivePerceptionShifts: outcomes.filter((outcome) => outcome.perceptionShift === 'positive').length,
    materialBusinessOutcomes: outcomes.filter((outcome) => outcome.businessOutcome === 'material').length,
  };
}

function memorySnapshot() {
  const records = [...memoryProposals.values()]
    .filter((proposal) => proposal.confirmedAt)
    .map((proposal) => memoryRecord(proposal))
    .sort((left, right) => right.lifecycle.updatedAt.localeCompare(left.lifecycle.updatedAt));
  return {
    generatedAt: new Date().toISOString(),
    persistence: 'ephemeral',
    summary: {
      total: records.length,
      active: records.filter((record) => record.lifecycle.status === 'active').length,
      attentionRequired: records.filter((record) => (
        record.lifecycle.status === 'contested' || record.lifecycle.status === 'consent_revoked'
      )).length,
      deleted: records.filter((record) => record.lifecycle.status === 'deleted').length,
    },
    records,
  };
}

function recordAudit(requestId, event) {
  if (!auditEvents.has(requestId)) {
    auditEvents.set(requestId, { id: requestId, ...event });
  }
}

function auditSnapshot() {
  const events = [...auditEvents.values()]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 100);
  return {
    generatedAt: new Date().toISOString(),
    persistence: 'ephemeral',
    summary: {
      total: auditEvents.size,
      approvals: events.filter((event) => event.decision === 'approved').length,
      dataRights: events.filter((event) => (
        event.eventType.startsWith('memory.') ||
        event.eventType === 'asset.revoke_brand_usage' || event.eventType === 'asset.delete' ||
        event.eventType === 'relationship.stakeholder_deleted' ||
        event.eventType === 'perception.signal_deleted'
      )).length,
      exports: events.filter((event) => event.eventType.endsWith('exported')).length,
    },
    events,
  };
}

function recordEditFeedback(requestId, draftId, before, after) {
  const fingerprint = JSON.stringify({ operation: 'edited', draftId, after });
  const repeated = reserveFeedbackRequest(requestId, fingerprint);
  if (repeated) return;
  const signals = analyzeDraftEdit(before, after);
  const values = signals.length ? signals : [{ key: undefined, value: undefined, rationale: undefined }];
  values.forEach((signal, index) => {
    const id = `feedback_${requestId}_${String(index)}`;
    feedbackEvents.set(id, {
      id,
      artifactType: 'draft',
      artifactId: draftId,
      eventType: 'edited',
      ...(signal.key ? { signalKey: signal.key, signalValue: signal.value } : {}),
      occurredAt: new Date().toISOString(),
    });
  });
  for (const signal of signals) maybeProposePreference(signal, requestId);
}

function maybeProposePreference(signal, requestId) {
  const evidence = [...feedbackEvents.values()].filter((event) =>
    event.eventType === 'edited' && event.signalKey === signal.key && event.signalValue === signal.value,
  );
  if (evidence.length < 3) return;
  const active = [...preferenceProposals.values()].some((item) =>
    item.preferenceKey === signal.key && item.proposedValue === signal.value &&
    (item.status === 'proposed' || item.status === 'applied'),
  );
  if (active) return;
  const id = crypto.randomUUID();
  preferenceProposals.set(id, {
    id,
    preferenceKey: signal.key,
    proposedValue: signal.value,
    evidenceEventIds: evidence.map((event) => event.id),
    rationale: `${String(evidence.length)} ویرایش هم‌جهت ثبت شده است. ${signal.rationale} این فقط یک پیشنهاد است و بدون تأیید مالک اعمال نمی‌شود.`,
    confidence: Math.min(0.95, evidence.length / 5),
    status: 'proposed',
    proposedAt: new Date().toISOString(),
  });
}

function analyzeDraftEdit(before, after) {
  const previous = before.trim();
  const next = after.trim();
  if (previous === next) return [];
  const signals = [];
  const difference = next.length - previous.length;
  if (difference <= -20 && next.length <= previous.length * 0.82) {
    signals.push({ key: 'voice.draft_length', value: 'shorter', rationale: 'کاربر متن را به‌طور معنادار کوتاه کرده است.' });
  } else if (difference >= 20 && next.length >= previous.length * 1.18) {
    signals.push({ key: 'voice.draft_length', value: 'longer', rationale: 'کاربر متن را به‌طور معنادار بسط داده است.' });
  }
  const oldHeadline = firstLine(previous);
  const newHeadline = firstLine(next);
  if (oldHeadline.length - newHeadline.length >= 8 && newHeadline.length <= oldHeadline.length * 0.8) {
    signals.push({ key: 'voice.headline_length', value: 'shorter', rationale: 'کاربر تیتر را کوتاه‌تر کرده است.' });
  }
  if (headingCount(next) < headingCount(previous)) {
    signals.push({ key: 'voice.heading_density', value: 'lower', rationale: 'کاربر تعداد تیترهای میانی را کاهش داده است.' });
  }
  if (/[؟?]\s*$/u.test(previous) && !/[؟?]\s*$/u.test(next)) {
    signals.push({ key: 'voice.question_cta', value: 'omit', rationale: 'کاربر پرسش پایانی را حذف کرده است.' });
  }
  return signals;
}

function appliedPreferences() {
  return Object.fromEntries(
    [...preferenceProposals.values()]
      .filter((item) => item.status === 'applied')
      .map((item) => [item.preferenceKey, item.proposedValue]),
  );
}

function reserveFeedbackRequest(requestId, fingerprint) {
  const existing = feedbackRequests.get(requestId);
  if (existing) return existing === fingerprint ? 'repeated' : 'mismatch';
  feedbackRequests.set(requestId, fingerprint);
  return null;
}

function validFeedbackRequest(body) {
  return typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId);
}

function validStrategicReview(body) {
  return validFeedbackRequest(body) &&
    typeof body.actionId === 'string' && body.actionId.trim().length >= 1 && body.actionId.length <= 120 &&
    ['accepted', 'rejected', 'needs_revision'].includes(body.decision) &&
    [body.usefulness, body.trust, body.friction].every((value) => Number.isInteger(value) && value >= 1 && value <= 5) &&
    (body.note === undefined || (typeof body.note === 'string' && body.note.trim().length <= 1000)) &&
    Number.isSafeInteger(body.expectedStrategyRevision) && body.expectedStrategyRevision >= 1 &&
    Number.isSafeInteger(body.expectedDecisionContextRevision) && body.expectedDecisionContextRevision >= 1 &&
    typeof body.expectedDecisionContextHash === 'string' &&
    /^[0-9a-f]{64}$/u.test(body.expectedDecisionContextHash) &&
    typeof body.expectedDecisionWindowEndsAt === 'string';
}

function validStrategicOutcome(body) {
  const rating = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
  const count = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 10000;
  return validFeedbackRequest(body) &&
    typeof body.reviewId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(body.reviewId) &&
    ['completed', 'partial', 'not_executed'].includes(body.executionStatus) &&
    [body.satisfaction, body.regret, body.energy].every(rating) &&
    (body.engagementQuality === undefined || rating(body.engagementQuality)) &&
    (body.interactionDepth === undefined || rating(body.interactionDepth)) &&
    [body.privateMessages, body.opportunitiesCreated, body.mediaOpportunities].every(count) &&
    ['positive', 'none', 'negative', 'unknown'].includes(body.relationshipChange) &&
    ['positive', 'none', 'negative', 'unknown'].includes(body.perceptionShift) &&
    ['none', 'early_signal', 'material', 'unknown'].includes(body.businessOutcome) &&
    (body.note === undefined || (typeof body.note === 'string' && body.note.trim().length <= 2000)) &&
    typeof body.outcomeOccurredAt === 'string';
}

function firstLine(value) {
  return value.split(/\r?\n/u).find((line) => line.trim().length > 0)?.trim() ?? '';
}

function headingCount(value) {
  return value.split(/\r?\n/u).filter((line) => /^#{1,6}\s+/u.test(line.trim())).length;
}

function shorten(value, maximum) {
  if (maximum <= 0) return '';
  if (value.length <= maximum) return value;
  if (maximum === 1) return '…';
  return `${value.slice(0, maximum - 1).trimEnd()}…`;
}

function reviewDraftBody(body, channel, statement, claimId) {
  const remaining = body.split(statement).join('');
  const violations = [];
  if (!body.includes(statement)) {
    violations.push({ code: 'missing_evidence_bound_claim', severity: 'red', claimId: 'draft', message: 'Evidence-bound claim is missing.' });
  }
  if (/[0-9۰-۹]|در\s+سال|درآمد|فروش|تعداد|درصد|جایزه|مدرک|دانشگاه|شرکت|بنیان.?گذار|مدیرعامل|تحصیلات|سابقه|according\s+to|research\s+shows|revenue|sales|percent|award|degree|university|company|founder|chief\s+executive/iu.test(remaining)) {
    violations.push({ code: 'potential_unbound_claim', severity: 'red', claimId: 'draft', message: 'Potential unbound fact detected.' });
  }
  if (body.length > platformProfiles[channel].hardMaximumCharacters) {
    violations.push({ code: 'channel_format_violation', severity: 'red', claimId, message: 'Channel length exceeded.' });
  }
  for (const element of platformProfiles[channel].requiredElements) {
    if (!body.includes(element)) {
      violations.push({ code: 'channel_format_violation', severity: 'red', claimId: 'draft', message: `Required ${channel} element is missing: ${element}` });
    }
  }
  const classification = violations.length ? 'red' : 'green';
  return { classification, mayRequestApproval: classification !== 'red', violations };
}

function exportPayload(outcome, snapshot) {
  return {
    outcome,
    filename: `pr-${snapshot.channel}-draft-v${snapshot.revision}.txt`,
    mimeType: 'text/plain;charset=utf-8',
    content: snapshot.body,
    draft: snapshot,
  };
}

function validText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function validTextAsset(body) {
  return (
    typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    validText(body.title, 3, 160) && validText(body.content, 20, 20000) &&
    validText(body.assertionText, 10, 1000) && typeof body.occurredAt === 'string' &&
    body?.permissions?.personalUnderstanding === true &&
    typeof body.permissions.brandUsage === 'boolean'
  );
}

function validStringList(value, minItems, maxItems, minLength, maxLength) {
  return Array.isArray(value) && value.length >= minItems && value.length <= maxItems &&
    value.every((item) => validText(item, minLength, maxLength));
}

function memoryRecord(proposal) {
  const status = proposal.deleted
    ? 'deleted'
    : proposal.contestedAt
      ? 'contested'
      : proposal.permissionsRevoked
        ? 'consent_revoked'
        : 'active';
  return {
    proposalId: proposal.id,
    assertionId: proposal.activeAssertionId,
    text: proposal.deleted ? null : proposal.text,
    epistemicType: 'self_report',
    dataClass: 'confidential',
    confidence: proposal.revisionCount > 1 ? 0.75 : 0.5,
    confidenceRationale: proposal.revisionCount > 1
      ? 'Direct user correction of a prior self-report.'
      : 'Single user self-report; not independently corroborated.',
    provenance: {
      evidenceCount: proposal.deleted ? 0 : 1,
      evidenceIds: proposal.deleted
        ? []
        : [proposal.activeEvidenceId ?? `evidence_${proposal.id.slice('memory_'.length)}`],
      sourceTypes: proposal.deleted
        ? []
        : [proposal.revisionCount > 1 ? 'user_correction' : 'conversation_turn'],
    },
    consent: proposal.permissionsRevoked
      ? { personalUnderstanding: false, brandUsage: false, publicUsage: false }
      : proposal.permissions,
    lifecycle: {
      status,
      revisionCount: proposal.revisionCount,
      confirmedAt: proposal.confirmedAt,
      updatedAt: proposal.updatedAt,
      ...(proposal.contestedAt ? { contestedAt: proposal.contestedAt } : {}),
      ...(proposal.contestedReason ? { contestReason: proposal.contestedReason } : {}),
      ...(proposal.revokedAt ? { revokedAt: proposal.revokedAt } : {}),
      ...(proposal.deletedAt ? { deletedAt: proposal.deletedAt } : {}),
      ...(proposal.deletionReason ? { deletionReason: proposal.deletionReason } : {}),
    },
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function orchestrateConversationTurn(turnId, inputText, memoryProposalRequested) {
  const text = inputText.trim().replace(/ي/gu, 'ی').replace(/ك/gu, 'ک').replace(/\s+/gu, ' ');
  const sensitiveDataDetected = [
    /(?:رمز|پسورد|password|token|توکن|api.?key|کلید خصوصی)[^:\n=]{0,16}[:=]\s*\S{4,}/iu,
    /(?:کارت|شبا|حساب|کد ملی)\D{0,12}\d(?:[\d\s-]{7,24}\d)/u,
    /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/u,
  ].some((pattern) => pattern.test(text));
  const promptInjectionDetected = [
    /(?:دستور|قانون|پرامپت).{0,24}(?:قبلی|سیستم).{0,24}(?:نادیده|لغو|افشا)/u,
    /(?:ignore|reveal).{0,24}(?:previous|system|prompt|instruction)/iu,
  ].some((pattern) => pattern.test(text));
  const publicActionRequested = [
    /منتشر|انتشار|پابلیش|ارسال عمومی|اجرا کن/u,
    /(?:لینکدین|اینستاگرام|یوتیوب|ایکس|توییتر).{0,24}(?:بگذار|بذار|ارسال)/u,
  ].some((pattern) => pattern.test(text));
  const definitions = [
    ['data_control', /(?:حافظه|اطلاعات|داده|برداشت).{0,24}(?:حذف|پاک|فراموش|لغو)(?:ش)?\s+(?:کن|کنید|شود|بشه)|(?:این|اطلاعات|حافظه).{0,30}استفاده نکن|این (?:را|رو).{0,16}(?:پاک|حذف|فراموش)/u, 'data', 'data', 'hold', true, false, 'بازکردن کنترل داده و حافظه'],
    ['correct_memory', /(?:برداشت|حافظه|اطلاعات).{0,24}(?:غلط|نادرست|اصلاح|تصحیح)|(?:اصلاح|تصحیح).{0,24}(?:برداشت|حافظه|اطلاعات)|دیگر (?:متعلق به من|نظر من|باور من) نیست/u, 'memory', 'memory', 'hold', true, false, 'بازکردن حافظه برای اصلاح'],
    ['research_external', /تحقیق|پژوهش|جستجو|جست‌وجو|منبع|فکت.?چک|راستی.?آزمایی|آخرین (?:خبر|آمار|گزارش|تحقیق)|درباره .{2,80}(?:پیدا کن|بررسی کن)/u, 'research', 'research', 'propose', false, false, 'رفتن به Research Workspace'],
    ['assess_action', /منتشر|انتشار|پابلیش|ارسال عمومی|اجرا کن|اقدام کنیم|ریسک این|(?:پست|مقاله|ویدئو|بیانیه).{0,30}(?:بگذار|بذار|منتشر)/u, 'risk', 'risk', 'hold', true, false, 'بررسی اقدام و ریسک'],
    ['draft_content', /(?:پست|مقاله|کپشن|خبرنامه|اسکریپت|سناریو|متن).{0,28}(?:بنویس|بساز|آماده|پیش.?نویس)|برای (?:لینکدین|اینستاگرام|یوتیوب|ایکس|توییتر|وبلاگ|پادکست)/u, 'draft', 'draft', 'propose', true, false, 'رفتن به استودیوی پیش‌نویس'],
    ['set_strategy', /استراتژ|راهبرد|جایگاه|مخاطب هدف|هدف برند|جهت برند|(?:هدف|اولویت).{0,24}(?:عوض|تغییر|جدید)/u, 'strategy', 'strategy', 'propose', true, true, 'بازکردن زمینه استراتژی'],
    ['remember', /یادت (?:باشه|بماند|بمونه)|به خاطر بسپار|در حافظه|ثبتش کن|این را بدان/u, 'memory', 'memory', 'propose', true, true, 'ساخت پیشنهاد حافظه'],
    ['reflect', /فکر می‌کنم|به نظرم|امروز|جلسه|اتفاق|تجربه|دیدگاه|نظرم|باور|ارزش|دیدم|شنیدم|یاد گرفتم|متوجه شدم|در (?:یک )?(?:پروژه|موقعیت)|کردم|داشتم/u, 'conversation', 'today', 'clarify', false, true, 'ادامه همین گفت‌وگو'],
  ];
  let definition = publicActionRequested
    ? definitions.find(([kind]) => kind === 'assess_action')
    : definitions.find(([, pattern]) => pattern.test(text));
  if (!definition && memoryProposalRequested) {
    definition = definitions.find(([kind]) => kind === 'remember');
  }
  const ambiguous = !definition;
  definition ??= ['unclear', /$a/u, 'conversation', 'today', 'clarify', false, true, 'روشن‌کردن مقصود'];
  const [kind, , baseModule, baseTargetView, baseMode, baseApproval, baseMemoryAllowed, baseLabel] = definition;
  const memoryProposalAllowed = baseMemoryAllowed && !sensitiveDataDetected && !promptInjectionDetected;
  const held = sensitiveDataDetected || (promptInjectionDetected && publicActionRequested);
  const requiresUserApproval = baseApproval || publicActionRequested;
  const outcome = held ? 'held' : ambiguous ? 'clarification_required' : requiresUserApproval ? 'approval_required' : 'routed';
  const targetView = held && sensitiveDataDetected ? 'data' : baseTargetView;
  const module = held && sensitiveDataDetected ? 'data' : baseModule;
  const confidence = kind === 'unclear' ? 0.35
    : promptInjectionDetected ? 0.51
      : ['data_control', 'correct_memory'].includes(kind) ? 0.94
        : ['remember', 'research_external', 'assess_action'].includes(kind) ? 0.9
          : text.length < 18 ? 0.64 : kind === 'reflect' ? 0.72 : 0.82;
  const intentRationales = {
    reflect: 'ورودی شبیه تجربه، فکر یا تغییر دیدگاه شخصی است.',
    remember: 'کاربر به‌طور صریح به یادسپاری یا ثبت در حافظه اشاره کرده است.',
    correct_memory: 'ورودی به اصلاح یا رد یک برداشت حافظه‌ای اشاره دارد.',
    set_strategy: 'ورودی درباره هدف، مخاطب، جایگاه یا جهت استراتژیک است.',
    assess_action: 'ورودی درخواست اقدام یا انتشار دارد و باید قبل از اجرا ارزیابی شود.',
    research_external: 'ورودی به منبع، تحقیق یا واقعیت بیرونی وابسته است.',
    draft_content: 'ورودی درخواست ساخت یا آماده‌سازی محتوای قابل انتشار دارد.',
    data_control: 'ورودی یک حق کنترلی درباره داده یا حافظه را بیان می‌کند.',
    unclear: 'Signal کافی برای Routing مطمئن وجود ندارد؛ سیستم از حدس خودداری می‌کند.',
  };
  const arbitrationRationale = outcome === 'held'
    ? 'Privacy/Security بر Utility مقدم شد؛ تا بازبینی انسانی هیچ Route اجرایی فعال نیست.'
    : outcome === 'clarification_required'
      ? 'Confidence برای Routing پایین است و یک سؤال با Information Gain بالا لازم است.'
      : outcome === 'approval_required'
        ? kind === 'assess_action'
          ? 'اقدام عمومی باید از Claim، Risk و تأیید انسانی عبور کند.'
          : 'ماژول فقط پیشنهاد آماده می‌کند؛ نوشتن یا اجرا به تأیید صریح کاربر نیاز دارد.'
        : 'Route فقط برای تحلیل انتخاب شد و هیچ ماژول دیگری تغییر نکرد.';
  const orchestration = {
    policyVersion: 'conversation-orchestrator-v1',
    intent: { kind, confidence, rationale: intentRationales[kind] },
    route: {
      module, mode: held ? 'hold' : baseMode, targetView, readAuthority: 'none',
      writeAuthority: memoryProposalAllowed && memoryProposalRequested ? 'propose_only' : 'none',
      requiresUserApproval,
    },
    provenance: {
      sources: [{ kind: 'current_turn', ref: turnId, trust: 'untrusted_user_input' }],
      personalMemoryUsed: false, externalResearchUsed: false,
    },
    safety: { sensitiveDataDetected, promptInjectionDetected, publicActionRequested, memoryProposalAllowed },
    arbitration: {
      outcome, rationale: arbitrationRationale,
      appliedRules: [
        'user_input_is_untrusted', 'no_silent_cross_module_write',
        'public_action_requires_approval', 'external_research_is_not_personal_memory',
        ...(sensitiveDataDetected ? ['sensitive_input_not_persisted'] : []),
        ...(promptInjectionDetected ? ['prompt_injection_cannot_change_authority'] : []),
      ],
    },
    retention: sensitiveDataDetected
      ? { turn: 'not_persisted', rationale: 'نشانه داده حساس دیده شد؛ متن خام برای پیوستگی ذخیره نمی‌شود.' }
      : memoryProposalRequested && memoryProposalAllowed
        ? { turn: 'confidential', rationale: 'کاربر Proposal حافظه را درخواست کرده؛ Turn به‌صورت owner-scoped و محرمانه ثبت می‌شود.' }
        : { turn: 'not_persisted', rationale: 'بدون Opt-in معتبر حافظه، متن خام Turn در Store ثبت نمی‌شود.' },
    recommendedAction: {
      kind: sensitiveDataDetected ? 'review_sensitive_input' : ambiguous ? 'clarify' : 'open_view',
      label: sensitiveDataDetected ? 'بازبینی داده حساس' : baseLabel,
      targetView,
    },
  };
  const assistantMessage = sensitiveDataDetected
    ? 'نشانه‌ای از داده حساس دیدم؛ متن خام ذخیره نشد و هیچ اقدامی انجام نمی‌دهم.'
    : promptInjectionDetected
      ? 'این ورودی به‌عنوان محتوای غیرقابل‌اعتماد تحلیل شد و نمی‌تواند Permission یا قواعد سیستم را تغییر دهد.'
      : memoryProposalRequested && !memoryProposalAllowed
        ? 'این ورودی به حافظه شخصی تعلق ندارد؛ آن را با Research، اقدام یا کنترل داده مخلوط نمی‌کنم.'
        : orchestration.route.writeAuthority === 'propose_only'
          ? 'مسیر مناسب را تشخیص دادم؛ فقط یک پیشنهاد حافظه می‌سازم و ثبت قطعی نیازمند تأیید جداگانه است.'
          : outcome === 'approval_required'
            ? 'مسیر مناسب را تشخیص دادم؛ فعلاً فقط تحلیل و پیشنهاد مجاز است و هیچ اقدام حساسی اجرا نشد.'
            : kind === 'unclear'
              ? 'برای اینکه ورودی را به ماژول اشتباه نفرستم، فعلاً از حدس‌زدن خودداری می‌کنم.'
              : 'ورودی را فهمیدم و بدون تغییر پنهانی در حافظه، استراتژی یا اقدام‌ها Route کردم.';
  const questions = {
    reflect: /عوض|تغییر|قبلاً|دیگر|نظرم/u.test(text)
      ? 'چه تجربه یا شواهدی باعث شد دیدگاهت تغییر کند؟'
      : /جلسه|اتفاق|دیدم|شنیدم|گفت/u.test(text)
        ? 'کدام بخش این اتفاق برایت مهم بود و چرا؟'
        : 'یک موقعیت واقعی را تعریف می‌کنی که این فکر در آن خودش را نشان داده باشد؟',
    remember: 'این برداشت فقط برای فهم شخصی بماند یا اجازه استفاده داخلی در تحلیل برند هم دارد؟',
    correct_memory: 'کدام حافظه یا برداشت دقیقاً باید اصلاح شود و نسخه درست آن چیست؟',
    set_strategy: 'این تغییر قرار است کدام هدف، مخاطب یا مرز استراتژیک را جابه‌جا کند؟',
    assess_action: 'پیش از هر تأیید، هدف اقدام و مهم‌ترین پیامد احتمالی آن چیست؟',
    research_external: 'برای این تحقیق، بازه زمانی و معیار اعتبار منبع چه باشد؟',
    draft_content: 'Mother Idea، مخاطب و پلتفرم مقصد این پیش‌نویس چیست؟',
    data_control: 'دقیقاً کدام داده یا حافظه باید اصلاح، محدود، لغو یا حذف شود؟',
    unclear: 'این ورودی را برای فهم شخصی، تحقیق بیرونی، ساخت محتوا یا یک اقدام مشخص مطرح کردی؟',
  };
  return {
    assistantMessage,
    followUpQuestion: held
      ? 'می‌خواهی پس از حذف داده حساس، نسخه بدون اطلاعات خصوصی را دوباره بررسی کنیم؟'
      : questions[kind],
    orchestration,
  };
}

function withoutText(proposal) {
  return {
    id: proposal.id,
    epistemicType: proposal.epistemicType,
    dataClass: proposal.dataClass,
    status: proposal.status,
    occurredAt: proposal.occurredAt,
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}
