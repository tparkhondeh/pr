# Research Layer v1.0

هدف این لایه جلوگیری از مخلوط‌شدن Personal Memory با External Research و جلوگیری از
تبدیل Citation به ادعای تأییدشده بدون Fact Check انسانی است.

## مرز داده

- Personal Memory درباره تجربه، ترجیح و Self-report مالک است و در Research ذخیره نمی‌شود.
- External Research در `app.research_sources` ثبت و به یک Evidence با
  `source_type=external_research` متصل می‌شود.
- برای هر منبع یک Claim از نوع `external_fact` با وضعیت `proposed` ساخته می‌شود.
- `source_refs` فقط URL منبع را نگه می‌دارد و `claim_evidence.relation` یکی از
  `supports` یا `contradicts` است.
- هیچ مسیر Import، Claim را خودکار `verified` نمی‌کند.

## Source Quality

| سطح | امتیاز توضیحی | کاربرد |
|---|---:|---|
| `primary` | 1.00 | سند یا داده اصلی |
| `authoritative_secondary` | 0.85 | تحلیل ثانویه معتبر |
| `secondary` | 0.65 | منبع ثانویه نیازمند بررسی بیشتر |
| `unverified` | 0.25 | فقط Backlog؛ غیرقابل استفاده عمومی |

امتیاز برای Ranking توضیحی است و به‌تنهایی Verification ایجاد نمی‌کند.

## Freshness و Conflict

مالک برای هر منبع `maxAgeDays` تعیین می‌کند. وضعیت تا ۷۵٪ پنجره `fresh`، پس از آن
`aging` و بعد از عبور از پنجره `stale` است. سیستم Statement را با Trim، یکسان‌سازی
فاصله و Lowercase قطعی Normalize می‌کند. وجود حداقل یک Source حامی و یک Source ناقض
برای Statement یکسان، همه منابع آن گروه را `conflicted` و غیرقابل استفاده عمومی می‌کند.

وضعیت‌های Fact Check عبارت‌اند از:

- `citation_ready`: منبع غیرکهنه، قابل‌شناسایی، حامی و بدون Conflict؛
- `review_required`: کهنه یا Unverified؛
- `contradicted`: فقط منبع ناقض موجود است؛
- `conflicted`: منابع حامی و ناقض هم‌زمان وجود دارند.

`citation_ready` فقط اجازه ورود به مرحله بعدی Fact Check است و معادل `verified` نیست.

## Security و Traceability

- فقط URL بدون Credential و با پروتکل HTTPS پذیرفته می‌شود.
- Import با Request ID و Fingerprint idempotent است.
- Repository با RLS به Tenant و Owner محدود است.
- Evidence، Claim پیشنهادی، Source، Audit و Outbox در یک Transaction ثبت می‌شوند.
- Account Export، Research Snapshot را جدا از Memory صادر می‌کند.

## Integration آینده

نسخه فعلی Fetch خودکار انجام نمی‌دهد. Adapter آینده باید خروجی ساختاریافته زیر را به
همین Service بدهد و حق نوشتن مستقیم در Memory یا Claim verified نداشته باشد:

1. URL نهایی و زمان Access؛
2. Publisher و تاریخ انتشار استخراج‌شده؛
3. Excerpt دقیق و Integrity hash؛
4. Quality rationale؛
5. Claim/stance پیشنهادی؛
6. نتیجه Fetch، Redirect و خطای دسترسی.

Web fetch آینده باید SSRF protection، محدودیت Redirect/Size/Content-Type، timeout،
allow/deny policy و نگه‌داری provenance داشته باشد. Fact Check و Human approval پس از
Adapter همچنان اجباری می‌مانند.
