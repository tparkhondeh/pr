# Continuous Conversation Orchestrator v1.0

## هدف و مرز

گفت‌وگو Channel اصلی تعامل است، نه میان‌بری برای تغییر مستقیم Memory، Strategy،
Research، Draft، Risk یا Data Rights. Orchestrator هر Turn را به‌عنوان ورودی
غیرقابل‌اعتماد می‌فهمد، Intent و Route را توضیح می‌دهد و در Confidence پایین از حدس
خودداری می‌کند. این نسخه مدل زبانی یا Connector بیرونی فراخوانی نمی‌کند؛ Classification
قابل‌آزمون و deterministic است.

## قرارداد نسخه‌دار

هر پاسخ `conversation-orchestrator-v1` شامل این بخش‌هاست:

- `intent`: نوع، Confidence و Rationale؛
- `route`: ماژول مقصد، Mode، Read/Write Authority و نیاز به Approval؛
- `provenance`: فقط Turn جاری؛ Personal Memory و External Research بدون درخواست جداگانه
  خوانده نشده‌اند؛
- `safety`: تشخیص داده حساس، Prompt Injection، اقدام عمومی و Eligibility حافظه؛
- `arbitration`: Outcome، Rationale و Ruleهای اعمال‌شده؛
- `retention`: تصمیم صریح درباره ثبت محرمانه یا عدم ذخیره متن خام؛
- `recommendedAction`: مسیر UI بعدی، نه اجرای خودکار.

Intentهای MVP عبارت‌اند از Reflection، Remember، Correct Memory، Set Strategy،
Assess Action، External Research، Draft Content، Data Control و Unclear.

## Permission و Arbitration

ترتیب قواعد ثابت است:

`Privacy/Security → Data Rights/Consent → Claim/Risk → Human Approval → Utility`

- هیچ Turnی اختیار `execute` ندارد؛ Write Authority فقط `none` یا `propose_only` است.
- درخواست انتشار به Risk Center Route و تا Claim/Risk Review و Approval انسانی Hold می‌شود.
- Research بیرونی، حتی با Opt-in حافظه، به Personal Memory تبدیل نمی‌شود.
- Correction/Delete/Revoke فقط مسیر owner-controlled را باز می‌کند و در همان Turn اعمال
  نمی‌شود.
- Prompt Injection نمی‌تواند Permission یا Policy را تغییر دهد.
- اگر الگوی credential/شناسه حساس دیده شود، متن خام در Conversation Store ثبت نمی‌شود.

## Persistence

بدون Opt-in معتبر حافظه، متن خام Turn در Store ذخیره نمی‌شود. وقتی مالک صریحاً
Memory Proposal می‌خواهد و ورودی Eligible است، Turn به‌صورت `confidential` و
owner-scoped ثبت می‌شود. Migration `0019_conversation_orchestration` Snapshot بدون
کپی User Text را کنار همان Turn ثبت می‌کند. Snapshot شامل Policy، Intent، Authority،
Provenance، Safety، Arbitration و Retention است و در replay idempotent باید دقیقاً ثابت
بماند. متن حساس فقط در همان Request پردازش و با `not_persisted` پاسخ داده می‌شود.

## Smart Questioning و حدود MVP

هر پاسخ حداکثر یک سؤال contextual دارد. Intent مبهم به‌جای Route حدسی یک سؤال با
Information Gain بالا می‌گیرد. Proactivity، Rate Limiting، Attachment/Image فهم،
خواندن خودکار Memory و Research، و اجرای Delegated Action هنوز فعال نیستند و پیش از
فعال‌سازی به Permission Scope، Connector provenance، eval و monitoring مستقل نیاز دارند.

## Release gates

- Node و Worker باید Contract یکسان برگردانند؛
- Research و Personal Memory مخلوط نشوند؛
- Public action و Data Right بدون تأیید اجرا نشوند؛
- Prompt Injection اختیار را زیاد نکند؛
- داده حساس ذخیره یا به Proposal تبدیل نشود؛
- Snapshot در PostgreSQL تحت RLS، نسخه‌دار و idempotent باشد؛
- UI Intent، Confidence، Route، Authority، Approval و Retention را به مالک نشان دهد.
