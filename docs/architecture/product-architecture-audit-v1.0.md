# ممیزی محصول و معماری v1.0

تاریخ: ۱۴۰۵/۰۶/۰۸  
وضعیت: پیشنهادی — نیازمند تأیید مالک محصول  
مبنای تحلیل: MASTER CONTEXT v1.0، بخش‌های ۰ تا ۶۴

## خلاصه اجرایی

Concept از نظر تمایز محصول قوی است: واحد اصلی ارزش «پست» نیست، بلکه **تصمیم قابل‌توضیح مبتنی بر شناخت زمان‌مند انسان** است. بااین‌حال، معماری ۹ ماژولی مرزهای Domain، Workflow و Cross-cutting concern را مخلوط کرده و برای MVP بیش از حد گسترده است.

پیشنهاد نهایی یک **Modular Monolith مبتنی بر Domain** با Workerهای جدا، Event/Outbox داخلی و Port/Adapter برای مدل‌ها و Integrationهاست. Microservice، Knowledge Graph مستقل، Multi-agent آزاد و Social Listening گسترده در MVP توصیه نمی‌شوند. ابتدا باید حلقه ارزش زیر اثبات شود:

`Evidence → Personal Model → Goal → Action Options → Explainable Recommendation → User Decision → Feedback`

## A. Concept Audit

### نقاط درست و متمایز

1. تفکیک Actual Self، Current Perception و Desired Positioning.
2. تفکیک Fact، Self-report، Observation، Inference و Hypothesis همراه با Evidence و Confidence.
3. اصل «دانستن مساوی اجازه استفاده نیست» به‌عنوان Foundation.
4. Action-oriented بودن و امکان توصیه به سکوت یا اقدام خصوصی.
5. مدل زمان‌مند، قابل اصلاح، Contest، Revocation و Export.
6. جداسازی Truth، Strategy و Creativity.
7. Human-in-the-loop و Autonomy سطح‌بندی‌شده.
8. یادگیری محافظه‌کارانه، توضیح‌پذیر و برگشت‌پذیر.
9. توجه همزمان به Opportunity Cost، انرژی کاربر و پیامد اعتباری.
10. تعریف Evaluation پیش از Scale.

### ابهام‌های نیازمند تصمیم محصول

- مشتری اولیه دقیقاً کیست: Founder، Executive، Creator یا Professional؟
- Job-to-be-done نخست چیست و چه Outcome قابل اندازه‌گیری در ۳۰ روز دارد؟
- سیستم advisor است یا execution system؟ مرز مسئولیت حقوقی و عملیاتی چیست؟
- داده 360 درجه چگونه جمع‌آوری، نمایش، Contest و حذف می‌شود؟
- «Actual Self» حقیقت قابل مشاهده نیست؛ باید به `Evidence-backed Self Model` تغییر نام یابد.
- Confidence معنایی باید از Probability آماری تفکیک شود.
- چه ادعاهایی نیازمند تأیید صریح و چه ادعاهایی نیازمند Citation هستند؟
- سیاست نگهداری، اقامت جغرافیایی داده و سن حذف چیست؟

### Over-engineered برای MVP

- Knowledge Graph database مستقل پیش از اثبات Queryهای graph-heavy.
- Agent برای هر ماژول؛ این الگو هزینه، nondeterminism و debugging را بالا می‌برد.
- Social Listening فراگیر، Crisis automation و 360 interviews در نسخه نخست.
- Multi-model router پیچیده پیش از داشتن eval dataset و telemetry واقعی.
- Microservice و event broker خارجی در یک محصول تک‌تیمی و کم‌ترافیک.
- سنجش خودکار Perception Shift بدون baseline و داده معتبر.

### Under-specified یا غایب

- Tenant isolation، account recovery، roles و delegated access.
- Data classification و retention schedule برای هر نوع داده.
- Legal basis، consent receipt، age restrictions و third-party data policy.
- Idempotency، retry، concurrency، cancellation و failure recovery در Workflow.
- Prompt/model/version registry و reproducibility.
- Threat model برای prompt injection، poisoned memory، data exfiltration و unsafe tools.
- Claim lifecycle: proposed, verified, disputed, expired, revoked.
- Publishing connector permissions، dry-run و rollback/correction plan.
- Localization، تقویم شمسی، RTL، timezone و زبان/لهجه Voice Model.
- Incident response، backup restore test، RPO/RTO و vendor exit plan.
- Experiment governance و جلوگیری از تغییر مخفیانه Identity بر اثر Engagement.

### تناقض‌های اصلی

