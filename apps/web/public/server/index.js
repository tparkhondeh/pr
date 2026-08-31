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
let currentDraft = null;
const draftRequests = new Map();
const feedbackEvents = new Map();
const preferenceProposals = new Map();
const feedbackRequests = new Map();
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
    feasible: true,
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
    feasible: true,
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
    feasible: true,
    utilityScore: 53.9,
    opportunityCost: 13.7,
    rank: 3,
  },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/workbench') {
      return json(snapshot());
    }

    if (request.method === 'GET' && url.pathname === '/api/strategy') {
      return json(strategy);
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

    if (request.method === 'GET' && url.pathname === '/api/research') {
      return json(researchSnapshot());
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
          feedback: feedbackSnapshot(),
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
        if (approval?.actionId !== 'essay' || approval.strategyRevision !== strategy.revision) {
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
      if (approval?.actionId !== 'essay' || approval.strategyRevision !== strategy.revision) {
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
      const context = ownerEvidenceContext();
      const action = workbenchActions(context).find((candidate) => candidate.id === body?.actionId);
      if (!action) return json({ error: 'action_not_found' }, 404);
      if (action.interaction !== 'approve') {
        return json({ error: 'action_not_approvable' }, 409);
      }
      if (context.strategy.evidenceIds.length === 0 && action.id !== 'wait') {
        return json({ error: 'insufficient_evidence' }, 409);
      }
      if (approval && approval.actionId !== action.id) {
        return json({ error: 'different_action_approved' }, 409);
      }
      approval ??= {
        actionId: action.id,
        evidenceIds: [...action.evidenceIds],
        approvedAt: new Date().toISOString(),
        strategyRevision: strategy.revision,
      };
      recordAudit(`workbench.approve:workbench_today:${action.id}`, {
        eventType: 'workbench.action_approved', resourceType: 'workbench', resourceId: 'workbench_today',
        purpose: 'strategy_reasoning', decision: 'approved',
        metadata: { actionId: action.id, revision: 2 }, occurredAt: approval.approvedAt,
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
        body.text.trim().length < 3
      ) {
        return json({ error: 'invalid_conversation_input' }, 400);
      }
      const text = body.text.trim();
      const followUpQuestion = chooseFollowUpQuestion(text);
      if (!body.proposeMemory) {
        return json({
          assistantMessage: 'شنیدم. فعلاً چیزی به حافظه پیشنهاد نمی‌کنم.',
          followUpQuestion,
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
        assistantMessage: 'این برداشت فقط یک Self-report پیشنهادی است و هنوز حافظه قطعی نیست.',
        followUpQuestion,
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
  const context = ownerEvidenceContext();
  const effectiveApproval = context.strategy.evidenceIds.length > 0 || approval?.actionId === 'wait'
    ? approval
    : null;
  return {
    generatedAt: new Date().toISOString(),
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
    attentionBudget: { availableMinutes: 150, maximumEnergyCost: 3 },
    evidence: {
      state: context.strategy.evidenceIds.length > 0 ? 'grounded' : 'insufficient',
      strategyEvidenceCount: context.strategy.evidenceIds.length,
      withheldEvidenceCount: context.strategy.withheldEvidenceCount,
      sourceTypes: context.strategy.sourceTypes,
    },
    actions: workbenchActions(context),
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

function workbenchActions(context) {
  if (context.strategy.evidenceIds.length === 0) return coldStartActions(context);
  return groundedActions.map((action) => {
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
    };
  });
}

function coldStartActions(context) {
  const withheld = context.strategy.withheldEvidenceCount;
  return [
    {
      id: 'collect_evidence', kind: 'research', title: 'یک منبع واقعی برای تحلیل برند وارد کن',
      rationale: withheld > 0
        ? `${String(withheld)} شاهد فقط برای فهم شخصی ثبت شده، اما برای تحلیل برند مجوز ندارد.`
        : 'هنوز هیچ شاهد مالک‌محور و مجازی برای تحلیل برند وجود ندارد؛ قبل از پیشنهاد حرکت بیرونی، یک منبع واقعی ثبت کنید.',
      benefits: ['ساخت پایه قابل‌ردیابی برای تصمیم بعدی'], risks: ['ورود متن نامرتبط یا بیش‌ازحد حساس'],
      prerequisites: ['انتخاب یک متن واقعی', 'تعیین صریح مجوز تحلیل برند'], evidenceIds: [], evidenceCount: 0,
      confidence: 1, riskLevel: 'low', attentionCostMinutes: 10, energyCost: 1, feasible: true,
      utilityScore: null, opportunityCost: null, rank: 1, evidenceState: 'insufficient',
      evidenceSourceTypes: [], interaction: 'open_intake',
    },
    {
      id: 'reflect_first', kind: 'private_conversation', title: 'یک تجربه واقعی را در گفت‌وگو ثبت کن',
      rationale: 'اگر منبع آماده‌ای ندارید، یک تجربه مشخص را تعریف کنید؛ سیستم فقط با تأیید جداگانه آن را به حافظه تبدیل می‌کند.',
      benefits: ['شروع کم‌اصطکاک مدل شخصی'], risks: ['یک Self-report منفرد هنوز شاهد مستقل نیست'],
      prerequisites: ['تعریف یک موقعیت مشخص', 'تأیید جداگانه حافظه'], evidenceIds: [], evidenceCount: 0,
      confidence: 1, riskLevel: 'low', attentionCostMinutes: 8, energyCost: 1, feasible: true,
      utilityScore: null, opportunityCost: null, rank: 2, evidenceState: 'insufficient',
      evidenceSourceTypes: [], interaction: 'open_conversation',
    },
    {
      id: 'wait', kind: 'no_action', title: 'تا رسیدن شاهد، اقدام عمومی نکن',
      rationale: `برای هدف «${strategy.goal.title}» هنوز Evidence مجاز کافی وجود ندارد؛ خودداری از توصیه عمومی از ساختن قطعیت کاذب معتبرتر است.`,
      benefits: ['پرهیز از توصیه و ادعای بدون پشتوانه'], risks: ['عقب‌افتادن یک پنجره زمانی کوتاه'],
      prerequisites: ['بازبینی پس از ورود اولین منبع مجاز'], evidenceIds: [], evidenceCount: 0,
      confidence: 1, riskLevel: 'low', attentionCostMinutes: 0, energyCost: 1, feasible: true,
      utilityScore: null, opportunityCost: null, rank: 3, evidenceState: 'insufficient',
      evidenceSourceTypes: [], interaction: 'approve',
    },
  ];
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
  if (approval?.actionId !== 'essay' || approval.strategyRevision !== strategy.revision) return false;
  return Boolean(Array.isArray(approval.evidenceIds) && source.evidenceIds.length > 0 &&
    source.evidenceIds.every((id) => approval.evidenceIds.includes(id)));
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
        event.eventType === 'asset.revoke_brand_usage' || event.eventType === 'asset.delete'
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
  if (/[0-9۰-۹]|در\s+سال|درآمد|فروش|تعداد|درصد|جایزه|مدرک|دانشگاه|شرکت|بنیان.?گذار|according\s+to|research\s+shows/iu.test(remaining)) {
    violations.push({ code: 'claim_extraction_incomplete', severity: 'red', claimId: 'draft', message: 'Potential unbound fact detected.' });
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

function chooseFollowUpQuestion(text) {
  if (/عوض|تغییر|قبلاً|دیگر|نظرم/u.test(text)) {
    return 'چه تجربه یا شواهدی باعث شد دیدگاهت تغییر کند؟';
  }
  if (/جلسه|اتفاق|دیدم|شنیدم|گفت/u.test(text)) {
    return 'کدام بخش این اتفاق برایت مهم بود و چرا؟';
  }
  return 'یک موقعیت واقعی را تعریف می‌کنی که این فکر در آن خودش را نشان داده باشد؟';
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
