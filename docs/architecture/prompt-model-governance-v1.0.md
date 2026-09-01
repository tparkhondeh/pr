# Prompt & Model Governance v1.0

## هدف

`prompt-model-governance-v1` فاصله میان `ModelGateway` و Provider بیرونی را به یک
مرز قابل Audit تبدیل می‌کند. انتخاب مدل، Prompt، Data Class و هزینه دیگر تصمیم پنهان
Adapter نیست و Runtime بدون عبور از Gateها نمی‌تواند Provider را فراخوانی کند.

## Registry

هر Route با ترکیب دقیق `purpose + schemaName` ثبت می‌شود و شامل این داده‌هاست:

- نسخه Prompt، Provider و Model؛
- Tier مستقل از نام Vendor: `economy | balanced | reasoning`؛
- Risk و Data Classهای مجاز؛
- سقف Output Token، هزینهٔ رزروی، تعداد گام و Timeout؛
- Rollout: `disabled | shadow | canary | active`؛
- Eval Suite و وضعیت `not_run | failed | passed`.

Registry پیش‌فرض پنج Purpose را دارد، اما همهٔ Routeها `disabled` و Evalها `not_run`
هستند. این وضعیت به معنی خرابی نیست؛ پیش‌فرض امن تا آماده‌شدن Provider و Evidence است.

## مسیر اجباری اجرا

```text
Typed ModelRequest
  → Owner/Tenant binding
  → Model Input Safety: DLP / injection / shape / limits
  → Registry route
  → Active rollout + passed eval
  → Output/Data Class/consent policy
  → Durable Invocation Journal: started
  → Workflow Cost reservation
  → Provider with timeout
  → Usage validation
  → Workflow Cost charge
  → Structured output validation
  → Invocation Journal: terminal outcome
  → Governed ModelResult
```

Cost قبل از بررسی نهایی Output تسویه می‌شود، چون Provider حتی برای خروجی نامعتبر مصرف
داشته است. Failure یا Timeout که قیمت قطعی ندارد با `costEvidence=none` و مبلغ صفر ثبت
می‌شود؛ صفر در این حالت «رایگان» نیست، بلکه «قیمت اندازه‌گیری نشده» است.

## Idempotency و Retry

در Process فعلی `requestId` به Fingerprint کل Request متصل می‌شود. Replay همان Promise
را برمی‌گرداند و Payload متفاوت Conflict است. `model-invocation-journal-v1` همین قرارداد
را در PostgreSQL پایدار می‌کند: هر Invocation پیش از Spend با وضعیت `started` ثبت و فقط
یک‌بار Terminal می‌شود. پس از Restart، رکورد قبلی باعث Fail-closed می‌شود و Provider
خودکار دوباره فراخوانی نمی‌شود. Reservation و Charge نیز Request ID مشتق‌شده و Idempotent دارند.

## Permission و Data Boundary

- Tenant و Actor باید با Context مالک برابر باشند؛
- داده غیرعمومی فقط با `externalProcessingApproved=true` قابل ارسال است؛
- Data Class باید در Allowlist Route باشد؛
- Output فقط با Validator همان Schema پذیرفته می‌شود؛
- Prompt یا محتوای شخصی وارد Account Export، Audit یا Cost Ledger نمی‌شود.
- ورودی ناامن پیش از Journal و Cost با `model-input-safety-v1` متوقف می‌شود؛ Result فقط
  Finding Code، Field Path، Count و Hash دارد و هیچ Snippet نگه نمی‌دارد.

## API و UI

`GET /api/model-governance` Snapshot مالک‌محور Registry را برمی‌گرداند. نمای یادگیری
Routeها، Prompt Version، Tier، Eval و Rollout را کنار Cost Gate نشان می‌دهد. Account
Export نیز همین Metadata حکمرانی را بدون Prompt Content یا Secret حمل می‌کند.

## Gate فعال‌سازی Provider

1. فعال‌بودن PostgreSQL Source of Truth و Invocation Journal در محیط Production؛
2. Session/Actor binding معتبر؛
3. Provider Adapter با Secret خارج Git و Retention policy؛
4. Eval چندزبانه و Adversarial برای هر Route؛
5. Eval چندزبانه و adversarial برای Safety Gate و Data Processing Approval؛
6. Cost reconciliation و Crash/Timeout/Retry drill؛
7. Canaried rollout و rollback اثبات‌شده؛
8. تأیید صریح مالک.
