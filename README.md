# PR — Personal Brand & PR Operating System

این مخزن برای طراحی و توسعه یک سیستم هوشمند و ماندگار مدیریت برند شخصی، اعتبار، روایت، روابط و PR ایجاد شده است.

وضعیت فعلی: **Foundation و MVP Workbench در حال توسعه**. Data/Policy Kernel، API،
Workbench وب، Approval انسانی و ورودی مکالمه‌ای Consent-first پیاده‌سازی شده‌اند.

## اسناد فعلی

- [ممیزی محصول و معماری](docs/architecture/product-architecture-audit-v1.0.md)
- [معماری هدف و محدوده MVP](docs/architecture/target-architecture-v1.0.md)
- [Master Implementation Prompt مرحله Foundation](docs/implementation/foundation-master-prompt-v1.0.md)
- [ADRهای Draft مرحله Foundation](docs/decisions/foundation-adrs-draft-v1.0.md)
- [Data & Policy Kernel](docs/architecture/data-kernel-v1.0.md)
- [Operations Runbook](docs/operations/runbook-v1.0.md)

## محیط‌ها

- Production domain: `pr.wealthos.ir`
- Server source path: `/home/wealthos/apps/pr`
- cPanel document root: `/home/wealthos/pr.wealthos.ir`

پیکربندی Preview محافظت‌شده cPanel در [deploy/cpanel](deploy/cpanel) نگه‌داری می‌شود.
دامنه واقعی تا زمان جایگزینی Single-owner bootstrap با Session معتبر، فقط پشت Basic
Auth قابل استقرار است. Node API با PM2 روی Loopback اجرا و مسیرهای API از Document
Root به آن Proxy می‌شوند؛ حذف این Gate برای تست عمومی مجاز نیست.

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

Workbench فعلی حلقه تصمیم MVP را نمایش می‌دهد: Goal، سه Action شامل عدم اقدام،
Attention Budget، Evidence، Risk و Approval انسانی. View از `GET /api/workbench`
داده می‌گیرد و تأیید را با `POST /api/workbench/approval` ثبت می‌کند. Store فعلی
بدون تنظیم دیتابیس حافظه‌ای است و با Restart پاک می‌شود. با تنظیم هم‌زمان
`DATABASE_URL`، `PR_TENANT_ID` و `PR_OWNER_USER_ID`، تأیید با Optimistic Lock در
PostgreSQL ذخیره و در همان Transaction به Audit Log و Outbox افزوده می‌شود.
نسخه خصوصی Sites همین قرارداد را با state موقت Worker برای تست UI ارائه می‌کند.

دکمه «شروع گفت‌وگو» نیز به `POST /api/conversations/turns` متصل است. Opt-in ساخت
پیشنهاد حافظه پیش‌فرض خاموش است و حتی پس از فعال‌کردن، ثبت نهایی فقط با درخواست دوم
`POST /api/memory/proposals/:id/confirm` انجام می‌شود. خروجی اولیه همیشه
`self_report` و `confidential` است و مجوز Brand/Public به‌طور خودکار داده نمی‌شود.
وقتی Opt-in خاموش است، متن مکالمه در Store پایدار ثبت نمی‌شود. با تنظیم متغیرهای
PostgreSQL، Proposal انتخاب‌شده و تأیید آن همراه Evidence، Assertion، Consent، Audit
و Outbox در یک Transaction ذخیره می‌شوند؛ در نبود دیتابیس، Store حافظه‌ای و موقت است.

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

نمای «پیش‌نویس» تنها پس از تأیید Action محتوایی Workbench فعال می‌شود. کاربر یک
حافظه تأییدشده و دارای Evidence را انتخاب می‌کند، برای استفاده عمومی همان منبع
رضایت صریح می‌دهد و Mother Idea را برای یکی از پلتفرم‌های LinkedIn، Instagram، X،
YouTube، Podcast، Newsletter یا Blog می‌سازد. خروجی با Claim و Evidence قابل‌ردیابی
است؛ ویرایش، Approval قبلی را باطل و Guard ادعا/فرمت را دوباره اجرا می‌کند و Export
فقط برای نسخه سبز و تأییدشده مجاز است. تغییر Strategy یا Contest/Revoke/Delete منبع،
Approval و Export را متوقف می‌کند. API این جریان از `GET /api/drafts/current`،
`POST /api/drafts`، `PUT /api/drafts/:id`، `POST /api/drafts/:id/approve` و
`POST /api/drafts/:id/export` تشکیل شده است. انتشار مستقیم در این مرحله عمداً وجود
ندارد و Export فایل متنی آخرین Human-in-the-Loop است.

هر ذخیره ویرایش Draft به Feedback Engine متصل است. سیستم فقط تغییرهای مادی و
توضیح‌پذیر مانند کوتاه‌کردن متن/تیتر، کاهش میان‌تیتر یا حذف پرسش پایانی را به‌عنوان
Signal ثبت می‌کند. یک Edit یا Reject منفرد Voice Model را تغییر نمی‌دهد؛ پس از دست‌کم
سه Signal هم‌جهت، یک Preference Proposal همراه Evidence و Confidence ساخته می‌شود.
کاربر از نمای «یادگیری» می‌تواند Proposal را Apply یا Reject کند و هر Preference
اعمال‌شده را بعداً Revoke کند. Preference اعمال‌شده در Draft بعدی Adaptation را جهت
می‌دهد، اما Guard ادعا و تأیید انسانی را دور نمی‌زند. مسیرهای این بخش
`GET /api/feedback`، `POST /api/feedback/drafts/:id/reject` و
`POST /api/feedback/preferences/:id/decision` هستند.
