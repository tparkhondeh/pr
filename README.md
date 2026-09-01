# PR — Personal Brand & PR Operating System

این مخزن برای طراحی و توسعه یک سیستم هوشمند و ماندگار مدیریت برند شخصی، اعتبار، روایت، روابط و PR ایجاد شده است.

وضعیت فعلی: **Foundation و MVP Workbench در حال توسعه**. Data/Policy Kernel، API،
Workbench وب، Approval انسانی، ورودی مکالمه‌ای Consent-first، ورود متن به‌عنوان
Asset/Evidence، مرکز حقوق داده، داوری قطعی اختلاف میان ماژول‌ها و Proactive Mode
کنترل‌شده، نقشه خصوصی Stakeholder/Relationship و Perception Engine کیفی پیاده‌سازی شده‌اند.
Authentic Expression Gate نیز Narrative Seedهای evidence-bound، Voice Preferenceهای
قابل بازگشت و Anti-Generic Review توضیح‌پذیر را بدون مجوز انتشار ترکیب می‌کند. رادار
فرصت نیز Sourceهای Research را بدون Score پنهان، مانیتورینگ یا اقدام خودکار در برابر
Goal، Audience، Timing، Quality و Conflict می‌سنجد. Workflow Cost Gate نیز پیش از
اجرای Metered بودجه رزرو می‌کند و مصرف واقعی/اندازه‌گیری‌نشده را بدون عددسازی ثبت می‌کند.
Prompt/Model Registry نیز نسخه، Tier، Eval، Rollout، Data Class و Timeout هر مسیر مدل
را ثبت کرده و Durable Invocation Journal اجرای هر فراخوانی را فقط با Metadata و Hash
قابل‌بازیابی می‌کند. Model Input Safety نیز Credential، Prompt Injection و ورودی
غیرقابل‌اسکن را پیش از هر Side Effect متوقف می‌کند و Golden adversarial set فارسی/انگلیسی
آن در CI Release را با شرط صفر False Positive/False Negative می‌بندد. تا بستن Gateها
Provider بیرونی Fail-closed می‌ماند. Recovery Invocationهای معلق نیز فقط روی Journal
پایدار، با Evidence Hash و تأیید انسانی انجام می‌شود و هرگز Retry خودکار ندارد.
Research Source Safety نیز URLهای Local/Private/Credential-bearing، DNS rebinding،
Redirect و Response ناامن را پیش از Connector متوقف می‌کند؛ Fetch خودکار همچنان خاموش است.

## اسناد فعلی

- [ممیزی محصول و معماری](docs/architecture/product-architecture-audit-v1.0.md)
- [معماری هدف و محدوده MVP](docs/architecture/target-architecture-v1.0.md)
- [Ethics, Privacy, Risk & Brand Protection](docs/architecture/brand-protection-v1.0.md)
- [Continuous Conversation Orchestrator](docs/architecture/conversation-orchestrator-v1.0.md)
- [Inter-module Contract & Decision Arbitration](docs/architecture/intermodule-arbitration-v1.0.md)
- [Controlled Proactive Initiative](docs/architecture/proactive-initiative-v1.0.md)
- [Perception Engine](docs/architecture/perception-engine-v1.0.md)
- [Decision Context و Attention Budget نسخه‌دار](docs/architecture/decision-context-v1.0.md)
- [Strategic Quality Baseline](docs/architecture/strategic-quality-baseline-v1.0.md)
- [Strategic Outcome Follow-up](docs/architecture/strategic-outcome-followup-v1.0.md)
- [Workflow Cost & Budget Gate](docs/architecture/workflow-cost-budget-v1.0.md)
- [Prompt & Model Governance](docs/architecture/prompt-model-governance-v1.0.md)
- [Durable Model Invocation Journal](docs/architecture/model-invocation-journal-v1.0.md)
- [Model Input Safety Gate](docs/architecture/model-input-safety-v1.0.md)
- [Model Invocation Reconciliation](docs/architecture/model-invocation-reconciliation-v1.0.md)
- [Authentic Expression Gate](docs/architecture/authentic-expression-v1.0.md)
- [Authentic Execution Evaluation](docs/architecture/authentic-execution-evaluation-v1.0.md)
- [Research Layer](docs/architecture/research-layer-v1.0.md)
- [External Intelligence Evaluation](docs/architecture/external-intelligence-evaluation-v1.0.md)
- [Opportunity Radar](docs/architecture/opportunity-radar-v1.0.md)
- [Strategic Decision Contract](docs/architecture/strategic-decision-contract-v1.0.md)
- [Master Implementation Prompt مرحله Foundation](docs/implementation/foundation-master-prompt-v1.0.md)
- [ADRهای Draft مرحله Foundation](docs/decisions/foundation-adrs-draft-v1.0.md)
- [Data & Policy Kernel](docs/architecture/data-kernel-v1.0.md)
- [Operations Runbook](docs/operations/runbook-v1.0.md)
- [Threat Model و Data Flow](docs/security/threat-model-v1.0.md)
- [Dependency Policy](docs/security/dependency-policy-v1.0.md)

