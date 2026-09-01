# Controlled Proactive Initiative v1.0

## هدف و مرز

این لایه بند ۳۴ Master Context را به یک Policy قابل‌آزمون تبدیل می‌کند: سیستم می‌تواند
یک Signal مرتبط را بدون شروع Conversation از سوی کاربر مطرح کند، اما حق ایجاد مزاحمت
نامحدود، اعلان بیرونی یا اجرای Action ندارد.

پیش‌فرض همیشه `reactive` است. تغییر به `balanced` یا `proactive` فقط با تنظیم صریح
مالک انجام می‌شود و قابل بازگشت است.

## ورودی‌های قابل‌اعتماد MVP

Candidate فقط از Snapshotهای owner-scoped فعلی ساخته می‌شود:

- Evidence gap واقعی در Workbench؛
- Action رتبه‌دار، feasible و evidence-grounded؛
- Decision Arbitration که به‌دلیل تغییر Context یا پایان اعتبار stale شده است.

External Trend، Social Listening، Calendar، Message و Opportunity Connector هنوز
وجود ندارند؛ بنابراین سیستم نباید وانمود کند رویداد بیرونی تازه‌ای کشف کرده است.

## Policy قطعی

هر ارزیابی `initiative-policy-v1` به ترتیب زیر اجرا می‌شود:

1. اگر Mode برابر `reactive` باشد Cue متوقف می‌شود؛
2. اگر Pause فعال باشد Cue متوقف می‌شود؛
3. اگر Signal مادی وجود نداشته باشد سیستم سکوت می‌کند؛
4. اگر Relevance کمتر از حد انتخابی مالک باشد Cue متوقف می‌شود؛
5. اگر سقف شناور ۲۴ساعته پر باشد Cue متوقف می‌شود؛
6. در غیر این صورت فقط یک Cue اختیاری در Interface نمایش داده می‌شود.

حداقل Relevance بین ۰٫۵۰ تا ۰٫۹۵ و سقف بین یک تا سه Cue در ۲۴ ساعت قابل تنظیم است.
Pause فعلی حداکثر ۳۰ روز اعتبار دارد. Cue شامل Rationale، Confidence، Source Ref،
Context Hash، مقصد UI و زمان انقضا است.

## سؤال کم‌مزاحمت

Cue مربوط به Evidence gap یک سؤال کوتاه و High Information Gain است. پاسخ‌دادن الزامی
نیست و خود Cue چیزی در Personal Memory نمی‌نویسد. مسیر ثبت Evidence همچنان Consent
و Confirmation مستقل خود را دارد.

## Persistence و هم‌زمانی

Migration `0021_proactive_initiative` سه بخش tenant-isolated و دارای FORCE RLS دارد:

- تنظیمات نسخه‌دار مالک؛
- درخواست‌های idempotent تغییر تنظیمات؛
- Evaluation Ledger append-only برای `delivered` و `suppressed`.

Rate Limit در Transaction و زیر advisory lock محاسبه می‌شود تا دو درخواست هم‌زمان
نتوانند از سقف عبور کنند. تغییر Settings با Optimistic Revision انجام می‌شود. هر
تصمیم در Audit/Outbox ثبت می‌شود؛ Worker/Sites همین Contract را با State موقت اجرا
می‌کند.

## Staleness و Reversibility

Context Hash از Strategy Revision، Evidence state، Actionها و Arbitration Caseها
ساخته می‌شود. تغییر Context یا انقضای Candidate، Evaluation قبلی را `stale` می‌کند
ولی آن را بازنویسی یا حذف نمی‌کند. مالک می‌تواند هر لحظه Mode را به Reactive برگرداند
یا Pause کند.

## خارج از Scope

- Push notification، Email، SMS یا پیام در پلتفرم دیگر؛
- Background scheduler و Monitoring بیرونی؛
- خواندن Calendar/Inbox/Social بدون Consent؛
- Publish، Tool call، Relationship action یا Crisis response؛
- بهینه‌سازی Engagement با دست‌کاری روانی.

هر Connector آینده نیازمند Consent scope، Channel preference، quiet hours با timezone،
unsubscribe، delivery receipt، abuse monitoring و incident drill مستقل است.

## Release gates

- Default برابر Reactive بماند؛
- اولین Cue واجد شرایط ثبت شود و Cue دوم از سقف یک‌تایی عبور نکند؛
- Relevance زیر Threshold حتی در Proactive متوقف شود؛
- Replay دقیق idempotent و reuse متعارض `409` باشد؛
- تغییر Context، Evaluation قبلی را stale کند؛
- RLS، Audit/Outbox، account export، Node، PostgreSQL و Worker هم‌رفتار باشند؛
- هیچ outbound notification یا Action side effect وجود نداشته باشد.
