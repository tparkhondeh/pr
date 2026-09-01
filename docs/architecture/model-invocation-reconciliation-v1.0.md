# Model Invocation Reconciliation v1.0

## هدف

`model-invocation-reconciliation-v1` مسیر Human-in-the-Loop برای بستن Invocationهایی است
که پس از Crash یا قطع ارتباط در وضعیت `started` باقی مانده‌اند. وجود رکورد معلق هرگز به
معنی مجوز Retry نیست؛ Provider فقط با Request جدید و تصمیم جدید مالک می‌تواند دوباره
فراخوانی شود.

## ترتیب Recovery

```text
Durable started invocation
  → مالک Provider Log / Billing را خارج از سیستم بررسی می‌کند
  → فقط Evidence SHA-256 و Provider Trace ثبت می‌شود
  → Reservation مرتبط owner-scoped پیدا می‌شود
  → Cost Ledger idempotent تسویه می‌شود
  → Journal دقیقاً یک terminal transition می‌گیرد
  → Automatic retry همچنان ممنوع است
```

Mutation فقط با Journal نوع PostgreSQL مجاز است. Preview حافظه‌ای Policy و تعداد Recovery
را نشان می‌دهد، اما `POST /api/model-governance/reconciliations` را با
`durable_journal_required` متوقف می‌کند.

## Dispositionها

### `not_executed`

مالک با Evidence بیرونی تأیید می‌کند Provider درخواست را نپذیرفته است. اگر Reservation
مجاز ساخته شده باشد، یک Charge صفر با `costEvidence=none` ثبت می‌شود تا ظرفیت معلق بسته
شود. اگر Crash پیش از Reservation رخ داده باشد، هیچ Usage یا Cost ساخته نمی‌شود.

وضعیت نهایی Journal: `reconciled_not_executed`.

### `billed_output_unavailable`

Provider Trace و Billing نشان می‌دهند اجرا و هزینه رخ داده، اما خروجی قابل بازیابی نیست.
Token و Cost فقط با `costEvidence=provider_reported` در Ledger ثبت می‌شوند؛ Journal
`outputSha256` جعل نمی‌کند و خروجی برای Workflow موفق تلقی نمی‌شود.

وضعیت نهایی Journal: `reconciled_billed_output_unavailable`.

## Data minimization و Idempotency

- Raw Prompt، Raw Output، Invoice، Provider Response یا Screenshot ذخیره نمی‌شود؛
- فقط `reconciliationEvidenceSha256`، Request ID، Policy Version و Provider Trace می‌ماند؛
- Charge ID از Invocation به‌شکل deterministic ساخته می‌شود؛
- اگر Process پس از Charge و پیش از Journal completion قطع شود، Retry همان Charge را
  replay می‌کند و terminal transition را کامل می‌کند؛
- Evidence یا Usage متفاوت برای Invocation terminal با Conflict رد می‌شود؛
- رکورد terminal دوباره قابل تغییر یا حذف نیست.

## Migration و API

Migration الحاقی `0030_model_invocation_reconciliation` دو وضعیت terminal و سه ستون
metadata-only را اضافه می‌کند. Constraintهای دیتابیس Shape هر Disposition را کنترل می‌کنند.

```http
POST /api/model-governance/reconciliations
```

Body شامل `requestId`، `invocationRecordId`، `disposition`، `evidenceSha256` و برای حالت
Billed شامل `providerTraceId` و Usage گزارش‌شده است. زمان تصمیم از Clock سرور می‌آید.

## مرز نسخه اول

این قابلیت Evidence را از Provider دریافت یا صحت آن را مستقل تأیید نمی‌کند؛ مالک باید Hash
را از Evidence نگه‌داری‌شده در محیط عملیاتی امن تولید کند. فعال‌سازی Provider همچنان به
PostgreSQL Production، Session معتبر، Route Eval، Secret Store، canary و تأیید صریح مالک
نیاز دارد.
