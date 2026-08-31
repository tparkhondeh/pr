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
const memoryProposals = new Map();
const memoryRightRequests = new Map();

const actions = [
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
        if (!usableDraftSource(memoryProposals.get(repeated.snapshot.source.proposalId))) {
          return json({ error: 'source_not_available' }, 409);
        }
        return json({ outcome: 'already_applied', ...repeated.snapshot });
      }
      if (approval?.actionId !== 'essay' || approval.strategyRevision !== strategy.revision) {
        return json({ error: 'content_action_not_approved' }, 409);
      }
      const source = memoryProposals.get(body.sourceProposalId);
      if (!usableDraftSource(source)) return json({ error: 'source_not_available' }, 409);
      const draftId = crypto.randomUUID();
      const claimId = crypto.randomUUID();
      const draftBody = composePlatformDraft(body.channel, body.narrativeAngle.trim(), source.text, body.takeaway.trim());
      const guard = reviewDraftBody(draftBody, body.channel, source.text, claimId);
      currentDraft = {
        draftId,
        claimId,
        revision: 1,
        strategyRevision: strategy.revision,
        channel: body.channel,
        body: draftBody,
        status: guard.mayRequestApproval ? 'awaiting_approval' : 'guard_failed',
        guard,
        source: {
          proposalId: source.id,
          assertionId: source.activeAssertionId,
          statement: source.text,
          evidenceIds: [source.activeEvidenceId ?? `evidence_${source.id.slice('memory_'.length)}`],
        },
        publicDraftingConsent: true,
        updatedAt: new Date().toISOString(),
      };
      source.permissions = { ...source.permissions, publicUsage: true };
      rememberDraftRequest(body.requestId, 'create', body, currentDraft);
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
      const guard = reviewDraftBody(body.body.trim(), currentDraft.channel, currentDraft.source.statement, currentDraft.claimId);
      currentDraft = {
        ...currentDraft,
        revision: currentDraft.revision + 1,
        body: body.body.trim(),
        status: guard.mayRequestApproval ? 'awaiting_approval' : 'guard_failed',
        guard,
        approvedAt: undefined,
        exportedAt: undefined,
        updatedAt: new Date().toISOString(),
      };
      rememberDraftRequest(body.requestId, 'edit', { ...body, draftId: draftEdit[1] }, currentDraft);
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
        if (!usableDraftSource(memoryProposals.get(currentDraft.source.proposalId))) {
          return json({ error: 'source_not_available' }, 409);
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
      return json({ outcome: 'saved', ...strategy });
    }

    if (request.method === 'GET' && url.pathname === '/api/memory') {
      const records = [...memoryProposals.values()]
        .filter((proposal) => proposal.confirmedAt)
        .map((proposal) => memoryRecord(proposal))
        .sort((left, right) => right.lifecycle.updatedAt.localeCompare(left.lifecycle.updatedAt));
      return json({
        generatedAt: new Date().toISOString(),
        persistence: 'ephemeral',
        summary: {
          total: records.length,
          active: records.filter((record) => record.lifecycle.status === 'active').length,
          attentionRequired: records.filter((record) => (
            record.lifecycle.status === 'contested' ||
            record.lifecycle.status === 'consent_revoked'
          )).length,
          deleted: records.filter((record) => record.lifecycle.status === 'deleted').length,
        },
        records,
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/workbench/approval') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid_json' }, 400);
      }
      const action = actions.find((candidate) => candidate.id === body?.actionId);
      if (!action) return json({ error: 'action_not_found' }, 404);
      if (approval && approval.actionId !== action.id) {
        return json({ error: 'different_action_approved' }, 409);
      }
      approval ??= {
        actionId: action.id,
        approvedAt: new Date().toISOString(),
        strategyRevision: strategy.revision,
      };
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
        permissions?.brandUsage !== false ||
        permissions?.publicUsage !== false
      ) {
        return json({ error: 'memory_permission_denied' }, 403);
      }
      proposal.confirmedAt ??= new Date().toISOString();
      proposal.activeAssertionId ??= `assertion_${proposal.id.slice('memory_'.length)}`;
      proposal.revisionCount ??= 1;
      proposal.updatedAt ??= proposal.confirmedAt;
      proposal.permissions ??= permissions;
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
      return json(result);
    }

    return env.ASSETS.fetch(request);
  },
};

