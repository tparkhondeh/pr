import {
  ArrowUpLeft,
  BookOpenText,
  Check,
  ChevronLeft,
  CircleGauge,
  Clock3,
  FileCheck2,
  Fingerprint,
  History,
  Lightbulb,
  LockKeyhole,
  LoaderCircle,
  MessageCircleMore,
  Network,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import {
  WorkbenchApiError,
  applyMemoryRight,
  approveWorkbenchAction,
  confirmMemoryProposal,
  loadPersonalMemory,
  loadStrategyContext,
  loadWorkbench,
  saveStrategyContext,
  submitConversationTurn,
  type AppliedMemoryRight,
  type ConversationTurnResult,
  type MemoryRightKind,
  type PersonalMemoryRecord,
  type PersonalMemorySnapshot,
  type EditableStrategyContext,
  type StrategyContextSnapshot,
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
  const [activeView, setActiveView] = useState<'today' | 'memory' | 'strategy'>('today');
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

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setState('loading');
    setError(null);
    try {
      const next = await loadWorkbench(signal);
      setSnapshot(next);
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

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => {
      controller.abort();
    };
  }, [refresh]);

  const selectedAction = useMemo(
    () => snapshot?.actions.find((action) => action.id === selected),
    [selected, snapshot],
  );
  const selectedIsApproved =
    snapshot?.workflow.status === 'approved' &&
    snapshot.workflow.approvedActionId === selected;

  const approve = async () => {
    if (!selectedAction || state === 'approving' || !selectedAction.feasible) return;
    setState('approving');
    setError(null);
    try {
      const next = await approveWorkbenchAction(selectedAction.id);
      setSnapshot(next);
      setState('ready');
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setState('ready');
    }
  };

  const submitConversation = async () => {
    const text = conversationText.trim();
    if (text.length < 3 || conversationState !== 'idle') return;
    setConversationState('sending');
    setError(null);
    setMemoryConfirmed(false);
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
      const confirmed = await confirmMemoryProposal(proposalId);
      setMemoryPersistence(confirmed.persistence);
      setMemoryConfirmed(true);
      setConversationState('idle');
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
    { label: 'حافظه من', icon: Fingerprint, view: 'memory' as const },
    { label: 'استراتژی', icon: Lightbulb, view: 'strategy' as const },
    { label: 'روابط', icon: Network },
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
                if (view === 'memory') void refreshMemory();
                if (view === 'strategy') void refreshStrategy();
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
          <div className="maturity"><span>بلوغ مدل شخصی</span><strong>{snapshot.profile.maturityPercent}٪</strong></div>
          <div className="progress"><i style={{ width: `${String(snapshot.profile.maturityPercent)}%` }} /></div>
          <small>{snapshot.profile.evidenceCount} شاهد معتبر · {snapshot.profile.openContradictions} تناقض باز</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <span className="date">{formatDate(snapshot.generatedAt)}</span>
            <h1>{activeView === 'memory'
              ? 'حافظه‌ای که شما کنترل می‌کنید.'
              : activeView === 'strategy'
                ? 'جهت را شما تعیین می‌کنید.'
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

        {activeView === 'memory' ? (
          <PersonalMemoryPanel
            error={memoryViewError}
            onRefresh={() => refreshMemory()}
            snapshot={memorySnapshot}
            state={memoryViewState}
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
                {conversationResult.memoryProposal && !memoryConfirmed ? (
                  <button
                    disabled={conversationState !== 'idle'}
                    onClick={() => void confirmMemory()}
                    type="button"
                  >
                    {conversationState === 'confirming' ? 'در حال ثبت…' : 'تأیید ثبت فقط برای شناخت داخلی'}
                  </button>
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
                      استفاده برند و عمومی خاموش است.
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
          <div className="budget"><Clock3 size={18} /><span>بودجه توجه امروز</span><strong>{formatMinutes(snapshot.attentionBudget.availableMinutes)}</strong></div>
        </section>

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
                </span>
                <span className="metrics">
                  <span><b>{action.utilityScore ?? '—'}</b> امتیاز</span>
                  <span>{formatMinutes(action.attentionCostMinutes)}</span>
                  <span className={action.riskLevel === 'low' ? 'risk low' : 'risk'}>ریسک {riskLabels[action.riskLevel]}</span>
                </span>
                <span className="radio">{selected === action.id ? <Check size={15} /> : null}</span>
              </button>
            ))}
          </section>

          <aside className="evidence-card">
            <div className="evidence-title"><ShieldCheck size={20} /><span>چرا این پیشنهاد؟</span></div>
            <p>{selectedAction?.rationale}</p>
            <ul>
              <li><BookOpenText size={16} /><span><b>{selectedAction?.evidenceCount ?? 0} شاهد</b> قابل‌ردیابی</span></li>
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
                  (snapshot.workflow.status === 'approved' && !selectedIsApproved)
                }
                type="button"
                onClick={() => void approve()}
              >
                {approvalLabel(state, selectedIsApproved, snapshot.workflow.status)}
              </button>
              <small>تأیید فقط Workflow را آماده می‌کند؛ هیچ اقدام بیرونی اجرا نمی‌شود.</small>
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

function lineItems(value: string): readonly string[] {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean).slice(0, 8);
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

function approvalLabel(
  state: 'loading' | 'ready' | 'approving' | 'error',
  selectedIsApproved: boolean,
  workflowStatus: WorkbenchSnapshot['workflow']['status'],
) {
  if (state === 'approving') return <><LoaderCircle className="spin" size={18} /> در حال ثبت تأیید…</>;
  if (selectedIsApproved) return <><Check size={18} /> برای اجرا تأیید شد</>;
  if (workflowStatus === 'approved') return 'اقدام دیگری قبلاً تأیید شده';
  return 'انتخاب و آماده‌سازی اقدام';
}

function errorMessage(error: unknown): string {
  if (!(error instanceof WorkbenchApiError)) return 'خطای پیش‌بینی‌نشده رخ داد.';
  const messages: Readonly<Record<string, string>> = {
    network_unavailable: 'سرویس تصمیم در دسترس نیست. اتصال API را بررسی کنید.',
    authentication_required: 'برای ثبت تأیید باید دوباره وارد شوید.',
    different_action_approved: 'یک اقدام دیگر قبلاً تأیید شده و قابل جایگزینی خودکار نیست.',
    action_not_found: 'این اقدام دیگر در Snapshot فعلی وجود ندارد.',
    invalid_conversation_input: 'متن یا شناسه گفت‌وگو معتبر نیست.',
    memory_permission_denied: 'مجوز لازم برای ثبت این حافظه داده نشده است.',
    memory_proposal_conflict: 'این پیشنهاد حافظه قبلاً با وضعیت دیگری ثبت شده است.',
    memory_proposal_not_found: 'پیشنهاد حافظه دیگر در دسترس نیست.',
    invalid_memory_right: 'نوع درخواست، دلیل یا متن اصلاح حافظه معتبر نیست.',
    invalid_strategy_context: 'هدف یا جایگاه مطلوب ناقص است؛ فیلدها و موارد هر خط را بررسی کنید.',
    revision_changed: 'این استراتژی در جای دیگری تغییر کرده است؛ نسخه تازه را دریافت و دوباره ویرایش کنید.',
    idempotency_mismatch: 'شناسه این ذخیره قبلاً برای محتوای دیگری استفاده شده است.',
    strategy_permission_denied: 'فقط مالک می‌تواند هدف و جایگاه مطلوب را تغییر دهد.',
    strategy_unavailable: 'سرویس استراتژی در دسترس نیست.',
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
