# Perception Engine v1.0

## هدف Slice

این Slice فاصله‌ی میان `Self Perception`، `Desired Positioning` و
`External Perception` را به‌صورت کیفی، قابل توضیح و قابل حذف نگه می‌دارد. نظر مالک
`self_report` است، هدف جایگاه‌یابی Claim محسوب نمی‌شود و نظر دیگران همیشه
`external_perception` باقی می‌ماند؛ هیچ‌کدام به Fact ارتقا داده نمی‌شوند.

## قرارداد داده

- هر Signal یک بُعد، Perspective، Stage کیفی، خلاصه، Evidence Note، نوع منبع،
  Confidence، تاریخ مشاهده و رضایت صریح دارد.
- Stageها فقط زبان مشترک مالک برای مقایسه‌اند: `not_visible`، `emerging`، `visible`،
  `strong` و `signature`. سیستم Score پنهان یا میانگین وزن‌دار تولید نمی‌کند.
- منبع External فقط یک نوع منبع است؛ نام، ایمیل، شماره تماس یا شناسه‌ی شخص منبع
  ذخیره نمی‌شود و نقل‌قول خصوصی Verbatim وارد این Slice نمی‌شود.
- تمام Signalها `confidential` و Purpose-bound به `perception_analysis` هستند.

## تحلیل قطعی

- برای Self و Desired، آخرین Signal هر بُعد نمایش داده می‌شود.
- External Signalها حذف یا هموار نمی‌شوند؛ Range و تعداد اختلاف Stageها حفظ می‌شود.
- Gap فقط یکی از `insufficient_evidence`، `aligned_range`، `underrecognized` یا
  `exceeds_target` است.
- Blind Spot فقط یکی از `insufficient_evidence`، `within_external_range`،
  `self_higher_than_external` یا `self_lower_than_external` است.
- خروجی Gap یا Blind Spot توصیه به انتشار، تماس یا تغییر هویت نیست؛ فقط یک مشاهده‌ی
  قابل بازبینی برای مالک است.

## حریم خصوصی و مرزها

- ورود داده کاملاً دستی و Owner-only است و تأیید می‌کند مالک حق ثبت خلاصه را دارد.
- 360 Interview، Social Listening، Survey Collection، Import پیام، Connector،
  Source Identity و External Outreach خارج از Scope هستند.
- ایجاد و Hard Delete، idempotent و RLS-protected است. Journal و Audit فقط ID و
  Policy Version را نگه می‌دارند و متن Signal را کپی نمی‌کنند.
- Account Export فقط Signalهای فعال را برمی‌گرداند.

## API پیشنهادی این Slice

- `GET /api/perception`
- `POST /api/perception/signals`
- `POST /api/perception/signals/:id/delete`

## Definition of Done

- جداسازی سه Perspective و Epistemic Type؛
- حفظ Range/تناقض و اعلام داده ناکافی؛
- عدم ذخیره هویت منبع و عدم جمع‌آوری یا اقدام بیرونی؛
- Hard Delete، Idempotency، Audit حداقلی و Tenant RLS؛
- Parity میان Node و Worker؛
- UI فارسی و حضور در Account Export.
