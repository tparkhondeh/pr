# Opportunity Radar v1.0

این Slice فقط Sourceهای ثبت‌شده در Research Workspace را در برابر Strategy فعلی
ارزیابی می‌کند. هیچ News/Social/Media Monitoring خودکار یا Connector بیرونی ندارد.

## اصل تصمیم

`Trend != Opportunity`. هر Source با پنج عامل مستقل و قابل مشاهده بررسی می‌شود:

- Goal alignment؛
- Audience/Positioning alignment؛
- Timing/Freshness؛
- Source Quality؛
- Conflict/Contradiction.

هیچ Utility Score پنهان یا Average واحدی ساخته نمی‌شود. خروجی یکی از چهار حالت
`ignore`، `monitor`، `explore` یا `consider` است. حتی `consider` فقط یعنی ورود به
Strategy Review؛ Action Recommendation، Public Approval و External Action نیست.

## Exploration Budget

در هر Snapshot حداکثر یک Source تازه و معتبر که تناسب مستقیم آن اثبات نشده، به‌عنوان
`explore` نشان داده می‌شود. سایر گزینه‌های مجاور در `monitor` می‌مانند. این Budget
قطعی و توضیح‌پذیر است تا Filter Bubble کاهش یابد، بدون اینکه Serendipity به مزاحمت یا
توصیه بی‌ریشه تبدیل شود.

## Fail-closed

- Source stale یا unverified به Opportunity تبدیل نمی‌شود.
- تعارض یا Stance مخالف فقط `monitor/research_more` می‌گیرد.
- نبود Alignment با Popularity جایگزین نمی‌شود.
- خروجی Radar Fact Check، Risk Review، Attention Cost یا تصمیم نهایی Strategy نیست.
- هر Strategy revision، Snapshot تازه و ارزیابی دوباره می‌طلبد.
