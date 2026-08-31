# معماری هدف و MVP v1.0

## سبک معماری

Modular Monolith با Hexagonal boundaries، Workerهای asynchronous و transactional outbox. هر Domain schema/API داخلی مشخص دارد و دسترسی مستقیم بین repositoryهای Domain ممنوع است.

## Context Map

```text
Channels (Chat/Web/Import)
        |
Application Workflow Runtime ---- Approval Inbox
        |
  +-----+-------------------------------+
  | Identity & Consent                  |
  | Evidence / Assets / Memory          |
  | Personal Model / Perception         |
  | Goals / Stakeholders / Relations    |
  | Narrative / Voice / Claims          |
  | Strategy / Opportunity / Decision   |
  | Actions / Adaptation                |
  | Feedback / Evaluation               |
  +-------------------------------------+
        |
Policy | Audit | Model Gateway | Tool Gateway | Cost/Telemetry
        |
PostgreSQL | Object Storage | Queue/Cache | External Providers
```

## اصول تثبیت‌شده پیشنهادی

1. PostgreSQL منبع حقیقت است؛ vector index و summaries مشتق و rebuildable هستند.
2. هر knowledge item نوع معرفتی، provenance، زمان اعتبار، confidence و policy دارد.
3. Permission قبل از retrieval و generation enforce می‌شود، نه فقط قبل از انتشار.
4. LLM فقط artifact پیشنهادی تولید می‌کند؛ policy، persistence و side effects قطعی‌اند.
5. Workflowها state machine نسخه‌دار با approval، idempotency و audit هستند.
6. Providerها از طریق contract قابل تعویض‌اند؛ canonical data در اختیار محصول است.
7. Public side effect در MVP وجود ندارد؛ export فقط پس از approval.
8. هر recommendation شامل alternatives، do-nothing، cost، risk، confidence و evidence است.

## اجزای Runtime پیشنهادی برای Foundation

- Web/API application
- Background worker
- PostgreSQL + pgvector
- S3-compatible object storage
- Redis فقط در صورت نیاز queue/cache
- OpenTelemetry-compatible telemetry
- ModelGateway، EmbeddingPort، ResearchPort و PublisherPort

انتخاب زبان/framework تا بررسی تیم، hosting و codebase تثبیت نمی‌شود. معماری به TypeScript، Python یا ترکیب آنها وابسته نیست.

## قرارداد Action Recommendation

هر خروجی باید حداقل داشته باشد:

- objective و stakeholder؛
- options با گزینه عدم اقدام؛
- evidence references و assumptions؛
- expected benefit، attention cost و opportunity cost؛
- reputation/privacy risk؛
- confidence و uncertainty؛
- required approval؛
- expiry/decision window؛
- measurement plan.

## Definition of Done برای MVP

- یک کاربر جدید در اولین session ارزش قابل لمس دریافت کند.
- حداقل یک asset را وارد و به evidence/assertion تبدیل کند.
- مدل شخصی را ببیند، اصلاح و محدودیت استفاده تعریف کند.
- goal و desired positioning بسازد.
- توصیه‌ای با سه گزینه و rationale دریافت کند.
- یک draft evidence-bound را ویرایش و export کند.
- سیستم از edit/reject به‌صورت پیشنهاد reversible یاد بگیرد.
- export/delete و audit trail عملی باشند.
- هیچ cross-tenant یا permission leakage در testها وجود نداشته باشد.

## ADRهای الزامی بعدی

- ADR-001: Persona و product wedge
- ADR-002: Runtime language/framework
- ADR-003: Tenant/isolation model
- ADR-004: Consent and purpose taxonomy
- ADR-005: Temporal assertion model
- ADR-006: Workflow/orchestration choice
- ADR-007: Model provider/data retention strategy
- ADR-008: Storage/encryption/backup
- ADR-009: Evaluation and release gates
- ADR-010: Deployment model روی cPanel یا محیط مستقل
