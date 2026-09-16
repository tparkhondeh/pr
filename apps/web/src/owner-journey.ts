export type JourneyView = 'intake' | 'memory' | 'strategy' | 'today' | 'draft' | 'learning';
export type JourneyStepState = 'complete' | 'current' | 'pending' | 'blocked' | 'unknown' | 'optional';

/** Read-only projection of authoritative snapshots; never stores approvals or acceptance. */
export type OwnerJourneyInput = Readonly<{
  workbench: Readonly<{
    goal: Readonly<{ revision: number }>;
    evidence: Readonly<{ state: string; strategyEvidenceCount: number }>;
    workflow: Readonly<{ status: string; approvedActionId?: string }>;
    actions: readonly Readonly<{ id: string; kind: string }>[];
  }> | null;
  onboarding: Readonly<{
    strategyReadiness: Readonly<{ ready: boolean; evidenceCount: number }>;
  }> | null;
  draft: Readonly<{
    draftId: string;
    status: string;
    sourceAvailable: boolean;
    staleStrategy: boolean;
    strategyRevision: number;
    guard: Readonly<{ mayRequestApproval: boolean }>;
  }> | null;
  feedback: Readonly<{
    recentEvents: readonly Readonly<{ artifactId: string; eventType: string }>[];
  }> | null;
  draftLoaded: boolean;
  feedbackLoaded: boolean;
}>;

export type JourneyStep = Readonly<{
  id: string;
  title: string;
  description: string;
  view: JourneyView;
  state: JourneyStepState;
}>;

export function buildOwnerJourney(input: OwnerJourneyInput): Readonly<{
  steps: readonly JourneyStep[];
  next: JourneyStep;
  completed: number;
}> {
  const { workbench, onboarding, draft, feedback } = input;
  // Both views must agree after consent withdrawal or source deletion.
  const evidenceReady = workbench?.evidence.state === 'grounded' &&
    workbench.evidence.strategyEvidenceCount > 0 && onboarding?.strategyReadiness.ready === true &&
    onboarding.strategyReadiness.evidenceCount > 0;
  const goalSaved = (workbench?.goal.revision ?? 0) > 1;
  const chosen = workbench?.workflow.status === 'approved'
    ? workbench.actions.find(action => action.id === workbench.workflow.approvedActionId)
    : undefined;
  const nonContent = chosen !== undefined && chosen.kind !== 'content';
  const draftInvalid = input.draftLoaded && draft !== null && (!draft.sourceAvailable || draft.staleStrategy ||
    draft.strategyRevision !== workbench?.goal.revision || !draft.guard.mayRequestApproval ||
    draft.status === 'guard_failed');
  const draftValid = input.draftLoaded && draft !== null && !draftInvalid && evidenceReady;
  const exported = draftValid && draft.status === 'exported';
  const feedbackRecorded = input.feedbackLoaded && draftValid && feedback?.recentEvents.some(event =>
    event.artifactId === draft.draftId && ['edited', 'rejected', 'regret', 'energy_report'].includes(event.eventType)) === true;
  const steps: JourneyStep[] = [
    { id: 'evidence', title: 'یک تجربهٔ واقعی', view: 'intake',
      description: evidenceReady ? 'شاهد مجاز آماده است؛ در «حافظه من» می‌توانید آن را اصلاح کنید.' : 'یک متن کوتاه و غیرحساس ثبت کنید و اجازهٔ استفاده‌اش را مشخص کنید.',
      state: evidenceReady ? 'complete' : workbench && onboarding ? 'pending' : 'unknown' },
    { id: 'goal', title: 'هدف شخصی شما', view: 'strategy',
      description: goalSaved ? 'هدف و جایگاه شما ذخیره شده؛ هر زمان قابل اصلاح است.' : 'هدف، مخاطب و نتیجهٔ دلخواه را مرور و ذخیره کنید؛ متن پیش‌فرض هدف شما محسوب نمی‌شود.',
      state: goalSaved ? 'complete' : workbench ? 'pending' : 'unknown' },
    { id: 'action', title: 'انتخاب آگاهانه', view: 'today',
      description: chosen ? nonContent ? 'گزینهٔ غیرمحتوایی ثبت شده؛ تولید محتوا اجباری نیست.' : 'اقدام محتوایی تأیید شده؛ پیش از خروجی، متن را جداگانه بررسی کنید.' : 'سه پیشنهاد و دلیل‌ها را مقایسه کنید؛ عدم اقدام هم انتخاب معتبر است.',
      state: chosen ? 'complete' : workbench ? 'pending' : 'unknown' },
    { id: 'draft', title: 'متن مستند', view: 'draft',
      description: nonContent ? 'برای این انتخاب نیازی به پیش‌نویس نیست.' : draftInvalid ? 'شاهد، هدف یا کنترل ادعا تغییر کرده؛ متن را دوباره بررسی کنید.' : draftValid ? 'متن موجود را بخوانید، اصلاح کنید و شاهدش را بررسی کنید.' : 'از یک شاهد مجاز، پیش‌نویس بسازید؛ هیچ انتشار خودکاری انجام نمی‌شود.',
      state: nonContent ? 'optional' : draftInvalid ? 'blocked' : draftValid ? 'complete' : input.draftLoaded ? 'pending' : 'unknown' },
    { id: 'export', title: 'تأیید و خروجی', view: 'draft',
      description: nonContent ? 'خروجی محتوا برای این انتخاب لازم نیست.' : exported ? 'خروجی این نسخه ثبت شده؛ این به معنی انتشار یا پذیرش نهایی شما نیست.' : 'متن نهایی را خودتان تأیید و سپس خروجی بگیرید؛ ویرایش، تأیید قبلی را باطل می‌کند.',
      state: nonContent ? 'optional' : exported ? 'complete' : draftInvalid ? 'blocked' : input.draftLoaded ? 'pending' : 'unknown' },
    { id: 'feedback', title: 'بازخورد و یادگیری', view: 'learning',
      description: nonContent ? 'بدون تولید محتوای اجباری می‌توانید یادگیری‌های قبلی را مرور کنید.' : feedbackRecorded ? 'بازخورد همین متن ثبت شده؛ پیشنهادهای یادگیری را بررسی، رد یا برگردانید.' : 'از ویرایش یا رد متن بازخورد ثبت می‌شود؛ تغییر ترجیحات بدون تصمیم شما اعمال نمی‌شود.',
      state: nonContent ? 'optional' : feedbackRecorded ? 'complete' : input.feedbackLoaded ? 'pending' : 'unknown' },
  ];
  const nextIndex = steps.findIndex(step => step.state !== 'complete' && step.state !== 'optional');
  if (nextIndex >= 0 && steps[nextIndex]?.state === 'pending') {
    steps[nextIndex] = { ...steps[nextIndex], state: 'current' };
  }
  // A completed content cycle still invites owner review, never automatic product acceptance.
  const next = steps[nextIndex >= 0 ? nextIndex : 5] ?? {
    id: 'review', title: 'مرور مسیر', description: 'نتیجه را مرور کنید.', view: 'learning', state: 'pending',
  };
  return { steps, next, completed: steps.filter(step => step.state === 'complete').length };
}
