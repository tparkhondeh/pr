# cPanel private preview deployment

## پایلوت پایدار تک‌مالک — سپتامبر ۲۰۲۶

وضعیت زنده/آخرین انتشار در `docs/operations/project-status-and-roadmap.md` ثبت می‌شود.
PostgreSQL اختصاصی PR در `.infrastructure/pgsql`، داده و secrets در `.private` با
مجوز 0700/0600 هستند. پورت 31556 فقط loopback؛ هیچ DB یا سرویس پروژهٔ دیگری استفاده نمی‌شود.
`scripts/install-private-postgres.sh` نصب از منبع رسمی با بررسی SHA256، و
`scripts/private-postgres-bootstrap.ts` ساخت cluster و دو نقش محدود را انجام می‌دهند.
commissioning فقط با `scripts/postgres-commission.ts --private-server` به هر دو نقش دسترسی دارد.

فایل `.private/runtime-candidate.json` پس از commissioning/restore/canary به
`.private/runtime.json` منتقل/کپی می‌شود. ecosystem تنها سه مقدار runtime را بارگذاری
و ephemeral را false می‌کند؛ credential مهاجرت وارد فرایند وب نمی‌شود.
نبود runtime.json فقط برای preview قدیمی memory مجاز است، نه بازگشت پس از پذیرش دادهٔ پایدار.

ابزارهای نگهداری به CJS در `runtime` bundle می‌شوند:

- `private-postgres-backup.cjs`: dump رمزگذاری‌شده؛ `--restore` بازسازی در DB تازه و تطبیق fingerprint همهٔ جدول‌ها.
- `private-services.cjs --install-cron`: حفظ و backup crontab موجود، backup روزانه ساعت 02:17 به وقت سرور و recovery اختصاصی PR در reboot.
- `private-services.cjs --recover`: فقط PG/وب PR را برمی‌گرداند؛ جایگزین آزمون reboot واقعی میزبان نیست.

نگهداری نمونهٔ خارج سرور و کلید رمزگذاری باید جدا و امن احراز شود. backup restore با
`--no-owner --no-privileges` است؛ برای بازگرداندن کامل سرویس باید ownership نقش migration،
grantهای runtime و commissioning در مقصد ایزوله برقرار و readiness/RLS دوباره آزموده شوند.
صرف برابری dump اثبات RTO کامل سرویس نیست. PITR و حذف خودکار retention پیاده نشده‌اند.
زیر ۱GiB فضای آزاد، backup برای جلوگیری از پرکردن دیسک fail می‌شود؛ بررسی خطا/ظرفیت لازم است.

این نصب تک‌مالک با Basic Auth است. حساب مشترک را به دیگران ندهید؛ multi-user login و
SIWC/session قبل از onboarding اشخاص دیگر لازم‌اند. Provider بدون بودجه/رضایت/secret فعال نمی‌شود.

## پیکربندی تاریخی Preview و قواعد پایه

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