- «مدل عمیق انسان» با «Cold Start سریع» تنها با progressive disclosure و uncertainty UX جمع می‌شود.
- Proactivity با privacy/consent در تعارض است؛ Proactivity باید scope، budget و quiet hours داشته باشد.
- External research با جداسازی داده شخصی در تعارض است؛ query minimization و redaction لازم است.
- General platform با MVP تک‌کاربره در تعارض نیست، مشروط به tenant_id و policy boundary از روز اول.
- Personalization عمیق با portability بین مدل‌ها تنها از طریق مدل داده مستقل از Prompt ممکن است.

## B. Missing Capabilities

1. **Identity & Tenant Administration**: user، tenant، role، session، recovery.
2. **Consent Ledger & Policy Decision Point**: تصمیم واحد و قابل audit برای هر استفاده.
3. **Data Lifecycle Manager**: ingest، quarantine، classify، retain، export، delete.
4. **Claim Registry**: provenance، verification، expiry، dispute و permitted channels.
5. **Workflow Runtime**: state machine، idempotency، approval، timeout و compensation.
6. **Prompt/Model Registry**: version، rollout، rollback و eval linkage.
7. **Safety Gateway**: prompt injection، DLP، PII redaction و tool authorization.
8. **Notification & Attention Policy**: frequency budget، urgency و quiet hours.
9. **Localization layer** برای فارسی/انگلیسی، RTL و لحن چندزبانه.
10. **Operational resilience**: backup، restore drill، SLO، incident و disaster recovery.

## C. نقد معماری ۹ ماژولی

شماره‌گذاری فعلی مفاهیم ناهم‌سطح را کنار هم گذاشته است: Semantic Memory یک Domain است؛ Conversational Interface یک Channel؛ Ethics یک Cross-cutting policy؛ Execution Pipeline یک Workflow؛ و Perception/Voice مدل‌های تحلیلی‌اند. حفظ آن به‌عنوان نقشه قابلیت مفید است اما به‌عنوان معماری نرم‌افزار مناسب نیست.

معماری پیشنهادی ۸ Domain و ۵ لایه سراسری دارد:

1. Identity, Tenancy & Consent
2. Evidence, Assets & Memory
3. Personal Model & Perception
4. Goals, Stakeholders & Relationships
5. Narrative, Voice & Claims
6. Strategy, Opportunity & Decision
7. Action Workflow & Channel Adaptation
8. Feedback, Learning & Evaluation

لایه‌های سراسری: Security/Privacy، Policy/Risk، Provenance/Audit، Observability/Cost، Model/Tool Gateway.

## D. گزینه‌های معماری

| گزینه | مزیت | هزینه/ریسک | حکم |
|---|---|---|---|
| Modular Monolith + Workers | سرعت، تراکنش ساده، مرزهای روشن، استخراج‌پذیر | نیازمند discipline در dependency | **پیشنهاد نهایی** |
| Microservices + Event Bus | استقلال deployment و scale | پیچیدگی عملیاتی و consistency زودهنگام | بعد از product-market fit |
| Agent-first Mesh | انعطاف بالا در workflowهای مبهم | رفتار غیرقطعی، هزینه و audit دشوار | فقط برای چند workflow محصور |

## E. Data Architecture

### Storeهای پیشنهادی

- PostgreSQL: source of truth، tenant data، temporal versions، consent و audit references.
- Object Storage سازگار با S3: فایل خام و مشتقات رمزگذاری‌شده.
- `pgvector` در شروع: embedding retrieval با metadata/permission filtering.
- Redis اختیاری: queue/cache/rate limit؛ نه source of truth.
- OpenSearch و Graph DB فقط پس از اثبات نیاز با benchmark.

### مدل هسته

- `evidence_item`: source_type، occurred_at، observed_at، owner، integrity hash.
- `assertion`: subject، predicate، value، epistemic_type، confidence، validity interval.
- `assertion_evidence`: support/contradict، weight rationale.
- `asset`: object reference، classification، derived artifacts.
- `permission_grant`: purpose، operation، audience، channel، expiry، revocation.
- `relationship`: parties، context، strength evidence، visibility boundary.
- `goal`: priority، horizon، success metric، conflicts.
- `claim`: wording، evidence، status، expiry، allowed usage.
- `decision/action`: options، score components، rationale، approval و outcome.

هر Query بازیابی باید ابتدا tenant و policy filter و سپس relevance ranking را اعمال کند. Embedding هیچ‌گاه مجوز دسترسی ایجاد نمی‌کند. حذف باید هم رکورد اصلی، هم vector، cache، مشتقات و backup lifecycle را پوشش دهد.

## F. Agent Architecture

Agent یک Role اجرایی موقت است، نه مالک داده یا Truth Authority.