## محیط‌ها

- Production domain: `pr.wealthos.ir`
- Server source path: `/home/wealthos/apps/pr`
- cPanel document root: `/home/wealthos/pr.wealthos.ir`

پیکربندی Preview محافظت‌شده cPanel در [deploy/cpanel](deploy/cpanel) نگه‌داری می‌شود.
دامنه واقعی تا زمان جایگزینی Single-owner bootstrap با Session معتبر، فقط پشت Basic
Auth قابل استقرار است. Node API با PM2 روی Loopback اجرا و مسیرهای API از Document
Root به آن Proxy می‌شوند؛ حذف این Gate برای تست عمومی مجاز نیست.

Bootstrap در Production فقط bind صریح loopback را می‌پذیرد؛ بنابراین پورت داخلی
Node نباید از IP عمومی سرور قابل دسترسی باشد و تنها دامنه محافظت‌شده مسیر ورود است.

اطلاعات حساس، کلیدها و Secretها نباید وارد Git شوند.

## اجرای Foundation در لوکال

پیش‌نیاز: Node.js 22 و pnpm 10.

```bash
pnpm install
pnpm check
pnpm dev
```

`pnpm check` علاوه بر lint، typecheck و test، چهار ارزیابی نسخه‌دار
`model-input-safety-eval-v1`، `memory-retrieval-eval-v1` و
`authentic-execution-eval-v1` و `external-intelligence-eval-v1` را نیز اجرا می‌کند.
اجرای مستقل آنها:

```bash
pnpm eval:model-input-safety
pnpm eval:memory-retrieval
pnpm eval:authentic-execution
pnpm eval:external-intelligence
```

Gate حافظه با ۱۶ Case فارسی/انگلیسی، `precision@k` و `recall@k` کامل، نشت Permission
صفر و Abstention صحیح برای داده حذف‌شده، مورد اعتراض، Superseded، منقضی یا هنوز
نامعتبر را الزام می‌کند. جزئیات در
[`docs/architecture/memory-retrieval-evaluation-v1.0.md`](docs/architecture/memory-retrieval-evaluation-v1.0.md)
ثبت شده است.

Gate اجرای اصیل ۳۱ Case نسخه‌دار Claim، Platform، Authenticity و Learning را اجرا
می‌کند. پنج مسیر حمله Hallucination باید همگی قبل از Approval متوقف شوند، هر هفت
Platform باید Statement ثبت‌شده را دقیقاً حفظ کنند و هیچ Raw Asset یا Side Effect بیرونی
در Report مجاز نیست. جزئیات در
[`docs/architecture/authentic-execution-evaluation-v1.0.md`](docs/architecture/authentic-execution-evaluation-v1.0.md)
ثبت شده است.

Gate اطلاعات بیرونی ۳۰ Case نسخه‌دار دارد: ۱۵ حمله SSRF/DNS rebinding، چهار Payload
ناامن و پنج سناریوی Citation/Freshness/Conflict را با Auto-verify، Fetch خودکار،
Public Action، Memory write و Raw response leakage صفر الزام می‌کند. جزئیات در
[`docs/architecture/external-intelligence-evaluation-v1.0.md`](docs/architecture/external-intelligence-evaluation-v1.0.md)
ثبت شده است.

Health endpoint پس از اجرا: `GET /health`

## اجرای Workbench وب

```bash
pnpm web:dev
```

