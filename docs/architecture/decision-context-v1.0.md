# Decision Context v1.0

وضعیت: پیاده‌سازی‌شده در Phase 2 — Strategic MVP

## هدف

`Decision Context` مختصات اجرایی و موقت مالک را مستقل از Strategy نگه می‌دارد. Goal و
Desired Positioning می‌توانند چند هفته یا چند ماه معتبر بمانند، اما ظرفیت امروز کاربر ممکن
است در چند ساعت تغییر کند. به همین دلیل این Context یک Aggregate نسخه‌دار جداگانه است.

پنج ورودی قطعی آن عبارت‌اند از:

- زمان در دسترس بر حسب دقیقه؛
- حداکثر هزینه انرژی، ۱ تا ۵؛
- ظرفیت توجه/تمرکز، ۱ تا ۵؛
- تحمل دیده‌شدن، ۱ تا ۵؛
- ظرفیت احساسی، ۱ تا ۵.

زمان و توجه عمداً یکی نیستند: ممکن است کاربر ۱۲۰ دقیقه زمان داشته باشد ولی برای یک کار
Deep-focus ظرفیت کافی نداشته باشد.

## قرارداد نسخه و Hash

هر Snapshot شامل `policyVersion=decision-context-v1`، `revision`، زمان تغییر و SHA-256
از نسخه و پنج مقدار است. Workbench هر بار Options را با Snapshot جاری دوباره رتبه‌بندی
می‌کند و Strategy Frame و هر Action Contract نسخه و Hash Context را حمل می‌کنند.

Approval فقط وقتی معتبر است که هم‌زمان این شروط برقرار باشند:

1. Strategy revision تغییر نکرده باشد؛
2. Decision Context revision و Hash تغییر نکرده باشد؛
3. Decision Window بیست‌وچهارساعته منقضی نشده باشد؛
4. همان Action و Evidenceهای Freeze‌شده تأیید شده باشند.

Client هنگام تأیید، Binding دیده‌شده در Snapshot را برمی‌گرداند. بنابراین یک UI یا تب
قدیمی نمی‌تواند Action تازه محاسبه‌شده را بدون مرور انسانی تأیید کند.

## Persistence و Race Safety

در PostgreSQL، `decision_context_states` آخرین نسخه و
`decision_context_requests` Idempotency را نگه می‌دارند. هر دو جدول RLS اجباری دارند.
ذخیره Context، پاک‌کردن Approval قبلی و ثبت Audit/Outbox در یک Transaction انجام می‌شود.
Optimistic revision و شرط revision روی Workbench تضمین می‌کنند که در رقابت Save و
Approve، یا Approval با Context قبلی رد شود یا بلافاصله توسط Save باطل گردد.

همین قرارداد در Preview Worker با Persistence موقت اجرا می‌شود. هیچ تغییر Context،
انتشار، پیام، Draft یا Side Effect بیرونی ایجاد نمی‌کند.

## سطح دسترسی و داده Audit

فقط Owner می‌تواند Context را بخواند یا تغییر دهد. Audit متن یا Context حساس اضافه ذخیره
نمی‌کند و فقط request id، revision، context hash و شناسه Workflow باطل‌شده را ثبت می‌کند.

## شواهد Verification

- Unit test برای validation، permission، idempotency و invalidation؛
- stale-context و expiry test برای Approval؛
- race test میان Save و Approve؛
- HTTP و Preview Worker parity؛
- PostgreSQL integration و RLS migration fitness؛
- اثر Context در Hashهای Risk، Arbitration و Initiative.