- Interview Orchestrator: انتخاب سؤال با state machine و LLM محدود.
- Synthesis Worker: پیشنهاد Assertion/Hypothesis؛ ذخیره فقط پس از validation.
- Strategy Analyst: تولید سناریوهای structured و evidence-linked.
- Research Worker: جست‌وجوی بیرونی با citation و عدم ارسال PII غیرضروری.
- Narrative/Drafting Worker: Creativity روی Claimهای مجاز.
- Critic/Evaluator: fact، voice، genericness، policy و risk checks.

Consent، authorization، scoring نهایی، persistence، publishing و deletion باید Service/Rule-based باشند، نه تصمیم آزاد Agent. ارتباط Agentها از طریق typed workflow state و artifact IDs انجام شود، نه chat آزاد.

## G. Deterministic / AI / Human Boundary

| Capability | مرز پیشنهادی |
|---|---|
| Auth، tenant، permission، retention، deletion | Deterministic |
| Parsing و classification اولیه | ML/LLM با validation |
| Assertion/Hypothesis پیشنهادشده | LLM؛ تأیید یا evidence threshold |
| Similarity retrieval | Algorithmic؛ policy filter قطعی |
| Strategy scenarios | LLM/Agent + structured schema |
| Opportunity/attention score | Rule/weighted model؛ rationale قابل مشاهده |
| Draft و platform adaptation | Profile قطعی در MVP؛ LLM آینده فقط داخل Schema و Guard |
| Claim/fact/risk gates | ترکیب rule، retrieval و LLM critic |
| Public publish، red-risk action | Human approval |
| Export/delete/revoke | Human request + deterministic execution |

## H. Build / Buy / Integrate

| Capability | تصمیم اولیه |
|---|---|
| Personal model، consent semantics، claim registry، decision logic | Build؛ مزیت رقابتی |
| PostgreSQL، object store، queue، auth primitives | Buy/managed یا mature OSS |
| LLM، speech، vision، embeddings | Integrate پشت Provider Adapter |
| Agent orchestration/tracing | Integrate سبک؛ قرارداد داخلی حفظ شود |
| Social publishing/listening | Integrate per channel، ابتدا export-only |
| Email/calendar/CRM | Integrate پس از consent scope و MVP |
| Knowledge graph | Build logical graph روی relational؛ DB تخصصی بعداً |

طبق مستندات رسمی OpenAI، Responses API از tool calling، structured outputs، web/file search، MCP و اجرای background پشتیبانی می‌کند و Agents SDK برای orchestration/tracing مناسب است؛ بااین‌حال این‌ها باید پشت `ModelGateway` و `ToolPort` باشند تا vendor lock-in ایجاد نشود.

## I. Security, Privacy & Governance

- tenant_id اجباری و Row-Level Security با testهای cross-tenant.
- envelope encryption؛ کلید جدا برای محیط و ترجیحاً tenantهای حساس.
- طبقه‌بندی Public/Internal/Confidential/Restricted.
- Consent receipt شامل purpose، scope، provenance، expiry و policy version.
- deny-by-default برای public usage و third-party sharing.
- short-lived credentials، secret manager و عدم ثبت متن حساس در log.
- content quarantine و sanitization پیش از ورود به retrieval.
- tool allowlist، least privilege، approval token و idempotency key برای side effect.
- append-only audit events با integrity control؛ audit شامل payload حساس کامل نباشد.
- DSAR: export/correct/contest/delete با status قابل پیگیری.

## J. Evaluation Strategy

یک Golden Dataset نسخه‌دار با نمونه‌های فارسی و انگلیسی لازم است. چهار سطح ارزیابی:

1. Unit/contract: policy، schema، temporal logic، tenant isolation.
2. Retrieval: precision@k، recall@k، permission leakage = 0.
3. Model: claim support، contradiction، voice، genericness، calibrated abstention.
4. Product: recommendation acceptance، edit distance، regret، energy، outcome quality.

هر prompt/model change باید offline eval، canary و rollback داشته باشد. LLM-as-judge تنها یکی از Signalهاست و با human rubric کالیبره می‌شود.

## K. Cost Architecture

Cost ledger باید برای هر tenant/workflow شامل input/output/cached token، embedding، storage، search، tool/API، compute و human-review time باشد. کنترل‌ها:

- retrieval به‌جای ارسال کل تاریخچه؛ structured summaries و context budget.
- embedding فقط برای محتوای تغییرکرده؛ dedup با content hash.
- model tier بر پایه risk/complexity و eval، نه نام مدل.
- cache برای prompt ثابت، research و مشتقات؛ TTL متناسب با freshness.
- budget روزانه/ماهانه و circuit breaker برای workflowهای recursive.

