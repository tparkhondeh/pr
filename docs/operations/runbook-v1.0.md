# Operations Runbook v1.0

## وضعیت فعلی

این Runbook قرارداد عملیاتی Foundation است. Backup/restore واقعی PostgreSQL هنوز اجرا نشده، چون محیط PostgreSQL تأییدشده در اختیار نیست. Production Gate تا اجرای موفق آن بسته می‌ماند.

## Health semantics

- `GET /health`: فقط زنده‌بودن Process؛ وابستگی‌ها را بررسی نمی‌کند.
- `GET /ready`: آمادگی دریافت Traffic؛ در خطای DB، migration، policy store یا dependency حیاتی باید `503` بدهد.

Load balancer فقط باید `/ready` را مبنای Routing قرار دهد.

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

## Incident levels

- SEV-1: cross-tenant leak، public exposure، destructive data loss.
- SEV-2: unavailable service، incorrect public recommendation بدون exposure حساس.
- SEV-3: degraded workflow، provider outage، budget circuit open.

در SEV-1: public actions متوقف، credentials مرتبط rotate، evidence حفظ، مالک محصول مطلع و incident timeline ثبت شود.

## Deployment safety

- فقط Commit سبز و Push‌شده به `main` قابل Deploy است.
- release باید exact commit SHA داشته باشد.
- Deploy اتمیک و rollback به release قبلی باشد.
- schema change از الگوی expand/migrate/contract پیروی کند.
- Smoke test دامنه: TLS، status، `/health`، `/ready` و نسخه release.