Workbench فعلی قرارداد `strategic-decision-v1` را نمایش می‌دهد: Goal، Action شامل
عدم اقدام، Attention Budget پنج‌بعدی و مالک‌محور، Evidence، Risk و Approval انسانی. هر Action
Why/What/For Whom/When/Format، Assumption، Uncertainty، Decision Window، برنامه سنجش،
Utility و Opportunity Cost قابل مشاهده دارد. Platform قبل از انتخاب Action وارد تصمیم
نمی‌شود و Recommendation هیچ Execution/Public Approval ایجاد نمی‌کند. تا وقتی هیچ Evidence با رضایت
صریح `brandUsage` وجود ندارد، سیستم از پیشنهاد بیرونی خودداری می‌کند و فقط مسیرهای
ورود منبع، گفت‌وگوی Evidence-first و «عدم اقدام» را نشان می‌دهد؛ تعداد شاهد نمایشی یا
Seedشده به کاربر ارائه نمی‌شود. View از `GET /api/workbench` داده می‌گیرد و تأیید را
با `POST /api/workbench/approval` ثبت می‌کند. Store فعلی
بدون تنظیم دیتابیس حافظه‌ای است و با Restart پاک می‌شود. با تنظیم هم‌زمان
`DATABASE_URL`، `PR_TENANT_ID` و `PR_OWNER_USER_ID`، تأیید با Optimistic Lock در
PostgreSQL ذخیره و در همان Transaction به Audit Log و Outbox افزوده می‌شود.
نسخه خصوصی Sites همین قرارداد را با state موقت Worker برای تست UI ارائه می‌کند.
جزئیات در
[`docs/architecture/strategic-decision-contract-v1.0.md`](docs/architecture/strategic-decision-contract-v1.0.md)
ثبت شده است.

اجرای `NODE_ENV=production` بدون PostgreSQL به‌صورت پیش‌فرض متوقف می‌شود. فقط Preview
خصوصی و disposable می‌تواند با opt-in صریح `PR_ALLOW_EPHEMERAL_PRODUCTION=true`
بالا بیاید؛ endpoint `GET /ready` نیز حالت مؤثر `persistence` و `durability` را اعلام
می‌کند تا حافظه موقت با ذخیره پایدار اشتباه گرفته نشود. با اتصال PostgreSQL، این
Override باید حذف شود.

Job مستقل `postgres-integration` در CI تمام migrationها را روی PostgreSQL 16 واقعی
اعمال می‌کند، RLS و deny شدن read/write بین دو tenant را می‌آزماید و یک logical
dump/restore را در دیتابیس تازه verify می‌کند. این drill جایگزین backup/PITR محیط
Production نیست، اما قابلیت اعمال و بازیابی Schema را قبل از Provision سرور اثبات
می‌کند.

Runtime اتصال دیتابیس را فقط زمانی ready اعلام می‌کند که principal آن superuser یا
دارای `BYPASSRLS` نباشد، `row_security=on` باشد، روی Database/Schema عمومی مجوز
`CREATE` نداشته باشد و migration journal به آخرین نسخه Schema رسیده باشد. فرمان
`pnpm db:commission` با credential مهاجرت جدا، Migration، Grant حداقلی، Seed هویت
مالک و verification نهایی RLS را اجرا می‌کند. Host غیر-loopback بدون
`sslmode=verify-full` رد می‌شود و credential مهاجرت نباید در Runtime باقی بماند.

نمای «شروع و منابع» مسیر Cold Start محدود MVP را ارائه می‌کند. مالک از
`POST /api/assets/text` عنوان، متن، تاریخ و برداشت پیشنهادی خود را همراه رضایت صریح
وارد می‌کند. متن همیشه `confidential` است، مجوز عمومی نمی‌گیرد و در PostgreSQL،
Asset، Evidence، Assertion، Consent، Audit، Outbox و رکورد idempotency در یک
Transaction ساخته می‌شوند. `GET /api/onboarding` منابع و بلوغ مدل را از شواهد واقعی،
Self-reportهای فعال، تنوع منبع و اعمال حقوق داده محاسبه می‌کند؛ عدد نمایشی ثابت در UI
استفاده نمی‌شود. بلوغ شخصی مستقل از مجوز تحلیل برند است و فیلد
`strategyReadiness` دقیقاً مشخص می‌کند چند شاهد برای توصیه استراتژیک مجاز یا withheld
است. Store محلی و Sites در نبود PostgreSQL با Restart پاک می‌شوند.

