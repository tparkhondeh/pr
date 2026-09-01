# Connector Governance Evaluation v1.0

وضعیت: Release Gate فعال؛ اجازه فعال‌سازی Connector واقعی صادر نمی‌کند

## قرارداد

`connector-governance-eval-v1` در هر `pnpm check` اجرا می‌شود و ۲۴ Case نسخه‌دار فارسی
و انگلیسی دارد:

- شش پروفایل معتبر که همگی باید `registered_disabled` بمانند؛
- سیزده حمله Scope/Secret/Tenant/Approval/Rate؛
- چهار Drill ابطال، حذف و Incident؛
- یک مسیر Authorization درون Scope که به‌دلیل Runtime خاموش همچنان Deny می‌شود.

## Thresholdهای Release

- ۲۴/۲۴ Case پاس؛
- ۱۳/۱۳ حمله مسدود؛
- ۱/۱ Raw Credential attack مسدود و Leakage صفر؛
- ۴/۴ Revocation/Incident Drill پاس؛
- Deletion propagation failure صفر؛
- External Action، Network، Active Connector و Raw Credential retention همگی صفر.

هر شکست Critical، Release را قرمز می‌کند. تست منفی عمداً Subjectی را تزریق می‌کند که
Network، Execution، Activation و Raw Credential retention را روشن می‌کند و باید Suite
را قرمز کند؛ بنابراین سبزی Runner صرفاً نتیجه ثابت یا UI-only نیست.

## اجرا

```bash
pnpm eval:connector-governance
```

## مرز ادعا

این Golden Set قرارداد عمومی lifecycle را می‌سنجد. انتخاب Gmail، Calendar، CRM، Social،
Publishing یا هر Provider دیگر نیازمند Corpus و Drill اختصاصی Adapter است. پاس‌شدن این
Suite مجوز OAuth، ذخیره Token، Fetch، Monitoring، Publish یا Outreach صادر نمی‌کند.