## L. MVP Definition

### Persona و Promise پیشنهادی

یک Founder/Executive فارسی‌زبان که دارایی‌های پراکنده دارد و می‌خواهد بداند «حرکت معتبر بعدی چیست». وعده ۳۰روزه: سیستم با شواهد محدود، یک مدل قابل اصلاح می‌سازد و هر هفته چند Action سنجیده و توضیح‌پذیر پیشنهاد می‌دهد.

### In scope

- tenant/user و consent پایه؛ onboarding تدریجی.
- ingest متن و فایل محدود؛ semantic asset و evidence/assertion.
- Actual/Evidence-backed، Desired Positioning و Goal.
- conversational correction/contest/do-not-use.
- یک Recommendation workflow با ۳ گزینه از جمله do-nothing.
- یک draft اختیاری برای LinkedIn، فقط export و approval.
- claim check، provenance، audit و feedback از edit/accept/reject.

### Out of scope

Auto-publish، 360 interviews، crisis automation، social listening گسترده، graph DB، autonomous outreach، چند ده connector و mobile app.

### Core proof

کاربر باید بتواند روی هر پیشنهاد بپرسد «چرا؟»، Evidence و Permission مصرف‌شده را ببیند، برداشت را اصلاح کند و اثر اصلاح را در پیشنهاد بعدی مشاهده کند.

## M. Roadmap و Quality Gates

### Phase 0 — Foundation

ADRها، threat model، domain glossary، data model، consent policy، workflow contract، eval harness، CI و local stack.

Gate: هیچ ابهام P0 باز؛ tenant isolation test؛ permission matrix approved؛ restore procedure tested؛ architectural fitness tests سبز.

### Phase 1 — Useful Memory

ingest محدود، assertions، provenance، retrieval، correction/forget و progressive onboarding.

Gate: permission leakage صفر؛ retrieval targets محقق؛ deletion verified؛ abstention calibrated.

### Phase 2 — Strategic MVP

goal، positioning gap، action scenarios، opportunity cost و explainability.

Gate: expert rubric و user acceptance به baseline برسند؛ unsupported claim زیر threshold؛ cost/workflow داخل budget.

وضعیت اجرا: `strategic-quality-v1` ثبت Rubric و Review متصل به Context را فراهم کرده است؛
تا پیش از پنج نمونه واقعی `baselineMetrics` خالی می‌ماند و Gate همچنان در حالت جمع‌آوری است.

### Phase 3 — Authentic Execution

voice، narrative، claims، LinkedIn adaptation، approval/export و edit learning.

Gate: hallucinated public claims صفر در release set؛ edit distance و authenticity target؛ rollback فعال.

### Phase 4 — External Intelligence

research، bounded opportunity radar و connectorهای منتخب.

Gate: citation coverage/freshness؛ privacy review؛ connector revocation test.

### Phase 5 — Relationships & Controlled Automation

stakeholders، relationship context، 360 با consent مستقل، publishing محدود و crisis assist.

Gate: red-team، incident drill، autonomy policy و explicit owner approval.

## N. Risk Register

- Product: دامنه بیش از حد بزرگ → wedge و outcome ۳۰روزه.
- Adoption: onboarding سنگین → immediate utility و progressive profiling.
- AI: hallucination/false identity → epistemic types، evidence و abstention.
- Privacy: استفاده ثانویه یا leakage → purpose-bound policy و deny-by-default.
- Security: prompt injection/tool abuse → quarantine، tool policy و approvals.
- Reputation: انتشار اشتباه → claim registry، risk level و human approval.
- Architecture: premature services/graph → modular monolith و extraction metrics.
- Cost: recursive agent/research → budgets، max steps، caching و circuit breaker.
- Governance: feedback identity drift → reversible proposals و slow update policy.
- Vendor: provider dependency → ports، portable canonical data و exit tests.

## O. تصمیم‌های لازم پیش از Foundation

1. Persona اولیه و کشور/حوزه حقوقی.
2. Outcome و success metric سی‌روزه.
3. داده‌های مجاز MVP و retention آنها.
4. Cloud/region و سطح استفاده از سرویس‌های managed.
5. زبان‌های MVP و اولویت فارسی/انگلیسی.
6. سطح autonomy پیش‌فرض: پیشنهاد + draft، بدون publish.

## نتیجه ممیزی

Concept حفظ می‌شود، اما «۹ ماژول» به capability map تنزل می‌یابد. معماری نرم‌افزار حول domain، evidence، policy و workflow شکل می‌گیرد. MVP باید هوشمندی خود را با یک حلقه کوچک ولی کامل نشان دهد، نه با تعداد Featureها.
