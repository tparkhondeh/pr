# Strategic Outcome Follow-up v1.0

وضعیت: پیاده‌سازی‌شده در Phase 2 — خط مبنای پیامد انسانی در حالت `collecting`

## هدف

این قرارداد فاصله میان «پذیرفتن توصیه» و «نتیجه واقعی اقدام» را ثبت می‌کند. موفقیت با
Like، View یا یک برداشت لحظه‌ای تعریف نمی‌شود؛ مالک پس از یک Action پذیرفته‌شده،
پیامد قابل‌ردیابی آن را گزارش می‌کند.

نسخه سیاست: `strategic-outcome-followup-v1`

## مرز الزام‌آور

- Follow-up فقط به یک `StrategicRecommendationReview` جاری با تصمیم `accepted` متصل می‌شود؛
- Review ردشده، نیازمند بازنگری یا superseded نمی‌تواند پیامد معتبر بسازد؛
- زمان پیامد نمی‌تواند قبل از زمان Review یا بیش از پنج دقیقه در آینده باشد؛
- هر اصلاح، رکورد append-only تازه با `supersedesOutcomeId` می‌سازد؛
- درخواست‌ها idempotent هستند و Replay با Payload متفاوت Conflict می‌شود؛
- ثبت پیامد هیچ Identity، Voice، Strategy، Approval یا External Action را خودکار تغییر نمی‌دهد.

## Signalهای معنادار

مالک این موارد را ثبت می‌کند:

- وضعیت اجرا: کامل، بخشی یا انجام‌نشده؛
- رضایت، پشیمانی و انرژی کاربر از ۱ تا ۵؛
- کیفیت و عمق تعامل به‌صورت اختیاری؛
- پیام خصوصی، فرصت ایجادشده و فرصت رسانه‌ای؛
- تغییر رابطه و تغییر ادراک؛
- Outcome کسب‌وکار در سطح `none`، `early_signal`، `material` یا `unknown`؛
- توضیح کیفی اختیاری بدون ذخیره هویت اشخاص ثالث.

Like، View و Follower در این قرارداد ورودی موفقیت نیستند. شمارش‌ها بدون Context کیفی
به‌تنهایی موجب تغییر راهبرد نمی‌شوند.

## خط مبنا

`observedMetrics` پس از نخستین Follow-up فقط مشاهده موقت است. تا قبل از پنج پیامد
مستقل و جاری:

- وضعیت `collecting` است؛
- `baselineMetrics` برابر `null` می‌ماند؛
- محصول ادعای موفقیت یا کالیبراسیون نمی‌کند.

پس از پنج نمونه، حداقل baseline آماری ایجاد می‌شود؛ این حداقل به‌تنهایی جای Expert
Review یا تصمیم مالک را نمی‌گیرد. Metricها شامل Follow-through، Completion، میانگین
رضایت/پشیمانی/انرژی و شمار Signalهای رابطه، ادراک، رسانه و کسب‌وکار هستند.

## ذخیره و دسترسی

Migration `0026_strategic_action_outcomes` دو جدول RLS-protected می‌سازد:

- `app.strategic_action_outcomes` برای تاریخچه append-only؛
- `app.strategic_outcome_requests` برای Idempotency.

هر Mutation در PostgreSQL همراه Audit و Outbox حداقلی ثبت می‌شود. متن Note و عنوان
Action وارد Audit Metadata نمی‌شود. Store حافظه‌ای Node و Worker نسخه خصوصی Sites
همین قرارداد را فقط برای Preview اجرا می‌کنند و با Restart پاک می‌شوند.

## API و UI

- `GET /api/strategic-quality`
- `POST /api/strategic-quality/outcomes`

نمای «یادگیری» فقط Reviewهای پذیرفته‌شده جاری را برای Follow-up نشان می‌دهد، وضعیت
جمع‌آوری baseline را صریح می‌نویسد و امکان ساخت نتیجه جعلی برای توصیه ردشده ندارد.

## خارج از Scope

- اتصال خودکار Analytics یا Social Listening؛
- استنتاج Perception Shift از Like و View؛
- تغییر خودکار Identity یا Strategy؛
- تماس، انتشار یا اجرای بیرونی؛
- نسبت دادن هویت اشخاص ثالث به پیام‌ها یا فرصت‌ها.
