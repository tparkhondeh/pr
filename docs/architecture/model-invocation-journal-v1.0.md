# Durable Model Invocation Journal v1.0

## هدف

`model-invocation-journal-v1` مرز قابل‌بازیابی میان Gateهای داخلی و Provider بیرونی است.
هر اجرای مجاز پیش از رزرو هزینه و فراخوانی Provider یک رکورد `started` می‌سازد و دقیقاً
یک‌بار به وضعیت نهایی منتقل می‌شود. اگر Process در میانه متوقف شود، رکورد `started`
باقی می‌ماند و به‌عنوان `recoveryRequired` گزارش می‌شود؛ Runtime حق Retry خودکار و ایجاد
هزینهٔ تکراری ندارد.

## داده ذخیره‌شده

Journal فقط Metadata حکمرانی و Trace را نگه می‌دارد:

- Request، Workflow و Invocation ID؛
- Purpose، Schema، Registry Entry، Prompt Version، Provider/Model/Tier؛
- Data Class و وضعیت تأیید پردازش بیرونی؛
- SHA-256 ورودی و در صورت وجود خروجی؛
- Reservation/Charge ID، Token، Cost Evidence و Provider Trace ID؛
- زمان شروع/پایان و وضعیت نهایی.

متن Prompt، ورودی خام و خروجی خام عمداً در جدول، Audit، Outbox، API یا Account Export
ذخیره نمی‌شوند. Hash مرجع اثبات برابری است و قابلیت بازسازی محتوا ایجاد نمی‌کند.

## ماشین وضعیت

```text
started
  ├─ succeeded
  ├─ cost_blocked
  ├─ provider_failed
  ├─ timed_out
  ├─ usage_invalid
  └─ output_invalid
```

در PostgreSQL یک Trigger حذف، ویرایش Metadata و Transition دوم را رد می‌کند. Unique
Constraint روی `tenant + owner + requestId` و `tenant + owner + workflowId + invocationId`
همراه Advisory Lock، Retry هم‌زمان را idempotent می‌کند.

## Fail-closed Recovery

- Replay همان Request و Fingerprint فقط همان رکورد را برمی‌گرداند؛
- Replay با Metadata متفاوت Conflict است؛
- Gateway پس از Restart با دیدن رکورد قبلی Provider را دوباره فراخوانی نمی‌کند؛
- رکورد `started` به‌طور خودکار موفق یا ناموفق فرض نمی‌شود؛
- Reconciliation آینده باید با Evidence Provider/Billing و تصمیم انسانی انجام شود.

## Persistence و مرز فعال‌سازی

Adapterهای Memory و PostgreSQL وجود دارند. Snapshot، `persistence`، `durable`، شمارش
Recovery و Outcomeهای اخیر را صادقانه نمایش می‌دهد. `executionEnabled` فقط زمانی true
می‌شود که Provider پیکربندی شده، حداقل یک Route فعال و Eval-passed باشد و Journal واقعاً
PostgreSQL باشد. Production فعلی به‌علت نبود Role/Credential امن PostgreSQL هنوز Memory
است؛ بنابراین Provider بیرونی همچنان خاموش است.

## Migration و سطح دسترسی

Migration `0028_model_invocation_journal` جدول `app.model_invocations` را با RLS اجباری،
Foreign Key به Membership و Cost Ledger، Audit/Outbox metadata-only و Transition Guard
می‌سازد. دسترسی فقط در Context Tenant و مالک فعال ممکن است.
