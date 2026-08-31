# Data & Policy Kernel v1.0

## وضعیت

Migration اولیه در `db/migrations/0001_foundation.sql` تعریف شده است. این Migration هنوز روی PostgreSQL واقعی اجرا نشده، زیرا محیط لوکال و سرور فعلی PostgreSQL/Docker ندارند. تست integration واقعی پیش از Production اجباری است.

## تضمین‌های طراحی

- تمام جدول‌های داده کاربر `tenant_id` دارند.
- Foreign Keyهای مرکب از ارجاع تصادفی بین Tenantها جلوگیری می‌کنند.
- RLS و `FORCE ROW LEVEL SECURITY` برای جدول‌های Tenant-owned فعال‌اند.
- Tenant فعال از transaction-local setting با نام `app.tenant_id` خوانده می‌شود.
- Consent با Purpose، Operation، Data Class، Audience، Channel، Expiry و Revocation ثبت می‌شود.
- Evidence از Assertion جداست و Assertion می‌تواند support یا contradiction داشته باشد.
- Assertion زمان اعتبار، epistemic type، confidence rationale، contest و superseding دارد.
- Audit append-only است.
- Outbox برای side effectهای asynchronous و قابل retry در همان transaction قرار دارد.
- Migration checksum دارد و تغییر Migration اعمال‌شده رد می‌شود.

## الزام اتصال دیتابیس

هر request باید داخل transaction مقدار زیر را تنظیم کند:

```sql
SELECT set_config('app.tenant_id', $1, true);
```

استفاده از connection بدون transaction ممنوع است، زیرا context نباید بین connectionهای pool نشت کند.

## Gate باقیمانده

در اولین محیط PostgreSQL آزمایشی باید موارد زیر با role غیر-superuser اثبات شوند:

1. Migration clean apply و rollback/rebuild؛
2. read/write بین دو Tenant برابر صفر؛
3. نبود tenant context مساوی deny؛
4. عدم امکان UPDATE/DELETE روی audit؛
5. عدم امکان Foreign Key بین Tenantها؛
6. revoke/expiry consent؛
7. اجرای backup و restore.
