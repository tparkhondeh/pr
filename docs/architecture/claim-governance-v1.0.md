# Fact & Claim Governance v1.0

این لایه بین Research/Memory و Draft Approval قرار می‌گیرد تا هیچ Citation، متن جذاب یا
خروجی مدل به‌تنهایی Truth Authority نباشد.

## مرزهای اصلی

- `Citation-ready` فقط یعنی Source، Evidence، Freshness و Conflict قابل بررسی‌اند.
- `Verified` فقط پس از Human Attestation و Rationale قابل Audit ایجاد می‌شود.
- `Verified` به‌تنهایی مجوز انتشار نیست؛ `public_drafting` و Channel نیز باید مجاز باشند.
- `Disputed` یا `Revoked` بلافاصله Edit، Approval و Export Draft متصل را متوقف می‌کند.
- Opinion و Projection از Fact جدا می‌مانند و در این نسخه با تصمیم `verify` تأیید نمی‌شوند.

## Trace contract

هر Claim شامل Statement دقیق، Kind، Status، Evidence IDها، Source Refها، Purpose، Channel،
Validity و زمان ایجاد است. برای Claimهای Research، Quality، Stance، Published/Accessed time
و Freshness window نیز در Trace حضور دارند.

دسته‌های حساس برای Explainability عبارت‌اند از:

- Company؛
- Revenue؛
- Experience؛
- Education؛
- Numeric؛
- Award؛
- Third-party؛
- Research؛
- General.

این دسته‌بندی deterministic و محافظه‌کارانه است؛ تشخیص دسته به‌تنهایی Claim را تأیید یا
رد نمی‌کند.

## Trace status

| وضعیت | معنا | نتیجه |
|---|---|---|
| `complete` | Evidence و Source لازم حاضر و بدون مانع شناخته‌شده است | قابل Human Review |
| `incomplete` | Evidence یا Source Ref لازم وجود ندارد | Verify مسدود |
| `stale` | Source از پنجره Freshness عبور کرده | Verify مسدود |
| `unverified_source` | Quality منبع نامطمئن است | Verify مسدود |
| `contradicted` | Source رابطه Contradicts دارد | Verify مسدود |
| `conflicted` | Source حامی و ناقض هم‌زمان وجود دارند | Verify مسدود |

## Human review lifecycle

تصمیم‌های نسخه اول `verify`، `dispute` و `revoke` هستند. هر درخواست دارای Request ID،
Fingerprint، Expected Status و Rationale است. PostgreSQL روی Claim قفل Transactional می‌گیرد؛
Status، Review append-only، Audit و Outbox در همان Transaction نوشته می‌شوند. تکرار همان
درخواست idempotent است و استفاده دوباره از Request ID با محتوای متفاوت رد می‌شود.

`app.claim_reviews` خود Trace Snapshot زمان تصمیم را نگه می‌دارد تا تغییر بعدی Source یا
Policy، زمینه تاریخی Review را پاک نکند. RLS و Owner binding برای تمام Read/Writeها اجباری است.

## Draft propagation

Draft Service پیش از Edit، Approval و Export وضعیت جاری Claim را از Claim Governance Policy
می‌خواند. Repository PostgreSQL نیز در Statement تغییر وضعیت Draft دوباره `verified` بودن
Claim را بررسی می‌کند. این کنترل دوم، مسیر مستقیم Repository یا Race ساده را Fail-closed می‌کند.

Claim Reference فقط با ID معتبر نمی‌شود: Excerpt باید دقیقاً با Statement ثبت‌شده برابر
باشد و همان Statement باید داخل Body حضور داشته باشد. Body پس از حذف Statementهای متصل
برای Claimهای حساس احتمالی دوباره اسکن می‌شود؛ بنابراین اعلام نادرست
`claimExtractionComplete=true` از سوی Provider، Guard قطعی را دور نمی‌زند.

## محدودیت‌های نسخه اول

- Verification نتیجه بازبینی انسانی ثبت‌شده است، نه تضمین حقیقت مطلق.
- Multi-review، reviewer مستقل و quorum هنوز پیاده نشده‌اند.
- Claim resolution از `disputed` به یک Claim جدید یا superseding review در نسخه بعدی طراحی می‌شود.
- انتشار مستقیم همچنان وجود ندارد و Export آخرین مرز Human-in-the-Loop است.
