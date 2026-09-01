# Authentic Expression Gate v1.0

این قرارداد شکاف بین Asset، Narrative، Voice Learning، Authenticity Guard و
Anti-Generic AI Gate را در MVP می‌بندد، بدون اینکه یک Brand Persona جعلی یا Fact جدید
تولید کند.

## قرارداد

- هر Narrative Seed فقط از Text Asset دارای `brandUsage=true` ساخته می‌شود و تا زمانی
  که شواهد مستقل بیشتری نداشته باشد `single_source` و `evidence_backed_candidate` است؛
  Seed به‌تنهایی Brand Fact یا Core Narrative نیست.
- Voice فقط از Preferenceهای پیشنهادشده و تأییدشدهٔ Feedback Engine خوانده می‌شود.
  Proposal هیچ‌وقت خودکار اعمال نمی‌شود و Preference تأییدشده نیز قابل لغو است.
- Review چهار Finding قطعی و توضیح‌پذیر دارد: grounding، personal specificity،
  generic language و voice alignment.
- نبود Asset مجاز نتیجه را `block` می‌کند. کلیشه، ضعف جزئیات شخصی یا تعارض Voice نتیجه
  را `revise` می‌کند. `pass` به معنی Fact Check، Claim Approval یا Publish Approval نیست.
- Review هیچ داده‌ای ذخیره و هیچ External Action اجرا نمی‌کند.
- رفتار این Gate همراه Claim، هفت Platform و Learning در Release Set نسخه‌دار
  `authentic-execution-eval-v1` سنجیده می‌شود؛ Raw Asset نباید در Report ظاهر شود.

## مرزهای قطعی MVP

- Narrative Seed با Core Narrative، Signature Story یا Brand DNA نهایی یکی نیست.
- تشخیص عبارت Generic بر پایه Rule Set نسخه‌دار است و جای Evaluator انسانی یا مدل آینده
  را نمی‌گیرد.
- تطبیق واژگان صرفاً Signal اختصاصی‌بودن است؛ اثبات صدق ادعا نیست.
- Fact/Claim Check در Claim Registry و Research Layer باقی می‌ماند.
- انتشار همچنان در Approval/Export workflow و Brand Protection Guard متوقف می‌شود.

## حریم خصوصی

Snapshot فقط برای مالک است. محتوای کامل Asset در Narrative Seed تکرار نمی‌شود؛ فقط
عنوان، assertion مجاز و شناسه‌های Trace نمایش داده می‌شوند. خروجی Review با
`externalActionPermitted=false` و بدون Side Effect است.
