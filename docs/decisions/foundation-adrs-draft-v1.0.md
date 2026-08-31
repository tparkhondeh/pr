# Foundation ADRs — Draft v1.0

تاریخ: ۱۴۰۵/۰۶/۰۹  
وضعیت کلی: Draft؛ تصمیم‌های قابل‌بازگشت برای ادامه Discovery تثبیت شده‌اند، تصمیم‌های دارای هزینه/ریسک خارجی نیازمند تأیید مالک محصول هستند.

## ADR-001 — Product Wedge

**تصمیم موقت:** Persona اولیه Founder/Executive فارسی‌زبان است. Outcome سی‌روزه: تبدیل شواهد و دارایی‌های محدود به مدل شخصی قابل اصلاح و پیشنهاد هفتگی چند اقدام PR توضیح‌پذیر.

**چرا:** این wedge تفاوت محصول را بدون نیاز به Social Listening یا Auto-publish اثبات می‌کند.

**نیازمند تأیید:** بازار جغرافیایی و صنعت اولیه.

## ADR-002 — Runtime و زبان

**تصمیم پیشنهادی:** TypeScript روی Node.js 22 برای Modular Monolith، API، workflow و UI؛ Python فقط پشت Worker/Service contract در صورت نیاز اثبات‌شده به کتابخانه تخصصی AI/data.

**چرا:** سرور فعلی Node.js `v22.23.2` و PM2 دارد؛ یک زبان اصلی پیچیدگی Foundation را کاهش می‌دهد. Python سیستم سرور `3.6.8` و برای stack مدرن نامناسب است، مگر runtime ایزوله ساخته شود.

**گزینه فنی اولیه:** pnpm workspace، TypeScript strict، API contract-first. انتخاب framework در ADR تکمیلی پس از spike کوچک benchmark می‌شود.

## ADR-003 — Tenancy و Isolation

**تصمیم:** معماری از روز اول multi-tenant است. `tenant_id` در تمام aggregateهای متعلق به کاربر اجباری؛ PostgreSQL RLS به‌همراه application guard و test منفی cross-tenant.

**قاعده:** MVP ممکن است یک tenant فعال داشته باشد، ولی schema تک‌کاربره ساخته نمی‌شود.

## ADR-004 — Consent و Purpose Taxonomy

**تصمیم:** deny-by-default. Permission tuple حداقل شامل `purpose + operation + data class + audience + channel + expiry` است.

Purposeهای اولیه:

- `personal_understanding`
- `strategy_reasoning`
- `brand_usage`
- `public_drafting`
- `external_research`
- `external_sharing`

دانستن یک داده به هیچ‌کدام از Purposeهای بعدی مجوز ضمنی نمی‌دهد.

## ADR-005 — Temporal Personal Model

**تصمیم:** Truth table تخت ساخته نمی‌شود. Evidence، Assertion و Hypothesis مستقل‌اند. Assertion دارای `valid_from/valid_to`، نوع معرفتی، confidence rationale و لینک support/contradict است.

**قاعده:** «Actual Self» در UI به‌عنوان Evidence-backed Personal Model عرضه می‌شود، نه حقیقت قطعی انسان.

## ADR-006 — Workflow Runtime

**تصمیم:** workflowهای اصلی state machine نسخه‌دار با transactional outbox هستند. در Foundation broker خارجی و orchestration platform اضافه نمی‌شود.

**الزامات:** idempotency، retry policy، timeout، cancellation، approval checkpoint، compensation و audit.

**Trigger استخراج:** وقتی durable workflowها، timerها یا throughput از توان worker داخلی عبور کرد، Temporal/راهکار معادل با ADR مستقل ارزیابی شود.

## ADR-007 — Model Provider و Data Handling

**تصمیم:** هیچ SDK مدل مستقیماً وارد Domain نمی‌شود. `ModelGateway` قرارداد canonical برای structured generation، embedding، moderation و usage دارد.

**سیاست:** برای داده Restricted، ارسال به provider تنها پس از consent/purpose check، data minimization، ثبت provider/model/version و تصمیم retention مجاز است.

**OpenAI:** Responses API/Agents SDK یک Adapter ممکن است، نه جزء هسته معماری.

## ADR-008 — Storage، Encryption و Backup

**تصمیم پیشنهادی:** PostgreSQL managed با backup/PITR و Object Storage سازگار با S3. فایل خام خارج از Document Root و رمزگذاری‌شده ذخیره می‌شود. Vector index مشتق و rebuildable است.

**Blocker فعلی:** سرور cPanel تنها حدود `6.5 GB` فضای آزاد و مصرف دیسک `97%` دارد؛ PostgreSQL client/runtime قابل مشاهده نیست. Production data plane روی این سرور تا رفع capacity و تعیین DB تأیید نمی‌شود.

**Document Root:** فقط artifact عمومی/Reverse Proxy؛ محل source، secrets، uploads یا database نیست.

## ADR-009 — Evaluation و Release Gates

**تصمیم:** هر prompt/model/policy change به dataset version و eval run متصل است. Release بدون contract tests، tenant leakage tests، claim support tests و cost report ممنوع است.

**قاعده:** LLM-as-judge تنها signal کمکی است؛ golden rubric انسانی لازم است.

## ADR-010 — Deployment

**تصمیم موقت:** توسعه و CI مستقل از cPanel؛ production app ممکن است با Node/PM2 روی `/home/wealthos/apps/pr` اجرا و از Document Root proxy شود، اما database/object storage خارج از public root و ترجیحاً managed خواهد بود.

**Production Gate:**

1. کاهش مصرف دیسک به سطح امن؛
2. مشخص‌شدن روش reverse proxy و health check در cPanel؛
3. secret injection امن؛
4. DB endpoint، TLS، backup و restore test؛
5. process restart policy و log rotation؛
6. staging جدا یا deployment slot قابل rollback.

## تصمیم‌های مالک محصول که کار را واقعاً تغییر می‌دهند

این موارد در زمان مناسب باید پاسخ داده شوند، ولی مانع ادامه طراحی داخلی نیستند:

1. بازار اولیه ایران است یا بازار بین‌المللی؟
2. فقط فارسی، یا فارسی و انگلیسی از MVP؟
3. آیا سرویس managed database/object storage مجاز است؟
4. سقف بودجه ماهانه زیرساخت و AI چقدر است؟
5. retention پیش‌فرض Assetهای شخصی چند روز/ماه/سال باشد؟

تا زمان پاسخ، فرض محافظه‌کارانه چنین است: فارسی-first با پشتیبانی معماری Unicode/RTL و انگلیسی، بدون public publish، بدون external sharing پیش‌فرض، و بدون خرید سرویس پولی.