function snapshot() {
  return {
    generatedAt: new Date().toISOString(),
    runtime: { source: 'preview_worker', persistence: 'ephemeral' },
    profile: { maturityPercent: 32, evidenceCount: 4, openContradictions: 1 },
    goal: {
      id: strategy.goalId,
      revision: strategy.revision,
      title: strategy.goal.title,
      outcome: strategy.goal.outcome,
      successMetrics: strategy.goal.successMetrics,
    },
    attentionBudget: { availableMinutes: 150, maximumEnergyCost: 3 },
    actions: actions.map((action) => ({ ...action, rationale: contextualRationale(action) })),
    workflow: {
      id: 'workbench_today',
      status: approval ? 'approved' : 'awaiting_approval',
      revision: approval ? 2 : 1,
      ...(approval
        ? { approvedActionId: approval.actionId, approvedAt: approval.approvedAt }
        : {}),
    },
  };
}

function contextualRationale(action) {
  if (action.kind === 'private_conversation') {
    return `برای هدف «${strategy.goal.title}»، یک تعامل عمیق با ${strategy.desiredPositioning.audience} از چند انتشار عمومی ارزشمندتر است.`;
  }
  if (action.kind === 'content') {
    return `این اقدام باید ادراک «${strategy.desiredPositioning.desiredPerception}» را با تجربه و ادعاهای قابل‌ردیابی پشتیبانی کند.`;
  }
  return `عدم اقدام نیز نسبت به هدف «${strategy.goal.title}» یک گزینه آگاهانه است؛ کیفیت برند نباید قربانی پرکردن تقویم شود.`;
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

const draftChannels = ['linkedin', 'instagram', 'x', 'youtube', 'podcast', 'newsletter', 'blog'];

function validDraftCreate(body) {
  return (
    typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    typeof body.sourceProposalId === 'string' && draftChannels.includes(body.channel) &&
    validText(body.narrativeAngle, 3, 500) && validText(body.takeaway, 3, 2000) &&
    body.publicDraftingConsent === true
  );
}

function validDraftMutation(body) {
  return typeof body?.requestId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(body.requestId) &&
    Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 1;
}

function usableDraftSource(source) {
  return Boolean(source?.confirmedAt && !source.deleted && !source.contestedAt &&
    !source.permissionsRevoked && typeof source.text === 'string');
}

function draftSnapshot() {
  const source = memoryProposals.get(currentDraft.source.proposalId);
  return {
    ...currentDraft,
    persistence: 'ephemeral',
    sourceAvailable: usableDraftSource(source),
    staleStrategy: currentDraft.strategyRevision !== strategy.revision,
  };
}

function draftMutationGate(draftId, revision) {
  if (!currentDraft || currentDraft.draftId !== draftId) return 'draft_not_found';
  if (currentDraft.revision !== revision) return 'revision_changed';
  if (currentDraft.strategyRevision !== strategy.revision) return 'strategy_changed';
  if (!usableDraftSource(memoryProposals.get(currentDraft.source.proposalId))) return 'source_not_available';
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

function composePlatformDraft(channel, angle, statement, takeaway) {
  if (channel === 'x') return `${angle}\n\n${statement}\n\nبرداشت من: ${takeaway}`;
  if (channel === 'youtube') return `Hook\n${angle}\n\nروایت واقعی\n${statement}\n\nجمع‌بندی و دعوت به گفت‌وگو\n${takeaway}`;
  if (channel === 'podcast') return `آغاز اپیزود\n${angle}\n\nروایت و زمینه\n${statement}\n\nبرداشت شخصی\n${takeaway}`;
  if (channel === 'newsletter' || channel === 'blog') return `# ${angle}\n\n## روایت\n${statement}\n\n## برداشت من\n${takeaway}`;
  if (channel === 'instagram') return `${angle}\n\n${statement}\n\nبرداشت من:\n${takeaway}\n\n#روایت_واقعی`;
  return `${angle}\n\n${statement}\n\nبرداشت من:\n${takeaway}\n\nنظر شما چیست؟`;
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
  const limits = { linkedin: 3000, instagram: 2200, x: 280, youtube: 10000, podcast: 10000, newsletter: 15000, blog: 20000 };
  if (body.length > limits[channel]) {
    violations.push({ code: 'channel_format_violation', severity: 'red', claimId, message: 'Channel length exceeded.' });
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