مالک برای هر Text Asset از مسیر `POST /api/assets/text/:id/rights` می‌تواند مجوز
`brandUsage` را مستقل لغو یا خود منبع را حذف کند. لغو، Consent تحلیل برند را revoke
و منبع را بی‌درنگ از Recommendation و Draft Sources خارج می‌کند؛ حذف، Asset، Evidence
و Assertion فعال را soft-delete، Snapshot ذخیره‌شده را redacted و همه Consentها را
revoke می‌کند. درخواست‌ها idempotent، tenant-isolated و همراه Audit/Outbox هستند و
تعداد اعمال حقوق داده در بلوغ مدل شخصی منعکس می‌شود.

دکمه «شروع گفت‌وگو» به `POST /api/conversations/turns` و Orchestrator نسخه‌دار متصل
است. پاسخ Intent، Confidence، Route، Provenance، Read/Write Authority، Arbitration،
نیاز به تأیید و Retention را آشکار می‌کند. بدون Opt-in معتبر حافظه، متن خام Turn در
Store ثبت نمی‌شود؛ اگر نشانه credential یا داده حساس دیده شود، متن خام حتی با Opt-in
ذخیره یا به Memory Proposal تبدیل نمی‌شود. Research بیرونی نیز حتی با Opt-in حافظه از
Personal Memory جدا می‌ماند. Prompt Injection ورودی غیرقابل‌اعتماد است و نمی‌تواند
Policy یا Permission را تغییر دهد.

Opt-in ساخت پیشنهاد حافظه پیش‌فرض خاموش است و حتی پس از فعال‌کردن، ثبت نهایی فقط با
درخواست دوم `POST /api/memory/proposals/:id/confirm` انجام می‌شود. خروجی Proposal
همیشه `self_report` و `confidential` است و مجوز Brand/Public به‌طور خودکار داده
نمی‌شود. با PostgreSQL، Turn و Snapshot قرارداد `conversation-orchestrator-v1` ذخیره
می‌شوند و Proposal/Confirmation همراه Evidence، Assertion، Consent، Audit و Outbox
در Transactionهای کنترل‌شده ثبت می‌شوند؛ Store بدون دیتابیس موقت است.

پس از تأیید نیز کاربر از مسیر
`POST /api/memory/proposals/:id/rights` می‌تواند حافظه را اصلاح، Contest، حذف یا
مجوز استفاده را لغو کند. هر درخواست شناسه idempotency مستقل دارد. اصلاح، نسخه قبلی
را حفظ و Assertion جدید می‌سازد؛ حذف، Assertion/Evidence را soft-delete و Consentهای
وابسته را revoke می‌کند و تمام عملیات در Audit/Outbox قابل‌ردیابی‌اند.

نمای «حافظه من» از `GET /api/memory` تغذیه می‌شود و برای هر Assertion فعال، متن
جاری، Epistemic Type، Data Class، Confidence، Provenance، تعداد Revision و Consent
فعال را نشان می‌دهد. رکوردهای Contest/Revoke/Delete پنهان نمی‌شوند، اما محتوای
رکورد حذف‌شده و Evidence حذف‌شده هرگز در Snapshot API بازگردانده نمی‌شود.

نمای «استراتژی» Goal و Desired Positioning مالک را از `GET /api/strategy` می‌خواند
و با `PUT /api/strategy` به‌صورت نسخه‌دار و idempotent ذخیره می‌کند. تغییر شامل هدف،
نتیجه، معیارهای موفقیت، افق، مخاطب، ادراک مطلوب، تمایز و نقاط اثبات است. در PostgreSQL
هر نسخه جدید Goal و Positioning را حفظ می‌کند، Pointer جاری را با Optimistic Lock
جابه‌جا می‌کند و Audit/Outbox را در همان Transaction می‌نویسد. همچنین Approval قبلی
Workbench منقضی می‌شود تا تصمیم مبتنی بر جهت قدیمی بی‌صدا معتبر باقی نماند.

