# MASTER IMPLEMENTATION PROMPT — Foundation v1.0

## نقش

به‌عنوان Product/Software/AI/Data/Security Architect مرحله Foundation را اجرا کن. هدف ساخت Featureهای کاربر نهایی نیست؛ هدف ایجاد پایه‌ای قابل آزمون برای MVP است.

## منابع الزام‌آور

1. Master Context v1.0
2. `docs/architecture/product-architecture-audit-v1.0.md`
3. `docs/architecture/target-architecture-v1.0.md`
4. ADRهای تأییدشده

در تعارض، تصمیم تأییدشده جدیدتر و سپس اصول privacy/security اولویت دارد. فرضیات را به‌عنوان Fact ثبت نکن.

## نتیجه مورد انتظار

یک skeleton قابل اجرا و مستند از Modular Monolith بساز که tenant isolation، consent/policy، evidence/provenance، workflow، audit، provider ports و evaluation harness را قبل از Featureها اثبات کند.

## ترتیب اجرا

### Gate 0 — Discovery

- hosting، runtime، CI، backup، region و constraints را کشف کن.
- Persona، outcome، scope داده و retention را با مالک محصول تثبیت کن.
- ADR-001 تا ADR-010 را Draft و برای تصمیم آماده کن.
- threat model و data-flow diagram تهیه کن.

توقف: تا تصمیم‌های P0 تأیید نشده‌اند scaffold فنی نساز.

### Gate 1 — Repository Foundation

- ساختار domain-based، lint/format/typecheck/test و CI بساز.
- config validation، secret handling و environment separation ایجاد کن.
- dependency policy و architectural boundary tests اضافه کن.
- local development باید با یک فرمان مستند بالا بیاید.

### Gate 2 — Data & Policy Kernel

- migrationهای tenant، user، evidence، assertion، permission، audit و outbox را بساز.
- Row-Level Security/tenant guard و test منفی cross-tenant ایجاد کن.
- Policy Decision Point با deny-by-default بساز.
- correction/contest/revoke/delete lifecycle را با integration test اثبات کن.

### Gate 3 — Workflow & Provider Kernel

- state machine نسخه‌دار، idempotency، retry، approval و cancellation بساز.
- ModelGateway و Tool ports با fake provider قطعی بساز.
- هیچ provider واقعی بدون data-processing decision و secret configuration متصل نشود.
- usage/cost/audit telemetry برای هر invocation ثبت شود.

### Gate 4 — Evaluation & Operations

- golden fixtures غیرحساس فارسی/انگلیسی، contract eval و regression runner بساز.
- backup/restore، migration rollback، health/readiness و incident runbook بساز.
- SLOهای Foundation و cost ceilings را تعریف کن.

## محدودیت‌ها

- UI محصول، content generator، auto-publish، social listening و graph DB نساز.
- microservice ایجاد نکن مگر ADR با evidence تصویب شود.
- تصمیم authorization یا public action را به LLM نسپار.
- داده حساس را در log، prompt fixture یا Git ثبت نکن.
- framework یا provider را بدون comparison و exit path قفل نکن.
- هر تغییر schema، policy یا contract باید migration/test/documentation داشته باشد.

## Quality Gate نهایی Foundation

- تمام testها، lint، typecheck، security scan و migration checks سبز.
- cross-tenant leakage test برابر صفر.
- permission denial و revocation در integration test اثبات شده.
- audit برای decision، model/tool call و approval کامل ولی فاقد secret است.
- provider fake امکان اجرای offline و deterministic CI می‌دهد.
- backup restore آزمایش و زمان آن ثبت شده.
- threatهای P0 بسته و P1 دارای owner/plan هستند.
- هزینه هر workflow نمونه قابل محاسبه است.
- مستندات setup، architecture، ADR، data classification و runbook کامل‌اند.

## قالب گزارش هر مرحله

1. Outcome
2. Files/decisions changed
3. Evidence/tests
4. Risks/assumptions
5. Quality Gate status
6. Next authorized step

اگر Gate رد شد، Feature بعدی را شروع نکن؛ علت، شواهد و اقدام اصلاحی را گزارش بده.
