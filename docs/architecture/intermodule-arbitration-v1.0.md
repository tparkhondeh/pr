# Inter-module Contract & Decision Arbitration v1.0

## هدف و مرز

این لایه اختلاف میان Strategy، Permission، Claim، Risk و Authenticity را به یک
تصمیم قابل‌توضیح تبدیل می‌کند، بدون اینکه هیچ Agent یا ماژولی Truth Authority یا
اختیار اجرای نهایی داشته باشد. پیاده‌سازی یک Agent Mesh آزاد نیست؛ یک Policy قطعی
روی Snapshotهای typed و owner-scoped اجرا می‌شود.

API فقط `actionId`، شناسه idempotency و سطح Autonomy درخواستی را از Channel می‌پذیرد.
Channel نمی‌تواند رأی ماژول، Permission، Provenance یا نتیجه Arbitration را جعل کند.

## قرارداد Module Opinion

هر رأی `module-opinion-v1` شامل موارد زیر است:

- نام و نسخه ماژول؛
- موضع `support`، `revise`، `hold` یا `abstain`؛
- Confidence و حداقل سطح Autonomy که رأی از آن فعال می‌شود؛
- Rationale و Provenance Refهای بدون متن خام؛
- `read=owner_scoped_snapshot` و `write=none`.

امتناع به معنی Approval نیست و در Snapshot حفظ می‌شود. تعداد رأی‌های موافق نیز
قادر به Override کردن یک Gate الزام‌آور نیست.

## ترتیب Arbitration

Policy نسخه `intermodule-arbitration-v1` قواعد زیر را قطعی اعمال می‌کند:

1. Privacy/Security و Permission قبل از Utility؛
2. Claim و Risk دو Gate مستقل؛
3. `hold` بر همه رأی‌های حمایتی مقدم است؛
4. `revise` سقف مؤثر را تا Level 3 کاهش می‌دهد؛
5. Dissent و Abstention حذف یا Average نمی‌شوند؛
6. Side Effect عمومی همیشه به تأیید انسانی نیاز دارد؛
7. سقف MVP برابر Level 5 و `executionPermitted=false` است.

خروجی یکی از `recommendation_ready`، `revision_required`، `approval_required` یا
`held` است. Decision علاوه بر سطح مؤثر، ماژول‌های مانع/نامطمئن، علت Downgrade و
Ruleهای اعمال‌شده را آشکار می‌کند.

## Autonomy 0 تا 7

Contract هر هشت سطح Master Context را می‌پذیرد تا مدل داده بعداً تغییر نکند:

`Observe → Analyze → Recommend → Draft → Prepare → Ask Approval → Execute → Bounded Automation`

پذیرفتن Level 6 یا 7 به معنی فعال‌بودن آن نیست. در این MVP درخواست به Level 5 کاهش
می‌یابد، Human Approval لازم می‌شود و هیچ Tool/Publisher فراخوانی نمی‌شود.

## Context، Staleness و Persistence

`contextHash` از Action، Revision استراتژی، Assessment/Review ریسک و Claim Posture
ساخته می‌شود. هر Case فقط ۲۴ ساعت معتبر است. تغییر هرکدام از این ورودی‌ها یا پایان
پنجره اعتبار، Case را در Workspace به‌عنوان `stale` نشان می‌دهد و Snapshot قبلی را
بازنویسی نمی‌کند.

Migration `0020_inter_module_arbitration` Case را append-only، tenant-isolated و
idempotent در PostgreSQL نگه می‌دارد. `snapshotHash`، سطح درخواستی، Context و تمام
رأی‌ها کنار نتیجه ذخیره می‌شوند. همان Transaction یک Audit و Outbox کم‌حساسیت ثبت
می‌کند. نسخه Memory/Sites موقت است ولی Contract یکسان دارد.

## Human-in-the-loop و حدود MVP

- Arbitration فقط Decision Support است؛ Workbench Approval، Claim Review و Risk
  Review همچنان Gateهای مستقل خود را دارند.
- رأی Authenticity فعلی فقط Grounding حداقلی Evidence و Finding صریح Risk را می‌سنجد؛
  ادعای Voice Match کامل نمی‌کند.
- Relationship، Crisis/Legal، Publisher و Tool واقعی هنوز رأی یا اجرا ندارند.
- فعال‌سازی Level 6/7 نیازمند Session واقعی، Delegation Scope، Tool allowlist،
  short-lived approval token، compensation، rate limit و incident drill مستقل است.

## Release gates

- یک `hold` در حضور چند رأی Utility همچنان Veto بماند؛
- Level 6/7 هرگز Execution صادر نکند و حداکثر Level 5 شود؛
- Request replay دقیق idempotent و reuse متعارض `409` باشد؛
- Case پس از تغییر Risk/Strategy/Claim یا ۲۴ ساعت stale شود؛
- Node، PostgreSQL و Worker قرارداد همسان بدهند؛
- RLS، Audit/Outbox، account export و UI قابل‌مشاهده پوشش داده شوند.