نمای «داوری تصمیم» از `GET /api/arbitration` و
`POST /api/arbitration/cases` استفاده می‌کند تا رأی مستقل Strategy، Permission،
Claim، Risk و Authenticity را درباره یک Action کنار هم نگه دارد. هیچ رأی یا Agentی
نمی‌تواند Gate الزام‌آور ماژول دیگر را Override کند: `hold` مقدم است، `revise` سطح
مؤثر را حداکثر تا Draft کاهش می‌دهد و Dissent/Abstention در خروجی باقی می‌ماند.
قرارداد همه سطوح Autonomy از Observe تا Bounded Automation را می‌پذیرد، اما MVP هر
درخواست بالاتر را به Level 5 محدود و همیشه `executionPermitted=false` اعلام می‌کند؛
بنابراین این لایه فقط Decision Support و درخواست تأیید انسانی است. Caseها با Snapshot
و Context Hash به Strategy، Risk و Claim متصل‌اند و پس از تغییر Context یا ۲۴ ساعت
stale می‌شوند. در PostgreSQL رکوردها append-only، tenant-isolated، idempotent و همراه
Audit/Outbox هستند؛ Memory و Sites همان قرارداد را با State موقت اجرا می‌کنند.

نمای «ابتکار عمل» قرارداد `initiative-policy-v1` را برای Reactive/Proactive Mode
اجرا می‌کند. پیش‌فرض Reactive است و فقط مالک می‌تواند Mode، حداقل Relevance، سقف یک
تا سه Cue در پنجره شناور ۲۴ساعته و Pause را تغییر دهد. Candidate فعلی فقط از Evidence
gap، Action مستند و Decision Arbitration stale ساخته می‌شود؛ External Monitoring در
این MVP وجود ندارد. هر ارزیابی—چه نمایش‌داده‌شده و چه متوقف‌شده—با Context Hash، علت،
Confidence و Source Ref در Ledger ثبت می‌شود. تغییر Context رکورد قبلی را stale می‌کند
و Rate Limit در PostgreSQL به‌صورت Transactional اعمال می‌شود. APIها شامل
`GET /api/initiative`، `PUT /api/initiative/settings` و
`POST /api/initiative/evaluations` هستند. این ماژول فقط Cue اختیاری در Interface
نمایش می‌دهد و هیچ Push Notification، Publish یا Action بیرونی اجرا نمی‌کند.

نمای «روابط» قرارداد `relationship-intelligence-v1` را برای نقشه‌ی خصوصی Stakeholder
اجرا می‌کند. مالک فقط یک نام یا برچسب خصوصی، گروه، Outcome، Priority، Strength،
Boundary، Context و تاریخ اختیاری آخرین تعامل را با رضایت صریح ثبت می‌کند. سیستم هیچ
شماره تماس یا ایمیل ذخیره نمی‌کند، Score پنهان نمی‌سازد و تماس، پیام یا Introduction
خودکار ندارد. Recency فقط به دسته‌های توضیح‌پذیر تبدیل می‌شود و برای رابطه پر‌اولویت
حداکثر مرور Context پیشنهاد می‌شود؛ `ask_before_prompt` نیاز به تأیید را حفظ و
`do_not_prompt` هر Cue را خاموش می‌کند. ایجاد و Hard Delete در PostgreSQL idempotent،
RLS-protected و همراه Audit/Outbox هستند. APIهای این Slice شامل
`GET /api/relationships`، `POST /api/relationships/stakeholders` و
`POST /api/relationships/stakeholders/:id/delete` است. جزئیات در
[`docs/architecture/relationship-intelligence-v1.0.md`](docs/architecture/relationship-intelligence-v1.0.md)
ثبت شده است.

نمای «ادراک» قرارداد `perception-engine-v1` را اجرا می‌کند. مالک Signalها را در سه
lane مستقل Self Perception، Desired Positioning و External Perception ثبت می‌کند؛
هر Signal یک بُعد، Stage کیفی، Confidence، Evidence Note و تاریخ مشاهده دارد. نظر
دیگران همیشه `external_perception` باقی می‌ماند و Fact نمی‌شود. تحلیل قطعی فقط Range
Signalهای بیرونی، Gap کیفی و Blind Spot احتمالی را نشان می‌دهد؛ اختلاف‌ها حفظ می‌شوند
و نبود Evidence با «داده ناکافی» پاسخ داده می‌شود. Source Identity، Contact، نقل‌قول
خصوصی، Social Listening، 360 Interview و اقدام بیرونی در این Slice وجود ندارند. ایجاد
و Hard Delete، idempotent، RLS-protected و با Audit حداقلی هستند. APIها شامل
`GET /api/perception`، `POST /api/perception/signals` و
`POST /api/perception/signals/:id/delete` هستند. جزئیات در
[`docs/architecture/perception-engine-v1.0.md`](docs/architecture/perception-engine-v1.0.md)
ثبت شده است.

