# Connector Lifecycle v1.0

وضعیت: قرارداد و Release Gate پیاده‌سازی‌شده؛ Adapter، OAuth، Network و Outbound Execution غیرفعال

## هدف

`connector-lifecycle-v1` مرز مشترک همه اتصال‌های بیرونی را پیش از انتخاب Provider تثبیت
می‌کند. هدف این Slice فعال‌کردن Connector نیست؛ هدف این است که هیچ Adapter آینده‌ای
نتواند بدون Scope محدود، Review انسانی، برنامه ابطال و کنترل Incident وارد Runtime شود.

## پروفایل‌های فعلی

| Connector | Risk | Data | Retention max | Rate max | Runtime |
|---|---|---|---:|---:|---|
| Web Research | Yellow | public/internal | ۳۰ روز | ۲۰/ساعت | disabled |
| Calendar | Red | internal/confidential metadata | ۱۴ روز | ۳۰/ساعت | disabled |
| Email | Red | internal/confidential metadata | ۷ روز | ۱۰/ساعت | disabled |
| CRM | Red | internal/confidential metadata | ۳۰ روز | ۲۰/ساعت | disabled |
| Social Listening | Red | public/internal metadata | ۱۴ روز | ۲۰/ساعت | disabled |
| Publishing | Red | approved public/internal draft | ۱ روز | ۲/ساعت | disabled |

هر پروفایل Purpose، Operation، Data Class، Channel، Resource Type و سیاست داده شخص ثالث
مستقل دارد. `restricted` در MVP مجاز نیست و Scope ثبت‌شده فقط می‌تواند زیرمجموعه پروفایل
باشد.

## ثبت و Credential isolation

ثبت فقط توسط مالک و با سه Attestation صریح انجام می‌شود: Human Review، Privacy Review
و Revocation Plan. ورودی فقط کلیدهای تعریف‌شده را می‌پذیرد و فیلد Secret اضافی را رد
می‌کند. Raw Credential در این سرویس پذیرفته یا نگه‌داری نمی‌شود؛ پروفایل‌های نیازمند
Credential فقط یک SHA-256 reference می‌پذیرند.

Registration همیشه با وضعیت `registered_disabled` ساخته می‌شود و این سه مقدار قطعی‌اند:

- `externalNetworkCallsPermitted=false`؛
- `outboundExecutionPermitted=false`؛
- `rawCredentialRetained=false`.

## Authorization و فعال‌سازی

Authorization برای Scope، Tenant/Owner، Expiry، Third-party Data، Rate Limit، Approval
و Credential Reference Finding توضیح‌پذیر تولید می‌کند. با این حال Runtime فعلی به‌طور
سراسری خاموش است؛ بنابراین حتی درخواست درون Scope نیز `connector_runtime_disabled` و
`connector_not_active` می‌گیرد و External Action صادر نمی‌شود.

چهار Blocker فعال‌سازی برای همه پروفایل‌ها وجود دارد:

1. Adapter انتخاب و پیکربندی نشده؛
2. Runtime سراسری خاموش است؛
3. Approval Token کوتاه‌عمر وجود ندارد؛
4. Revocation Drill مخصوص همان Provider اجرا نشده است.

## Revocation و deletion propagation

ابطال، State را با Version و Request ID کنترل می‌کند و برنامه پاک‌سازی اجباری می‌سازد:

1. لغو کار درحال اجرا؛
2. ابطال Grant سمت Provider، اگر وجود داشته باشد؛
3. نابودی Credential Reference متصل؛
4. پاک‌سازی Cache؛
5. حذف داده مشتق‌شده؛
6. ثبت Receipt Hash و Attestation انسانی.

تا همه موارد تأیید نشوند وضعیت `revocation_verified` صادر نمی‌شود. Timestamp قدیمی،
Version stale و Terminal replay با Fail-closed رد می‌شوند.

## Incident containment

Incident معتبر Connector را بلافاصله `suspended`، داده را `quarantined` و Credential
متصل را `rotation_required` می‌کند. Outbound و Network خاموش می‌مانند و فقط Evidence
Hash نگه‌داری می‌شود؛ Raw incident payload وارد رکورد نمی‌شود.

## سطح مشاهده

`GET /api/connectors` Snapshot مالک را برمی‌گرداند. Preview Worker و UI همان قرارداد را
نشان می‌دهند و Export مالک نیز Snapshot را دارد. این Endpoint Mutation، OAuth Start یا
Activation Route ندارد.

## مرز Persistence

در این Slice Registration واقعی ذخیره نمی‌شود، چون Adapter و Secret Store انتخاب نشده‌اند.
افزودن Migration قبل از انتخاب Provider می‌توانست مدل نادرست Credential و Revocation را
تثبیت کند. Persistence فقط همراه Adapter واقعی، RLS، Audit/Outbox، encrypted secret
reference و Drill اختصاصی اضافه می‌شود.

## شرط هر Connector واقعی

Scope مستقل مالک، Privacy review داده شخص ثالث، Field allowlist، Session-bound Approval
Token کوتاه‌عمر، Secret Store، Resolver/Network policy، Provider-specific rate limit،
idempotency، audit، deletion propagation، revocation receipt، incident drill، canary و
rollback همگی پیش از هر `shadow/canary/active` شدن الزامی‌اند.
