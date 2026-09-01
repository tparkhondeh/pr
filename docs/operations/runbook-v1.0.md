# Operations Runbook v1.0

## وضعیت فعلی

این Runbook قرارداد عملیاتی Foundation است. CI روی PostgreSQL 16 واقعی migrations،
RLS و logical dump/restore را در یک دیتابیس تازه drill می‌کند و RTO را در Job Summary
ثبت می‌کند. محیط Production PostgreSQL هنوز provision نشده است؛ Gate نهایی Production
تا اجرای restore drill روی سرویس واقعی و تأیید retention/TLS بسته می‌ماند.

## Health semantics

- `GET /health`: فقط زنده‌بودن Process؛ وابستگی‌ها را بررسی نمی‌کند.
- `GET /ready`: آمادگی دریافت Traffic؛ در خطای DB، migration، policy store یا dependency حیاتی باید `503` بدهد.
- Runtime DB principal باید non-superuser، بدون `BYPASSRLS` و با `row_security=on`
  باشد؛ migration journal نیز باید دقیقاً روی آخرین نسخه Schema باشد. در غیر این صورت
  `/ready` با `database_role_unsafe` یا `database_schema_outdated` برابر `503` می‌شود.

Load balancer فقط باید `/ready` را مبنای Routing قرار دهد.

## Commissioning امن PostgreSQL

فعال‌سازی Persistence با یک URL یا Role مشترک مجاز نیست. دو Principal مستقل لازم است:

- `PR_MIGRATION_DATABASE_URL`: مالک Migration با مجوز DDL؛ فقط هنگام commissioning.
- `DATABASE_URL`: Role محدود Runtime؛ non-superuser، بدون `BYPASSRLS`، با
  `row_security=on` و بدون `CREATE` روی Database یا Schema عمومی.

برای Host غیر-loopback هر دو URL باید `sslmode=verify-full` داشته باشند. اتصال بدون TLS
یا `sslmode=require` به‌تنهایی Gate را رد می‌کند، چون احراز نام Host و Certificate را
تضمین نمی‌کند. اتصال loopback یا Unix socket می‌تواند از Transport محلی استفاده کند.

متغیرهای commissioning علاوه بر دو URL عبارت‌اند از `PR_TENANT_ID`،
`PR_OWNER_USER_ID`، `PR_TENANT_SLUG`، `PR_TENANT_DISPLAY_NAME` و
`PR_OWNER_EXTERNAL_SUBJECT`. پس از تزریق از Secret Store:

```bash
pnpm db:commission
```

این فرمان قبل از فعال‌سازی Runtime، Roleها را جدا بودن بررسی می‌کند، Migrationهای
append-only را زیر Advisory Lock اجرا می‌کند، فقط دسترسی لازم Schema `app` را می‌دهد،
Tenant/Owner را idempotent می‌سازد و سپس Schema، RLS visibility و نبود مجوز `CREATE`
را از اتصال Runtime دوباره می‌سنجد. URLها و Password در خروجی چاپ نمی‌شوند.

پس از موفقیت، `PR_MIGRATION_DATABASE_URL` باید از محیط Runtime حذف شود. سپس Override
موقت `PR_ALLOW_EPHEMERAL_PRODUCTION` حذف و سرویس با سه متغیر Runtime reload می‌شود.
`/ready` فقط وقتی `persistence=postgres` و `durability=persistent` است Gate را می‌بندد.

وجود listener PostgreSQL به معنی مجاز یا امن بودن آن نیست. هیچ endpoint عمومی فاقد
TLS، Role ناشناخته یا Database متعلق به Application دیگر نباید برای این پروژه Adopt شود.

## Backup policy پیشنهادی

- PostgreSQL: backup روزانه + PITR؛ رمزگذاری و retention حداقل ۳۰ روز برای MVP آزمایشی.
- Object storage: versioning + lifecycle؛ inventory روزانه برای orphan detection.
- Vector index و cache: backup الزامی نیست؛ باید از source of truth بازسازی شوند.
- Secretها هرگز داخل backup اپلیکیشن یا Git قرار نگیرند.

## Restore drill اجباری

1. یک محیط ایزوله جدید بساز.
2. آخرین backup تأییدشده را restore کن.
3. migration checksum و schema version را بررسی کن.
4. تعداد Tenant/Asset/Evidence/Consent/Audit را با manifest مقایسه کن.
5. RLS tests را با role غیر-superuser اجرا کن.
6. نمونه objectها و integrity hash را بررسی کن.
7. `/ready` و workflow smoke test را اجرا کن.
8. RPO/RTO واقعی را ثبت کن؛ سپس backup را `restorable` علامت بزن.

Backup بدون restore drill، backup تأییدشده محسوب نمی‌شود.

CI drill فقط portability منطقی Schema و RPO صفر برای snapshot آزمایشی را اثبات می‌کند؛
جایگزین PITR، encryption، retention و restore آزموده‌شده سرویس Production نیست.

## Incident levels

- SEV-1: cross-tenant leak، public exposure، destructive data loss.
- SEV-2: unavailable service، incorrect public recommendation بدون exposure حساس.
- SEV-3: degraded workflow، provider outage، budget circuit open.

در SEV-1: public actions متوقف، credentials مرتبط rotate، evidence حفظ، مالک محصول مطلع و incident timeline ثبت شود.

## Deployment safety

- فقط Commit سبز و Push‌شده به `main` قابل Deploy است.
- release باید exact commit SHA داشته باشد.
- Deploy اتمیک و rollback به release قبلی باشد.
- بعد از هر Deploy یا Rollback، listener باید فقط روی loopback باشد؛ درخواست مستقیم
  به IP عمومی و پورت Node باید fail، درخواست loopback باید `200` و دامنه بدون Basic
  Auth باید `401` شود. عبور نکردن هرکدام trigger فوری rollback است.
- schema change از الگوی expand/migrate/contract پیروی کند.
- Smoke test دامنه: TLS، status، `/health`، `/ready` و نسخه release.
