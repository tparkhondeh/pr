# Platform Adaptation Contract v1.0

این سند قرارداد deterministic مرحله MVP برای تبدیل یک Mother Idea مستند به Artifact
هفت پلتفرم است. Creativity اجازه تغییر یا ساخت Claim را ندارد؛ متن منبع باید عیناً در
خروجی بماند و Claim Guard مستقل از Adaptation اجرا می‌شود.

## قرارداد مشترک

هر Draft فیلد `adaptation` با نسخه `platform-adaptation-v1` دارد و این ابعاد را
توضیح می‌دهد:

- `audienceContext`: وضعیت و انتظار مخاطب در کانال؛
- `format`: ساختار روایی مخصوص کانال؛
- `recommendedCharacters`: بازه راهنما، نه Gate تأیید؛
- `hardMaximumCharacters`: سقف قطعی و Red Guard؛
- `visualLanguage`: نقش تصویر، صدا یا سند؛
- `interactionModel`: رفتار باارزش مورد انتظار؛
- `requiredElements`: عناصر ساختاری که حذف آنها Approval را متوقف می‌کند.

`adaptation_profile_version` در `app.draft_artifacts` ذخیره می‌شود تا تغییر آینده
Profile، معنای Draftهای قبلی را بی‌صدا عوض نکند. Migration مربوط به این قرارداد
`0015_platform_adaptation_profile.sql` است.

## تفاوت کانال‌ها

| کانال | Artifact اصلی | بازه پیشنهادی | سقف | Interaction |
|---|---|---:|---:|---|
| LinkedIn | تجربه، روایت مستند، برداشت، پرسش | ۴۰۰–۱۸۰۰ | ۳۰۰۰ | نظر تخصصی و Save |
| Instagram | Visual brief، Caption، روایت، برداشت | ۳۰۰–۱۲۰۰ | ۲۲۰۰ | Save و Share |
| X | زاویه فشرده، Claim، برداشت | ۸۰–۲۴۰ | ۲۸۰ | Reply و Repost |
| YouTube | Hook، Visual cue، روایت، جمع‌بندی، CTA | ۸۰۰–۸۰۰۰ | ۱۰۰۰۰ | Watch depth و Comment |
| Podcast | Cold open، زمینه، روایت شنیداری، تأمل | ۱۰۰۰–۸۰۰۰ | ۱۰۰۰۰ | Completion و Response |
| Newsletter | Subject، Preheader، نامه و Reply prompt | ۸۰۰–۶۰۰۰ | ۱۵۰۰۰ | Reply و Forward |
| Blog | H1، مقدمه، روایت، تحلیل و جمع‌بندی | ۱۲۰۰–۱۰۰۰۰ | ۲۰۰۰۰ | Search و Deep reading |

## Gateها

1. Claim مستند باید عیناً در Artifact باشد.
2. Fact یا عدد جدید بدون Claim ثبت‌شده Red است.
3. عبور از سقف قطعی کانال Red است.
4. حذف عنصر الزامی کانال Red است.
5. تنها نسخه بدون Red Guard می‌تواند برای Approval انسانی ارسال شود.
6. Publish مستقیم خارج از Scope این نسخه است؛ خروجی نهایی Export انسانی است.

در نسخه‌های بعدی LLM می‌تواند داخل همین قرارداد Draft بسازد، اما خروجی آن همچنان باید
از Schema، Claim Check، Format Gate و Approval انسانی عبور کند.
