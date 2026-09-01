# Stakeholder & Relationship Intelligence v1.0

## هدف Slice

این Slice نخستین نقشه‌ی Stakeholder و Context رابطه را به حلقه‌ی استراتژی اضافه می‌کند،
بدون آنکه رابطه‌ی انسانی را به CRM سرد یا موتور تماس خودکار تبدیل کند. کاربر فقط اطلاعاتی
را که خودش انتخاب می‌کند، با رضایت صریح و برای `relationship_planning` ثبت می‌کند.

## قرارداد داده

- `label` یک نام یا برچسب خصوصی است؛ Contact Detail ذخیره نمی‌شود.
- هر Stakeholder به یک گروه، Outcome، Priority و Strength کیفی متصل است.
- `contextNote` و تمام Record با کلاس `confidential` نگه‌داری می‌شوند.
- تاریخ آخرین تعامل اختیاری است و Future Date پذیرفته نمی‌شود.
- Boundary یکی از `normal`، `ask_before_prompt` یا `do_not_prompt` است.
- Policy ثابت `relationship-intelligence-v1` هیچ مجوز Public Use یا Outbound Contact نمی‌دهد.

## تحلیل قطعی و قابل توضیح

سیستم Score عددی پنهان تولید نمی‌کند. Recency فقط به دسته‌های `recent`، `quiet`،
`dormant`، `unknown` یا `protected` تبدیل می‌شود. برای Stakeholder پر‌اولویت، نبود Context
یا Dormant بودن می‌تواند فقط «مرور Context» را پیشنهاد کند؛ هیچ متن تماس یا اقدام خودکار
ساخته نمی‌شود. `ask_before_prompt` نیاز به Approval را آشکار می‌کند و `do_not_prompt`
هر Cue را خاموش می‌کند.

## حقوق و ایمنی

- ایجاد و حذف Hard Delete، Owner-only، Idempotent و Audit شده‌اند؛ Journal فقط ID را
  نگه می‌دارد و پس از حذف هیچ Label یا Context Note در Idempotency Snapshot باقی نمی‌ماند.
- RLS اجباری روی Recordها و Request Journal فعال است.
- Audit و Outbox فقط ID، Policy Version و نبود Contact Detail را نگه می‌دارند؛ نه
  Label، Group، Priority، Boundary یا Context Note.
- Account Export فقط Recordهای فعال را شامل می‌شود.
- Connector، Import دفترچه تماس، 360 Interview، Social Graph، Introduction Recommendation
  و ارسال پیام خارج از Scope این Slice هستند.

## API

- `GET /api/relationships`
- `POST /api/relationships/stakeholders`
- `POST /api/relationships/stakeholders/:id/delete`

## Definition of Done

- تفکیک گروه Stakeholder، Outcome، Priority، Strength، Recency و Boundary؛
- عدم ذخیره Contact Detail و عدم Side Effect بیرونی؛
- Idempotency و حذف قابل تکرار؛
- Tenant RLS و Integration Test؛
- Parity میان Node و Worker؛
- UI فارسی برای ثبت، مشاهده و حذف؛
- حضور در Audit و Account Export.
