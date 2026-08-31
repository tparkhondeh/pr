export const conversationOrchestratorPolicyVersion = 'conversation-orchestrator-v1' as const;

export type ConversationIntentKind =
  | 'reflect'
  | 'remember'
  | 'correct_memory'
  | 'set_strategy'
  | 'assess_action'
  | 'research_external'
  | 'draft_content'
  | 'data_control'
  | 'unclear';

export type ConversationTargetView =
  | 'today'
  | 'memory'
  | 'strategy'
  | 'research'
  | 'draft'
  | 'risk'
  | 'data';

export type ConversationOrchestration = Readonly<{
  policyVersion: typeof conversationOrchestratorPolicyVersion;
  intent: Readonly<{
    kind: ConversationIntentKind;
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
      kind: 'current_turn';
      ref: string;
      trust: 'untrusted_user_input';
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

export type OrchestratedConversationResponse = Readonly<{
  assistantMessage: string;
  followUpQuestion: string;
  orchestration: ConversationOrchestration;
}>;

type IntentDefinition = Readonly<{
  kind: ConversationIntentKind;
  patterns: readonly RegExp[];
  module: ConversationOrchestration['route']['module'];
  targetView: ConversationTargetView;
  mode: ConversationOrchestration['route']['mode'];
  requiresUserApproval: boolean;
  memoryProposalAllowed: boolean;
  label: string;
}>;

const intentDefinitions: readonly IntentDefinition[] = [
  {
    kind: 'data_control',
    patterns: [
      /(?:حافظه|اطلاعات|داده|برداشت).{0,24}(?:حذف|پاک|فراموش|لغو)(?:ش)?\s+(?:کن|کنید|شود|بشه)/u,
      /(?:این|اطلاعات|حافظه).{0,30}استفاده نکن/u,
      /این (?:را|رو).{0,16}(?:پاک|حذف|فراموش)/u,
    ],
    module: 'data',
    targetView: 'data',
    mode: 'hold',
    requiresUserApproval: true,
    memoryProposalAllowed: false,
    label: 'بازکردن کنترل داده و حافظه',
  },
  {
    kind: 'correct_memory',
    patterns: [
      /(?:برداشت|حافظه|اطلاعات).{0,24}(?:غلط|نادرست|اصلاح|تصحیح)/u,
      /(?:اصلاح|تصحیح).{0,24}(?:برداشت|حافظه|اطلاعات)/u,
      /دیگر (?:متعلق به من|نظر من|باور من) نیست/u,
    ],
    module: 'memory',
    targetView: 'memory',
    mode: 'hold',
    requiresUserApproval: true,
    memoryProposalAllowed: false,
    label: 'بازکردن حافظه برای اصلاح',
  },
  {
    kind: 'research_external',
    patterns: [
      /تحقیق|پژوهش|جستجو|جست‌وجو|منبع|فکت.?چک|راستی.?آزمایی/u,
      /آخرین (?:خبر|آمار|گزارش|تحقیق)/u,
      /درباره .{2,80}(?:پیدا کن|بررسی کن)/u,
    ],
    module: 'research',
    targetView: 'research',
    mode: 'propose',
    requiresUserApproval: false,
    memoryProposalAllowed: false,
    label: 'رفتن به Research Workspace',
  },
  {
    kind: 'assess_action',
    patterns: [
      /منتشر|انتشار|پابلیش|ارسال عمومی|اجرا کن|اقدام کنیم|ریسک این/u,
      /(?:پست|مقاله|ویدئو|بیانیه).{0,30}(?:بگذار|بذار|منتشر)/u,
    ],
    module: 'risk',
    targetView: 'risk',
    mode: 'hold',
    requiresUserApproval: true,
    memoryProposalAllowed: false,
    label: 'بررسی اقدام و ریسک',
  },
  {
    kind: 'draft_content',
    patterns: [
      /(?:پست|مقاله|کپشن|خبرنامه|اسکریپت|سناریو|متن).{0,28}(?:بنویس|بساز|آماده|پیش.?نویس)/u,
      /برای (?:لینکدین|اینستاگرام|یوتیوب|ایکس|توییتر|وبلاگ|پادکست)/u,
    ],
    module: 'draft',
    targetView: 'draft',
    mode: 'propose',
    requiresUserApproval: true,
    memoryProposalAllowed: false,
    label: 'رفتن به استودیوی پیش‌نویس',
  },
  {
    kind: 'set_strategy',
    patterns: [
      /استراتژ|راهبرد|جایگاه|مخاطب هدف|هدف برند|جهت برند/u,
      /(?:هدف|اولویت).{0,24}(?:عوض|تغییر|جدید)/u,
    ],
    module: 'strategy',
    targetView: 'strategy',
    mode: 'propose',
    requiresUserApproval: true,
    memoryProposalAllowed: true,
    label: 'بازکردن زمینه استراتژی',
  },
  {
    kind: 'remember',
    patterns: [
      /یادت (?:باشه|بماند|بمونه)|به خاطر بسپار|در حافظه|ثبتش کن|این را بدان/u,
    ],
    module: 'memory',
    targetView: 'memory',
    mode: 'propose',
    requiresUserApproval: true,
    memoryProposalAllowed: true,
    label: 'ساخت پیشنهاد حافظه',
  },
  {
    kind: 'reflect',
    patterns: [
      /فکر می‌کنم|به نظرم|امروز|جلسه|اتفاق|تجربه|دیدگاه|نظرم|باور|ارزش/u,
      /دیدم|شنیدم|یاد گرفتم|متوجه شدم|در (?:یک )?(?:پروژه|موقعیت)|کردم|داشتم/u,
    ],
    module: 'conversation',
    targetView: 'today',
    mode: 'clarify',
    requiresUserApproval: false,
    memoryProposalAllowed: true,
    label: 'ادامه همین گفت‌وگو',
  },
];

const sensitiveDataPatterns = [
  /(?:رمز|پسورد|password|token|توکن|api.?key|کلید خصوصی)[^:\n=]{0,16}[:=]\s*\S{4,}/iu,
  /(?:کارت|شبا|حساب|کد ملی)\D{0,12}\d(?:[\d\s-]{7,24}\d)/u,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/u,
] as const;

const promptInjectionPatterns = [
  /(?:دستور|قانون|پرامپت).{0,24}(?:قبلی|سیستم).{0,24}(?:نادیده|لغو|افشا)/u,
  /(?:ignore|reveal).{0,24}(?:previous|system|prompt|instruction)/iu,
] as const;

const publicActionPatterns = [
  /منتشر|انتشار|پابلیش|ارسال عمومی|اجرا کن/u,
  /(?:لینکدین|اینستاگرام|یوتیوب|ایکس|توییتر).{0,24}(?:بگذار|بذار|ارسال)/u,
] as const;

export function orchestrateConversationTurn(input: Readonly<{
  turnId: string;
  text: string;
  memoryProposalRequested: boolean;
}>): OrchestratedConversationResponse {
  const normalized = normalizeText(input.text);
  const sensitiveDataDetected = matchesAny(normalized, sensitiveDataPatterns);
  const promptInjectionDetected = matchesAny(normalized, promptInjectionPatterns);
  const publicActionRequested = matchesAny(normalized, publicActionPatterns);
  const definition = chooseIntent(
    normalized,
    publicActionRequested,
    input.memoryProposalRequested,
  );
  const ambiguous = !definition;
  const resolved = definition ?? unclearDefinition;
  const memoryProposalAllowed =
    resolved.memoryProposalAllowed && !sensitiveDataDetected && !promptInjectionDetected;

  const held = sensitiveDataDetected || (promptInjectionDetected && publicActionRequested);
  const requiresUserApproval = resolved.requiresUserApproval || publicActionRequested;
  const outcome = held
    ? 'held'
    : ambiguous
      ? 'clarification_required'
      : requiresUserApproval
        ? 'approval_required'
        : 'routed';
  const targetView = held && sensitiveDataDetected ? 'data' : resolved.targetView;
  const routeModule = held && sensitiveDataDetected ? 'data' : resolved.module;
  const confidence = confidenceFor(resolved.kind, normalized, promptInjectionDetected);
  const retention = sensitiveDataDetected
    ? {
        turn: 'not_persisted' as const,
        rationale: 'نشانه داده حساس دیده شد؛ متن خام برای پیوستگی ذخیره نمی‌شود.',
      }
    : input.memoryProposalRequested && memoryProposalAllowed
      ? {
          turn: 'confidential' as const,
          rationale: 'کاربر Proposal حافظه را درخواست کرده؛ Turn به‌صورت owner-scoped و محرمانه ثبت می‌شود.',
        }
    : {
        turn: 'not_persisted' as const,
        rationale: 'بدون Opt-in معتبر حافظه، متن خام Turn در Store ثبت نمی‌شود.',
      };
  const appliedRules = [
    'user_input_is_untrusted',
    'no_silent_cross_module_write',
    'public_action_requires_approval',
    'external_research_is_not_personal_memory',
    ...(sensitiveDataDetected ? ['sensitive_input_not_persisted'] : []),
    ...(promptInjectionDetected ? ['prompt_injection_cannot_change_authority'] : []),
  ];

  const orchestration: ConversationOrchestration = {
    policyVersion: conversationOrchestratorPolicyVersion,
    intent: {
      kind: resolved.kind,
      confidence,
      rationale: intentRationale(resolved.kind, ambiguous),
    },
    route: {
      module: routeModule,
      mode: held ? 'hold' : resolved.mode,
      targetView,
      readAuthority: 'none',
      writeAuthority: memoryProposalAllowed && input.memoryProposalRequested
        ? 'propose_only'
        : 'none',
      requiresUserApproval,
    },
    provenance: {
      sources: [{ kind: 'current_turn', ref: input.turnId, trust: 'untrusted_user_input' }],
      personalMemoryUsed: false,
      externalResearchUsed: false,
    },
    safety: {
      sensitiveDataDetected,
      promptInjectionDetected,
      publicActionRequested,
      memoryProposalAllowed,
    },
    arbitration: {
      outcome,
      rationale: arbitrationRationale(outcome, resolved.kind),
      appliedRules,
    },
    retention,
    recommendedAction: {
      kind: sensitiveDataDetected
        ? 'review_sensitive_input'
        : ambiguous
          ? 'clarify'
          : 'open_view',
      label: sensitiveDataDetected ? 'بازبینی داده حساس' : resolved.label,
      targetView,
    },
  };

  return {
    assistantMessage: assistantMessage(orchestration, input.memoryProposalRequested),
    followUpQuestion: followUpQuestion(resolved.kind, normalized, held),
    orchestration,
  };
}

const unclearDefinition: IntentDefinition = {
  kind: 'unclear',
  patterns: [],
  module: 'conversation',
  targetView: 'today',
  mode: 'clarify',
  requiresUserApproval: false,
  memoryProposalAllowed: true,
  label: 'روشن‌کردن مقصود',
};

function chooseIntent(
  text: string,
  publicActionRequested: boolean,
  memoryProposalRequested: boolean,
): IntentDefinition | undefined {
  if (publicActionRequested) {
    return intentDefinitions.find((definition) => definition.kind === 'assess_action');
  }
  const matched = intentDefinitions.find((definition) => matchesAny(text, definition.patterns));
  if (matched) return matched;
  return memoryProposalRequested
    ? intentDefinitions.find((definition) => definition.kind === 'remember')
    : undefined;
}

function normalizeText(text: string): string {
  return text.trim().replace(/ي/gu, 'ی').replace(/ك/gu, 'ک').replace(/\s+/gu, ' ');
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function confidenceFor(
  kind: ConversationIntentKind,
  text: string,
  promptInjectionDetected: boolean,
): number {
  if (kind === 'unclear') return 0.35;
  if (promptInjectionDetected) return 0.51;
  if (kind === 'data_control' || kind === 'correct_memory') return 0.94;
  if (kind === 'remember' || kind === 'research_external' || kind === 'assess_action') return 0.9;
  if (text.length < 18) return 0.64;
  return kind === 'reflect' ? 0.72 : 0.82;
}

function intentRationale(kind: ConversationIntentKind, ambiguous: boolean): string {
  if (ambiguous) return 'Signal کافی برای Routing مطمئن وجود ندارد؛ سیستم از حدس خودداری می‌کند.';
  const rationales: Readonly<Record<ConversationIntentKind, string>> = {
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
  return rationales[kind];
}

function arbitrationRationale(
  outcome: ConversationOrchestration['arbitration']['outcome'],
  kind: ConversationIntentKind,
): string {
  if (outcome === 'held') {
    return 'Privacy/Security بر Utility مقدم شد؛ تا بازبینی انسانی هیچ Route اجرایی فعال نیست.';
  }
  if (outcome === 'clarification_required') {
    return 'Confidence برای Routing پایین است و یک سؤال با Information Gain بالا لازم است.';
  }
  if (outcome === 'approval_required') {
    return kind === 'assess_action'
      ? 'اقدام عمومی باید از Claim، Risk و تأیید انسانی عبور کند.'
      : 'ماژول فقط پیشنهاد آماده می‌کند؛ نوشتن یا اجرا به تأیید صریح کاربر نیاز دارد.';
  }
  return 'Route فقط برای تحلیل انتخاب شد و هیچ ماژول دیگری تغییر نکرد.';
}

function assistantMessage(
  orchestration: ConversationOrchestration,
  memoryProposalRequested: boolean,
): string {
  if (orchestration.safety.sensitiveDataDetected) {
    return 'نشانه‌ای از داده حساس دیدم؛ متن خام ذخیره نشد و هیچ اقدامی انجام نمی‌دهم.';
  }
  if (orchestration.safety.promptInjectionDetected) {
    return 'این ورودی به‌عنوان محتوای غیرقابل‌اعتماد تحلیل شد و نمی‌تواند Permission یا قواعد سیستم را تغییر دهد.';
  }
  if (memoryProposalRequested && !orchestration.safety.memoryProposalAllowed) {
    return 'این ورودی به حافظه شخصی تعلق ندارد؛ آن را با Research، اقدام یا کنترل داده مخلوط نمی‌کنم.';
  }
  if (orchestration.route.writeAuthority === 'propose_only') {
    return 'مسیر مناسب را تشخیص دادم؛ فقط یک پیشنهاد حافظه می‌سازم و ثبت قطعی نیازمند تأیید جداگانه است.';
  }
  if (orchestration.arbitration.outcome === 'approval_required') {
    return 'مسیر مناسب را تشخیص دادم؛ فعلاً فقط تحلیل و پیشنهاد مجاز است و هیچ اقدام حساسی اجرا نشد.';
  }
  if (orchestration.intent.kind === 'unclear') {
    return 'برای اینکه ورودی را به ماژول اشتباه نفرستم، فعلاً از حدس‌زدن خودداری می‌کنم.';
  }
  return 'ورودی را فهمیدم و بدون تغییر پنهانی در حافظه، استراتژی یا اقدام‌ها Route کردم.';
}

function followUpQuestion(
  kind: ConversationIntentKind,
  text: string,
  held: boolean,
): string {
  if (held) return 'می‌خواهی پس از حذف داده حساس، نسخه بدون اطلاعات خصوصی را دوباره بررسی کنیم؟';
  const questions: Readonly<Record<ConversationIntentKind, string>> = {
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
  return questions[kind];
}
