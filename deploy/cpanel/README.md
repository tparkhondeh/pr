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

Backend این Preview تا زمان Provision شدن PostgreSQL با Store حافظه‌ای اجرا می‌شود؛
Restart پروسه state را پاک می‌کند. این تنظیم برای Production نهایی نیست. Production
به احراز هویت واقعی، PostgreSQL دارای Backup و ثبت PM2 Startup توسط مالک cPanel نیاز
دارد.

فرایند Bootstrap در `NODE_ENV=production` بدون PostgreSQL به‌صورت پیش‌فرض Fail closed
است. این Preview خصوصی عمداً `PR_ALLOW_EPHEMERAL_PRODUCTION=true` دارد؛ بنابراین
`GET /ready` باید تا زمان اتصال دیتابیس، `persistence=memory` و
`durability=ephemeral` گزارش کند. هنگام Provision شدن PostgreSQL باید Override حذف و
هر سه متغیر `DATABASE_URL`، `PR_TENANT_ID` و `PR_OWNER_USER_ID` هم‌زمان از Secret
Store محیط تنظیم شوند. وجود هم‌زمان دیتابیس و Override خطای پیکربندی است.