نمای «روایت و Voice» قرارداد `authentic-expression-v1` را اجرا می‌کند. هر Text Asset
دارای `brandUsage` فقط یک Narrative Seed تک‌منبعی و candidate می‌سازد؛ Seed به Brand
Fact یا Core Narrative ارتقا داده نمی‌شود. Voice Model فقط Preferenceهای پیشنهادشده
یا تأییدشدهٔ Feedback Engine را نشان می‌دهد و Proposal خودکار اعمال نمی‌شود. کاربر
می‌تواند متن و حداکثر پنج Asset مجاز را به Gate بدهد تا Grounding، Personal
Specificity، Generic AI Language و Voice Alignment جداگانه بررسی شوند. نتیجه
`pass/revise/block` توضیح‌پذیر است، اما Fact Check، Claim Approval، Publish Approval یا
External Action نیست. APIهای این Slice شامل `GET /api/expression` و
`POST /api/expression/review` هستند. جزئیات در
[`docs/architecture/authentic-expression-v1.0.md`](docs/architecture/authentic-expression-v1.0.md)
ثبت شده است.

نمای «پیش‌نویس» تنها پس از تأیید Action محتوایی Workbench فعال می‌شود. کاربر یک
منبع را از کاتالوگ owner-scoped حافظه‌های تأییدشده و Text Assetهای دارای مجوز
`brandUsage` انتخاب می‌کند، برای Public Drafting همان Assertion و Channel رضایت صریح
می‌دهد و Mother Idea را برای یکی از پلتفرم‌های LinkedIn، Instagram، X، YouTube،
Podcast، Newsletter یا Blog می‌سازد. Evidenceهای هر Action در لحظه Approval فریز
می‌شوند؛ بنابراین منبعی که بعداً اضافه شده—even با مجوز برند—بدون تأیید تازه وارد
Draft قبلی نمی‌شود. خروجی با Claim، نوع منبع و Evidence دقیق قابل‌ردیابی است؛ ویرایش،
Approval قبلی Draft را باطل و Guard ادعا/فرمت را دوباره اجرا می‌کند و Export فقط برای
نسخه سبز و تأییدشده مجاز است. تغییر Strategy یا Contest/Revoke/Delete منبع، Approval
و Export را متوقف می‌کند. API این جریان از `GET /api/drafts/sources`،
`GET /api/drafts/current`، `POST /api/drafts`، `PUT /api/drafts/:id`،
`POST /api/drafts/:id/approve` و `POST /api/drafts/:id/export` تشکیل شده است. انتشار
مستقیم در این مرحله عمداً وجود ندارد و Export فایل متنی آخرین Human-in-the-Loop است.

Platform Adaptation در نسخه `platform-adaptation-v1` برای هر هفت کانال یک قرارداد
مجزای Audience Context، Format، بازه طول پیشنهادی، سقف قطعی طول، Visual Language،
Interaction Model و عناصر الزامی دارد. Newsletter و Blog دیگر قالب مشترک ندارند و
نسخه X با حفظ عین Claim مستند، زاویه و برداشت را تا سقف ۲۸۰ نویسه Fit می‌کند. نسخه
قرارداد همراه Draft در PostgreSQL ذخیره می‌شود؛ API آن را در `adaptation` توضیح می‌دهد
و UI «Platform Brief» را کنار Traceability نشان می‌دهد. هر Edit دوباره عناصر الزامی
و سقف کانال را بررسی می‌کند. جزئیات قرارداد در
[`docs/architecture/platform-adaptation-v1.0.md`](docs/architecture/platform-adaptation-v1.0.md)
ثبت شده است.

نمای «تحقیق بیرونی» Personal Memory را از External Research جدا نگه می‌دارد. مالک در
MVP منبع HTTPS، ناشر، تاریخ، Excerpt، Claim مورد بررسی، رابطه Supports/Contradicts،
Quality و پنجره Freshness را ثبت می‌کند. سیستم Citation قابل‌حمل می‌سازد، منبع کهنه
یا Unverified را برای Review نگه می‌دارد و وجود هر دو رابطه برای Claim یکسان را به‌عنوان
Conflict باز نشان می‌دهد. ثبت منبع هرگز Claim را خودکار Verified نمی‌کند؛ در PostgreSQL
یک `external_fact` با وضعیت `proposed`، Evidence و رابطه Claim/Evidence ساخته می‌شود.
داده Research در `app.research_sources` و APIهای `GET /api/research` و
`POST /api/research/sources` جدا از حافظه شخصی است. Policy نسخه‌دار
`research-source-safety-v1` URL خصوصی/محلی، Credential/Token Query، پورت سفارشی و
مرزهای DNS/Redirect/Response را Fail-closed تعریف می‌کند. Fetch خودکار وب در این نسخه
وجود ندارد و Adapter آینده در
[`docs/architecture/research-layer-v1.0.md`](docs/architecture/research-layer-v1.0.md)
تعریف شده است.

