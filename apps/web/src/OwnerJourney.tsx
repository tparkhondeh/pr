import { buildOwnerJourney, type JourneyStepState, type JourneyView, type OwnerJourneyInput } from './owner-journey';

const stateLabels: Record<JourneyStepState, string> = {
  complete: 'ثبت‌شده', current: 'قدم بعد', pending: 'در ادامه',
  blocked: 'نیازمند بازبینی', unknown: 'بررسی کنید', optional: 'اختیاری',
};

export function OwnerJourney(props: OwnerJourneyInput & Readonly<{ onNavigate: (view: JourneyView) => void }>) {
  const journey = buildOwnerJourney(props);
  return <section className="journey-guide" aria-labelledby="owner-journey-title">
    <div className="journey-intro">
      <div><span className="eyebrow">از تجربهٔ شما تا یک اقدام سنجیده</span>
        <h2 id="owner-journey-title">قدم بعد: {journey.next.title}</h2>
        <p>{journey.next.description}</p></div>
      <button className="primary-button" type="button" onClick={() => { props.onNavigate(journey.next.view); }}>ادامهٔ مسیر</button>
    </div>
    <ol className="journey-steps">
      {journey.steps.map((step, index) => <li key={step.id} className={`journey-step journey-step-${step.state}`}>
        <button type="button" onClick={() => { props.onNavigate(step.view); }} aria-current={journey.next.id === step.id ? 'step' : undefined}>
          <span className="journey-step-number" aria-hidden="true">{new Intl.NumberFormat('fa-IR').format(index + 1)}</span>
          <span className="journey-step-copy"><strong>{step.title}</strong><small>{stateLabels[step.state]}</small></span>
        </button>
      </li>)}
    </ol>
    <p className="journey-reassurance">وضعیت از داده‌های ثبت‌شده خوانده می‌شود؛ بازکردن یک بخش به معنی تکمیل آن نیست. انتشار خودکار خاموش است و پذیرش نهایی با شماست.</p>
  </section>;
}
