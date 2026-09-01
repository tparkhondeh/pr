# Workflow Cost & Budget Gate v1.0

## مسئله

ثبت هزینه پس از پایان Workflow برای کنترل هزینه کافی نیست. نسخهٔ MVP باید پیش از هر اجرای Metered ظرفیت بودجه را رزرو کند، پس از اجرا مصرف واقعی را بدون عددسازی ثبت کند، و در صورت Overrun ادامهٔ همان Workflow را قطعی متوقف کند.

این Gate هزینهٔ مالی را با Attention/Opportunity Cost یکی نمی‌گیرد. Attention Budget در Decision Context باقی می‌ماند؛ این ماژول هزینهٔ عملیاتی Workflow و زمان بازبینی انسانی را ثبت می‌کند.

## قرارداد نسخه‌دار

Policy فعال `workflow-cost-budget-v1` است و واحد پول را صریحاً `USD` اعلام می‌کند. سقف Bootstrap فعلی:

- هر Invocation: 100 Minor Unit؛
- هر Workflow: 500 Minor Unit؛
- هر روز UTC: 2,000 Minor Unit؛
- حداکثر 12 Invocation و 16 گام برای هر Workflow؛
- Warning در 80٪ بودجه.

این اعداد Claim دربارهٔ هزینهٔ واقعی Provider نیستند؛ Limitهای Policy هستند. تغییرشان باید با نسخهٔ Policy و Migration/Configuration مستقل انجام شود.

## مسیر اجرا

```text
Workflow Plan
  → POST /api/workflow-cost/reservations
  → Allowed? اجرای Metered : توقف پیش از Spend
  → POST /api/workflow-cost/charges
  → Append-only Ledger
  → Overrun? Circuit Open : Budget Available
```

Reservationهای مجازِ تسویه‌نشده نیز بودجه را مصرف می‌کنند تا دو اجرای هم‌زمان نتوانند یک ظرفیت را دوبار خرج کنند. PostgreSQL با Lock روزانهٔ Tenant/Owner تصمیم‌های هم‌زمان را Serial می‌کند.

## Cost Ledger

هر Charge مؤلفه‌های زیر را جدا نگه می‌دارد:

- Model؛
- Embedding؛
- Storage؛
- Search؛
- Tool/API؛
- Compute؛
- Input / Output / Cached Input Tokens؛
- Human Review Seconds.

`humanReviewSeconds` زمان انسانی است و داخل جمع پولی وارد نمی‌شود. `costEvidence` یکی از این سه مقدار است:

- `provider_reported`: مبلغ از گزارش Provider آمده؛
- `estimated`: مبلغ برآوردی است؛
- `none`: قیمت قابل اتکا وجود ندارد.

در حالت `none` تمام مؤلفه‌های پولی باید صفر باشند. صفر در این حالت به معنی «رایگان» نیست؛ Snapshot آن را `unmetered` نشان می‌دهد.

## Circuit Breaker

Preflight در این شرایط Block می‌شود:

- سقف Invocation؛
- سقف Workflow؛
- سقف روز؛
- سقف تعداد Invocation یا گام؛
- Circuit بازشدهٔ قبلی.

تسویه همیشه مصرف واقعی را ثبت می‌کند، حتی اگر از Reservation بیشتر باشد؛ سپس Circuit را برای اجرای بعدی باز می‌کند. پنهان‌کردن Overrun برای سبز نشان‌دادن Dashboard مجاز نیست.

## امنیت، Tenant و Idempotency

Migration `0027_workflow_cost_budget` سه جدول RLS-protected می‌سازد:

- `app.workflow_cost_budget_locks` برای Serialization روزانه؛
- `app.workflow_cost_reservations` برای تصمیم append-only پیش از اجرا؛
- `app.workflow_cost_charges` برای مصرف واقعی append-only.

تمام عملیات به Tenant و Owner متصل‌اند. `requestId` با SHA-256 ورودی قفل می‌شود؛ Replay همان پاسخ را می‌دهد و استفادهٔ دوباره از کلید با Payload متفاوت Conflict است. Audit/Outbox فقط Metadata حداقلی هزینه را نگه می‌دارند و Prompt یا محتوای شخصی را کپی نمی‌کنند.

## مرز MVP

Runtime فعلی مدل بیرونی را فراخوانی نمی‌کند؛ بنابراین UI به‌درستی `no_usage` را نمایش می‌دهد و مبلغی جعل نمی‌کند. هر Provider Adapter آینده موظف است قبل از فراخوانی Reservation بگیرد و بعد از دریافت Usage قطعی Charge ثبت کند. عبور مستقیم از این Gate نقض قرارداد معماری است.