نمای «رادار فرصت» قرارداد `opportunity-radar-v1` را اجرا می‌کند. Trend یا محبوبیت
به‌تنهایی Opportunity نیست؛ هر Source ثبت‌شده در Research با Strategy جاری و عوامل
مستقل Goal، Audience/Positioning، Timing/Freshness، Quality و Conflict سنجیده می‌شود.
خروجی فقط `ignore`، `monitor`، `explore` یا `consider` است و هیچ Average/Score پنهان
ساخته نمی‌شود. برای کاهش Filter Bubble، در هر Snapshot حداکثر یک Source تازه و معتبر
با Alignment اثبات‌نشده وارد Exploration می‌شود. حتی `consider` فقط ورودی Strategy
Review است و Action Recommendation، Public Approval یا External Action ایجاد نمی‌کند.
Fetch و Monitoring بیرونی در این Slice وجود ندارد. API این نمای owner-only برابر
`GET /api/opportunities` است و جزئیات در
[`docs/architecture/opportunity-radar-v1.0.md`](docs/architecture/opportunity-radar-v1.0.md)
ثبت شده است.

نمای «دفتر ادعاها» Claimهای ساخته‌شده از Draft و Research را با Statement دقیق، Evidence،
Source Ref، Purpose، Channel، دسته حساس و Trace Status نشان می‌دهد. Citation-ready هیچ Claimی
را خودکار Verified نمی‌کند؛ تصمیم `verify` فقط با Human Attestation و Rationale ثبت می‌شود و
`dispute` یا `revoke` مسیر Edit/Approval/Export Draft متصل را Fail-closed متوقف می‌کند. Reviewها
در `app.claim_reviews` به‌صورت append-only، idempotent، tenant-isolated و همراه Audit/Outbox
ثبت می‌شوند. APIهای این بخش `GET /api/claims` و `POST /api/claims/:id/reviews` هستند. جزئیات
در [`docs/architecture/claim-governance-v1.0.md`](docs/architecture/claim-governance-v1.0.md)
ثبت شده است.

هر ذخیره ویرایش Draft به Feedback Engine متصل است. سیستم فقط تغییرهای مادی و
توضیح‌پذیر مانند کوتاه‌کردن متن/تیتر، کاهش میان‌تیتر یا حذف پرسش پایانی را به‌عنوان
Signal ثبت می‌کند. یک Edit یا Reject منفرد Voice Model را تغییر نمی‌دهد؛ پس از دست‌کم
سه Signal هم‌جهت، یک Preference Proposal همراه Evidence و Confidence ساخته می‌شود.
کاربر از نمای «یادگیری» می‌تواند Proposal را Apply یا Reject کند و هر Preference
اعمال‌شده را بعداً Revoke کند. Preference اعمال‌شده در Draft بعدی Adaptation را جهت
می‌دهد، اما Guard ادعا و تأیید انسانی را دور نمی‌زند. مسیرهای این بخش
`GET /api/feedback`، `POST /api/feedback/drafts/:id/reject` و
`POST /api/feedback/preferences/:id/decision` هستند.

نمای «یادگیری» یک Strategic Quality Gate مستقل نیز دارد. Rubric خودکار، قرارداد تصمیم،
Attention Budget پنج‌بعدی، Human Gate، مسیر No-action، Grounding/Abstention و اتصال به
نسخه Strategy و Decision Context را می‌سنجد. بازبینی مالک با امتیازهای Usefulness، Trust
و Friction در `app.strategic_recommendation_reviews` به‌صورت append-only و RLS-protected
ثبت می‌شود. پذیرش فقط برای Action تأییدشده معتبر است و تا پنج نمونه واقعی، اعداد صرفاً
مشاهده موقت‌اند و `baselineMetrics` عمداً `null` می‌ماند. APIهای این بخش
`GET /api/strategic-quality` و `POST /api/strategic-quality/reviews` هستند.

