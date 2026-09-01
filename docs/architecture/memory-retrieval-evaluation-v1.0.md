# ارزیابی Retrieval حافظه v1.0

وضعیت: Release Gate فعال برای Phase 1 — Useful Memory

## هدف

`memory-retrieval-eval-v1` ثابت می‌کند Retrieval پیش از هر Ranking، Permission و مرز
Tenant/Data Class را اعمال می‌کند و Assertion حذف‌شده، مورد اعتراض، منقضی، Superseded
یا هنوز نامعتبر را به Context برنمی‌گرداند. این Suite جایگزین تست واحد نیست؛ یک Golden
Set نسخه‌دار و مستقل است که در هر `pnpm check` اجرا می‌شود.

## مجموعه ارزیابی

نسخه نخست ۱۶ Case فارسی و انگلیسی دارد:

- Ranking قطعی بر اساس Confidence و زمان، همراه Limit؛
- فیلتر Subject و Predicate؛
- Deny بدون Grant و برای Grant منقضی، لغوشده یا متعلق به آینده؛
- پذیرش Consent تمدیدشده حتی اگر رکورد تاریخی منقضی قبل از آن قرار گرفته باشد؛
- جداسازی Tenant و Data Class؛
- Abstention برای Assertion مورد اعتراض، حذف‌شده، Superseded، منقضی یا متعلق به آینده؛
- Abstention هنگام نبود Evidence مطابق Filter.

Fixtureها کاملاً Synthetic هستند. Report فقط شناسه‌ها و Metricها را نگه می‌دارد و
مقدار خام Assertion در خروجی Release Gate وجود ندارد.

## معیار پذیرش

Release فقط وقتی سبز است که همه شروط زیر هم‌زمان برقرار باشند:

- `permissionLeakageCount = 0`؛
- `falseAllowCases = []` و `falseDenyCases = []`؛
- `precisionAtK = 1`؛
- `recallAtK = 1`؛
- همه Caseهای Abstention خروجی مجاز ولی خالی داشته باشند؛
- همه Checkهای Critical و High پاس شوند.

تست منفی عمداً یک Retriever نشت‌دهنده را تزریق می‌کند و باید Suite را قرمز کند؛ در
نتیجه فقط سبز بودن Happy Path سنجیده نمی‌شود.

## مرز ادعا

این Gate رفتار Retrieval قطعی فعلی را روی Golden Set پوشش می‌دهد و ادعای کیفیت Semantic
Search روی Corpus واقعی نمی‌کند. پیش از Embedding/pgvector یا Model Provider باید Corpus
ناشناس‌شده، Targetهای آماری بزرگ‌تر، بررسی Drift و Permission filter همان Adapter نیز به
همین Contract افزوده شوند. Production تا PostgreSQL پایدار همچنان memory/ephemeral است.

## اجرا

```bash
pnpm eval:memory-retrieval
```
