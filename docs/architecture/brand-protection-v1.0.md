# Ethics, Privacy, Risk & Brand Protection v1.0

## هدف و مرز

این لایه Cross-cutting قبل از Approval هر Strategic Action اجرا می‌شود. هدف آن
جایگزین‌کردن قضاوت انسانی یا مشاوره حقوقی نیست؛ هدف، آشکارکردن Signalها، ثبت
Rationale و جلوگیری از Override شدن ایمنی توسط Utility یا Engagement است.

نسخه اول ۱۵ بُعد Master Context را پوشش می‌دهد: Consent، Privacy، Data Access،
Sensitive Data، Third-party Privacy، Reputation Risk، Misinterpretation،
Manipulation، Defamation، Conflict of Interest، Disclosure، Authenticity،
Security، Public Exposure و Long-term Consequences.

## قرارداد تصمیم

- `Green`: در Context فعلی Signal مادی پیدا نشده و اقدام مجاز است.
- `Yellow`: اقدام تا Attestation و Rationale صریح مالک `review_required` است.
- `Red`: وتوی قطعی؛ در MVP با Attestation مالک هم Override نمی‌شود و فقط
  `hold` یا `escalate` مجاز است.
- هر Assessment با `brand-protection-v1` و SHA-256 محتوای Action/Findings نسخه‌بندی
  می‌شود. تغییر Action، Acknowledgement قدیمی را بی‌اعتبار می‌کند.
- Claim Governance یک Gate مستقل است. Risk acknowledgement هیچ Claim را Verified
  یا Public-ready نمی‌کند.

## Persistence و Audit

`app.risk_reviews` تاریخچه انسانی را به‌صورت append-only، tenant-isolated و
idempotent نگه می‌دارد. هر Review در همان Transaction به Audit و Outbox متصل است.
ردیف Red در سطح دیتابیس نیز نمی‌تواند Decision=`acknowledge` داشته باشد.

## Arbitration

ترتیب قطعی:

`Policy/Consent → Claim Guard → Brand Risk → Human Approval → Export`

Risk Red توسط Strategy score، Opportunity score، Engagement یا یک Agent منفرد
قابل Override نیست. Yellow فقط برای همان Assessment hash قابل پذیرش است.

## Crisis boundary

Negative Signal Detection، Social Listening و Reputation Monitoring خودکار هنوز
فعال نیستند؛ Connector و Source معتبر ندارند و نباید شبیه‌سازی شوند. Signal بحران
در این نسخه باید Hold/Escalate شود. پیش از Crisis Assist واقعی، Source provenance،
شدت‌سنجی، Incident drill، سناریوی سکوت/اصلاح و Human/Legal escalation لازم است.

## Release gates

- تمام ۱۵ dimension در هر Assessment حاضر باشند؛
- Yellow بدون Review و Red در همه حالت‌ها Approval را مسدود کند؛
- stale assessment و idempotency mismatch رد شوند؛
- RLS، owner binding، Audit/Outbox و export پوشش داده شوند؛
- Node runtime و private Worker رفتار یکسان داشته باشند.
