let approval = null;

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
      approval ??= { actionId: action.id, approvedAt: new Date().toISOString() };
      return json(snapshot());
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
      id: 'goal_trusted_advisor',
      title: 'تقویت جایگاه «مشاور قابل‌اعتماد»',
      outcome: 'ایجاد تعامل‌های عمیق و قابل‌ردیابی با ذی‌نفعان اصلی',
      successMetrics: ['کیفیت تعامل', 'فرصت‌های ایجادشده', 'تغییر ادراک'],
    },
    attentionBudget: { availableMinutes: 150, maximumEnergyCost: 3 },
    actions,
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