همین نما قرارداد `strategic-outcome-followup-v1` را برای نتیجه واقعی Action پذیرفته‌شده
اجرا می‌کند. مالک وضعیت اجرا، رضایت، پشیمانی، انرژی، کیفیت/عمق تعامل، فرصت، تغییر رابطه
و ادراک و Outcome کسب‌وکار را از `POST /api/strategic-quality/outcomes` ثبت می‌کند.
Review ردشده یا superseded پذیرفته نمی‌شود، هر اصلاح append-only است و تا پنج Follow-up
واقعی `outcomeBaseline.baselineMetrics` خالی می‌ماند. Like و View به‌تنهایی Metric موفقیت
نیستند و این داده هیچ تغییر خودکار Identity، Strategy یا اقدام بیرونی ایجاد نمی‌کند.

همین نما وضعیت `workflow-cost-budget-v1` را نیز نشان می‌دهد. هر اجرای Metered باید
پیش از شروع از `POST /api/workflow-cost/reservations` ظرفیت بگیرد و پس از پایان در
`POST /api/workflow-cost/charges` هزینهٔ Model، Embedding، Storage، Search، Tool/API،
Compute و زمان Human Review را تسویه کند. عبور از سقف Invocation، Workflow، روز یا
تعداد گام Circuit را باز می‌کند. `GET /api/workflow-cost` فقط Usage دارای Evidence را
گزارش می‌کند؛ مبلغ نامعلوم صفرِ `unmetered` است و «رایگان» تفسیر نمی‌شود.

`GET /api/model-governance` وضعیت `prompt-model-governance-v1` را نشان می‌دهد.
هر Route بر Purpose و Schema دقیق Resolve می‌شود و فقط با Rollout فعال، Eval پاس‌شده،
Schema Validator، Data Class مجاز، رضایت صریح پردازش بیرونی و Reservation موفق اجازهٔ
فراخوانی دارد. Timeout و Provider failure با مبلغ `unmetered` تسویه می‌شوند تا Reservation
معلق نماند و سیستم هزینه‌ای جعل نکند. `model-invocation-journal-v1` اکنون Adapterهای
Memory/PostgreSQL، RLS، Idempotency و وضعیت Recovery دارد و فقط Hash/Metadata را نگه
می‌دارد. چون Production هنوز PostgreSQL امن و Provider واقعی ندارد، Journal روی دامنه
Memory و اجرای بیرونی خاموش است؛ بنابراین هیچ دادهٔ شخصی از این مسیر به بیرون ارسال نمی‌شود.
پیش از Journal نیز `model-input-safety-v1` ورودی را با سقف قطعی و Ruleهای Credential،
Prompt Injection و Payload opaque اسکن می‌کند. Deny هیچ Reservation یا Provider call
نمی‌سازد و API فقط Policy/Count/Finding/Hash را بدون متن خام نمایش می‌دهد.

`model-invocation-reconciliation-v1` اجرای `started` باقی‌مانده پس از Crash را فقط با
PostgreSQL پایدار و تصمیم مالک می‌بندد. `not_executed` Reservation را بدون جعل هزینه
تسویه می‌کند و `billed_output_unavailable` Usage گزارش‌شده Provider را بدون جعل Output
ثبت می‌کند. API آن `POST /api/model-governance/reconciliations` است؛ Raw Evidence ذخیره
نمی‌شود و Retry خودکار همیشه ممنوع است.

نمای «داده و شفافیت» ردپای owner-scoped تصمیم‌ها، تأییدها، حقوق حافظه و Exportها را
از `GET /api/account/activity` نمایش می‌دهد. کاربر از `GET /api/account/export` یک
فایل JSON قابل‌حمل از Snapshot فعلی Workbench، Strategy، Memory، Assets، Draft،
Feedback، Strategic Quality، Workflow Cost، Model Governance، Arbitration، Initiative، Relationships و Audit دریافت می‌کند. Export نیز Audit می‌شود؛ متن حافظه حذف‌شده، Secret و داده
زیرساختی وارد فایل نمی‌شوند. در PostgreSQL این Timeline با RLS به Tenant و مالک فعال
محدود است؛ نسخه‌های حافظه‌ای و Sites تا Restart موقت‌اند.
