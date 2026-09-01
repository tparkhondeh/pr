# cPanel private preview deployment

این پیکربندی برای استقرار آزمایشی `pr.wealthos.ir` روی ساختار فعلی cPanel است:

- Source: `/home/wealthos/apps/pr`
- Document Root: `/home/wealthos/pr.wealthos.ir`
- Node API: `127.0.0.1:31056` زیر PM2 با Bundle مستقل `runtime/main.cjs`
- Frontend: خروجی `apps/web/dist`
- Access: اجباری از طریق HTTP Basic Auth؛ فایل Hash در
  `/home/wealthos/pr.wealthos.ir/.htpasswd` است، با ACL فقط برای Worker وب و Deny
  صریح در Apache. مقدار Password هیچ‌وقت وارد Git یا Archive نمی‌شود.

`.htaccess` تمام Preview محافظت‌شده را به Node داخلی Proxy می‌کند. Node هم API و هم
SPA ساخته‌شده در `PR_STATIC_ROOT` را سرو می‌کند. این مسیر از محدودیت مالکیت فایل‌های
Static در cPanel عبور می‌کند، بدون اینکه Basic Auth حذف شود. اگر `mod_proxy` یا Proxy
از `.htaccess` روی Host مجاز نباشد، استقرار باید Fail closed و به Backup قبلی برگردد؛
حذف Basic Auth برای دورزدن این محدودیت مجاز نیست.

`PR_BIND_HOST` در Production فقط می‌تواند loopback صریح (`127.0.0.1` یا `::1`)
باشد. استفاده از wildcardهایی مانند `0.0.0.0` یا `::` در Bootstrap رد می‌شود تا
پورت Node نتواند Basic Auth و Proxy دامنه را دور بزند.

Backend این Preview تا زمان Provision شدن PostgreSQL با Store حافظه‌ای اجرا می‌شود؛
Restart پروسه state را پاک می‌کند. این تنظیم برای Production نهایی نیست. Production
به احراز هویت واقعی، PostgreSQL دارای Backup و ثبت PM2 Startup توسط مالک cPanel نیاز
دارد.

فعال‌سازی PostgreSQL فقط پس از دریافت Database و دو Role جدا از مالک cPanel انجام
می‌شود. Listener یا Credential مربوط به پروژه دیگری قابل استفاده نیست. commissioning
از Full Checkout و با `pnpm db:commission` انجام می‌شود؛ Migration credential بعد از
موفقیت از محیط حذف و فقط `DATABASE_URL` محدود، `PR_TENANT_ID` و
`PR_OWNER_USER_ID` از Secret Store وارد Runtime می‌شوند. برای Database بیرون از
loopback، `sslmode=verify-full` اجباری است.

فرایند Bootstrap در `NODE_ENV=production` بدون PostgreSQL به‌صورت پیش‌فرض Fail closed
است. این Preview خصوصی عمداً `PR_ALLOW_EPHEMERAL_PRODUCTION=true` دارد؛ بنابراین
`GET /ready` باید تا زمان اتصال دیتابیس، `persistence=memory` و
`durability=ephemeral` گزارش کند. هنگام Provision شدن PostgreSQL باید Override حذف و
هر سه متغیر `DATABASE_URL`، `PR_TENANT_ID` و `PR_OWNER_USER_ID` هم‌زمان از Secret
Store محیط تنظیم شوند. وجود هم‌زمان دیتابیس و Override خطای پیکربندی است.
