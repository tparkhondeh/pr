# PR — Personal Brand & PR Operating System

این مخزن برای طراحی و توسعه یک سیستم هوشمند و ماندگار مدیریت برند شخصی، اعتبار، روایت، روابط و PR ایجاد شده است.

وضعیت فعلی: **Foundation و MVP Workbench در حال توسعه**. Data/Policy Kernel، API،
Workbench وب، Approval انسانی، ورودی مکالمه‌ای Consent-first، ورود متن به‌عنوان
Asset/Evidence، مرکز حقوق داده و داوری قطعی اختلاف میان ماژول‌ها پیاده‌سازی شده‌اند.

## اسناد فعلی

- [ممیزی محصول و معماری](docs/architecture/product-architecture-audit-v1.0.md)
- [معماری هدف و محدوده MVP](docs/architecture/target-architecture-v1.0.md)
- [Ethics, Privacy, Risk & Brand Protection](docs/architecture/brand-protection-v1.0.md)
- [Continuous Conversation Orchestrator](docs/architecture/conversation-orchestrator-v1.0.md)
- [Inter-module Contract & Decision Arbitration](docs/architecture/intermodule-arbitration-v1.0.md)
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

Health endpoint پس از اجرا: `GET /health`

## اجرای Workbench وب

```bash
pnpm web:dev
```

Workbench فعلی حلقه تصمیم MVP را نمایش می‌دهد: Goal، Action شامل عدم اقدام،
Attention Budget، Evidence، Risk و Approval انسانی. تا وقتی هیچ Evidence با رضایت
صریح `brandUsage` وجود ندارد، سیستم از پیشنهاد بیرونی خودداری می‌کند و فقط مسیرهای
ورود منبع، گفت‌وگوی Evidence-first و «عدم اقدام» را نشان می‌دهد؛ تعداد شاهد نمایشی یا
Seedشده به کاربر ارائه نمی‌شود. View از `GET /api/workbench` داده می‌گیرد و تأیید را
با `POST /api/workbench/approval` ثبت می‌کند. Store فعلی
بدون تنظیم دیتابیس حافظه‌ای است و با Restart پاک می‌شود. با تنظیم هم‌زمان
`DATABASE_URL`، `PR_TENANT_ID` و `PR_OWNER_USER_ID`، تأیید با Optimistic Lock در
PostgreSQL ذخیره و در همان Transaction به Audit Log و Outbox افزوده می‌شود.
نسخه خصوصی Sites همین قرارداد را با state موقت Worker برای تست UI ارائه می‌کند.

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
دارای `BYPASSRLS` نباشد، `row_security=on` باشد و migration journal به آخرین نسخه
Schema رسیده باشد. credential مهاجرت باید جدا از `DATABASE_URL` Runtime نگه‌داری شود.

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
`POST /api/research/sources` جدا از حافظه شخصی است. Fetch خودکار وب در این نسخه وجود
ندارد و Adapter آینده در
[`docs/architecture/research-layer-v1.0.md`](docs/architecture/research-layer-v1.0.md)
تعریف شده است.

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

نمای «داده و شفافیت» ردپای owner-scoped تصمیم‌ها، تأییدها، حقوق حافظه و Exportها را
از `GET /api/account/activity` نمایش می‌دهد. کاربر از `GET /api/account/export` یک
فایل JSON قابل‌حمل از Snapshot فعلی Workbench، Strategy، Memory، Assets، Draft،
Feedback، Arbitration و Audit دریافت می‌کند. Export نیز Audit می‌شود؛ متن حافظه حذف‌شده، Secret و داده
زیرساختی وارد فایل نمی‌شوند. در PostgreSQL این Timeline با RLS به Tenant و مالک فعال
محدود است؛ نسخه‌های حافظه‌ای و Sites تا Restart موقت‌اند.
