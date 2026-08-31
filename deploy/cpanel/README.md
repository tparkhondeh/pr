# cPanel private preview deployment

این پیکربندی برای استقرار آزمایشی `pr.wealthos.ir` روی ساختار فعلی cPanel است:

- Source: `/home/wealthos/apps/pr`
- Document Root: `/home/wealthos/pr.wealthos.ir`
- Node API: `127.0.0.1:31056` زیر PM2 با Bundle مستقل `runtime/main.cjs`
- Frontend: خروجی `apps/web/dist`
- Access: اجباری از طریق HTTP Basic Auth؛ فایل رمز خارج از Document Root در
  `/home/wealthos/apps/pr/runtime/.htpasswd`

`.htaccess` فقط `/api`، `/health` و `/ready` را به Node داخلی Proxy می‌کند و سایر
درخواست‌ها را به SPA می‌فرستد. اگر `mod_proxy` یا Proxy از `.htaccess` روی Host مجاز
نباشد، استقرار باید Fail closed و به Backup قبلی برگردد؛ حذف Basic Auth برای دورزدن
این محدودیت مجاز نیست.

Backend این Preview تا زمان Provision شدن PostgreSQL با Store حافظه‌ای اجرا می‌شود؛
Restart پروسه state را پاک می‌کند. این تنظیم برای Production نهایی نیست. Production
به احراز هویت واقعی، PostgreSQL دارای Backup و ثبت PM2 Startup توسط مالک cPanel نیاز
دارد.
