import { describe, expect, it } from 'vitest';

interface PreviewWorker {
  fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }): Promise<Response>;
}

describe('private preview worker draft runtime', () => {
  it('runs the evidence-bound export flow and blocks replay after consent revocation', async () => {
    const moduleUrl = new URL('../apps/web/public/server/index.js', import.meta.url);
    const workerModule = await import(moduleUrl.href) as { default: PreviewWorker };
    const worker = workerModule.default;
    const env = {
      ASSETS: {
        fetch: () => Promise.resolve(new Response('not found', { status: 404 })),
      },
    };
    const post = async (path: string, body: unknown) => worker.fetch(
      new Request(`https://preview.example${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
    );
    const put = async (path: string, body: unknown) => worker.fetch(
      new Request(`https://preview.example${path}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
    );
    const approvalBody = async (actionId: string) => {
      const response = await worker.fetch(new Request('https://preview.example/api/workbench'), env);
      const workbench = await response.json() as {
        actions: Array<{
          id: string;
          decision: {
            strategyRevision: number;
            decisionContextRevision: number;
            decisionContextHash: string;
            decisionWindowEndsAt: string;
          };
        }>;
      };
      const action = workbench.actions.find((candidate) => candidate.id === actionId);
      if (!action) throw new Error(`Missing workbench action: ${actionId}`);
      return {
        actionId,
        expectedStrategyRevision: action.decision.strategyRevision,
        expectedDecisionContextRevision: action.decision.decisionContextRevision,
        expectedDecisionContextHash: action.decision.decisionContextHash,
        expectedDecisionWindowEndsAt: action.decision.decisionWindowEndsAt,
      };
    };

    const coldWorkbench = await worker.fetch(
      new Request('https://preview.example/api/workbench'),
      env,
    );
    const coldSnapshot = await coldWorkbench.json() as {
      policyVersion: string;
      attentionBudget: { attentionCapacity: number; visibilityTolerance: number; emotionalBandwidth: number };
      decisionContext: { revision: number; contextHash: string };
      decisionFrame: { rankingTransparency: { hiddenScoreUsed: boolean }; boundaries: { externalActionPermitted: boolean } };
      evidence: { state: string; strategyEvidenceCount: number };
      actions: Array<{ id: string; interaction: string; decision: { requiredApproval: string; boundaries: { externalActionPermitted: boolean } } }>;
    };
    expect(coldSnapshot).toMatchObject({
      policyVersion: 'strategic-decision-v1',
      attentionBudget: { attentionCapacity: 3, visibilityTolerance: 4, emotionalBandwidth: 3 },
      decisionContext: { revision: 1 },
      decisionFrame: { rankingTransparency: { hiddenScoreUsed: false }, boundaries: { externalActionPermitted: false } },
    });
    expect(coldSnapshot.evidence).toMatchObject({ state: 'insufficient', strategyEvidenceCount: 0 });
    expect(coldSnapshot.actions[0]).toMatchObject({
      id: 'collect_evidence', interaction: 'open_intake',
      decision: { requiredApproval: 'human', boundaries: { externalActionPermitted: false } },
    });
    const savedDecisionContext = await put('/api/decision-context', {
      requestId: 'decision_context_runtime',
      expectedRevision: 1,
      value: {
        attentionBudget: {
          availableMinutes: 150,
          maximumEnergyCost: 3,
          attentionCapacity: 3,
          visibilityTolerance: 4,
          emotionalBandwidth: 3,
        },
      },
    });
    expect(savedDecisionContext.status).toBe(200);
    await expect(savedDecisionContext.json()).resolves.toMatchObject({
      outcome: 'saved', policyVersion: 'decision-context-v1', revision: 2,
    });
    const rebound = await worker.fetch(new Request('https://preview.example/api/workbench'), env);
    await expect(rebound.json()).resolves.toMatchObject({
      decisionContext: { revision: 2 },
      decisionFrame: { contextBinding: { decisionContextRevision: 2 } },
    });
    const initialInitiative = await worker.fetch(
      new Request('https://preview.example/api/initiative'),
      env,
    );
    await expect(initialInitiative.json()).resolves.toMatchObject({
      policyVersion: 'initiative-policy-v1',
      persistence: 'ephemeral',
      settings: { mode: 'reactive', revision: 1 },
      preview: {
        decision: 'suppressed', reason: 'reactive_mode',
        candidate: { kind: 'evidence_question', relevance: 0.9 },
      },
    });
    expect((await put('/api/initiative/settings', {
      requestId: 'initiative_runtime_settings',
      expectedRevision: 1,
      mode: 'balanced',
      maxPromptsPer24Hours: 1,
      minimumRelevance: 0.75,
      pausedUntil: null,
    })).status).toBe(200);
    const firstInitiative = await post('/api/initiative/evaluations', {
      requestId: 'initiative_runtime_first',
    });
    expect(firstInitiative.status).toBe(201);
    await expect(firstInitiative.json()).resolves.toMatchObject({
      outcome: 'evaluated',
      evaluation: { decision: 'delivered', reason: 'delivered', candidate: { kind: 'evidence_question' } },
    });
    await expect((await post('/api/initiative/evaluations', {
      requestId: 'initiative_runtime_limited',
    })).json()).resolves.toMatchObject({
      evaluation: { decision: 'suppressed', reason: 'rate_limited' },
    });
    const relationshipRequest = {
      requestId: 'relationship_runtime_create',
      label: 'همکار کلیدی',
      group: 'peer',
      outcome: 'تقویت اعتماد برای همکاری بلندمدت',
      priority: 'high',
      strength: 'trusted',
      boundary: 'normal',
      contextNote: 'این Context فقط برای برنامه‌ریزی خصوصی رابطه ثبت می‌شود.',
      lastInteractionAt: '2026-04-01T00:00:00.000Z',
      consentConfirmed: true,
    };
    const relationshipCreated = await post('/api/relationships/stakeholders', relationshipRequest);
    expect(relationshipCreated.status).toBe(201);
    const relationshipRecord = await relationshipCreated.json() as { record: { stakeholderId: string } };
    await expect((await post('/api/relationships/stakeholders', relationshipRequest)).json()).resolves.toMatchObject({
      outcome: 'already_applied',
    });
    const relationshipSnapshot = await worker.fetch(
      new Request('https://preview.example/api/relationships'),
      env,
    );
    await expect(relationshipSnapshot.json()).resolves.toMatchObject({
      policyVersion: 'relationship-intelligence-v1',
      persistence: 'ephemeral',
      summary: { totalStakeholders: 1, highPriority: 1, reviewSuggested: 1 },
      stakeholders: [{
        stakeholderId: relationshipRecord.record.stakeholderId,
        recency: 'dormant',
        attention: 'review_context',
        privacy: { contactDetailsStored: false, automationPermitted: false, outboundContactPermitted: false },
      }],
    });
    const temporaryRelationship = await post('/api/relationships/stakeholders', {
      ...relationshipRequest,
      requestId: 'relationship_runtime_temporary',
      label: 'رابطه موقت',
      group: 'client',
      boundary: 'do_not_prompt',
    });
    const temporaryRecord = await temporaryRelationship.json() as { record: { stakeholderId: string } };
    const deletePath = `/api/relationships/stakeholders/${temporaryRecord.record.stakeholderId}/delete`;
    await expect((await post(deletePath, { requestId: 'relationship_runtime_delete' })).json()).resolves.toMatchObject({
      outcome: 'deleted',
    });
    await expect((await post(deletePath, { requestId: 'relationship_runtime_delete' })).json()).resolves.toMatchObject({
      outcome: 'already_applied',
    });
    const perceptionExternal = {
      requestId: 'perception_runtime_external',
      dimension: 'trust',
      perspective: 'external_perception',
      stage: 'visible',
      summary: 'اعتماد در تعامل حرفه‌ای دیده شده است.',
      evidenceNote: 'خلاصه‌ی بدون هویت از بازخورد مستقیم و با اجازه‌ی ثبت.',
      sourceKind: 'direct_feedback',
      confidence: 'medium',
      observedAt: '2026-08-20T00:00:00.000Z',
      consentConfirmed: true,
    };
    const perceptionCreated = await post('/api/perception/signals', perceptionExternal);
    expect(perceptionCreated.status).toBe(201);
    await expect((await post('/api/perception/signals', perceptionExternal)).json()).resolves.toMatchObject({
      outcome: 'already_applied',
    });
    await post('/api/perception/signals', {
      ...perceptionExternal,
      requestId: 'perception_runtime_self',
      perspective: 'self_perception',
      stage: 'signature',
      summary: 'مالک اعتمادسازی را یک ویژگی شاخص خود می‌داند.',
      sourceKind: 'owner_reflection',
    });
    await post('/api/perception/signals', {
      ...perceptionExternal,
      requestId: 'perception_runtime_desired',
      perspective: 'desired_positioning',
      stage: 'strong',
      summary: 'جایگاه مطلوب، اعتماد حرفه‌ای قوی است.',
      sourceKind: 'owner_goal',
    });
    const perceptionSnapshot = await worker.fetch(new Request('https://preview.example/api/perception'), env);
    const perceptionPayload = await perceptionSnapshot.json() as {
      signals: Array<{ epistemicType: string; privacy: { sourceIdentityStored: boolean; automatedCollectionPermitted: boolean } }>;
    };
    expect(perceptionPayload).toMatchObject({
      policyVersion: 'perception-engine-v1',
      persistence: 'ephemeral',
      summary: { totalSignals: 3, externalSignals: 1, underrecognized: 1, potentialBlindSpots: 1 },
      dimensions: [{ gap: 'underrecognized', blindSpot: 'self_higher_than_external' }],
    });
    expect(perceptionPayload.signals.some((signal) => (
      signal.epistemicType === 'external_perception' &&
      !signal.privacy.sourceIdentityStored &&
      !signal.privacy.automatedCollectionPermitted
    ))).toBe(true);
    const temporaryPerception = await post('/api/perception/signals', {
      ...perceptionExternal,
      requestId: 'perception_runtime_temporary',
      dimension: 'clarity',
      summary: 'Signal موقت برای آزمون حذف کامل.',
    });
    const temporaryPerceptionRecord = await temporaryPerception.json() as { record: { signalId: string } };
    const perceptionDeletePath = `/api/perception/signals/${temporaryPerceptionRecord.record.signalId}/delete`;
    await expect((await post(perceptionDeletePath, { requestId: 'perception_runtime_delete' })).json()).resolves.toMatchObject({
      outcome: 'deleted',
    });
    await expect((await post(perceptionDeletePath, { requestId: 'perception_runtime_delete' })).json()).resolves.toMatchObject({
      outcome: 'already_applied',
    });
    const routedApproval = await post('/api/workbench/approval', await approvalBody('collect_evidence'));
    expect(routedApproval.status).toBe(409);
    await expect(routedApproval.json()).resolves.toEqual({ error: 'action_not_approvable' });

    const researchStatement = 'شفافیت تصمیم می‌تواند اعتماد سازمانی را حفظ کند.';
    const researchBase = {
      publisher: 'مرکز پژوهش نمونه',
      excerpt: 'این بخش از گزارش، ارتباط شفافیت تصمیم با حفظ اعتماد را بررسی می‌کند.',
      statement: researchStatement,
      quality: 'primary',
      publishedAt: '2026-08-01T00:00:00.000Z',
      maxAgeDays: 90,
    };
    expect((await post('/api/research/sources', {
      ...researchBase,
      requestId: 'research_runtime_support',
      title: 'گزارش رسمی درباره اعتماد سازمانی',
      url: 'https://research.example.org/report',
      stance: 'supports',
    })).status).toBe(201);
    expect((await post('/api/research/sources', {
      ...researchBase,
      requestId: 'research_runtime_contradict',
      title: 'نقد روش‌شناسی گزارش اعتماد',
      url: 'https://review.example.org/critique',
      stance: 'contradicts',
    })).status).toBe(201);
    const researchResponse = await worker.fetch(
      new Request('https://preview.example/api/research'),
      env,
    );
    await expect(researchResponse.json()).resolves.toMatchObject({
      persistence: 'ephemeral',
      summary: { totalSources: 2, conflicts: 1, citationReady: 0 },
      sources: [
        { factCheckStatus: 'conflicted', usableForPublicClaim: false },
        { factCheckStatus: 'conflicted', usableForPublicClaim: false },
      ],
    });
    const opportunityResponse = await worker.fetch(
      new Request('https://preview.example/api/opportunities'),
      env,
    );
    const opportunityPayload = await opportunityResponse.json() as {
      policyVersion: string;
      summary: { sourcesAssessed: number; explorationBudget: number; explorationUsed: number };
      assessments: Array<{ decision: string; boundaries: { actionRecommended: boolean; externalActionPermitted: boolean } }>;
      boundaries: { trendIsOpportunity: boolean; hiddenOpportunityScoreUsed: boolean; externalActionPermitted: boolean };
    };
    expect(opportunityPayload).toMatchObject({
      policyVersion: 'opportunity-radar-v1',
      summary: { sourcesAssessed: 2, explorationBudget: 1 },
      boundaries: { trendIsOpportunity: false, hiddenOpportunityScoreUsed: false, externalActionPermitted: false },
    });
    expect(opportunityPayload.summary.explorationUsed).toBeLessThanOrEqual(1);
    expect(opportunityPayload.assessments).toHaveLength(2);
    expect(opportunityPayload.assessments.every((item) => (
      item.decision === 'monitor' && !item.boundaries.actionRecommended && !item.boundaries.externalActionPermitted
    ))).toBe(true);
    const claimsBeforeResponse = await worker.fetch(
      new Request('https://preview.example/api/claims'),
      env,
    );
    const claimsBefore = await claimsBeforeResponse.json() as {
      summary: { totalClaims: number; traceBlocked: number };
      claims: Array<{ claimId: string; status: string; traceStatus: string }>;
    };
    expect(claimsBefore.summary).toMatchObject({ totalClaims: 2, traceBlocked: 2 });
    const conflictedClaim = claimsBefore.claims[0];
    if (!conflictedClaim) throw new Error('Expected a conflicted claim.');
    const blockedVerification = await post(`/api/claims/${conflictedClaim.claimId}/reviews`, {
      requestId: 'claim_runtime_verify_blocked',
      expectedStatus: 'proposed',
      decision: 'verify',
      rationale: 'این Review باید به‌دلیل تعارض دو Source از Verify خودکار جلوگیری کند.',
      humanAttestation: true,
    });
    expect(blockedVerification.status).toBe(422);
    await expect(blockedVerification.json()).resolves.toEqual({ error: 'trace_incomplete' });
    expect((await post(`/api/claims/${conflictedClaim.claimId}/reviews`, {
      requestId: 'claim_runtime_dispute',
      expectedStatus: 'proposed',
      decision: 'dispute',
      rationale: 'این Claim تا حل تعارض منابع نباید وارد هیچ خروجی عمومی شود.',
      humanAttestation: false,
    })).status).toBe(201);

    const turn = await post('/api/conversations/turns', {
      conversationId: 'conversation_runtime',
      turnId: 'turn_runtime',
      text: 'در یک پروژه واقعی، ابهام را با گفت‌وگوی مستقیم به تصمیم قابل اجرا تبدیل کردم.',
      proposeMemory: true,
    });
    expect(turn.status).toBe(200);
    await expect(turn.json()).resolves.toMatchObject({
      orchestration: {
        policyVersion: 'conversation-orchestrator-v1',
        intent: { kind: 'reflect' },
        route: { module: 'conversation', writeAuthority: 'propose_only' },
      },
      memoryProposal: { id: 'memory_turn_runtime' },
    });
    const proposalId = 'memory_turn_runtime';

    const researchTurn = await post('/api/conversations/turns', {
      conversationId: 'conversation_runtime',
      turnId: 'turn_runtime_research',
      text: 'آخرین تحقیق این موضوع را با منبع معتبر بررسی کن.',
      proposeMemory: true,
    });
    const researchTurnPayload = await researchTurn.json() as Record<string, unknown>;
    expect(researchTurnPayload).toMatchObject({
      orchestration: {
        intent: { kind: 'research_external' },
        route: { module: 'research', writeAuthority: 'none' },
        safety: { memoryProposalAllowed: false },
      },
    });
    expect(researchTurnPayload).not.toHaveProperty('memoryProposal');

    const sensitiveTurn = await post('/api/conversations/turns', {
      conversationId: 'conversation_runtime',
      turnId: 'turn_runtime_sensitive',
      text: 'توکن من: secret-value-1234 است؛ این را یادت بمونه.',
      proposeMemory: true,
    });
    await expect(sensitiveTurn.json()).resolves.toMatchObject({
      orchestration: {
        route: { module: 'data', mode: 'hold', writeAuthority: 'none' },
        safety: { sensitiveDataDetected: true },
        retention: { turn: 'not_persisted' },
      },
    });

    expect((await post(`/api/memory/proposals/${proposalId}/confirm`, {
      permissions: {
        personalUnderstanding: true,
        brandUsage: true,
        publicUsage: false,
      },
    })).status).toBe(200);
    const approvedAssetResponse = await post('/api/assets/text', {
      requestId: 'asset_runtime_brand_basis',
      title: 'مبنای واقعی تحلیل برند',
      content: 'در یک تجربه واقعی، گفت‌وگوی مستقیم باعث شد ابهام به تصمیمی مسئولانه و قابل اجرا تبدیل شود.',
      assertionText: 'گفت‌وگوی مستقیم را ابزاری برای تبدیل ابهام به تصمیم مسئولانه می‌دانم.',
      occurredAt: '2026-08-19T12:00:00.000Z',
      permissions: { personalUnderstanding: true, brandUsage: true },
    });
    expect(approvedAssetResponse.status).toBe(201);
    const approvedAsset = await approvedAssetResponse.json() as {
      record: { assetId: string; evidenceId: string };
    };
    const expressionSnapshotResponse = await worker.fetch(new Request('https://preview.example/api/expression'), env);
    await expect(expressionSnapshotResponse.json()).resolves.toMatchObject({
      policyVersion: 'authentic-expression-v1',
      persistence: 'ephemeral',
      summary: { narrativeSeeds: 1, evidenceBoundSeeds: 1, voiceMaturity: 'uninitialized' },
      narrativeSeeds: [{
        maturity: 'single_source', epistemicType: 'evidence_backed_candidate',
        source: { ref: approvedAsset.record.assetId },
        privacy: { externalActionPermitted: false },
      }],
      boundaries: { narrativeSeedIsBrandFact: false, factCheckIncluded: false, externalActionPermitted: false },
    });
    const expressionPassed = await post('/api/expression/review', {
      content: 'گفت‌وگوی مستقیم، ابهام را به تصمیم مسئولانه تبدیل کرد؛ این تجربه واقعی باید دقیق روایت شود.',
      assetRefs: [approvedAsset.record.assetId],
    });
    await expect(expressionPassed.json()).resolves.toMatchObject({
      outcome: 'pass', policyVersion: 'authentic-expression-v1',
      boundaries: { factCheckIncluded: false, claimApprovalGranted: false, publicApprovalGranted: false, externalActionPermitted: false },
    });
    await expect((await post('/api/expression/review', {
      content: 'در دنیای امروز همه ما می‌دانیم که گفت‌وگوی مستقیم می‌تواند یک بازی را تغییر دهد.',
      assetRefs: [approvedAsset.record.assetId],
    })).json()).resolves.toMatchObject({ outcome: 'revise' });
    await expect((await post('/api/expression/review', {
      content: 'در دنیای امروز همه ما می‌دانیم که گفت‌وگو همیشه مهم است.',
      assetRefs: [],
    })).json()).resolves.toMatchObject({ outcome: 'block' });
    const blockedByRisk = await post('/api/workbench/approval', await approvalBody('essay'));
    expect(blockedByRisk.status).toBe(409);
    await expect(blockedByRisk.json()).resolves.toEqual({ error: 'risk_review_required' });
    const riskResponse = await worker.fetch(new Request('https://preview.example/api/risk'), env);
    const risk = await riskResponse.json() as {
      policyVersion: string;
      assessments: Array<{ actionId: string; level: 'yellow'; assessmentHash: string; findings: unknown[] }>;
    };
    const essayRisk = risk.assessments.find((assessment) => assessment.actionId === 'essay');
    if (!essayRisk) throw new Error('Expected essay risk assessment.');
    expect(risk.policyVersion).toBe('brand-protection-v1');
    expect(essayRisk.findings).toHaveLength(15);
    const arbitrationRequest = {
      requestId: 'arbitration_runtime_essay',
      actionId: 'essay',
      requestedAutonomyLevel: 7,
    };
    const arbitrationResponse = await post('/api/arbitration/cases', arbitrationRequest);
    expect(arbitrationResponse.status).toBe(201);
    const arbitrationPayload = await arbitrationResponse.json() as {
      outcome: string;
      persistence: string;
      case: {
        policyVersion: string;
        opinions: Array<{ module: string; position: string; authority: { write: string } }>;
        decision: {
          outcome: string;
          effectiveAutonomyLevel: number;
          executionPermitted: boolean;
          downgradeReasons: string[];
        };
      };
    };
    expect(arbitrationPayload).toMatchObject({
      outcome: 'applied',
      persistence: 'ephemeral',
      case: {
        policyVersion: 'intermodule-arbitration-v1',
        decision: {
          outcome: 'revision_required',
          effectiveAutonomyLevel: 3,
          executionPermitted: false,
        },
      },
    });
    expect(arbitrationPayload.case.decision.downgradeReasons).toContain('mvp_execution_disabled');
    expect(arbitrationPayload.case.opinions).toHaveLength(5);
    expect(arbitrationPayload.case.opinions.every((item) => item.authority.write === 'none')).toBe(true);
    expect(arbitrationPayload.case.opinions).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: 'strategy' }),
      expect.objectContaining({ module: 'risk', position: 'revise' }),
    ]));
    expect((await post('/api/arbitration/cases', arbitrationRequest)).status).toBe(200);
    expect((await post('/api/risk/actions/essay/reviews', {
      requestId: 'risk_runtime_essay',
      expectedLevel: essayRisk.level,
      expectedAssessmentHash: essayRisk.assessmentHash,
      decision: 'acknowledge',
      rationale: 'ریسک اعتبار، Disclosure و پیامد بلندمدت این اقدام عمومی را شخصاً مرور کردم.',
      humanAttestation: true,
    })).status).toBe(201);
    const staleArbitration = await worker.fetch(
      new Request('https://preview.example/api/arbitration'),
      env,
    );
    await expect(staleArbitration.json()).resolves.toMatchObject({
      policyVersion: 'intermodule-arbitration-v1',
      mvpExecutionEnabled: false,
      cases: [{ stale: true, decision: { executionPermitted: false } }],
    });
    expect((await post('/api/workbench/approval', await approvalBody('essay'))).status).toBe(200);

    const approvedWorkbench = await worker.fetch(
      new Request('https://preview.example/api/workbench'),
      env,
    );
    const approvedSnapshot = await approvedWorkbench.json() as {
      workflow: { approvedEvidenceIds: string[] };
      actions: Array<{ id: string; decision: { format: string; platformSelected: boolean; measurementPlan: { signals: string[] } } }>;
    };
    expect(approvedSnapshot.workflow.approvedEvidenceIds).toEqual(expect.arrayContaining([
      'evidence_turn_runtime',
      approvedAsset.record.evidenceId,
    ]));
    const essayDecision = approvedSnapshot.actions.find((action) => action.id === 'essay')?.decision;
    expect(essayDecision).toMatchObject({
      format: 'mother_concept',
      platformSelected: false,
    });
    expect(essayDecision?.measurementPlan.signals).toEqual(
      expect.arrayContaining(['کیفیت تعامل', 'تغییر ادراک']),
    );
    const qualityBefore = await worker.fetch(
      new Request('https://preview.example/api/strategic-quality'),
      env,
    );
    await expect(qualityBefore.json()).resolves.toMatchObject({
      policyVersion: 'strategic-quality-v1',
      persistence: 'ephemeral',
      rubric: { status: 'pass', criticalFailures: 0 },
      ownerBaseline: { status: 'collecting', sampleSize: 0, baselineMetrics: null },
    });
    const reviewRequest = {
      requestId: 'strategic_review_runtime_essay',
      ...(await approvalBody('essay')),
      decision: 'accepted',
      usefulness: 5,
      trust: 4,
      friction: 2,
      note: 'این توصیه به هدف و مختصات امروز متصل بود.',
    };
    const qualityReview = await post('/api/strategic-quality/reviews', reviewRequest);
    expect(qualityReview.status).toBe(200);
    const qualityReviewPayload = await qualityReview.json() as {
      recentReviews: Array<{ id: string }>;
    };
    expect(qualityReviewPayload).toMatchObject({
      ownerBaseline: {
        status: 'collecting', sampleSize: 1, accepted: 1,
        observedMetrics: { acceptanceRate: 1, averageUsefulness: 5 },
        baselineMetrics: null,
      },
      recentReviews: [{ actionId: 'essay', decision: 'accepted' }],
    });
    expect((await post('/api/strategic-quality/reviews', reviewRequest)).status).toBe(200);
    expect((await post('/api/strategic-quality/reviews', {
      ...reviewRequest,
      usefulness: 4,
    })).status).toBe(409);
    const acceptedReviewId = qualityReviewPayload.recentReviews[0]?.id;
    if (!acceptedReviewId) throw new Error('Expected an accepted strategic review.');
    const outcomeRequest = {
      requestId: 'strategic_outcome_runtime_essay',
      reviewId: acceptedReviewId,
      executionStatus: 'completed',
      satisfaction: 5,
      regret: 1,
      energy: 4,
      engagementQuality: 5,
      interactionDepth: 4,
      privateMessages: 1,
      opportunitiesCreated: 1,
      relationshipChange: 'positive',
      mediaOpportunities: 0,
      perceptionShift: 'positive',
      businessOutcome: 'early_signal',
      note: 'یک تعامل عمیق و یک فرصت قابل پیگیری ایجاد شد.',
      outcomeOccurredAt: new Date().toISOString(),
    };
    const qualityOutcome = await post('/api/strategic-quality/outcomes', outcomeRequest);
    expect(qualityOutcome.status).toBe(200);
    await expect(qualityOutcome.json()).resolves.toMatchObject({
      outcomeBaseline: {
        status: 'collecting', sampleSize: 1, completed: 1, baselineMetrics: null,
        observedMetrics: { followThroughRate: 1, opportunitiesCreated: 1 },
      },
      recentOutcomes: [{ reviewId: acceptedReviewId, actionId: 'essay', executionStatus: 'completed' }],
    });
    expect((await post('/api/strategic-quality/outcomes', outcomeRequest)).status).toBe(200);
    expect((await post('/api/strategic-quality/outcomes', {
      ...outcomeRequest,
      satisfaction: 4,
    })).status).toBe(409);

    const lateAssetResponse = await post('/api/assets/text', {
      requestId: 'asset_runtime_after_approval',
      title: 'منبع جدید پس از تأیید',
      content: 'این منبع پس از تأیید اقدام اضافه شده و نباید بدون تأیید دوباره وارد همان Draft شود.',
      assertionText: 'این منبع پس از تأیید اقدام ثبت شده است.',
      occurredAt: '2026-08-19T13:00:00.000Z',
      permissions: { personalUnderstanding: true, brandUsage: true },
    });
    expect(lateAssetResponse.status).toBe(201);
    const lateAsset = await lateAssetResponse.json() as {
      record: { assetId: string; evidenceId: string };
    };
    const lateSourcesResponse = await worker.fetch(
      new Request('https://preview.example/api/drafts/sources'),
      env,
    );
    const lateSources = await lateSourcesResponse.json() as {
      records: Array<{ ref: string }>;
    };
    expect(lateSources.records.some((source) => source.ref === lateAsset.record.assetId)).toBe(true);
    expect(approvedSnapshot.workflow.approvedEvidenceIds).not.toContain(lateAsset.record.evidenceId);
    const lateSourceDraft = await post('/api/drafts', {
      requestId: 'draft_runtime_late_source',
      sourceKind: 'text_asset',
      sourceRef: lateAsset.record.assetId,
      channel: 'linkedin',
      narrativeAngle: 'منبع جدید باید تأیید تازه داشته باشد',
      takeaway: 'Evidence جدید به تأیید قبلی سرایت نمی‌کند.',
      publicDraftingConsent: true,
    });
    expect(lateSourceDraft.status).toBe(409);
    await expect(lateSourceDraft.json()).resolves.toEqual({
      error: 'source_not_authorized_for_action',
    });

    const createRequest = {
      requestId: 'draft_runtime_create',
      sourceKind: 'memory',
      sourceRef: proposalId,
      channel: 'linkedin',
      narrativeAngle: 'وقتی شفافیت از نمایش قطعیت مهم‌تر است و تصمیم مسئولانه می‌سازد',
      takeaway: 'گفت‌وگوی مستقیم می‌تواند ابهام را به یک تصمیم مسئولانه تبدیل کند. '.repeat(20),
      publicDraftingConsent: true,
    };
    const createdResponse = await post('/api/drafts', createRequest);
    expect(createdResponse.status).toBe(200);
    const created = await createdResponse.json() as {
      draftId: string;
      revision: number;
      status: string;
      adaptation: { version: string; hardMaximumCharacters: number; currentCharacters: number };
    };
    expect(created.status).toBe('awaiting_approval');
    expect(created.adaptation).toMatchObject({
      version: 'platform-adaptation-v1',
      hardMaximumCharacters: 3000,
    });

    let edited = created;
    const statement = 'در یک پروژه واقعی، ابهام را با گفت‌وگوی مستقیم به تصمیم قابل اجرا تبدیل کردم.';
    for (const [index, repeat] of [32, 20, 11].entries()) {
      const editedResponse = await worker.fetch(
        new Request(`https://preview.example/api/drafts/${created.draftId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            requestId: `draft_runtime_edit_${String(index)}`,
            expectedRevision: edited.revision,
            body: `تیتر کوتاه\n\nروایت مستند:\n${statement}\n\nبرداشت من:\n${'برداشت روشن و صادقانه. '.repeat(repeat)}`,
          }),
        }),
        env,
      );
      expect(editedResponse.status).toBe(200);
      edited = await editedResponse.json() as typeof created;
    }
    const feedbackResponse = await worker.fetch(new Request('https://preview.example/api/feedback'), env);
    const feedback = await feedbackResponse.json() as {
      summary: { proposed: number };
      preferences: Array<{ id: string; preferenceKey: string }>;
    };
    expect(feedback.summary.proposed).toBeGreaterThan(0);
    const preference = feedback.preferences.find((item) => item.preferenceKey === 'voice.draft_length');
    if (!preference) throw new Error('Expected preview preference proposal.');
    expect((await post(`/api/feedback/preferences/${preference.id}/decision`, {
      requestId: 'preference_runtime_apply',
      decision: 'applied',
    })).status).toBe(200);

    const approvedResponse = await post(`/api/drafts/${created.draftId}/approve`, {
      requestId: 'draft_runtime_approve',
      expectedRevision: edited.revision,
    });
    const approved = await approvedResponse.json() as { revision: number; status: string };
    expect(approvedResponse.status).toBe(200);
    expect(approved.status).toBe('approved');

    const exportRequest = {
      requestId: 'draft_runtime_export',
      expectedRevision: approved.revision,
    };
    const exportedResponse = await post(`/api/drafts/${created.draftId}/export`, exportRequest);
    expect(exportedResponse.status).toBe(200);
    const exported = await exportedResponse.json() as { filename: string; content: string };
    expect(exported.filename).toMatch(/^pr-linkedin-draft-v\d+\.txt$/);
    expect(exported.content).toContain('در یک پروژه واقعی');

    expect((await post(`/api/memory/proposals/${proposalId}/rights`, {
      requestId: 'memory_runtime_revoke',
      operation: 'revoke',
      reason: 'دیگر اجازه استفاده عمومی از این منبع را نمی‌دهم.',
    })).status).toBe(200);

    const replayedCreate = await post('/api/drafts', createRequest);
    expect(replayedCreate.status).toBe(409);
    expect(await replayedCreate.json()).toEqual({ error: 'source_not_available' });

    const replayedExport = await post(`/api/drafts/${created.draftId}/export`, exportRequest);
    expect(replayedExport.status).toBe(409);
    expect(await replayedExport.json()).toEqual({ error: 'source_not_available' });

    const activityResponse = await worker.fetch(
      new Request('https://preview.example/api/account/activity'),
      env,
    );
    const activity = await activityResponse.json() as {
      summary: { total: number; dataRights: number; exports: number };
      events: Array<{ eventType: string }>;
    };
    expect(activityResponse.status).toBe(200);
    expect(activity.summary.total).toBeGreaterThanOrEqual(9);
    expect(activity.summary.dataRights).toBeGreaterThanOrEqual(3);
    expect(activity.events.some((event) => event.eventType === 'draft.exported')).toBe(true);

    const assetRequest = {
      requestId: 'asset_runtime_note',
      title: 'یادداشت تصمیم واقعی',
      content: 'در یک تصمیم واقعی، بیان محدودیت‌ها کمک کرد اعتماد تیم و کیفیت تصمیم حفظ شود.',
      assertionText: 'من شفافیت درباره محدودیت‌ها را بخشی از تصمیم‌گیری مسئولانه می‌دانم.',
      occurredAt: '2026-08-20T12:00:00.000Z',
      permissions: { personalUnderstanding: true, brandUsage: false },
    };
    const assetResponse = await post('/api/assets/text', assetRequest);
    expect(assetResponse.status).toBe(201);
    const privateAsset = await assetResponse.json() as {
      record: { assetId: string; sourceType: string; dataClass: string };
    };
    expect(privateAsset).toMatchObject({
      outcome: 'applied',
      record: { sourceType: 'text_asset', dataClass: 'confidential' },
    });
    const repeatedAsset = await post('/api/assets/text', assetRequest);
    expect(repeatedAsset.status).toBe(200);
    await expect(repeatedAsset.json()).resolves.toMatchObject({ outcome: 'already_applied' });
    const revokedAsset = await post(`/api/assets/text/${approvedAsset.record.assetId}/rights`, {
      requestId: 'asset_runtime_revoke_brand',
      operation: 'revoke_brand_usage',
      reason: 'این منبع دیگر برای تحلیل برند استفاده نشود.',
    });
    expect(revokedAsset.status).toBe(200);
    await expect(revokedAsset.json()).resolves.toMatchObject({
      operation: 'revoke_brand_usage', brandUsage: false, deleted: false,
    });
    const deletedAsset = await post(`/api/assets/text/${privateAsset.record.assetId}/rights`, {
      requestId: 'asset_runtime_delete',
      operation: 'delete',
      reason: 'این منبع خصوصی حذف شود.',
    });
    expect(deletedAsset.status).toBe(200);
    await expect(deletedAsset.json()).resolves.toMatchObject({ deleted: true });
    const replayedDeletedAsset = await post('/api/assets/text', assetRequest);
    expect(replayedDeletedAsset.status).toBe(409);
    await expect(replayedDeletedAsset.json()).resolves.toEqual({ error: 'asset_import_conflict' });
    const onboardingResponse = await worker.fetch(
      new Request('https://preview.example/api/onboarding'),
      env,
    );
    await expect(onboardingResponse.json()).resolves.toMatchObject({
      modelMaturity: { evidenceCount: 2, components: { exercisedDataControl: 10 } },
      strategyReadiness: { ready: true, evidenceCount: 1, withheldEvidenceCount: 1 },
      assets: { summary: { assets: 2, evidenceItems: 2, assertions: 2, dataRights: 2 } },
    });

    const emptyCosts = await worker.fetch(
      new Request('https://preview.example/api/workflow-cost'),
      env,
    );
    await expect(emptyCosts.json()).resolves.toMatchObject({
      policyVersion: 'workflow-cost-budget-v1', truthStatus: 'no_usage',
      persistence: 'ephemeral', day: { chargedCostMinorUnits: 0 },
    });
    const costReservationResponse = await post('/api/workflow-cost/reservations', {
      requestId: 'cost_preview_reservation', workflowId: 'workflow:preview:draft',
      invocationId: 'invocation:preview:draft', kind: 'draft_generation',
      estimatedCostMinorUnits: 20, plannedSteps: 2,
    });
    expect(costReservationResponse.status).toBe(201);
    const costReservation = await costReservationResponse.json() as { id: string };
    const costChargeResponse = await post('/api/workflow-cost/charges', {
      requestId: 'cost_preview_charge', reservationId: costReservation.id,
      provider: 'preview-provider', model: 'preview-model',
      inputTokens: 100, outputTokens: 20, cachedInputTokens: 50,
      components: {
        modelMinorUnits: 21, embeddingMinorUnits: 0, storageMinorUnits: 0,
        searchMinorUnits: 0, toolApiMinorUnits: 0, computeMinorUnits: 0,
      },
      actualSteps: 2, humanReviewSeconds: 30, costEvidence: 'provider_reported',
    });
    expect(costChargeResponse.status).toBe(201);
    await expect(costChargeResponse.json()).resolves.toMatchObject({
      actualCostMinorUnits: 21, circuitOpened: true,
      circuitReason: 'actual_cost_exceeded_reservation',
    });
    const blockedCostResponse = await post('/api/workflow-cost/reservations', {
      requestId: 'cost_preview_after_circuit', workflowId: 'workflow:preview:draft',
      invocationId: 'invocation:preview:draft:2', kind: 'draft_generation',
      estimatedCostMinorUnits: 1, plannedSteps: 1,
    });
    expect(blockedCostResponse.status).toBe(409);
    await expect(blockedCostResponse.json()).resolves.toMatchObject({
      decision: 'blocked', reason: 'workflow_circuit_open',
    });

    const accountExportResponse = await worker.fetch(
      new Request('https://preview.example/api/account/export'),
      env,
    );
    const accountExport = await accountExportResponse.json() as {
      schemaVersion: number;
      scope: string;
      data: {
        memory: { records: Array<{ consent: { personalUnderstanding: boolean } }> };
        assets: { records: Array<{ sourceType: string }> };
        research: { summary: { conflicts: number }; sources: unknown[] };
        claims: { summary: { disputedOrRevoked: number }; claims: unknown[] };
        risk: { policyVersion: string; assessments: unknown[] };
        arbitration: { policyVersion: string; cases: unknown[] };
        initiative: { policyVersion: string; settings: { mode: string }; evaluations: unknown[] };
        relationships: { policyVersion: string; summary: { totalStakeholders: number }; stakeholders: unknown[] };
        perception: { policyVersion: string; summary: { totalSignals: number }; signals: unknown[] };
        strategicQuality: {
          policyVersion: string;
          ownerBaseline: { sampleSize: number };
          outcomeBaseline: { sampleSize: number };
          recentReviews: unknown[];
          recentOutcomes: unknown[];
        };
        workflowCosts: {
          policyVersion: string;
          truthStatus: string;
          day: { status: string; chargedCostMinorUnits: number };
          recentCharges: unknown[];
        };
      };
    };
    expect(accountExportResponse.status).toBe(200);
    expect(accountExport).toMatchObject({ schemaVersion: 1, scope: 'owner_portable_data' });
    expect(accountExport.data.memory.records[0]?.consent.personalUnderstanding).toBe(false);
    expect(accountExport.data.assets.records[0]?.sourceType).toBe('text_asset');
    expect(accountExport.data.research).toMatchObject({ summary: { conflicts: 1 } });
    expect(accountExport.data.research.sources).toHaveLength(2);
    expect(accountExport.data.claims.summary.disputedOrRevoked).toBe(1);
    expect(accountExport.data.claims.claims.length).toBeGreaterThanOrEqual(3);
    expect(accountExport.data.risk).toMatchObject({ policyVersion: 'brand-protection-v1' });
    expect(accountExport.data.risk.assessments).toHaveLength(3);
    expect(accountExport.data.arbitration).toMatchObject({ policyVersion: 'intermodule-arbitration-v1' });
    expect(accountExport.data.arbitration.cases).toHaveLength(1);
    expect(accountExport.data.initiative).toMatchObject({
      policyVersion: 'initiative-policy-v1', settings: { mode: 'balanced' },
    });
    expect(accountExport.data.initiative.evaluations).toHaveLength(2);
    expect(accountExport.data.relationships).toMatchObject({
      policyVersion: 'relationship-intelligence-v1',
      summary: { totalStakeholders: 1 },
    });
    expect(accountExport.data.relationships.stakeholders).toHaveLength(1);
    expect(accountExport.data.perception).toMatchObject({
      policyVersion: 'perception-engine-v1',
      summary: { totalSignals: 3 },
    });
    expect(accountExport.data.perception.signals).toHaveLength(3);
    expect(accountExport.data.strategicQuality).toMatchObject({
      policyVersion: 'strategic-quality-v1', ownerBaseline: { sampleSize: 1 },
      outcomeBaseline: { sampleSize: 1 },
    });
    expect(accountExport.data.strategicQuality.recentReviews).toHaveLength(1);
    expect(accountExport.data.strategicQuality.recentOutcomes).toHaveLength(1);
    expect(accountExport.data.workflowCosts).toMatchObject({
      policyVersion: 'workflow-cost-budget-v1', truthStatus: 'measured',
      day: { status: 'circuit_open', chargedCostMinorUnits: 21 },
    });
    expect(accountExport.data.workflowCosts.recentCharges).toHaveLength(1);

    const activityAfterExport = await worker.fetch(
      new Request('https://preview.example/api/account/activity'),
      env,
    );
    await expect(activityAfterExport.json()).resolves.toMatchObject({
      summary: { exports: 2 },
    });
  });
});
