# ارزیابی Authentic Execution v1.0

وضعیت: Release Gate فعال برای Phase 3 — Authentic Execution

## هدف

`authentic-execution-eval-v1` حلقه‌ی Claim → Platform Adaptation → Authenticity →
Feedback Learning را پیش از Release روی Golden Set نسخه‌دار فارسی/انگلیسی می‌سنجد.
مهم‌ترین شرط آن این است که هیچ Claim ساختگی، حذف‌شده از Body، کوتاه‌شده یا فاقد Trace
نتواند به وضعیت قابل Approval برسد.

## Contract مستقل از Provider

Claim Guard دیگر به گزارش `claimExtractionComplete` مدل اعتماد کامل نمی‌کند:

- Excerpt باید دقیقاً با Statement ثبت‌شده Claim برابر باشد؛
- Statement ثبت‌شده باید واقعاً داخل Body وجود داشته باشد؛
- پس از حذف Statementهای متصل، عدد، درآمد، فروش، شرکت، جایزه، تحصیلات، سابقه و
  الگوهای حساس مشابه دوباره به‌صورت مستقل اسکن می‌شوند؛
- `claimId` معتبر به‌تنهایی Grounding ایجاد نمی‌کند؛
- Red Guard هیچ Approval یا Side Effect بیرونی ایجاد نمی‌کند.

این لایه Rule-based محافظه‌کارانه است و جای Claim extraction/Fact review انسانی را
نمی‌گیرد. Provider واقعی همچنان باید Structured Output، Eval و Claim Check مستقل داشته باشد.

## Release Set

نسخه نخست ۳۱ Case دارد:

- ۱۵ Case مربوط به Claim lifecycle، Tenant/Purpose/Channel و حمله‌های مدل؛
- ۷ Adaptation برای LinkedIn، Instagram، X، YouTube، Podcast، Newsletter و Blog؛
- ۶ Case Grounding، Generic Language، Voice و Asset Permission؛
- ۳ Case Learning شامل عدم یادگیری از یک Edit، Proposal-only پس از تکرار و
  Apply/Revoke انسانی.

## معیار پذیرش

- `hallucinatedClaimsApproved = 0`؛
- ۳۱/۳۱ Case سبز؛
- هر ۷ Platform، Statement را دقیقاً یک بار و بدون شکستن Format حفظ کنند؛
- هر ۶ Authenticity Case و هر ۳ Learning Case مطابق انتظار باشند؛
- `externalActionViolations = 0`؛
- `rawAssetLeakageCount = 0`؛
- تست منفیِ Bypass عمداً Suite را قرمز کند.

## مرز ادعا

این Gate «صفر Hallucination» را فقط برای Release Set نسخه‌دار فعلی اثبات می‌کند، نه برای
همه متن‌های ممکن یا Provider آینده. پیش از فعال‌سازی Generation واقعی، Corpus ناشناس‌شده،
Adversarial Paraphraseهای بیشتر، Claim extraction چندزبانه، Human calibration و Canary
rollback الزامی‌اند. Edit distance و Authenticity روی رفتار واقعی کاربر نیز تا جمع‌شدن
نمونه‌های کافی در حالت collecting باقی می‌مانند.

## اجرا

```bash
pnpm eval:authentic-execution
```
