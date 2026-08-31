# Dependency Policy v1.0

این Policy بخشی از Foundation Gate است و برای تمام Workspace اعمال می‌شود.

## قواعد

1. Runtime اصلی Node.js 22 و package manager قفل‌شده pnpm 10 است.
2. Dependency جدید باید یک نیاز روشن، maintainer فعال، license سازگار و exit path
   داشته باشد؛ افزودن SDK provider به Domain ممنوع است.
3. Driverهای زیرساختی فقط در Adapter خود import می‌شوند. اکنون `pg` فقط در
   `src/database/postgres.ts` مجاز است.
4. Kernel، Workflow، Evaluation، Cost Ledger و Provider Port نباید HTTP یا Database
   Adapter را import کنند.
5. `pnpm-lock.yaml` باید همراه تغییر dependency ثبت و CI با `--frozen-lockfile` اجرا
   شود.
6. `pnpm audit --prod --audit-level high` بخشی از Release Gate است. High/Critical
   باید قبل از انتشار رفع، حذف یا با rationale زمان‌دار و owner مشخص ثبت شود.
7. Script install ناشناخته یا bypass کردن minimum-release/security policy مجاز نیست.
8. Secret، credential و داده شخصی در fixture، package config یا log dependency ثبت
   نمی‌شود.

## Enforcement

- `test/architecture-fitness.test.ts` مرزهای import و bind شبکه را کنترل می‌کند.
- CI علاوه بر lint/typecheck/test/build، audit وابستگی‌های Production را اجرا می‌کند.
- CI فقط فایل‌های tracked را برای private key و tokenهای شناخته‌شده اسکن می‌کند و
  فایل‌های credential-bearing مانند `.env`، `.htpasswd`، `.key` و `.pem` را رد می‌کند.
- تغییر این Policy نیازمند ADR یا توضیح صریح در commit و تست جایگزین است.
