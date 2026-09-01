# Strategic Quality Baseline v1.0

وضعیت: پیاده‌سازی‌شده در Phase 2 — baseline انسانی هنوز در حالت `collecting`

## هدف

این ماژول فاصله میان «تولید یک توصیه» و «اثبات مفیدبودن آن برای مالک» را قابل‌اندازه‌گیری
می‌کند. نتیجه یک Score پنهان برای تغییر خودکار Strategy نیست. دو لایه مستقل دارد:

1. `rubric`: کنترل قطعی و نسخه‌دار قرارداد تصمیم؛
2. `ownerBaseline`: مشاهده پذیرش و کیفیت از بازبینی واقعی مالک.

## اتصال بازبینی به تصمیم

هر Review به این مختصات متصل است:

- `actionId`، عنوان، نوع و رتبه Action؛
- `strategyRevision`؛
- `decisionContextRevision` و `decisionContextHash`؛
- `decisionWindowEndsAt`؛
- زمان Review و Review قبلی که این رکورد جایگزین آن می‌شود.

اگر Strategy یا Decision Context تغییر کرده باشد، پنجره تصمیم منقضی شده باشد یا Action
دیگر در Snapshot جاری وجود نداشته باشد، ثبت با Conflict متوقف می‌شود. تصمیم `accepted`
فقط وقتی پذیرفته می‌شود که همان Action قبلاً در Workbench توسط مالک Approve شده باشد.

## Rubric خودکار

نسخه `strategic-quality-v1` این قراردادها را بررسی می‌کند:

- Decision Frame و Opportunity Cost شفاف؛
- هزینه زمان، انرژی، توجه، Visibility و Emotional bandwidth؛
- Human Gate و نبود مجوز اجرای بیرونی؛
- وجود مسیر آگاهانه No-action؛
- Grounding یا Abstention در Cold Start؛
- اتصال همه Actionها به Context جاری؛
- Mother Concept پیش از Platform Adaptation؛
- Measurementهای معنادار فراتر از Like/View.

قبولی Rubric فقط سلامت قرارداد را نشان می‌دهد و معادل رضایت کاربر یا Outcome موفق نیست.

## Baseline انسانی

مالک برای هر توصیه یکی از `accepted`، `rejected` یا `needs_revision` را همراه سه امتیاز
۱ تا ۵ ثبت می‌کند:

- Usefulness؛
- Trust؛
- Friction.

تکرار همان Request idempotent است. Review جدید همان Action و Context، Review قبلی را
حذف نمی‌کند؛ رکورد append-only می‌ماند و فقط آخرین Review در محاسبه نمونه جاری لحاظ
می‌شود. تا پیش از پنج نمونه مستقل:

- وضعیت `collecting` است؛
- `observedMetrics` موقت نمایش داده می‌شود؛
- `baselineMetrics` برابر `null` است.

این سیاست از نام‌گذاری چند مشاهده اولیه به‌عنوان baseline و ساختن موفقیت جعلی جلوگیری
می‌کند. رسیدن به پنج نمونه فقط حداقل کف آماری محصول است و به‌تنهایی Gate نهایی Expert
Acceptance فاز ۲ را کامل نمی‌کند.

## مرزهای یادگیری و اجرا

- Review هیچ Strategy، Identity یا Preference را خودکار تغییر نمی‌دهد؛
- هیچ Publish، پیام، Notification یا External Action ایجاد نمی‌کند؛
- داده‌های PostgreSQL با RLS و Tenant Context محدود می‌شوند؛
- Audit/Outbox شامل Metrics و Context binding است، نه Note خصوصی مالک؛
- همه Reviewها در Account Export مالک قرار می‌گیرند؛
- نسخه Sites تا Restart موقت (`ephemeral`) و نسخه PostgreSQL ماندگار است.

## API

- `GET /api/strategic-quality`
- `POST /api/strategic-quality/reviews`

برای POST، کلیدهای انتظار Strategy/Decision Context و Decision Window الزامی‌اند تا UI
نتواند بازخورد یک توصیه قدیمی را به Snapshot جدید نسبت دهد.
