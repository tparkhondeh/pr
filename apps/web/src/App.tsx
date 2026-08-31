import {
  ArrowUpLeft,
  BookOpenText,
  Check,
  ChevronLeft,
  CircleGauge,
  Clock3,
  FileCheck2,
  Fingerprint,
  Lightbulb,
  MessageCircleMore,
  Network,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';

type Action = {
  id: string;
  label: string;
  kind: string;
  rationale: string;
  attention: string;
  confidence: string;
  risk: 'کم' | 'متوسط';
  score: number;
};

const actions: Action[] = [
  {
    id: 'conversation',
    label: 'گفت‌وگوی خصوصی با یک همکار قدیمی',
    kind: 'رابطه',
    rationale: 'برای هدف اعتمادسازی، یک تعامل عمیق از چند انتشار عمومی ارزشمندتر است.',
    attention: '۳۰ دقیقه',
    confidence: '۸۴٪',
    risk: 'کم',
    score: 92,
  },
  {
    id: 'essay',
    label: 'یادداشت تحلیلی درباره تصمیم‌گیری در ابهام',
    kind: 'محتوا',
    rationale: 'سه تجربه ثبت‌شده، پایه یک روایت اصیل و قابل‌ردیابی را فراهم می‌کنند.',
    attention: '۱۲۰ دقیقه',
    confidence: '۷۸٪',
    risk: 'متوسط',
    score: 81,
  },
  {
    id: 'wait',
    label: 'فعلاً اقدام نکن',
    kind: 'سکوت آگاهانه',
    rationale: 'اگر انرژی امروز پایین است، حفظ کیفیت برند از پرکردن تقویم مهم‌تر است.',
    attention: '۰ دقیقه',
    confidence: '۷۱٪',
    risk: 'کم',
    score: 68,
  },
];

const nav = [
  { label: 'امروز', icon: CircleGauge, active: true },
  { label: 'حافظه من', icon: Fingerprint },
  { label: 'استراتژی', icon: Lightbulb },
  { label: 'روابط', icon: Network },
  { label: 'تأییدها', icon: FileCheck2, badge: '۲' },
];

export function App() {
  const [selected, setSelected] = useState(actions[0]?.id ?? '');
  const [approved, setApproved] = useState(false);
  const selectedAction = actions.find((action) => action.id === selected);

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand-mark"><span>PR</span><i /></div>
        <nav aria-label="ناوبری اصلی">
          {nav.map(({ label, icon: Icon, active, badge }) => (
            <button className={active ? 'nav-item active' : 'nav-item'} key={label} type="button">
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
              {badge ? <b>{badge}</b> : null}
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <div className="maturity"><span>بلوغ مدل شخصی</span><strong>۳۲٪</strong></div>
          <div className="progress"><i /></div>
          <small>۱۲ شاهد معتبر · ۳ تناقض باز</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <span className="date">دوشنبه، ۹ شهریور</span>
            <h1>حرکت بعدی، نه پست بعدی.</h1>
          </div>
          <div className="top-actions">
            <span className="system-state"><i /> سیستم آماده است</span>
            <button className="avatar" type="button" aria-label="پروفایل کاربر">TP</button>
          </div>
        </header>

        <section className="conversation" aria-label="گفت‌وگوی روز">
          <div className="assistant-sign"><Sparkles size={18} /></div>
          <div>
            <p className="overline">گفت‌وگوی پیوسته</p>
            <h2>امروز چه چیزی ذهنت را درگیر کرده؟</h2>
            <p>می‌توانی یک اتفاق، تصمیم، رابطه یا حتی تردید را تعریف کنی. لازم نیست از قبل بدانی به محتوا تبدیل می‌شود یا نه.</p>
            <button type="button" className="talk"><MessageCircleMore size={18} /> شروع گفت‌وگو <ArrowUpLeft size={17} /></button>
          </div>
        </section>

        <section className="decision-head">
          <div>
            <p className="overline">پیشنهاد استراتژیک امروز</p>
            <h2>برای نزدیک‌شدن به جایگاه «مشاور قابل‌اعتماد»</h2>
          </div>
          <div className="budget"><Clock3 size={18} /><span>بودجه توجه امروز</span><strong>۲.۵ ساعت</strong></div>
        </section>

        <div className="workspace">
          <section className="options" aria-label="گزینه‌های اقدام">
            {actions.map((action, index) => (
              <button
                className={selected === action.id ? 'option selected' : 'option'}
                key={action.id}
                onClick={() => { setSelected(action.id); setApproved(false); }}
                type="button"
              >
                <span className="rank">۰{index + 1}</span>
                <span className="option-main">
                  <span className="kind">{action.kind}</span>
                  <strong>{action.label}</strong>
                  <small>{action.rationale}</small>
                </span>
                <span className="metrics">
                  <span><b>{action.score}</b> امتیاز</span>
                  <span>{action.attention}</span>
                  <span className={action.risk === 'کم' ? 'risk low' : 'risk'}>ریسک {action.risk}</span>
                </span>
                <span className="radio">{selected === action.id ? <Check size={15} /> : null}</span>
              </button>
            ))}
          </section>

          <aside className="evidence-card">
            <div className="evidence-title"><ShieldCheck size={20} /><span>چرا این پیشنهاد؟</span></div>
            <p>{selectedAction?.rationale}</p>
            <ul>
              <li><BookOpenText size={16} /><span><b>۳ تجربه</b> از تصمیم‌های مشابه</span></li>
              <li><Fingerprint size={16} /><span><b>ارزش محوری:</b> صداقت در ابهام</span></li>
              <li><Network size={16} /><span><b>ذی‌نفع:</b> همکاران ارشد صنعت</span></li>
            </ul>
            <button className="trace" type="button">مشاهده شواهد و فرضیات <ChevronLeft size={16} /></button>
            <div className="approval-zone">
              <div><span>اطمینان سیستم</span><strong>{selectedAction?.confidence}</strong></div>
              <button
                className={approved ? 'approve done' : 'approve'}
                type="button"
                onClick={() => setApproved(true)}
              >
                {approved ? <><Check size={18} /> برای اجرا تأیید شد</> : 'انتخاب و آماده‌سازی اقدام'}
              </button>
              <small>هیچ اقدامی بدون تأیید تو اجرا نمی‌شود.</small>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

