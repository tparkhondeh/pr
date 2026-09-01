# Model Input Safety Gate v1.0

## هدف

`model-input-safety-v1` آخرین مرز محلی پیش از ساخت Invocation Journal، رزرو هزینه و
ارسال به Provider بیرونی است. ورودی Model به‌عنوان داده غیرقابل‌اعتماد اسکن می‌شود و
هر خطای اسکن یا Finding پرخطر، اجرای مدل را Fail-closed متوقف می‌کند.

## ترتیب اجرا

```text
Owner/Tenant binding
  → Model Input Safety
  → Registry / Eval / Consent gates
  → Durable Invocation Journal
  → Cost reservation
  → External Provider
```

Safety Gate پیش از هر Side Effect اجرا می‌شود. Request مسدودشده Journal، Reservation،
Charge یا Provider call ایجاد نمی‌کند.

## Findingها

- `credential_material`: Private key، Authorization، Token، Password assignment یا
  Connection String دارای Credential؛
- `prompt_injection`: دستورهای با اطمینان بالا برای نادیده‌گرفتن Authority، افشای
  System Prompt یا ارسال Secret؛
- `opaque_encoded_payload`: Payload طولانی و کدشده که بدون Decode امن قابل ارزیابی نیست؛
- `scan_limit_exceeded`: عبور از Depth، Node، String یا Character budget؛
- `unsupported_input_shape`: Cycle، Accessor، Object غیرساده یا مقدار غیرقابل‌اعتماد.

همه Findingها Action ثابت `deny` دارند. این نسخه Redaction حدسی یا Allow خودکار ندارد.

## Data minimization

نتیجه اسکن فقط شامل موارد زیر است:

- Policy Version و زمان؛
- Allow/Deny؛
- تعداد Node/String/Character؛
- SHA-256 کل Scan؛
- Finding Code، Severity، Field Path و Fingerprint.

متن، Snippet، Credential یا مقدار Match‌شده در Result، Journal، Audit، API یا Account
Export قرار نمی‌گیرد. `rawInputRetained=false` جزئی از Contract است.

## ساختار و محدودیت

Scanner فقط JSON-like object، Array، primitive و Date معتبر را می‌پذیرد. Getter/Setter
اجرا نمی‌شود، Cycle مسدود است و Hash به‌صورت deterministic بر کلیدهای مرتب ساخته می‌شود.
سقف پیش‌فرض: Depth 20، ده‌هزار Node، دوهزار String و دو میلیون Character.

نام فیلدهای Credential رایج مانند `apiKey`، `clientSecret` و `password` نیز همراه مقدار
غیرخالی اسکن می‌شوند. نویسه‌های Format نامرئی، شکل عربی ی/ک، Dashهای Unicode و فاصله‌های
تکراری پیش از Pattern matching نرمال می‌شوند. Symbol key خارج از قرارداد JSON-like است و
Fail-closed رد می‌شود؛ Getter همچنان برای بازرسی فراخوانی نمی‌شود.

## Trace و Migration

Gateway نسخه Safety و `scanSha256` را در نتیجه Governance حمل می‌کند. Migration
`0029_model_input_safety` ستون immutable و nullable `input_safety_policy_version` را به
Journal اضافه می‌کند. `NULL` برای رکورد تاریخی به معنی «قبل از این Gate» است و عمداً
Backfill نمی‌شود؛ اجرای جدید همیشه نسخه `model-input-safety-v1` را ثبت می‌کند.

## Release evaluation

`model-input-safety-eval-v1` یک Golden adversarial set نسخه‌دار با ۲۱ Case فارسی و
انگلیسی است: چهار Allow و هفده Deny برای Credential، Prompt Injection، Payload کدشده،
سقف اسکن و Shape غیرقابل‌اعتماد. Release gate سه شرط را برای هر Case بحرانی می‌سنجد:
Disposition، Finding Code و عدم بازگشت Raw Marker. گزارش فقط Case ID و Metric نگه می‌دارد.

```bash
pnpm eval:model-input-safety
```

این فرمان جزئی از `pnpm check` و در نتیجه CI است. نسخه فعلی باید ۲۱/۲۱، بدون False
Positive، False Negative یا Critical Failure عبور کند. این Dataset مصنوعی است و Secret
واقعی در Repo ندارد.

## محدودیت نسخه اول

این Gate جایگزین Eval هر Route مدل، Malware scanner، Provider-side DLP، Tool Authorization
یا Human Review نیست. الگوها عمداً High-confidence هستند؛ Golden set فعلی یک Release
regression gate است، نه تخمین آماری عملکرد روی داده واقعی. Corpus ناشناس‌شده و Review
انسانی برای برآورد Recall/Precision واقعی پیش از فعال‌سازی Provider همچنان لازم است.
