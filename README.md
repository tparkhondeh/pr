# PR — Personal Brand & PR Operating System

این مخزن برای طراحی و توسعه یک سیستم هوشمند و ماندگار مدیریت برند شخصی، اعتبار، روایت، روابط و PR ایجاد شده است.

وضعیت فعلی: **Architecture & Product Discovery**. مطابق Master Context، تا عبور از Quality Gate مرحله معماری، پیاده‌سازی Feature، UI، Backend و Database آغاز نمی‌شود.

## اسناد فعلی

- [ممیزی محصول و معماری](docs/architecture/product-architecture-audit-v1.0.md)
- [معماری هدف و محدوده MVP](docs/architecture/target-architecture-v1.0.md)
- [Master Implementation Prompt مرحله Foundation](docs/implementation/foundation-master-prompt-v1.0.md)
- [ADRهای Draft مرحله Foundation](docs/decisions/foundation-adrs-draft-v1.0.md)
- [Data & Policy Kernel](docs/architecture/data-kernel-v1.0.md)
- [Operations Runbook](docs/operations/runbook-v1.0.md)

## محیط‌ها

- Production domain: `pr.wealthos.ir`
- Server source path: `/home/wealthos/apps/pr`
- cPanel document root: `/home/wealthos/pr.wealthos.ir`

اطلاعات حساس، کلیدها و Secretها نباید وارد Git شوند.

## اجرای Foundation در لوکال

پیش‌نیاز: Node.js 22 و pnpm 10.

```bash
pnpm install
pnpm check
pnpm dev
```

Health endpoint پس از اجرا: `GET /health`

## اجرای Workbench وب

```bash
pnpm web:dev
```

Workbench فعلی حلقه تصمیم MVP را نمایش می‌دهد: Goal، سه Action شامل عدم اقدام،
Attention Budget، Evidence، Risk و Approval انسانی. View از `GET /api/workbench`
داده می‌گیرد و تأیید را با `POST /api/workbench/approval` ثبت می‌کند. Store فعلی
حافظه‌ای است و با Restart پاک می‌شود؛ جایگزینی آن با PostgreSQL در Increment بعد است.
نسخه خصوصی Sites نیز همین قرارداد را با state موقت Worker برای تست UI ارائه می‌کند.
